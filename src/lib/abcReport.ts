import { CATEGORY_SUBS, partCategory, subOf, type PartCategory } from '@/lib/parts';
import { UNKNOWN_SERVICE, type ServiceExecuted } from '@/lib/serviceCatalog';

/**
 * Curva ABC (relatório): ordena os itens vendidos pelo que mais pesa e separa em
 * A = até 80% do total, B = de 80% a 95%, C = o resto. A classe é decidida pelo acumulado
 * ANTES do item entrar, então o item que cruza o 80% ainda é A.
 */
export type AbcClass = 'A' | 'B' | 'C';
export type AbcMetric = 'faturamento' | 'lucro' | 'quantidade';
/** Como agrupar: cada item, por categoria, ou por categoria › subcategoria */
export type AbcLevel = 'item' | 'categoria' | 'sub';

export type AbcBase = {
  key: string; label: string; code: string; category: string;
  qty: number; revenue: number; cost: number;
  /** Quantas vendas estão sem custo cadastrado (o lucro delas não é confiável) */
  noCost: number; orders: number;
};
export type AbcLine = AbcBase & { value: number; profit: number; pct: number; share: number; cumulative: number; cls: AbcClass };

/** Item de OS concluída, como vem do banco */
export type SoldItem = {
  service_order_id: string; kind: 'part' | 'labor'; description: string;
  quantity: number; unit_price: number; unit_cost: number | null;
  part: { name: string; code: string | null; category: PartCategory; subcategory?: string | null } | null;
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Uma linha por peça (pelo código; sem código, pelo nome — assim juntar várias lojas funciona) */
const SEM_CAT = 'Sem categoria';
const catLabel = (i: SoldItem) => (i.part?.category ? partCategory(i.part.category).label : SEM_CAT);
const subLabel = (i: SoldItem) => {
  const p = i.part;
  if (!p?.category) return 'Peça sem cadastro';
  const v = subOf(p.category, { category: p.category, name: p.name, subcategory: p.subcategory });
  return v ? (CATEGORY_SUBS[p.category]?.find(o => o.value === v)?.label ?? v) : 'Outros';
};

export function partsBase(items: SoldItem[], level: AbcLevel = 'item'): AbcBase[] {
  const map = new Map<string, AbcBase & { ids: Set<string> }>();
  for (const i of items) {
    if (i.kind !== 'part') continue;
    const name = (i.part?.name ?? i.description ?? '').trim() || 'Peça sem nome';
    const code = (i.part?.code ?? '').trim();
    const grouped = level !== 'item';
    const key = level === 'categoria' ? `k:${norm(catLabel(i))}` : level === 'sub' ? `s:${norm(catLabel(i))}|${norm(subLabel(i))}` : code ? `c:${norm(code)}` : `n:${norm(name)}`;
    const q = Number(i.quantity), value = q * Number(i.unit_price), cost = q * Number(i.unit_cost ?? 0);
    const cur = map.get(key) ?? { key, label: level === 'categoria' ? catLabel(i) : level === 'sub' ? subLabel(i) : name, code: grouped ? '' : code, category: level === 'categoria' ? '' : level === 'sub' ? catLabel(i) : i.part ? partCategory(i.part.category).label : '', qty: 0, revenue: 0, cost: 0, noCost: 0, orders: 0, ids: new Set<string>() };
    cur.qty += q; cur.revenue += value; cur.cost += cost;
    if (value > 0 && !(Number(i.unit_cost ?? 0) > 0)) cur.noCost += 1;
    cur.ids.add(i.service_order_id);
    map.set(key, cur);
  }
  return [...map.values()].map(({ ids, ...x }) => ({ ...x, orders: ids.size }));
}

/** Serviços já agrupados por tipo (a mesma regra do Painel de vendas); "não identificado" fica de fora */
export function servicesBase(rows: ServiceExecuted[]): AbcBase[] {
  return rows.filter(r => r.identified).map(r => ({
    key: r.name, label: r.name, code: '', category: '',
    qty: r.orders, revenue: r.revenue, cost: r.partsCost ?? 0, noCost: r.partsNoCost ?? 0, orders: r.orders,
  }));
}

/** Serviço aberto em subcategorias: cada tipo de serviço › o que foi vendido nele (peças por subcategoria; mão de obra à parte) */
export function servicesSubBase(lines: { osId: string; name: string; value: number; cost: number; kind: 'part' | 'labor'; src: unknown }[]): AbcBase[] {
  const map = new Map<string, AbcBase & { ids: Set<string> }>();
  for (const l of lines) {
    if (l.name === UNKNOWN_SERVICE) continue;
    const it = l.src as SoldItem;
    const sub = l.kind === 'labor' ? 'Mão de obra' : subLabel(it);
    const key = `${l.name}|${sub}`;
    const cur = map.get(key) ?? { key, label: sub, code: '', category: l.name, qty: 0, revenue: 0, cost: 0, noCost: 0, orders: 0, ids: new Set<string>() };
    cur.revenue += l.value; cur.cost += l.cost;
    if (l.kind === 'part' && l.value > 0 && l.cost <= 0) cur.noCost += 1;
    cur.ids.add(l.osId);
    map.set(key, cur);
  }
  return [...map.values()].map(({ ids, ...x }) => ({ ...x, qty: ids.size, orders: ids.size }));
}

export function rankAbc(base: AbcBase[], metric: AbcMetric) {
  const valueOf = (b: AbcBase) => (metric === 'faturamento' ? b.revenue : metric === 'lucro' ? b.revenue - b.cost : b.qty);
  const known = base.map(b => ({ b, v: valueOf(b) })).filter(x => x.v > 0).sort((a, c) => c.v - a.v);
  const total = known.reduce((t, x) => t + x.v, 0);
  let acc = 0;
  const rows: AbcLine[] = known.map(({ b, v }) => {
    const before = total ? (acc / total) * 100 : 0;
    acc += v;
    const profit = b.revenue - b.cost;
    return {
      ...b, value: v, profit, pct: b.revenue ? (profit / b.revenue) * 100 : 0,
      share: total ? (v / total) * 100 : 0, cumulative: total ? (acc / total) * 100 : 0,
      cls: before < 80 ? 'A' : before < 95 ? 'B' : 'C',
    };
  });
  const groups = (['A', 'B', 'C'] as AbcClass[]).map(c => {
    const g = rows.filter(r => r.cls === c);
    const sum = g.reduce((t, r) => t + r.value, 0);
    return { cls: c, count: g.length, value: sum, share: total ? (sum / total) * 100 : 0 };
  });
  return { rows, total, groups };
}
