// Recebe os avisos da NextPay (charge.*). Confere a assinatura x-webhook-signature
// (HMAC-SHA256 do corpo bruto com NEXTPAY_WEBHOOK_SECRET) e grava em nextpay_webhook_events.
// Fase de teste: só registra — ainda não marca demanda como paga.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function hmacHex(secret: string, raw: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Comparação em tempo constante */
function sameHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const raw = await req.text();
  const secret = Deno.env.get('NEXTPAY_WEBHOOK_SECRET') ?? '';
  const got = (req.headers.get('x-webhook-signature') ?? '').toLowerCase();
  const signatureOk = !!secret && !!got && sameHex(await hmacHex(secret, raw), got);

  let payload: { event?: string; data?: Record<string, unknown> } = {};
  try { payload = JSON.parse(raw); } catch { /* corpo inválido: registra assim mesmo */ }
  const d = payload.data ?? {};

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await admin.from('nextpay_webhook_events').insert({
    event: payload.event ?? null,
    charge_id: (d.id as string) ?? null,
    status: (d.status as string) ?? null,
    paid_at: (d.paidAt as string) ?? null,
    signature_ok: signatureOk,
    payload: signatureOk ? payload : null, // sem assinatura válida não guarda o conteúdo
  });
  if (error) return json({ error: error.message }, 500); // 5xx: a NextPay reenvia

  if (!signatureOk) return json({ error: 'invalid signature' }, 401);
  return json({ received: true });
});
