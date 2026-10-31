// Oficina → "Depositar na carteira" pela NextPay. Body: { workshop_id, amount, method: 'pix' | 'card' }.
// Reaproveita o depósito anterior em aberto se for do mesmo valor e método (e o PIX ainda não venceu).
// Quem credita o saldo é o nextpay-webhook (wallet_credit_deposit), nunca a tela da oficina.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cardTotal, nextpay, pixCode, walletRef, type NextpayCharge } from '../_shared/nextpay.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const r2 = (n: number) => Math.round(n * 100) / 100;
const MAX_DEPOSIT = 50_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: 'Faça login novamente.' }, 401);

    const { workshop_id, amount: rawAmount, method } = await req.json().catch(() => ({}));
    if (!workshop_id || (method !== 'pix' && method !== 'card')) return json({ error: 'Informe a oficina e a forma de pagamento.' }, 400);
    const { data: member } = await admin.rpc('is_workshop_member', { _workshop_id: workshop_id, _user_id: user.id });
    if (!member) return json({ error: 'Só a própria oficina pode depositar.' }, 403);

    const { data: settings } = await admin.from('app_settings').select('key, value').in('key', ['wallet_enabled', 'wallet_min_deposit']);
    const cfg = Object.fromEntries((settings ?? []).map(s => [s.key, s.value]));
    if (cfg.wallet_enabled !== 'true') return json({ error: 'A carteira ainda não está liberada.' }, 403);
    const min = Number(String(cfg.wallet_min_deposit ?? '50').replace(',', '.')) || 50;

    const amount = r2(Number(rawAmount));
    if (!Number.isFinite(amount) || amount < min) return json({ error: `O depósito mínimo é R$ ${min.toFixed(2).replace('.', ',')}.` }, 400);
    if (amount > MAX_DEPOSIT) return json({ error: 'Valor acima do limite por depósito.' }, 400);

    const total = method === 'card' ? await cardTotal(admin, amount) : amount;
    const cardFee = r2(total - amount);

    /* Reaproveita o último depósito igual em aberto */
    const { data: last } = await admin.from('workshop_wallet_deposits').select('*')
      .eq('workshop_id', workshop_id).eq('method', method).is('paid_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const fresh = last && Number(last.amount) === amount && Number(last.charged_amount) === total && last.charge_id
      && (method === 'card' || (last.expires_at && new Date(last.expires_at).getTime() - Date.now() > 2 * 60_000));
    if (fresh) {
      return json({ method, pix_code: last.pix_code, expires_at: last.expires_at, payment_url: last.payment_url, total, card_fee: cardFee });
    }

    const { data: row, error: insErr } = await admin.from('workshop_wallet_deposits').insert({
      workshop_id, method, amount, charged_amount: total, created_by: user.id,
    }).select('id').single();
    if (insErr || !row) return json({ error: 'Não foi possível registrar o depósito. Tente de novo.' }, 500);

    const { data: shop } = await admin.from('workshops').select('business_name').eq('id', workshop_id).maybeSingle();
    const createCustomer = (email: string | undefined, externalRef: string) =>
      nextpay<{ id: string }>(admin, 'POST', '/customers', { name: shop?.business_name ?? 'Oficina', email, externalRef });
    const cents = Math.round(total * 100);
    const createCharge = (customerId: string) => nextpay<NextpayCharge>(admin, 'POST', '/charges', {
      customerId,
      amount: cents,
      paymentMethod: method === 'pix' ? 'pix' : 'credit_card',
      installments: 1,
      items: [{ name: 'Crédito na carteira MecânicoApp', quantity: 1, unitAmount: cents }],
      externalRef: walletRef(row.id, method),
      metadata: { kind: 'wallet_deposit', deposit_id: row.id, workshop_id, method, amount, card_fee: cardFee },
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
    await admin.from('workshop_wallet_deposits').update({
      charge_id: charge.id, pix_code: code, payment_url: charge.paymentUrl ?? null, expires_at: expires,
    }).eq('id', row.id);

    return json({ method, pix_code: code, expires_at: expires, payment_url: charge.paymentUrl ?? null, total, card_fee: cardFee });
  } catch (e) {
    console.error('[wallet-deposit]', e);
    // Recusa da NextPay ("NextPay /charges: 400 CODE Motivo"): mostra o motivo, não um erro genérico
    const reason = /^NextPay [^:]+: 4\d\d\s+(?:[A-Z_]{3,}\s+)?(.+)$/.exec(String((e as Error)?.message ?? ''))?.[1]?.trim();
    if (reason) return json({ error: `A NextPay recusou o pagamento: ${reason}` }, 502);
    return json({ error: 'Não foi possível gerar o depósito agora. Tente de novo em instantes.' }, 500);
  }
});
