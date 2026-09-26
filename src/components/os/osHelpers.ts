import type { OsStatus } from '@/types/database';

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberta',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};
const STATUS_BADGE: Record<string, string> = {
  open: 'bg-pending-100 text-pending-700',
  in_progress: 'bg-brand-100 text-brand-700',
  completed: 'bg-signal-100 text-signal-700',
  cancelled: 'bg-steel-100 text-steel-500',
};
const STATUS_BORDER: Record<string, string> = {
  open: 'border-l-pending-500',
  in_progress: 'border-l-brand-500',
  completed: 'border-l-signal-500',
  cancelled: 'border-l-steel-300',
};

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
