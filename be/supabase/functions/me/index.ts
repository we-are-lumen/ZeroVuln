import { resolveUser, unauthorized, notFound, badRequest, json, supabase } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Wallet-Address, Authorization' } });
  }

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  if (req.method === 'GET') {
    return handleGetMe(auth);
  }

  return badRequest('Method not allowed');
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
