/**
 * Fechamento da folha (por competência "AAAA-MM").
 *
 * Líquido = salário + comissão − faltas − outros descontos − vales do mês − vale que sobrou do mês anterior.
 * - Comissão: % do colaborador sobre a mão de obra das OS que ele concluiu no mês.
 * - Faltas: salário ÷ 30 × dias.
 * - Vales: tirados no caixa dentro do mês.
 * - Se os descontos passam do que há para receber, a diferença vai para o mês seguinte.
 */
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

export type PayrollItem = {
  id: string; mechanic_id: string; competence: string; base_salary: number; commission: number;
  absence_days: number; absence_discount: number; other_discount: number; vales: number;
  carry_in: number; net: number; carry_out: number; payable_id: string | null; notes: string | null;
};

export type PayrollRow = {
  mechanicId: string;
  name: string;
  active: boolean;
  base: number;            // salário do cadastro
  commissionPct: number;
  commission: number;      // calculada das OS do mês
  vales: number;           // vales do caixa no mês
  carryIn: number;         // vale que sobrou do mês anterior
  closed: PayrollItem | null;
  /** Salário do mês já lançado à mão em Contas a pagar */
  manual: { id: string; amount: number } | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function monthRange(competence: string) {
  const [y, m] = competence.split('-').map(Number);
  return { from: new Date(y, m - 1, 1).toISOString(), to: new Date(y, m, 1).toISOString() };
}

export function calcNet(p: { base: number; commission: number; absenceDays: number; other: number; vales: number; carryIn: number }) {
  const absence = r2((p.base / 30) * p.absenceDays);
  const gross = r2(p.base + p.commission);
  const deductions = r2(absence + p.other + p.vales + p.carryIn);
  return {
    absence, gross, deductions,
    net: r2(Math.max(0, gross - deductions)),
    carryOut: r2(Math.max(0, deductions - gross)),
  };
}

/** Detalhamento que vai na observação da conta a pagar */
export function breakdown(p: { base: number; commission: number; commissionPct: number; absenceDays: number; absence: number; other: number; vales: number; carryIn: number; net: number; carryOut: number }) {
  const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return [
    `Salário ${brl(p.base)}`,
    p.commission > 0 ? `+ comissão ${brl(p.commission)} (${p.commissionPct}%)` : null,
    p.absence > 0 ? `− faltas ${brl(p.absence)} (${p.absenceDays} dia${p.absenceDays === 1 ? '' : 's'})` : null,
    p.other > 0 ? `− outros descontos ${brl(p.other)}` : null,
    p.vales > 0 ? `− vales ${brl(p.vales)}` : null,
    p.carryIn > 0 ? `− vale do mês anterior ${brl(p.carryIn)}` : null,
    `= líquido ${brl(p.net)}`,
    p.carryOut > 0 ? `(sobra ${brl(p.carryOut)} para o próximo mês)` : null,
  ].filter(Boolean).join(' · ');
}

/** Tudo o que a tela precisa para fechar a folha do mês */
export async function loadPayroll(wid: string, competence: string): Promise<PayrollRow[]> {
  const { from, to } = monthRange(competence);
  const [mechs, priv, os, vales, prev, cur, manual] = await Promise.all([
    supabase.from('workshop_mechanics').select('id, name, commission_percent, active').eq('workshop_id', wid).order('name'),
    supabase.from('workshop_mechanic_private').select('mechanic_id, salary').eq('workshop_id', wid),
    fetchAll((a, b) => supabase.from('service_orders').select('id, workshop_mechanic_id, labor_cost')
      .eq('workshop_id', wid).eq('status', 'completed').is('quote_status', null)
      .gte('completed_at', from).lt('completed_at', to).not('workshop_mechanic_id', 'is', null)
      .order('id').range(a, b)),
    fetchAll((a, b) => supabase.from('cash_entries').select('id, mechanic_id, amount')
      .eq('workshop_id', wid).eq('kind', 'vale').is('cancelled_at', null)
      .gte('created_at', from).lt('created_at', to).order('id').range(a, b)),
    supabase.from('payroll_items').select('mechanic_id, competence, carry_out').eq('workshop_id', wid)
      .lt('competence', competence).order('competence', { ascending: false }),
    supabase.from('payroll_items').select('*').eq('workshop_id', wid).eq('competence', competence),
    supabase.from('payables').select('id, mechanic_id, amount').eq('workshop_id', wid)
      .eq('category', 'Salários').eq('competence', competence).is('cancelled_at', null).not('mechanic_id', 'is', null),
  ]);

  const salary = new Map(((priv.data ?? []) as { mechanic_id: string; salary: number | null }[]).map(p => [p.mechanic_id, Number(p.salary ?? 0)]));
  const labor = new Map<string, number>();
  for (const o of (os.data ?? []) as { workshop_mechanic_id: string; labor_cost: number | null }[]) {
    labor.set(o.workshop_mechanic_id, (labor.get(o.workshop_mechanic_id) ?? 0) + Number(o.labor_cost ?? 0));
  }
  const valeBy = new Map<string, number>();
  for (const v of (vales.data ?? []) as { mechanic_id: string | null; amount: number }[]) {
    if (v.mechanic_id) valeBy.set(v.mechanic_id, (valeBy.get(v.mechanic_id) ?? 0) + Number(v.amount));
  }
  // Último fechamento anterior de cada um → o que sobrou de vale
  const carry = new Map<string, number>();
  for (const p of (prev.data ?? []) as { mechanic_id: string; carry_out: number }[]) {
    if (!carry.has(p.mechanic_id)) carry.set(p.mechanic_id, Number(p.carry_out));
  }
  const closed = new Map(((cur.data ?? []) as PayrollItem[]).map(i => [i.mechanic_id, i]));
  const manualBy = new Map(((manual.data ?? []) as { id: string; mechanic_id: string; amount: number }[]).map(p => [p.mechanic_id, { id: p.id, amount: Number(p.amount) }]));

  return ((mechs.data ?? []) as { id: string; name: string; commission_percent: number | null; active: boolean }[])
    // Inativo só entra se teve movimento no mês (comissão ou vale) ou já foi fechado
    .filter(m => m.active || closed.has(m.id) || (labor.get(m.id) ?? 0) > 0 || (valeBy.get(m.id) ?? 0) > 0)
    .map(m => {
      const pct = Number(m.commission_percent ?? 0);
      return {
        mechanicId: m.id, name: m.name, active: m.active,
        base: salary.get(m.id) ?? 0,
        commissionPct: pct,
        commission: r2((labor.get(m.id) ?? 0) * pct / 100),
        vales: r2(valeBy.get(m.id) ?? 0),
        carryIn: r2(carry.get(m.id) ?? 0),
        closed: closed.get(m.id) ?? null,
        manual: manualBy.get(m.id) ?? null,
      };
    });
}
