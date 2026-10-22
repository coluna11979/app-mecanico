/**
 * Regras especiais de comissão por item, por loja (tabela commission_item_rules, migration 0074).
 * Mesma lógica da view os_commission_base, para as prévias de "Comissões a pagar":
 * - item cujo nome contém uma palavra-chave com regra → sai da conta dos 4% / 10% de todos;
 * - regra com colaborador + valor → valor fixo para essa pessoa quando ela fez o item,
 *   a cada `per_units` unidades (ex.: R$ 10 a cada 2 cambagens);
 * - regra com colaborador + % (migration 0134) → essa % do valor do item para quem fez (ex.: 10% do alinhamento).
 *   Se a mesma pessoa tiver as duas, vale a maior (igual à view).
 */
import { supabase } from '@/lib/supabase';

export type ItemRule = {
  id: string; workshop_id: string; keyword: string; mechanic_id: string | null;
  amount: number; per_units: number; /** % do valor do item para quem fez (0 = não usa) */ percent: number; active: boolean;
};

/** Sem acento e minúsculo, como na view (translate) */
export const normText = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function loadItemRules(wid: string): Promise<ItemRule[]> {
  const { data } = await supabase.from('commission_item_rules')
    .select('id, workshop_id, keyword, mechanic_id, amount, per_units, percent, active')
    .eq('workshop_id', wid).order('keyword').order('created_at');
  return ((data ?? []) as ItemRule[]).map(r => ({ ...r, amount: Number(r.amount), per_units: Number(r.per_units), percent: Number(r.percent ?? 0) }));
}

const matches = (desc: string, r: ItemRule) => r.active && normText(desc).includes(normText(r.keyword));

/** O item sai da conta dos 4% / 10%? */
export const isExcluded = (desc: string, rules: ItemRule[]) => rules.some(r => matches(desc, r));

/**
 * Extra de quem fez o item: valor fixo e/ou % do valor do item (vale o maior). `lineTotal` = quantidade × preço do item.
 * `label` explica a conta ("10% de R$ 60,00" ou "R$ 5,00 fixo").
 */
export function itemExtra(desc: string, mechanicId: string, qty: number, lineTotal: number, rules: ItemRule[]): { value: number; label: string } {
  let best = { value: 0, label: '' };
  for (const r of rules) {
    if (r.mechanic_id !== mechanicId || !matches(desc, r)) continue;
    if (r.amount > 0) {
      const v = Math.floor(qty / Math.max(1, r.per_units)) * r.amount;
      if (v > best.value) best = { value: v, label: `${brl2(v)} fixo` };
    }
    if (r.percent > 0) {
      const v = r2(lineTotal * r.percent / 100);
      if (v > best.value) best = { value: v, label: `${r.percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de ${brl2(lineTotal)}` };
    }
  }
  return best;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const brl2 = (n: number) => `R$ ${n.toFixed(2).replace('.', ',')}`;
type Line = { description: string; quantity: number | string; unit_price: number | string };
const lineAmt = (i: Line) => r2(Number(i.quantity) * Number(i.unit_price));

/**
 * Comissão de UM serviço pela regra (mesma conta da view os_commission_base, regra atual):
 * "Serviço" (ou "Mão de obra") + peças dele → 4% sobre a soma; mão de obra sem peça → 10%; item com regra
 * da loja sai da conta; valor fixo de regra por item para quem fez. Cliente trouxe a peça → conta como mão de obra (10%).
 */
export function serviceCommission(o: {
  service: Line; parts: Line[]; type: 'servico' | 'mao_de_obra'; who: string;
  brought: boolean; rules: ItemRule[]; pct: { service: number; labor: number };
}): { value: number; base: string } {
  const out: string[] = [];
  let value = 0;
  const keepLabor = !isExcluded(o.service.description, o.rules);
  const keepParts = o.parts.filter(p => !isExcluded(p.description, o.rules));
  // Tem peça da loja → 4% sobre serviço + peças, mesmo se marcado como "Mão de obra"
  if ((o.type === 'servico' || o.parts.length > 0) && !o.brought) {
    const base = (keepLabor ? lineAmt(o.service) : 0) + keepParts.reduce((s, p) => s + lineAmt(p), 0);
    if (base > 0) { value += base * o.pct.service / 100; out.push(`${o.pct.service}% de ${brl2(base)}`); }
  } else if (keepLabor) {
    value += lineAmt(o.service) * o.pct.labor / 100;
    out.push(`${o.pct.labor}% de ${brl2(lineAmt(o.service))}`);
  }
  for (const it of [o.service, ...o.parts]) {
    const fx = itemExtra(it.description, o.who, Number(it.quantity), lineAmt(it), o.rules);
    if (fx.value > 0) { value += fx.value; out.push(`${fx.label} (${it.description})`); }
  }
  return { value: r2(value), base: out.join(' + ') };
}
