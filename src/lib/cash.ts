export type PayMethod = 'dinheiro' | 'pix' | 'debito' | 'credito' | 'convenio' | 'crediario';
export type EntryKind = 'recebimento' | 'entrada' | 'suprimento' | 'sangria' | 'despesa' | 'vale';

export type CashRegister = {
  id: string; workshop_id: string; status: 'open' | 'closed'; opening_amount: number;
  opened_at: string; opened_by: string | null; closed_at: string | null; closed_by: string | null;
  counted_cash: number | null; expected_cash: number | null; summary: CashSummary | null; close_notes: string | null;
};

export type CashEntry = {
  id: string; register_id: string; kind: EntryKind; method: PayMethod; amount: number; installments: number;
  category: string | null; description: string | null; mechanic_id: string | null; payment_id: string | null;
  operator_id: string | null; role: string | null; created_at: string;
  cancelled_at: string | null; cancel_reason: string | null;
};

export type CashSummary = {
  opening: number; expected_cash: number; change_given: number;
  by_method: Partial<Record<PayMethod, number>>; by_kind: Partial<Record<EntryKind, number>>;
};

/** Formas aceitas hoje no recebimento (convênio e crediário entram com Contas a Receber) */
export const RECEIVE_METHODS: PayMethod[] = ['dinheiro', 'pix', 'debito', 'credito'];

export const METHODS: Record<PayMethod, { label: string; icon: string }> = {
  dinheiro:  { label: 'Dinheiro',        icon: '💵' },
  pix:       { label: 'PIX',             icon: '⚡' },
  debito:    { label: 'Débito',          icon: '💳' },
  credito:   { label: 'Crédito',         icon: '💳' },
  convenio:  { label: 'Convênio',        icon: '🏢' },
  crediario: { label: 'Parcelado loja',  icon: '📒' },
};

/** sign: +1 entra dinheiro na gaveta, -1 sai */
export const KINDS: Record<EntryKind, { label: string; icon: string; sign: 1 | -1; desc: string }> = {
  recebimento: { label: 'Recebimento',     icon: '🧾', sign: 1,  desc: 'Pagamento de OS' },
  entrada:     { label: 'Entrada avulsa',  icon: '➕', sign: 1,  desc: 'Venda de balcão ou outro dinheiro que entrou' },
  suprimento:  { label: 'Suprimento',      icon: '🪙', sign: 1,  desc: 'Reforço de troco colocado na gaveta' },
  sangria:     { label: 'Sangria',         icon: '🏦', sign: -1, desc: 'Dinheiro retirado para o cofre ou banco' },
  despesa:     { label: 'Despesa',         icon: '🧾', sign: -1, desc: 'Gasto do dia a dia pago com o dinheiro do caixa' },
  vale:        { label: 'Vale funcionário', icon: '🪪', sign: -1, desc: 'Adiantamento para um colaborador' },
};

export const EXPENSE_CATEGORIES = [
  'Alimentação', 'Café e copa', 'Limpeza', 'Material de escritório', 'Frete / entrega',
  'Peça comprada no dia', 'Combustível', 'Manutenção da oficina', 'Outros',
];

export const brl = (n: number | null | undefined) =>
  (Number(n ?? 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "12,50" / "1.234,5" / "12.5" → número */
export function parseMoney(s: string): number {
  const t = s.trim();
  if (!t) return 0;
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export const moneyStr = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');

export const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
