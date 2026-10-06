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
import { PAYABLE_GROUPS, groupOf, type PayableGroupKey } from '@/lib/purchasing';

export type FinEntry = Pick<CashEntry, 'id' | 'kind' | 'method' | 'amount' | 'installments' | 'category' | 'mechanic_id' | 'created_at'>;
export type FinPayment = { id: string; discount: number; created_at: string };
export type FinRegister = Pick<CashRegister, 'id' | 'opened_at' | 'closed_at' | 'opened_by' | 'closed_by' | 'counted_cash' | 'expected_cash' | 'close_notes'>;
export type FinOs = PanelOs & { paid_amount: number; counter_discount: number; pay_later_due?: string | null; pay_later_note?: string | null };

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
    // "Pagar depois" entra sempre (foi combinado no caixa), mesmo de OS anterior ao 1º caixa
    .filter(o => o.status === 'completed' && !o.quote_status && !!o.completed_at
      && (!!o.pay_later_due || new Date(o.completed_at).getTime() >= start))
    .map(o => ({ os: o, open: round2(Number(o.price) - Number(o.counter_discount ?? 0) - Number(o.paid_amount ?? 0)) }))
    .filter(x => x.open > 0.009)
    .map(x => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dueIn = x.os.pay_later_due
        ? Math.round((new Date(`${x.os.pay_later_due}T00:00:00`).getTime() - today.getTime()) / 86400000) : null;
      const days = x.os.completed_at ? Math.floor((now - new Date(x.os.completed_at).getTime()) / 86400000) : 0;
      return {
        ...x,
        partial: Number(x.os.paid_amount ?? 0) > 0,
        days,
        /** dias até o vencimento combinado (negativo = vencido); null = sem "pagar depois" */
        dueIn,
        // Vencido: passou da data combinada; sem data combinada, mais de 7 dias da conclusão
        overdue: dueIn != null ? dueIn < 0 : days > 7,
      };
    })
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.days - a.days);
  const later = rows.filter(x => x.dueIn != null);
  return {
    rows,
    total: sum(rows, x => x.open),
    overdue: rows.filter(x => x.overdue),
    overdueTotal: sum(rows.filter(x => x.overdue), x => x.open),
    laterTotal: sum(later, x => x.open),
    laterCount: later.length,
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

/* ── Visão financeira: saídas operacionais e resultado operacional estimado ──────────────
 * Saídas operacionais = despesas e vales do caixa + contas pagas pelo banco no período.
 *   (conta paga pelo caixa já virou despesa do caixa → não entra de novo; sangria/suprimento ficam fora)
 * Resultado operacional estimado = faturado − custo das peças vendidas − demais despesas.
 *   "Demais despesas" = saídas operacionais SEM as compras de peças (fornecedor / peça comprada no dia),
 *   que já entram pelo custo das peças vendidas — evita contar a mesma peça duas vezes.
 *   Comissões, salários e vales entram como despesa quando já foram pagos/registrados.
 */

export type FinPayable = {
  amount: number; due_date: string; paid_at: string | null; paid_from: 'banco' | 'caixa' | null;
  category: string | null; invoice_id: string | null;
};

/** Compra de peças: já entra pelo custo das peças vendidas, não pelas despesas */
export const isPartsPurchase = (category: string | null | undefined) =>
  category === 'Fornecedor' || category === 'Peça comprada no dia';

/** "AAAA-MM-DD" local de uma data */
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayInRange = (iso: string | null, r: Range) => !!iso && iso.slice(0, 10) >= localDay(r.from) && iso.slice(0, 10) < localDay(r.to);

export function outflowsOf(entries: FinEntry[], payables: FinPayable[], r: Range) {
  const items: { amount: number; category: string; vale?: boolean }[] = [];
  for (const x of entries) {
    if (!inRange(x.created_at, r)) continue;
    if (x.kind === 'despesa') items.push({ amount: Number(x.amount), category: x.category ?? 'Outros' });
    else if (x.kind === 'vale') items.push({ amount: Number(x.amount), category: 'Vales', vale: true });
  }
  for (const p of payables) {
    if (p.paid_from !== 'banco' || !dayInRange(p.paid_at, r)) continue;
    items.push({ amount: Number(p.amount), category: p.category ?? 'Outros' });
  }
  const total = sum(items, i => i.amount);
  const parts = sum(items.filter(i => isPartsPurchase(i.category)), i => i.amount);
  const byGroup = new Map<PayableGroupKey, number>();
  for (const i of items) {
    if (isPartsPurchase(i.category)) continue;
    const g: PayableGroupKey = i.vale ? 'pessoal' : groupOf(i.category).key;
    byGroup.set(g, (byGroup.get(g) ?? 0) + i.amount);
  }
  const groups = PAYABLE_GROUPS.filter(g => (byGroup.get(g.key) ?? 0) > 0)
    .map(g => ({ key: g.key, label: g.label, icon: g.icon, total: round2(byGroup.get(g.key) ?? 0) }));
  return { total: round2(total), partsPurchases: round2(parts), operating: round2(total - parts), groups };
}

/** Faturado − custo das peças vendidas − demais despesas (estimativa: só com os custos cadastrados) */
export function operatingResult(revenue: number, partsCost: number, operatingExpenses: number) {
  const result = round2(revenue - partsCost - operatingExpenses);
  return { result, margin: revenue > 0 ? (result / revenue) * 100 : null };
}

/** Entradas × saídas por dia/mês, com as contas pagas pelo banco nas saídas */
export function flowSeriesFull(entries: FinEntry[], payables: FinPayable[], r: Range) {
  const series = flowSeries(entries, r);
  const days = Math.ceil((r.to.getTime() - r.from.getTime()) / 86400000);
  const byMonth = days > 62;
  const keys = (() => {
    const out: string[] = [];
    const c = new Date(r.from); c.setHours(0, 0, 0, 0); if (byMonth) c.setDate(1);
    while (c < r.to) { out.push(byMonth ? `${c.getFullYear()}-${c.getMonth()}` : localDay(c)); if (byMonth) c.setMonth(c.getMonth() + 1); else c.setDate(c.getDate() + 1); }
    return out;
  })();
  for (const p of payables) {
    if (p.paid_from !== 'banco' || !dayInRange(p.paid_at, r)) continue;
    const d = new Date(`${p.paid_at!.slice(0, 10)}T12:00:00`);
    const i = keys.indexOf(byMonth ? `${d.getFullYear()}-${d.getMonth()}` : localDay(d));
    if (i >= 0 && series[i]) series[i].outflow += Number(p.amount);
  }
  return series;
}

/** Recebido agrupado como o dono pensa: PIX, cartão, dinheiro e outros */
export function receivedGroups(entries: FinEntry[], r: Range) {
  const m = byMethod(entries, r);
  const get = (k: PayMethod) => m.find(x => x.method === k)?.total ?? 0;
  const card = get('debito') + get('credito');
  const other = m.filter(x => !['pix', 'debito', 'credito', 'dinheiro'].includes(x.method)).reduce((a, x) => a + x.total, 0);
  return {
    rows: [
      { key: 'pix', label: '⚡ PIX', total: get('pix') },
      { key: 'cartao', label: '💳 Cartão', total: card },
      { key: 'dinheiro', label: '💵 Dinheiro', total: get('dinheiro') },
      { key: 'outros', label: 'Outros', total: other },
    ].filter(x => x.total > 0),
    installments: m.find(x => x.method === 'credito')?.installmentTotal ?? 0,
  };
}
