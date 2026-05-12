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
      contracts(id, name, language, is_catalog, source_code),
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
    .select('id, uuid, title, severity, description, line_start, line_end, review_status, contracts(id, uuid, name, language, is_catalog, source_code)')
    .eq('uuid', id)
    .single();

  if (fetchError || !finding) return notFound('Auditor finding not found');

  if (finding.review_status !== 'submitted') {
    return badRequest('Can only approve findings with review_status=submitted');
  }

  const contract = (Array.isArray(finding.contracts) ? finding.contracts[0] : finding.contracts) as
    | { id: number; uuid: string; name: string; language: string | null; is_catalog: boolean; source_code: unknown }
    | null;
  if (!contract?.is_catalog) return badRequest('Contract must be a catalog contract');

  const { data: updated, error } = await supabase
    .from('auditor_findings')
    .update({
      review_status: 'approved',
      decided_at: new Date().toISOString(),
    })
    .eq('uuid', id)
    .select()
    .single();

  if (error) return serverError(error.message);

  try {
    const snippet = sliceSourceByLines(contract.source_code, finding.line_start, finding.line_end);
    const datasetRecord = buildDatasetRecord({
      title: finding.title,
      severity: finding.severity,
      description: finding.description,
      language: contract.language || 'solidity',
      snippet,
    });
    const jsonl = JSON.stringify(datasetRecord) + '\n';
    const { uri, hash } = await uploadToOgStorage('datasets', `auditor-findings/${finding.uuid}.jsonl`, jsonl);
    updated.dataset_uri = uri;
    updated.dataset_hash = hash;
    await supabase
      .from('auditor_findings')
      .update({ dataset_uri: uri, dataset_hash: hash })
      .eq('uuid', id);
  } catch (e) {
    console.error('Failed to upload approved finding dataset to 0G Storage:', e);
  }

  return json(updated);
}

function sliceSourceByLines(sourceCode: unknown, lineStart: number, lineEnd: number): string {
  if (!Array.isArray(sourceCode) || sourceCode.length === 0) return '';
  const lines: string[] = [];
  for (const entry of sourceCode) {
    if (entry && typeof entry === 'object' && 'code' in entry) {
      const code = (entry as { code?: unknown }).code;
      if (typeof code === 'string') {
        lines.push(...code.split('\n'));
      }
    }
  }
  if (lines.length === 0) return '';

  const start = Number.isInteger(lineStart) && (lineStart as number) >= 1 ? (lineStart as number) : 1;
  const end = Number.isInteger(lineEnd) && (lineEnd as number) >= start ? (lineEnd as number) : lines.length;
  return lines.slice(start - 1, end).join('\n');
}

function buildDatasetRecord(args: {
  title: string;
  severity: string;
  description: string;
  language: string;
  snippet: string;
}): Record<string, string> {
  const instruction = 'Identify the vulnerability in the following Solidity smart contract and explain why it is unsafe.';
  const input = args.snippet;
  const output = `Vulnerability: ${args.title} (severity: ${args.severity}).\n${args.description}`;
  return { instruction, input, output };
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
