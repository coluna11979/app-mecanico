/**
 * Funil comercial — cálculos puros (sem banco). Junta duas origens, sem duplicar:
 * - Check-up (vehicle_checkups): finalizado → enviado → cliente viu → respondeu / virou OS.
 * - Orçamento da OS: só OS que foram ENVIADAS para aprovação (approval_requested_at), sem as OS
 *   criadas a partir de um check-up (essas contam no check-up).
 *
 * Etapas: Montando orçamento · Aguardando cliente · Aprovado · Perdido (recusado) — e, à parte,
 * "Lembrar depois" (retorno futuro, não é perda).
 * Abertas (Montando/Aguardando) = situação atual; Aprovado/Recusado/Lembrar depois = no período,
 * pela data da resposta (orçamento de OS recusado não guarda a data da recusa → usa a do envio).
 */
import { itemQuote, type VehicleCheckup } from '@/lib/checkup';

export type Stage = 'montando' | 'aguardando' | 'aprovado' | 'recusado' | 'lembrar';
export type Origin = 'checkup' | 'os';

type CkItem = { status: string | null; quote_labor: number | null; quote_parts: number | null; customer_decision: string | null };
export type CkRow = VehicleCheckup & {
  mechanic: { name: string } | null;
  items: CkItem[];
  sale_os: { number: number | null; status: string; price: number } | null;
};
export type OsQuote = {
  id: string; number: number | null; title: string; status: string; quote_status: string | null; price: number;
  approval_requested_at: string; approved_at: string | null; customer_id: string | null;
  customer: { id: string; full_name: string; phone: string | null } | null;
  vehicle: { make: string | null; model: string | null; plate: string | null } | null;
};

export type Opp = {
  key: string; origin: Origin; stage: Stage;
  /** Check-up ou OS */
  id: string;
  customerId: string | null; customerName: string | null; phone: string | null;
  car: string; plate: string | null;
  value: number;
  /** Desde quando está parado na etapa (abertas) ou quando fechou (aprovado/recusado/lembrar) */
  since: string | null;
  viewed: boolean;
  /** Check-up que virou OS */
  saleOsId: string | null; saleOsNumber: number | null;
  mechanicId: string | null; mechanicName: string | null;
  publicToken: string | null;
};

const DAY = 86400000;
export const daysSince = (iso: string | null | undefined, now = Date.now()) =>
  iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : null;

const flagged = (r: CkRow) => r.items.filter(i => i.status === 'warn' || i.status === 'urgent');

export function fromCheckup(r: CkRow): Opp | null {
  if (r.status !== 'completed') return null;
  const items = flagged(r);
  const quoted = items.reduce((a, i) => a + itemQuote(i), 0);
  const approved = items.filter(i => i.customer_decision === 'approve').reduce((a, i) => a + itemQuote(i), 0);
  let stage: Stage; let since: string | null; let value = quoted;
  if (r.sale_os_id || (r.customer_responded_at && approved > 0)) {
    stage = 'aprovado'; since = r.customer_responded_at ?? r.completed_at; value = approved || Number(r.sale_os?.price ?? 0);
  } else if (r.customer_responded_at) {
    stage = items.some(i => i.customer_decision === 'remind') ? 'lembrar' : 'recusado';
    since = r.customer_responded_at;
  } else if (r.quote_sent_at || r.customer_viewed_at) {
    stage = 'aguardando'; since = r.customer_viewed_at ?? r.quote_sent_at ?? null;
  } else {
    stage = 'montando'; since = r.completed_at;
  }
  return {
    key: `ck-${r.id}`, origin: 'checkup', stage, id: r.id,
    customerId: r.customer_id, customerName: r.customer_name, phone: r.customer_phone,
    car: [r.make, r.model, r.year].filter(Boolean).join(' ') || 'Veículo', plate: r.plate ?? null,
    value, since, viewed: !!r.customer_viewed_at,
    saleOsId: r.sale_os_id ?? null, saleOsNumber: r.sale_os?.number ?? null,
    mechanicId: r.workshop_mechanic_id, mechanicName: r.mechanic?.name ?? null,
    publicToken: r.public_token,
  };
}

export function fromOsQuote(o: OsQuote): Opp | null {
  let stage: Stage; let since: string | null;
  if (o.status === 'awaiting_approval') { stage = 'aguardando'; since = o.approval_requested_at; }
  else if (o.status === 'cancelled' && o.quote_status === 'declined') { stage = 'recusado'; since = o.approval_requested_at; }
  else if (['approved', 'in_progress', 'completed'].includes(o.status)) { stage = 'aprovado'; since = o.approved_at ?? o.approval_requested_at; }
  else return null; // cancelada sem recusa, ou voltou a "aberta": fora do funil
  return {
    key: `os-${o.id}`, origin: 'os', stage, id: o.id,
    customerId: o.customer_id, customerName: o.customer?.full_name ?? null, phone: o.customer?.phone ?? null,
    car: [o.vehicle?.make, o.vehicle?.model].filter(Boolean).join(' ') || o.title, plate: o.vehicle?.plate ?? null,
    value: Number(o.price), since, viewed: false,
    saleOsId: null, saleOsNumber: o.number,
    mechanicId: null, mechanicName: null, publicToken: null,
  };
}

/** Junta check-ups e orçamentos de OS, sem as OS que nasceram de check-up */
export function buildOpps(checkups: CkRow[], osQuotes: OsQuote[], checkupSaleOsIds: Set<string>): Opp[] {
  const out: Opp[] = [];
  for (const c of checkups) { const o = fromCheckup(c); if (o) out.push(o); }
  for (const q of osQuotes) {
    if (checkupSaleOsIds.has(q.id)) continue;
    const o = fromOsQuote(q); if (o) out.push(o);
  }
  return out;
}

type Range = { from: Date; to: Date };
const inRange = (iso: string | null, r: Range) => !!iso && new Date(iso) >= r.from && new Date(iso) < r.to;
const sum = (xs: Opp[]) => xs.reduce((a, x) => a + x.value, 0);

/** Números do funil: abertas (agora) e fechadas (no período) */
export function funnelOf(opps: Opp[], r: Range) {
  const open = opps.filter(o => o.stage === 'montando' || o.stage === 'aguardando');
  const closed = (s: Stage) => opps.filter(o => o.stage === s && inRange(o.since, r));
  const montando = opps.filter(o => o.stage === 'montando');
  const aguardando = opps.filter(o => o.stage === 'aguardando');
  const aprovado = closed('aprovado');
  const recusado = closed('recusado');
  const lembrar = closed('lembrar');
  const answered = aprovado.length + recusado.length + lembrar.length;
  return {
    open, montando, aguardando, aprovado, recusado, lembrar,
    openValue: sum(open), viewedWaiting: aguardando.filter(o => o.viewed).length,
    approvedValue: sum(aprovado),
    conversion: answered ? (aprovado.length / answered) * 100 : null,
    ticket: aprovado.length ? sum(aprovado) / aprovado.length : 0,
    values: { montando: sum(montando), aguardando: sum(aguardando), aprovado: sum(aprovado), recusado: sum(recusado), lembrar: sum(lembrar) },
    /** Onde estamos perdendo: o maior gargalo com motivo real */
    leaks: [
      { label: 'aguardando resposta há mais de 7 dias', n: aguardando.filter(o => (daysSince(o.since) ?? 0) > 7).length },
      { label: 'enviados e ainda não abertos', n: aguardando.filter(o => o.origin === 'checkup' && !o.viewed).length },
      { label: 'recusados no período', n: recusado.length },
      { label: 'check-ups prontos sem enviar', n: montando.length },
    ].filter(x => x.n > 0).sort((a, b) => b.n - a.n),
  };
}

export type FollowUp = { opp: Opp; days: number; reason: string; action: 'enviar' | 'cobrar' };

/** Quem precisa de retorno hoje — só com motivo real, mais antigos primeiro */
export function followUps(opps: Opp[], now = Date.now()): FollowUp[] {
  const out: FollowUp[] = [];
  for (const o of opps) {
    const d = daysSince(o.since, now) ?? 0;
    if (o.stage === 'montando' && o.origin === 'checkup' && d >= 1)
      out.push({ opp: o, days: d, action: 'enviar', reason: `Check-up pronto há ${d} dia${d === 1 ? '' : 's'} e orçamento não enviado` });
    else if (o.stage === 'aguardando' && o.origin === 'checkup' && o.viewed && d >= 1)
      out.push({ opp: o, days: d, action: 'cobrar', reason: `Viu o orçamento há ${d} dia${d === 1 ? '' : 's'} e não respondeu` });
    else if (o.stage === 'aguardando' && o.origin === 'checkup' && !o.viewed && d >= 2)
      out.push({ opp: o, days: d, action: 'cobrar', reason: `Orçamento enviado há ${d} dias e ainda não aberto` });
    else if (o.stage === 'aguardando' && o.origin === 'os' && d >= 2)
      out.push({ opp: o, days: d, action: 'cobrar', reason: `Orçamento da OS aguardando aprovação há ${d} dias` });
  }
  return out.sort((a, b) => b.days - a.days);
}
