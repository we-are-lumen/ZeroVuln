import { resolveUser, unauthorized, notFound, badRequest, json, supabase, corsPreflight } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return corsPreflight();

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  if (req.method !== 'GET') return badRequest('Method not allowed');

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const meIndex = pathParts.indexOf('me');
  const segment = pathParts[meIndex + 1];

  if (!segment) return handleGetMe(auth);
  if (segment === 'profile') return handleGetProfile(auth);

  return notFound('Endpoint not found');
});

async function handleGetMe(auth: { user_id: number; wallet_address: string; is_admin: boolean }) {
  const { data, error } = await supabase
    .from('users')
    .select('id, uuid, wallet_address, is_admin, created_at, updated_at')
    .eq('id', auth.user_id)
    .single();

  if (error || !data) return notFound('User not found');
  return json(data);
}

async function handleGetProfile(auth: { user_id: number; wallet_address: string; is_admin: boolean }) {
  const { data, error } = await supabase
    .from('users')
    .select(`
      uuid,
      wallet_address,
      is_admin,
      created_at,
      updated_at,
      auditor_findings:auditor_findings!auditor_findings_contributor_id_fkey(
        uuid,
        contract_id,
        severity,
        title,
        description,
        review_status,
        submitted_at,
        decided_at,
        line_start,
        line_end,
        dataset_uri,
        dataset_hash,
        reward_amount,
        created_at,
        updated_at
      )
    `)
    .eq('id', auth.user_id)
    .single();

  if (error || !data) return notFound('User not found');
  return json(data);
}
