/**
 * Consulta técnica — qual óleo, quanto e quais filtros cada carro usa.
 * Base global (tech_*), montada por nós a partir de fonte pública e conferida no admin.
 * A oficina só enxerga linhas com status 'verificado' (RLS).
 */
import { supabase } from '@/lib/supabase';
import type { WorkshopPart } from '@/lib/parts';

export type TechStatus = 'rascunho' | 'verificado';

export type TechVehicle = {
  id: string; make: string; model: string; version: string | null; engine: string | null;
  fuel: string | null; transmission: string | null; year_from: number | null; year_to: number | null;
  notes: string | null;
};

export type FluidSystem = 'motor' | 'cambio' | 'diferencial' | 'direcao' | 'freio' | 'arrefecimento';
export type FluidSpec = {
  id: string; vehicle_id: string; system: FluidSystem; viscosity: string | null; spec: string | null;
  capacity_liters: number | null; interval_km: number | null; interval_months: number | null;
  notes: string | null; source_url: string | null; status: TechStatus; position: number;
};

export type FilterKind = 'oleo' | 'ar' | 'combustivel' | 'cabine';
export type FilterRef = {
  id: string; vehicle_id: string; kind: FilterKind; brand: string; code: string;
  notes: string | null; source_url: string | null; status: TechStatus; position: number;
};

export const SYSTEMS: { value: FluidSystem; label: string }[] = [
  { value: 'motor',         label: 'Motor' },
  { value: 'cambio',        label: 'Câmbio' },
  { value: 'diferencial',   label: 'Diferencial' },
  { value: 'direcao',       label: 'Direção hidráulica' },
  { value: 'freio',         label: 'Freio' },
  { value: 'arrefecimento', label: 'Arrefecimento' },
];
export const systemLabel = (s: string) => SYSTEMS.find(x => x.value === s)?.label ?? s;

export const FILTER_KINDS: { value: FilterKind; label: string }[] = [
  { value: 'oleo',        label: 'Filtro de óleo' },
  { value: 'ar',          label: 'Filtro de ar' },
  { value: 'combustivel', label: 'Filtro de combustível' },
  { value: 'cabine',      label: 'Filtro de cabine' },
];
export const filterLabel = (k: string) => FILTER_KINDS.find(x => x.value === k)?.label ?? k;

/** Sem acento, maiúsculo, só letras e números: "5W-30" → "5W30", "PSL 55" → "PSL55" */
export const token = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export const fmtLiters = (n: number | null | undefined) =>
  n == null ? '' : `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${Number(n) === 1 ? 'litro' : 'litros'}`;

export const fmtYearRange = (v: Pick<TechVehicle, 'year_from' | 'year_to'>) => {
  if (v.year_from == null && v.year_to == null) return '';
  if (v.year_from != null && v.year_to != null) return v.year_from === v.year_to ? String(v.year_from) : `${v.year_from}–${v.year_to}`;
  return v.year_from != null ? `${v.year_from} em diante` : `até ${v.year_to}`;
};

/** "Chevrolet Cruze" */
export const vehicleName = (v: Pick<TechVehicle, 'make' | 'model'>) => `${v.make} ${v.model}`;
/** "LTZ 1.8 16V Flexpower · Automático · 2012–2016" */
export const vehicleDetail = (v: TechVehicle) =>
  [v.version || v.engine, v.fuel, v.transmission, fmtYearRange(v)].filter(Boolean).join(' · ');

export const fmtInterval = (s: Pick<FluidSpec, 'interval_km' | 'interval_months'>) =>
  [s.interval_km ? `${s.interval_km.toLocaleString('pt-BR')} km` : '', s.interval_months ? `${s.interval_months} meses` : '']
    .filter(Boolean).join(' ou ');

const yearFits = (v: TechVehicle, year: number | null) =>
  year == null || ((v.year_from == null || v.year_from <= year) && (v.year_to == null || v.year_to >= year));

/** Fichas cujo modelo bate com o texto (e com o ano, se informado) */
export async function searchTechVehicles(model: string, year: number | null): Promise<TechVehicle[]> {
  const q = model.trim().replace(/[%_,()]/g, ' ');
  if (!q) return [];
  const { data } = await supabase.from('tech_vehicles').select('*').ilike('model', `%${q}%`).order('model').order('year_from').limit(60);
  const rows = (data as TechVehicle[] | null) ?? [];
  // Nome exato primeiro: "Onix" antes de "Onix Plus"
  const exact = rows.filter(v => token(v.model) === token(q));
  return (exact.length ? exact : rows).filter(v => yearFits(v, year));
}

/* ── Placa → carro ─────────────────────────────────────────────────────────── */

export type PlateCar = { make: string | null; model: string | null; version: string | null; year: number | null; fuel: string | null; engine_cc: number | null };
export type PlateResult =
  | { status: 'found'; source: 'cliente' | 'cache' | 'servico'; plate: string; car: PlateCar; vehicle_id?: string; tech_vehicle_id?: string | null }
  | { status: 'invalid' | 'not_found' | 'not_configured' | 'limit' | 'unavailable' };

export const PLATE_RE = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/** Identifica o carro pela placa: cliente da oficina → placa já consultada → serviço de placas */
export async function lookupPlate(workshopId: string, plate: string): Promise<PlateResult> {
  const { data, error } = await supabase.functions.invoke('tech-plate-lookup', { body: { workshop_id: workshopId, plate } });
  if (error || !data?.status) return { status: 'unavailable' };
  return data as PlateResult;
}

/** "Chevrolet Cruze LTZ 1.8 2012" a partir do que a placa devolveu */
export const plateCarName = (c: PlateCar) =>
  [c.make, c.model, c.version, c.year].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

/**
 * Fichas que servem para o carro identificado pela placa. O serviço devolve o modelo do jeito do
 * documento ("CRUZE LTZ NB AT"), então procura o nome do nosso modelo dentro dele, fica com o
 * mais específico ("Onix Plus" ganha de "Onix") e, se der, afunila pela cilindrada (1796 → "1.8").
 */
export async function matchTechVehicles(car: PlateCar): Promise<TechVehicle[]> {
  const text = token(`${car.model ?? ''} ${car.version ?? ''}`);
  if (!text) return [];
  const { data } = await supabase.from('tech_vehicles').select('*').order('year_from').limit(5000);
  const hits = ((data as TechVehicle[] | null) ?? []).filter(v => {
    const m = token(v.model);
    return m.length > 0 && (text.includes(m) || m === token(car.model)) && yearFits(v, car.year);
  });
  if (hits.length === 0) return [];
  const best = Math.max(...hits.map(v => token(v.model).length));
  let out = hits.filter(v => token(v.model).length === best);
  if (car.engine_cc) {
    const liters = token((Math.round(car.engine_cc / 100) / 10).toFixed(1));
    const byEngine = out.filter(v => token(`${v.engine ?? ''} ${v.version ?? ''}`).includes(liters));
    if (byEngine.length) out = byEngine;
  }
  return out;
}

export async function loadSheet(vehicleId: string): Promise<{ vehicle: TechVehicle | null; fluids: FluidSpec[]; filters: FilterRef[] }> {
  const [v, s, f] = await Promise.all([
    supabase.from('tech_vehicles').select('*').eq('id', vehicleId).maybeSingle(),
    supabase.from('tech_fluid_specs').select('*').eq('vehicle_id', vehicleId).order('position').order('created_at'),
    supabase.from('tech_filter_refs').select('*').eq('vehicle_id', vehicleId).order('kind').order('position').order('created_at'),
  ]);
  return { vehicle: (v.data as TechVehicle | null) ?? null, fluids: (s.data as FluidSpec[] | null) ?? [], filters: (f.data as FilterRef[] | null) ?? [] };
}

/** Registra a busca (achou ou não) — é o que diz ao admin o que cadastrar primeiro */
export function logLookup(workshopId: string, query: string, year: number | null, vehicleId: string | null) {
  const q = query.trim();
  if (!q) return;
  supabase.from('tech_lookup_log').insert({ workshop_id: workshopId, query: q, year, vehicle_id: vehicleId }).then(() => { /* só registro */ });
}

type StockPart = Pick<WorkshopPart, 'id' | 'name' | 'code' | 'brand' | 'cost' | 'margin_percent' | 'sale_price' | 'stock_qty' | 'category' | 'unit'>;

/** Peças do estoque que servem como este fluido: o nome traz a viscosidade ("5W30", "5W-30") */
export function partsForFluid<T extends StockPart>(parts: T[], s: Pick<FluidSpec, 'viscosity'>): T[] {
  const v = token(s.viscosity);
  if (v.length < 3) return [];
  return parts.filter(p => token(p.name).includes(v));
}

/** Peças do estoque com o código do filtro (no código ou no nome) */
export function partsForFilter<T extends StockPart>(parts: T[], f: Pick<FilterRef, 'code'>): T[] {
  const c = token(f.code);
  if (c.length < 3) return [];
  return parts.filter(p => token(p.code) === c || token(p.name).includes(c));
}
