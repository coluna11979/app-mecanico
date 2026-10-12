import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

/**
 * Metas mensais. Loja: faturamento do mês (OS concluídas). Colaborador: valor das OS concluídas
 * em que ele é o responsável (retornos por garantia não contam). Mês sem meta própria repete a do
 * último mês definido; meta 0 encerra a repetição.
 */

export type Goal = { mechanic_id: string | null; competence: string; target: number; inherited: boolean };
export const SHOP = 'shop';

export const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export function monthRange(key: string) {
  const [y, m] = key.split('-').map(Number);
  return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
}
export const monthLabel = (key: string) => {
  const { from } = monthRange(key);
  return from.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

/** Metas valendo no mês: a do próprio mês ou a última definida antes dele */
export async function loadGoals(wid: string, key: string): Promise<Map<string, Goal>> {
  const { data } = await supabase.from('workshop_goals')
    .select('mechanic_id, competence, target')
    .eq('workshop_id', wid).lte('competence', key).order('competence', { ascending: false });
  const out = new Map<string, Goal>();
  for (const g of (data ?? []) as { mechanic_id: string | null; competence: string; target: number }[]) {
    const k = g.mechanic_id ?? SHOP;
    if (out.has(k)) continue; // a mais recente vence
    out.set(k, { ...g, target: Number(g.target), inherited: g.competence !== key });
  }
  for (const [k, g] of out) if (g.target <= 0) out.delete(k);
  return out;
}

export async function saveGoal(wid: string, mechanicId: string | null, key: string, target: number) {
  return supabase.from('workshop_goals').upsert(
    { workshop_id: wid, mechanic_id: mechanicId, competence: key, target, updated_at: new Date().toISOString() },
    { onConflict: 'workshop_id,competence,scope' },
  );
}

export type MonthSale = { id: string; price: number; workshop_mechanic_id: string | null; rework_of_id: string | null };

/** OS concluídas no mês (só 4 campos): base do que já foi feito */
export async function loadMonthSales(wid: string, key: string): Promise<MonthSale[]> {
  const { from, to } = monthRange(key);
  const { data } = await fetchAll((a, b) => supabase.from('service_orders')
    .select('id, price, workshop_mechanic_id, rework_of_id')
    .eq('workshop_id', wid).eq('status', 'completed').is('quote_status', null)
    .gte('completed_at', from.toISOString()).lt('completed_at', to.toISOString())
    .order('id').range(a, b));
  return ((data ?? []) as unknown as MonthSale[]).map(s => ({ ...s, price: Number(s.price) }));
}

export const shopAchieved = (s: MonthSale[]) => s.reduce((a, x) => a + x.price, 0);
export const mechanicAchieved = (s: MonthSale[], id: string) =>
  s.filter(x => x.workshop_mechanic_id === id && !x.rework_of_id).reduce((a, x) => a + x.price, 0);

/** Andamento da meta: percentual, projeção pelo ritmo (dias úteis = segunda a sábado) e o que falta por dia */
export function goalProgress(achieved: number, target: number, now = new Date()) {
  const { from, to } = monthRange(monthKey(now));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let total = 0, worked = 0;
  for (const d = new Date(from); d < to; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) continue;
    total += 1;
    if (d <= today) worked += 1;
  }
  const remaining = Math.max(0, total - worked);
  const projection = worked > 0 ? (achieved / worked) * total : 0;
  const missing = Math.max(0, target - achieved);
  const status: 'done' | 'ontrack' | 'close' | 'behind' =
    achieved >= target ? 'done' : projection >= target ? 'ontrack' : projection >= target * 0.8 ? 'close' : 'behind';
  return {
    pct: target > 0 ? Math.min(100, (achieved / target) * 100) : 0,
    rawPct: target > 0 ? (achieved / target) * 100 : 0,
    projection, missing, remaining, worked, total, status,
    perDay: remaining > 0 ? missing / remaining : missing,
  };
}

/** Metas e o que já foi feito no mês, para o componente que precisar */
export function useMonthGoals(wid: string | null | undefined) {
  const key = monthKey();
  const [goals, setGoals] = useState<Map<string, Goal> | null>(null);
  const [sales, setSales] = useState<MonthSale[]>([]);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!wid) return;
    try {
      const [g, s] = await Promise.all([loadGoals(wid, key), loadMonthSales(wid, key)]);
      setGoals(g); setSales(s); setFailed(false);
    } catch { setFailed(true); setGoals(new Map()); }
  }, [wid, key]);
  useEffect(() => { reload(); }, [reload]);

  return { key, goals, sales, failed, reload };
}
