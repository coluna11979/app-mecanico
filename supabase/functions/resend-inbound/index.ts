// Webhook do Resend (evento email.received): quando o mecânico/oficina RESPONDE um e-mail de
// cadastro, o texto e as fotos entram no histórico do cadastro (approval_messages), como se
// tivessem sido enviados pelo app. verify_jwt = false: a autenticação é a assinatura Svix.
// Precisa em app_settings: resend_webhook_secret (whsec_…) e resend_full_api_key (acesso completo,
// a chave de envio não lê e-mails recebidos).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const BUCKET = 'approval-attachments';
const MAX_SIZE = 10 * 1024 * 1024;
// Imagem embutida pequena costuma ser ícone de assinatura, não documento
const MIN_INLINE_IMAGE = 15 * 1024;
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', pdf: 'application/pdf',
};
const ACCEPTED = new Set(Object.values(MIME_BY_EXT));

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Assinatura Svix: HMAC-SHA256 de "id.timestamp.corpo" com a chave base64 depois de "whsec_"
async function verifySignature(secret: string, req: Request, body: string): Promise<boolean> {
  const id = req.headers.get('svix-id');
  const ts = req.headers.get('svix-timestamp');
  const sigHeader = req.headers.get('svix-signature');
  if (!id || !ts || !sigHeader) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const key = await crypto.subtle.importKey(
    'raw', b64ToBytes(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...sig));
  return sigHeader.split(' ').some((part) => {
    const [version, value] = part.split(',');
    return version === 'v1' && !!value && safeEqual(value, expected);
  });
}

function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

// Só a parte nova da resposta: corta a mensagem citada e a assinatura do celular
function replyText(text: string | null, html: string | null): string {
  let t = text || (html ?? '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const cut = t.search(
    /^\s*(Em [\s\S]{0,250}?escreveu:|On [\s\S]{0,250}?wrote:|-{2,}\s*(Mensagem original|Original Message)|De:\s|From:\s|Enviado d[oe] (meu|Outlook|Yahoo|Gmail|e-?mail)|Sent from my)/mi,
  );
  if (cut >= 0) t = t.slice(0, cut);
  return t.split('\n').filter((l) => !l.trim().startsWith('>')).join('\n')
    .replace(/\/entrar#t=[\w-]+/g, '/entrar')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000);
}

type Upload = { path: string; name: string; size: number; mime: string };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const body = await req.text();
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: settings } = await admin
    .from('app_settings').select('key, value')
    .in('key', ['resend_webhook_secret', 'resend_full_api_key']);
  const cfg: Record<string, string> = {};
  for (const s of settings ?? []) cfg[s.key] = (s.value ?? '').trim();
  if (!cfg.resend_webhook_secret || !cfg.resend_full_api_key) return json({ error: 'not configured' }, 503);

  if (!(await verifySignature(cfg.resend_webhook_secret, req, body))) return json({ error: 'invalid signature' }, 401);

  const event = JSON.parse(body);
  if (event?.type !== 'email.received') return json({ ignored: true });
  const emailId: string | undefined = event.data?.email_id;
  if (!emailId) return json({ error: 'no email_id' }, 400);

  const { data: seen } = await admin.from('inbound_emails').select('status').eq('email_id', emailId).maybeSingle();
  if (seen && seen.status !== 'error') return json({ skipped: true });

  let fromEmail = extractEmail(String(event.data?.from ?? ''));
  const subject = String(event.data?.subject ?? '').slice(0, 300);
  const record = (status: string, extra: Record<string, unknown> = {}) =>
    admin.from('inbound_emails').upsert({ email_id: emailId, from_email: fromEmail, subject, status, ...extra });

  try {
    const auth = { Authorization: `Bearer ${cfg.resend_full_api_key}` };
    const emailRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, { headers: auth });
    if (!emailRes.ok) throw new Error(`retrieve ${emailRes.status}`);
    const email = await emailRes.json();
    if (email.from) fromEmail = extractEmail(String(email.from));

    // Sem SPF/DKIM/DMARC válidos o remetente pode ser falso: não entra no cadastro de ninguém
    const a = email.authentication;
    const verified = !!a && (a.dmarc === 'pass' || (a.spf === 'pass' && a.dkim === 'pass'));
    if (!verified) {
      await record('unverified', { detail: JSON.stringify(a ?? null) });
      return json({ ok: true, status: 'unverified' });
    }

    const { data: profileId } = await admin.rpc('find_profile_id_by_email', { p_email: fromEmail });
    if (!profileId) {
      await record('no_match');
      return json({ ok: true, status: 'no_match' });
    }

    const uploads: Upload[] = [];
    const skipped: string[] = [];
    if (Array.isArray(email.attachments) && email.attachments.length > 0) {
      const listRes = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments?limit=100`, { headers: auth });
      if (!listRes.ok) throw new Error(`attachments ${listRes.status}`);
      const list = (await listRes.json()).data ?? [];

      for (const att of list) {
        const name = String(att.filename || 'anexo');
        const ext = (name.includes('.') ? name.split('.').pop()! : '').toLowerCase();
        let mime = String(att.content_type || '').toLowerCase().split(';')[0].trim();
        if (mime === 'image/jpg') mime = 'image/jpeg';
        if (!ACCEPTED.has(mime) && MIME_BY_EXT[ext]) mime = MIME_BY_EXT[ext];
        const size = Number(att.size ?? 0);

        if (!ACCEPTED.has(mime)) { skipped.push(name); continue; }
        if (att.content_disposition === 'inline' && mime.startsWith('image/') && size > 0 && size < MIN_INLINE_IMAGE) continue;
        if (size > MAX_SIZE) { skipped.push(name); continue; }

        const fileRes = await fetch(att.download_url);
        if (!fileRes.ok) throw new Error(`download ${fileRes.status}`);
        const bytes = new Uint8Array(await fileRes.arrayBuffer());
        if (bytes.length > MAX_SIZE) { skipped.push(name); continue; }

        const fileExt = ext || Object.keys(MIME_BY_EXT).find((k) => MIME_BY_EXT[k] === mime) || 'bin';
        const path = `${profileId}/${Date.now()}-${crypto.randomUUID().slice(0, 6)}.${fileExt}`;
        const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
        if (upErr) throw new Error(`upload ${upErr.message}`);
        uploads.push({ path, name, size: bytes.length, mime });
      }
    }

    const text = replyText(email.text ?? null, email.html ?? null);
    let intro = text ? `📧 ${text}` : '📧 Resposta por email';
    if (skipped.length) intro += `\n\n(Não deu pra importar: ${skipped.join(', ')} — use JPG, PNG, HEIC ou PDF de até 10 MB.)`;

    const base = { profile_id: profileId, sender_id: profileId, sender_role: 'user', kind: 'reply' };
    const rows = uploads.length === 0
      ? [{ ...base, content: intro }]
      : uploads.map((u, i) => ({
          ...base,
          content: i === 0 ? intro : `📎 ${u.name}`,
          attachment_path: u.path, attachment_name: u.name, attachment_size: u.size, attachment_mime: u.mime,
        }));
    const { error: insErr } = await admin.from('approval_messages').insert(rows);
    if (insErr) throw new Error(`insert ${insErr.message}`);

    await record('imported', { profile_id: profileId, attachments: uploads.length, detail: null });
    return json({ ok: true, status: 'imported', attachments: uploads.length });
  } catch (e) {
    await record('error', { detail: String(e).slice(0, 500) });
    return json({ error: 'processing failed' }, 500);
  }
});
