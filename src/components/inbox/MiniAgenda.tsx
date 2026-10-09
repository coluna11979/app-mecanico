import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { DEFAULT_SCHEDULE, WEEKDAY_SHORT, addDays, dayKey, daySlots, type ScheduleConfig } from '@/lib/agenda';

/* ── Mini agenda do Inbox: horários livres dos próximos dias para combinar na conversa ── */

type Appt = {
  id: string; number: number | null; title: string; scheduled_at: string;
  customer: { full_name: string } | null; vehicle: { model: string } | null;
};

const DAYS = 7;
const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function dayLabel(d: Date, i: number) {
  if (i === 0) return 'Hoje';
  if (i === 1) return 'Amanhã';
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()}`;
}

/** Texto da proposta de horário: "amanhã (sex, 10/10) às 09:00" */
function proposal(slot: Date, i: number) {
  const date = `${WEEKDAY_SHORT[slot.getDay()].toLowerCase()}, ${slot.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  const when = i === 0 ? `hoje (${date})` : i === 1 ? `amanhã (${date})` : date;
  return `Tenho horário ${when} às ${fmtTime(slot)}. Pode ser?`;
}

export default function MiniAgenda({ workshopId, onPropose, onClose }: {
  workshopId: string; onPropose: (text: string) => void; onClose: () => void;
}) {
  const [cfg, setCfg] = useState<ScheduleConfig>(DEFAULT_SCHEDULE);
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(today, i)), [today]);

  useEffect(() => {
    (async () => {
      const [s, o] = await Promise.all([
        supabase.from('workshop_schedule').select('*').eq('workshop_id', workshopId).maybeSingle(),
        supabase.from('service_orders')
          .select('id, number, title, scheduled_at, customer:customers(full_name), vehicle:vehicles(model)')
          .eq('workshop_id', workshopId).neq('status', 'cancelled')
          .gte('scheduled_at', today.toISOString()).lt('scheduled_at', addDays(today, DAYS).toISOString())
          .order('scheduled_at'),
      ]);
      if (s.data) setCfg(s.data as ScheduleConfig);
      setAppts((o.data as unknown as Appt[]) ?? []);
    })();
  }, [workshopId, today]);

  // Fecha ao clicar fora
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const day = days[dayIdx];
  const now = Date.now();
  const slots = daySlots(day, cfg).map(start => {
    const end = start.getTime() + cfg.slot_minutes * 60000;
    const inSlot = (appts ?? []).filter(a => { const t = new Date(a.scheduled_at).getTime(); return t >= start.getTime() && t < end; });
    return { start, appts: inSlot, past: end <= now, full: inSlot.length >= cfg.cars_per_slot };
  });
  const freeCount = (d: Date) => daySlots(d, cfg).filter(s => {
    const end = s.getTime() + cfg.slot_minutes * 60000;
    if (end <= now) return false;
    const n = (appts ?? []).filter(a => { const t = new Date(a.scheduled_at).getTime(); return t >= s.getTime() && t < end; }).length;
    return n < cfg.cars_per_slot;
  }).length;

  return (
    <div ref={box} className="absolute bottom-full left-0 mb-2 w-[340px] max-w-[calc(100vw-24px)] rounded-2xl border border-steel-200 bg-white shadow-xl z-20 overflow-hidden">
      <div className="px-3 pt-3 pb-2 border-b border-steel-100 flex items-center justify-between">
        <p className="text-sm font-bold text-steel-800">📅 Horários da oficina</p>
        <Link to="/oficina/agenda" className="text-xs font-semibold text-brand-600 hover:underline">Agenda completa →</Link>
      </div>

      <div className="flex gap-1 overflow-x-auto px-2 py-2 border-b border-steel-100">
        {days.map((d, i) => {
          const free = appts ? freeCount(d) : null;
          const closed = !cfg.weekdays.includes(d.getDay());
          return (
            <button key={dayKey(d)} type="button" onClick={() => setDayIdx(i)}
              className={`shrink-0 rounded-lg px-2 py-1 text-center border transition ${i === dayIdx ? 'bg-steel-900 text-white border-steel-900' : 'border-steel-200 hover:bg-steel-50'}`}>
              <span className="block text-[11px] font-semibold">{dayLabel(d, i)}</span>
              <span className={`block text-[9px] ${i === dayIdx ? 'text-steel-300' : closed ? 'text-steel-400' : free ? 'text-emerald-600' : 'text-alert-600'}`}>
                {closed ? 'fechado' : free == null ? '…' : free ? `${free} livre${free > 1 ? 's' : ''}` : 'lotado'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="max-h-64 overflow-y-auto p-2 space-y-1">
        {appts == null ? (
          <p className="text-sm text-steel-500 text-center py-6">Carregando…</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-steel-500 text-center py-6">Oficina fechada neste dia.</p>
        ) : slots.map(s => {
          const free = !s.past && !s.full;
          return (
            <div key={s.start.toISOString()} className={`rounded-lg border px-2.5 py-1.5 ${s.past ? 'opacity-40 border-steel-100' : s.full ? 'border-alert-500/20 bg-alert-500/5' : 'border-steel-200'}`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-steel-800 tabular-nums w-11">{fmtTime(s.start)}</span>
                <span className={`text-[10px] font-bold ${s.full ? 'text-alert-600' : s.appts.length ? 'text-pending-700' : 'text-emerald-600'}`}>
                  {s.past ? 'passou' : s.full ? 'lotado' : s.appts.length ? `${s.appts.length}/${cfg.cars_per_slot}` : 'livre'}
                </span>
                {free && (
                  <button type="button" onClick={() => onPropose(proposal(s.start, dayIdx))}
                    className="ml-auto text-[11px] font-semibold text-brand-600 hover:underline">Propor ao cliente</button>
                )}
              </div>
              {s.appts.map(a => (
                <Link key={a.id} to={`/oficina/os/${a.id}`} className="block text-[11px] text-steel-500 truncate hover:text-steel-800 pl-[52px]">
                  {a.title}{a.vehicle?.model ? ` · ${a.vehicle.model}` : ''}{a.customer?.full_name ? ` · ${a.customer.full_name.split(' ')[0]}` : ''}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
