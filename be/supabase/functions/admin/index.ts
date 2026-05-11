import { resolveUser, unauthorized, forbidden, notFound, badRequest, serverError, json, supabase } from '../_shared/supabase.ts';
import { uploadToOgStorage } from '../_shared/og-storage.ts';

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

async function handleApproveAuditorFinding(auth: { user_id: number; is_admin: boolean }, id: string) {
  if (!auth.is_admin) return forbidden();

  const { data: finding, error: fetchError } = await supabase
    .from('auditor_findings')
    .select(`
      *,
      contracts(id, uuid, name, is_catalog, content_inline, content_hash)
    `)
    .eq('uuid', id)
    .single();

  if (fetchError || !finding) return notFound('Auditor finding not found');

  if (finding.review_status !== 'submitted') {
    return badRequest('Can only approve findings with review_status=submitted');
  }

  const contract = finding.contracts as unknown as { id: number; uuid: string; name: string; is_catalog: boolean; content_inline: string; content_hash: string };
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

  const { data, error } = await supabase
    .from('auditor_findings')
    .update({
      review_status: 'approved',
      decided_at: new Date().toISOString(),
      code_uri: codeUri,
      code_hash: codeHash,
      analysis_uri: analysisUri,
      analysis_hash: analysisHash,
    })
    .eq('uuid', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data);
}

async function handleRejectAuditorFinding(auth: { user_id: number; is_admin: boolean }, id: string) {
  if (!auth.is_admin) return forbidden();

  const { data: finding, error: fetchError } = await supabase
    .from('auditor_findings')
    .select('id, review_status')
    .eq('uuid', id)
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
    .eq('uuid', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data);
}
