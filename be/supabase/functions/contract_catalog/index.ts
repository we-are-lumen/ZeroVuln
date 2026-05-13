import { resolveUser, unauthorized, forbidden, notFound, badRequest, serverError, json, supabase, corsPreflight } from '../_shared/supabase.ts';
import { setCatalogRewardOnchain } from '../_shared/zv-contract.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  const isAdminRoute = pathParts.includes('admin');

  const afterCatalog = pathParts.slice(pathParts.indexOf('contract_catalog') + 1);
  const id = afterCatalog.length > 0 && afterCatalog[0] !== 'admin' ? afterCatalog[0] : null;

  if (isAdminRoute) {
    if (!auth.is_admin) return forbidden();
    return handleAdminCatalog(req, auth, id);
  }

  return handlePublicCatalog(auth, id);
});

function normalizeSourceCode(value: unknown): Record<string, unknown>[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const out: Record<string, unknown>[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
    out.push(entry as Record<string, unknown>);
  }
  return out;
}

async function handlePublicCatalog(_auth: { user_id: number }, id: string | null) {
  if (id) {
    const { data, error } = await supabase
      .from('contracts')
      .select('uuid, name, source_code, language, gas_estimate, reward_per_finding, expired_at, created_at, updated_at')
      .eq('uuid', id)
      .eq('is_catalog', true)
      .single();

    if (error || !data) return notFound('Catalog contract not found');
    return json(data);
  }

  const { data, error } = await supabase
    .from('contracts')
    .select('uuid, name, source_code, language, gas_estimate, reward_per_finding, expired_at, created_at, updated_at')
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
  const sourceCode = normalizeSourceCode(body.source_code);
  if (!sourceCode) return badRequest('source_code must be an array of JSON objects');
  const language = body.language || 'solidity';
  const expiredAt = typeof body.expired_at === 'string' ? body.expired_at : null;

  const { data, error } = await supabase
    .from('contracts')
    .insert({
      owner_id: auth.user_id,
      is_catalog: true,
      name,
      source_code: sourceCode,
      language,
      expired_at: expiredAt,
      reward_per_finding: body.reward_per_finding || 0,
      total_reward: body.total_reward || 0,
    })
    .select()
    .single();

  if (error) return serverError(error.message);

  // Integrasi on-chain: set reward_per_finding untuk catalog ini
  try {
    await setCatalogRewardOnchain({
      catalogUuid: data.uuid,
      rewardPerFinding0g: body.reward_per_finding || 0,
    });
  } catch (e) {
    // rollback DB insert supaya konsisten (user request: gagal kalau on-chain gagal)
    console.error('Failed to set catalog reward on-chain:', e);
    await supabase.from('contracts').delete().eq('uuid', data.uuid);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return serverError(`On-chain tx failed: ${msg}`);
  }

  return json(data, 201);
}

async function handleUpdateCatalogContract(req: Request, auth: { user_id: number; is_admin: boolean }, id: string) {
  if (!auth.is_admin) return forbidden();

  const { data: existing, error: fetchError } = await supabase
    .from('contracts')
    .select('id, uuid, is_catalog, name, source_code, language, expired_at, reward_per_finding')
    .eq('uuid', id)
    .single();

  if (fetchError || !existing) return notFound('Catalog contract not found');
  if (!existing.is_catalog) return badRequest('Contract is not a catalog contract');

  const body = await req.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.source_code !== undefined) {
    const sourceCode = normalizeSourceCode(body.source_code);
    if (!sourceCode) return badRequest('source_code must be an array of JSON objects');
    updates.source_code = sourceCode;
  }
  if (body.language !== undefined) updates.language = body.language;
  if (body.expired_at !== undefined) updates.expired_at = body.expired_at;
  if (body.reward_per_finding !== undefined) updates.reward_per_finding = body.reward_per_finding;

  const { data, error } = await supabase
    .from('contracts')
    .update(updates)
    .eq('uuid', id)
    .select()
    .single();

  if (error) return serverError(error.message);

  // Integrasi on-chain: update reward mapping jika reward_per_finding di-set (termasuk set ke 0)
  try {
    const nextReward = body.reward_per_finding !== undefined ? body.reward_per_finding : existing.reward_per_finding;
    await setCatalogRewardOnchain({
      catalogUuid: id,
      rewardPerFinding0g: nextReward || 0,
    });
  } catch (e) {
    console.error('Failed to update catalog reward on-chain:', e);
    // rollback DB update ke nilai sebelumnya
    await supabase
      .from('contracts')
      .update({
        name: existing.name,
        source_code: existing.source_code,
        language: existing.language,
        expired_at: existing.expired_at,
        reward_per_finding: existing.reward_per_finding,
      })
      .eq('uuid', id);
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return serverError(`On-chain tx failed: ${msg}`);
  }

  return json(data);
}
