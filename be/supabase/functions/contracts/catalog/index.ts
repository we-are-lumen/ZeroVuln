import { resolveUser, unauthorized, forbidden, notFound, badRequest, serverError, json, supabase } from '../../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Wallet-Address' } });
  }

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  const isCatalogRoute = pathParts.includes('catalog');
  const isAdminRoute = pathParts.includes('admin');

  if (!isCatalogRoute) {
    return badRequest('Invalid route');
  }

  const afterCatalog = pathParts.slice(pathParts.indexOf('catalog') + 1);
  const id = afterCatalog.length > 0 && afterCatalog[0] !== 'admin' ? afterCatalog[0] : null;

  if (isAdminRoute) {
    if (!auth.is_admin) return forbidden();
    return handleAdminCatalog(req, auth, id);
  }

  return handlePublicCatalog(auth, id);
});

async function handlePublicCatalog(_auth: { user_id: number }, id: string | null) {
  if (id) {
    const { data, error } = await supabase
      .from('contracts')
      .select('uuid, name, source, language, compile_status, compiler_version, gas_estimate, reward_per_finding, expired_at, created_at, updated_at, content_inline')
      .eq('uuid', id)
      .eq('is_catalog', true)
      .single();

    if (error || !data) return notFound('Catalog contract not found');
    return json(data);
  }

  const { data, error } = await supabase
    .from('contracts')
    .select('uuid, name, source, language, compile_status, compiler_version, gas_estimate, reward_per_finding, expired_at, created_at, updated_at')
    .eq('is_catalog', true)
    .order('created_at', { ascending: false });

  if (error) return serverError(error.message);
  return json(data);
}

async function handleAdminCatalog(req: Request, auth: { user_id: number; is_admin: boolean }, id: string | null) {
  if (req.method === 'GET' && !id) {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('is_catalog', true)
      .order('created_at', { ascending: false });

    if (error) return serverError(error.message);
    return json(data);
  }

  if (req.method === 'GET' && id) {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('uuid', id)
      .eq('is_catalog', true)
      .single();

    if (error || !data) return notFound('Catalog contract not found');
    return json(data);
  }

  if (req.method === 'POST' && !id) {
    return handleCreateCatalogContract(req, auth);
  }

  if (req.method === 'PATCH' && id) {
    return handleUpdateCatalogContract(req, auth, id);
  }

  return badRequest('Method not allowed');
}

async function handleCreateCatalogContract(req: Request, auth: { user_id: number }) {
  const body = await req.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const name = body.name || 'Untitled Catalog Contract';
  if (!body.source || typeof body.source !== 'object' || Array.isArray(body.source)) {
    return badRequest('source must be a JSON object');
  }
  const sourceJson = body.source as Record<string, unknown>;
  const sourceCode = typeof sourceJson.code === 'string' ? sourceJson.code : '';
  const language = body.language || 'solidity';
  if (!body.expired_at || typeof body.expired_at !== 'string') {
    return badRequest('expired_at is required');
  }

  if (!sourceCode) return badRequest('source.code is required for catalog contracts');

  let ogStorageUri = '';
  let contentHash = '';

  const { data, error } = await supabase
    .from('contracts')
    .insert({
      owner_id: auth.user_id,
      is_catalog: true,
      name,
      source: sourceJson,
      language,
      og_storage_uri: ogStorageUri,
      content_hash: contentHash,
      content_inline: sourceCode.length <= 8192 ? sourceCode : null,
      size_bytes: sourceCode.length,
      expired_at: body.expired_at,
      reward_per_finding: body.reward_per_finding || 0,
    })
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data, 201);
}

async function handleUpdateCatalogContract(req: Request, auth: { user_id: number; is_admin: boolean }, id: string) {
  if (!auth.is_admin) return forbidden();

  const { data: existing, error: fetchError } = await supabase
    .from('contracts')
    .select('id, uuid, is_catalog')
    .eq('uuid', id)
    .single();

  if (fetchError || !existing) return notFound('Catalog contract not found');
  if (!existing.is_catalog) return badRequest('Contract is not a catalog contract');

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

  }

  if (body.compile_status !== undefined) updates.compile_status = body.compile_status;
  if (body.compiler_version !== undefined) updates.compiler_version = body.compiler_version;
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
