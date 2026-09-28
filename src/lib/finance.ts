/**
 * Financeiro da oficina — cálculos puros (sem acesso ao banco).
 *
 * Definições:
 * - Entradas = recebimentos de OS + entradas avulsas lançados no caixa (estornos fora).
 * - Saídas = despesas + vales lançados no caixa. Sangria e suprimento só mudam o
 *   dinheiro de lugar (gaveta ↔ cofre/banco), então não entram no resultado.
 * - A receber = OS concluída com saldo em aberto (valor − desconto − já pago), só a
 *   partir do primeiro caixa aberto — antes disso o pagamento não era registrado no sistema.
 * - Quebra de caixa = contado − esperado no fechamento.
 */
import type { CashEntry, CashRegister, PayMethod } from '@/lib/cash';
import type { PanelOs, Range } from '@/lib/workshopMetrics';

export type FinEntry = Pick<CashEntry, 'id' | 'kind' | 'method' | 'amount' | 'installments' | 'category' | 'mechanic_id' | 'created_at'>;
export type FinPayment = { id: string; discount: number; created_at: string };
export type FinRegister = Pick<CashRegister, 'id' | 'opened_at' | 'closed_at' | 'opened_by' | 'closed_by' | 'counted_cash' | 'expected_cash' | 'close_notes'>;
export type FinOs = PanelOs & { paid_amount: number; counter_discount: number };

const inRange = (iso: string | null | undefined, r: Range) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= r.from.getTime() && t < r.to.getTime();
};

const sum = <T>(list: T[], f: (x: T) => number) => list.reduce((a, x) => a + f(x), 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Entradas, saídas e resultado do caixa no período */
export function cashFlowOf(entries: FinEntry[], payments: FinPayment[], r: Range) {
  const e = entries.filter(x => inRange(x.created_at, r));
  const of = (k: FinEntry['kind']) => e.filter(x => x.kind === k);
  const received = sum(of('recebimento'), x => Number(x.amount));
  const other    = sum(of('entrada'), x => Number(x.amount));
  const expenses = sum(of('despesa'), x => Number(x.amount));
  const vales    = sum(of('vale'), x => Number(x.amount));
  const pays     = payments.filter(p => inRange(p.created_at, r));
  return {
    received, other, expenses, vales,
    inflow: received + other,
    outflow: expenses + vales,
    result: received + other - expenses - vales,
    receipts: pays.length,
    discounts: sum(pays, p => Number(p.discount)),
    discountCount: pays.filter(p => Number(p.discount) > 0).length,
  };
}

/** Recebido por forma de pagamento (inclui quanto do crédito foi parcelado) */
export function byMethod(entries: FinEntry[], r: Range) {
  const rows = new Map<PayMethod, { method: PayMethod; total: number; count: number; installmentTotal: number }>();
  for (const x of entries) {
    if (x.kind !== 'recebimento' || !inRange(x.created_at, r)) continue;
    const row = rows.get(x.method) ?? { method: x.method, total: 0, count: 0, installmentTotal: 0 };
    row.total += Number(x.amount);
    row.count += 1;
    if (x.installments > 1) row.installmentTotal += Number(x.amount);
    rows.set(x.method, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

/** Despesas do caixa por categoria */
export function expensesByCategory(entries: FinEntry[], r: Range) {
  const rows = new Map<string, { category: string; total: number; count: number }>();
  for (const x of entries) {
    if (x.kind !== 'despesa' || !inRange(x.created_at, r)) continue;
    const c = x.category?.trim() || 'Sem categoria';
    const row = rows.get(c) ?? { category: c, total: 0, count: 0 };
    row.total += Number(x.amount);
    row.count += 1;
    rows.set(c, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}

/** Vales por colaborador no período (id → total) */
export function valesByMechanic(entries: FinEntry[], r: Range) {
  const m = new Map<string, number>();
  for (const x of entries) {
    if (x.kind !== 'vale' || !inRange(x.created_at, r)) continue;
    const k = x.mechanic_id ?? '__none__';
    m.set(k, (m.get(k) ?? 0) + Number(x.amount));
  }
  return m;
}

/**
 * OS concluídas que ainda têm saldo a receber (independe do período), mais antigas primeiro.
 * `since` = abertura do primeiro caixa; sem caixa nenhum, não há o que cobrar pelo sistema.
 */
export function receivables(list: FinOs[], since: string | null) {
  const now = Date.now();
  const start = since ? new Date(since).getTime() : Infinity;
  const rows = list
    .filter(o => o.status === 'completed' && !o.quote_status && !!o.completed_at && new Date(o.completed_at).getTime() >= start)
    .map(o => ({ os: o, open: round2(Number(o.price) - Number(o.counter_discount ?? 0) - Number(o.paid_amount ?? 0)) }))
    .filter(x => x.open > 0.009)
    .map(x => ({
      ...x,
      partial: Number(x.os.paid_amount ?? 0) > 0,
      days: x.os.completed_at ? Math.floor((now - new Date(x.os.completed_at).getTime()) / 86400000) : 0,
    }))
    .sort((a, b) => b.days - a.days);
  return {
    rows,
    total: sum(rows, x => x.open),
    overdue: rows.filter(x => x.days > 7),
    overdueTotal: sum(rows.filter(x => x.days > 7), x => x.open),
  };
}

/** Caixas fechados no período, com a diferença entre contado e esperado */
export function closings(registers: FinRegister[], r: Range) {
  const rows = registers
    .filter(x => x.closed_at && inRange(x.closed_at, r))
    .map(x => ({ ...x, diff: round2(Number(x.counted_cash ?? 0) - Number(x.expected_cash ?? 0)) }))
    .sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime());
  return {
    rows,
    net: round2(sum(rows, x => x.diff)),
    withDiff: rows.filter(x => Math.abs(x.diff) >= 0.01).length,
  };
}

/** Entradas × saídas por dia (ou por mês em períodos longos) para o gráfico */
export function flowSeries(entries: FinEntry[], r: Range) {
  const days = Math.ceil((r.to.getTime() - r.from.getTime()) / 86400000);
  const byMonth = days > 62;
  const keyOf = (d: Date) => (byMonth ? `${d.getFullYear()}-${d.getMonth()}` : d.toDateString());
  const buckets = new Map<string, { label: string; inflow: number; outflow: number }>();
  const cursor = new Date(r.from);
  cursor.setHours(0, 0, 0, 0);
  if (byMonth) cursor.setDate(1);
  while (cursor < r.to) {
    buckets.set(keyOf(cursor), {
      label: byMonth
        ? cursor.toLocaleDateString('pt-BR', { month: 'short' })
        : cursor.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      inflow: 0, outflow: 0,
    });
    if (byMonth) cursor.setMonth(cursor.getMonth() + 1); else cursor.setDate(cursor.getDate() + 1);
  }
  for (const x of entries) {
    if (!inRange(x.created_at, r)) continue;
    const b = buckets.get(keyOf(new Date(x.created_at)));
    if (!b) continue;
    if (x.kind === 'recebimento' || x.kind === 'entrada') b.inflow += Number(x.amount);
    else if (x.kind === 'despesa' || x.kind === 'vale') b.outflow += Number(x.amount);
  }
  return [...buckets.values()];
}
