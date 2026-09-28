/** Clientes: máscaras, números de cada cliente e detecção de cadastro duplicado. */

export const onlyDigits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');
export const plateNorm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** (11) 95393-7618 enquanto digita */
export function maskPhone(v: string) {
  const d = onlyDigits(v).replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** 000.000.000-00 enquanto digita */
export function maskCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export type StatOs = {
  id: string; customer_id: string | null; vehicle_id: string | null; status: string; quote_status: string | null;
  price: number; created_at: string; completed_at: string | null; rework_of_id: string | null;
};

export type CustomerStats = { visits: number; spent: number; lastVisit: string | null; firstVisit: string | null; openOs: number };

const OPEN = new Set(['open', 'awaiting_approval', 'approved', 'in_progress']);
export const isSale = (o: StatOs) => o.status === 'completed' && !o.quote_status && !o.rework_of_id;

/** Visitas (OS concluídas), total gasto, última e primeira visita e OS em aberto, por cliente */
export function statsByCustomer(os: StatOs[]) {
  const map = new Map<string, CustomerStats>();
  for (const o of os) {
    if (!o.customer_id) continue;
    const s = map.get(o.customer_id) ?? { visits: 0, spent: 0, lastVisit: null, firstVisit: null, openOs: 0 };
    if (OPEN.has(o.status)) s.openOs += 1;
    if (isSale(o)) {
      s.visits += 1;
      s.spent += Number(o.price);
      const d = o.completed_at ?? o.created_at;
      if (!s.lastVisit || d > s.lastVisit) s.lastVisit = d;
      if (!s.firstVisit || d < s.firstVisit) s.firstVisit = d;
    }
    map.set(o.customer_id, s);
  }
  return map;
}

export const EMPTY_STATS: CustomerStats = { visits: 0, spent: 0, lastVisit: null, firstVisit: null, openOs: 0 };

const DAY = 86400000;
/** Situação pela última visita: em dia (até 6 meses), sumido, ou ainda sem serviço */
export function visitState(lastVisit: string | null, now = Date.now()) {
  if (!lastVisit) return { key: 'none' as const, label: 'Sem serviço ainda', cls: 'bg-steel-100 text-steel-500' };
  const days = (now - new Date(lastVisit).getTime()) / DAY;
  if (days <= 182) return { key: 'active' as const, label: 'Em dia', cls: 'bg-signal-100 text-signal-800' };
  return { key: 'gone' as const, label: 'Sumido', cls: 'bg-pending-100 text-pending-800' };
}

/** "há 3 meses", "há 1 ano" */
export function timeAgo(iso: string | null, now = Date.now()) {
  if (!iso) return '—';
  const d = Math.floor((now - new Date(iso).getTime()) / DAY);
  if (d < 1) return 'hoje';
  if (d < 30) return `há ${d} dia${d === 1 ? '' : 's'}`;
  const m = Math.floor(d / 30);
  if (m < 12) return `há ${m} ${m === 1 ? 'mês' : 'meses'}`;
  const y = Math.floor(m / 12);
  return `há ${y} ano${y === 1 ? '' : 's'}`;
}

type DupCustomer = { id: string; full_name: string; phone: string | null; cpf: string | null };
type DupVehicle = { id: string; customer_id: string; plate: string };

/** Cadastros parecidos já existentes (mesmo telefone, CPF ou placa) */
export function findDuplicates(
  customers: DupCustomer[], vehicles: DupVehicle[],
  input: { phone?: string; cpf?: string; plate?: string }, excludeCustomerId?: string,
) {
  const out: { customer: DupCustomer; reason: string }[] = [];
  const seen = new Set<string>();
  const add = (c: DupCustomer | undefined, reason: string) => {
    if (!c || c.id === excludeCustomerId || seen.has(c.id)) return;
    seen.add(c.id); out.push({ customer: c, reason });
  };
  const phone = onlyDigits(input.phone).slice(-8);
  if (phone.length === 8) for (const c of customers) if (onlyDigits(c.phone).slice(-8) === phone) add(c, 'mesmo telefone');
  const cpf = onlyDigits(input.cpf);
  if (cpf.length === 11) for (const c of customers) if (onlyDigits(c.cpf) === cpf) add(c, 'mesmo CPF');
  const plate = plateNorm(input.plate);
  if (plate.length >= 7) {
    for (const v of vehicles) if (plateNorm(v.plate) === plate) add(customers.find(c => c.id === v.customer_id), `já tem a placa ${plate}`);
  }
  return out;
}
