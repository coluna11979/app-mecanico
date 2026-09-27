import type { OsStatus, ReworkCause } from '@/types/database';

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberta',
  awaiting_approval: 'Aguardando aprovação',
  approved: 'Aprovada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};
const STATUS_BADGE: Record<string, string> = {
  open: 'bg-steel-100 text-steel-700',
  awaiting_approval: 'bg-pending-100 text-pending-800',
  approved: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-brand-100 text-brand-700',
  completed: 'bg-signal-100 text-signal-700',
  cancelled: 'bg-steel-100 text-steel-500',
};
const STATUS_BORDER: Record<string, string> = {
  open: 'border-l-steel-400',
  awaiting_approval: 'border-l-pending-500',
  approved: 'border-l-blue-500',
  in_progress: 'border-l-brand-500',
  completed: 'border-l-signal-500',
  cancelled: 'border-l-steel-300',
};

/** Ordem do fluxo da OS (usada nos filtros e contadores) */
export const OS_STATUS_FLOW = ['open', 'awaiting_approval', 'approved', 'in_progress', 'completed', 'cancelled'] as const;

/**
 * O que muda na OS ao trocar de situação (datas, recusa) + mensagem para o toast.
 * Única regra usada pela lista de OS e pela página da OS.
 */
export function statusChange(
  os: { started_at: string | null },
  to: OsStatus,
  opts: { channel?: string; declined?: boolean } = {},
): { patch: Record<string, unknown>; message: string } {
  const now = new Date().toISOString();
  switch (to) {
    case 'awaiting_approval':
      return { patch: { status: to, approval_requested_at: now }, message: 'Orçamento enviado para aprovação 📤' };
    case 'approved':
      return { patch: { status: to, approved_at: now, approval_channel: opts.channel ?? null, quote_status: null }, message: 'Orçamento aprovado ✅' };
    case 'in_progress':
      return { patch: { status: to, ...(os.started_at ? {} : { started_at: now }) }, message: 'Serviço iniciado ▶' };
    case 'completed':
      return { patch: { status: to, completed_at: now }, message: 'OS concluída ✓' };
    case 'open':
      return { patch: { status: to, completed_at: null, quote_status: null }, message: 'OS reaberta para correção' };
    case 'cancelled':
      return opts.declined
        ? { patch: { status: to, quote_status: 'declined' }, message: 'Orçamento não aprovado — fica salvo para retomar o contato' }
        : { patch: { status: to }, message: 'OS cancelada' };
  }
}

/** Como o cliente aprovou o orçamento */
export const APPROVAL_CHANNELS: { value: string; label: string }[] = [
  { value: 'whatsapp',   label: '💬 WhatsApp' },
  { value: 'telefone',   label: '📞 Telefone' },
  { value: 'presencial', label: '🤝 Pessoalmente' },
];

export function osLabel(s: string) {
  return STATUS_LABEL[s] ?? s;
}
export function osColor(s: string) {
  return STATUS_BADGE[s] ?? '';
}
export function osBorder(s: string) {
  return STATUS_BORDER[s] ?? 'border-l-steel-300';
}

/** Rótulo/cor considerando orçamento não aprovado (status 'cancelled' + quote_status 'declined') */
type OsLike = { status: string; quote_status?: string | null };
export function osStatusLabel(os: OsLike) {
  return os.quote_status === 'declined' ? 'Orçamento não aprovado' : osLabel(os.status);
}
export function osStatusColor(os: OsLike) {
  return os.quote_status === 'declined' ? 'bg-pending-100 text-pending-800' : osColor(os.status);
}

export function durationMin(started: string | null, completed: string | null): number | null {
  if (!started || !completed) return null;
  return Math.round((new Date(completed).getTime() - new Date(started).getTime()) / 60000);
}

type PauseLike = { started_at: string; ended_at: string | null };

/** Motivos de pausa mais comuns na oficina */
/** Causas de retorno/garantia — `counts` = entra na taxa de retorno do mecânico */
export const REWORK_CAUSES: { value: ReworkCause; label: string; counts: boolean }[] = [
  { value: 'execution', label: '🔧 Falha na execução',     counts: true },
  { value: 'diagnosis', label: '🔍 Diagnóstico errado',     counts: true },
  { value: 'part',      label: '📦 Peça com defeito',       counts: false },
  { value: 'customer',  label: '🚗 Mau uso / problema novo', counts: false },
  { value: 'other',     label: '❔ Outro motivo',           counts: false },
];
export const reworkCauseLabel = (c?: string | null) => REWORK_CAUSES.find(x => x.value === c)?.label ?? '⏳ Causa a definir';
export const reworkCounts = (c?: string | null) => !!REWORK_CAUSES.find(x => x.value === c)?.counts;

export const PAUSE_REASONS =['Aguardando peça', 'Aguardando aprovação do cliente', 'Fim do expediente', 'Outro serviço prioritário', 'Outro'];

/** Pausa em aberto (serviço parado agora), se houver */
export function openPause<T extends PauseLike>(pauses: T[] | null | undefined): T | null {
  return pauses?.find(p => !p.ended_at) ?? null;
}

/** Minutos pausados dentro do serviço (pausa aberta conta até agora/fim) */
export function pausedMinutes(pauses: PauseLike[] | null | undefined, until?: string | null) {
  const end = until ? new Date(until).getTime() : Date.now();
  return Math.round((pauses ?? []).reduce((acc, p) => {
    const a = new Date(p.started_at).getTime();
    const b = p.ended_at ? new Date(p.ended_at).getTime() : end;
    return acc + Math.max(0, Math.min(b, end) - a);
  }, 0) / 60000);
}

/** Tempo trabalhado = do início ao fim (ou agora) menos as pausas */
export function workedMinutes(started: string | null, completed: string | null, pauses?: PauseLike[] | null) {
  if (!started) return null;
  const end = completed ? new Date(completed).getTime() : Date.now();
  const total = Math.max(0, Math.round((end - new Date(started).getTime()) / 60000));
  return Math.max(0, total - pausedMinutes(pauses, completed));
}

export function fmtDur(min: number) {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtBRL(v: number | null | undefined) {
  return `R$ ${(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

/** "11997341182" → "(11) 99734-1182"; "1134567890" → "(11) 3456-7890". Outros formatos ficam como estão. */
export function fmtPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let d = phone.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

/**
 * Limpa um telefone para "55DDDNNNNNNNN" — usado para abrir wa.me.
 * Retorna null se ficar inválido.
 */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

/**
 * Curto-ID humano a partir do UUID — "AB7K9X" últimos 6 chars maiúsculos.
 */
export function shortOsId(id: string) {
  return id.replace(/-/g, '').slice(-6).toUpperCase();
}

/** "0042" — número da OS com 4 dígitos (cai no ID curto se ainda não tiver número). */
export function osNumber(os: { id: string; number?: number | null }) {
  return os.number != null ? String(os.number).padStart(4, '0') : shortOsId(os.id);
}

/** Categorias de serviço da OS */
export const OS_CATEGORIES = [
  // Captação / gratuitos
  'Avaliação','Check-up',
  // Mais comuns
  'Troca de óleo','Revisão geral','Freios','Pneus','Alinhamento','Balanceamento',
  // Mecânica
  'Motor','Câmbio','Suspensão','Transmissão','Embreagem','Injeção eletrônica',
  // Elétrica / outros
  'Elétrica','Ar-condicionado','Diagnóstico','Funilaria','Outro',
];

/**
 * Lê valor digitado do jeito brasileiro: "85,50", "1.234,56", "85.50", "85".
 * Retorna NaN se não for número.
 */
export function parseMoney(v: string): number {
  const s = v.trim().replace(/[R$\s]/g, '');
  if (!s) return NaN;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return Number(normalized);
}

/** 85.5 → "85,50" (para campos de edição) */
export function moneyInput(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type { OsStatus };
