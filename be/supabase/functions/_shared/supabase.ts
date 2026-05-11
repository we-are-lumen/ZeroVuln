import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface User {
  id: number;
  uuid: string;
  wallet_address: string;
  is_admin: boolean;
}

export interface AuthContext {
  user_id: number;
  user_uuid: string;
  wallet_address: string;
  is_admin: boolean;
}

export function getAdminWallets(): string[] {
  const env = Deno.env.get('ADMIN_WALLETS') || '';
  return env.split(',').map((w: string) => w.trim().toLowerCase()).filter(Boolean);
}

export async function resolveUser(req: Request): Promise<AuthContext | null> {
  const wallet = req.headers.get('X-Wallet-Address')?.toLowerCase().trim();

  if (!wallet || !/^0x[0-9a-f]{40}$/i.test(wallet)) {
    console.error('Invalid wallet address:', wallet);
    return null;
  }

  const adminWallets = getAdminWallets();
  const isAdmin = adminWallets.includes(wallet);

  const { data, error } = await supabase
    .from('users')
    .upsert(
      { wallet_address: wallet, is_admin: isAdmin },
      { onConflict: 'wallet_address' }
    )
    .select()
    .single();

  if (error || !data) {
    console.error('Error resolving user:', error);
    return null;
  }

  if (isAdmin && !data.is_admin) {
    await supabase
      .from('users')
      .update({ is_admin: true })
      .eq('id', data.id);
    data.is_admin = true;
  }

  return {
    user_id: data.id,
    user_uuid: data.uuid,
    wallet_address: data.wallet_address,
    is_admin: data.is_admin,
  };
}

export function unauthorized(): Response {
  return new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid wallet address' } }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function forbidden(): Response {
  return new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function notFound(message = 'Resource not found'): Response {
  return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message } }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function badRequest(message: string, detail?: unknown): Response {
  return new Response(JSON.stringify({ error: { code: 'BAD_REQUEST', message, detail } }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function serverError(message = 'Internal server error'): Response {
  return new Response(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message } }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
