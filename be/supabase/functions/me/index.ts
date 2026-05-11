import { resolveUser, unauthorized, notFound, badRequest, serverError, json, supabase } from '../_shared/supabase.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Wallet-Address' } });
  }

  const auth = await resolveUser(req);
  if (!auth) return unauthorized();

  if (req.method === 'GET') {
    return handleGetMe(auth);
  }

  if (req.method === 'PATCH') {
    return handleUpdateMe(req, auth);
  }

  return badRequest('Method not allowed');
});

async function handleGetMe(auth: { user_id: number; wallet_address: string; is_admin: boolean }) {
  const { data, error } = await supabase
    .from('users')
    .select('id, wallet_address, is_admin, settings, created_at, updated_at')
    .eq('id', auth.user_id)
    .single();

  if (error || !data) return notFound('User not found');
  return json(data);
}

async function handleUpdateMe(req: Request, auth: { user_id: number }) {
  const body = await req.json().catch(() => null);
  if (!body) return badRequest('Invalid JSON body');

  const updates: Record<string, unknown> = {};

  if (body.settings !== undefined) {
    if (typeof body.settings !== 'object' || body.settings === null) {
      return badRequest('settings must be an object');
    }
    updates.settings = body.settings;
  }

  if (Object.keys(updates).length === 0) {
    return badRequest('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', auth.user_id)
    .select()
    .single();

  if (error) return serverError(error.message);
  return json(data);
}
