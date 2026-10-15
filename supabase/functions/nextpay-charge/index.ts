// Oficina → "Pagar o serviço" pela NextPay. Body: { job_id, method: 'pix' | 'card' }.
// PIX: devolve o copia-e-cola (reaproveita o que ainda não venceu).
// Cartão: devolve o link do checkout hospedado (o cartão nunca passa por aqui).
// Valor = valor/hora × horas; com card_fee_passthrough ligado, soma a taxa do cartão (÷ (1 − taxa)).
// Quem marca como pago é o nextpay-webhook.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { jobRef, nextpay, pixCode, type NextpayCharge } from '../_shared/nextpay.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const r2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: 'Faça login novamente.' }, 401);

    const { job_id, method } = await req.json().catch(() => ({}));
    if (!job_id || (method !== 'pix' && method !== 'card')) return json({ error: 'Informe a demanda e a forma de pagamento.' }, 400);

    const { data: job } = await admin.from('jobs').select('*').eq('id', job_id).maybeSingle();
    if (!job) return json({ error: 'Demanda não encontrada.' }, 404);
    const { data: member } = await admin.rpc('is_workshop_member', { _workshop_id: job.workshop_id, _user_id: user.id });
    if (!member) return json({ error: 'Só a oficina da demanda pode pagar.' }, 403);
    if (job.pix_paid_at) return json({ error: 'Esta demanda já foi paga.', paid: true }, 409);
    if (job.status !== 'assigned') return json({ error: 'Esta demanda não está aguardando pagamento.' }, 409);

    const service = r2(Number(job.price_per_hour ?? 0) * Number(job.max_hours ?? 1));
    if (service < 1) return json({ error: 'Valor do serviço inválido (mínimo R$ 1).' }, 400);

    const { data: settings } = await admin.from('app_settings').select('key, value')
      .in('key', ['card_fee_passthrough', 'card_fee_percent']);
    const cfg = Object.fromEntries((settings ?? []).map(s => [s.key, s.value]));
    const pct = Number(String(cfg.card_fee_percent ?? '4.20').replace(',', '.')) || 0;
    const passthrough = cfg.card_fee_passthrough === 'true' && pct > 0 && pct < 50;
    const total = method === 'card' && passthrough ? r2(service / (1 - pct / 100)) : service;
    const cardFee = r2(total - service);

    /* Reaproveita o que já foi gerado */
    if (method === 'pix' && job.nextpay_pix_code && job.nextpay_pix_expires_at
      && new Date(job.nextpay_pix_expires_at).getTime() - Date.now() > 2 * 60_000) {
      return json({ method, pix_code: job.nextpay_pix_code, expires_at: job.nextpay_pix_expires_at, payment_url: job.nextpay_pix_url, total: service, card_fee: 0 });
    }
    if (method === 'card' && job.nextpay_card_url && Number(job.nextpay_card_amount) === total) {
      return json({ method, payment_url: job.nextpay_card_url, total, card_fee: cardFee });
    }

    /* Cliente = a oficina (upsert pelo e-mail de quem está pagando) */
    const { data: shop } = await admin.from('workshops').select('id, business_name').eq('id', job.workshop_id).maybeSingle();
    const customer = await nextpay<{ id: string }>('POST', '/customers', {
      name: shop?.business_name ?? 'Oficina',
      email: user.email,
      externalRef: `workshop:${job.workshop_id}`,
    });

    const cents = Math.round(total * 100);
    const charge = await nextpay<NextpayCharge>('POST', '/charges', {
      customerId: customer.id,
      amount: cents,
      paymentMethod: method === 'pix' ? 'pix' : 'credit_card',
      installments: 1,
      items: [{ name: String(job.title ?? 'Serviço').slice(0, 100), quantity: 1, unitAmount: cents }],
      externalRef: jobRef(job.id, method),
      metadata: { job_id: job.id, method, service_amount: service, card_fee: cardFee },
    });

    if (method === 'pix') {
      const code = pixCode(charge);
      if (!code) return json({ error: 'A NextPay não devolveu o código PIX. Tente de novo.' }, 502);
      const expires = charge.pix?.expiresAt ?? null;
      await admin.from('jobs').update({
        nextpay_pix_charge_id: charge.id, nextpay_pix_code: code, nextpay_pix_expires_at: expires, nextpay_pix_url: charge.paymentUrl ?? null,
      }).eq('id', job.id);
      return json({ method, pix_code: code, expires_at: expires, payment_url: charge.paymentUrl ?? null, total: service, card_fee: 0 });
    }

    if (!charge.paymentUrl) return json({ error: 'A NextPay não devolveu o link do cartão. Tente de novo.' }, 502);
    await admin.from('jobs').update({ nextpay_card_url: charge.paymentUrl, nextpay_card_amount: total }).eq('id', job.id);
    return json({ method, payment_url: charge.paymentUrl, total, card_fee: cardFee });
  } catch (e) {
    console.error('[nextpay-charge]', e);
    return json({ error: 'Não foi possível gerar o pagamento agora. Tente de novo em instantes.' }, 500);
  }
});
