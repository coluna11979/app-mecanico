/**
 * Inteligência de clientes: perfil, previsão de volta e "dinheiro na mesa".
 * Tudo calculado sobre o histórico que já existe — são ESTIMATIVAS, não dinheiro garantido.
 *
 * Dinheiro na mesa de um cliente (conservador) =
 *   orçamentos recusados nos últimos 6 meses (sem serviço depois)
 * + serviços recomendados no último ano e não feitos (≈ 1 visita típica)
 * + troca de óleo vencida há até 1 ano (≈ ticket de troca de óleo da oficina)
 * + 1 visita típica, se está em risco ou sumido há até 18 meses
 * Visita típica = ticket médio do cliente, limitado a 1,5× o ticket da oficina.
 */

const DAY = 86400000;
const OIL = new Set(['Troca de óleo', 'Revisão geral']);
const OPEN = new Set(['open', 'awaiting_approval', 'approved', 'in_progress']);

export type InsOs = {
  id: string; customer_id: string | null; vehicle_id: string | null; category: string | null;
  status: string; quote_status: string | null; price: number; created_at: string; completed_at: string | null;
  rework_of_id: string | null;
  // só na ficha
  km_reading?: number | null; workshop_mechanic_id?: string | null;
  approval_requested_at?: string | null; approved_at?: string | null; approval_channel?: string | null; title?: string;
};
export type InsRec = { id: string; customer_id: string; vehicle_id: string | null; description: string; recommended_at: string };

export type Segment = 'lead' | 'new' | 'loyal' | 'regular' | 'risk' | 'gone';
export const SEGMENTS: Record<Segment, { label: string; icon: string; cls: string; hint: string }> = {
  lead:    { label: 'Sem serviço',  icon: '·',  cls: 'bg-steel-100 text-steel-500',    hint: 'Cadastrado, ainda não fez serviço' },
  new:     { label: 'Novo',         icon: '🆕', cls: 'bg-brand-100 text-brand-800',    hint: 'Primeira visita nos últimos 60 dias' },
  loyal:   { label: 'Fiel',         icon: '💚', cls: 'bg-signal-100 text-signal-800',  hint: '3 visitas ou mais e voltando no ritmo' },
  regular: { label: 'Em dia',       icon: '✓',  cls: 'bg-signal-50 text-signal-700',   hint: 'Voltando no ritmo normal' },
  risk:    { label: 'Em risco',     icon: '⚠️', cls: 'bg-pending-100 text-pending-800', hint: 'Passou do tempo que costuma voltar' },
  gone:    { label: 'Sumido',       icon: '😴', cls: 'bg-alert-50 text-alert-700',     hint: 'Mais de 6 meses sem vir' },
};

export type Opportunity = { total: number; parts: { key: string; label: string; value: number }[] };

export type CustomerInsight = {
  visits: number; spent: number; avgTicket: number;
  firstVisit: string | null; lastVisit: string | null;
  avgIntervalDays: number | null; nextExpected: string | null; overdueDays: number;
  perYear: number;
  segment: Segment; vip: boolean;
  openOs: number;
  opportunity: Opportunity;
  lastOil: string | null;
};

export type ShopContext = { shopTicket: number; oilTicket: number; vipThreshold: number };

const isSale = (o: InsOs) => o.status === 'completed' && !o.quote_status && !o.rework_of_id;
const when = (o: InsOs) => o.completed_at ?? o.created_at;

/** Ticket médio da oficina, ticket de troca de óleo e o corte dos 20% que mais gastam */
export function shopContext(os: InsOs[], spentByCustomer: number[]): ShopContext {
  const sales = os.filter(isSale);
  const avg = (xs: InsOs[]) => (xs.length ? xs.reduce((a, o) => a + Number(o.price), 0) / xs.length : 0);
  const sorted = spentByCustomer.filter(x => x > 0).sort((a, b) => b - a);
  const cut = sorted.length >= 5 ? sorted[Math.max(0, Math.ceil(sorted.length * 0.2) - 1)] : Infinity;
  return { shopTicket: avg(sales), oilTicket: avg(sales.filter(o => OIL.has(o.category ?? ''))) || avg(sales), vipThreshold: cut };
}

/** Perfil e oportunidade de UM cliente (OS e recomendações só dele) */
export function customerInsight(os: InsOs[], recs: InsRec[], ctx: ShopContext, now = Date.now()): CustomerInsight {
  const sales = os.filter(isSale).sort((a, b) => when(a).localeCompare(when(b)));
  const visits = sales.length;
  const spent = sales.reduce((a, o) => a + Number(o.price), 0);
  const avgTicket = visits ? spent / visits : ctx.shopTicket;
  const firstVisit = visits ? when(sales[0]) : null;
  const lastVisit = visits ? when(sales[visits - 1]) : null;

  // Ritmo: intervalo médio entre visitas (ignora voltas em menos de 7 dias — mesmo problema)
  const gaps: number[] = [];
  for (let i = 1; i < sales.length; i++) {
    const g = (new Date(when(sales[i])).getTime() - new Date(when(sales[i - 1])).getTime()) / DAY;
    if (g >= 7) gaps.push(g);
  }
  const avgIntervalDays = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
  const sinceLast = lastVisit ? (now - new Date(lastVisit).getTime()) / DAY : Infinity;
  const nextExpected = lastVisit && avgIntervalDays ? new Date(new Date(lastVisit).getTime() + avgIntervalDays * DAY).toISOString() : null;
  const overdueDays = nextExpected ? Math.max(0, Math.round((now - new Date(nextExpected).getTime()) / DAY)) : 0;

  const years = firstVisit ? Math.max(1, (now - new Date(firstVisit).getTime()) / (365 * DAY)) : 1;
  const perYear = spent / years;

  let segment: Segment;
  if (!visits) segment = 'lead';
  else if (sinceLast > 182) segment = 'gone';
  else if (firstVisit && (now - new Date(firstVisit).getTime()) / DAY <= 60) segment = 'new';
  else if (avgIntervalDays && sinceLast > avgIntervalDays * 1.3 + 15) segment = 'risk';
  else if (visits >= 3) segment = 'loyal';
  else segment = 'regular';

  // Dinheiro na mesa — conservador: uma visita típica (ticket do cliente, limitado a 1,5× o da oficina,
  // para um serviço grande isolado não inflar a conta) e só o que ainda é recuperável.
  const typical = Math.min(avgTicket, ctx.shopTicket * 1.5);
  const parts: Opportunity['parts'] = [];
  const declined = os.filter(o => o.quote_status === 'declined' && (now - new Date(o.created_at).getTime()) / DAY <= 182
    && !sales.some(s => when(s) > o.created_at));
  const declinedValue = declined.reduce((a, o) => a + Number(o.price), 0);
  if (declinedValue > 0) parts.push({ key: 'declined', label: `${declined.length} orçamento${declined.length > 1 ? 's' : ''} não aprovado${declined.length > 1 ? 's' : ''}`, value: declinedValue });
  const recentRecs = recs.filter(r => (now - new Date(r.recommended_at).getTime()) / DAY <= 365);
  if (recentRecs.length) parts.push({ key: 'recs', label: `${recentRecs.length} serviço${recentRecs.length > 1 ? 's' : ''} recomendado${recentRecs.length > 1 ? 's' : ''}`, value: typical });
  const lastOilOs = [...sales].reverse().find(o => OIL.has(o.category ?? ''));
  const lastOil = lastOilOs ? when(lastOilOs) : null;
  const oilAge = lastOil ? (now - new Date(lastOil).getTime()) / DAY : Infinity;
  if (oilAge > 150 && oilAge <= 365 && segment !== 'gone') parts.push({ key: 'oil', label: 'troca de óleo vencida', value: ctx.oilTicket });
  // Volta: em risco, ou sumido há até 18 meses (depois disso consideramos perdido)
  if (segment === 'risk' || (segment === 'gone' && sinceLast <= 548)) parts.push({ key: 'return', label: 'uma visita de volta', value: typical });

  return {
    visits, spent, avgTicket, firstVisit, lastVisit, avgIntervalDays, nextExpected, overdueDays, perYear,
    segment, vip: visits > 0 && spent >= ctx.vipThreshold && segment !== 'gone',
    openOs: os.filter(o => OPEN.has(o.status)).length,
    opportunity: { total: Math.round(parts.reduce((a, p) => a + p.value, 0)), parts },
    lastOil,
  };
}

/** Insights da base inteira + números do topo da lista */
export function baseInsights(customerIds: string[], os: InsOs[], recs: InsRec[], now = Date.now()) {
  const osBy = new Map<string, InsOs[]>();
  for (const o of os) if (o.customer_id) osBy.set(o.customer_id, [...(osBy.get(o.customer_id) ?? []), o]);
  const recBy = new Map<string, InsRec[]>();
  for (const r of recs) recBy.set(r.customer_id, [...(recBy.get(r.customer_id) ?? []), r]);
  const spentOf = (id: string) => (osBy.get(id) ?? []).filter(isSale).reduce((a, o) => a + Number(o.price), 0);
  const ctx = shopContext(os, customerIds.map(spentOf));

  const map = new Map<string, CustomerInsight>();
  for (const id of customerIds) map.set(id, customerInsight(osBy.get(id) ?? [], recBy.get(id) ?? [], ctx, now));

  const all = [...map.values()];
  const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthEnd = new Date(monthStart); monthEnd.setMonth(monthEnd.getMonth() + 1);
  const dueThisMonth = all.filter(x => x.nextExpected && x.segment !== 'gone' && x.segment !== 'risk'
    && new Date(x.nextExpected) >= monthStart && new Date(x.nextExpected) < monthEnd);
  const risk = all.filter(x => x.segment === 'risk');
  const totalSpent = all.reduce((a, x) => a + x.spent, 0);
  const vips = all.filter(x => x.vip);

  return {
    map, ctx,
    summary: {
      onTable: all.reduce((a, x) => a + x.opportunity.total, 0),
      withOpportunity: all.filter(x => x.opportunity.total > 0).length,
      riskCount: risk.length,
      riskPerYear: risk.reduce((a, x) => a + x.perYear, 0),
      dueThisMonth: dueThisMonth.length,
      dueThisMonthValue: dueThisMonth.reduce((a, x) => a + x.avgTicket, 0),
      vipCount: vips.length,
      vipShare: totalSpent ? (vips.reduce((a, x) => a + x.spent, 0) / totalSpent) * 100 : 0,
    },
  };
}

/* ── Detalhes só da ficha ─────────────────────────────────────────────── */

export function spendByCategory(os: InsOs[]) {
  const m = new Map<string, number>();
  for (const o of os) if (isSale(o)) m.set(o.category?.trim() || 'Outros', (m.get(o.category?.trim() || 'Outros') ?? 0) + Number(o.price));
  return [...m.entries()].map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value);
}

export function approvalProfile(os: InsOs[]) {
  const asked = os.filter(o => o.approval_requested_at || o.approved_at || o.quote_status === 'declined');
  const declined = asked.filter(o => o.quote_status === 'declined').length;
  const approved = asked.length - declined;
  const channels = new Map<string, number>();
  for (const o of os) if (o.approval_channel) channels.set(o.approval_channel, (channels.get(o.approval_channel) ?? 0) + 1);
  const channel = [...channels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { rate: asked.length ? (approved / asked.length) * 100 : null, approved, declined, channel };
}

export function habits(os: InsOs[]) {
  const sales = os.filter(isSale);
  const mech = new Map<string, number>();
  const wd = new Map<number, number>();
  for (const o of sales) {
    if (o.workshop_mechanic_id) mech.set(o.workshop_mechanic_id, (mech.get(o.workshop_mechanic_id) ?? 0) + 1);
    const d = new Date(o.created_at).getDay();
    wd.set(d, (wd.get(d) ?? 0) + 1);
  }
  const topMech = [...mech.entries()].sort((a, b) => b[1] - a[1])[0];
  const topDay = [...wd.entries()].sort((a, b) => b[1] - a[1])[0];
  const DAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  return {
    mechanicId: topMech && topMech[1] >= 2 && topMech[1] / sales.length >= 0.4 ? topMech[0] : null,
    weekday: topDay && sales.length >= 3 && topDay[1] / sales.length >= 0.4 ? DAYS[topDay[0]] : null,
  };
}

/** Km por mês, km estimado hoje e próxima troca de óleo de um carro */
export function vehicleUsage(os: InsOs[], vehicleId: string, now = Date.now()) {
  const withKm = os.filter(o => o.vehicle_id === vehicleId && o.km_reading != null && o.km_reading > 0)
    .sort((a, b) => when(a).localeCompare(when(b)));
  const last = withKm[withKm.length - 1];
  let kmPerMonth: number | null = null;
  if (withKm.length >= 2) {
    const first = withKm[0];
    const months = (new Date(when(last)).getTime() - new Date(when(first)).getTime()) / (30 * DAY);
    const dkm = Number(last.km_reading) - Number(first.km_reading);
    if (months >= 1 && dkm > 0) kmPerMonth = Math.round(dkm / months);
  }
  const lastKm = last ? Number(last.km_reading) : null;
  const estKm = lastKm != null && kmPerMonth ? Math.round(lastKm + kmPerMonth * ((now - new Date(when(last)).getTime()) / (30 * DAY))) : lastKm;

  const oil = os.filter(o => o.vehicle_id === vehicleId && isSale(o) && OIL.has(o.category ?? '')).sort((a, b) => when(b).localeCompare(when(a)))[0];
  let nextOilDays: number | null = null;
  if (oil) {
    const byTime = new Date(when(oil)).getTime() + 182 * DAY;              // 6 meses
    let byKm = Infinity;
    if (kmPerMonth && oil.km_reading) byKm = new Date(when(oil)).getTime() + (10000 / kmPerMonth) * 30 * DAY; // 10 mil km
    nextOilDays = Math.round((Math.min(byTime, byKm) - now) / DAY);
  }
  return { lastKm, kmPerMonth, estKm, lastOil: oil ? when(oil) : null, nextOilDays };
}

export function birthdaySoon(birth: string | null | undefined, now = new Date()) {
  if (!birth) return null;
  const [, m, d] = birth.split('-').map(Number);
  let next = new Date(now.getFullYear(), m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
  const days = Math.round((next.getTime() - today.getTime()) / DAY);
  return days <= 30 ? days : null;
}

export const fmtMonthYear = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '—');
