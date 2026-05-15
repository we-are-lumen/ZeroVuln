import { resolveUser, unauthorized, notFound, badRequest, serverError, json, supabase, corsPreflight } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  const afterAuditorFindings = pathParts.slice(pathParts.indexOf('auditor-findings') + 1);
  const id = afterAuditorFindings.length > 0 && !afterAuditorFindings[0].startsWith('admin') ? afterAuditorFindings[0] : null;

  if (req.method === 'GET' && !id) {
    return handleListAuditorFindings(auth);
  }

  if (req.method === 'POST' && !id) {
    const body = await req.json().catch(() => null);
    return handleCreateAuditorFinding(req, auth, body);
  }

  return badRequest('Method not allowed');
});

async function handleListAuditorFindings(auth: { user_id: number }) {
  const { data, error } = await supabase
    .from('auditor_findings')
    .select(`
      *,
      contracts(uuid, name, language, is_catalog)
    `)
    .eq('contributor_id', auth.user_id)
    .order('created_at', { ascending: false });

  if (error) return serverError(error.message);
  return json(data);
}

async function handleCreateAuditorFinding(_req: Request, auth: { user_id: number }, body: Record<string, unknown> | null) {
  if (!body) return badRequest('Invalid JSON body');

  const { contract_id, title, severity, description, line_start, line_end } = body as {
    contract_id?: string;
    title?: string;
    severity?: string;
    description?: string;
    line_start: number;
    line_end: number;
  };

  if (!contract_id || typeof contract_id !== 'string') {
    return badRequest('contract_id is required');
  }
  if (!title || typeof title !== 'string') {
    return badRequest('title is required');
  }
  if (!severity || !['critical', 'high', 'medium', 'low', 'info'].includes(severity)) {
    return badRequest('valid severity is required');
  }
  if (!description || typeof description !== 'string') {
    return badRequest('description is required');
  }
  if (!Number.isInteger(line_start) || line_start < 1) {
    return badRequest('line_start must be a positive integer');
  }
  if (!Number.isInteger(line_end) || line_end < 1) {
    return badRequest('line_end must be a positive integer');
  }
  if (line_end < line_start) {
    return badRequest('line_end must be greater than or equal to line_start');
  }

  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('id, is_catalog')
    .eq('uuid', contract_id)
    .single();

  if (contractError || !contract) return notFound('Contract not found');
  if (!contract.is_catalog) return badRequest('contract_id must reference a catalog contract');

  const { data, error } = await supabase
    .from('auditor_findings')
    .insert({
      contributor_id: auth.user_id,
      contract_id: contract.id,
      title,
      severity,
      description,
      line_start,
      line_end,
      review_status: 'submitted',
      submitted_at: new Date(),
    })
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data, 201);
}

