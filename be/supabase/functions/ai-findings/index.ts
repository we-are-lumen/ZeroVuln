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
    return handleGetAiFinding(auth, id);
  }

  if (req.method === 'PATCH' && id) {
    return handleUpdateAiFinding(req, auth, id);
  }

  return new Response(JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Invalid request' } }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
});

async function handleGetAiFinding(auth: { user_id: number; is_admin: boolean }, id: string) {
  const { data: finding, error } = await supabase
    .from('ai_findings')
    .select(`
      *,
      audits(
        id, contract_id,
        contracts(id, uuid, name, owner_id, is_catalog)
      )
    `)
    .eq('uuid', id)
    .single();

  if (error || !finding) return notFound('AI finding not found');

  const audit = Array.isArray(finding.audits) ? finding.audits[0] : finding.audits;
  const contracts = audit?.contracts;
  const contract = Array.isArray(contracts) ? contracts[0] : contracts;
  if (contract?.owner_id !== auth.user_id && !auth.is_admin) return forbidden();
  if (contract?.is_catalog) return forbidden();

  return json(finding);
}

async function handleUpdateAiFinding(req: Request, auth: { user_id: number }, id: string) {
  const { data: finding, error: fetchError } = await supabase
    .from('ai_findings')
    .select(`
      id,
      audits(
        id, contract_id,
        contracts(id, uuid, name, owner_id, is_catalog)
      )
    `)
    .eq('uuid', id)
    .single();

  if (fetchError || !finding) return notFound('AI finding not found');

  const audit = Array.isArray(finding.audits) ? finding.audits[0] : finding.audits;
  const contracts = audit?.contracts;
  const contract = Array.isArray(contracts) ? contracts[0] : contracts;
  if (contract?.owner_id !== auth.user_id) return forbidden();
  if (contract?.is_catalog) return forbidden();

  const body = await req.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;

  const { data, error } = await supabase
    .from('ai_findings')
    .update(updates)
    .eq('uuid', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data);
}
