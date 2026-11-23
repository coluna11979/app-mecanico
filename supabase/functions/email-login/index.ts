// Troca a chave do botão do e-mail (tabela email_login_tokens) por uma entrada na conta,
// sem senha. Devolve o hashed_token de um magic link gerado na hora; o app chama
// supabase.auth.verifyOtp com ele. verify_jwt = false: quem chama ainda não está logado.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Conta aprovada mexe com carteira e serviços: essa continua entrando só com senha.
const ALLOWED_STATUS = new Set(['pending', 'under_review', 'awaiting_region', 'rejected']);

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method' }, 405);

  try {
    const { token } = await req.json().catch(() => ({ token: null }));
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) {
      return json({ ok: false, reason: 'invalid' });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const hash = await sha256Hex(token);

    const { data: row } = await admin
      .from('email_login_tokens')
      .select('profile_id, next_path, expires_at, use_count')
      .eq('token_hash', hash)
      .maybeSingle();
    if (!row) return json({ ok: false, reason: 'invalid' });

    const { data: { user } } = await admin.auth.admin.getUserById(row.profile_id);
    if (!user?.email) return json({ ok: false, reason: 'invalid' });

    const email = user.email;
    const next = row.next_path;

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return json({ ok: false, reason: 'expired', email, next });
    }

    const { data: profile } = await admin.from('profiles').select('status').eq('id', row.profile_id).maybeSingle();
    if (!profile || !ALLOWED_STATUS.has(profile.status)) {
      return json({ ok: false, reason: 'login_required', email, next });
    }

    const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    const tokenHash = link?.properties?.hashed_token;
    if (error || !tokenHash) return json({ ok: false, reason: 'login_required', email, next });

    await admin
      .from('email_login_tokens')
      .update({ last_used_at: new Date().toISOString(), use_count: (row.use_count ?? 0) + 1 })
      .eq('token_hash', hash);

    return json({ ok: true, token_hash: tokenHash, email, next });
  } catch {
    return json({ ok: false, reason: 'error' }, 500);
  }
});
