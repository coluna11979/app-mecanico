// Número de WhatsApp da oficina (uma instância da UAZAPI por oficina).
// action: 'status' (confere na UAZAPI) | 'connect' (cria se preciso e devolve o QR code) | 'disconnect'
import {
  CORS, HttpError, adminClient, json, mapInstanceStatus, requireInboxMember, requireUser, uaz, uazConfig, type UazConfig,
} from '../_shared/uazapi.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const admin = adminClient();
  try {
    const { action, workshop_id: workshopId, token: linkToken } = await req.json();

    // Superadmin liga uma instância que já existe na UAZAPI (número já conectado) à oficina
    if (action === 'link') {
      const user = await requireUser(req);
      const { data: isAdmin } = await admin.rpc('is_admin', { uid: user.id });
      if (!isAdmin) throw new HttpError(403, 'Só o superadmin pode ligar uma instância existente');
      if (typeof workshopId !== 'string' || !workshopId) throw new HttpError(400, 'workshop_id obrigatório');
      const token = String(linkToken ?? '').trim();
      if (!token) throw new HttpError(400, 'Informe o token da instância');
      const cfg = await uazConfig(admin);
      const r = await uaz(cfg, '/instance/status', { token });
      if (!r.ok) throw new HttpError(400, `A UAZAPI não reconheceu esse token (${r.status}). Confira o token e o endereço do servidor.`);
      const name = r.data?.instance?.name || `oficina_${workshopId.slice(0, 8)}`;

      const { data: prev } = await admin.from('whatsapp_instances').select('*').eq('workshop_id', workshopId).maybeSingle();
      await admin.from('whatsapp_instances').upsert({ workshop_id: workshopId, instance_name: name, updated_at: new Date().toISOString() });
      const { data: saved, error } = await admin.from('whatsapp_instance_secrets')
        .upsert({ workshop_id: workshopId, token }).select('webhook_secret').single();
      if (error) throw error;
      await configureWebhook(cfg, token, workshopId, saved.webhook_secret);
      return json(await saveStatus(admin, workshopId, prev, mapInstanceStatus(r.data)));
    }

    await requireInboxMember(req, admin, workshopId);
    const cfg = await uazConfig(admin);

    const { data: inst } = await admin.from('whatsapp_instances').select('*').eq('workshop_id', workshopId).maybeSingle();
    const { data: secret } = await admin.from('whatsapp_instance_secrets').select('token, webhook_secret').eq('workshop_id', workshopId).maybeSingle();

    if (action === 'status') {
      if (!inst || !secret) return json({ status: 'none' });
      const r = await uaz(cfg, '/instance/status', { token: secret.token });
      if (!r.ok) return json({ status: inst.status, phone_number: inst.phone_number, warning: 'Não conferiu com a UAZAPI' });
      return json(await saveStatus(admin, workshopId, inst, mapInstanceStatus(r.data)));
    }

    if (action === 'connect') {
      let token = secret?.token ?? null;
      let webhookSecret = secret?.webhook_secret ?? null;

      // Instância apagada na UAZAPI (token não vale mais) → cria de novo
      if (token) {
        const r = await uaz(cfg, '/instance/status', { token });
        if (r.status === 401 || r.status === 404) token = null;
        else if (r.ok && mapInstanceStatus(r.data).status === 'connected') {
          await configureWebhook(cfg, token, workshopId, webhookSecret!);
          return json(await saveStatus(admin, workshopId, inst, mapInstanceStatus(r.data)));
        }
      }

      if (!token) {
        if (!cfg.adminToken) throw new HttpError(500, 'Admin token da UAZAPI não configurado');
        const name = `oficina_${String(workshopId).slice(0, 8)}`;
        const r = await uaz(cfg, '/instance/init', { admin: true, body: { name } });
        token = r.data?.token || r.data?.instance?.token || null;
        if (!r.ok || !token) throw new HttpError(502, `UAZAPI não criou a instância: ${JSON.stringify(r.data).slice(0, 300)}`);

        await admin.from('whatsapp_instances').upsert({
          workshop_id: workshopId, instance_name: name, status: 'disconnected', updated_at: new Date().toISOString(),
        });
        const { data: saved, error } = await admin.from('whatsapp_instance_secrets')
          .upsert({ workshop_id: workshopId, token }).select('webhook_secret').single();
        if (error) throw error;
        webhookSecret = saved.webhook_secret;
      }

      await configureWebhook(cfg, token, workshopId, webhookSecret!);

      const r = await uaz(cfg, '/instance/connect', { token, body: {} });
      const mapped = mapInstanceStatus(r.data);
      if (r.data?.connected === true || r.data?.loggedIn === true || mapped.status === 'connected') {
        const { data: fresh } = await admin.from('whatsapp_instances').select('*').eq('workshop_id', workshopId).single();
        return json(await saveStatus(admin, workshopId, fresh, { ...mapped, status: 'connected' }));
      }
      const qrcode = r.data?.instance?.qrcode || r.data?.qrcode || r.data?.qr || r.data?.base64 || null;
      await admin.from('whatsapp_instances')
        .update({ status: 'connecting', updated_at: new Date().toISOString() }).eq('workshop_id', workshopId);
      if (!qrcode) return json({ status: 'connecting', qrcode: null, retry: true });
      return json({ status: 'connecting', qrcode });
    }

    if (action === 'disconnect') {
      if (secret?.token) await uaz(cfg, '/instance/disconnect', { token: secret.token, body: {} });
      if (inst) {
        await admin.from('whatsapp_instances')
          .update({ status: 'disconnected', updated_at: new Date().toISOString() }).eq('workshop_id', workshopId);
      }
      return json({ status: 'disconnected' });
    }

    throw new HttpError(400, 'action inválida');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    console.error('[whatsapp-instance]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});

async function saveStatus(
  admin: SupabaseClient, workshopId: string, inst: any,
  s: { status: string; phone: string | null; profileName: string | null },
) {
  const patch: Record<string, unknown> = {
    status: s.status,
    phone_number: s.phone ?? inst?.phone_number ?? null,
    profile_name: s.profileName ?? inst?.profile_name ?? null,
    updated_at: new Date().toISOString(),
  };
  if (s.status === 'connected' && inst?.status !== 'connected') patch.last_connected_at = new Date().toISOString();
  await admin.from('whatsapp_instances').update(patch).eq('workshop_id', workshopId);
  return { status: s.status, phone_number: patch.phone_number };
}

/** Mensagens, confirmações e conexão vão para o nosso webhook (com o segredo da oficina na URL) */
async function configureWebhook(cfg: UazConfig, token: string, workshopId: string, secret: string) {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-webhook?wid=${workshopId}&s=${secret}`;
  const r = await uaz(cfg, '/webhook', {
    token,
    body: { enabled: true, url, events: ['messages', 'messages_update', 'connection'], excludeMessages: ['wasSentByApi', 'isGroupYes'] },
  });
  if (!r.ok) throw new HttpError(502, `UAZAPI não configurou o webhook: ${JSON.stringify(r.data).slice(0, 300)}`);
}
