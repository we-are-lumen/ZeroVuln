import { resolveUser, unauthorized, forbidden, notFound, badRequest, serverError, json, supabase } from '../../_shared/supabase.ts';
import { uploadToOgStorage } from '../../_shared/og-storage.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Wallet-Address' } });
  }

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const functionIndex = pathParts.indexOf('functions');

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

async function handlePublicCatalog(auth: { user_id: string }, id: string | null) {
  if (id) {
    const { data, error } = await supabase
      .from('contracts')
      .select('id, name, language, compile_status, compiler_version, gas_estimate, created_at, updated_at, content_inline')
      .eq('id', id)
      .eq('is_catalog', true)
      .single();

    if (error || !data) return notFound('Catalog contract not found');
    return json(data);
  }

  const { data, error } = await supabase
    .from('contracts')
    .select('id, name, language, compile_status, compiler_version, gas_estimate, created_at, updated_at')
    .eq('is_catalog', true)
    .order('created_at', { ascending: false });

  if (error) return serverError(error.message);
  return json(data);
}

async function handleAdminCatalog(req: Request, auth: { user_id: string; is_admin: boolean }, id: string | null) {
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
      .eq('id', id)
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

async function handleCreateCatalogContract(req: Request, auth: { user_id: string }) {
  const body = await req.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const name = body.name || 'Untitled Catalog Contract';
  const source = body.source || '';
  const language = body.language || 'solidity';

  if (!source) return badRequest('Source code is required for catalog contracts');

  let ogStorageUri = '';
  let contentHash = '';

  try {
    const result = await uploadToOgStorage('sources', `${crypto.randomUUID()}/contract.sol`, source);
    ogStorageUri = result.uri;
    contentHash = result.hash;
  } catch (e) {
    console.error('0G Storage upload failed:', e);
    return serverError('Failed to upload to 0G Storage');
  }

  const { data, error } = await supabase
    .from('contracts')
    .insert({
      owner_id: auth.user_id,
      is_catalog: true,
      name,
      language,
      og_storage_uri: ogStorageUri,
      content_hash: contentHash,
      content_inline: source.length <= 8192 ? source : null,
      size_bytes: source.length,
    })
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data, 201);
}

async function handleUpdateCatalogContract(req: Request, auth: { user_id: string; is_admin: boolean }, id: string) {
  if (!auth.is_admin) return forbidden();

  const { data: existing, error: fetchError } = await supabase
    .from('contracts')
    .select('id, is_catalog')
    .eq('id', id)
    .single();

  if (fetchError || !existing) return notFound('Catalog contract not found');
  if (!existing.is_catalog) return badRequest('Contract is not a catalog contract');

  const body = await req.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.source !== undefined) {
    updates.content_inline = body.source.length <= 8192 ? body.source : null;
    updates.size_bytes = body.source.length;

    if (body.source) {
      try {
        const result = await uploadToOgStorage('sources', `${id}/contract.sol`, body.source);
        updates.og_storage_uri = result.uri;
        updates.content_hash = result.hash;
      } catch (e) {
        console.error('0G Storage upload failed:', e);
      }
    }
  }

  if (body.compile_status !== undefined) updates.compile_status = body.compile_status;
  if (body.compiler_version !== undefined) updates.compiler_version = body.compiler_version;

  const { data, error } = await supabase
    .from('contracts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data);
}
