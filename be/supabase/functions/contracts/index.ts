import { resolveUser, unauthorized, forbidden, notFound, badRequest, serverError, json, supabase } from '../_shared/supabase.ts';
import { uploadToOgStorage } from '../_shared/og-storage.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Wallet-Address' } });
  }

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const functionIndex = pathParts.indexOf('functions');
  const id = functionIndex !== -1 && pathParts.length > functionIndex + 3 ? pathParts[functionIndex + 3] : null;

  if (req.method === 'GET' && !id) {
    return handleListContracts(auth);
  }

  if (req.method === 'GET' && id) {
    return handleGetContract(auth, id);
  }

  if (req.method === 'POST' && !id) {
    return handleCreateContract(req, auth);
  }

  if (req.method === 'PATCH' && id) {
    return handleUpdateContract(req, auth, id);
  }

  if (req.method === 'DELETE' && id) {
    return handleDeleteContract(auth, id);
  }

  return badRequest('Method not allowed');
});

async function handleListContracts(auth: { user_id: number; is_admin: boolean }) {
  const { data, error } = await supabase
    .from('contracts')
    .select('uuid, name, source, is_catalog, status, storage_uri, gas_estimate, compile_status, compiler_version, og_storage_uri, content_hash, content_inline, language, size_bytes, reward_per_finding, expired_at, created_at, updated_at, audits(uuid, status, kind, created_at)')
    .eq('owner_id', auth.user_id)
    .eq('is_catalog', false)
    .order('created_at', { ascending: false });

  if (error) return serverError(error.message);
  return json(data);
}

async function handleGetContract(auth: { user_id: number; is_admin: boolean }, id: string) {
  const { data, error } = await supabase
    .from('contracts')
    .select(`
      uuid, name, source, owner_id, is_catalog, status, storage_uri, gas_estimate, compile_status, compiler_version, og_storage_uri, content_hash, content_inline, language, size_bytes, reward_per_finding, expired_at, created_at, updated_at,
      audits(
        uuid, status, kind, model, summary, error, started_at, completed_at, created_at,
        ai_findings(uuid, severity, title, description, file_path, line_start, line_end, function_name, confidence, gas_saved, status, reasoning_trace, reasoning_uri, remediation, created_at)
      )
    `)
    .eq('uuid', id)
    .single();

  if (error || !data) return notFound('Contract not found');
  if (data.owner_id !== auth.user_id && !auth.is_admin) return forbidden();
  if (data.is_catalog) return notFound('Contract not found');

  return json(data);
}

async function handleCreateContract(req: Request, auth: { user_id: number }) {
  const body = await req.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const name = body.name || `Contract ${new Date().toISOString().split('T')[0]}`;
  if (!body.source || typeof body.source !== 'object' || Array.isArray(body.source)) {
    return badRequest('source must be a JSON object');
  }
  const sourceJson = body.source as Record<string, unknown>;
  const sourceCode = typeof sourceJson.code === 'string' ? sourceJson.code : '';
  const language = body.language || 'solidity';
  if (!body.expired_at || typeof body.expired_at !== 'string') {
    return badRequest('expired_at is required');
  }

  let ogStorageUri = '';
  let contentHash = '';
  let contentInline = sourceCode.length <= 8192 ? sourceCode : null;

  if (sourceCode) {
    try {
      const result = await uploadToOgStorage('sources', `${crypto.randomUUID()}/contract.sol`, sourceCode);
      ogStorageUri = result.uri;
      contentHash = result.hash;
    } catch (e) {
      console.error('0G Storage upload failed:', e);
    }
  }

  const { data, error } = await supabase
    .from('contracts')
    .insert({
      owner_id: auth.user_id,
      is_catalog: false,
      name,
      source: sourceJson,
      language,
      og_storage_uri: ogStorageUri,
      content_hash: contentHash,
      content_inline: contentInline,
      size_bytes: sourceCode.length,
      expired_at: body.expired_at,
    })
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data, 201);
}

async function handleUpdateContract(req: Request, auth: { user_id: number }, id: string) {
  const { data: existing, error: fetchError } = await supabase
    .from('contracts')
    .select('id, uuid, owner_id, is_catalog')
    .eq('uuid', id)
    .single();

  if (fetchError || !existing) return notFound('Contract not found');
  if (existing.owner_id !== auth.user_id) return forbidden();
  if (existing.is_catalog) return badRequest('Cannot update catalog contract via this endpoint');

  const body = await req.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.source !== undefined) {
    if (typeof body.source !== 'object' || body.source === null || Array.isArray(body.source)) {
      return badRequest('source must be a JSON object');
    }
    const sourceJson = body.source as Record<string, unknown>;
    const sourceCode = typeof sourceJson.code === 'string' ? sourceJson.code : '';
    updates.source = sourceJson;
    updates.content_inline = sourceCode.length <= 8192 ? sourceCode : null;
    updates.size_bytes = sourceCode.length;

    if (sourceCode) {
      try {
        const result = await uploadToOgStorage('sources', `${existing.uuid}/contract.sol`, sourceCode);
        updates.og_storage_uri = result.uri;
        updates.content_hash = result.hash;
      } catch (e) {
        console.error('0G Storage upload failed:', e);
      }
    }
  }

  if (body.status !== undefined) updates.status = body.status;
  if (body.expired_at !== undefined) updates.expired_at = body.expired_at;

  const { data, error } = await supabase
    .from('contracts')
    .update(updates)
    .eq('uuid', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data);
}

async function handleDeleteContract(auth: { user_id: number; is_admin: boolean }, id: string) {
  const { data: existing, error: fetchError } = await supabase
    .from('contracts')
    .select('owner_id, is_catalog')
    .eq('uuid', id)
    .single();

  if (fetchError || !existing) return notFound('Contract not found');
  if (existing.owner_id !== auth.user_id && !auth.is_admin) return forbidden();
  if (existing.is_catalog) return badRequest('Cannot delete catalog contract via this endpoint');

  const { error } = await supabase.from('contracts').delete().eq('uuid', id);
  if (error) return serverError(error.message);

  return json({ success: true });
}
