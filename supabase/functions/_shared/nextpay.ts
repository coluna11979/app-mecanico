// Cliente mínimo da NextPay External Checkout API (valores sempre em centavos).
// Credenciais: Admin → Configurações → NextPay (app_settings nextpay_*), lidas com service role.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

type Config = { url: string; key: string; secret: string; webhookSecret: string };

let cfgCache: { cfg: Config; at: number } | null = null;
let tokenCache: { token: string; exp: number; key: string } | null = null;

/** Lê as credenciais do admin (cache de 1 min, para uma troca no painel valer logo) */
export async function nextpayConfig(admin: SupabaseClient): Promise<Config> {
  if (cfgCache && Date.now() - cfgCache.at < 60_000) return cfgCache.cfg;
  const { data } = await admin.from('app_settings').select('key, value').like('key', 'nextpay_%');
  const m = Object.fromEntries((data ?? []).map(s => [s.key, String(s.value ?? '').trim()]));
  const cfg: Config = {
    url: (m.nextpay_api_url || 'https://api.nextgopay.com').replace(/\/$/, ''),
    key: m.nextpay_api_key ?? '',
    secret: m.nextpay_api_secret ?? '',
    webhookSecret: m.nextpay_webhook_secret ?? '',
  };
  cfgCache = { cfg, at: Date.now() };
  return cfg;
}

/** JWT da sessão (vale 30 min) — reaproveitado enquanto faltar mais de 1 min */
async function token(cfg: Config): Promise<string> {
  if (tokenCache && tokenCache.key === cfg.key && tokenCache.exp - Date.now() > 60_000) return tokenCache.token;
  if (!cfg.key || !cfg.secret) throw new Error('NextPay: preencha a API Key e o API Secret em Admin → Configurações → NextPay');
  const r = await fetch(`${cfg.url}/external-checkout/sessions`, {
    method: 'POST', headers: { Authorization: `Basic ${btoa(`${cfg.key}:${cfg.secret}`)}` },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.token) throw new Error(`NextPay: sessão recusada (${r.status} ${d.code ?? ''})`);
  tokenCache = { token: d.token, key: cfg.key, exp: d.expiresAt ? new Date(d.expiresAt).getTime() : Date.now() + 25 * 60_000 };
  return d.token;
}

export async function nextpay<T = Record<string, unknown>>(admin: SupabaseClient, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const cfg = await nextpayConfig(admin);
  const r = await fetch(`${cfg.url}/external-checkout${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token(cfg)}`, 'Content-Type': 'application/json' },
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
/** externalRef das cobranças de multa: fee:<id em nextpay_fee_charges>:<pix|card>:<ts> */
export const feeRef = (rowId: string, method: 'pix' | 'card') => `fee:${rowId}:${method}:${Date.now()}`;
export function parseFeeRef(ref: string | null | undefined) {
  const m = /^fee:([0-9a-f-]{36}):(pix|card):/.exec(ref ?? '');
  return m ? { rowId: m[1], method: m[2] as 'pix' | 'card' } : null;
}

/** externalRef dos depósitos na carteira: wallet:<id em workshop_wallet_deposits>:<pix|card>:<ts> */
export const walletRef = (depositId: string, method: 'pix' | 'card') => `wallet:${depositId}:${method}:${Date.now()}`;
export function parseWalletRef(ref: string | null | undefined) {
  const m = /^wallet:([0-9a-f-]{36}):(pix|card):/.exec(ref ?? '');
  return m ? { depositId: m[1], method: m[2] as 'pix' | 'card' } : null;
}

/** Valor no cartão com a taxa repassada: total ÷ (1 − taxa), quando card_fee_passthrough está ligado */
export async function cardTotal(admin: SupabaseClient, base: number): Promise<number> {
  const { data } = await admin.from('app_settings').select('key, value').in('key', ['card_fee_passthrough', 'card_fee_percent']);
  const cfg = Object.fromEntries((data ?? []).map(s => [s.key, s.value]));
  const pct = Number(String(cfg.card_fee_percent ?? '4.20').replace(',', '.')) || 0;
  const on = cfg.card_fee_passthrough === 'true' && pct > 0 && pct < 50;
  return on ? Math.round((base / (1 - pct / 100)) * 100) / 100 : base;
}

export function parseJobRef(ref: string | null | undefined) {
  const m = /^job:([0-9a-f-]{36}):(pix|card):/.exec(ref ?? '');
  return m ? { jobId: m[1], method: m[2] as 'pix' | 'card' } : null;
}
