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
  const text: string = (typeof m.content === 'string' ? m.content : '') || m.text || contentObj.text || contentObj.caption || '';
  const kind = TYPE_MAP.find(([re]) => re.test(msgType) || re.test(String(m.mediaType || '')))?.[1]
    ?? (/conversation|extendedtext|^text$/i.test(msgType) || !msgType ? 'text' : 'other');

  // Dedup: UAZAPI reenvia quando demora para responder
  if (messageId) {
    const { data: dup } = await admin.from('whatsapp_messages').select('id')
      .eq('workshop_id', wid).eq('message_id', messageId).maybeSingle();
    if (dup) return;
  }

  // Conversa (cria na primeira mensagem e liga ao cliente cadastrado)
  const contactName = chatInfo.wa_contactName || chatInfo.wa_name || chatInfo.name || (!fromMe ? m.senderName : null) || null;
  const avatar = chatInfo.imagePreview || chatInfo.image || null;
  let { data: chat } = await admin.from('whatsapp_chats').select('id, name, avatar_url, customer_id')
    .eq('workshop_id', wid).eq('remote_jid', chatid).maybeSingle();
  // Conversa aberta pelo sistema (whatsapp-send grava numero@s.whatsapp.net; o WhatsApp pode responder com @lid)
  if (!chat) {
    ({ data: chat } = await admin.from('whatsapp_chats').select('id, name, avatar_url, customer_id')
      .eq('workshop_id', wid).eq('phone', phone).limit(1).maybeSingle());
  }
  if (!chat) {
    const { data: customerId } = await admin.rpc('match_customer_by_phone', { _workshop_id: wid, _phone: phone });
    const { data, error } = await admin.from('whatsapp_chats').upsert(
      { workshop_id: wid, remote_jid: chatid, phone, name: contactName, customer_id: customerId ?? null },
      { onConflict: 'workshop_id,remote_jid' },
    ).select('id, name, avatar_url, customer_id').single();
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
    status: fromMe ? 'sent' : 'delivered',
    sent_at: sentAt,
  });
  // 23505 = chegou duplicada ao mesmo tempo
  if (error && error.code !== '23505') throw error;
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
