import type { EmploymentType, TeamStatus } from '@/types/database';

/** Funções da oficina (quem põe a mão no carro) */
export const SHOP_ROLES = [
  'Mecânico', 'Mecânico chefe', 'Eletricista', 'Funileiro', 'Pintor', 'Auxiliar', 'Alinhador', 'Lavador',
];
/** Funções de balcão e escritório */
export const OFFICE_ROLES = [
  'Atendente', 'Recepcionista', 'Caixa', 'Vendedor', 'Consultor técnico', 'Financeiro', 'Estoquista / compras', 'Gerente',
];
export const ROLE_TITLES = [...SHOP_ROLES, ...OFFICE_ROLES, 'Outro'];

export type RoleArea = 'shop' | 'office' | 'both';
/** Área da função: define quais especialidades/habilidades fazem sentido */
export function roleArea(role?: string | null): RoleArea {
  if (!role || role === 'Outro' || role === 'Gerente' || role === 'Consultor técnico') return 'both';
  return OFFICE_ROLES.includes(role) ? 'office' : 'shop';
}

export const QUALIFICATIONS: Record<'shop' | 'office', { label: string; specialties: string[]; skills: string[] }> = {
  shop: {
    label: 'Oficina',
    specialties: ['Motor', 'Elétrica', 'Freios', 'Suspensão', 'Câmbio', 'Funilaria', 'Pintura', 'Ar-condicionado', 'Geral'],
    skills: ['Motor', 'Freios', 'Suspensão', 'Elétrica', 'Câmbio', 'Ar-condicionado', 'Injeção eletrônica',
      'Diagnóstico', 'Transmissão', 'Embreagem', 'Funilaria', 'Pintura', 'Alinhamento', 'Balanceamento', 'Diesel', 'Geral'],
  },
  office: {
    label: 'Balcão e escritório',
    specialties: ['Atendimento / recepção', 'Caixa', 'Vendas', 'Orçamentos', 'Financeiro', 'Compras e estoque', 'Gerência', 'Geral'],
    skills: ['Atendimento ao cliente', 'Abertura de OS', 'Orçamentos', 'Agendamento', 'Caixa / recebimentos',
      'PIX e maquininha', 'Emissão de nota fiscal', 'Cobrança', 'Contas a pagar', 'Compras de peças',
      'Controle de estoque', 'Vendas de peças', 'Vendas de serviços', 'Negociação', 'Retorno de orçamentos',
      'Pós-venda', 'WhatsApp e redes sociais'],
  },
};

/* ── Jornada de trabalho ──────────────────────────────────────────────────── */

export const WEEK_DAYS = [
  { key: 'mon', short: 'Seg', label: 'Segunda' },
  { key: 'tue', short: 'Ter', label: 'Terça' },
  { key: 'wed', short: 'Qua', label: 'Quarta' },
  { key: 'thu', short: 'Qui', label: 'Quinta' },
  { key: 'fri', short: 'Sex', label: 'Sexta' },
  { key: 'sat', short: 'Sáb', label: 'Sábado' },
  { key: 'sun', short: 'Dom', label: 'Domingo' },
] as const;
export type WeekDay = typeof WEEK_DAYS[number]['key'];
/** Um dia de trabalho; intervalo (almoço) é opcional */
export type ShiftDay = { start: string; end: string; break_start?: string; break_end?: string };
export type WorkSchedule = { v: 1; days: Partial<Record<WeekDay, ShiftDay>> };

const toMin = (t?: string) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };

/** Minutos trabalhados no dia (desconta o intervalo) */
export function shiftMinutes(d?: ShiftDay | null) {
  if (!d) return 0;
  const s = toMin(d.start), e = toMin(d.end);
  if (s == null || e == null || e <= s) return 0;
  const bs = toMin(d.break_start), be = toMin(d.break_end);
  const brk = bs != null && be != null && be > bs ? be - bs : 0;
  return Math.max(0, e - s - brk);
}
export const weeklyMinutes = (w: WorkSchedule) => WEEK_DAYS.reduce((t, d) => t + shiftMinutes(w.days[d.key]), 0);

/** Lê o campo work_schedule: JSON estruturado, ou texto livre antigo (null aqui) */
export function parseSchedule(raw?: string | null): WorkSchedule | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j && j.v === 1 && typeof j.days === 'object') return j as WorkSchedule;
  } catch { /* texto livre */ }
  return null;
}

const hh = (t: string) => t.replace(/^0(\d)/, '$1').replace(':00', 'h').replace(':', 'h');
const dayText = (d: ShiftDay) => `${hh(d.start)}–${hh(d.end)}`;

/** Horário mais usado na lista (o "padrão da loja"); ignora texto livre antigo */
export function mostCommonSchedule(list: (string | null | undefined)[]): string | null {
  const count = new Map<string, number>();
  for (const raw of list) {
    const w = parseSchedule(raw);
    if (!w || !Object.keys(w.days).length) continue;
    const key = JSON.stringify(w);
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  let best: string | null = null, n = 0;
  for (const [k, c] of count) if (c > n) { best = k; n = c; }
  return best;
}

/** Resumo legível: "Seg–Sex 8h–18h · Sáb 8h–12h" (agrupa dias seguidos com o mesmo horário) */
export function scheduleSummary(raw?: string | null): string {
  const w = parseSchedule(raw);
  if (!w) return raw?.trim() ?? '';
  const parts: string[] = [];
  let i = 0;
  while (i < WEEK_DAYS.length) {
    const d = w.days[WEEK_DAYS[i].key];
    if (!d) { i++; continue; }
    let j = i;
    while (j + 1 < WEEK_DAYS.length && w.days[WEEK_DAYS[j + 1].key] && dayText(w.days[WEEK_DAYS[j + 1].key]!) === dayText(d)) j++;
    const days = i === j ? WEEK_DAYS[i].short : `${WEEK_DAYS[i].short}${j - i === 1 ? ' e ' : '–'}${WEEK_DAYS[j].short}`;
    parts.push(`${days} ${dayText(d)}`);
    i = j + 1;
  }
  return parts.join(' · ');
}

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

/* ── Status do dia (Painel da equipe) ─────────────────────────────────────── */

export type DayState = 'on' | 'out' | 'off' | 'absent' | 'none';

/** Rótulos dos estados confiáveis com os dados atuais (jornada + afastamentos) */
export const DAY_STATE: Record<DayState, { label: string; dot: string; text: string }> = {
  on:     { label: 'Em horário',      dot: 'bg-signal-500', text: 'text-signal-700' },
  out:    { label: 'Fora do horário', dot: 'bg-steel-400',  text: 'text-steel-600' },
  off:    { label: 'Folga',           dot: 'bg-steel-300',  text: 'text-steel-500' },
  absent: { label: 'Ausente',         dot: 'bg-pending-500', text: 'text-pending-800' },
  none:   { label: 'Sem jornada',     dot: 'bg-steel-200',  text: 'text-steel-400' },
};

const JS_DAY: WeekDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Afastamento que vale hoje (já começou e ainda não voltou) */
export function absenceToday(list: Absence[], mechanicId: string, today = todayIso()) {
  return list.find(a => a.mechanic_id === mechanicId && a.started_on <= today && (!a.returned_on || a.returned_on > today)) ?? null;
}

/**
 * Status do dia pela jornada cadastrada. Não diz se a pessoa está livre ou ocupada:
 * isso só com o relógio da OS, que ainda não é usado.
 */
export function dayState(schedule: string | null | undefined, absent: boolean, now = new Date()): DayState {
  if (absent) return 'absent';
  const w = parseSchedule(schedule);
  if (!w || !Object.keys(w.days).length) return 'none';
  const d = w.days[JS_DAY[now.getDay()]];
  if (!d) return 'off';
  const m = now.getHours() * 60 + now.getMinutes();
  const s = toMin(d.start), e = toMin(d.end);
  return s != null && e != null && m >= s && m < e ? 'on' : 'out';
}
