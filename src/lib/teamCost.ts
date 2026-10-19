/**
 * Custo da equipe de mecânicos no dia (gerencial — NÃO entra no Resultado do período, que já conta
 * salários e comissões quando são pagos/lançados; somar aqui contaria em dobro).
 *
 * Por mecânico:
 * - horas trabalhadas = jornada cadastrada do dia (sem o intervalo); hoje, só o que já passou da jornada;
 *   folga = 0; afastado (férias/atestado…) = 0 hora trabalhada, mas o salário continua sendo pago;
 * - custo por hora = salário ÷ horas contratadas do mês (soma da jornada de cada dia do mês);
 * - custo do dia = custo por hora × horas do dia + comissão do dia (mesma conta da aba "Por dia" das Comissões);
 * - horas produtivas = tempo em OS pelo relógio do serviço (service_order_work_logs). Relógio que ficou
 *   aberto em dia passado é ignorado (não dá para saber quando a pessoa parou).
 */
import { supabase } from '@/lib/supabase';
import { elapsedShiftMinutes, parseSchedule, scheduledMinutesInMonth, scheduledMinutesOn, type Absence } from '@/lib/team';
import { dayKey, daySummary, type HalfData } from '@/lib/commissionDaily';
import type { CostCfg } from '@/lib/costSettings';

const norm = (s?: string | null) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** "Mecânico", "Mecânico chefe"… (eletricista, alinhador, auxiliar, gerente e administrativo ficam de fora) */
export const isMechanicRole = (role?: string | null) => norm(role).includes('mecanic');

export type CostMech = {
  id: string; name: string; active: boolean; status?: string | null; role_title: string | null; work_schedule: string | null;
  commission_revenue_only?: boolean | null;
};
type Log = { workshop_mechanic_id: string | null; started_at: string; ended_at: string | null };

export type CostPerson = {
  id: string; name: string;
  hasSchedule: boolean; hasSalary: boolean;
  /** Jornada prevista do dia e horas realmente contadas, em minutos */
  scheduledMin: number; workedMin: number;
  productiveMin: number | null;
  absent: boolean;
  hourly: number | null;
  salaryCost: number; encargosCost: number; benefitsCost: number; commission: number; total: number;
};
export type TeamCost = {
  people: CostPerson[]; total: number; salaryCost: number; encargosCost: number; benefitsCost: number; commission: number;
  workedMin: number; productiveMin: number | null; revenue: number;
  /** Mecânicos sem jornada ou sem salário: o custo deles não entrou na conta */
  missing: { name: string; why: string }[];
  hasClock: boolean;
};

/** Jornada, salário, afastamentos e relógio do intervalo [fromDay, toDay] (inclusive, AAAA-MM-DD) */
export async function loadTeamCostInputs(wid: string, fromDay: string, toDay: string) {
  const start = new Date(`${fromDay}T00:00:00`);
  const end = new Date(`${toDay}T00:00:00`); end.setDate(end.getDate() + 1);
  const [mechs, salaries, absences] = await Promise.all([
    supabase.from('workshop_mechanics').select('id, name, active, status, role_title, work_schedule, commission_revenue_only').eq('workshop_id', wid).order('name'),
    supabase.from('workshop_mechanic_private').select('mechanic_id, salary').eq('workshop_id', wid),
    supabase.from('workshop_mechanic_absences').select('*').eq('workshop_id', wid).lte('started_on', toDay),
  ]);
  const team = ((mechs.data ?? []) as CostMech[]).filter(m => isMechanicRole(m.role_title) && !m.commission_revenue_only && m.status !== 'terminated');
  const ids = team.map(m => m.id);
  const logs = ids.length
    ? await supabase.from('service_order_work_logs').select('workshop_mechanic_id, started_at, ended_at')
      .eq('executor', 'workshop').in('workshop_mechanic_id', ids)
      .gte('started_at', start.toISOString()).lt('started_at', end.toISOString())
    : { data: [] as Log[] };
  return {
    team,
    salary: new Map(((salaries.data ?? []) as { mechanic_id: string; salary: number | null }[]).map(s => [s.mechanic_id, Number(s.salary ?? 0)])),
    absences: (absences.data ?? []) as Absence[],
    logs: (logs.data ?? []) as Log[],
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildTeamCost(
  day: string,
  inp: { team: CostMech[]; salary: Map<string, number>; absences: Absence[]; logs: Log[] },
  half: HalfData,
  now = new Date(),
  cfg: CostCfg = { encargosPct: 0, benefitsMonthly: 0 },
): TeamCost {
  const date = new Date(`${day}T12:00:00`);
  const isToday = dayKey(now) === day;
  const sum = daySummary(half, day);
  const commissionOf = new Map(sum.people.map(p => [p.id, p.calc.commission]));
  const missing: TeamCost['missing'] = [];
  const hasClock = inp.logs.some(l => dayKey(l.started_at) === day);

  const people: CostPerson[] = inp.team.map(m => {
    const sched = parseSchedule(m.work_schedule);
    const hasSchedule = !!sched && Object.keys(sched.days).length > 0;
    const salary = inp.salary.get(m.id) ?? 0;
    const hasSalary = salary > 0;
    const monthMin = scheduledMinutesInMonth(m.work_schedule, date.getFullYear(), date.getMonth());
    const hourly = hasSalary && monthMin > 0 ? salary / (monthMin / 60) : null;
    const scheduledMin = scheduledMinutesOn(m.work_schedule, date);
    const absent = inp.absences.some(a => a.mechanic_id === m.id && a.started_on <= day && (!a.returned_on || a.returned_on > day));
    const workedMin = absent ? 0 : isToday ? elapsedShiftMinutes(m.work_schedule, now) : scheduledMin;
    // Afastado recebe o salário do dia mesmo sem trabalhar; folga/sem jornada não entra
    const paidMin = absent ? scheduledMin : workedMin;
    const salaryCost = hourly != null ? r2(hourly * paidMin / 60) : 0;
    const commission = r2(commissionOf.get(m.id) ?? 0);
    // Encargos e provisões sobre o salário; benefícios (VT, refeição, uniforme…) rateados pelas horas, como o salário
    const encargosCost = r2(salaryCost * cfg.encargosPct / 100);
    const benefitsCost = monthMin > 0 ? r2((cfg.benefitsMonthly / (monthMin / 60)) * paidMin / 60) : 0;

    let productiveMin: number | null = null;
    if (hasClock) {
      productiveMin = Math.round(inp.logs.filter(l => l.workshop_mechanic_id === m.id && dayKey(l.started_at) === day).reduce((a, l) => {
        if (!l.ended_at && !isToday) return a;
        const end = l.ended_at ? new Date(l.ended_at).getTime() : now.getTime();
        return a + Math.max(0, (end - new Date(l.started_at).getTime()) / 60000);
      }, 0));
    }
    if (!hasSchedule) missing.push({ name: m.name, why: 'sem jornada cadastrada' });
    else if (!hasSalary) missing.push({ name: m.name, why: 'sem salário cadastrado' });
    return { id: m.id, name: m.name, hasSchedule, hasSalary, scheduledMin, workedMin, productiveMin, absent, hourly, salaryCost, encargosCost, benefitsCost, commission, total: r2(salaryCost + encargosCost + benefitsCost + commission) };
  });

  const salaryCost = r2(people.reduce((a, p) => a + p.salaryCost, 0));
  const encargosCost = r2(people.reduce((a, p) => a + p.encargosCost, 0));
  const benefitsCost = r2(people.reduce((a, p) => a + p.benefitsCost, 0));
  const commission = r2(people.reduce((a, p) => a + p.commission, 0));
  return {
    people: people.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    total: r2(salaryCost + encargosCost + benefitsCost + commission), salaryCost, encargosCost, benefitsCost, commission,
    workedMin: people.reduce((a, p) => a + p.workedMin, 0),
    productiveMin: hasClock ? people.reduce((a, p) => a + (p.productiveMin ?? 0), 0) : null,
    revenue: sum.revenue, missing, hasClock,
  };
}

/** 6h30 */
export const fmtHours = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
};

export type TeamCostRange = TeamCost & { days: { day: string; total: number; commission: number; workedMin: number }[] };

/** Soma o custo de cada dia do período (dias futuros ficam de fora) */
export function buildTeamCostRange(
  days: string[],
  inp: Parameters<typeof buildTeamCost>[1],
  half: HalfData,
  now = new Date(),
  cfg: CostCfg = { encargosPct: 0, benefitsMonthly: 0 },
): TeamCostRange {
  const per = days.map(d => ({ day: d, c: buildTeamCost(d, inp, half, now, cfg) }));
  const byId = new Map<string, CostPerson>();
  const missing = new Map<string, string>();
  for (const { c } of per) {
    for (const m of c.missing) missing.set(m.name, m.why);
    for (const p of c.people) {
      const cur = byId.get(p.id);
      if (!cur) { byId.set(p.id, { ...p }); continue; }
      cur.workedMin += p.workedMin; cur.scheduledMin += p.scheduledMin;
      cur.salaryCost = r2(cur.salaryCost + p.salaryCost); cur.commission = r2(cur.commission + p.commission);
      cur.encargosCost = r2(cur.encargosCost + p.encargosCost); cur.benefitsCost = r2(cur.benefitsCost + p.benefitsCost);
      cur.total = r2(cur.salaryCost + cur.encargosCost + cur.benefitsCost + cur.commission);
      cur.productiveMin = p.productiveMin == null ? cur.productiveMin : (cur.productiveMin ?? 0) + p.productiveMin;
      cur.absent = cur.absent || p.absent;
      cur.hourly = p.hourly ?? cur.hourly;
    }
  }
  const people = [...byId.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const salaryCost = r2(people.reduce((a, p) => a + p.salaryCost, 0));
  const encargosCost = r2(people.reduce((a, p) => a + p.encargosCost, 0));
  const benefitsCost = r2(people.reduce((a, p) => a + p.benefitsCost, 0));
  const commission = r2(people.reduce((a, p) => a + p.commission, 0));
  const hasClock = per.some(x => x.c.hasClock);
  return {
    people, total: r2(salaryCost + encargosCost + benefitsCost + commission), salaryCost, encargosCost, benefitsCost, commission,
    workedMin: people.reduce((a, p) => a + p.workedMin, 0),
    productiveMin: hasClock ? people.reduce((a, p) => a + (p.productiveMin ?? 0), 0) : null,
    revenue: r2(per.reduce((a, x) => a + x.c.revenue, 0)),
    missing: [...missing].map(([name, why]) => ({ name, why })),
    hasClock,
    days: per.map(x => ({ day: x.day, total: x.c.total, commission: x.c.commission, workedMin: x.c.workedMin })),
  };
}
