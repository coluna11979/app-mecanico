import { supabase } from './supabase';

/**
 * Atribuição de marketing: guarda no navegador de onde a pessoa veio
 * (link de campanha /c/<slug>, ?utm_* ou ?cupom=) e, quando ela se cadastra,
 * grava isso em marketing_attributions. Vale 30 dias; a primeira origem ganha
 * (um ?utm novo não apaga uma campanha já registrada).
 */

const KEY = 'mkt_attr';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface Attribution {
  campaign_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  coupon?: string | null;
  landing_path?: string | null;
  at: number;
}

export function getAttribution(): Attribution | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Attribution;
    if (!a.at || Date.now() - a.at > TTL_MS) { localStorage.removeItem(KEY); return null; }
    return a;
  } catch { return null; }
}

function save(patch: Partial<Attribution>, overwrite = false) {
  try {
    const cur = getAttribution();
    const hasOrigin = !!(cur?.campaign_id || cur?.utm_source);
    const next: Attribution = overwrite || !hasOrigin
      ? { ...cur, ...patch, at: Date.now() }
      // Já tem origem: só completa o cupom, se veio um agora
      : { ...cur!, coupon: patch.coupon ?? cur!.coupon };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* storage bloqueado: segue sem atribuição */ }
}

/** Lê ?utm_* e ?cupom= da URL atual. Chamado uma vez ao abrir o app. */
export function captureFromUrl() {
  try {
    const p = new URLSearchParams(window.location.search);
    const src = p.get('utm_source');
    const coupon = (p.get('cupom') || p.get('coupon') || '').trim().toUpperCase() || null;
    if (src) {
      save({
        utm_source: src.slice(0, 80),
        utm_medium: p.get('utm_medium')?.slice(0, 80) ?? null,
        utm_campaign: p.get('utm_campaign')?.slice(0, 120) ?? null,
        landing_path: window.location.pathname,
        coupon,
      });
    } else if (coupon) {
      save({ coupon });
    }
  } catch { /* ignore */ }
}

/** Link curto de campanha: registra o clique e guarda a campanha. Retorna o destino. */
export async function trackCampaignClick(slug: string): Promise<string> {
  let visitor = '';
  try {
    visitor = localStorage.getItem('mkt_visitor') || '';
    if (!visitor) { visitor = crypto.randomUUID(); localStorage.setItem('mkt_visitor', visitor); }
  } catch { /* ignore */ }

  const { data } = await supabase.rpc('track_campaign_click', {
    p_slug: slug,
    p_visitor: visitor || null,
    p_referrer: document.referrer || null,
    p_user_agent: navigator.userAgent,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return '/';

  // Link de campanha é intencional: sobrescreve uma origem anterior
  save({
    campaign_id: row.campaign_id,
    utm_source: row.utm_source,
    utm_medium: row.utm_medium,
    utm_campaign: row.slug,
    landing_path: row.destination,
  }, true);

  const sep = row.destination.includes('?') ? '&' : '?';
  return `${row.destination}${sep}utm_source=${encodeURIComponent(row.utm_source)}&utm_medium=${encodeURIComponent(row.utm_medium)}&utm_campaign=${encodeURIComponent(row.slug)}`;
}

/** Campos de origem pra gravar junto com um lead. */
export function leadAttributionFields() {
  const a = getAttribution();
  if (!a) return {};
  return {
    campaign_id: a.campaign_id ?? null,
    utm_source: a.utm_source ?? null,
    utm_medium: a.utm_medium ?? null,
    utm_campaign: a.utm_campaign ?? null,
  };
}

export interface CouponInfo { id: string; code: string; description: string }

/** Confere se o cupom vale pra esse público. null = inválido/esgotado/vencido. */
export async function validateCoupon(code: string, audience: 'mechanic' | 'workshop'): Promise<CouponInfo | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const { data } = await supabase.rpc('validate_coupon', { p_code: clean, p_audience: audience });
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as CouponInfo | null;
}

/** Depois do signUp: grava origem + cupom do novo cadastro. Silencioso se falhar. */
export async function attributeSignup(profileId: string, coupon?: string | null) {
  const a = getAttribution();
  const code = (coupon ?? a?.coupon ?? '').trim().toUpperCase() || null;
  if (!a?.campaign_id && !a?.utm_source && !code) return;
  try {
    await supabase.rpc('attribute_signup', {
      p_profile_id: profileId,
      p_campaign_id: a?.campaign_id ?? null,
      p_coupon_code: code,
      p_utm_source: a?.utm_source ?? null,
      p_utm_medium: a?.utm_medium ?? null,
      p_utm_campaign: a?.utm_campaign ?? null,
      p_landing_path: a?.landing_path ?? null,
    });
    localStorage.removeItem(KEY);
  } catch (e) {
    console.warn('[marketing] attribute_signup falhou', e);
  }
}
