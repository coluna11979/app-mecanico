/**
 * Peças × veículos — em quais carros cada peça serve.
 * Marca + modelo obrigatórios; ano (ou faixa) opcional: em branco = qualquer ano.
 */
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';

export type PartVehicle = {
  id: string; workshop_id: string; part_id: string;
  brand: string; model: string; year_from: number | null; year_to: number | null;
};

export type VehicleDraft = Pick<PartVehicle, 'brand' | 'model' | 'year_from' | 'year_to'>;

export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function fmtYears(v: Pick<PartVehicle, 'year_from' | 'year_to'>) {
  if (v.year_from == null && v.year_to == null) return 'todos os anos';
  if (v.year_from != null && v.year_to != null && v.year_from !== v.year_to) return `${v.year_from}–${v.year_to}`;
  if (v.year_from != null && v.year_to != null) return String(v.year_from);
  return v.year_from != null ? `${v.year_from}+` : `até ${v.year_to}`;
}

export const fmtVehicle = (v: VehicleDraft) => `${v.brand} ${v.model} · ${fmtYears(v)}`;

export async function loadPartVehicles(wid: string): Promise<Map<string, PartVehicle[]>> {
  const r = await fetchAll<PartVehicle>((a, b) =>
    supabase.from('workshop_part_vehicles').select('*').eq('workshop_id', wid).order('id').range(a, b));
  const m = new Map<string, PartVehicle[]>();
  for (const v of r.data) m.set(v.part_id, [...(m.get(v.part_id) ?? []), v]);
  return m;
}

/** A peça serve no veículo? Ano vazio na peça = qualquer ano; ano vazio na busca = não filtra por ano. */
export function fitsVehicle(list: PartVehicle[] | undefined, brand: string, model: string, year: number | null) {
  const b = norm(brand), md = norm(model);
  return !!list?.some(v =>
    (!b || norm(v.brand) === b) && (!md || norm(v.model).includes(md)) &&
    (year == null || ((v.year_from == null || v.year_from <= year) && (v.year_to == null || v.year_to >= year))));
}

/** Troca a lista de veículos da peça pela lista informada. */
export async function savePartVehicles(wid: string, partId: string, list: VehicleDraft[]) {
  const del = await supabase.from('workshop_part_vehicles').delete().eq('part_id', partId);
  if (del.error) return del.error;
  if (!list.length) return null;
  const ins = await supabase.from('workshop_part_vehicles').insert(list.map(v => ({
    workshop_id: wid, part_id: partId, brand: v.brand.trim(), model: v.model.trim(), year_from: v.year_from, year_to: v.year_to,
  })));
  return ins.error;
}

/** Rótulo entre parênteses no fim do nome ("Filtro de ar (Collect)" → "Collect"); null se não houver. */
export function partLabel(name: string) {
  const m = name.match(/\(([^)]+)\)(?!.*\()/);
  return m ? m[1].trim() : null;
}

/** Vincula o mesmo veículo a várias peças de uma vez (ignora as que já têm esse veículo). */
export async function addVehicleToParts(wid: string, partIds: string[], v: VehicleDraft) {
  for (let i = 0; i < partIds.length; i += 200) {
    const { error } = await supabase.from('workshop_part_vehicles').insert(partIds.slice(i, i + 200).map(id => ({
      workshop_id: wid, part_id: id, brand: v.brand.trim(), model: v.model.trim(), year_from: v.year_from, year_to: v.year_to,
    })));
    if (error) return error;
  }
  return null;
}

export async function markPartsUniversal(partIds: string[], universal: boolean) {
  for (let i = 0; i < partIds.length; i += 200) {
    const { error } = await supabase.from('workshop_parts').update({ universal }).in('id', partIds.slice(i, i + 200));
    if (error) return error;
  }
  return null;
}
