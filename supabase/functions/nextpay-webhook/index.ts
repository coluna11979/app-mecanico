// Recebe os avisos da NextPay (charge.*). Confere a assinatura x-webhook-signature
// (HMAC-SHA256 do corpo bruto com o segredo de Admin → Configurações → NextPay), grava em nextpay_webhook_events e,
// em charge.paid de uma demanda (externalRef job:<id>:<método>:…), marca a demanda como paga —
// mesmo campo do stripe-webhook (jobs.pix_paid_at), então o resto do fluxo não muda.
// Multa de cancelamento (externalRef fee:<nextpay_fee_charges.id>:…): marca cancellation_fee_paid_at
// nas multas daquela cobrança.
// Depósito na carteira (externalRef wallet:<workshop_wallet_deposits.id>:…): credita o saldo da oficina.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { nextpay, nextpayConfig, parseFeeRef, parseJobRef, parseWalletRef, type NextpayCharge } from '../_shared/nextpay.ts';

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

const r2 = (n: number) => Math.round(n * 100) / 100;

async function markJobPaid(admin: SupabaseClient, data: NextpayCharge) {
  // externalRef da cobrança; metadata como reserva
  const meta = data.metadata ?? {};
  const ref = parseJobRef(data.externalRef) ?? parseJobRef(`job:${meta.job_id ?? ''}:${meta.method ?? ''}:`);
  if (!ref || !data.id) return;
  // Confirma na própria API antes de liberar o serviço
  const charge = await nextpay<NextpayCharge | null>(admin, 'GET', `/charges/${data.id}`);
  if (!charge || charge.status !== 'paid') return;

  const { data: job } = await admin.from('jobs').select('id, price_per_hour, max_hours').eq('id', ref.jobId).maybeSingle();
  if (!job) return;
  const service = r2(Number(job.price_per_hour ?? 0) * Number(job.max_hours ?? 1));
  const paid = r2(Number(charge.paidAmount ?? charge.amount ?? 0) / 100);
  await admin.from('jobs').update({
    pix_paid_at: charge.paidAt ?? new Date().toISOString(),
    payment_gateway: 'nextpay',
    payment_method: ref.method,
    paid_amount: paid,
    card_fee_amount: ref.method === 'card' ? Math.max(0, r2(paid - service)) : 0,
    nextpay_charge_id: charge.id,
  }).eq('id', job.id).eq('status', 'assigned').is('pix_paid_at', null);
}

async function markFeesPaid(admin: SupabaseClient, data: NextpayCharge) {
  const meta = data.metadata ?? {};
  const ref = parseFeeRef(data.externalRef) ?? parseFeeRef(`fee:${meta.fee_charge_id ?? ''}:${meta.method ?? ''}:`);
  if (!ref || !data.id) return;
  const charge = await nextpay<NextpayCharge | null>(admin, 'GET', `/charges/${data.id}`);
  if (!charge || charge.status !== 'paid') return;

  const { data: row } = await admin.from('nextpay_fee_charges').select('id, job_ids, paid_at').eq('id', ref.rowId).maybeSingle();
  if (!row || row.paid_at) return;
  const paidAt = charge.paidAt ?? new Date().toISOString();
  await admin.from('jobs').update({ cancellation_fee_paid_at: paidAt })
    .in('id', row.job_ids).is('cancellation_fee_paid_at', null);
  await admin.from('nextpay_fee_charges').update({ paid_at: paidAt, charge_id: charge.id }).eq('id', row.id);
}

async function creditWallet(admin: SupabaseClient, data: NextpayCharge) {
  const meta = data.metadata ?? {};
  const ref = parseWalletRef(data.externalRef) ?? parseWalletRef(`wallet:${meta.deposit_id ?? ''}:${meta.method ?? ''}:`);
  if (!ref || !data.id) return;
  const charge = await nextpay<NextpayCharge | null>(admin, 'GET', `/charges/${data.id}`);
  if (!charge || charge.status !== 'paid') return;
  const { error } = await admin.rpc('wallet_credit_deposit', {
    p_deposit_id: ref.depositId, p_charge_id: charge.id, p_paid_at: charge.paidAt ?? new Date().toISOString(),
  });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const raw = await req.text();
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const secret = (await nextpayConfig(admin)).webhookSecret;
  const got = (req.headers.get('x-webhook-signature') ?? '').toLowerCase();
  const signatureOk = !!secret && !!got && sameHex(await hmacHex(secret, raw), got);

  let payload: { event?: string; data?: NextpayCharge } = {};
  try { payload = JSON.parse(raw); } catch { /* corpo inválido: registra assim mesmo */ }
  const d = payload.data;

  const { error } = await admin.from('nextpay_webhook_events').insert({
    event: payload.event ?? null,
    charge_id: d?.id ?? null,
    status: d?.status ?? null,
    paid_at: d?.paidAt ?? null,
    signature_ok: signatureOk,
    payload: signatureOk ? payload : null, // sem assinatura válida não guarda o conteúdo
  });
  if (error) return json({ error: error.message }, 500); // 5xx: a NextPay reenvia
  if (!signatureOk) return json({ error: 'invalid signature' }, 401);

  if (payload.event === 'charge.paid' && d) {
    try {
      if (parseWalletRef(d.externalRef) || d.metadata?.kind === 'wallet_deposit') await creditWallet(admin, d);
      else if (parseFeeRef(d.externalRef) || d.metadata?.kind === 'cancellation_fee') await markFeesPaid(admin, d);
      else await markJobPaid(admin, d);
    }
    catch (e) { console.error('[nextpay-webhook] marcar pago', e); return json({ error: 'retry' }, 500); }
  }
  return json({ received: true });
});
