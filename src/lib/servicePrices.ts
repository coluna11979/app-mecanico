/**
 * Preços de mão de obra já cobrados, por veículo.
 * Vem do histórico das OS (itens "serviço" ligados ao veículo da OS): o mesmo serviço pode ter
 * valores diferentes de carro para carro, e aqui dá para consultar "quanto cobramos neste modelo".
 */
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

/** Uma vez que um serviço foi cobrado em um veículo */
export type ServiceCharge = {
  service: string;        // como foi digitado na OS
  category: string;       // da Tabela de serviços ou deduzida pelo nome; "Outro" se não achar
  key: string;            // nome normalizado (agrupa "Troca de óleo" e "troca de oleo ")
  price: number;          // quantidade × valor unitário
  date: string;           // ISO
  osId: string;
  osNumber: string | null;
  make: string; model: string; year: number | null; plate: string;
  vehicleKey: string;     // "marca modelo" normalizado
  vehicleText: string;    // texto para a busca
};

type Raw = {
  description: string; quantity: number; unit_price: number;
  service_orders: {
    id: string; number: string | null; created_at: string;
    vehicles: { make: string | null; model: string | null; year: number | null; plate: string | null } | null;
  } | null;
};

/** Palavras do nome (já sem acento, minúsculas) → categoria. A primeira regra que bater vale. */
const CATEGORY_RULES: [string, RegExp][] = [
  ['Câmbio', /cambio|caixa de marcha|automatico|trambulador|diferencial/],
  ['Embreagem', /embreag|plato|atuador/],
  ['Freios', /freio|pastilha|disco|lona|sapata|pinca|cilindro (de roda|mestre)|sangria|\babs\b/],
  // Peças do motor que o nome costuma trazer junto com "rolamento", "bomba"…
  ['Motor', /correia|tensor|bomba d|termostat|cabecote|retifica|virabrequim|biela|pistao|bloco|carter|tampa de valvula/],
  ['Suspensão', /amortecedor|mola|bandeja|bieleta|bucha|coxim|coxin|pivo|terminal|barra (estab|de dir)|bolachao|batente|cubo|rolamento|homocinet|semi.?eixo|suspens|coifa|direcao|hidraulic|braco/],
  ['Balanceamento', /balanc/],
  ['Alinhamento', /alinh|cambagem|geometria|caster/],
  ['Pneus', /pneu|rodizio|montage|remendo|calibr|vulcan|\broda\b/],
  ['Ar-condicionado', /ar.?condicionado|higieniz|gas do ar|compressor|condensador/],
  ['Injeção eletrônica', /bico|injet|injecao|\btbi\b|sonda|lambda|borboleta/],
  ['Diagnóstico', /diagnost|scan+er|passagem (do |de )?(aparelho|computador|scanner)/],
  ['Escapamento', /escapament|silencioso|catalisador|intermediario|abracadeira|ponteira|flexivel/],
  ['Elétrica', /bateria|alternador|motor de partida|arranque|farol|lampada|fusivel|chicote|eletric|modulo|sensor|vidro|comutador/],
  ['Troca de óleo', /oleo|filtro/],
  ['Motor', /motor|vela|radiador|coletor|valvula|junta|arrefec|turbina|distribuic|retentor/],
  ['Revisão geral', /revisao|check|preventiva/],
  ['Funilaria', /funilaria|pintura|lanternagem|amassad/],
];

/** Categoria do serviço: a da Tabela de serviços (nome igual) ou, na falta, deduzida pelas palavras do nome */
export function categoryOf(key: string, table?: Map<string, string>): string {
  const t = table?.get(key);
  if (t && t !== 'Outro') return t;
  for (const [cat, re] of CATEGORY_RULES) if (re.test(key)) return cat;
  return 'Outro';
}

export const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Serviços cobrados em OS de verdade (sem orçamento solto nem cancelada) que têm veículo.
 * `model` limita a um modelo (sem diferenciar maiúsculas); `excludeOs` tira a OS que está sendo editada;
 * `like` traz só serviços cujo nome contém o texto (vogais e "c" viram curinga: "oleo" acha "óleo").
 */
export async function loadServiceCharges(wid: string, opts: { model?: string; excludeOs?: string; like?: string; categories?: boolean } = {}): Promise<ServiceCharge[]> {
  // Categorias que a oficina definiu na Tabela de serviços (só quando a tela vai agrupar por categoria)
  const table = new Map<string, string>();
  if (opts.categories) {
    const { data: svc } = await supabase.from('workshop_services').select('name, category').eq('workshop_id', wid);
    for (const s of (svc ?? []) as { name: string; category: string | null }[]) if (s.category) table.set(norm(s.name), s.category);
  }
  const { data } = await fetchAll<Raw>((a, b) => {
    let q = supabase.from('service_order_items')
      .select('description, quantity, unit_price, service_orders!inner(id, number, created_at, vehicles!inner(make, model, year, plate))')
      .eq('workshop_id', wid).eq('kind', 'labor').gt('unit_price', 0)
      .neq('service_orders.status', 'cancelled').is('service_orders.quote_status', null);
    if (opts.model) q = q.ilike('service_orders.vehicles.model', opts.model.replace(/[%_\\]/g, m => '\\' + m));
    if (opts.like) {
      const pat = norm(opts.like).replace(/[%_\\]/g, m => '\\' + m).replace(/[aeiouc]/g, '_');
      q = q.ilike('description', `%${pat}%`);
    }
    if (opts.excludeOs) q = q.neq('service_orders.id', opts.excludeOs);
    return q.order('id').range(a, b) as unknown as PromiseLike<{ data: Raw[] | null; error: unknown }>;
  });
  const out: ServiceCharge[] = [];
  for (const r of data) {
    const so = r.service_orders, v = so?.vehicles;
    if (!so || !v || !r.description?.trim()) continue;
    // Notas importadas trazem marca "Não informado": some da tela
    const make = /^n(ã|a)o informad/i.test((v.make ?? '').trim()) ? '' : (v.make ?? '').trim(), model = (v.model ?? '').trim(), plate = (v.plate ?? '').trim();
    out.push({
      service: r.description.trim(), key: norm(r.description), category: categoryOf(norm(r.description), table),
      price: Math.round(Number(r.quantity) * Number(r.unit_price) * 100) / 100,
      date: so.created_at, osId: so.id, osNumber: so.number,
      make, model, year: v.year, plate,
      vehicleKey: norm(`${make} ${model}`),
      vehicleText: norm(`${make} ${model} ${v.year ?? ''} ${plate}`),
    });
  }
  return out;
}

/** Todos os termos digitados precisam aparecer no veículo (ex.: "gol 2015", "fiat uno", placa) */
export const matchesVehicle = (c: ServiceCharge, q: string) => {
  const terms = norm(q).split(' ').filter(Boolean);
  return terms.length > 0 && terms.every(t => c.vehicleText.includes(t));
};

export type PriceSummary = { count: number; last: number; lastDate: string; min: number; max: number; avg: number; median: number };

export function summarize(cs: ServiceCharge[]): PriceSummary {
  const sorted = [...cs].sort((a, b) => b.date.localeCompare(a.date));
  const prices = cs.map(c => c.price);
  const asc = [...prices].sort((a, b) => a - b), mid = Math.floor(asc.length / 2);
  return {
    median: asc.length % 2 ? asc[mid] : Math.round((asc[mid - 1] + asc[mid]) / 2 * 100) / 100,
    count: cs.length, last: sorted[0].price, lastDate: sorted[0].date,
    min: Math.min(...prices), max: Math.max(...prices),
    avg: Math.round(prices.reduce((s, p) => s + p, 0) / prices.length * 100) / 100,
  };
}

/** Agrupa as cobranças pela chave dada, mais usadas primeiro */
export function groupBy(cs: ServiceCharge[], keyOf: (c: ServiceCharge) => string) {
  const m = new Map<string, ServiceCharge[]>();
  for (const c of cs) {
    const k = keyOf(c);
    const arr = m.get(k);
    if (arr) arr.push(c); else m.set(k, [c]);
  }
  return [...m.entries()]
    .map(([key, items]) => ({ key, items, sum: summarize(items) }))
    .sort((a, b) => b.sum.count - a.sum.count || b.sum.lastDate.localeCompare(a.sum.lastDate));
}

/** Nome mais usado entre as cobranças (para mostrar o grupo) */
export function commonName(cs: ServiceCharge[], pick: (c: ServiceCharge) => string) {
  const m = new Map<string, number>();
  for (const c of cs) m.set(pick(c), (m.get(pick(c)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

export const vehicleLabel = (c: Pick<ServiceCharge, 'make' | 'model' | 'year'>) =>
  [c.make, c.model].filter(Boolean).join(' ') + (c.year ? ` ${c.year}` : '');
