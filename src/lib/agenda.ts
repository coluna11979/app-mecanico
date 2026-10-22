/**
 * Agenda da oficina — horário de atendimento (workshop_schedule, migration 0052) e datas.
 * Mesma regra de horários da função workshop_free_slots do banco (usada no link do check-up).
 */
export type ScheduleConfig = {
  weekdays: number[];            // 0 = domingo … 6 = sábado
  open_time: string;             // "08:00" ou "08:00:00"
  close_time: string;
  saturday_close: string | null; // null = igual aos outros dias
  slot_minutes: number;
  cars_per_slot: number;
};

export const DEFAULT_SCHEDULE: ScheduleConfig = {
  weekdays: [1, 2, 3, 4, 5, 6], open_time: '08:00', close_time: '18:00',
  saturday_close: '12:00', slot_minutes: 60, cars_per_slot: 2,
};

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

/** Segunda-feira da semana (00:00) */
export function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  return addDays(x, dow === 0 ? -6 : 1 - dow);
}

/** "AAAA-MM-DD" no fuso do aparelho */
export const dayKey = (d: Date) => d.toLocaleDateString('en-CA');

/** Date → valor de <input type="datetime-local"> */
export function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

/** Horários do dia (início de cada um), conforme o horário de atendimento */
export function daySlots(day: Date, cfg: ScheduleConfig): Date[] {
  const dow = day.getDay();
  if (!cfg.weekdays.includes(dow)) return [];
  const open = toMin(cfg.open_time);
  const close = toMin(dow === 6 && cfg.saturday_close ? cfg.saturday_close : cfg.close_time);
  const out: Date[] = [];
  for (let m = open; m + cfg.slot_minutes <= close; m += cfg.slot_minutes) {
    const d = new Date(day); d.setHours(0, 0, 0, 0); d.setMinutes(m);
    out.push(d);
  }
  return out;
}
