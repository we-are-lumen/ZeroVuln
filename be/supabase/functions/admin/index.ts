import { resolveUser, unauthorized, forbidden, notFound, badRequest, serverError, json, supabase } from '../_shared/supabase.ts';
import { uploadToOgStorage, fetchFromOgStorage } from '../_shared/og-storage.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Wallet-Address' } });
  }

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();
  if (!auth.is_admin) return forbidden();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const afterAdmin = pathParts.slice(pathParts.indexOf('admin') + 1);
  const resource = afterAdmin[0];
  const id = afterAdmin.length > 1 ? afterAdmin[1] : null;
  const action = afterAdmin.length > 2 ? afterAdmin[2] : null;

  if (resource === 'auditor-findings') {
    if (req.method === 'GET') {
      const reviewStatus = url.searchParams.get('review_status');
      return handleListAuditorFindingsQueue(reviewStatus);
    }

    if (id && action === 'approve') {
      return handleApproveAuditorFinding(auth, id);
    }

    if (id && action === 'reject') {
      return handleRejectAuditorFinding(auth, id);
    }
  }

  if (resource === 'dataset-snapshot') {
    if (req.method === 'POST') {
      return handleCreateDatasetSnapshot(req, auth);
    }
  }

  if (resource === 'dataset-export') {
    if (req.method === 'GET') {
      const version = url.searchParams.get('version');
      return handleDatasetExport(version);
    }
  }

  return notFound('Admin endpoint not found');
});

async function handleListAuditorFindingsQueue(reviewStatus: string | null) {
  let query = supabase
    .from('auditor_findings')
    .select(`
      *,
      contracts(id, name, language, is_catalog, content_inline, content_hash),
      users:contributor_id(id, wallet_address)
    `)
    .order('submitted_at', { ascending: false });

  if (reviewStatus) {
    query = query.eq('review_status', reviewStatus);
  } else {
    query = query.eq('review_status', 'submitted');
  }

  const { data, error } = await query;

  if (error) return serverError(error.message);
  return json(data);
}

async function handleApproveAuditorFinding(auth: { user_id: string; is_admin: boolean }, id: string) {
  if (!auth.is_admin) return forbidden();

  const { data: finding, error: fetchError } = await supabase
    .from('auditor_findings')
    .select(`
      *,
      contracts(id, name, is_catalog, content_inline, content_hash)
    `)
    .eq('id', id)
    .single();

  if (fetchError || !finding) return notFound('Auditor finding not found');

  if (finding.review_status !== 'submitted') {
    return badRequest('Can only approve findings with review_status=submitted');
  }

  const contract = finding.contracts as unknown as { id: string; name: string; is_catalog: boolean; content_inline: string; content_hash: string };
  if (!contract.is_catalog) return badRequest('Contract must be a catalog contract');

  const sourceCode = contract.content_inline || '';

  let codeUri = '';
  let codeHash = '';
  try {
    const result = await uploadToOgStorage('contributions', `${id}/source.sol`, sourceCode);
    codeUri = result.uri;
    codeHash = result.hash;

    if (codeHash !== contract.content_hash) {
      console.warn('Content hash mismatch - source may have been modified');
    }
  } catch (e) {
    console.error('Failed to upload source:', e);
    return serverError('Failed to upload source to 0G Storage');
  }

  let analysisUri = '';
  let analysisHash = '';
  try {
    const result = await uploadToOgStorage('contributions', `${id}/analysis.md`, finding.description);
    analysisUri = result.uri;
    analysisHash = result.hash;
  } catch (e) {
    console.error('Failed to upload analysis:', e);
    return serverError('Failed to upload analysis to 0G Storage');
  }

  const sftExample = {
    messages: [
      {
        role: 'system',
        content: 'You are a smart-contract security auditor. Identify the vulnerability category, severity, and explain the root cause.',
      },
      {
        role: 'user',
        content: sourceCode,
      },
      {
        role: 'assistant',
        content: `Category: ${finding.title}\nSeverity: ${finding.severity}\n\nRoot cause:\n${finding.description}`,
      },
    ],
  };

  let datasetUri = '';
  let datasetHash = '';
  try {
    const result = await uploadToOgStorage(
      'dataset/auditor-findings',
      `${id}.jsonl`,
      JSON.stringify(sftExample)
    );
    datasetUri = result.uri;
    datasetHash = result.hash;
  } catch (e) {
    console.error('Failed to upload dataset:', e);
    return serverError('Failed to upload dataset to 0G Storage');
  }

  const { data, error } = await supabase
    .from('auditor_findings')
    .update({
      review_status: 'approved',
      decided_at: new Date().toISOString(),
      code_uri: codeUri,
      code_hash: codeHash,
      analysis_uri: analysisUri,
      analysis_hash: analysisHash,
      dataset_uri: datasetUri,
      dataset_hash: datasetHash,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data);
}

async function handleRejectAuditorFinding(auth: { user_id: string; is_admin: boolean }, id: string) {
  if (!auth.is_admin) return forbidden();

  const { data: finding, error: fetchError } = await supabase
    .from('auditor_findings')
    .select('id, review_status')
    .eq('id', id)
    .single();

  if (fetchError || !finding) return notFound('Auditor finding not found');

  if (finding.review_status !== 'submitted') {
    return badRequest('Can only reject findings with review_status=submitted');
  }

  const { data, error } = await supabase
    .from('auditor_findings')
    .update({
      review_status: 'rejected',
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data);
}

async function handleCreateDatasetSnapshot(req: Request, auth: { user_id: string; is_admin: boolean }) {
  if (!auth.is_admin) return forbidden();

  const body = await req.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const { version, notes } = body;
  if (!version || typeof version !== 'string') {
    return badRequest('version is required');
  }

  const { data: approvedFindings, error: findingsError } = await supabase
    .from('auditor_findings')
    .select('id, dataset_uri, dataset_hash, code_uri, code_hash, analysis_uri, analysis_hash')
    .eq('review_status', 'approved');

  if (findingsError) return serverError(findingsError.message);

  const manifest = {
    version,
    created_at: new Date().toISOString(),
    auditor_finding_ids: approvedFindings.map((f: any) => f.id),
    findings: approvedFindings.map((f: any) => ({
      id: f.id,
      dataset_uri: f.dataset_uri,
      dataset_hash: f.dataset_hash,
      code_uri: f.code_uri,
      code_hash: f.code_hash,
      analysis_uri: f.analysis_uri,
      analysis_hash: f.analysis_hash,
    })),
  };

  const datasetLines = approvedFindings.map((f: any) => {
    return JSON.stringify({ id: f.id, dataset_uri: f.dataset_uri, dataset_hash: f.dataset_hash });
  }).join('\n');

  let manifestUri = '';
  let manifestHash = '';
  let bundleUri = '';
  let bundleHash = '';

  try {
    const manifestResult = await uploadToOgStorage(
      'dataset/snapshots',
      `${version}/manifest.json`,
      JSON.stringify(manifest, null, 2)
    );
    manifestUri = manifestResult.uri;
    manifestHash = manifestResult.hash;

    const bundleResult = await uploadToOgStorage(
      'dataset/snapshots',
      `${version}/dataset.jsonl`,
      datasetLines
    );
    bundleUri = bundleResult.uri;
    bundleHash = bundleResult.hash;
  } catch (e) {
    console.error('Failed to upload snapshot:', e);
    return serverError('Failed to upload snapshot to 0G Storage');
  }

  const { data, error } = await supabase
    .from('dataset_snapshots')
    .insert({
      version,
      manifest_uri: manifestUri,
      manifest_hash: manifestHash,
      bundle_uri: bundleUri,
      bundle_hash: bundleHash,
      auditor_finding_count: approvedFindings.length,
      created_by: auth.user_id,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data, 201);
}

async function handleDatasetExport(version: string | null) {
  if (!version) {
    const { data, error } = await supabase
      .from('dataset_snapshots')
      .select('version, bundle_uri, bundle_hash, auditor_finding_count, created_at')
      .order('created_at', { ascending: false });

    if (error) return serverError(error.message);
    return json(data);
  }

  const { data, error } = await supabase
    .from('dataset_snapshots')
    .select('*')
    .eq('version', version)
    .single();

  if (error || !data) return notFound('Dataset snapshot not found');

  return json({
    version: data.version,
    bundle_uri: data.bundle_uri,
    bundle_hash: data.bundle_hash,
    auditor_finding_count: data.auditor_finding_count,
    created_at: data.created_at,
  });
}
