/**
 * Comissão por dia (só consulta: o pagamento continua sendo fechado por quinzena).
 * Usa a mesma conta da quinzena (lib/commission.ts): a comissão conta no dia em que o serviço foi
 * finalizado (done_at da view os_commission_base); a % sobre o faturamento da loja (gerente) usa o
 * faturamento das OS concluídas naquele dia.
 * Carrega a quinzena inteira de uma vez — trocar de dia dentro dela não consulta nada de novo.
 */
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import {
  COMMISSION_COLS, baseByMechanic, commissionFor, commissionRule, loadCommissionBase, workedIn,
  type CommissionBaseRow, type CommissionCalc, type CommissionMech,
} from '@/lib/commission';
import { halfRange, type Half } from '@/lib/commissionClosing';

type Mech = { id: string; name: string; active: boolean } & CommissionMech;
export type DayOs = { id: string; number: number | null; title: string; customer: string | null; price: number };
type Sale = DayOs & { completed_at: string };

export type HalfData = { mechs: Mech[]; base: CommissionBaseRow[]; sales: Sale[]; osInfo: Map<string, DayOs> };

const pad = (n: number) => String(n).padStart(2, '0');
/** AAAA-MM-DD no horário local */
export const dayKey = (iso: string | Date) => {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** Quinzena a que o dia pertence */
export const halfOfDay = (day: string): { competence: string; half: Half } => ({ competence: day.slice(0, 7), half: Number(day.slice(8, 10)) <= 15 ? 1 : 2 });

type OsRow = { id: string; number: number | null; title: string; price: number; completed_at?: string; customer: { full_name: string } | null };
const toInfo = (o: OsRow): DayOs => ({ id: o.id, number: o.number, title: o.title, customer: o.customer?.full_name ?? null, price: Number(o.price) });

export async function loadHalfData(wid: string, competence: string, half: Half): Promise<HalfData> {
  const { from, to } = halfRange(competence, half);
  const [mechs, base, sales] = await Promise.all([
    supabase.from('workshop_mechanics').select(`id, name, active, ${COMMISSION_COLS}`).eq('workshop_id', wid).order('name'),
    loadCommissionBase(wid, from, to),
    fetchAll((a, b) => supabase.from('service_orders').select('id, number, title, price, completed_at, customer:customers(full_name)')
      .eq('workshop_id', wid).eq('status', 'completed').is('quote_status', null)
      .gte('completed_at', from).lt('completed_at', to).order('id').range(a, b)),
  ]);
  const saleRows = ((sales.data ?? []) as unknown as OsRow[]).map(o => ({ ...toInfo(o), completed_at: o.completed_at! }));
  const osInfo = new Map<string, DayOs>(saleRows.map(s => [s.id, s]));
  // Serviço finalizado na quinzena em OS que concluiu fora dela: busca só os dados de exibição
  const missing = [...new Set(base.map(b => b.service_order_id))].filter(id => !osInfo.has(id));
  for (let i = 0; i < missing.length; i += 80) {
    const { data } = await supabase.from('service_orders').select('id, number, title, price, customer:customers(full_name)').in('id', missing.slice(i, i + 80));
    for (const o of (data ?? []) as unknown as OsRow[]) osInfo.set(o.id, toInfo(o));
  }
  return { mechs: (mechs.data ?? []) as unknown as Mech[], base, sales: saleRows, osInfo };
}

export type DayLine = { os: DayOs; commission: number };
export type DayPerson = { id: string; name: string; active: boolean; rule: string; calc: CommissionCalc; lines: DayLine[]; orders: number };
export type DaySummary = { day: string; people: DayPerson[]; total: number; orders: number; revenue: number };

/** Quanto cada colaborador ganhou de comissão no dia, com as OS que geraram */
export function daySummary(d: HalfData, day: string): DaySummary {
  const base = d.base.filter(r => r.done_at && dayKey(r.done_at) === day);
  const revenue = d.sales.filter(s => dayKey(s.completed_at) === day).reduce((a, s) => a + s.price, 0);
  const done = baseByMechanic(base);
  const people: DayPerson[] = [];
  for (const m of d.mechs) {
    const calc = commissionFor(m, done.get(m.id), revenue);
    if (!(calc.commission > 0 || workedIn(calc))) continue;
    const byOs = new Map<string, CommissionBaseRow[]>();
    for (const r of base) if (r.mechanic_id === m.id) byOs.set(r.service_order_id, [...(byOs.get(r.service_order_id) ?? []), r]);
    const lines: DayLine[] = [...byOs.entries()].map(([osId, rows]) => ({
      os: d.osInfo.get(osId) ?? { id: osId, number: null, title: 'OS', customer: null, price: 0 },
      commission: commissionFor(m, baseByMechanic(rows).get(m.id), 0).commission,
    })).sort((a, b) => b.commission - a.commission);
    people.push({ id: m.id, name: m.name, active: m.active, rule: commissionRule(m, { worked: workedIn(calc), manual: calc.manual > 0 }), calc, lines, orders: lines.length });
  }
  people.sort((a, b) => b.calc.commission - a.calc.commission);
  return {
    day, people, revenue,
    total: Math.round(people.reduce((a, p) => a + p.calc.commission, 0) * 100) / 100,
    orders: new Set(base.map(r => r.service_order_id)).size,
  };
}

/** Comissão de cada dia da quinzena (só os dias com movimento) */
export function daysOfHalf(d: HalfData) {
  const days = [...new Set([
    ...d.base.filter(r => r.done_at).map(r => dayKey(r.done_at!)),
  ])].sort();
  return days.map(day => { const s = daySummary(d, day); return { day, total: s.total, orders: s.orders }; });
}
