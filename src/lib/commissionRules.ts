/**
 * Regras especiais de comissão por item, por loja (tabela commission_item_rules, migration 0074).
 * Mesma lógica da view os_commission_base, para as prévias de "Comissões a pagar":
 * - item cujo nome contém uma palavra-chave com regra → sai da conta dos 4% / 10% de todos;
 * - regra com colaborador + valor → valor fixo para essa pessoa quando ela fez o item,
 *   a cada `per_units` unidades (ex.: R$ 10 a cada 2 cambagens).
 */
import { supabase } from '@/lib/supabase';

export type ItemRule = {
  id: string; workshop_id: string; keyword: string; mechanic_id: string | null;
  amount: number; per_units: number; active: boolean;
};

/** Sem acento e minúsculo, como na view (translate) */
export const normText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function loadItemRules(wid: string): Promise<ItemRule[]> {
  const { data } = await supabase.from('commission_item_rules')
    .select('id, workshop_id, keyword, mechanic_id, amount, per_units, active')
    .eq('workshop_id', wid).order('keyword').order('created_at');
  return ((data ?? []) as ItemRule[]).map(r => ({ ...r, amount: Number(r.amount), per_units: Number(r.per_units) }));
}

const matches = (desc: string, r: ItemRule) => r.active && normText(desc).includes(normText(r.keyword));

/** O item sai da conta dos 4% / 10%? */
export const isExcluded = (desc: string, rules: ItemRule[]) => rules.some(r => matches(desc, r));

/** Valor fixo de quem fez o item (0 se não tiver) */
export function fixedFor(desc: string, mechanicId: string, qty: number, rules: ItemRule[]) {
  let best = 0;
  for (const r of rules) {
    if (r.mechanic_id !== mechanicId || !(r.amount > 0) || !matches(desc, r)) continue;
    best = Math.max(best, Math.floor(qty / Math.max(1, r.per_units)) * r.amount);
  }
  return best;
}
