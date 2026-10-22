import { fmtDur } from '@/components/os/osHelpers';
import {
  WEEK_DAYS, parseSchedule, scheduleSummary, shiftMinutes, weeklyMinutes,
  type ShiftDay, type WeekDay, type WorkSchedule,
} from '@/lib/team';

const FULL: ShiftDay = { start: '08:00', end: '18:00', break_start: '12:00', break_end: '13:00' };
const HALF: ShiftDay = { start: '08:00', end: '12:00' };
const WEEKDAYS: WeekDay[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

const PRESETS: { label: string; build: () => WorkSchedule['days'] }[] = [
  { label: 'Seg–Sex 8h–17h + Sáb 8h–12h', build: () => ({ ...Object.fromEntries(WEEKDAYS.map(d => [d, { ...FULL, end: '17:00' }])), sat: { ...HALF } }) },
  { label: 'Seg–Sex 8h–17h48', build: () => Object.fromEntries(WEEKDAYS.map(d => [d, { ...FULL, end: '17:48' }])) },
  { label: 'Seg–Sex 8h–18h', build: () => Object.fromEntries(WEEKDAYS.map(d => [d, { ...FULL }])) },
];
const CLT_WEEK_LIMIT = 44 * 60;

/** Jornada semanal: dia a dia, com entrada, saída e intervalo. Guarda JSON no campo work_schedule. */
export default function ScheduleEditor({ value, onChange, isClt, storeDefault }: {
  value: string; onChange: (v: string) => void; isClt: boolean;
  /** Horário mais usado na equipe (vira o primeiro atalho) */
  storeDefault?: string | null;
}) {
  const defaultDays = parseSchedule(storeDefault)?.days ?? null;
  const parsed = parseSchedule(value);
  const legacy = !parsed && value.trim() ? value.trim() : null;
  const w: WorkSchedule = parsed ?? { v: 1, days: {} };

  const emit = (days: WorkSchedule['days']) => onChange(Object.keys(days).length ? JSON.stringify({ v: 1, days }) : '');
  const setDay = (k: WeekDay, d: ShiftDay | null) => {
    const days = { ...w.days };
    if (d) days[k] = d; else delete days[k];
    emit(days);
  };
  const patch = (k: WeekDay, p: Partial<ShiftDay>) => {
    const next = { ...w.days[k]!, ...p };
    if (!next.break_start) delete next.break_start;
    if (!next.break_end) delete next.break_end;
    setDay(k, next);
  };
  const copyToAll = (k: WeekDay) => {
    const src = w.days[k]!;
    emit(Object.fromEntries(Object.keys(w.days).map(d => [d, { ...src }])));
  };
  // Ao ligar um dia, repete o horário do dia trabalhado mais próximo (ou o padrão)
  const enable = (k: WeekDay) => {
    const ref = WEEK_DAYS.map(d => w.days[d.key]).find(Boolean);
    setDay(k, { ...(ref ?? (k === 'sat' || k === 'sun' ? HALF : FULL)) });
  };

  const total = weeklyMinutes(w);
  const workDays = WEEK_DAYS.filter(d => w.days[d.key]).length;

  return (
    <div className="rounded-2xl border border-steel-200 overflow-hidden">
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5 bg-steel-50 border-b border-steel-200">
        <span className="text-xs text-steel-500 mr-1">Atalhos:</span>
        {defaultDays && (
          <button type="button" onClick={() => emit({ ...defaultDays })} title={scheduleSummary(storeDefault)}
            className="text-xs font-semibold px-2.5 py-1 rounded-full border border-brand-300 bg-brand-50 text-brand-700 hover:border-brand-500 transition">
            ⭐ Padrão da loja
          </button>
        )}
        {PRESETS.map(p => (
          <button type="button" key={p.label} onClick={() => emit(p.build())}
            className="text-xs font-semibold px-2.5 py-1 rounded-full border border-steel-200 bg-white text-steel-600 hover:border-brand-300 hover:text-brand-700 transition">
            {p.label}
          </button>
        ))}
        {workDays > 0 && (
          <button type="button" onClick={() => emit({})} className="text-xs text-steel-400 hover:text-alert-600 ml-auto">Limpar</button>
        )}
      </div>

      {legacy && (
        <div className="px-3 py-2 text-xs text-pending-800 bg-pending-50 border-b border-pending-100">
          Horário anotado antes: <strong>“{legacy}”</strong>. Use um atalho ou marque os dias abaixo para substituir.
        </div>
      )}

      <div className="hidden sm:grid grid-cols-[96px_1fr_1fr_1.6fr_64px_28px] gap-2 px-3 pt-2.5 text-[10px] font-bold uppercase tracking-wider text-steel-400">
        <span>Dia</span><span>Entrada</span><span>Saída</span><span>Intervalo (almoço)</span><span className="text-right">Horas</span><span />
      </div>

      <ul className="divide-y divide-steel-100 sm:divide-y-0">
        {WEEK_DAYS.map(({ key, short, label }) => {
          const d = w.days[key];
          const mins = shiftMinutes(d);
          const invalid = d && mins === 0;
          return (
            <li key={key} className="px-3 py-2 grid grid-cols-[88px_1fr] sm:grid-cols-[96px_1fr_1fr_1.6fr_64px_28px] gap-2 items-center">
              <button type="button" onClick={() => (d ? setDay(key, null) : enable(key))} title={d ? 'Marcar como folga' : 'Marcar como dia de trabalho'}
                className={`text-sm font-semibold py-1.5 rounded-xl border-2 transition ${d ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-400 hover:border-steel-300'}`}>
                <span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span>
              </button>
              {d ? (
                <>
                  <div className="grid grid-cols-2 gap-2 sm:contents">
                    <input type="time" className={`input !py-1.5 text-sm ${invalid ? '!border-alert-500' : ''}`} value={d.start}
                      onChange={e => patch(key, { start: e.target.value })} aria-label={`${label}: entrada`} />
                    <input type="time" className={`input !py-1.5 text-sm ${invalid ? '!border-alert-500' : ''}`} value={d.end}
                      onChange={e => patch(key, { end: e.target.value })} aria-label={`${label}: saída`} />
                  </div>
                  <div className="col-start-2 sm:col-start-auto flex items-center gap-1.5">
                    <input type="time" className="input !py-1.5 text-sm" value={d.break_start ?? ''}
                      onChange={e => patch(key, { break_start: e.target.value })} aria-label={`${label}: início do intervalo`} />
                    <span className="text-steel-400 text-xs">até</span>
                    <input type="time" className="input !py-1.5 text-sm" value={d.break_end ?? ''}
                      onChange={e => patch(key, { break_end: e.target.value })} aria-label={`${label}: fim do intervalo`} />
                  </div>
                  <div className="col-start-2 sm:col-start-auto flex items-center justify-between sm:contents">
                    <span className={`text-sm font-semibold sm:text-right ${invalid ? 'text-alert-600' : 'text-steel-700'}`}>
                      {invalid ? 'confira' : fmtDur(mins)}
                    </span>
                    {workDays > 1 ? (
                      <button type="button" onClick={() => copyToAll(key)} title="Copiar este horário para os outros dias de trabalho"
                        className="text-steel-400 hover:text-brand-600 text-sm">
                        <span className="sm:hidden text-xs">Copiar p/ todos</span><span className="hidden sm:inline">⧉</span>
                      </button>
                    ) : <span />}
                  </div>
                </>
              ) : (
                <span className="text-sm text-steel-400 sm:col-span-5">Folga</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 bg-steel-50 border-t border-steel-200 text-sm">
        <span className="text-steel-600">
          {workDays === 0 ? 'Nenhum dia marcado' : <>{workDays} dia{workDays === 1 ? '' : 's'} por semana · <strong className="text-steel-900">{fmtDur(total)}</strong> semanais</>}
        </span>
        {isClt && total > CLT_WEEK_LIMIT && (
          <span className="text-xs font-semibold text-pending-800 bg-pending-100 rounded-full px-2.5 py-1">
            Acima de 44h semanais (limite CLT) — o excedente é hora extra
          </span>
        )}
      </div>
    </div>
  );
}
