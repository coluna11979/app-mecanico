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

/* ─── Painel do gestor (demonstração) ─────────────────────────── */
type DemoPanelItem = { status: CheckupItem['status']; updated_at: string | null; quote_labor: number | null; quote_parts: number | null; customer_decision: string | null };

/** Check-ups fictícios em várias situações, para ver o painel sem banco. */
export function demoPanel() {
  const h = (n: number) => new Date(Date.now() - n * 3600000).toISOString();
  const items = (ok: number, warn: number, urgent: number, pending: number, priced = 0, decision: string | null = null): DemoPanelItem[] => [
    ...Array.from({ length: ok }, () => ({ status: 'ok' as const, updated_at: null, quote_labor: null, quote_parts: null, customer_decision: null })),
    ...Array.from({ length: warn + urgent }, (_, i) => ({
      status: (i < urgent ? 'urgent' : 'warn') as CheckupItem['status'], updated_at: null,
      quote_labor: i < priced ? 150 : null, quote_parts: i < priced ? 90 : null, customer_decision: decision,
    })),
    ...Array.from({ length: pending }, () => ({ status: null, updated_at: null, quote_labor: null, quote_parts: null, customer_decision: null })),
  ];
  const ck = (id: string, v: Partial<VehicleCheckup>, it: DemoPanelItem[], mech: string | null) => ({
    ...baseCheckup({}), id, public_token: id, workshop_mechanic_id: mech ? 'demo-mec-1' : null,
    mechanic: mech ? { name: mech, phone: null } : null, items: it, ...v,
  });
  const list = [
    ck('d1', { plate: 'ABC1D23', make: 'Chevrolet', model: 'Onix', year: 2019, customer_name: 'João Silva', created_at: h(5), updated_at: h(3) },
      items(18, 4, 2, 8).map(i => ({ ...i, updated_at: h(3) })), 'Rafael'),
    ck('d2', { plate: 'FJK2E45', make: 'Fiat', model: 'Argo', year: 2021, customer_name: 'Maria Souza', status: 'completed', completed_at: h(20) },
      items(28, 3, 1, 0, 2), 'Bruno'),
    ck('d3', { plate: 'QWE9R87', make: 'Hyundai', model: 'HB20', year: 2018, customer_name: 'Paulo Lima', status: 'completed', completed_at: h(60), quote_sent_at: h(55), customer_viewed_at: h(30) },
      items(27, 4, 1, 0, 5), 'Rafael'),
    ck('d4', { plate: 'RTY4U56', make: 'VW', model: 'Gol', year: 2015, customer_name: 'Ana Costa', mechanic_link_sent_at: h(2), created_at: h(2) },
      items(0, 0, 0, 32), 'Bruno'),
    ck('d5', { plate: 'MNB7V89', make: 'Toyota', model: 'Corolla', year: 2020, customer_name: 'Carlos Pereira', status: 'completed', completed_at: h(80), quote_sent_at: h(78), customer_viewed_at: h(70), customer_responded_at: h(48), sale_os_id: 'demo-os' },
      items(29, 2, 1, 0, 3, 'approve'), 'Rafael'),
    ck('d6', { plate: 'KJH3G21', make: 'Renault', model: 'Sandero', year: 2017, customer_name: 'Rita Alves', status: 'completed', completed_at: h(6), quote_sent_at: h(5) },
      items(30, 2, 0, 0, 2), null),
    ck('d7', { plate: 'KJH3G21', make: 'Renault', model: 'Sandero', year: 2017, customer_name: 'Rita Alves', status: 'completed', completed_at: h(30), quote_sent_at: h(29), replaced_by: 'd6', updated_at: h(7) },
      items(30, 2, 0, 0, 2), null),
  ];
  const scheduled = [
    { id: 'demo-s1', number: 128, scheduled_at: h(1), workshop_mechanic_id: null, customer: { full_name: 'Lucas Prado' },
      vehicle: { plate: 'PLK8J76', make: 'Honda', model: 'Fit', year: 2016 }, mechanic: null },
    { id: 'demo-s2', number: 131, scheduled_at: new Date(Date.now() + 3 * 3600000).toISOString(), workshop_mechanic_id: 'demo-mec-1',
      customer: { full_name: 'Beatriz Nunes' }, vehicle: { plate: 'TRE5W43', make: 'Jeep', model: 'Renegade', year: 2022 }, mechanic: { name: 'Rafael' } },
  ];
  return { list, scheduled };
}
