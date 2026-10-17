/**
 * Painel da Plataforma — números do que aconteceu com as demandas de mecânicos da plataforma.
 * Cálculos puros (sem banco). Os de gasto/tempo/ranking vêm de marketplaceOf (workshopMetrics).
 *
 * Definições:
 * - Concluída = status 'completed', pela data de conclusão. Cancelada = pela data do cancelamento.
 * - Pago ao mecânico = preço fechado da demanda (o que a oficina paga).
 * - Cobrado do cliente = soma dos serviços da OS feitos por essa demanda (itens com platform_job_id;
 *   demanda antiga sem itens ligados usa os serviços da OS marcados como "plataforma").
 */
import { marketplaceOf, type PanelJob, type Range } from '@/lib/workshopMetrics';

export type PlatformJob = PanelJob & {
  service_order_id: string | null;
  pricing: 'hour' | 'fixed' | null;
  max_hours: number | null;
  estimated_hours: number | null;
  actual_hours: number | null;
};
/** Serviço de OS feito por mecânico da plataforma */
export type PlatformItem = {
  service_order_id: string; platform_job_id: string | null; quantity: number; unit_price: number;
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

export function platformPanel(jobs: PlatformJob[], items: PlatformItem[], r: Range, arrivalDeadline: (j: PanelJob) => Date | null) {
  const base = marketplaceOf(jobs, r, arrivalDeadline);
  const done = jobs.filter(j => j.status === 'completed' && inRange(j.completed_at, r));
  const published = jobs.filter(j => inRange(j.created_at, r)).length;
  const decided = base.doneCount + base.cancelledCount;

  // Cobrado do cliente nos serviços que a plataforma fez
  const byJob = new Map<string, number>();
  const linkedOs = new Set<string>();
  for (const i of items) if (i.platform_job_id) {
    byJob.set(i.platform_job_id, (byJob.get(i.platform_job_id) ?? 0) + itemTotal(i));
    linkedOs.add(i.service_order_id);
  }
  // Demanda antiga (sem item ligado): serviços "plataforma" da OS dela, divididos entre as demandas dessa OS
  const legacy = new Map<string, PlatformJob[]>();
  for (const j of done) if (j.service_order_id && !byJob.has(j.id) && !linkedOs.has(j.service_order_id)) {
    legacy.set(j.service_order_id, [...(legacy.get(j.service_order_id) ?? []), j]);
  }
  for (const [osId, js] of legacy) {
    const total = items.filter(i => i.service_order_id === osId && !i.platform_job_id).reduce((a, i) => a + itemTotal(i), 0);
    if (total > 0) for (const j of js) byJob.set(j.id, total / js.length);
  }
  const withOs = done.filter(j => byJob.has(j.id));
  const charged = withOs.reduce((a, j) => a + (byJob.get(j.id) ?? 0), 0);
  const paidWithOs = withOs.reduce((a, j) => a + Number(j.price), 0);
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
    /** Só demandas ligadas a OS (onde dá para saber quanto o cliente pagou) */
    charged, paidWithOs, withOsCount: withOs.length,
    margin: charged - paidWithOs,
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
