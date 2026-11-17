import { supabase } from '@/lib/supabase';
import { norm } from '@/lib/servicePrices';

/**
 * Kits de peças dos serviços (Tabela de serviços) × o que foi realmente usado na OS.
 * Ao concluir a OS a oficina escolhe se vira kit: o que a oficina repete de verdade vai entrando na tabela.
 */

export type KitDbRow = {
  description: string; quantity: number; part_id: string | null; position?: number;
  vehicle_model: string | null; tech_vehicle_id: string | null; year_from: number | null; year_to: number | null;
};

/** Carro da OS, no que importa para escolher o kit */
export type KitCar = { model: string | null; make: string | null; year: number | null; techId: string | null };

/**
 * Qual kit vale para o carro: 1) a ficha do catálogo técnico; 2) o modelo, na faixa de anos
 * (kit sem faixa vale para qualquer ano); 3) o kit geral. `model` = modelo do kit escolhido (null = geral).
 */
export function pickKitRows<T extends KitDbRow>(rows: T[], car: { model?: string | null; year?: number | null; techId?: string | null }): { rows: T[]; model: string | null } {
  const mk = norm(car.model ?? '');
  let forModel: T[] = [];
  if (car.techId) forModel = rows.filter(r => r.tech_vehicle_id === car.techId);
  if (!forModel.length && mk) {
    const groups = new Map<string, T[]>();
    for (const r of rows.filter(r => r.vehicle_model && norm(r.vehicle_model) === mk)) {
      const k = r.tech_vehicle_id ?? 'm';
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    const yr = car.year ?? null;
    const fits = (g: T[]) => yr == null || ((g[0].year_from == null || g[0].year_from <= yr) && (g[0].year_to == null || g[0].year_to >= yr));
    const cands = [...groups.values()];
    forModel = cands.find(g => fits(g) && (g[0].year_from != null || g[0].year_to != null))
      ?? cands.find(g => fits(g) && g[0].year_from == null && g[0].year_to == null) ?? [];
  }
  const chosen = forModel.length ? forModel : rows.filter(r => !r.vehicle_model);
  return { rows: chosen, model: forModel.length ? forModel[0].vehicle_model : null };
}

export type KitPart = { part_id: string | null; description: string; quantity: number };

export type KitProposal = {
  /** id do item de serviço na OS */
  key: string;
  /** nome do serviço como está na OS */
  name: string;
  parts: KitPart[];
  /** serviço da Tabela de serviços com este nome (null = ainda não existe) */
  service: { id: string; name: string } | null;
  /** 'new' = não tem kit para este carro · 'changed' = usou o kit com peça a mais, a menos ou outra quantidade */
  kind: 'new' | 'changed';
  /** kit original (para 'changed'): de qual carro é, null = kit geral */
  originalModel: string | null;
  added: string[]; removed: string[]; qtyChanged: string[];
  price: number; minutes: number | null;
};

type OsItem = {
  id: string; kind: 'labor' | 'part'; description: string; quantity: number; unit_price: number;
  part_id: string | null; used_in_item_id: string | null; standalone: boolean | null; estimated_minutes: number | null;
};

const keyOf = (p: KitPart) => p.part_id ?? `d:${norm(p.description)}`;
const sameQty = (a: number, b: number) => Math.abs(a - b) < 0.0005;

/** Serviços da OS que têm peças dentro e merecem virar (ou virar outro) kit */
export async function loadKitProposals(osId: string, workshopId: string, car: KitCar | null): Promise<KitProposal[]> {
  const { data: raw } = await supabase.from('service_order_items')
    .select('id, kind, description, quantity, unit_price, part_id, used_in_item_id, standalone, estimated_minutes')
    .eq('service_order_id', osId).order('position').order('created_at').order('id');
  const items = (raw ?? []) as unknown as OsItem[];

  // Peça pertence ao serviço indicado nela; senão, ao serviço de cima. Peça-item (standalone) não é kit de ninguém.
  const labor = new Map<string, OsItem>();
  const partsOf = new Map<string, KitPart[]>();
  let last: OsItem | null = null;
  for (const i of items) {
    if (i.kind === 'labor') { last = i; labor.set(i.id, i); continue; }
    if (i.standalone || !i.description?.trim()) continue;
    const owner = (i.used_in_item_id && labor.has(i.used_in_item_id) ? labor.get(i.used_in_item_id) : last) ?? null;
    if (!owner) continue;
    const list = partsOf.get(owner.id) ?? [];
    const p: KitPart = { part_id: i.part_id, description: i.description.trim(), quantity: Number(i.quantity) || 1 };
    const dup = list.find(x => keyOf(x) === keyOf(p));
    if (dup) dup.quantity += p.quantity; else list.push(p);
    partsOf.set(owner.id, list);
  }
  const withParts = [...labor.values()].filter(l => l.description?.trim() && (partsOf.get(l.id)?.length ?? 0) > 0);
  if (!withParts.length) return [];

  const { data: svc } = await supabase.from('workshop_services').select('id, name').eq('workshop_id', workshopId);
  const byName = new Map(((svc ?? []) as { id: string; name: string }[]).map(s => [norm(s.name), s]));
  const ids = withParts.map(l => byName.get(norm(l.description))?.id).filter((x): x is string => !!x);
  const kitRows = new Map<string, (KitDbRow & { service_id: string })[]>();
  if (ids.length) {
    const { data } = await supabase.from('workshop_service_parts')
      .select('service_id, description, quantity, part_id, position, vehicle_model, tech_vehicle_id, year_from, year_to')
      .eq('workshop_id', workshopId).in('service_id', ids).order('position');
    for (const r of (data ?? []) as unknown as (KitDbRow & { service_id: string })[]) {
      kitRows.set(r.service_id, [...(kitRows.get(r.service_id) ?? []), { ...r, quantity: Number(r.quantity) }]);
    }
  }

  const out: KitProposal[] = [];
  for (const l of withParts) {
    const parts = partsOf.get(l.id)!;
    const service = byName.get(norm(l.description)) ?? null;
    const picked = service ? pickKitRows(kitRows.get(service.id) ?? [], { model: car?.model, year: car?.year, techId: car?.techId }) : { rows: [], model: null };
    const base = { key: l.id, name: l.description.trim(), parts, service, price: Number(l.unit_price) || 0, minutes: l.estimated_minutes ?? null };
    if (!picked.rows.length) {
      out.push({ ...base, kind: 'new', originalModel: null, added: [], removed: [], qtyChanged: [] });
      continue;
    }
    const orig = picked.rows.map(r => ({ part_id: r.part_id, description: r.description, quantity: Number(r.quantity) }));
    const origBy = new Map(orig.map(p => [keyOf(p), p]));
    const nowBy = new Map(parts.map(p => [keyOf(p), p]));
    const added = parts.filter(p => !origBy.has(keyOf(p))).map(p => p.description);
    const removed = orig.filter(p => !nowBy.has(keyOf(p))).map(p => p.description);
    const qtyChanged = parts.filter(p => origBy.has(keyOf(p)) && !sameQty(origBy.get(keyOf(p))!.quantity, p.quantity)).map(p => p.description);
    if (!added.length && !removed.length && !qtyChanged.length) continue; // usou o kit como está: nada a perguntar
    out.push({ ...base, kind: 'changed', originalModel: picked.model, added, removed, qtyChanged });
  }
  return out;
}

/**
 * Grava o kit. 'new' entra no serviço da tabela (cria o serviço se ainda não existe); 'changed' cria um serviço
 * novo com o nome escolhido e o kit ajustado — o serviço e o kit originais não são tocados.
 * `forModel` = o kit vale só para o modelo do carro desta OS (senão, para qualquer carro).
 */
export async function saveKit(p: KitProposal, o: { workshopId: string; name?: string; forModel: boolean; car: KitCar | null }): Promise<string | null> {
  let serviceId = p.kind === 'new' ? p.service?.id ?? null : null;
  let created = false;
  if (!serviceId) {
    const name = (p.kind === 'changed' ? o.name ?? '' : p.name).trim();
    if (!name) return 'Dê um nome ao serviço';
    const { data, error } = await supabase.from('workshop_services')
      .insert({ workshop_id: o.workshopId, name, price: p.price > 0 ? p.price : 0, estimated_minutes: p.minutes })
      .select('id').single();
    if (error) return error.code === '23505' ? 'Já existe um serviço com esse nome. Escolha outro nome.' : 'Não foi possível criar o serviço: ' + error.message;
    serviceId = data.id as string; created = true;
  }
  const model = o.forModel ? o.car?.model?.trim() || null : null;
  const { error } = await supabase.from('workshop_service_parts').insert(p.parts.map((x, i) => ({
    workshop_id: o.workshopId, service_id: serviceId, part_id: x.part_id, description: x.description, quantity: x.quantity, position: i,
    vehicle_model: model, vehicle_make: model ? o.car?.make ?? null : null,
  })));
  if (error) {
    if (created) await supabase.from('workshop_services').delete().eq('id', serviceId);
    return 'Não foi possível salvar o kit: ' + error.message;
  }
  return null;
}
