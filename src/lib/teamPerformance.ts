/**
 * Relatório de desempenho da equipe — PRODUTIVIDADE e QUALIDADE por mecânico.
 * Cálculos puros (sem acesso ao banco).
 *
 * Regras para não virar "achismo ao contrário":
 * - Serviço = OS concluída no período (pela data de conclusão), sem contar retornos.
 * - Tempo = início → conclusão menos pausas (aguardando peça não pesa contra ninguém).
 * - Velocidade é comparada POR CATEGORIA com a média da oficina (troca de óleo × troca de óleo).
 * - Retorno só conta contra o mecânico se a causa for falha na execução ou diagnóstico errado.
 * - Com poucos serviços (< MIN_SAMPLE) o indicador aparece como "poucos dados".
 */
import { workedMinutes, reworkCounts } from '@/components/os/osHelpers';
import type { OsStatus, ReworkCause } from '@/types/database';

export const MIN_SAMPLE = 5;      // serviços mínimos para taxa/índice do mecânico
export const MIN_CATEGORY = 3;    // serviços mínimos para média de uma categoria
export const MIN_VALID_MIN = 5;   // tempos abaixo disso são descartados das médias

export type PerfOs = {
  id: string;
  number: number | null;
  title: string;
  status: OsStatus;
  quote_status?: string | null;
  category: string | null;
  labor_cost: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  estimated_hours: number | null;
  workshop_mechanic_id: string | null;
  rework_of_id: string | null;
  rework_cause: ReworkCause | null;
  rework_mechanic_id: string | null;
  vehicle?: { plate: string } | null;
  pauses?: { started_at: string; ended_at: string | null; reason: string }[];
};

export type PerfMechanic = { id: string; name: string; photo_url?: string | null; status?: string | null; active: boolean };
export type Range = { from: Date; to: Date };

const inRange = (iso: string | null | undefined, r: Range) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t < r.to.getTime();
};
const catOf = (o: PerfOs) => o.category?.trim() || 'Sem categoria';
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export type ReturnInfo = {
  id: string; number: number | null; title: string; plate: string | null;
  originalId: string; originalNumber: number | null; category: string;
  cause: ReworkCause | null; counts: boolean; days: number | null; reworkMin: number | null; createdAt: string;
};

export type CategoryCell = {
  category: string; count: number; avgMin: number | null;
  /** % mais rápido (+) ou mais lento (−) que a média da oficina na categoria */
  vsShop: number | null; returns: number;
};

/** Um tipo de serviço (categoria da OS) na oficina toda */
export type ServiceType = {
  category: string; count: number; timed: number;
  avgMin: number | null;
  /** Tempo de referência: mediana (não distorce com um serviço que travou) */
  medianMin: number | null;
  minMin: number | null; maxMin: number | null;
  avgLabor: number | null;
  laborPerHour: number | null;
  returns: number;
  /** Ranking de habilidade no serviço (melhor primeiro) */
  mechanics: SkillEntry[];
  best: SkillEntry | null;
};

export type SkillEntry = {
  id: string; name: string; count: number; timed: number; avgMin: number | null; vsShop: number | null; returns: number;
  /** 0–100: experiência 25% + velocidade 35% + qualidade 40% */
  score: number;
  level: string;
  confidence: 'alta' | 'média' | 'baixa';
};

/**
 * Nota de habilidade num tipo de serviço (0–100).
 * - Experiência (25%): quantas vezes fez — 10 ou mais = nota cheia.
 * - Velocidade (35%): vs. média da oficina no mesmo serviço (+20% mais rápido = 70).
 * - Qualidade (40%): retornos por falha — 20% de retorno zera.
 */
export function skillScore(count: number, vsShop: number | null, returns: number) {
  const exp = Math.min(count / 10, 1) * 100;
  const speed = vsShop == null ? 50 : Math.max(0, Math.min(100, 50 + vsShop));
  const quality = count ? Math.max(0, 100 - (returns / count) * 500) : 50;
  const score = Math.round(exp * 0.25 + speed * 0.35 + quality * 0.4);
  const level = score >= 80 ? 'Especialista' : score >= 65 ? 'Muito bom' : score >= 50 ? 'Bom' : 'Em desenvolvimento';
  const confidence: SkillEntry['confidence'] = count >= MIN_SAMPLE ? 'alta' : count >= MIN_CATEGORY ? 'média' : 'baixa';
  return { score, level, confidence };
}

export type MechanicPerf = {
  id: string; name: string; photo_url?: string | null; inactive: boolean;
  // Produtividade
  services: number;
  timed: number;
  workedMin: number;
  avgMin: number | null;
  labor: number;
  laborPerHour: number | null;
  withEstimate: number;
  onTimeRate: number | null;
  /** 100 = cumpriu a estimativa; 120 = 20% mais rápido que o estimado */
  efficiency: number | null;
  /** Índice de velocidade vs. oficina (mesma categoria). + = mais rápido */
  speed: number | null;
  speedBase: number;
  pausedMin: number;
  reworkExecuted: number;
  // Qualidade
  returnsCounted: number;
  returnsOther: number;
  returnsPending: number;
  returnRate: number | null;
  firstTimeRight: number | null;
  avgDaysToReturn: number | null;
  reworkMin: number;
  returns: ReturnInfo[];
  // Especialidade
  categories: CategoryCell[];
  strengths: string[];
  attention: string[];
  lowSample: boolean;
};

export function teamPerformance(list: PerfOs[], mechanics: PerfMechanic[], r: Range) {
  const byId = new Map(list.map(o => [o.id, o]));
  const isDone = (o: PerfOs) => o.status === 'completed' && !o.quote_status;
  // Menos de MIN_VALID_MIN = cronômetro usado errado (Iniciar e Concluir em seguida): não entra nas médias
  const worked = (o: PerfOs) => {
    if (!o.started_at || !o.completed_at) return null;
    const w = workedMinutes(o.started_at, o.completed_at, o.pauses);
    return w != null && w >= MIN_VALID_MIN ? w : null;
  };

  // Serviços do período (sem retornos)
  const services = list.filter(o => isDone(o) && !o.rework_of_id && inRange(o.completed_at, r));

  // Média da oficina por categoria (serviços cronometrados)
  const catTimes = new Map<string, number[]>();
  for (const o of services) {
    const w = worked(o);
    if (w == null || w <= 0) continue;
    const c = catOf(o);
    catTimes.set(c, [...(catTimes.get(c) ?? []), w]);
  }
  const shopAvg = new Map<string, number>();
  for (const [c, xs] of catTimes) if (xs.length >= MIN_CATEGORY) shopAvg.set(c, mean(xs)!);

  // Retornos por OS original
  const returnsByOriginal = new Map<string, PerfOs[]>();
  for (const o of list) {
    if (!o.rework_of_id || o.status === 'cancelled') continue;
    returnsByOriginal.set(o.rework_of_id, [...(returnsByOriginal.get(o.rework_of_id) ?? []), o]);
  }
  const toReturnInfo = (rw: PerfOs): ReturnInfo => {
    const orig = rw.rework_of_id ? byId.get(rw.rework_of_id) : undefined;
    const days = orig?.completed_at
      ? Math.max(0, Math.round((new Date(rw.created_at).getTime() - new Date(orig.completed_at).getTime()) / 86400000))
      : null;
    return {
      id: rw.id, number: rw.number, title: rw.title, plate: rw.vehicle?.plate ?? null,
      originalId: rw.rework_of_id!, originalNumber: orig?.number ?? null, category: orig ? catOf(orig) : catOf(rw),
      cause: rw.rework_cause, counts: reworkCounts(rw.rework_cause), days,
      reworkMin: rw.status === 'completed' ? worked(rw) : null, createdAt: rw.created_at,
    };
  };

  const rows: MechanicPerf[] = [];
  let unassigned = 0, untimed = 0;
  for (const o of services) {
    if (!o.workshop_mechanic_id) unassigned += 1;
    else if (worked(o) == null) untimed += 1;
  }

  for (const m of mechanics) {
    const mine = services.filter(o => o.workshop_mechanic_id === m.id);
    const reworkExecuted = list.filter(o => isDone(o) && o.rework_of_id && o.workshop_mechanic_id === m.id && inRange(o.completed_at, r)).length;
    // Retornos registrados no período atribuídos a ele (inclui os de serviços antigos)
    const periodReturns = list.filter(o => o.rework_of_id && o.status !== 'cancelled' && o.rework_mechanic_id === m.id && inRange(o.created_at, r));
    if (!mine.length && !reworkExecuted && !periodReturns.length && !m.active) continue;

    let workedMin = 0, timed = 0, laborTimed = 0, pausedMin = 0;
    let estSum = 0, estWorked = 0, withEstimate = 0, onTime = 0;
    const ratios: number[] = [];
    const cats = new Map<string, { times: number[]; count: number; returns: number }>();

    for (const o of mine) {
      const c = catOf(o);
      const cell = cats.get(c) ?? { times: [], count: 0, returns: 0 };
      cell.count += 1;
      const w = worked(o);
      if (w != null && w > 0) {
        workedMin += w; timed += 1; laborTimed += Number(o.labor_cost ?? 0);
        cell.times.push(w);
        const avg = shopAvg.get(c);
        if (avg) ratios.push(w / avg);
        if (o.estimated_hours) {
          withEstimate += 1; estSum += Number(o.estimated_hours) * 60; estWorked += w;
          if (w <= Number(o.estimated_hours) * 60) onTime += 1;
        }
      }
      for (const p of o.pauses ?? []) {
        if (!p.ended_at) continue;
        pausedMin += Math.max(0, Math.round((new Date(p.ended_at).getTime() - new Date(p.started_at).getTime()) / 60000));
      }
      cell.returns += (returnsByOriginal.get(o.id) ?? []).filter(x => reworkCounts(x.rework_cause)).length;
      cats.set(c, cell);
    }

    // Qualidade: dos serviços dele no período, quantos voltaram
    const cohortReturns = mine.flatMap(o => returnsByOriginal.get(o.id) ?? []);
    const returnsCounted = cohortReturns.filter(x => reworkCounts(x.rework_cause)).length;
    const returnsPending = cohortReturns.filter(x => !x.rework_cause).length;
    const returnsOther = cohortReturns.length - returnsCounted - returnsPending;
    const countedInfos = cohortReturns.filter(x => reworkCounts(x.rework_cause)).map(toReturnInfo);
    const returnedOriginals = new Set(cohortReturns.filter(x => reworkCounts(x.rework_cause)).map(x => x.rework_of_id));

    const lowSample = mine.length < MIN_SAMPLE;
    const avgRatio = mean(ratios);

    const categories: CategoryCell[] = [...cats.entries()].map(([category, v]) => {
      const avgMin = v.times.length ? Math.round(mean(v.times)!) : null;
      const shop = shopAvg.get(category);
      return {
        category, count: v.count, avgMin, returns: v.returns,
        vsShop: avgMin != null && shop && v.times.length >= 2 ? Math.round((1 - avgMin / shop) * 100) : null,
      };
    }).sort((a, b) => b.count - a.count);

    const strengths = categories
      .filter(c => c.count >= MIN_CATEGORY && c.returns === 0 && (c.vsShop ?? 0) >= 10)
      .map(c => `${c.category}: ${c.vsShop}% mais rápido que a média, sem retornos`);
    const attention = [
      ...categories.filter(c => c.returns > 0).map(c => `${c.category}: ${c.returns} retorno${c.returns > 1 ? 's' : ''} por falha`),
      ...categories.filter(c => c.count >= MIN_CATEGORY && (c.vsShop ?? 0) <= -15).map(c => `${c.category}: ${Math.abs(c.vsShop!)}% mais lento que a média`),
    ];

    rows.push({
      id: m.id, name: m.name, photo_url: m.photo_url, inactive: !m.active || m.status === 'terminated',
      services: mine.length, timed, workedMin,
      avgMin: timed ? Math.round(workedMin / timed) : null,
      labor: mine.reduce((a, o) => a + Number(o.labor_cost ?? 0), 0),
      laborPerHour: workedMin >= 30 && laborTimed > 0 ? laborTimed / (workedMin / 60) : null,
      withEstimate,
      onTimeRate: withEstimate ? (onTime / withEstimate) * 100 : null,
      efficiency: estWorked > 0 ? Math.round((estSum / estWorked) * 100) : null,
      speed: avgRatio != null && ratios.length >= MIN_CATEGORY ? Math.round((1 - avgRatio) * 100) : null,
      speedBase: ratios.length,
      pausedMin, reworkExecuted,
      returnsCounted, returnsOther, returnsPending,
      returnRate: mine.length ? (returnedOriginals.size / mine.length) * 100 : null,
      firstTimeRight: mine.length ? 100 - (returnedOriginals.size / mine.length) * 100 : null,
      avgDaysToReturn: (() => { const d = countedInfos.map(x => x.days).filter((x): x is number => x != null); return d.length ? Math.round(mean(d)!) : null; })(),
      reworkMin: countedInfos.reduce((a, x) => a + (x.reworkMin ?? 0), 0),
      returns: periodReturns.map(toReturnInfo).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      categories, strengths, attention, lowSample,
    });
  }

  rows.sort((a, b) => b.services - a.services || b.labor - a.labor);

  // ── Tempo por tipo de serviço (a oficina toda, inclusive OS sem responsável) ──
  const nameOf = new Map(mechanics.map(m => [m.id, m.name]));
  const types = new Map<string, PerfOs[]>();
  for (const o of services) types.set(catOf(o), [...(types.get(catOf(o)) ?? []), o]);
  const serviceTypes: ServiceType[] = [...types.entries()].map(([category, list2]) => {
    const times = list2.map(worked).filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
    const withLabor = list2.filter(o => Number(o.labor_cost ?? 0) > 0);
    const timedLabor = list2.filter(o => Number(o.labor_cost ?? 0) > 0 && (worked(o) ?? 0) > 0);
    const laborMin = timedLabor.reduce((a, o) => a + worked(o)!, 0);
    const byMech = new Map<string, { times: number[]; count: number; returns: number }>();
    for (const o of list2) {
      if (!o.workshop_mechanic_id) continue;
      const cur = byMech.get(o.workshop_mechanic_id) ?? { times: [], count: 0, returns: 0 };
      cur.count += 1;
      const w = worked(o);
      if (w != null && w > 0) cur.times.push(w);
      cur.returns += (returnsByOriginal.get(o.id) ?? []).filter(x => reworkCounts(x.rework_cause)).length;
      byMech.set(o.workshop_mechanic_id, cur);
    }
    const avgMin = times.length ? Math.round(mean(times)!) : null;
    const mechanicsOfType: SkillEntry[] = [...byMech.entries()].map(([id, v]) => {
      const a = v.times.length ? Math.round(mean(v.times)!) : null;
      const vsShop = a != null && avgMin && times.length >= MIN_CATEGORY && v.times.length >= 2 ? Math.round((1 - a / avgMin) * 100) : null;
      return {
        id, name: nameOf.get(id) ?? 'Colaborador', count: v.count, timed: v.times.length, avgMin: a, returns: v.returns, vsShop,
        ...skillScore(v.count, vsShop, v.returns),
      };
    }).sort((a, b) => b.score - a.score || b.count - a.count);
    const best = mechanicsOfType.find(x => x.count >= 2) ?? null;
    return {
      category, count: list2.length, timed: times.length,
      avgMin, medianMin: times.length ? times[Math.floor((times.length - 1) / 2)] : null,
      minMin: times[0] ?? null, maxMin: times[times.length - 1] ?? null,
      avgLabor: withLabor.length ? withLabor.reduce((a, o) => a + Number(o.labor_cost), 0) / withLabor.length : null,
      laborPerHour: laborMin >= 15 ? timedLabor.reduce((a, o) => a + Number(o.labor_cost), 0) / (laborMin / 60) : null,
      returns: mechanicsOfType.reduce((a, x) => a + x.returns, 0),
      mechanics: mechanicsOfType,
      best: best && mechanicsOfType.length > 1 ? best : null,
    };
  }).sort((a, b) => b.count - a.count);

  // Destaques (só quem tem amostra suficiente)
  const eligible = rows.filter(x => !x.lowSample);
  const best = <K extends keyof MechanicPerf>(key: K, dir: 1 | -1 = 1) =>
    eligible.filter(x => x[key] != null).sort((a, b) => dir * (Number(b[key]) - Number(a[key])))[0] ?? null;

  const shopReturns = services.filter(o => (returnsByOriginal.get(o.id) ?? []).some(x => reworkCounts(x.rework_cause))).length;
  const allReturnsInPeriod = list.filter(o => o.rework_of_id && o.status !== 'cancelled' && inRange(o.created_at, r));

  return {
    rows,
    serviceTypes,
    categories: [...new Set(rows.flatMap(x => x.categories.map(c => c.category)))]
      .sort((a, b) => (catTimes.get(b)?.length ?? 0) - (catTimes.get(a)?.length ?? 0)),
    shopAvg,
    shop: {
      services: services.length,
      returnRate: services.length ? (shopReturns / services.length) * 100 : null,
      returnsInPeriod: allReturnsInPeriod.length,
      pendingCause: allReturnsInPeriod.filter(o => !o.rework_cause).length,
      unassigned, untimed,
      uncategorized: services.filter(o => !o.category?.trim()).length,
    },
    highlights: {
      productive: best('laborPerHour'),
      fastest: best('speed'),
      quality: eligible.filter(x => x.returnRate != null).sort((a, b) => a.returnRate! - b.returnRate! || b.services - a.services)[0] ?? null,
    },
  };
}
