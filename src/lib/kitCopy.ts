/**
 * Copiar o kit de peças de um carro (ou do kit geral) para outros carros.
 * Só planeja as linhas a gravar: peça que o carro de destino já tem (mesma peça do estoque ou mesmo
 * nome) é pulada, para nunca duplicar. Fica fora da tela para poder ser testada sozinha.
 */

export type KitSourceItem = { part_id: string | null; description: string; quantity: number };

/** Carro de destino: ficha do catálogo técnico (techId) ou só o nome do modelo (kits antigos) */
export type KitTarget = {
  key: string; model: string; techId: string | null; make: string | null; engine: string | null; from: number | null; to: number | null;
};

export type KitCopyRow = {
  workshop_id: string; service_id: string; part_id: string | null; description: string; quantity: number; position: number;
  vehicle_model: string | null; tech_vehicle_id: string | null; vehicle_make: string | null; vehicle_engine: string | null;
  year_from: number | null; year_to: number | null;
};

const norm = (s: string) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function planKitCopy(opts: {
  workshopId: string; serviceId: string;
  source: KitSourceItem[];
  /** Cada destino com as peças que ele já tem neste serviço */
  targets: { car: KitTarget; existing: Pick<KitSourceItem, 'part_id' | 'description'>[] }[];
}): { rows: KitCopyRow[]; skipped: number; carsTouched: number } {
  const rows: KitCopyRow[] = [];
  let skipped = 0;
  const touched = new Set<string>();
  const seenCars = new Set<string>();
  for (const { car, existing } of opts.targets) {
    if (seenCars.has(car.key)) continue; // o mesmo carro escolhido duas vezes
    seenCars.add(car.key);
    const haveParts = new Set(existing.map(r => r.part_id).filter(Boolean));
    const haveDesc = new Set(existing.map(r => norm(r.description)));
    let position = existing.length;
    for (const it of opts.source) {
      const d = norm(it.description);
      if ((it.part_id && haveParts.has(it.part_id)) || haveDesc.has(d)) { skipped++; continue; }
      // a mesma peça repetida dentro do próprio kit de origem também não duplica no destino
      if (it.part_id) haveParts.add(it.part_id);
      haveDesc.add(d);
      rows.push({
        workshop_id: opts.workshopId, service_id: opts.serviceId, part_id: it.part_id, description: it.description.trim(),
        quantity: it.quantity, position: position++,
        vehicle_model: car.model || null, tech_vehicle_id: car.techId, vehicle_make: car.make, vehicle_engine: car.engine,
        year_from: car.from, year_to: car.to,
      });
      touched.add(car.key);
    }
  }
  return { rows, skipped, carsTouched: touched.size };
}
