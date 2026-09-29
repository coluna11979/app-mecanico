/**
 * Comissão quinzenal: 1ª quinzena (OS concluídas do dia 1 ao 15) paga no dia 15;
 * 2ª quinzena (dia 16 ao fim do mês) paga no dia 30 (em fevereiro, no último dia).
 * A regra de quanto cada um ganha está em lib/commission.ts (por item da OS).
 * Vales não entram aqui: são descontados do salário na folha do mês.
 */
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import {
  COMMISSION_COLS, baseByMechanic, commissionFor, commissionRule, hasCommission, loadCommissionBase,
  type CommissionCalc, type CommissionMech,
} from '@/lib/commission';

export type Half = 1 | 2;

export type CommissionClosing = {
  id: string; mechanic_id: string; competence: string; half: Half;
  labor: number; labor_own: number; parts: number; revenue: number; commission: number;
  rule: string | null; payable_id: string | null;
};

export type CommissionRow = {
  mechanicId: string; name: string; active: boolean; rule: string;
  calc: CommissionCalc;
  closed: CommissionClosing | null;
};

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

/** Intervalo da quinzena (horário local) */
export function halfRange(competence: string, half: Half) {
  const [y, m] = competence.split('-').map(Number);
  const from = half === 1 ? new Date(y, m - 1, 1) : new Date(y, m - 1, 16);
  const to = half === 1 ? new Date(y, m - 1, 16) : new Date(y, m, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Dia do pagamento: 15 ou 30 (último dia, se o mês for mais curto) */
export function payDate(competence: string, half: Half) {
  const [y, m] = competence.split('-').map(Number);
  return `${competence}-${pad(half === 1 ? 15 : Math.min(30, lastDay(y, m)))}`;
}

/** "1ª quinzena 09/2026 (01 a 15)" */
export function halfLabel(competence: string, half: Half, withDays = false) {
  const [y, m] = competence.split('-').map(Number);
  const days = half === 1 ? '01 a 15' : `16 a ${lastDay(y, m)}`;
  return `${half}ª quinzena ${competence.slice(5)}/${competence.slice(0, 4)}${withDays ? ` (${days})` : ''}`;
}

/** Quinzena que está fechando agora: até o dia 15 → 1ª do mês; depois → 2ª */
export function currentHalf(d = new Date()): { competence: string; half: Half } {
  return { competence: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, half: d.getDate() <= 15 ? 1 : 2 };
}

export function shiftHalf(competence: string, half: Half, dir: -1 | 1): { competence: string; half: Half } {
  if (dir === 1 && half === 1) return { competence, half: 2 };
  if (dir === -1 && half === 2) return { competence, half: 1 };
  const [y, m] = competence.split('-').map(Number);
  const d = new Date(y, m - 1 + dir, 1);
  return { competence: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, half: dir === 1 ? 1 : 2 };
}

/** Comissão de cada colaborador na quinzena + o que já foi fechado */
export async function loadCommissionHalf(wid: string, competence: string, half: Half): Promise<CommissionRow[]> {
  const { from, to } = halfRange(competence, half);
  const [mechs, base, sales, closed] = await Promise.all([
    supabase.from('workshop_mechanics').select(`id, name, active, ${COMMISSION_COLS}`).eq('workshop_id', wid).order('name'),
    loadCommissionBase(wid, from, to),
    fetchAll((a, b) => supabase.from('service_orders').select('id, price')
      .eq('workshop_id', wid).eq('status', 'completed').is('quote_status', null)
      .gte('completed_at', from).lt('completed_at', to).order('id').range(a, b)),
    supabase.from('commission_closings').select('*').eq('workshop_id', wid).eq('competence', competence).eq('half', half),
  ]);
  const done = baseByMechanic(base);
  const revenue = ((sales.data ?? []) as { price: number }[]).reduce((a, o) => a + Number(o.price), 0);
  const closedBy = new Map(((closed.data ?? []) as CommissionClosing[]).map(c => [c.mechanic_id, c]));

  return ((mechs.data ?? []) as unknown as ({ id: string; name: string; active: boolean } & CommissionMech)[])
    .map(m => ({ m, calc: commissionFor(m, done.get(m.id), revenue) }))
    .filter(({ m, calc }) => closedBy.has(m.id) || calc.commission > 0 || (m.active && hasCommission(m)))
    .map(({ m, calc }) => ({
      mechanicId: m.id, name: m.name, active: m.active, rule: commissionRule(m),
      calc, closed: closedBy.get(m.id) ?? null,
    }));
}
