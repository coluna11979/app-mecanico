/**
 * Check-up — status e contagens (cálculos puros, sem banco).
 * Base única para o painel, a execução, a fila do mecânico e o relatório:
 * contagens OK/Atenção/Urgente, Estado geral, etapa do card e próxima ação.
 */
import { CHECKUP_TEMPLATE, itemQuote, type CheckupItemStatus, type VehicleCheckup } from '@/lib/checkup';

type ItemLike = { status: CheckupItemStatus | null; system?: string; position?: number; updated_at?: string | null };

/* ─── Contagens ──────────────────────────────────────────────── */
export type CheckupCounts = {
  total: number; answered: number; pending: number;
  ok: number; warn: number; urgent: number; na: number;
  /** Itens 🟡/🔴 — são os que vão para o orçamento */
  flagged: number;
  /** 0–100 */
  progress: number;
};

export function countsOf(items: ItemLike[]): CheckupCounts {
  const n = (s: CheckupItemStatus) => items.filter(i => i.status === s).length;
  const ok = n('ok'), warn = n('warn'), urgent = n('urgent'), na = n('na');
  const answered = ok + warn + urgent + na;
  return {
    total: items.length, answered, pending: items.length - answered,
    ok, warn, urgent, na, flagged: warn + urgent,
    progress: items.length ? Math.round((answered / items.length) * 100) : 0,
  };
}

/* ─── Estado geral (substitui a nota 0–100 na interface) ───────
   Bom = nada a fazer · Bom, com pontos de atenção = só 🟡 · Precisa de reparo = algum 🔴.
   Sem nenhum item avaliado não há estado. */
export type OverallState = 'good' | 'attention' | 'repair';

export const OVERALL_META: Record<OverallState, { label: string; tone: 'signal' | 'pending' | 'alert'; dot: string }> = {
  good:      { label: 'Bom',                          tone: 'signal',  dot: '🟢' },
  attention: { label: 'Bom, com pontos de atenção',   tone: 'pending', dot: '🟡' },
  repair:    { label: 'Precisa de reparo',            tone: 'alert',   dot: '🔴' },
};

/** "Bom, com pontos de atenção — 28 OK, 3 atenção, 1 urgente" (mensagem do WhatsApp) */
export function overallText(items: ItemLike[]): string | undefined {
  const c = countsOf(items);
  const st = overallState(c);
  if (!st) return undefined;
  return `${OVERALL_META[st].label} — ${c.ok} OK, ${c.warn} atenção, ${c.urgent} urgente`;
}

export function overallState(c: Pick<CheckupCounts, 'answered' | 'warn' | 'urgent'>): OverallState | null {
  if (!c.answered) return null;
  if (c.urgent > 0) return 'repair';
  if (c.warn > 0) return 'attention';
  return 'good';
}

/* ─── Sistemas na ordem certa ──────────────────────────────────
   Vem dos próprios itens: sistemas do checklist padrão na ordem dele e, depois,
   qualquer outro sistema (modelos futuros) na ordem em que aparece. Assim nenhum
   item some da tela por não estar no checklist padrão. */
export function systemsOf<T extends ItemLike>(items: T[]): string[] {
  const present = new Set(items.map(i => i.system).filter((s): s is string => !!s));
  const known = CHECKUP_TEMPLATE.map(s => s.system).filter(s => present.has(s));
  const extra = [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(i => i.system).filter((s): s is string => !!s && !known.includes(s));
  return [...known, ...new Set(extra)];
}

/** Primeiro sistema (a partir de `after`) com item ainda sem avaliação */
export function nextPendingSystem<T extends ItemLike>(items: T[], after?: string): string | null {
  const systems = systemsOf(items);
  const start = after ? systems.indexOf(after) + 1 : 0;
  return systems.slice(start).find(s => items.some(i => i.system === s && !i.status)) ?? null;
}

/* ─── Etapa do check-up no painel ──────────────────────────────
   Filtro (bucket) × situação (o que mostrar no card).
   "Pronto · falta enviar" fica em Em andamento: a pendência ainda é da oficina. */
export type Bucket = 'andamento' | 'aguardando' | 'finalizado';
export type Situation =
  | 'nao_iniciado'   // rascunho sem nenhum item avaliado
  | 'inspecionando'  // rascunho com itens avaliados
  | 'falta_enviar'   // finalizado, orçamento/relatório não enviado
  | 'enviado'        // enviado, cliente ainda não abriu
  | 'cliente_viu'    // abriu e não respondeu
  | 'aprovado'       // virou OS
  | 'respondido'     // respondeu sem aprovar nada agora
  | 'refeito';       // substituído por um check-up novo (replaced_by)

type CkFunnel = Pick<VehicleCheckup, 'status' | 'quote_sent_at' | 'customer_viewed_at' | 'customer_responded_at' | 'sale_os_id' | 'replaced_by'>;

export function situationOf(c: CkFunnel, answered: number): Situation {
  if (c.replaced_by) return 'refeito';
  if (c.status !== 'completed') return answered > 0 ? 'inspecionando' : 'nao_iniciado';
  if (c.sale_os_id) return 'aprovado';
  if (c.customer_responded_at) return 'respondido';
  if (c.customer_viewed_at) return 'cliente_viu';
  if (c.quote_sent_at) return 'enviado';
  return 'falta_enviar';
}

export function bucketOf(s: Situation): Bucket {
  if (s === 'enviado' || s === 'cliente_viu') return 'aguardando';
  if (s === 'aprovado' || s === 'respondido' || s === 'refeito') return 'finalizado';
  return 'andamento';
}

/** Rótulo do card — versão do gestor */
export const SITUATION_LABEL: Record<Situation, string> = {
  nao_iniciado:  'Não iniciado',
  inspecionando: 'Em inspeção',
  falta_enviar:  'Pronto · falta enviar',
  enviado:       'Enviado ao cliente',
  cliente_viu:   'Cliente viu · sem resposta',
  aprovado:      'Aprovado · virou OS',
  respondido:    'Respondido · nada aprovado agora',
  refeito:       'Refeito',
};

/* ─── Atividade ──────────────────────────────────────────────── */
/** Último movimento: a edição de item não mexe no updated_at do check-up, então olha os dois */
export function lastActivity(c: Pick<VehicleCheckup, 'updated_at' | 'created_at'>, items: ItemLike[] = []): string {
  let best = c.updated_at || c.created_at;
  for (const i of items) if (i.updated_at && i.updated_at > best) best = i.updated_at;
  return best;
}

const HOUR = 3600000;
export const hoursSince = (iso: string | null | undefined, now = Date.now()) =>
  iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / HOUR)) : null;

/** "agora", "há 3 h", "há 2 d" */
export function ago(iso: string | null | undefined, now = Date.now()) {
  const h = hoursSince(iso, now);
  if (h == null) return '';
  if (h < 1) return 'agora';
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

/** Início da semana (segunda 00:00, hora local) */
export function weekStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/* ─── Orçamento ──────────────────────────────────────────────── */
type QuoteLike = ItemLike & { quote_labor?: number | null; quote_parts?: number | null };

/** Itens 🟡/🔴 (vão para o orçamento) ainda sem valor */
export function itemsWithoutPrice<T extends QuoteLike>(items: T[]): T[] {
  return items.filter(i => (i.status === 'warn' || i.status === 'urgent') && itemQuote(i) <= 0);
}

/** O que dá para enviar ao cliente agora:
 *  quote  = orçamento completo (todos os itens com valor)
 *  report = só o diagnóstico (nenhum item com valor — o link não mostra aprovação)
 *  blocked = alguns itens com valor e outros sem: completar antes de enviar */
export function sendMode(items: QuoteLike[]): 'quote' | 'report' | 'blocked' {
  const flagged = items.filter(i => i.status === 'warn' || i.status === 'urgent');
  const priced = flagged.filter(i => itemQuote(i) > 0).length;
  if (!flagged.length || priced === 0) return 'report';
  return priced === flagged.length ? 'quote' : 'blocked';
}
