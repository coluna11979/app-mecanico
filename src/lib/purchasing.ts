/** Fornecedores, notas de compra e contas a pagar — tipos e cálculos simples */

export type Supplier = {
  id: string; workshop_id: string; name: string; cnpj: string | null; phone: string | null;
  contact: string | null; payment_days: number; notes: string | null; active: boolean;
  created_at: string; updated_at: string;
};

export type PurchaseInvoice = {
  id: string; workshop_id: string; supplier_id: string; number: string | null; issue_date: string;
  freight: number; discount: number; total: number; status: 'posted' | 'cancelled'; notes: string | null;
  created_at: string; cancelled_at: string | null; cancel_reason: string | null;
};

export type PurchaseItem = {
  id: string; invoice_id: string; part_id: string; description: string; quantity: number; unit_cost: number;
};

export type Payable = {
  id: string; workshop_id: string; supplier_id: string | null; invoice_id: string | null;
  description: string; category: string; installment: string | null; amount: number; due_date: string;
  paid_at: string | null; paid_from: 'banco' | 'caixa' | null; cash_entry_id: string | null;
  created_at: string; cancelled_at: string | null;
  payee?: string | null; mechanic_id?: string | null; competence?: string | null;
  document?: string | null; barcode?: string | null; notes?: string | null;
};

export type StockMovement = {
  id: string; part_id: string; qty: number; kind: 'compra' | 'estorno_compra' | 'os' | 'estorno_os' | 'ajuste';
  invoice_id: string | null; service_order_id: string | null; note: string | null; created_at: string;
};

/** Tipos de despesa e as categorias de cada um */
export type PayableGroupKey = 'fixas' | 'pessoal' | 'fornecedores' | 'impostos' | 'variaveis';

export const PAYABLE_GROUPS: { key: PayableGroupKey; label: string; icon: string; badge: string; bar: string; categories: string[] }[] = [
  { key: 'fixas', label: 'Fixas', icon: '🏠', badge: 'bg-brand-50 text-brand-700', bar: 'bg-brand-500',
    categories: ['Aluguel', 'Energia', 'Água', 'Internet / telefone', 'Contador', 'Sistemas', 'Seguro'] },
  { key: 'pessoal', label: 'Pessoal', icon: '👷', badge: 'bg-signal-50 text-signal-700', bar: 'bg-signal-500',
    categories: ['Salários', 'Pró-labore', 'Encargos (INSS/FGTS)', 'Vale-transporte / alimentação'] },
  { key: 'fornecedores', label: 'Fornecedores e peças', icon: '🔩', badge: 'bg-steel-100 text-steel-700', bar: 'bg-steel-500',
    categories: ['Fornecedor'] },
  { key: 'impostos', label: 'Impostos', icon: '🧾', badge: 'bg-alert-50 text-alert-700', bar: 'bg-alert-400',
    categories: ['Simples / DAS', 'IPTU', 'Impostos'] },
  { key: 'variaveis', label: 'Variáveis', icon: '🔧', badge: 'bg-pending-50 text-pending-800', bar: 'bg-pending-500',
    categories: ['Manutenção', 'Ferramentas', 'Marketing', 'Combustível', 'Outros'] },
];

export const PAYABLE_CATEGORIES = PAYABLE_GROUPS.flatMap(g => g.categories);

/** Tipo da categoria (categoria própria ou desconhecida → Variáveis) */
export function groupOf(category: string | null | undefined) {
  const c = (category ?? '').trim().toLowerCase();
  return PAYABLE_GROUPS.find(g => g.categories.some(x => x.toLowerCase() === c)) ?? PAYABLE_GROUPS[4];
}

/** Data local de hoje em "AAAA-MM-DD" */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysISO(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addMonthsISO(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const fmtDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');

/** Dias até o vencimento (negativo = vencida) */
export const daysUntil = (iso: string) =>
  Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${todayISO()}T12:00:00`).getTime()) / 86400000);

/** Divide o total em n parcelas (a última absorve os centavos), a primeira vence em firstDue e as demais a cada `every` dias */
export function splitInstallments(total: number, n: number, firstDue: string, every = 30) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => ({
    due_date: addDaysISO(firstDue, i * every),
    amount: (i === n - 1 ? cents - base * (n - 1) : base) / 100,
  }));
}

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** "12345678000199" → "12.345.678/0001-99" (outros tamanhos ficam como estão) */
export function fmtCnpj(s: string | null | undefined) {
  const d = onlyDigits(s ?? '');
  if (d.length !== 14) return s ?? '';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
