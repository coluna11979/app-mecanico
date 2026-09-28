// Pré-visualização do check-up sem banco (só em dev).
// O que for preenchido fica no localStorage, pra o relatório mostrar o mesmo conteúdo.
import { computeScore, templateRows, type CheckupItem, type VehicleCheckup } from './checkup';

export const DEMO_ID = 'demo';
const KEY = 'checkup-demo';

const DEMO_STATUS: Record<string, Partial<CheckupItem>> = {
  pastilhas_diant: { status: 'urgent', measurement: '15%', note: 'Trocar imediatamente — já encostando no disco' },
  pneu_te:         { status: 'warn',   measurement: '2,2 mm', note: 'Perto do limite (1,6 mm)' },
  pneu_td:         { status: 'warn',   measurement: '2,4 mm' },
  bateria:         { status: 'warn',   measurement: '12,1 V', note: 'Bateria fraca, testar alternador' },
  limpadores:      { status: 'warn',   note: 'Palhetas ressecadas' },
  ar_cond:         { status: 'na' },
};

export type DemoVehicle = Pick<VehicleCheckup, 'plate' | 'make' | 'model' | 'year' | 'km_reading' | 'customer_name' | 'customer_phone'>;

const DEFAULT_VEHICLE: DemoVehicle = {
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

/** Check-up em branco para preencher (usa o veículo digitado, se houver). */
export function demoDraft(): { checkup: VehicleCheckup; items: CheckupItem[] } {
  const now = new Date().toISOString();
  const vehicle = read().vehicle ?? DEFAULT_VEHICLE;
  return {
    checkup: {
      id: DEMO_ID, created_by: 'demo', ...vehicle,
      score: null, status: 'draft', notes: null, public_token: DEMO_ID,
      created_at: now, updated_at: now, completed_at: null,
    },
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
  const { checkup, items: blank } = demoDraft();
  const items = blank.map(i => ({ ...i, status: 'ok' as const, ...DEMO_STATUS[i.item_key] }));
  return {
    checkup: {
      ...checkup, ...DEFAULT_VEHICLE, status: 'completed', score: computeScore(items), completed_at: checkup.created_at,
      notes: 'Recomendo trocar as pastilhas dianteiras antes de pegar estrada. Pneus traseiros e bateria podem esperar uns 30 dias.',
    },
    items,
  };
}
