// Envia mensagem pelo número da oficina e grava no Inbox.
// Corpo: { workshop_id, chat_id? | phone? (+ name?, customer_id?), text?, media_path?, media_mime?, file_name?, as_voice? }
// as_voice: áudio gravado no sistema vai como mensagem de voz (ptt), não como arquivo.
// Anexo: o navegador sobe no bucket whatsapp-media (pasta da oficina) e manda só o caminho.
import {
  CORS, HttpError, adminClient, json, rawMessageId, requireInboxMember, toWhatsAppNumber, uaz, uazConfig,
} from '../_shared/uazapi.ts';

const kindOf = (mime: string) =>
  mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'document';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const admin = adminClient();
  try {
    const body = await req.json();
    const workshopId: string = body.workshop_id;
    const user = await requireInboxMember(req, admin, workshopId);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const mediaPath: string | null = body.media_path || null;
    if (!text && !mediaPath) throw new HttpError(400, 'Mensagem vazia');
    if (mediaPath && !mediaPath.startsWith(`${workshopId}/`)) throw new HttpError(403, 'Anexo de outra oficina');

    const { data: secret } = await admin.from('whatsapp_instance_secrets').select('token').eq('workshop_id', workshopId).maybeSingle();
    const { data: inst } = await admin.from('whatsapp_instances').select('status').eq('workshop_id', workshopId).maybeSingle();
    if (!secret || inst?.status !== 'connected') throw new HttpError(409, 'WhatsApp da oficina desconectado. Conecte o número pelo QR code.');

    // Conversa existente ou nova (ex.: botão "Chamar no WhatsApp" na ficha do cliente)
    let chat: { id: string; phone: string } | null = null;
    if (body.chat_id) {
      const { data } = await admin.from('whatsapp_chats').select('id, phone')
        .eq('id', body.chat_id).eq('workshop_id', workshopId).maybeSingle();
      chat = data;
    } else if (body.phone) {
      const phone = toWhatsAppNumber(body.phone);
      if (phone.length < 12) throw new HttpError(400, 'Telefone inválido');
      const jid = `${phone}@s.whatsapp.net`;
      const { data: found } = await admin.from('whatsapp_chats').select('id, phone')
        .eq('workshop_id', workshopId).or(`remote_jid.eq.${jid},phone.eq.${phone}`).limit(1).maybeSingle();
      if (found) chat = found;
      else {
        let customerId = body.customer_id ?? null;
        if (!customerId) {
          const { data } = await admin.rpc('match_customer_by_phone', { _workshop_id: workshopId, _phone: phone });
          customerId = data ?? null;
        }
        const { data, error } = await admin.from('whatsapp_chats')
          .insert({ workshop_id: workshopId, remote_jid: jid, phone, name: body.name ?? null, customer_id: customerId })
          .select('id, phone').single();
        if (error) throw error;
        chat = data;
      }
    }
    if (!chat) throw new HttpError(404, 'Conversa não encontrada');

    const cfg = await uazConfig(admin);
    const mime: string = body.media_mime || 'application/octet-stream';
    let r;
    if (mediaPath) {
      const { data: signed, error } = await admin.storage.from('whatsapp-media').createSignedUrl(mediaPath, 60 * 60);
      if (error || !signed) throw new HttpError(400, 'Anexo não encontrado');
      const type = body.as_voice ? 'ptt' : kindOf(mime);
      r = await uaz(cfg, '/send/media', {
        token: secret.token,
        body: {
          number: chat.phone, type, file: signed.signedUrl,
          ...(text && type !== 'ptt' ? { text } : {}),
          ...(type === 'document' ? { docName: body.file_name || 'arquivo' } : {}),
        },
      });
    } else {
      r = await uaz(cfg, '/send/text', { token: secret.token, body: { number: chat.phone, text } });
    }
    if (!r.ok) throw new HttpError(502, `WhatsApp não enviou: ${JSON.stringify(r.data).slice(0, 300)}`);

    const { data: prof } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    const { data: saved, error: saveErr } = await admin.from('whatsapp_messages').insert({
      workshop_id: workshopId,
      chat_id: chat.id,
      message_id: rawMessageId(r.data?.messageid || r.data?.id || r.data?.key?.id),
      from_me: true,
      sent_by: user.id,
      sent_by_name: prof?.full_name ?? null,
      content: body.as_voice ? null : text || null,
      message_type: mediaPath ? kindOf(mime) : 'text',
      media_path: mediaPath,
      media_mime: mediaPath ? mime : null,
      file_name: body.file_name ?? null,
      status: 'sent',
    }).select('id').single();
    if (saveErr) console.error('[whatsapp-send] não gravou:', saveErr);

    return json({ ok: true, chat_id: chat.id, message_id: saved?.id ?? null });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    console.error('[whatsapp-send]', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
