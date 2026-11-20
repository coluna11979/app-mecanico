/**
 * Cadastro de peças — preço de venda a partir do custo.
 *
 * Margem aqui é sobre o custo (markup): custo R$ 100 com 100% → venda R$ 200.
 * Preço da peça: preço fixo, se tiver; senão custo + margem da peça; senão margem da categoria; senão margem padrão.
 */
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

export type WorkshopPart = {
  id: string; workshop_id: string; name: string; code: string | null; brand: string | null;
  unit: string; supplier: string | null; supplier_id: string | null; cost: number;
  margin_percent: number | null; sale_price: number | null;
  stock_qty: number; min_qty: number; category: PartCategory;
  universal: boolean; active: boolean; created_at: string; updated_at: string;
  /** De onde veio: 'planilha' = cadastro importado do sistema antigo; null = cadastro normal */
  origin?: string | null;
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
  { value: 'cubo',            label: 'Cubo de roda',       icon: '🔘' },
  { value: 'rolamento',       label: 'Rolamento',          icon: '⭕' },
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

/** Margens da oficina: a padrão e, por cima dela, a de cada categoria (vazio = usa a padrão) */
export type Margins = { base: number; byCategory: Partial<Record<PartCategory, number>> };

/** Margem que vale para uma peça sem margem própria */
export function categoryMargin(m: number | Margins, category?: string | null) {
  if (typeof m === 'number') return m;
  const c = category ? m.byCategory[category as PartCategory] : undefined;
  return c != null ? Number(c) : m.base;
}

/** Preço de venda da peça */
export function salePriceOf(
  p: Pick<WorkshopPart, 'cost' | 'margin_percent' | 'sale_price'> & { category?: string | null },
  margins: number | Margins,
) {
  if (p.sale_price != null) return Number(p.sale_price);
  return priceFromMargin(Number(p.cost), p.margin_percent != null ? Number(p.margin_percent) : categoryMargin(margins, p.category));
}

/** Margem sobre o custo (%) — null quando não há custo para comparar */
export function marginOf(cost: number | null | undefined, price: number) {
  if (cost == null || !(cost > 0)) return null;
  return ((price - cost) / cost) * 100;
}

export const fmtPct = (n: number | null) => (n == null ? '—' : `${Math.round(n)}%`);

/**
 * Cadastro de peças inteiro da oficina (em páginas: o Supabase devolve no máximo 1000 por vez),
 * ordenado pelo nome. Use no lugar de select direto em workshop_parts para listas/buscas.
 */
export async function loadAllParts<T = WorkshopPart>(wid: string, cols = '*', activeOnly = true): Promise<T[]> {
  const { data } = await fetchAll<T>((a, b) => {
    let q = supabase.from('workshop_parts').select(cols).eq('workshop_id', wid);
    if (activeOnly) q = q.eq('active', true);
    return q.order('id').range(a, b) as unknown as PromiseLike<{ data: T[] | null; error: unknown }>;
  });
  return data.sort((x, y) => String((x as { name?: string }).name ?? '').localeCompare(String((y as { name?: string }).name ?? ''), 'pt-BR'));
}

/** Margem padrão da oficina (100% se nunca foi definida) e as margens por categoria */
export async function loadMargins(workshopId: string): Promise<Margins> {
  let { data, error } = await supabase.from('workshop_pricing').select('part_margin_percent, category_margins').eq('workshop_id', workshopId).maybeSingle();
  // Banco ainda sem a coluna (migration 0151): segue só com a margem padrão
  if (error) ({ data } = await supabase.from('workshop_pricing').select('part_margin_percent').eq('workshop_id', workshopId).maybeSingle());
  const row = data as { part_margin_percent: number; category_margins: Record<string, number> | null } | null;
  return { base: row ? Number(row.part_margin_percent) : DEFAULT_MARGIN, byCategory: row?.category_margins ?? {} };
}

/** "2.000" → "2"; "1.5" → "1,5" */
export const fmtQty = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

/** Estoque abaixo do mínimo (só quando há mínimo definido) */
export const needsRestock = (p: Pick<WorkshopPart, 'stock_qty' | 'min_qty'>) =>
  Number(p.min_qty) > 0 && Number(p.stock_qty) <= Number(p.min_qty);

/** "Óleo  5W30 " → "oleo 5w30" (para achar a mesma peça escrita de outro jeito) */
export const partKey = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Garante as peças no cadastro a partir de notas/orçamentos: o que já existe (mesmo nome) é reaproveitado;
 * o que falta entra com o preço de venda da nota e o custo pela margem da loja (100% → metade do preço).
 * A peça nova fica sem preço fixo: a venda sai do custo + margem (da categoria, se tiver; = o preço da nota). Dá para mudar depois.
 */
export async function ensureCatalogParts(wid: string, list: { name: string; price: number; cost?: number }[]) {
  const out = new Map<string, { id: string; cost: number }>();
  const wanted = new Map<string, { name: string; price: number; cost?: number }>();
  for (const p of list) {
    const k = partKey(p.name);
    if (k && !wanted.has(k)) wanted.set(k, { name: p.name.trim(), price: p.price, cost: p.cost });
  }
  if (!wanted.size) return { map: out, created: 0 };
  const [existing, margin] = await Promise.all([
    loadAllParts<{ id: string; name: string; cost: number }>(wid, 'id, name, cost', false),
    loadMargins(wid),
  ]);
  for (const p of existing as { id: string; name: string; cost: number }[]) {
    const k = partKey(p.name);
    if (!out.has(k)) out.set(k, { id: p.id, cost: Number(p.cost) });
  }
  const toCreate = [...wanted.entries()].filter(([k, p]) => !out.has(k) && p.price > 0);
  if (toCreate.length) {
    const rows = toCreate.map(([, p]) => ({
      workshop_id: wid, name: p.name, cost: (p.cost ?? 0) > 0 ? round2(p.cost!) : round2(p.price / (1 + margin.base / 100)), margin_percent: null, sale_price: null,
    }));
    const { data, error } = await supabase.from('workshop_parts').insert(rows).select('id, name, cost, category');
    if (error) throw error;
    for (const p of (data ?? []) as { id: string; name: string; cost: number; category: string | null }[]) {
      // A categoria sai do nome, no banco: se ela tem margem própria, refaz o custo para a venda continuar = preço da nota
      const m = categoryMargin(margin, p.category);
      let cost = Number(p.cost);
      // Custo informado na nota vale como está (a margem da categoria só refaz o custo estimado)
      if (m !== margin.base && !((wanted.get(partKey(p.name))?.cost ?? 0) > 0)) {
        cost = round2(wanted.get(partKey(p.name))!.price / (1 + m / 100));
        await supabase.from('workshop_parts').update({ cost }).eq('id', p.id);
      }
      out.set(partKey(p.name), { id: p.id, cost });
    }
  }
  return { map: out, created: toCreate.length };
}

/**
 * Peça de nota com veículo identificado → nome com o carro ("Kit amortecedor (Fiat Strada)"):
 * a mesma descrição para outro veículo é outro produto. Sem veículo, fica o nome como veio.
 */
export function partNameForVehicle(name: string, make?: string | null, model?: string | null) {
  const clean = (s?: string | null) => { const t = (s ?? '').trim(); return !t || /n[aã]o informado/i.test(t) ? '' : t; };
  const mk = clean(make), md = clean(model);
  const vehicle = [mk, md].filter(Boolean).join(' ');
  const base = name.trim();
  if (!vehicle) return base;
  // Já fala do carro na descrição? não repete
  if (md && partKey(base).includes(partKey(md))) return base;
  return `${base} (${vehicle})`;
}

// ─── Subcategorias: tipos dentro de cada categoria, pelo nome da peça (sem mudar o cadastro) ───

const n0 = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const TIRE_NAME = /\b(pneus?|camaras? de ar)\b|\b\d{3}\/\d{2} ?z?r ?\d{2}/;
/** Pneu pelo nome (mesmo cadastrado em outra categoria) */
export const isTireName = (name: string) => TIRE_NAME.test(n0(name));

type SubRule = { value: string; label: string; re: RegExp };
const POS: SubRule[] = [
  { value: 'diant', label: 'Dianteiro', re: /diant|\bdt\b|\bdian\b/ },
  { value: 'tras',  label: 'Traseiro',  re: /tras|traz|\btr\b|\btz\b|\btrs\b/ },
];
/** Regras na ordem: a primeira que bater define o tipo; nenhuma = "Outros" */
const SUB_RULES: Partial<Record<PartCategory, SubRule[]>> = {
  oleos_filtros: [
    { value: 'f_cabine', label: 'Filtro de cabine',      re: /filtr.*(cabine|polen|ar.?cond|\bac\b|habitaculo|carvao)|(cabine|polen).*filtr/ },
    { value: 'f_comb',   label: 'Filtro de combustível', re: /filtr.*(combust|gasolina|diesel|\bcomb\b)/ },
    { value: 'f_oleo',   label: 'Filtro de óleo',        re: /filtr.*(oleo|lubrif|\bol\b|blind)/ },
    { value: 'f_ar',     label: 'Filtro de ar',          re: /filtr.*\bar\b/ },
    { value: 'outros',   label: 'Outros',                re: /filtr|tampa|bujao|carter|vareta/ },
    { value: 'oleo',     label: 'Óleo',                  re: /oleo|lubrif|\d+w-?\d+|\batf\b|fluido/ },
  ],
  rodas: [
    { value: 'pneu',     label: 'Pneus',                 re: TIRE_NAME },
    { value: 'parafuso', label: 'Parafuso e porca',      re: /parafuso|porca/ },
    { value: 'roda',     label: 'Roda e calota',         re: /^rodas?\b|calota|\baro\b/ },
  ],
  cubo: POS,
  rolamento: POS,
  freios: [
    { value: 'pastilha', label: 'Pastilha',              re: /\bpast|pat?ilha|pasilha|pstilha|pasytilha/ },
    { value: 'disco',    label: 'Disco',                 re: /\bdiscos?\b/ },
    { value: 'tambor',   label: 'Tambor',                re: /tambor/ },
    { value: 'sapata',   label: 'Sapata e lona',         re: /sapata|\blonas?\b/ },
    { value: 'cilindro', label: 'Cilindro',              re: /cilindro|\bcil\b|clindro/ },
    { value: 'flex',     label: 'Flexível e cabo',       re: /flexivel|\bcabos?\b|tubo|mangueira/ },
  ],
  suspensao: [
    { value: 'kit',      label: 'Kit batente e coxim',   re: /batente|coxim|calco|bolachao|kits? (de )?amort/ },
    { value: 'amort',    label: 'Amortecedor',           re: /amort|anort|amoret/ },
    { value: 'bandeja',  label: 'Bandeja e braço',       re: /band|badej|\bbdj\b|braco/ },
    { value: 'pivo',     label: 'Pivô',                  re: /pivo/ },
    { value: 'terminal', label: 'Terminal',              re: /terminal|temninal|\bterm\b/ },
    { value: 'axial',    label: 'Axial',                 re: /axial/ },
    { value: 'bieleta',  label: 'Bieleta',               re: /bieleta|bileta/ },
    { value: 'mola',     label: 'Mola',                  re: /\bmolas?\b|feixe/ },
    { value: 'bucha',    label: 'Bucha',                 re: /bucha/ },
    { value: 'direcao',  label: 'Caixa de direção',      re: /caixa|direc|setor|reparo/ },
    { value: 'barra',    label: 'Barra estabilizadora',  re: /barra|estabiliz/ },
  ],
  motor: [
    { value: 'correia',  label: 'Correia',               re: /correia/ },
    { value: 'tensor',   label: 'Tensor e polia',        re: /tensor|tensionador|polia/ },
    { value: 'coxim',    label: 'Coxim',                 re: /coxim|coxin/ },
    { value: 'junta',    label: 'Junta e retentor',      re: /junta|retentor|\baneis?\b|\banel\b|vedac|o.?ring/ },
    { value: 'bomba',    label: 'Bomba',                 re: /bomba/ },
    { value: 'cabecote', label: 'Cabeçote e válvula',    re: /valvula|cabecote|balanc|tucho|comando/ },
    { value: 'bujao',    label: 'Bujão e tampa',         re: /bujao|tampa|arruela|\bcapa\b/ },
    { value: 'sensor',   label: 'Sensor e cebolinha',    re: /cebolinha|sensor|interruptor/ },
    { value: 'interno',  label: 'Peças internas',        re: /bronz|biela|pistao|virabrequim|volante|bloco|carter|selo|retifica/ },
    { value: 'tubo',     label: 'Tubo e mangueira',      re: /tubo|mangueira|flexivel/ },
  ],
  ignicao_injecao: [
    { value: 'cabo',     label: 'Cabo de vela',          re: /\bcabos?\b/ },
    { value: 'vela',     label: 'Vela',                  re: /\bvelas?\b/ },
    { value: 'bobina',   label: 'Bobina',                re: /bobina/ },
    { value: 'sonda',    label: 'Sonda e sensor',        re: /sonda|sensor|lambda/ },
    { value: 'bomba',    label: 'Bomba de combustível',  re: /bomba|refil|flange|diafragma/ },
    { value: 'bico',     label: 'Bico e TBI',            re: /\bbicos?\b|injet|\btbi\b|corpo|atuador|borboleta/ },
  ],
  arrefecimento: [
    { value: 'bomba',    label: 'Bomba d’água',          re: /bomba/ },
    { value: 'mangueira',label: 'Mangueira e tubo',      re: /mang|tubo|conexao|cotovelo/ },
    { value: 'radiador', label: 'Radiador',              re: /radiador/ },
    { value: 'valvula',  label: 'Válvula termostática',  re: /valvula|vaulvula|termost/ },
    { value: 'reserv',   label: 'Reservatório e tampa',  re: /reserv|resev|tampa/ },
    { value: 'aditivo',  label: 'Aditivo',               re: /aditivo|adtivo|\bbio\b/ },
    { value: 'abrac',    label: 'Abraçadeira',           re: /abrac/ },
    { value: 'sensor',   label: 'Sensor e cavalete',     re: /sensor|cavalete|carcaca|interruptor/ },
  ],
  escapamento: [
    { value: 'silenc',   label: 'Silencioso',            re: /silencioso|abafador/ },
    { value: 'catal',    label: 'Catalisador',           re: /catali[sz]/ },
    { value: 'tubo',     label: 'Tubo e ponteira',       re: /tubo|ponteira|flexivel|escapamento/ },
  ],
  transmissao: [
    { value: 'embreag',  label: 'Embreagem',             re: /embreag|plato|colar/ },
    { value: 'homoc',    label: 'Junta homocinética',    re: /junta|homoc|homic|\bhom\b|trizeta|tulipa|eixo/ },
    { value: 'atuador',  label: 'Atuador e cilindro',    re: /atuador|autuador|autoador|cilindro|clindro/ },
    { value: 'coxim',    label: 'Coxim',                 re: /coxim|coxin/ },
    { value: 'cabo',     label: 'Cabo',                  re: /\bcabos?\b/ },
    { value: 'coifa',    label: 'Coifa',                 re: /coifa/ },
  ],
  eletrica: [
    { value: 'bateria',  label: 'Bateria',               re: /bateria/ },
    { value: 'motor',    label: 'Partida e alternador',  re: /motor|alternador|partida|arranque|polia/ },
    { value: 'lampada',  label: 'Lâmpada e farol',       re: /lampada|farol|lanterna/ },
    { value: 'fusivel',  label: 'Fusível, relé e conector', re: /fusivel|rele|conector|comutador|interruptor|chicote/ },
  ],
  ar_condicionado: [
    { value: 'compressor', label: 'Compressor',          re: /compressor/ },
    { value: 'condens',  label: 'Condensador e evaporador', re: /condensador|evaporador/ },
    { value: 'gas',      label: 'Gás e óleo',            re: /\bgas\b|r134|oleo/ },
    { value: 'valvula',  label: 'Válvula',               re: /valvula/ },
  ],
  carroceria: [
    { value: 'palheta',  label: 'Palheta e limpador',    re: /palheta|limpador|bomba/ },
    { value: 'retrov',   label: 'Retrovisor e vidro',    re: /retrovisor|vidro|parabrisa|para.?brisa/ },
    { value: 'lataria',  label: 'Para-choque e lataria', re: /para.?choque|paralama|capo|grade|friso/ },
    { value: 'fechad',   label: 'Fechadura e maçaneta',  re: /fechadura|macaneta/ },
  ],
};

/** Subcategorias de cada categoria (a barra de tipos na OS e em Peças e estoque) */
export const CATEGORY_SUBS: Partial<Record<PartCategory, { value: string; label: string }[]>> = Object.fromEntries(
  Object.entries(SUB_RULES).map(([cat, rules]) => {
    const out: { value: string; label: string }[] = [];
    for (const r of rules ?? []) if (r.value !== 'outros' && !out.some(o => o.value === r.value)) out.push({ value: r.value, label: r.label });
    return [cat, [...out, { value: 'outros', label: 'Outros' }]];
  }));

/** A peça entra na categoria escolhida (pneu entra em Rodas e pneus mesmo cadastrado em outra) */
export const inCategory = (cat: string, p: { category?: string | null; name: string }) =>
  p.category === cat || (cat === 'rodas' && isTireName(p.name));

/** Subcategoria da peça dentro da categoria escolhida (null = não é dessa categoria ou ela não tem subcategorias) */
export function subOf(cat: string, p: { category?: string | null; name: string }): string | null {
  if (!inCategory(cat, p)) return null;
  const rules = SUB_RULES[cat as PartCategory];
  if (!rules) return null;
  const n = n0(p.name);
  return rules.find(r => r.re.test(n))?.value ?? 'outros';
}
