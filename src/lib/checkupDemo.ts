// Pré-visualização do check-up sem banco (só em dev).
// O que for preenchido fica no localStorage, pra o relatório mostrar o mesmo conteúdo.
import { computeScore, templateRows, type CheckupItem, type VehicleCheckup } from './checkup';

export const DEMO_ID = 'demo';
const KEY = 'checkup-demo';

export const DEMO_MECHANICS = [
  { id: 'demo-mec-1', name: 'Roberto Alves' },
  { id: 'demo-mec-2', name: 'Diego Santos' },
];

const DEMO_STATUS: Record<string, Partial<CheckupItem>> = {
  pastilhas_diant: { status: 'urgent', measurement: '15%', note: 'Trocar imediatamente — já encostando no disco' },
  pneu_te:         { status: 'warn',   measurement: '2,2 mm', note: 'Perto do limite (1,6 mm)' },
  pneu_td:         { status: 'warn',   measurement: '2,4 mm' },
  bateria:         { status: 'warn',   measurement: '12,1 V', note: 'Bateria fraca, testar alternador' },
  limpadores:      { status: 'warn',   note: 'Palhetas ressecadas' },
  ar_cond:         { status: 'na' },
};

export type DemoVehicle = Partial<Pick<VehicleCheckup,
  'customer_id' | 'vehicle_id' | 'workshop_mechanic_id' |
  'plate' | 'make' | 'model' | 'year' | 'km_reading' | 'customer_name' | 'customer_phone'>>;

const DEFAULT_VEHICLE: DemoVehicle = {
  workshop_mechanic_id: 'demo-mec-1',
  plate: 'FJK3B21', make: 'Fiat', model: 'Argo 1.3', year: 2019, km_reading: 87450,
  customer_name: 'Carlos Pereira', customer_phone: '(11) 98888-7777',
};

function read(): { vehicle?: DemoVehicle; checkup?: VehicleCheckup; items?: CheckupItem[] } {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function write(patch: object) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch })); } catch { /* ignore */ }
}

/** Novo check-up de demonstração: guarda o veículo e zera o preenchimento anterior. */
export function startDemo(vehicle: DemoVehicle) {
  try { localStorage.setItem(KEY, JSON.stringify({ vehicle })); } catch { /* ignore */ }
}

function baseCheckup(vehicle: DemoVehicle): VehicleCheckup {
  const now = new Date().toISOString();
  return {
    id: DEMO_ID, workshop_id: 'demo', workshop_mechanic_id: null, service_order_id: null,
    customer_id: null, vehicle_id: null, created_by: null,
    plate: null, make: null, model: null, year: null, km_reading: null,
    customer_name: null, customer_phone: null,
    ...vehicle,
    score: null, status: 'draft', notes: null, public_token: DEMO_ID,
    created_at: now, updated_at: now, completed_at: null,
  };
}

/** Check-up em branco para preencher (usa o veículo digitado, se houver). */
export function demoDraft(): { checkup: VehicleCheckup; items: CheckupItem[] } {
  return {
    checkup: baseCheckup(read().vehicle ?? DEFAULT_VEHICLE),
    items: templateRows(DEMO_ID).map((r, i) => ({
      id: `demo-${i}`, ...r, status: null, measurement: null, note: null, photo_path: null,
    })),
  };
}

export function saveDemoResult(checkup: VehicleCheckup, items: CheckupItem[]) {
  write({ checkup, items });
}

/** Relatório: o que foi preenchido na demo; se nada, um exemplo pronto. */
export function demoResult(): { checkup: VehicleCheckup; items: CheckupItem[] } {
  const saved = read();
  if (saved.checkup && saved.items) return { checkup: saved.checkup, items: saved.items };
  const base  = baseCheckup(DEFAULT_VEHICLE);
  const items = demoDraft().items.map(i => ({ ...i, status: 'ok' as const, ...DEMO_STATUS[i.item_key] }));
  return {
    checkup: {
      ...base, status: 'completed', score: computeScore(items), completed_at: base.created_at,
      notes: 'Recomendamos trocar as pastilhas dianteiras antes de pegar estrada. Pneus traseiros e bateria podem esperar uns 30 dias.',
    },
    items,
  };
}

export function demoMechanicName(id: string | null) {
  return DEMO_MECHANICS.find(m => m.id === id)?.name ?? null;
}
