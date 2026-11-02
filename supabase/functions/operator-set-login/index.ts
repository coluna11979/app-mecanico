import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Mesmo saneamento usado no front (src/lib/teamLogin.ts): minúsculas, sem espaço, só [a-z0-9._-] */
function sanitizeLogin(raw: string): string {
  return String(raw).trim().toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');
}

/** E-mail sintético (nunca recebe mensagem) — precisa casar com deriveTeamEmail do front */
const EMAIL_DOMAIN = 'equipe.mecanicoapp.app';
const deriveEmail = (login: string) => `${login}@${EMAIL_DOMAIN}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'no auth' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Quem chama (precisa ser o dono da oficina do operador)
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'unauthorized' }, 401);

    const admin = createClient(url, serviceKey);

    const body = await req.json();
    const operatorId = String(body.operator_id ?? '').trim();
    const rawLogin = String(body.login ?? '');
    const password = String(body.password ?? '');

    if (!operatorId || !rawLogin || !password) {
      return json({ ok: false, error: 'informe login e senha' });
    }
    const login = sanitizeLogin(rawLogin);
    if (login.length < 3) return json({ ok: false, error: 'login muito curto (mín. 3 caracteres: letras, números, . _ -)' });
    if (password.length < 6) return json({ ok: false, error: 'senha muito curta (mín. 6 caracteres)' });

    // Carrega o operador e confere que quem chama é o DONO da oficina dele
    const { data: op } = await admin
      .from('workshop_operators')
      .select('id, workshop_id, name, profile_id, is_owner')
      .eq('id', operatorId).maybeSingle();
    if (!op) return json({ ok: false, error: 'operador não encontrado' });
    if (op.is_owner) return json({ ok: false, error: 'o dono não usa login de equipe' });

    const [{ data: ownsShop }, { data: ownerMember }] = await Promise.all([
      admin.from('workshops').select('id').eq('id', op.workshop_id).eq('profile_id', user.id).maybeSingle(),
      admin.from('workshop_members').select('workshop_id').eq('workshop_id', op.workshop_id).eq('profile_id', user.id).eq('role', 'owner').maybeSingle(),
    ]);
    if (!ownsShop && !ownerMember) return json({ ok: false, error: 'só o dono da oficina pode criar login de equipe' }, 403);

    const email = deriveEmail(login);

    // Login já em uso por OUTRO operador?
    const { data: taken } = await admin
      .from('workshop_operators').select('id').eq('login', login).neq('id', operatorId).maybeSingle();
    if (taken) return json({ ok: false, error: 'esse login já está em uso — escolha outro' });

    // ── Já tem conta: atualiza senha/login (e o e-mail sintético, se o login mudou) ──
    if (op.profile_id) {
      const { error: upErr } = await admin.auth.admin.updateUserById(op.profile_id, { password, email });
      if (upErr) return json({ ok: false, error: upErr.message });
      await admin.from('workshop_operators').update({ login }).eq('id', operatorId);
      return json({ ok: true, updated: true, login, email });
    }

    // ── Primeira vez: cria o usuário SEM role (desvia do trigger handle_new_user,
    //    que criaria uma oficina nova) e monta o perfil/membership à mão ──
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: op.name, is_team_operator: true },
    });
    if (createErr || !created.user) return json({ ok: false, error: createErr?.message ?? 'falha ao criar o acesso' });
    const pid = created.user.id;

    // Perfil 'workshop' aprovado (sem oficina própria) — reaproveita o carregamento de oficina do app
    const { error: profErr } = await admin.from('profiles')
      .insert({ id: pid, role: 'workshop', status: 'approved', full_name: op.name });
    if (profErr) {
      await admin.auth.admin.deleteUser(pid); // desfaz pra não deixar usuário órfão
      return json({ ok: false, error: 'falha ao criar o perfil: ' + profErr.message });
    }

    // Membro (não-dono) da oficina do gestor → RLS libera ler/atualizar OS
    await admin.from('workshop_members')
      .upsert({ workshop_id: op.workshop_id, profile_id: pid, role: 'staff' }, { onConflict: 'workshop_id,profile_id' });

    await admin.from('workshop_operators').update({ profile_id: pid, login }).eq('id', operatorId);

    return json({ ok: true, created: true, login, email });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
