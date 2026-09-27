/**
 * Indicadores do Painel da Oficina — cálculos puros (sem acesso ao banco).
 *
 * Definições:
 * - Venda = OS concluída (status 'completed') no período, pela data de conclusão.
 * - Tempo trabalhado = início → conclusão menos as pausas.
 * - Comissão = % do mecânico sobre a mão de obra (serviços) das OS que ele concluiu.
 */
import { workedMinutes } from '@/components/os/osHelpers';
import type { OsStatus } from '@/types/database';

export type PanelOs = {
  id: string;
  number: number | null;
  title: string;
  status: OsStatus;
  quote_status?: string | null;
  price: number;
  parts_cost: number | null;
  labor_cost: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  approval_requested_at?: string | null;
  approved_at?: string | null;
  estimated_hours: number | null;
  workshop_mechanic_id: string | null;
  customer_id: string | null;
  customer: { id: string; full_name: string; created_at: string } | null;
  vehicle: { make: string; model: string; plate: string } | null;
  pauses?: { started_at: string; ended_at: string | null; reason: string }[];
};

export type PanelItem = { service_order_id: string; kind: 'part' | 'labor'; description: string; quantity: number; unit_price: number };
export type PanelMechanic = { id: string; name: string; commission_percent?: number | null; active: boolean };

export type Range = { from: Date; to: Date };

const inRange = (iso: string | null | undefined, r: Range) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t < r.to.getTime();
};

/** Período anterior de mesmo tamanho (para comparação "vs. período anterior") */
export function previousRange(r: Range): Range {
  const len = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - len), to: new Date(r.from.getTime()) };
}

const isSale = (o: PanelOs) => o.status === 'completed' && !o.quote_status;
const parts = (o: PanelOs) => Number(o.parts_cost ?? 0);
const labor = (o: PanelOs) => Number(o.labor_cost ?? 0);

/** Vendas (OS concluídas) de um período */
export function salesOf(list: PanelOs[], r: Range) {
  const sales = list.filter(o => isSale(o) && inRange(o.completed_at, r));
  const revenue = sales.reduce((a, o) => a + Number(o.price), 0);
  const partsTotal = sales.reduce((a, o) => a + parts(o), 0);
  const laborTotal = sales.reduce((a, o) => a + labor(o), 0);
  return {
    sales,
    count: sales.length,
    revenue,
    parts: partsTotal,
    labor: laborTotal,
    // OS antigas com só o total digitado (sem peças/mão de obra separadas)
    unsplit: Math.max(0, revenue - partsTotal - laborTotal),
    ticket: sales.length ? revenue / sales.length : 0,
  };
}

/** Variação % entre dois valores (null quando não há base de comparação) */
export function change(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

/** Funil atual: quantas OS e quanto dinheiro em cada etapa antes de virar venda */
export function funnel(list: PanelOs[]) {
  const stages: { key: OsStatus; label: string }[] = [
    { key: 'open',              label: 'Abertas' },
    { key: 'awaiting_approval', label: 'Aguardando aprovação' },
    { key: 'approved',          label: 'Aprovadas' },
    { key: 'in_progress',       label: 'Em andamento' },
  ];
  return stages.map(s => {
    const os = list.filter(o => o.status === s.key);
    return { ...s, count: os.length, value: os.reduce((a, o) => a + Number(o.price), 0) };
  });
}

/** Taxa de aprovação dos orçamentos enviados no período */
export function approvalRate(list: PanelOs[], r: Range) {
  const sent = list.filter(o => inRange(o.approval_requested_at, r));
  const approved = sent.filter(o => o.approved_at || ['approved', 'in_progress', 'completed'].includes(o.status)).length;
  const declined = sent.filter(o => o.quote_status === 'declined').length;
  const pending = sent.length - approved - declined;
  const decided = approved + declined;
  return { sent: sent.length, approved, declined, pending, rate: decided ? (approved / decided) * 100 : null };
}

/** Faturamento por dia (ou por mês em períodos longos) para o gráfico */
export function revenueSeries(list: PanelOs[], r: Range) {
  const days = Math.ceil((r.to.getTime() - r.from.getTime()) / 86400000);
  const byMonth = days > 62;
  const buckets = new Map<string, { label: string; value: number; date: Date }>();
  const cursor = new Date(r.from);
  cursor.setHours(0, 0, 0, 0);
  if (byMonth) cursor.setDate(1);
  while (cursor < r.to) {
    const key = byMonth ? `${cursor.getFullYear()}-${cursor.getMonth()}` : cursor.toDateString();
    buckets.set(key, {
      label: byMonth
        ? cursor.toLocaleDateString('pt-BR', { month: 'short' })
        : cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      value: 0, date: new Date(cursor),
    });
    if (byMonth) cursor.setMonth(cursor.getMonth() + 1); else cursor.setDate(cursor.getDate() + 1);
  }
  for (const o of salesOf(list, r).sales) {
    const d = new Date(o.completed_at!);
    const key = byMonth ? `${d.getFullYear()}-${d.getMonth()}` : d.toDateString();
    const b = buckets.get(key);
    if (b) b.value += Number(o.price);
  }
  return [...buckets.values()];
}

/** Produtividade e comissão por mecânico (OS concluídas no período) */
export function productivity(list: PanelOs[], mechanics: PanelMechanic[], r: Range) {
  const byId = new Map(mechanics.map(m => [m.id, m]));
  const rows = new Map<string, {
    id: string; name: string; commissionPercent: number;
    count: number; revenue: number; labor: number; commission: number;
    workedMin: number; timedCount: number; onTime: number; withEstimate: number; pausedMin: number;
  }>();

  for (const o of salesOf(list, r).sales) {
    const key = o.workshop_mechanic_id ?? 'none';
    const m = o.workshop_mechanic_id ? byId.get(o.workshop_mechanic_id) : undefined;
    if (!rows.has(key)) {
      rows.set(key, {
        id: key, name: m?.name ?? 'Sem responsável definido', commissionPercent: Number(m?.commission_percent ?? 0),
        count: 0, revenue: 0, labor: 0, commission: 0, workedMin: 0, timedCount: 0, onTime: 0, withEstimate: 0, pausedMin: 0,
      });
    }
    const row = rows.get(key)!;
    row.count += 1;
    row.revenue += Number(o.price);
    row.labor += labor(o);
    row.commission += labor(o) * row.commissionPercent / 100;
    const worked = workedMinutes(o.started_at, o.completed_at, o.pauses);
    if (worked != null && o.started_at) {
      row.workedMin += worked;
      row.timedCount += 1;
      if (o.estimated_hours) {
        row.withEstimate += 1;
        if (worked <= Number(o.estimated_hours) * 60) row.onTime += 1;
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.revenue - a.revenue);
}

/** Tempo parado por motivo de pausa (pausas iniciadas no período) */
export function pausesByReason(list: PanelOs[], r: Range) {
  const map = new Map<string, number>();
  for (const o of list) {
    for (const p of o.pauses ?? []) {
      if (!inRange(p.started_at, r)) continue;
      const end = p.ended_at ? new Date(p.ended_at).getTime() : Date.now();
      const min = Math.max(0, Math.round((end - new Date(p.started_at).getTime()) / 60000));
      map.set(p.reason, (map.get(p.reason) ?? 0) + min);
    }
  }
  return [...map.entries()].map(([reason, minutes]) => ({ reason, minutes })).sort((a, b) => b.minutes - a.minutes);
}

/** Serviços e peças mais vendidos no período */
export function topItems(list: PanelOs[], items: PanelItem[], r: Range, kind: 'part' | 'labor', limit = 5) {
  const saleIds = new Set(salesOf(list, r).sales.map(o => o.id));
  const map = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const i of items) {
    if (i.kind !== kind || !saleIds.has(i.service_order_id)) continue;
    const key = i.description.trim().toLowerCase();
    const cur = map.get(key) ?? { name: i.description.trim(), qty: 0, revenue: 0 };
    cur.qty += Number(i.quantity);
    cur.revenue += Number(i.quantity) * Number(i.unit_price);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/* ── Demandas do marketplace (mecânicos da plataforma) ─────────────────────── */

export type PanelJob = {
  id: string; title: string; status: string; price: number;
  created_at: string; accepted_at: string | null; en_route_at: string | null; arrived_at: string | null;
  completed_at: string | null; cancelled_at: string | null; cancelled_by: string | null;
  cancellation_fee: number | null; cancellation_fee_paid_at: string | null;
  workshop_confirmed_at: string | null; mechanic_rating: number | null;
  scheduled_at: string | null; mechanic_id: string | null;
  mechanic: { id: string; profile: { full_name: string } | null } | null;
};

const minutesBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/**
 * Uso do marketplace no período: gasto, volume, qualidade do atendimento e pendências.
 * `arrivalDeadline` vem de src/lib/arrivalDeadline (prazo de chegada do mecânico).
 */
export function marketplaceOf(
  jobs: PanelJob[], r: Range,
  arrivalDeadline: (j: PanelJob) => Date | null,
) {
  const done = jobs.filter(j => j.status === 'completed' && inRange(j.completed_at, r));
  const cancelled = jobs.filter(j => j.status === 'cancelled' && inRange(j.cancelled_at, r));
  const feesByWorkshop = cancelled
    .filter(j => j.cancelled_by === 'workshop')
    .reduce((a, j) => a + Number(j.cancellation_fee ?? 0), 0);

  // Qualidade: aceite e chegada (demandas aceitas/chegadas no período)
  const acceptMins = jobs.filter(j => j.accepted_at && inRange(j.accepted_at, r))
    .map(j => minutesBetween(j.created_at, j.accepted_at!));
  const arrived = jobs.filter(j => j.arrived_at && inRange(j.arrived_at, r));
  const arrivalMins = arrived
    .map(j => { const from = j.en_route_at ?? j.accepted_at; return from ? minutesBetween(from, j.arrived_at!) : null; })
    .filter((x): x is number => x != null);
  const withDeadline = arrived.map(j => ({ j, d: arrivalDeadline({ ...j, arrived_at: null }) })).filter(x => x.d);
  const onTime = withDeadline.filter(x => new Date(x.j.arrived_at!).getTime() <= x.d!.getTime()).length;

  // Ranking de mecânicos contratados
  const byMech = new Map<string, { name: string; jobs: number; spent: number; ratings: number[] }>();
  for (const j of done) {
    if (!j.mechanic_id) continue;
    const cur = byMech.get(j.mechanic_id) ?? { name: j.mechanic?.profile?.full_name ?? 'Mecânico', jobs: 0, spent: 0, ratings: [] };
    cur.jobs += 1;
    cur.spent += Number(j.price);
    if (j.mechanic_rating) cur.ratings.push(Number(j.mechanic_rating));
    byMech.set(j.mechanic_id, cur);
  }

  return {
    spent: done.reduce((a, j) => a + Number(j.price), 0),
    doneCount: done.length,
    cancelledCount: cancelled.length,
    feesPaid: feesByWorkshop,
    now: {
      waiting: jobs.filter(j => j.status === 'open').length,
      onTheWay: jobs.filter(j => j.status === 'assigned' && !j.arrived_at).length,
      inService: jobs.filter(j => (j.status === 'assigned' && j.arrived_at) || j.status === 'in_progress').length,
    },
    avgAcceptMin: avg(acceptMins),
    avgArrivalMin: avg(arrivalMins),
    onTimeRate: withDeadline.length ? (onTime / withDeadline.length) * 100 : null,
    onTimeBase: withDeadline.length,
    pendingConfirm: jobs.filter(j => j.status === 'completed' && !j.workshop_confirmed_at).length,
    pendingRating: jobs.filter(j => j.status === 'completed' && j.workshop_confirmed_at && !j.mechanic_rating).length,
    pendingFees: jobs.filter(j => j.cancelled_by === 'workshop' && Number(j.cancellation_fee ?? 0) > 0 && !j.cancellation_fee_paid_at)
      .reduce((a, j) => a + Number(j.cancellation_fee ?? 0), 0),
    topMechanics: [...byMech.values()]
      .map(m => ({ ...m, avgRating: m.ratings.length ? m.ratings.reduce((a, b) => a + b, 0) / m.ratings.length : null }))
      .sort((a, b) => b.jobs - a.jobs || b.spent - a.spent).slice(0, 5),
  };
}

/** Clientes atendidos no período: novos (1ª compra) × que voltaram */
export function customerMix(list: PanelOs[], r: Range) {
  const firstSale = new Map<string, number>();
  for (const o of list) {
    if (!isSale(o) || !o.customer_id || !o.completed_at) continue;
    const t = new Date(o.completed_at).getTime();
    if (!firstSale.has(o.customer_id) || t < firstSale.get(o.customer_id)!) firstSale.set(o.customer_id, t);
  }
  const served = new Set(salesOf(list, r).sales.map(o => o.customer_id).filter(Boolean) as string[]);
  let novos = 0, voltaram = 0;
  for (const id of served) {
    if ((firstSale.get(id) ?? 0) >= r.from.getTime()) novos += 1; else voltaram += 1;
  }
  return { served: served.size, novos, voltaram };
}
