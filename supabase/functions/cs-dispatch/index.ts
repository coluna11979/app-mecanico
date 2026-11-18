// Agente de CS: envia pelo WhatsApp da oficina as mensagens da fila cs_messages (boas-vindas ao abrir a OS e
// pós-serviço N horas depois de concluir, com o link de avaliação do Google).
// Chamada pelo pg_cron a cada 5 min (header x-cron-secret = app_settings.cs_cron_secret). Deploy com verify_jwt desligado.
//
// Regras: só em horário comercial (Brasília, seg–sáb 8h–20h; fora disso adia), nunca para quem pediu para não receber
// contato, boas-vindas que perderam o momento (> 6 h) são descartadas, pós-serviço só se a OS continua concluída.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { adminClient, json, rawMessageId, toWhatsAppNumber, uaz, uazConfig } from '../_shared/uazapi.ts';
import { CS_DEFAULTS, renderCs } from '../_shared/csTexts.ts';

const AGENT_NAME = 'Atendimento 🤖';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Hora e dia da semana em Brasília */
function brt(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(d);
  return { hour: Number(p.find((x) => x.type === 'hour')!.value), wd: p.find((x) => x.type === 'weekday')!.value };
}
const inWindow = (d = new Date()) => { const t = brt(d); return t.wd !== 'Sun' && t.hour >= 8 && t.hour < 20; };
/** Próximo momento permitido: a partir de agora, anda de hora em hora até cair na janela, e aponta para ~9h */
function nextWindow(): Date {
  let d = new Date(Date.now() + 15 * 60_000);
  for (let i = 0; i < 60 && !(inWindow(d) && brt(d).hour >= 9); i++) d = new Date(d.getTime() + 30 * 60_000);
  return d;
}

type Msg = { id: string; workshop_id: string; service_order_id: string; customer_id: string; kind: 'welcome' | 'post_service'; send_at: string };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const admin = adminClient();
  const { data: sec } = await admin.from('app_settings').select('value').eq('key', 'cs_cron_secret').maybeSingle();
  if (!sec?.value || req.headers.get('x-cron-secret') !== sec.value) return json({ error: 'forbidden' }, 403);

  const { data: claimed, error } = await admin.rpc('cs_claim', { p_limit: 15 });
  if (error) return json({ ok: false, error: error.message }, 500);
  const out = { sent: 0, skipped: 0, deferred: 0, failed: 0 };
  for (const m of (claimed ?? []) as Msg[]) {
    try {
      const r = await processOne(admin, m);
      out[r]++;
      if (r === 'sent') await sleep(3000 + Math.floor(Math.random() * 3000));
    } catch (e) {
      out.failed++;
      console.error('[cs-dispatch]', m.id, e);
      await admin.from('cs_messages').update({ status: 'failed', detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) }).eq('id', m.id);
    }
  }
  return json({ ok: true, ...out });
});

async function processOne(admin: SupabaseClient, m: Msg): Promise<'sent' | 'skipped' | 'deferred' | 'failed'> {
  const skip = async (detail: string) => { await admin.from('cs_messages').update({ status: 'skipped', detail }).eq('id', m.id); return 'skipped' as const; };
  const defer = async (when: Date) => { await admin.from('cs_messages').update({ status: 'pending', claimed_at: null, send_at: when.toISOString() }).eq('id', m.id); return 'deferred' as const; };

  const [{ data: agent }, { data: os }, { data: cust }, { data: ws }] = await Promise.all([
    admin.from('ai_agents').select('enabled, settings').eq('workshop_id', m.workshop_id).eq('template', 'cs').maybeSingle(),
    admin.from('service_orders').select('number, status, vehicle:vehicles(make, model)').eq('id', m.service_order_id).maybeSingle(),
    admin.from('customers').select('full_name, phone, contact_opt_out').eq('id', m.customer_id).maybeSingle(),
    admin.from('workshops').select('business_name, google_review_url').eq('id', m.workshop_id).maybeSingle(),
  ]);
  if (!agent?.enabled) return skip('agente_desligado');
  if (!os) return skip('os_nao_encontrada');
  if (!cust?.phone || cust.contact_opt_out) return skip('cliente_sem_telefone_ou_sem_contato');
  if (m.kind === 'welcome' && (os.status === 'cancelled' || os.status === 'completed')) return skip('os_ja_encerrada');
  if (m.kind === 'post_service' && os.status !== 'completed') return skip('os_reaberta_ou_cancelada');

  const ageMs = Date.now() - new Date(m.send_at).getTime();
  if (!inWindow()) {
    if (m.kind === 'welcome' && ageMs > 6 * 3600_000) return skip('perdeu_o_momento');
    return defer(nextWindow());
  }
  if (m.kind === 'welcome' && ageMs > 6 * 3600_000) return skip('perdeu_o_momento');

  // WhatsApp da oficina precisa estar conectado
  const [{ data: secret }, { data: inst }] = await Promise.all([
    admin.from('whatsapp_instance_secrets').select('token').eq('workshop_id', m.workshop_id).maybeSingle(),
    admin.from('whatsapp_instances').select('status').eq('workshop_id', m.workshop_id).maybeSingle(),
  ]);
  if (!secret || inst?.status !== 'connected') {
    if (ageMs > 24 * 3600_000) { await admin.from('cs_messages').update({ status: 'failed', detail: 'whatsapp_desconectado' }).eq('id', m.id); return 'failed'; }
    return defer(new Date(Date.now() + 30 * 60_000));
  }

  // Texto
  const settings = (agent.settings ?? {}) as Record<string, string>;
  const veh = os.vehicle as unknown as { make: string | null; model: string | null } | null;
  const carro = [veh?.make, veh?.model].filter(Boolean).join(' ').trim() || 'veículo';
  let text: string;
  if (m.kind === 'welcome') {
    text = renderCs(settings.welcome_text?.trim() || CS_DEFAULTS.welcome_text, { cust: cust.full_name, carro, os: os.number, oficina: ws?.business_name, link: null });
  } else {
    const link = ws?.google_review_url?.trim() || null;
    const base = settings.post_text?.trim() || (link ? CS_DEFAULTS.post_text : CS_DEFAULTS.post_text_sem_link);
    text = renderCs(base, { cust: cust.full_name, carro, os: os.number, oficina: ws?.business_name, link });
    // Troca de óleo: avisa que vamos lembrar quando estiver perto
    const { data: items } = await admin.from('service_order_items').select('description').eq('service_order_id', m.service_order_id);
    const oil = (items ?? []).some((i: { description: string }) => /[óo]leo/i.test(i.description ?? ''));
    if (oil) text += '\n\n' + renderCs(settings.oil_text?.trim() || CS_DEFAULTS.oil_text, { cust: cust.full_name, carro, os: os.number, oficina: ws?.business_name, link });
  }

  // Conversa do cliente (cria se não existir), grava antes de enviar e envia pela UAZAPI
  const phone = toWhatsAppNumber(cust.phone);
  if (phone.length < 12) return skip('telefone_invalido');
  const jid = `${phone}@s.whatsapp.net`;
  let chatId: string | null = null;
  const { data: found } = await admin.from('whatsapp_chats').select('id').eq('workshop_id', m.workshop_id).or(`remote_jid.eq.${jid},phone.eq.${phone}`).limit(1).maybeSingle();
  if (found) chatId = found.id;
  else {
    const { data: created, error } = await admin.from('whatsapp_chats')
      .insert({ workshop_id: m.workshop_id, remote_jid: jid, phone, name: cust.full_name, customer_id: m.customer_id }).select('id').single();
    if (error) throw error;
    chatId = created.id;
  }
  const { data: row, error: insErr } = await admin.from('whatsapp_messages').insert({
    workshop_id: m.workshop_id, chat_id: chatId, from_me: true, by_agent: true, sent_by_name: AGENT_NAME,
    content: text, message_type: 'text', status: 'pending', sent_at: new Date().toISOString(),
  }).select('id').single();
  if (insErr) throw insErr;

  const r = await uaz(await uazConfig(admin), '/send/text', { token: secret.token, body: { number: phone, text } });
  const messageId = rawMessageId(r.data?.messageid || r.data?.id || r.data?.key?.id);
  const { error: upErr } = await admin.from('whatsapp_messages')
    .update({ status: r.ok ? 'sent' : 'failed', ...(messageId ? { message_id: messageId } : {}) }).eq('id', row.id);
  if (upErr?.code === '23505' && messageId) {
    await admin.from('whatsapp_messages').update({ by_agent: true, sent_by_name: AGENT_NAME }).eq('workshop_id', m.workshop_id).eq('message_id', messageId);
    await admin.from('whatsapp_messages').delete().eq('id', row.id);
  }
  if (!r.ok) throw new Error(`WhatsApp não enviou: ${JSON.stringify(r.data).slice(0, 200)}`);

  await admin.from('cs_messages').update({ status: 'sent', sent_at: new Date().toISOString(), text, detail: null }).eq('id', m.id);
  // O pedido de avaliação já foi feito: tira da fila manual da tela Avaliações para ninguém mandar de novo
  if (m.kind === 'post_service' && ws?.google_review_url) {
    await admin.from('review_requests').update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('service_order_id', m.service_order_id).eq('status', 'pending');
  }
  return 'sent';
}
