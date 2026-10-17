/**
 * Painel da Plataforma — números do que aconteceu com as demandas de mecânicos da plataforma.
 * Cálculos puros (sem banco). Os de gasto/tempo/ranking vêm de marketplaceOf (workshopMetrics).
 *
 * Definições:
 * - Concluída = status 'completed', pela data de conclusão. Cancelada = pela data do cancelamento.
 * - Pago ao mecânico = preço fechado da demanda (o que a oficina paga; taxa de cartão não entra).
 * - Lucro por serviço (profitRows): o que o cliente pagou pelos serviços feitos pela plataforma
 *   (mão de obra + peças usadas neles) − custo dessas peças − pago ao mecânico.
 *   Custo da peça = custo de compra lançado; sem custo, estimado em `estPct`% do preço de venda dela;
 *   serviço "leva peça" sem peça lançada = `estPct`% do valor do serviço (estimado).
 *   OS inteira pela plataforma (executor 'platform') = a OS toda numa linha só.
 */
import { marketplaceOf, type PanelJob, type Range } from '@/lib/workshopMetrics';

export type PlatformJob = PanelJob & {
  service_order_id: string | null;
  pricing: 'hour' | 'fixed' | null;
  max_hours: number | null;
  estimated_hours: number | null;
  actual_hours: number | null;
};
/** Item de OS (serviço ou peça) das OS que tiveram mecânico da plataforma */
export type PlatformItem = {
  id: string; service_order_id: string; kind: 'part' | 'labor'; description: string;
  quantity: number; unit_price: number; unit_cost: number | null;
  used_in_item_id: string | null; platform_job_id: string | null; executor: 'workshop' | 'platform' | null;
  /** Só serviços: 'servico' = leva peças · 'mao_de_obra' = sem peça */
  service_type: 'servico' | 'mao_de_obra' | null;
};
export type PlatformOs = {
  id: string; number: number | null; executor: 'workshop' | 'platform' | null;
  vehicle: { make: string; model: string; plate: string; color: string | null } | null;
  customer: { full_name: string } | null;
};

const inRange = (iso: string | null | undefined, r: Range) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t < r.to.getTime();
};
const itemTotal = (i: PlatformItem) => Number(i.quantity) * Number(i.unit_price);

/** Tipos de serviço pelo título da demanda (o primeiro que casar) */
const SERVICE_KINDS: { label: string; re: RegExp }[] = [
  { label: 'Freios',          re: /freio|pastilha|disco|lona|tambor/i },
  { label: 'Óleo e filtros',  re: /[oó]leo|filtro|lubrifica/i },
  { label: 'Suspensão',       re: /suspens|amortec|bandeja|pivô|pivo|bucha|mola|terminal/i },
  { label: 'Embreagem',       re: /embreagem|plat[oô]|atuador/i },
  { label: 'Elétrica',        re: /el[eé]tric|bateria|alternador|arranque|chicote|farol|l[aâ]mpada/i },
  { label: 'Diagnóstico',     re: /diagn[oó]st|scanner|inje[cç][aã]o|luz.*painel/i },
  { label: 'Ar-condicionado', re: /ar[\s-]?condicionado|\bar\b.*cond|higieniza/i },
  { label: 'Motor',           re: /motor|correia|junta|cabe[cç]ote|vela|bobina|arrefec|radiador/i },
  { label: 'Revisão',         re: /revis[aã]o|preventiv|check/i },
  { label: 'Pneus e alinhamento', re: /pneu|alinhamento|balanceamento|geometria/i },
];
export const serviceKind = (title: string) => SERVICE_KINDS.find(k => k.re.test(title))?.label ?? 'Outros';

export function platformPanel(jobs: PlatformJob[], r: Range, arrivalDeadline: (j: PanelJob) => Date | null) {
  const base = marketplaceOf(jobs, r, arrivalDeadline);
  const done = jobs.filter(j => j.status === 'completed' && inRange(j.completed_at, r));
  const published = jobs.filter(j => inRange(j.created_at, r)).length;
  const decided = base.doneCount + base.cancelledCount;

  const osServed = new Set(done.map(j => j.service_order_id).filter(Boolean)).size;

  // Horas: previstas (tempo do pacote ou tempo previsto do "pelo serviço") × reais registradas
  const hoursPlanned = (j: PlatformJob) => Number(j.pricing === 'fixed' ? j.estimated_hours : j.max_hours) || 0;
  const withHours = done.filter(j => Number(j.actual_hours) > 0);
  const actualHours = withHours.reduce((a, j) => a + Number(j.actual_hours), 0);
  const plannedOfThose = withHours.filter(j => hoursPlanned(j) > 0);

  // Serviços mais pedidos (concluídos no período)
  const kinds = new Map<string, { count: number; spent: number }>();
  for (const j of done) {
    const k = serviceKind(j.title);
    const cur = kinds.get(k) ?? { count: 0, spent: 0 };
    cur.count += 1; cur.spent += Number(j.price);
    kinds.set(k, cur);
  }

  const ratings = done.map(j => Number(j.mechanic_rating)).filter(n => n > 0);

  return {
    ...base,
    published,
    completionRate: decided ? (base.doneCount / decided) * 100 : null,
    ticket: base.doneCount ? base.spent / base.doneCount : 0,
    osServed,
    actualHours,
    hoursBase: withHours.length,
    plannedHours: plannedOfThose.reduce((a, j) => a + hoursPlanned(j), 0),
    plannedActual: plannedOfThose.reduce((a, j) => a + Number(j.actual_hours), 0),
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    ratingsCount: ratings.length,
    services: [...kinds.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.count - a.count || b.spent - a.spent),
  };
}

/** Gasto e demandas concluídas por dia (ou por mês em períodos longos) */
export function platformSeries(jobs: PlatformJob[], r: Range) {
  const days = Math.ceil((r.to.getTime() - r.from.getTime()) / 86400000);
  const byMonth = days > 62;
  const buckets = new Map<string, { label: string; spent: number; count: number }>();
  const cursor = new Date(r.from);
  cursor.setHours(0, 0, 0, 0);
  if (byMonth) cursor.setDate(1);
  const keyOf = (d: Date) => (byMonth ? `${d.getFullYear()}-${d.getMonth()}` : d.toDateString());
  while (cursor < r.to) {
    buckets.set(keyOf(cursor), {
      label: byMonth
        ? cursor.toLocaleDateString('pt-BR', { month: 'short' })
        : cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      spent: 0, count: 0,
    });
    if (byMonth) cursor.setMonth(cursor.getMonth() + 1); else cursor.setDate(cursor.getDate() + 1);
  }
  for (const j of jobs) {
    if (j.status !== 'completed' || !inRange(j.completed_at, r)) continue;
    const b = buckets.get(keyOf(new Date(j.completed_at!)));
    if (b) { b.spent += Number(j.price); b.count += 1; }
  }
  return { byMonth, rows: [...buckets.values()] };
}

/* ── Lucro por serviço ─────────────────────────────────────────────────────── */

export type ProfitRow = {
  key: string; osId: string; osNumber: number | null; car: string; customer: string | null;
  date: string; mechanics: string[];
  /** OS inteira feita pela plataforma */
  whole: boolean;
  services: string[];
  labor: number; parts: number; charged: number;
  partsCost: number; paid: number; profit: number;
  /** Parte do custo das peças que veio do custo lançado × a que é estimativa (estPct) */
  costReal: number; costEst: number;
  /** Alguma peça sem custo de compra lançado (o lucro pode estar maior do que é) */
  missingCost: boolean;
  /** Serviço que leva peça sem nenhuma peça lançada nele (custo das peças desconhecido) */
  noParts: string[];
};

const carOf = (v: PlatformOs['vehicle']) =>
  (v ? [v.make, v.model, v.color].filter(Boolean).join(' ') + (v.plate ? ` · ${v.plate}` : '') : 'Sem veículo');

/**
 * Uma linha por serviço feito por mecânico da plataforma, com o lucro depois dos custos.
 * - OS inteira pela plataforma: a OS toda (todos os serviços e peças; pago = todas as demandas dela).
 * - Só alguns itens: os serviços daquela demanda nessa OS + as peças usadas neles.
 *   Demanda com serviços de várias OS (empilhados) divide o valor pago pelo peso de cada OS.
 */
export function profitRows(jobs: PlatformJob[], osList: PlatformOs[], items: PlatformItem[], r: Range, estPct = 50): ProfitRow[] {
  const est = Math.min(100, Math.max(0, estPct)) / 100;
  const osById = new Map(osList.map(o => [o.id, o]));
  const itemsByOs = new Map<string, PlatformItem[]>();
  for (const i of items) itemsByOs.set(i.service_order_id, [...(itemsByOs.get(i.service_order_id) ?? []), i]);
  const allDone = jobs.filter(j => j.status === 'completed');
  const done = allDone.filter(j => inRange(j.completed_at, r));
  const nameOf = (j: PlatformJob) => j.mechanic?.profile?.full_name ?? 'Mecânico';

  /** OS em que a demanda trabalhou: pelos itens ligados; demanda antiga = a OS de origem */
  const osOfJob = (j: PlatformJob) => {
    const ids = new Set(items.filter(i => i.platform_job_id === j.id).map(i => i.service_order_id));
    if (!ids.size && j.service_order_id) ids.add(j.service_order_id);
    return [...ids].filter(id => osById.has(id));
  };

  const money = (labor: PlatformItem[], parts: PlatformItem[], all: PlatformItem[]) => {
    // "Leva peça" sem peça ligada a ele (na OS inteira, sem peça nenhuma na OS)
    const noPartItems = labor.filter(l => l.service_type === 'servico'
      && !all.some(p => p.kind === 'part' && (p.used_in_item_id === l.id || (!p.used_in_item_id && parts.includes(p)))));
    const costReal = parts.filter(i => i.unit_cost != null).reduce((a, i) => a + Number(i.quantity) * Number(i.unit_cost), 0);
    const costEst = parts.filter(i => i.unit_cost == null).reduce((a, i) => a + itemTotal(i) * est, 0)
      + noPartItems.reduce((a, i) => a + itemTotal(i) * est, 0);
    return {
      labor: labor.reduce((a, i) => a + itemTotal(i), 0),
      parts: parts.reduce((a, i) => a + itemTotal(i), 0),
      costReal, costEst, partsCost: costReal + costEst,
      missingCost: parts.some(i => i.unit_cost == null),
      noParts: noPartItems.map(l => l.description),
    };
  };

  /** Parte do valor pago de uma demanda que cabe a uma OS (várias OS = pelo peso dos serviços dela em cada uma) */
  const shareOf = (j: PlatformJob, osId: string) => {
    const osIds = osOfJob(j);
    if (osIds.length <= 1) return Number(j.price);
    const w = (id: string) => (itemsByOs.get(id) ?? [])
      .filter(i => i.kind === 'labor' && i.platform_job_id === j.id).reduce((a, i) => a + itemTotal(i), 0);
    const total = osIds.reduce((a, id) => a + w(id), 0);
    return Number(j.price) * (total ? w(osId) / total : 1 / osIds.length);
  };

  const rows: ProfitRow[] = [];
  const wholeDone = new Set<string>();
  for (const j of done) {
    const osIds = osOfJob(j);

    osIds.forEach(osId => {
      const os = osById.get(osId)!;
      const all = itemsByOs.get(osId) ?? [];
      const base = { osId, osNumber: os.number, car: carOf(os.vehicle), customer: os.customer?.full_name ?? null, date: j.completed_at! };

      if (os.executor === 'platform') {
        if (wholeDone.has(osId)) return;
        wholeDone.add(osId);
        const osJobs = allDone.filter(x => osOfJob(x).includes(osId));
        const m = money(all.filter(i => i.kind === 'labor'), all.filter(i => i.kind === 'part'), all);
        const paid = osJobs.reduce((a, x) => a + shareOf(x, osId), 0);
        const charged = m.labor + m.parts;
        rows.push({
          ...base, key: `os-${osId}`, whole: true, mechanics: [...new Set(osJobs.map(nameOf))],
          services: all.filter(i => i.kind === 'labor').map(i => i.description), ...m, charged, paid,
          profit: charged - m.partsCost - paid,
        });
        return;
      }

      // Só alguns itens: os da demanda (antiga sem ligação = os marcados "plataforma" da OS de origem)
      let labor = all.filter(i => i.kind === 'labor' && i.platform_job_id === j.id);
      if (!labor.length && osId === j.service_order_id) {
        labor = all.filter(i => i.kind === 'labor' && i.executor === 'platform' && !i.platform_job_id);
      }
      const laborIds = new Set(labor.map(i => i.id));
      const parts = all.filter(i => i.kind === 'part' && i.used_in_item_id && laborIds.has(i.used_in_item_id));
      const m = money(labor, parts, all);
      const paid = shareOf(j, osId);
      const charged = m.labor + m.parts;
      rows.push({
        ...base, key: `${j.id}-${osId}`, whole: false, mechanics: [nameOf(j)],
        services: labor.length ? labor.map(i => i.description) : [j.title], ...m, charged, paid,
        profit: charged - m.partsCost - paid,
      });
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** Totais das linhas de lucro */
export function profitTotals(rows: ProfitRow[]) {
  const sum = (k: 'charged' | 'partsCost' | 'costReal' | 'costEst' | 'paid' | 'profit') => rows.reduce((a, r) => a + r[k], 0);
  return {
    count: rows.length, charged: sum('charged'), partsCost: sum('partsCost'), paid: sum('paid'), profit: sum('profit'),
    costReal: sum('costReal'), costEst: sum('costEst'),
    missingCost: rows.some(r => r.missingCost),
    noParts: rows.filter(r => r.noParts.length > 0).length,
  };
}

/** Peças mínimas com custo lançado para sugerir a média real da oficina */
export const MIN_PARTS_FOR_RATIO = 5;

/** Custo médio das peças com custo lançado, em % do preço de venda (null = poucas peças para dizer) */
export function realCostPct(items: PlatformItem[]): { pct: number; count: number } | null {
  const withCost = items.filter(i => i.kind === 'part' && i.unit_cost != null && Number(i.unit_cost) > 0 && Number(i.unit_price) > 0);
  if (withCost.length < MIN_PARTS_FOR_RATIO) return null;
  const cost = withCost.reduce((a, i) => a + Number(i.quantity) * Number(i.unit_cost), 0);
  const price = withCost.reduce((a, i) => a + itemTotal(i), 0);
  return price > 0 ? { pct: Math.round((cost / price) * 100), count: withCost.length } : null;
}

/* % estimado do custo das peças: por oficina, neste aparelho */
export const DEFAULT_EST_PCT = 50;
const estKey = (wid: string) => `plataforma_custo_pecas_pct_${wid}`;
export function loadEstPct(wid: string | null): number {
  if (!wid) return DEFAULT_EST_PCT;
  try {
    const n = Number(localStorage.getItem(estKey(wid)));
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : DEFAULT_EST_PCT;
  } catch { return DEFAULT_EST_PCT; }
}
export function saveEstPct(wid: string, pct: number) {
  try { localStorage.setItem(estKey(wid), String(pct)); } catch { /* sem storage: só não lembra */ }
}
