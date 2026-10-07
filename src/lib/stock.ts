/**
 * Estoque e compras — leitura e cálculos do painel e da lista de peças.
 * Só lê o que já existe (peças, movimentos, notas, OS); não grava nada.
 *
 * Regras (aprovadas):
 *  • "Custo a confirmar": peça sem nenhuma nota de compra lançada (não estornada) e que tem
 *    estoque ou está sem custo. Peça criada pela importação de notas antigas fica com custo
 *    estimado pela margem — só conta aqui se tiver estoque.
 *  • "Zerada": só para peça que já entrou por nota. As que nunca tiveram compra não alertam.
 *  • "Parada": tem estoque e custo, nenhuma saída em OS nos últimos 90 dias e cadastrada há
 *    mais de 90 dias. Só aparece quando a oficina tem 90 dias de histórico de estoque.
 */
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { partKey, type WorkshopPart } from '@/lib/parts';
import type { StockMovement } from '@/lib/purchasing';

export const STALE_DAYS = 90;
const DAY = 86400000;

export type OsNeed = { qty: number; orders: { id: string; number: number | null }[] };

export type StockData = {
  parts: WorkshopPart[];
  /** Peças com nota de compra lançada (custo confirmado) */
  bought: Set<string>;
  /** Última movimentação de cada peça (ISO) */
  lastMove: Map<string, string>;
  /** Última saída em OS de cada peça (ISO) */
  lastOut: Map<string, string>;
  /** Peças pedidas em OS ainda abertas */
  osNeed: Map<string, OsNeed>;
  /** Primeiro movimento de estoque da oficina (ISO) — define se já há histórico para "paradas" */
  historyStart: string | null;
};

export async function loadStockData(wid: string): Promise<StockData> {
  const [p, inv, items, moves, first, need] = await Promise.all([
    fetchAll<WorkshopPart>((a, b) => supabase.from('workshop_parts').select('*').eq('workshop_id', wid).order('id').range(a, b)),
    fetchAll<{ id: string }>((a, b) => supabase.from('purchase_invoices').select('id').eq('workshop_id', wid).eq('status', 'posted').order('id').range(a, b)),
    fetchAll<{ part_id: string; invoice_id: string }>((a, b) => supabase.from('purchase_items').select('part_id, invoice_id').eq('workshop_id', wid).order('id').range(a, b)),
    fetchAll<Pick<StockMovement, 'part_id' | 'kind' | 'created_at'>>((a, b) => supabase.from('stock_movements')
      .select('part_id, kind, created_at').eq('workshop_id', wid).order('id').range(a, b)),
    supabase.from('stock_movements').select('created_at').eq('workshop_id', wid).order('created_at').limit(1).maybeSingle(),
    fetchAll((a, b) =>
      supabase.from('service_order_items')
        .select('part_id, quantity, so:service_orders!inner(id, number, status)')
        .eq('workshop_id', wid).eq('kind', 'part').not('part_id', 'is', null)
        .not('so.status', 'in', '(completed,cancelled)')
        .order('id').range(a, b)),
  ]);

  const posted = new Set(inv.data.map(i => i.id));
  const bought = new Set(items.data.filter(i => posted.has(i.invoice_id)).map(i => i.part_id));

  const lastMove = new Map<string, string>();
  const lastOut = new Map<string, string>();
  for (const m of moves.data) {
    if ((lastMove.get(m.part_id) ?? '') < m.created_at) lastMove.set(m.part_id, m.created_at);
    if (m.kind === 'os' && (lastOut.get(m.part_id) ?? '') < m.created_at) lastOut.set(m.part_id, m.created_at);
  }

  const osNeed = new Map<string, OsNeed>();
  for (const it of need.data as unknown as { part_id: string; quantity: number; so: { id: string; number: number | null; status: string } }[]) {
    const e = osNeed.get(it.part_id) ?? { qty: 0, orders: [] };
    e.qty += Number(it.quantity);
    if (!e.orders.some(o => o.id === it.so.id)) e.orders.push({ id: it.so.id, number: it.so.number });
    osNeed.set(it.part_id, e);
  }

  return {
    parts: p.data, bought, lastMove, lastOut, osNeed,
    historyStart: (first.data as { created_at: string } | null)?.created_at ?? null,
  };
}

/* ── Situação da peça ─────────────────────────────────────────────────────── */

const qty = (p: WorkshopPart) => Number(p.stock_qty);

export const isNegative = (p: WorkshopPart) => qty(p) < 0;
export const isBelowMin = (p: WorkshopPart) => Number(p.min_qty) > 0 && qty(p) >= 0 && qty(p) <= Number(p.min_qty);
/** Zerada só conta para peça que já entrou por nota */
export const isZeroBought = (p: WorkshopPart, d: StockData) => qty(p) === 0 && d.bought.has(p.id);
export const costToConfirm = (p: WorkshopPart, d: StockData) =>
  !d.bought.has(p.id) && (qty(p) > 0 || Number(p.cost) <= 0);
/** Quanto falta para atender as OS abertas (0 = dá conta) */
export const osShortage = (p: WorkshopPart, d: StockData) => {
  const n = d.osNeed.get(p.id);
  return n ? Math.max(0, n.qty - Math.max(0, qty(p))) : 0;
};

export const hasStaleHistory = (d: StockData, now = Date.now()) =>
  !!d.historyStart && now - new Date(d.historyStart).getTime() >= STALE_DAYS * DAY;

export const isStale = (p: WorkshopPart, d: StockData, now = Date.now()) => {
  if (!hasStaleHistory(d, now) || qty(p) <= 0 || Number(p.cost) <= 0) return false;
  if (now - new Date(p.created_at).getTime() < STALE_DAYS * DAY) return false;
  const out = d.lastOut.get(p.id);
  return !out || now - new Date(out).getTime() >= STALE_DAYS * DAY;
};

export type Situation = 'todas' | 'atencao' | 'baixo' | 'zerada' | 'negativo' | 'os' | 'custo' | 'com_estoque' | 'parada';

export const SITUATIONS: { value: Situation; label: string }[] = [
  { value: 'todas',       label: 'Todas as peças' },
  { value: 'atencao',     label: 'Precisam de atenção' },
  { value: 'os',          label: 'Faltando para OS' },
  { value: 'negativo',    label: 'Estoque negativo' },
  { value: 'baixo',       label: 'Abaixo do mínimo' },
  { value: 'zerada',      label: 'Zeradas (já compradas)' },
  { value: 'custo',       label: 'Custo a confirmar' },
  { value: 'com_estoque', label: 'Com estoque' },
  { value: 'parada',      label: 'Paradas há 90 dias' },
];

export function matchSituation(p: WorkshopPart, s: Situation, d: StockData) {
  switch (s) {
    case 'todas':       return true;
    case 'atencao':     return isNegative(p) || osShortage(p, d) > 0 || isBelowMin(p) || isZeroBought(p, d);
    case 'os':          return osShortage(p, d) > 0;
    case 'negativo':    return isNegative(p);
    case 'baixo':       return isBelowMin(p);
    case 'zerada':      return isZeroBought(p, d);
    case 'custo':       return costToConfirm(p, d);
    case 'com_estoque': return qty(p) > 0;
    case 'parada':      return isStale(p, d);
  }
}

/* ── Alertas "Atenção agora" (do mais grave ao menos) ─────────────────────── */

export type StockAlert =
  | { kind: 'os'; part: WorkshopPart; short: number; need: OsNeed }
  | { kind: 'negativo'; part: WorkshopPart }
  | { kind: 'baixo'; part: WorkshopPart }
  | { kind: 'zerada'; part: WorkshopPart }
  | { kind: 'custo'; count: number };

export function stockAlerts(d: StockData): StockAlert[] {
  const act = d.parts.filter(p => p.active);
  const out: StockAlert[] = [];
  const seen = new Set<string>();
  const push = (a: StockAlert & { part: WorkshopPart }) => { if (!seen.has(a.part.id)) { seen.add(a.part.id); out.push(a); } };
  for (const p of act) { const s = osShortage(p, d); if (s > 0) push({ kind: 'os', part: p, short: s, need: d.osNeed.get(p.id)! }); }
  for (const p of act) if (isNegative(p)) push({ kind: 'negativo', part: p });
  for (const p of act) if (isBelowMin(p)) push({ kind: 'baixo', part: p });
  for (const p of act) if (isZeroBought(p, d)) push({ kind: 'zerada', part: p });
  // Custo a confirmar vira um alerta só (são muitas peças, não uma ação por peça)
  const toConfirm = act.filter(p => costToConfirm(p, d)).length;
  if (toConfirm > 0) out.push({ kind: 'custo', count: toConfirm });
  return out;
}

/* ── Peças que mais saem (vendas em OS concluídas) ────────────────────────── */

export type TopPart = { key: string; name: string; qty: number; revenue: number; orders: number };

/**
 * Peças mais vendidas nas OS concluídas desde `sinceISO`. Agrupa pelo nome (a maioria das
 * peças da OS é digitada, sem ligação com o cadastro); peça do cadastro usa o nome do cadastro.
 */
export async function loadTopParts(wid: string, sinceISO: string, parts: WorkshopPart[]) {
  const { data } = await fetchAll<{ description: string; quantity: number; unit_price: number; part_id: string | null; service_order_id: string }>((a, b) =>
    supabase.from('service_order_items')
      .select('description, quantity, unit_price, part_id, service_order_id, so:service_orders!inner(status, completed_at)')
      .eq('workshop_id', wid).eq('kind', 'part')
      .eq('so.status', 'completed').gte('so.completed_at', sinceISO)
      .order('id').range(a, b));
  const names = new Map(parts.map(p => [p.id, p.name]));
  const m = new Map<string, TopPart & { os: Set<string> }>();
  for (const it of data) {
    const name = (it.part_id && names.get(it.part_id)) || it.description?.trim();
    if (!name) continue;
    const key = partKey(name);
    const e = m.get(key) ?? { key, name, qty: 0, revenue: 0, orders: 0, os: new Set<string>() };
    e.qty += Number(it.quantity) || 0;
    e.revenue += (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
    e.os.add(it.service_order_id);
    m.set(key, e);
  }
  return [...m.values()].map(({ os, ...e }) => ({ ...e, orders: os.size }));
}

/* ── Formatação ───────────────────────────────────────────────────────────── */

/** "hoje", "ontem", "há 5 dias", "há 3 meses" */
export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - that.getTime()) / DAY);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  return months < 12 ? `há ${months} ${months === 1 ? 'mês' : 'meses'}` : `há ${Math.floor(months / 12)} ano${months >= 24 ? 's' : ''}`;
}

export const osLabel = (n: number | null, id: string) => `OS nº ${n != null ? String(n).padStart(4, '0') : id.slice(0, 8)}`;
