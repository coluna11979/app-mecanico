/**
 * Início / Hoje — o que precisa da atenção do gestor agora.
 * Só cálculos sobre dados que o sistema já grava; as regras de dinheiro vêm de finance.ts
 * (a receber), as de responsável de ResponsiblePicker, as de pausa de osHelpers e as de vagas de agenda.ts.
 */
import type { OsStatus } from '@/types/database';
import { openPause } from '@/components/os/osHelpers';
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

