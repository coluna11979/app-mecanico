/**
 * Início / Hoje — o que precisa da atenção do gestor agora.
 * Só cálculos sobre dados que o sistema já grava; as regras de dinheiro vêm de finance.ts
 * (a receber), as de responsável de ResponsiblePicker, as de pausa de osHelpers e as de vagas de agenda.ts.
 */
import type { OsStatus } from '@/types/database';
import { openPause, osNumber } from '@/components/os/osHelpers';
import { daySlots, dayKey, type ScheduleConfig } from '@/lib/agenda';
import { parseSchedule, roleArea, shiftMinutes, isoToday, type WeekDay, type AbsenceReason } from '@/lib/team';

export type TodayOs = {
  id: string; number: number | null; title: string; status: OsStatus;
  scheduled_at: string | null; started_at: string | null; estimated_hours: number | null;
  workshop_mechanic_id: string | null; executor: 'workshop' | 'platform' | null;
  approval_requested_at: string | null; schedule_status: 'confirmed' | 'no_show' | null;
  price: number;
  customer: { full_name: string | null; phone: string | null } | null;
  vehicle: { plate: string | null; make: string | null; model: string | null } | null;
  pauses: { reason: string; started_at: string; ended_at: string | null }[] | null;
};

/** Colunas da consulta de OS em aberto que alimenta `osAttention` (Início e Resultado usam a mesma) */
export const TODAY_OS_COLS = 'id, number, title, status, scheduled_at, started_at, estimated_hours, workshop_mechanic_id, executor, '
  + 'approval_requested_at, schedule_status, price, customer:customers(full_name, phone), vehicle:vehicles(plate, make, model), '
  + 'pauses:service_order_pauses(reason, started_at, ended_at)';

/** Mesma regra do ResponsiblePicker: sem mecânico da loja e sem "mecânico da plataforma" */
const withoutResponsible = (o: TodayOs) => o.executor !== 'platform' && !o.workshop_mechanic_id;

/** Trabalho já combinado com o cliente (orçamento aguardando aprovação ainda não entra) */
const WORK_STATUSES: OsStatus[] = ['open', 'approved', 'in_progress'];

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Tudo o que pede ação, a partir das OS em aberto (uma consulta só) */
export function osAttention(active: TodayOs[], now = new Date()) {
  const t = now.getTime();
  const endTomorrow = startOfDay(now); endTomorrow.setDate(endTomorrow.getDate() + 2);
  const weekAgo = t - 7 * 86400000;

  const noResponsible = active.filter(o => WORK_STATUSES.includes(o.status) && withoutResponsible(o));

  const stopped = active
    .filter(o => o.status === 'in_progress')
    .map(o => ({ os: o, pause: openPause(o.pauses) }))
    .filter((x): x is { os: TodayOs; pause: NonNullable<TodayOs['pauses']>[number] } => !!x.pause)
    .sort((a, b) => a.pause.started_at.localeCompare(b.pause.started_at));

  // Horário marcado já passou (30 min de tolerância) e o serviço não começou; só a última semana
  const late = active.filter(o => {
    if (!o.scheduled_at || o.started_at || o.status === 'in_progress' || o.schedule_status === 'no_show') return false;
    const s = new Date(o.scheduled_at).getTime();
    return s < t - 30 * 60000 && s > weekAgo;
  });

  const awaitingCustomer = active
    .filter(o => o.status === 'awaiting_approval')
    .sort((a, b) => (a.approval_requested_at ?? '').localeCompare(b.approval_requested_at ?? ''));

  // Agendamentos de hoje e amanhã ainda não confirmados com o cliente
  const unconfirmed = active.filter(o => {
    if (!o.scheduled_at || o.schedule_status || o.started_at) return false;
    const s = new Date(o.scheduled_at).getTime();
    return s >= t && s < endTomorrow.getTime();
  });

  return { noResponsible, stopped, late, awaitingCustomer, unconfirmed };
}

/** Horas estimadas do serviço em aberto da equipe da loja (o da plataforma não ocupa a equipe) */
export function openWorkload(active: TodayOs[]) {
  const list = active.filter(o => WORK_STATUSES.includes(o.status) && o.executor !== 'platform');
  const withEstimate = list.filter(o => Number(o.estimated_hours) > 0);
  return {
    count: list.length,
    hours: withEstimate.reduce((a, o) => a + Number(o.estimated_hours), 0),
    withoutEstimate: list.length - withEstimate.length,
  };
}

/** Ocupação da agenda no dia — mesma conta da tela Agenda (vagas × carros por horário; "não veio" não ocupa) */
export function agendaDay(day: Date, cfg: ScheduleConfig, scheduled: Pick<TodayOs, 'scheduled_at' | 'status' | 'schedule_status'>[]) {
  const key = dayKey(day);
  const booked = scheduled.filter(o => o.scheduled_at && o.status !== 'cancelled' && o.schedule_status !== 'no_show'
    && dayKey(new Date(o.scheduled_at)) === key).length;
  const capacity = daySlots(day, cfg).length * cfg.cars_per_slot;
  return { booked, capacity, pct: capacity ? Math.round((booked / capacity) * 100) : null };
}

export type TeamMember = {
  id: string; name: string; active: boolean; status?: string | null;
  role_title?: string | null; work_schedule?: string | null;
};
export type TeamAbsence = { mechanic_id: string; reason: AbsenceReason; started_on: string; returned_on: string | null; expected_return: string | null };

const WEEKDAY_KEYS: WeekDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Quem põe a mão no carro hoje: jornada do dia (ficha do colaborador) menos afastamentos */
export function teamToday(team: TeamMember[], absences: TeamAbsence[], now = new Date()) {
  const today = isoToday();
  const wd = WEEKDAY_KEYS[now.getDay()];
  const shop = team.filter(m => m.status !== 'terminated' && roleArea(m.role_title) !== 'office');

  const openAbsence = new Map(absences
    .filter(a => a.started_on <= today && (!a.returned_on || a.returned_on > today))
    .map(a => [a.mechanic_id, a]));
  const away = shop.filter(m => m.status === 'away' || openAbsence.has(m.id))
    .map(m => ({ id: m.id, name: m.name, reason: openAbsence.get(m.id)?.reason ?? null, expected_return: openAbsence.get(m.id)?.expected_return ?? null }));
  const awayIds = new Set(away.map(a => a.id));

  const present = shop.filter(m => m.active && !awayIds.has(m.id));
  const schedOf = (m: TeamMember) => parseSchedule(m.work_schedule);
  // Sem jornada cadastrada: conta como trabalhando (não dá para saber a folga)
  const working = present.filter(m => { const s = schedOf(m); return !s || shiftMinutes(s.days[wd]) > 0; });

  return {
    total: shop.filter(m => m.active || awayIds.has(m.id)).length,
    working: working.length,
    dayOff: present.length - working.length,
    withoutSchedule: working.filter(m => !schedOf(m)).length,
    away,
  };
}

/** "Bom dia" / "Boa tarde" / "Boa noite" */
export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}


export type AttentionTone = 'urgent' | 'important';
export type AttentionItem = { key: string; tone: AttentionTone; icon: 'wallet' | 'receipt' | 'clock' | 'user' | 'pause' | 'clipboard'; title: string; meta?: string; to: string };

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const many = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

/**
 * Resumo do "O que precisa de atenção" do Resultado: as pendências que o Início já calcula, na ordem de
 * prioridade do dono, cada uma com o caminho de ação. Não calcula nada novo — só escolhe e ordena.
 * `allow` diz se a tela de destino está liberada (módulo desligado → o item não aparece).
 */
export function attentionSummary(
  src: {
    att: ReturnType<typeof osAttention>;
    receivableOverdue: { total: number; count: number };
    payablesLate: { total: number; count: number };
  },
  allow: (path: string) => boolean,
  now = Date.now(),
) {
  const { att } = src;
  const all: AttentionItem[] = [];
  const osLink = (o: { id: string }) => `/oficina/os/${o.id}`;

  if (src.receivableOverdue.count > 0 && allow('/oficina/financeiro'))
    all.push({ key: 'receive', tone: 'urgent', icon: 'wallet', title: `${brl(src.receivableOverdue.total)} a receber vencido`,
      meta: many(src.receivableOverdue.count, 'OS', 'OS'), to: '/oficina/financeiro?aba=receber' });

  if (src.payablesLate.count > 0 && allow('/oficina/contas-a-pagar'))
    all.push({ key: 'payables', tone: 'urgent', icon: 'receipt', title: `${brl(src.payablesLate.total)} em contas vencidas`,
      meta: many(src.payablesLate.count, 'conta', 'contas'), to: '/oficina/contas-a-pagar' });

  if (att.late.length > 0 && allow('/oficina/os')) {
    const one = att.late.length === 1 ? att.late[0] : null;
    all.push({ key: 'late', tone: 'urgent', icon: 'clock',
      title: one ? `OS ${osNumber(one)} passou da hora agendada` : `${att.late.length} agendamentos passaram da hora`,
      meta: one ? one.title : 'Ainda não começaram', to: one ? osLink(one) : '/oficina/agenda' });
  }

  if (att.noResponsible.length > 0 && allow('/oficina/os')) {
    const one = att.noResponsible.length === 1 ? att.noResponsible[0] : null;
    all.push({ key: 'noresp', tone: 'important', icon: 'user',
      title: one ? `OS ${osNumber(one)} sem responsável` : `${att.noResponsible.length} OS sem responsável`,
      meta: one ? one.title : undefined, to: one ? osLink(one) : '/oficina/os' });
  }

  if (att.stopped.length > 0 && allow('/oficina/os')) {
    const one = att.stopped.length === 1 ? att.stopped[0] : null;
    all.push({ key: 'stopped', tone: 'important', icon: 'pause',
      title: one ? `OS ${osNumber(one.os)} parada` : `${att.stopped.length} serviços parados`,
      meta: one ? one.pause.reason : undefined, to: one ? osLink(one.os) : '/oficina/os' });
  }

  // Orçamento de OS sem resposta há 2 dias ou mais (mesmo corte do follow-up do Comercial)
  const cold = att.awaitingCustomer.filter(o => o.approval_requested_at && now - new Date(o.approval_requested_at).getTime() >= 2 * 86400000);
  if (cold.length > 0 && (allow('/oficina/comercial') || allow('/oficina/os')))
    all.push({ key: 'quotes', tone: 'important', icon: 'clipboard',
      title: `${many(cold.length, 'orçamento sem resposta', 'orçamentos sem resposta')} há 2+ dias`,
      meta: brl(cold.reduce((a, o) => a + Number(o.price), 0)), to: allow('/oficina/comercial') ? '/oficina/comercial' : '/oficina/os' });

  return { shown: all.slice(0, 3), total: all.length };
}
