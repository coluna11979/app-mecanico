// Recebe os eventos da UAZAPI de cada oficina (URL: ?wid=<oficina>&s=<segredo>).
// messages → grava na conversa (cria a conversa e liga ao cliente pelo telefone)
// messages_update → entregue/lida/apagada · connection → status do número
// Grupos, status e canais ficam de fora: o Inbox é para conversar com clientes.
import { adminClient, json, mapInstanceStatus, rawMessageId, uaz, uazConfig, type UazConfig } from '../_shared/uazapi.ts';
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const ok = () => json({ received: true });
const stripJid = (j: unknown) => String(j ?? '').replace(/@.*$/, '').replace(/:\d+$/, '').replace(/\D/g, '');

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok();
  const admin = adminClient();
  try {
    const url = new URL(req.url);
    const wid = url.searchParams.get('wid');
    const s = url.searchParams.get('s');
    if (!wid || !s) return json({ error: 'forbidden' }, 403);
    const { data: secret } = await admin.from('whatsapp_instance_secrets')
      .select('token, webhook_secret').eq('workshop_id', wid).maybeSingle();
    if (!secret || secret.webhook_secret !== s) return json({ error: 'forbidden' }, 403);

    const payload = await req.json().catch(() => ({}));
    const event = String(payload.EventType || payload.type || payload.event_type || url.searchParams.get('event') || '');
    const cfg = await uazConfig(admin);

    if (event === 'messages' || event === 'message' || (!event && payload.message)) {
      await handleMessage(admin, cfg, wid, secret.token, payload);
    } else if (event === 'messages_update') {
      await handleUpdate(admin, wid, payload.event || payload.message || payload);
    } else if (event === 'connection') {
      // Formato do evento muda entre versões: a fonte da verdade é o /instance/status
      const r = await uaz(cfg, '/instance/status', { token: secret.token });
      if (r.ok) {
        const st = mapInstanceStatus(r.data);
        const patch: Record<string, unknown> = { status: st.status, updated_at: new Date().toISOString() };
        if (st.phone) patch.phone_number = st.phone;
        if (st.status === 'connected') patch.last_connected_at = new Date().toISOString();
        await admin.from('whatsapp_instances').update(patch).eq('workshop_id', wid);
      }
    }
    return ok();
  } catch (e) {
    console.error('[whatsapp-webhook]', e);
    // 200 para a UAZAPI não ficar reenviando o mesmo evento quebrado
    return ok();
  }
});

const TYPE_MAP: [RegExp, string][] = [
  [/image/i, 'image'], [/video/i, 'video'], [/audio|ptt/i, 'audio'],
  [/document/i, 'document'], [/sticker/i, 'sticker'],
];


/* ── Tipos especiais: respostas de botão/lista, localização, contato, mensagens com botões ──
   A UAZAPI manda o conteúdo do WhatsApp quase cru (nomes de campo variam entre versões),
   então a busca ignora maiúsculas e entra nos objetos internos. */

/** Texto do campo mais importante (ordem de `keys`), procurando em até 3 níveis */
function findText(obj: any, keys: string[]): string {
  for (const key of keys) { const t = findKey(obj, key.toLowerCase(), 0); if (t) return t; }
  return '';
}
function findKey(obj: any, key: string, depth: number): string {
  if (!obj || typeof obj !== 'object' || depth > 3) return '';
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === key && typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') { const t = findKey(v, key, depth + 1); if (t) return t; }
  }
  return '';
}
function findNum(obj: any, key: string, depth = 0): number | null {
  if (!obj || typeof obj !== 'object' || depth > 3) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (k.toLowerCase() === key.toLowerCase() && Number.isFinite(Number(v))) return Number(v);
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') { const n = findNum(v, key, depth + 1); if (n != null) return n; }
  }
  return null;
}

/** Texto para os tipos que não são texto nem mídia; null = não é um tipo especial */
function specialText(msgType: string, c: any): string | null {
  if (/location/i.test(msgType)) {
    const lat = findNum(c, 'degreesLatitude'), lng = findNum(c, 'degreesLongitude');
    const name = findText(c, ['name', 'address']);
    const link = lat != null && lng != null ? ` https://maps.google.com/?q=${lat},${lng}` : '';
    return `📍 Localização${name ? `: ${name}` : ''}${link}`;
  }
  if (/contact/i.test(msgType)) {
    const name = findText(c, ['displayName', 'fullName']);
    const vcard = findText(c, ['vcard']);
    const tel = vcard.match(/waid=(\d+)/)?.[1] ?? vcard.match(/TEL[^:]*:([+\d\s()-]+)/)?.[1]?.trim() ?? '';
    return `👤 Contato${name ? `: ${name}` : ''}${tel ? ` (${tel})` : ''}`;
  }
  // Resposta tocando num botão / numa lista (comum com robôs de atendimento)
  if (/response|reply/i.test(msgType)) {
    const t = findText(c, ['selectedDisplayText', 'title', 'selectedRowId', 'selectedButtonId', 'selectedId', 'text', 'body', 'description']);
    return t ? `↩️ ${t}` : null;
  }
  // Mensagem com botões / lista / modelo enviada por empresas
  if (/button|list|template|interactive|hydrated/i.test(msgType)) {
    const t = findText(c, ['contentText', 'hydratedContentText', 'text', 'body', 'description', 'title', 'footerText']);
    return t || null;
  }
  return null;
}

/** Botões da mensagem (modelo, link, resposta rápida, botões interativos novos), em qualquer nível.
 *  Formatos conhecidos: urlButton{displayText,url} · quickReplyButton{displayText} ·
 *  buttons[{buttonText:{displayText}}] · nativeFlow buttons[{name, buttonParamsJSON:'{"display_text","url"}'}] */
type MsgButton = { text: string; url?: string };
function extractButtons(obj: any): MsgButton[] {
  const out: MsgButton[] = [];
  const seen = new Set<string>();
  const add = (text: unknown, url?: unknown) => {
    const t = typeof text === 'string' ? text.trim() : '';
    const u = typeof url === 'string' && /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined;
    if (!t || seen.has(t + (u ?? ''))) return;
    seen.add(t + (u ?? ''));
    out.push(u ? { text: t, url: u } : { text: t });
  };
  const get = (o: any, key: string) => {
    if (!o || typeof o !== 'object') return undefined;
    const k = Object.keys(o).find(x => x.toLowerCase() === key.toLowerCase());
    return k ? o[k] : undefined;
  };
  const walk = (o: any, depth: number) => {
    if (!o || typeof o !== 'object' || depth > 6) return;
    if (Array.isArray(o)) { o.forEach(x => walk(x, depth + 1)); return; }
    // Botões novos: o conteúdo vem num JSON em texto
    const params = get(o, 'buttonParamsJSON') ?? get(o, 'buttonParamsJson');
    if (typeof params === 'string') {
      try { const p = JSON.parse(params); add(p.display_text ?? p.displayText ?? p.title, p.url ?? p.merchant_url); } catch { /* ignora */ }
    }
    const url = get(o, 'url');
    const display = get(o, 'displayText') ?? get(get(o, 'buttonText'), 'displayText');
    if (typeof display === 'string') add(display, url);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, depth + 1);
  };
  walk(obj, 0);
  return out.slice(0, 10);
}

async function handleMessage(admin: SupabaseClient, cfg: UazConfig, wid: string, token: string, payload: any) {
  const m = payload.message ?? payload;
  const chatInfo = payload.chat ?? {};
  const chatid: string = m.chatid || chatInfo.wa_chatid || '';
  if (!chatid || m.isGroup || /@(g\.us|broadcast|newsletter)$/.test(chatid)) return;

  const msgType = String(m.messageType || '');
  if (/reaction|protocol|edited|poll|call/i.test(msgType)) return;

  const fromMe = Boolean(m.fromMe);
  const messageId = rawMessageId(m.messageid || m.id);
  // Número de verdade (chats @lid trazem o telefone em chat.phone / sender_pn)
  const phone = stripJid(chatInfo.phone) || (!fromMe ? stripJid(m.sender_pn) : '') || stripJid(chatid);
  if (!phone) return;

  const contentObj = typeof m.content === 'object' && m.content ? m.content : {};
  let text: string = (typeof m.content === 'string' ? m.content : '') || m.text || contentObj.text || contentObj.caption || '';
  // Resposta de botão/lista, localização, contato… viram texto legível (antes de olhar mídia:
  // "ButtonsMessage" com imagem de cabeçalho não é foto)
  const special = specialText(msgType, contentObj);
  let kind = special != null ? 'text'
    : TYPE_MAP.find(([re]) => re.test(msgType) || re.test(String(m.mediaType || '')))?.[1]
      ?? (/conversation|extendedtext|^text$/i.test(msgType) || !msgType ? 'text' : 'other');
  if (special != null) text = special || text;
  const buttons = extractButtons(contentObj);
  // Tipos especiais: registra o formato (sem dados pessoais) para acertar a leitura se vier algo novo
  if (special != null || buttons.length || kind === 'other') {
    const shape = (o: any, d = 0): any => !o || typeof o !== 'object' || d > 3 ? typeof o
      : Array.isArray(o) ? [shape(o[0], d + 1)] : Object.fromEntries(Object.entries(o).map(([k, v]) => [k, shape(v, d + 1)]));
    console.log('[whatsapp-webhook] tipo especial', msgType, JSON.stringify({ buttons: buttons.length, content: shape(contentObj) }).slice(0, 1500));
  }
  // Tipo desconhecido: procura qualquer texto dentro; senão deixa o tipo registrado
  if (kind === 'other' && !text) {
    text = findText(contentObj, ['text', 'caption', 'body', 'description', 'title', 'contentText', 'conversation']);
    if (text) kind = 'text';
    else text = `[${msgType.replace(/Message$/, '') || 'Mensagem'} — tipo não suportado, veja no celular]`;
  }

  // Dedup: UAZAPI reenvia quando demora para responder
  if (messageId) {
    const { data: dup } = await admin.from('whatsapp_messages').select('id')
      .eq('workshop_id', wid).eq('message_id', messageId).maybeSingle();
    if (dup) return;
  }

  // Conversa (cria na primeira mensagem e liga ao cliente cadastrado)
  const contactName = chatInfo.wa_contactName || chatInfo.wa_name || chatInfo.name || (!fromMe ? m.senderName : null) || null;
  const avatar = chatInfo.imagePreview || chatInfo.image || null;
  const CHAT_SEL = 'id, name, avatar_url, customer_id, source, lead_at, sector_id';
  let { data: chat } = await admin.from('whatsapp_chats').select(CHAT_SEL)
    .eq('workshop_id', wid).eq('remote_jid', chatid).maybeSingle();
  // Conversa aberta pelo sistema (whatsapp-send grava numero@s.whatsapp.net; o WhatsApp pode responder com @lid)
  if (!chat) {
    ({ data: chat } = await admin.from('whatsapp_chats').select(CHAT_SEL)
      .eq('workshop_id', wid).eq('phone', phone).limit(1).maybeSingle());
  }
  if (!chat) {
    const { data: customerId } = await admin.rpc('match_customer_by_phone', { _workshop_id: wid, _phone: phone });
    const { data, error } = await admin.from('whatsapp_chats').upsert(
      { workshop_id: wid, remote_jid: chatid, phone, name: contactName, customer_id: customerId ?? null },
      { onConflict: 'workshop_id,remote_jid' },
    ).select(CHAT_SEL).single();
    if (error) throw error;
    chat = data;
  } else if (contactName && !chat.name) {
    await admin.from('whatsapp_chats').update({ name: contactName }).eq('id', chat.id);
  }

  // Foto do contato: o link do WhatsApp expira → guarda uma cópia no nosso storage (uma vez por conversa)
  if (avatar && (!chat.avatar_url || /^https?:/.test(chat.avatar_url))) {
    try {
      const img = await fetch(avatar);
      if (img.ok) {
        const path = `${wid}/avatars/${chat.id}.jpg`;
        const { error } = await admin.storage.from('whatsapp-media')
          .upload(path, await img.arrayBuffer(), { contentType: img.headers.get('content-type') || 'image/jpeg', upsert: true });
        if (!error) await admin.from('whatsapp_chats').update({ avatar_url: path }).eq('id', chat.id);
      }
    } catch (e) {
      console.error('[whatsapp-webhook] foto', e);
    }
  }

  // Mídia: a URL do WhatsApp vem criptografada → pede o arquivo pronto à UAZAPI e guarda no nosso storage
  let mediaPath: string | null = null;
  let mediaMime: string | null = null;
  const fileName: string | null = contentObj.fileName || contentObj.title || null;
  if (kind !== 'text' && kind !== 'other' && messageId) {
    try {
      const r = await uaz(cfg, '/message/download', { token, body: { id: messageId, return_link: true, return_base64: false } });
      const fileUrl = r.data?.fileURL || r.data?.FileURL || r.data?.url || null;
      if (fileUrl) {
        const file = await fetch(fileUrl);
        if (file.ok) {
          mediaMime = (r.data?.mimetype || contentObj.mimetype || file.headers.get('content-type') || 'application/octet-stream')
            .split(';')[0].trim();
          const ext = extFor(mediaMime, fileName);
          mediaPath = `${wid}/${chat.id}/${messageId}${ext}`;
          const { error } = await admin.storage.from('whatsapp-media')
            .upload(mediaPath, await file.arrayBuffer(), { contentType: mediaMime, upsert: true });
          if (error) { console.error('[whatsapp-webhook] upload', error); mediaPath = null; }
        }
      }
    } catch (e) {
      console.error('[whatsapp-webhook] mídia', e);
    }
  }

  const ts = Number(m.messageTimestamp);
  const sentAt = ts ? new Date(ts > 1e12 ? ts : ts * 1000).toISOString() : new Date().toISOString();

  const { error } = await admin.from('whatsapp_messages').insert({
    workshop_id: wid,
    chat_id: chat.id,
    message_id: messageId,
    from_me: fromMe,
    // Resposta feita pelo celular da oficina (fora do sistema)
    sent_by_name: fromMe ? 'Celular da oficina' : null,
    content: text || null,
    message_type: kind,
    media_path: mediaPath,
    media_mime: mediaMime,
    file_name: fileName,
    buttons: buttons.length ? buttons : null,
    status: fromMe ? 'sent' : 'delivered',
    sent_at: sentAt,
  });
  // 23505 = chegou duplicada ao mesmo tempo
  if (error && error.code !== '23505') throw error;

  // Contato que veio do site da oficina: marca a origem e já entra como Interessado no Comercial
  if (!fromMe && !chat.source && text && /vim pelo site/i.test(text)) {
    try { await markFromSite(admin, wid, chat, text); } catch (e) { console.error('[whatsapp-webhook] site', e); }
  }
}

/* ── Site da oficina → CRM (módulo opcional `site`) ──────────────────────────── */

type SiteChat = { id: string; source: string | null; lead_at: string | null; sector_id: string | null };

async function markFromSite(admin: SupabaseClient, wid: string, chat: SiteChat, text: string) {
  const { data: mods } = await admin.from('workshop_modules').select('enabled_modules').eq('workshop_id', wid).maybeSingle();
  if (!((mods?.enabled_modules ?? []) as string[]).includes('site')) return;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { source: 'site', source_at: now };
  // Já marcado como interessado por alguém: mantém o que a equipe escreveu
  if (!chat.lead_at) Object.assign(patch, { lead_at: now, lead_note: siteSummary(text), lead_by: 'Site' });

  const { data: sector } = await admin.from('whatsapp_sectors').select('id, name')
    .eq('workshop_id', wid).eq('kind', 'comercial').eq('active', true).order('position').limit(1).maybeSingle();
  if (sector && chat.sector_id !== sector.id) patch.sector_id = sector.id;

  // Só a primeira mensagem do site marca (source null → evita corrida com reenvio da UAZAPI)
  const { data: updated } = await admin.from('whatsapp_chats').update(patch)
    .eq('id', chat.id).is('source', null).select('id').maybeSingle();
  if (!updated) return;
  await admin.from('whatsapp_chat_notes').insert({
    workshop_id: wid, chat_id: chat.id, author_name: 'Sistema',
    body: `🌐 Veio pelo site da oficina${sector && patch.sector_id ? ` · foi para ${sector.name}` : ''}`,
  });
}

/** Resumo da mensagem pronta do site → "Gol 2015 · barulho ao frear, volante tremendo" */
export function siteSummary(text: string): string {
  const t = text.replace(/\r/g, '');
  const pick = (re: RegExp) => t.match(re)?.[1]?.trim().replace(/[.!]+$/, '') || '';
  const car = pick(/Carro:\s*([^\n]+)/i);
  const tag = (prefix: string, v: string) => (v ? prefix + v : '');
  const free = pick(/Vim pelo site[.!]?[ \t]*(?:e\s+)?([^\n]+)/i)
    .replace(/^meu carro (está|esta)\s+/i, '').replace(/\s+e quero .*$/i, '');
  const what =
    pick(/O que está acontecendo:\s*([^\n]+)/i) ||
    tag('Oferta: ', pick(/quero a oferta:\s*([^\n]+)/i)) ||
    tag('Orçamento de ', pick(/quero um orçamento de\s*([^\n]+)/i)) ||
    tag('Acendeu a ', pick(/Acendeu a (luz [^\n]+?) no painel/i)) ||
    (free ? free.charAt(0).toUpperCase() + free.slice(1) : '');
  const out = [car, what].filter(Boolean).join(' · ');
  return (out || 'Contato pelo site').slice(0, 140);
}

const RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };

async function handleUpdate(admin: SupabaseClient, wid: string, ev: any) {
  const kind = String(ev.Type || ev.type || ev.state || ev.status || '').toLowerCase();
  const ids = (Array.isArray(ev.MessageIDs) ? ev.MessageIDs : [ev.messageid || ev.id])
    .map(rawMessageId).filter(Boolean) as string[];
  if (!ids.length) return;

  if (/delete|revoke/.test(kind)) {
    await admin.from('whatsapp_messages').update({ is_deleted: true }).eq('workshop_id', wid).in('message_id', ids);
    return;
  }
  const next = /read|played|viewed/.test(kind) ? 'read' : /deliver|received|server/.test(kind) ? 'delivered' : null;
  if (!next) return;
  // Nunca volta (lida não vira entregue)
  const lower = Object.keys(RANK).filter(k => RANK[k] < RANK[next]);
  await admin.from('whatsapp_messages').update({ status: next })
    .eq('workshop_id', wid).in('message_id', ids).in('status', lower);
}

function extFor(mime: string, fileName: string | null) {
  const fromName = fileName?.match(/\.[a-z0-9]{1,5}$/i)?.[0];
  if (fromName) return fromName.toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4',
    'audio/ogg': '.ogg', 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'application/pdf': '.pdf',
  };
  return map[mime] ?? '';
}
