import { resolveUser, unauthorized, forbidden, notFound, badRequest, serverError, json, supabase, corsPreflight } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const functionIndex = pathParts.indexOf('functions');
  const id = functionIndex !== -1 && pathParts.length > functionIndex + 3 ? pathParts[functionIndex + 3] : null;

  if (req.method === 'GET' && id) {
    return handleGetAudit(auth, id);
  }

  if (req.method === 'GET' && !id) {
    const contractId = url.searchParams.get('contract_id');
    const status = url.searchParams.get('status');
    return handleListAudits(auth, contractId, status);
  }

  return badRequest('Method not allowed');
});

async function handleListAudits(auth: { user_id: number }, contractId: string | null, status: string | null) {
  let query = supabase
    .from('audits')
    .select('uuid, status, kind, summary, started_at, completed_at, created_at, updated_at, contracts!inner(uuid, name, owner_id), ai_findings(count)')
    .eq('contracts.owner_id', auth.user_id);

  if (contractId) {
    const { data: contract } = await supabase.from('contracts').select('id').eq('uuid', contractId).single();
    if (!contract) return json([]);
    query = query.eq('contract_id', contract.id);
  }
  if (status) query = query.eq('status', status);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) return serverError(error.message);
  return json(data);
}

async function handleGetAudit(auth: { user_id: number; is_admin: boolean }, id: string) {
  const { data: audit, error: auditError } = await supabase
    .from('audits')
    .select(`
      *,
      contracts(id, uuid, name, owner_id, is_catalog, source_code),
      ai_findings(
        uuid, severity, title, description, line_start, line_end,
        confidence, gas_saved, status, reasoning_trace,
        remediation, created_at
      )
    `)
    .eq('uuid', id)
    .single();

  if (auditError || !audit) return notFound('Audit not found');

  if (audit.contracts.owner_id !== auth.user_id && !auth.is_admin) return forbidden();
  if (audit.contracts.is_catalog) return forbidden();

  return json(audit);
}
