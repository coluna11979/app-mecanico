// Oficina → "Pagar multa de cancelamento" pela NextPay. Body: { workshop_id, method: 'pix' | 'card' }.
// Cobra a soma das multas em aberto (workshop_pending_fees). Reaproveita a cobrança anterior se for
// das mesmas multas, mesmo método e mesmo valor (e o PIX ainda não venceu) — evita a oficina pagar duas vezes.
// Quem marca as multas como pagas é o nextpay-webhook.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cardTotal, feeRef, nextpay, pixCode, type NextpayCharge } from '../_shared/nextpay.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const r2 = (n: number) => Math.round(n * 100) / 100;
const sameIds = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: 'Faça login novamente.' }, 401);

    const { workshop_id, method } = await req.json().catch(() => ({}));
    if (!workshop_id || (method !== 'pix' && method !== 'card')) return json({ error: 'Informe a oficina e a forma de pagamento.' }, 400);
    const { data: member } = await admin.rpc('is_workshop_member', { _workshop_id: workshop_id, _user_id: user.id });
    if (!member) return json({ error: 'Só a própria oficina pode pagar a multa.' }, 403);

    const { data: rows } = await admin.rpc('workshop_pending_fees', { target_workshop_id: workshop_id });
    const pending = rows?.[0] ?? { total: 0, job_ids: [] };
    const service = r2(Number(pending.total ?? 0));
    const jobIds: string[] = pending.job_ids ?? [];
    if (service <= 0 || !jobIds.length) return json({ error: 'Não há multa em aberto.', paid: true }, 409);

    const total = method === 'card' ? await cardTotal(admin, service) : service;
    const cardFee = r2(total - service);

    /* Reaproveita a última cobrança das mesmas multas */
    const { data: last } = await admin.from('nextpay_fee_charges').select('*')
      .eq('workshop_id', workshop_id).eq('method', method).is('paid_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const fresh = last && sameIds(last.job_ids, jobIds) && Number(last.amount) === total
      && (method === 'card' || (last.expires_at && new Date(last.expires_at).getTime() - Date.now() > 2 * 60_000));
    if (fresh) {
      return json({ method, pix_code: last.pix_code, expires_at: last.expires_at, payment_url: last.payment_url, total, card_fee: cardFee });
    }

    const { data: row, error: insErr } = await admin.from('nextpay_fee_charges').insert({
      workshop_id, method, service_amount: service, amount: total, job_ids: jobIds,
    }).select('id').single();
    if (insErr || !row) return json({ error: 'Não foi possível registrar a cobrança. Tente de novo.' }, 500);

    const { data: shop } = await admin.from('workshops').select('business_name').eq('id', workshop_id).maybeSingle();
    const createCustomer = (email: string | undefined, externalRef: string) =>
      nextpay<{ id: string }>(admin, 'POST', '/customers', { name: shop?.business_name ?? 'Oficina', email, externalRef });
    const cents = Math.round(total * 100);
    const count = jobIds.length;
    const createCharge = (customerId: string) => nextpay<NextpayCharge>(admin, 'POST', '/charges', {
      customerId,
      amount: cents,
      paymentMethod: method === 'pix' ? 'pix' : 'credit_card',
      installments: 1,
      items: [{ name: count === 1 ? 'Multa de cancelamento' : `Multas de cancelamento (${count})`, quantity: 1, unitAmount: cents }],
      externalRef: feeRef(row.id, method),
      metadata: { kind: 'cancellation_fee', fee_charge_id: row.id, workshop_id, method },
    });

    let charge: NextpayCharge;
    try {
      charge = await createCharge((await createCustomer(user.email, `workshop:${workshop_id}`)).id);
    } catch (e) {
      if (!/pagar para voc[êe] mesmo/i.test(String((e as Error)?.message))) throw e;
      // Mesmo e-mail da conta dona da NextPay (ex.: loja do próprio dono): e-mail só da oficina (igual ao nextpay-charge)
      const own = `pagamentos.oficina.${String(workshop_id).slice(0, 8)}@mecanicoapp.com.br`;
      charge = await createCharge((await createCustomer(own, `workshop:${workshop_id}:own`)).id);
    }

    const code = method === 'pix' ? pixCode(charge) : null;
    if (method === 'pix' && !code) return json({ error: 'A NextPay não devolveu o código PIX. Tente de novo.' }, 502);
    if (!charge.paymentUrl && method === 'card') return json({ error: 'A NextPay não devolveu o link do cartão. Tente de novo.' }, 502);
    const expires = charge.pix?.expiresAt ?? null;
    await admin.from('nextpay_fee_charges').update({
      charge_id: charge.id, pix_code: code, payment_url: charge.paymentUrl ?? null, expires_at: expires,
    }).eq('id', row.id);

    return json({ method, pix_code: code, expires_at: expires, payment_url: charge.paymentUrl ?? null, total, card_fee: cardFee });
  } catch (e) {
    console.error('[nextpay-fee-charge]', e);
    // Recusa da NextPay ("NextPay /charges: 400 CODE Motivo"): mostra o motivo, não um erro genérico
    const reason = /^NextPay [^:]+: 4dds+(?:[A-Z_]{3,}s+)?(.+)$/.exec(String((e as Error)?.message ?? ''))?.[1]?.trim();
    if (reason) return json({ error: `A NextPay recusou o pagamento: ${reason}` }, 502);
    return json({ error: 'Não foi possível gerar o pagamento agora. Tente de novo em instantes.' }, 500);
  }
});
