// Peças comuns do Inbox do WhatsApp (UAZAPI): CORS, config, quem está chamando e chamadas à API.
// Nada fixo no código: endereço e admin token vêm de app_settings (painel admin → Configurações).
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export const adminClient = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

export type UazConfig = { url: string; adminToken: string };

export async function uazConfig(admin: SupabaseClient): Promise<UazConfig> {
  const { data } = await admin.from('app_settings').select('key, value').in('key', ['uazapi_url', 'uazapi_admin_token']);
  const get = (k: string) => (data ?? []).find(r => r.key === k)?.value?.trim() || '';
  let url = get('uazapi_url') || Deno.env.get('UAZAPI_URL') || '';
  if (url && !/^https?:\/\//.test(url)) url = `https://${url}`;
  const adminToken = (get('uazapi_admin_token') || Deno.env.get('UAZAPI_ADMIN_TOKEN') || '')
    .replace(/^Bearer\s+/i, '').replace(/^admintoken\s+/i, '');
  return { url: url.replace(/\/+$/, ''), adminToken };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Usuário logado */
export async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new HttpError(401, 'Não autenticado');
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new HttpError(401, 'Não autenticado');
  return user;
}

/** Usuário logado, membro da oficina e com o módulo Inbox liberado */
export async function requireInboxMember(req: Request, admin: SupabaseClient, workshopId: unknown) {
  const user = await requireUser(req);
  if (typeof workshopId !== 'string' || !workshopId) throw new HttpError(400, 'workshop_id obrigatório');

  const [{ data: member }, { data: enabled }] = await Promise.all([
    admin.rpc('is_workshop_member', { _workshop_id: workshopId, _user_id: user.id }),
    admin.rpc('workshop_module_enabled', { _workshop_id: workshopId, _module: 'inbox' }),
  ]);
  if (!member) throw new HttpError(403, 'Você não faz parte desta oficina');
  if (!enabled) throw new HttpError(403, 'O Inbox do WhatsApp não está liberado para esta oficina');
  return user;
}

/** Chamada à UAZAPI com o token da instância (ou admintoken) */
export async function uaz(
  cfg: UazConfig, path: string,
  opts: { token?: string; admin?: boolean; method?: string; body?: unknown } = {},
) {
  if (!cfg.url) throw new HttpError(500, 'UAZAPI não configurada (painel admin → Configurações → WhatsApp)');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (opts.token) headers.token = opts.token;
  if (opts.admin) headers.admintoken = cfg.adminToken;
  const res = await fetch(`${cfg.url}${path}`, {
    method: opts.method ?? (opts.body === undefined ? 'GET' : 'POST'),
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

/** Status da instância na UAZAPI → nosso status */
export function mapInstanceStatus(data: any): { status: string; phone: string | null; profileName: string | null } {
  const st = data?.status ?? {};
  const inst = data?.instance ?? data ?? {};
  const connected = st.connected === true || st.loggedIn === true || inst.status === 'connected';
  const status = connected ? 'connected'
    : inst.status === 'connecting' || inst.status === 'qr' ? 'connecting'
    : inst.status === 'banned' ? 'banned' : 'disconnected';
  const phone = (st.jid ? String(st.jid).split(/[:@]/)[0] : null) || inst.owner || null;
  return { status, phone: phone ? String(phone).replace(/\D/g, '') : null, profileName: inst.profileName || null };
}

/** Só dígitos, com 55 quando vier no formato nacional (DDD + número) */
export function toWhatsAppNumber(raw: string) {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

/** Id cru da mensagem (a UAZAPI às vezes manda "dono:id") */
export const rawMessageId = (id: unknown) => (id ? String(id).split(':').pop()! : null);
