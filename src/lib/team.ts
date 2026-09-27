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
