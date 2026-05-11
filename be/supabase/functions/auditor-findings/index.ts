import { resolveUser, unauthorized, forbidden, notFound, badRequest, serverError, json, supabase } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Wallet-Address' } });
  }

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

  if (req.method === 'GET' && id) {
    return handleGetAuditorFinding(auth, id);
  }

  if (req.method === 'PATCH' && id) {
    const subAction = afterAuditorFindings.length > 1 ? afterAuditorFindings[1] : null;
    if (subAction === 'submit') {
      return handleSubmitAuditorFinding(auth, id);
    }
    return handleUpdateAuditorFinding(req, auth, id);
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

async function handleGetAuditorFinding(auth: { user_id: number }, id: string) {
  const { data, error } = await supabase
    .from('auditor_findings')
    .select(`
      *,
      contracts(uuid, name, language, is_catalog, source_code)
    `)
    .eq('uuid', id)
    .single();

  if (error || !data) return notFound('Auditor finding not found');
  if (data.contributor_id !== auth.user_id) return forbidden();

  return json(data);
}

async function handleCreateAuditorFinding(_req: Request, auth: { user_id: number }, body: Record<string, unknown> | null) {
  if (!body) return badRequest('Invalid JSON body');

  const { contract_id, title, severity, description, line_start, line_end } = body as {
    contract_id?: string;
    title?: string;
    severity?: string;
    description?: string;
    line_start?: number;
    line_end?: number;
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
  if (line_start !== undefined && (!Number.isInteger(line_start) || line_start < 1)) {
    return badRequest('line_start must be a positive integer');
  }
  if (line_end !== undefined && (!Number.isInteger(line_end) || line_end < 1)) {
    return badRequest('line_end must be a positive integer');
  }
  if (line_start !== undefined && line_end !== undefined && line_end < line_start) {
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
      line_start: line_start ?? null,
      line_end: line_end ?? null,
      review_status: 'submitted',
      submitted_at: new Date(),
    })
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data, 201);
}

async function handleUpdateAuditorFinding(req: Request, auth: { user_id: number }, id: string) {
  const { data: existing, error: fetchError } = await supabase
    .from('auditor_findings')
    .select('id, contributor_id, review_status, contract_id, line_start, line_end')
    .eq('uuid', id)
    .single();

  if (fetchError || !existing) return notFound('Auditor finding not found');
  if (existing.contributor_id !== auth.user_id) return forbidden();
  if (['approved', 'rejected'].includes(existing.review_status)) {
    return badRequest('Cannot update a finding after it has been approved or rejected');
  }

  const body = await req.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.severity !== undefined) {
    if (!['critical', 'high', 'medium', 'low', 'info'].includes(body.severity)) {
      return badRequest('Invalid severity value');
    }
    updates.severity = body.severity;
  }
  if (body.description !== undefined) updates.description = body.description;
  if (body.line_start !== undefined) {
    if (!Number.isInteger(body.line_start) || body.line_start < 1) {
      return badRequest('line_start must be a positive integer');
    }
    updates.line_start = body.line_start;
  }
  if (body.line_end !== undefined) {
    if (!Number.isInteger(body.line_end) || body.line_end < 1) {
      return badRequest('line_end must be a positive integer');
    }
    updates.line_end = body.line_end;
  }
  const nextLineStart = updates.line_start !== undefined ? Number(updates.line_start) : existing.line_start;
  const nextLineEnd = updates.line_end !== undefined ? Number(updates.line_end) : existing.line_end;
  if (
    nextLineStart !== undefined && nextLineStart !== null &&
    nextLineEnd !== undefined && nextLineEnd !== null &&
    nextLineEnd < nextLineStart
  ) {
    return badRequest('line_end must be greater than or equal to line_start');
  }
  if (body.contract_id !== undefined) {
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select('id, is_catalog')
      .eq('uuid', body.contract_id)
      .single();

    if (contractError || !contract) return notFound('Contract not found');
    if (!contract.is_catalog) return badRequest('contract_id must reference a catalog contract');
    updates.contract_id = contract.id;
  }

  const { data, error } = await supabase
    .from('auditor_findings')
    .update(updates)
    .eq('uuid', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data);
}

async function handleSubmitAuditorFinding(auth: { user_id: number }, id: string) {
  const { data: existing, error: fetchError } = await supabase
    .from('auditor_findings')
    .select('id, contributor_id, review_status')
    .eq('uuid', id)
    .single();

  if (fetchError || !existing) return notFound('Auditor finding not found');
  if (existing.contributor_id !== auth.user_id) return forbidden();
  if (!['draft', 'submitted'].includes(existing.review_status)) {
    return badRequest('Cannot submit a finding that has been approved or rejected');
  }

  const { data, error } = await supabase
    .from('auditor_findings')
    .update({
      review_status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('uuid', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data);
}
