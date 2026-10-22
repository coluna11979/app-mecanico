/**
 * Painel do Check-up (gestor) — cálculos puros, sem banco.
 * Card, próxima ação, KPIs e "Atenção agora" saem daqui; a tela só desenha.
 */
import type { CheckupItemStatus, VehicleCheckup } from '@/lib/checkup';
import {
  ago, bucketOf, countsOf, hoursSince, itemsWithoutPrice, lastActivity, situationOf,
  type Bucket, type CheckupCounts, type Situation,
} from '@/lib/checkupStatus';

export type PanelItem = {
  status: CheckupItemStatus | null; updated_at: string | null; system?: string;
  quote_labor: number | null; quote_parts: number | null; customer_decision: string | null;
};
export type PanelCheckup = VehicleCheckup & {
  mechanic: { name: string; phone: string | null } | null;
  items: PanelItem[];
  /** OS criada pela aprovação: quem vai executar é o gestor que escolhe (equipe ou plataforma) */
  sale_os?: { number: number | null; status: string; workshop_mechanic_id: string | null; executor: string | null } | null;
};
/** OS de check-up agendada que ainda não virou inspeção */
export type ScheduledOs = {
  id: string; number: number | null; scheduled_at: string; workshop_mechanic_id: string | null;
  customer: { full_name: string } | null;
  vehicle: { plate: string; make: string; model: string; year: number | null } | null;
  mechanic: { name: string } | null;
};

export type Action =
  | 'comecar' | 'continuar' | 'cobrar_mecanico' | 'preencher_precos' | 'enviar_orcamento' | 'enviar_relatorio'
  | 'whatsapp' | 'ver' | 'abrir_os' | 'iniciar' | 'abrir_novo' | 'definir_responsavel';

export const ACTION_LABEL: Record<Action, string> = {
  comecar: 'Começar', continuar: 'Continuar', cobrar_mecanico: 'Cobrar mecânico',
  preencher_precos: 'Preencher preços', enviar_orcamento: 'Enviar orçamento', enviar_relatorio: 'Enviar relatório',
  whatsapp: 'WhatsApp', ver: 'Ver', abrir_os: 'Abrir OS', iniciar: 'Iniciar', abrir_novo: 'Ver o novo',
  definir_responsavel: 'Definir responsável',
};

export type Row = {
  c: PanelCheckup;
  counts: CheckupCounts;
  situation: Situation;
  bucket: Bucket;
  /** Quando entrou na situação atual (ou último movimento, se em inspeção) */
  since: string;
  /** Itens 🟡/🔴 sem valor */
  noPrice: number;
  action: Action;
  /** Link do mecânico enviado e ainda não aberto */
  mechanicWaiting: boolean;
  /** Aprovado: a OS criada ainda não tem quem vai executar */
  needsResponsible: boolean;
};

export function rowOf(c: PanelCheckup): Row {
  const counts = countsOf(c.items);
  const situation = situationOf(c, counts.answered);
  const noPrice = itemsWithoutPrice(c.items).length;
  const mechanicWaiting = c.status === 'draft' && !!c.mechanic_link_sent_at && !c.mechanic_opened_at;
  const so = c.sale_os;
  const needsResponsible = !!c.sale_os_id && !!so && !so.workshop_mechanic_id && so.executor !== 'platform'
    && so.status !== 'completed' && so.status !== 'cancelled';
  const since = {
    nao_iniciado:  c.mechanic_link_sent_at ?? c.created_at,
    inspecionando: lastActivity(c, c.items),
    falta_enviar:  c.completed_at ?? c.updated_at,
    enviado:       c.quote_sent_at ?? c.updated_at,
    cliente_viu:   c.customer_viewed_at ?? c.updated_at,
    aprovado:      c.customer_responded_at ?? c.updated_at,
    respondido:    c.customer_responded_at ?? c.updated_at,
    refeito:       c.updated_at,
  }[situation];
  let action: Action;
  switch (situation) {
    case 'nao_iniciado':  action = mechanicWaiting ? 'cobrar_mecanico' : 'comecar'; break;
    case 'inspecionando': action = 'continuar'; break;
    case 'falta_enviar':
      action = noPrice > 0 ? 'preencher_precos' : counts.flagged > 0 ? 'enviar_orcamento' : 'enviar_relatorio';
      break;
    case 'cliente_viu':   action = 'whatsapp'; break;
    case 'aprovado':      action = needsResponsible ? 'definir_responsavel' : c.sale_os_id ? 'abrir_os' : 'ver'; break;
    case 'refeito':       action = 'abrir_novo'; break;
    default:              action = 'ver';
  }
  return { c, counts, situation, bucket: bucketOf(situation), since, noPrice, action, mechanicWaiting, needsResponsible };
}

/** Texto curto de tempo no card: "Em inspeção · mexido há 3 h" */
export function sinceLabel(r: Row) {
  const t = ago(r.since);
  switch (r.situation) {
    case 'nao_iniciado':  return r.mechanicWaiting ? `Link enviado ao mecânico ${t}` : `Criado ${t}`;
    case 'inspecionando': return `Em inspeção · mexido ${t}`;
    case 'falta_enviar':  return `Pronto ${t}`;
    case 'enviado':       return `Enviado ${t}`;
    case 'cliente_viu':   return `Cliente viu ${t}`;
    case 'aprovado':      return r.needsResponsible ? `Aprovado ${t} · OS sem responsável` : `Aprovado ${t}`;
    case 'respondido':    return `Respondeu ${t}`;
    case 'refeito':       return `Refeito ${t}`;
  }
}

/* ─── KPIs ───────────────────────────────────────────────────── */
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function kpisOf(rows: Row[], scheduled: ScheduledOs[], periodDays: number, now = new Date()) {
  const from = new Date(now.getTime() - periodDays * 86400000);
  const approved = rows.filter(r => r.situation === 'aprovado' && new Date(r.since) >= from);
  return {
    agendadosHoje: scheduled.filter(o => sameDay(new Date(o.scheduled_at), now)).length,
    andamento: rows.filter(r => r.bucket === 'andamento').length,
    aguardando: rows.filter(r => r.bucket === 'aguardando').length,
    aprovados: approved.length,
    approvedIds: new Set(approved.map(r => r.c.id)),
  };
}

/* ─── Atenção agora ────────────────────────────────────────────
   Só o que pede ação da oficina, mais urgente primeiro. */
export type Attention = {
  key: string; priority: number; hours: number;
  reason: string; action: Action;
  row?: Row; os?: ScheduledOs;
};

const STALE_HOURS = 2;

export function attentionOf(rows: Row[], scheduled: ScheduledOs[], now = Date.now()): Attention[] {
  const out: Attention[] = [];
  for (const r of rows) {
    const h = hoursSince(r.since, now) ?? 0;
    const t = ago(r.since, now);
    const base = { key: r.c.id, row: r, hours: h };
    if (r.needsResponsible)
      out.push({ ...base, priority: 0, action: 'definir_responsavel',
        reason: `Aprovado ${t} · OS nº ${String(r.c.sale_os?.number ?? '').padStart(4, '0')} sem responsável — escolha quem vai fazer` });
    else if (r.situation === 'cliente_viu' && h >= 24)
      out.push({ ...base, priority: 1, action: 'whatsapp', reason: `Cliente viu o orçamento ${t} e não respondeu` });
    else if (r.situation === 'falta_enviar' && r.noPrice > 0)
      out.push({ ...base, priority: 2, action: 'preencher_precos', reason: `Pronto ${t} · ${r.noPrice} ${r.noPrice === 1 ? 'item sem preço' : 'itens sem preço'}` });
    else if (r.situation === 'falta_enviar')
      out.push({ ...base, priority: 3, action: r.action, reason: `${r.counts.flagged ? 'Orçamento' : 'Relatório'} pronto ${t} e não enviado` });
    else if (r.situation === 'inspecionando' && h >= STALE_HOURS)
      out.push({ ...base, priority: 5, action: 'continuar', reason: `Check-up parado ${t} (${r.counts.answered} de ${r.counts.total})` });
    else if (r.mechanicWaiting && h >= 1)
      out.push({ ...base, priority: 6, action: 'cobrar_mecanico', reason: `Link enviado ao mecânico ${t} e ainda não aberto` });
    else if (r.situation === 'enviado' && h >= 48)
      out.push({ ...base, priority: 7, action: 'whatsapp', reason: `Enviado ao cliente ${t} e ainda não aberto` });
  }
  for (const o of scheduled) {
    const when = new Date(o.scheduled_at).getTime();
    if (when >= now) continue;
    const h = Math.floor((now - when) / 3600000);
    const hhmm = new Date(o.scheduled_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const day = sameDay(new Date(o.scheduled_at), new Date(now)) ? `hoje às ${hhmm}`
      : new Date(o.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ` às ${hhmm}`;
    out.push({ key: `os-${o.id}`, os: o, priority: 4, hours: h, action: 'iniciar', reason: `Agendado ${day} e não iniciado` });
  }
  return out.sort((a, b) => a.priority - b.priority || b.hours - a.hours);
}
