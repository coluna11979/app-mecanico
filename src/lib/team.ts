import type { EmploymentType, TeamStatus } from '@/types/database';

export const ROLE_TITLES = [
  'Mecânico', 'Mecânico chefe', 'Eletricista', 'Funileiro', 'Pintor',
  'Auxiliar', 'Alinhador', 'Atendente', 'Gerente', 'Outro',
];

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'clt',          label: 'CLT' },
  { value: 'pj',           label: 'PJ' },
  { value: 'autonomo',     label: 'Autônomo' },
  { value: 'comissionado', label: 'Só comissão' },
];

export const TEAM_STATUS: Record<TeamStatus, { label: string; badge: string }> = {
  active:     { label: 'Ativo',     badge: 'bg-signal-100 text-signal-700' },
  away:       { label: 'Afastado',  badge: 'bg-pending-100 text-pending-800' },
  terminated: { label: 'Desligado', badge: 'bg-steel-100 text-steel-500' },
};

export const DOCUMENT_KINDS = ['RG', 'CPF', 'CNH', 'CTPS', 'Contrato', 'Comprovante de endereço', 'Certificado', 'Outro'];

export const employmentLabel = (v?: string | null) => EMPLOYMENT_TYPES.find(e => e.value === v)?.label ?? '';

/** Situação de uma validade: vencido, vence em até 30 dias, ok (ou null sem data) */
export function expiryState(date?: string | null): { state: 'expired' | 'soon' | 'ok'; days: number } | null {
  if (!date) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86400000);
  return { state: days < 0 ? 'expired' : days <= 30 ? 'soon' : 'ok', days };
}

export function expiryLabel(date?: string | null) {
  const e = expiryState(date);
  if (!e) return null;
  if (e.state === 'expired') return { text: `vencido há ${-e.days} dia${-e.days === 1 ? '' : 's'}`, cls: 'text-alert-700 bg-alert-50' };
  if (e.state === 'soon') return { text: e.days === 0 ? 'vence hoje' : `vence em ${e.days} dia${e.days === 1 ? '' : 's'}`, cls: 'text-pending-800 bg-pending-50' };
  return { text: `válido até ${new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR')}`, cls: 'text-steel-500 bg-steel-50' };
}

/* ── Afastamentos ─────────────────────────────────────────────────────────── */

export type AbsenceReason = 'vacation' | 'medical' | 'inss' | 'leave' | 'time_off' | 'other';
export type Absence = {
  id: string; workshop_id: string; mechanic_id: string; reason: AbsenceReason;
  started_on: string; expected_return: string | null; returned_on: string | null; notes: string | null; created_at: string;
};

export const ABSENCE_REASONS: Record<AbsenceReason, { label: string; icon: string }> = {
  vacation: { label: 'Férias',                         icon: '🏖️' },
  medical:  { label: 'Atestado médico',                icon: '🩺' },
  inss:     { label: 'Afastamento INSS',               icon: '🏥' },
  leave:    { label: 'Licença (maternidade/paternidade…)', icon: '👶' },
  time_off: { label: 'Folga / banco de horas',         icon: '🕒' },
  other:    { label: 'Outro',                          icon: '📝' },
};

const d0 = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
export const isoToday = todayIso;
export const fmtDay = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR') : '—');

/** Dias corridos do afastamento (conta o dia de saída; o dia do retorno não conta) */
export function absenceDays(a: Pick<Absence, 'started_on' | 'returned_on'>, until = todayIso()) {
  const end = a.returned_on ?? until;
  return Math.max(0, Math.round((d0(end) - d0(a.started_on)) / 86400000) + (a.returned_on ? 0 : 1));
}

/** Dias do afastamento que caem dentro de [from, to] (datas ISO, inclusivas) */
export function absenceDaysIn(a: Pick<Absence, 'started_on' | 'returned_on'>, from: string, to: string) {
  const start = Math.max(d0(a.started_on), d0(from));
  // último dia afastado = véspera do retorno (ou hoje, se ainda afastado)
  const lastAway = a.returned_on ? d0(a.returned_on) - 86400000 : d0(todayIso());
  const end = Math.min(lastAway, d0(to));
  return end < start ? 0 : Math.round((end - start) / 86400000) + 1;
}

/** Situação do retorno previsto: "volta em 3 dias", "volta hoje", "retorno atrasado 2 dias" */
export function returnStatus(a: Pick<Absence, 'expected_return' | 'returned_on'>) {
  if (a.returned_on || !a.expected_return) return null;
  const days = Math.round((d0(a.expected_return) - d0(todayIso())) / 86400000);
  if (days < 0) return { text: `retorno atrasado ${-days} dia${-days === 1 ? '' : 's'}`, late: true };
  if (days === 0) return { text: 'volta hoje', late: false };
  return { text: `volta em ${days} dia${days === 1 ? '' : 's'}`, late: false };
}

/** Tempo de casa: "2 anos e 3 meses" */
export function tenure(hiredAt?: string | null, until?: string | null) {
  if (!hiredAt) return null;
  const a = new Date(`${hiredAt}T00:00:00`);
  const b = until ? new Date(`${until}T00:00:00`) : new Date();
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  if (months < 1) return 'menos de 1 mês';
  const y = Math.floor(months / 12), m = months % 12;
  const ys = y ? `${y} ano${y > 1 ? 's' : ''}` : '';
  const ms = m ? `${m} ${m > 1 ? 'meses' : 'mês'}` : '';
  return [ys, ms].filter(Boolean).join(' e ');
}
