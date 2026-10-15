// Cliente mínimo da NextPay External Checkout API (valores sempre em centavos).
// Credenciais: secrets NEXTPAY_API_KEY / NEXTPAY_API_SECRET / NEXTPAY_API_URL.

const BASE = () => (Deno.env.get('NEXTPAY_API_URL') ?? 'https://api.nextgopay.com').replace(/\/$/, '');

let cached: { token: string; exp: number } | null = null;

/** JWT da sessão (vale 30 min) — reaproveitado enquanto faltar mais de 1 min */
async function token(): Promise<string> {
  if (cached && cached.exp - Date.now() > 60_000) return cached.token;
  const basic = btoa(`${Deno.env.get('NEXTPAY_API_KEY') ?? ''}:${Deno.env.get('NEXTPAY_API_SECRET') ?? ''}`);
  const r = await fetch(`${BASE()}/external-checkout/sessions`, { method: 'POST', headers: { Authorization: `Basic ${basic}` } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.token) throw new Error(`NextPay: sessão recusada (${r.status} ${d.code ?? ''})`);
  cached = { token: d.token, exp: d.expiresAt ? new Date(d.expiresAt).getTime() : Date.now() + 25 * 60_000 };
  return d.token;
}

export async function nextpay<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${BASE()}/external-checkout${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`NextPay ${path}: ${r.status} ${d?.code ?? ''} ${d?.message ?? ''}`.trim());
  return d as T;
}

export type NextpayCharge = {
  id: string | null; orderId?: string; status: string; amount: number; paidAmount?: number;
  paymentMethod: 'pix' | 'credit_card' | 'boleto';
  pix?: { qrcode?: string; qrCode?: string; qrCodeUrl?: string; expiresAt?: string } | null;
  paymentUrl?: string | null; paidAt?: string | null; externalRef?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** A API devolve `qrcode`; a documentação diz `qrCode` — aceita os dois */
export const pixCode = (c: NextpayCharge) => c.pix?.qrcode ?? c.pix?.qrCode ?? null;

/** externalRef das cobranças de demanda: job:<id>:<pix|card>:<ts> */
export const jobRef = (jobId: string, method: 'pix' | 'card') => `job:${jobId}:${method}:${Date.now()}`;
export function parseJobRef(ref: string | null | undefined) {
  const m = /^job:([0-9a-f-]{36}):(pix|card):/.exec(ref ?? '');
  return m ? { jobId: m[1], method: m[2] as 'pix' | 'card' } : null;
}
