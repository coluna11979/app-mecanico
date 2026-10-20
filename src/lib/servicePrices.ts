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

export const norm = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Serviços cobrados em OS de verdade (sem orçamento solto nem cancelada) que têm veículo.
 * `model` limita a um modelo (sem diferenciar maiúsculas); `excludeOs` tira a OS que está sendo editada.
 */
export async function loadServiceCharges(wid: string, opts: { model?: string; excludeOs?: string } = {}): Promise<ServiceCharge[]> {
  const { data } = await fetchAll<Raw>((a, b) => {
    let q = supabase.from('service_order_items')
      .select('description, quantity, unit_price, service_orders!inner(id, number, created_at, vehicles!inner(make, model, year, plate))')
      .eq('workshop_id', wid).eq('kind', 'labor').gt('unit_price', 0)
      .neq('service_orders.status', 'cancelled').is('service_orders.quote_status', null);
    if (opts.model) q = q.ilike('service_orders.vehicles.model', opts.model.replace(/[%_\\]/g, m => '\\' + m));
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
      service: r.description.trim(), key: norm(r.description),
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

export type PriceSummary = { count: number; last: number; lastDate: string; min: number; max: number; avg: number };

export function summarize(cs: ServiceCharge[]): PriceSummary {
  const sorted = [...cs].sort((a, b) => b.date.localeCompare(a.date));
  const prices = cs.map(c => c.price);
  return {
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
