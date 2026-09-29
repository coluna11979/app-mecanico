/**
 * Cadastro de peças — preço de venda a partir do custo.
 *
 * Margem aqui é sobre o custo (markup): custo R$ 100 com 100% → venda R$ 200.
 * Preço da peça: preço fixo, se tiver; senão custo + margem da peça; senão custo + margem padrão.
 */
import { supabase } from '@/lib/supabase';

export type WorkshopPart = {
  id: string; workshop_id: string; name: string; code: string | null; brand: string | null;
  unit: string; supplier: string | null; supplier_id: string | null; cost: number;
  margin_percent: number | null; sale_price: number | null;
  stock_qty: number; min_qty: number; category: PartCategory;
  active: boolean; created_at: string; updated_at: string;
};

/**
 * Categoria geral da peça. Mesma lista da migration 0044 (check constraint);
 * peça salva sem categoria ganha uma pelo nome, no banco (guess_part_category).
 */
export const PART_CATEGORIES = [
  { value: 'freios',          label: 'Freios',             icon: '🛑' },
  { value: 'suspensao',       label: 'Suspensão e direção', icon: '🔧' },
  { value: 'motor',           label: 'Motor',              icon: '⚙️' },
  { value: 'ignicao_injecao', label: 'Ignição e injeção',  icon: '⚡' },
  { value: 'eletrica',        label: 'Elétrica',           icon: '🔋' },
  { value: 'oleos_filtros',   label: 'Óleos e filtros',    icon: '🛢️' },
  { value: 'arrefecimento',   label: 'Arrefecimento',      icon: '🌡️' },
  { value: 'transmissao',     label: 'Embreagem e câmbio', icon: '🕹️' },
  { value: 'rodas',           label: 'Rodas e pneus',      icon: '🛞' },
  { value: 'escapamento',     label: 'Escapamento',        icon: '💨' },
  { value: 'ar_condicionado', label: 'Ar-condicionado',    icon: '❄️' },
  { value: 'carroceria',      label: 'Carroceria',         icon: '🚗' },
  { value: 'outros',          label: 'Outros',             icon: '📦' },
] as const;

export type PartCategory = typeof PART_CATEGORIES[number]['value'];

export const partCategory = (c: string | null | undefined) =>
  PART_CATEGORIES.find(x => x.value === c) ?? PART_CATEGORIES[PART_CATEGORIES.length - 1];

export const DEFAULT_MARGIN = 100;

export const UNITS = ['un', 'par', 'jogo', 'kit', 'litro', 'ml', 'kg', 'metro'];

export type PriceMode = 'default' | 'margin' | 'fixed';

export const priceModeOf = (p: Pick<WorkshopPart, 'margin_percent' | 'sale_price'>): PriceMode =>
  p.sale_price != null ? 'fixed' : p.margin_percent != null ? 'margin' : 'default';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const priceFromMargin = (cost: number, margin: number) => round2(cost * (1 + margin / 100));

/** Preço de venda da peça */
export function salePriceOf(p: Pick<WorkshopPart, 'cost' | 'margin_percent' | 'sale_price'>, defaultMargin: number) {
  if (p.sale_price != null) return Number(p.sale_price);
  return priceFromMargin(Number(p.cost), p.margin_percent != null ? Number(p.margin_percent) : defaultMargin);
}

/** Margem sobre o custo (%) — null quando não há custo para comparar */
export function marginOf(cost: number | null | undefined, price: number) {
  if (cost == null || !(cost > 0)) return null;
  return ((price - cost) / cost) * 100;
}

export const fmtPct = (n: number | null) => (n == null ? '—' : `${Math.round(n)}%`);

/** Margem padrão da oficina (100% se nunca foi definida) */
export async function loadDefaultMargin(workshopId: string) {
  const { data } = await supabase.from('workshop_pricing').select('part_margin_percent').eq('workshop_id', workshopId).maybeSingle();
  return data ? Number((data as { part_margin_percent: number }).part_margin_percent) : DEFAULT_MARGIN;
}

/** "2.000" → "2"; "1.5" → "1,5" */
export const fmtQty = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Estoque abaixo do mínimo (só quando há mínimo definido) */
export const needsRestock = (p: Pick<WorkshopPart, 'stock_qty' | 'min_qty'>) =>
  Number(p.min_qty) > 0 && Number(p.stock_qty) <= Number(p.min_qty);
