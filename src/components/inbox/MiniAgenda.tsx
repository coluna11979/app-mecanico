import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { DEFAULT_SCHEDULE, WEEKDAY_SHORT, addDays, daySlots, type ScheduleConfig } from '@/lib/agenda';

/* ── Agenda rápida do Inbox: horários livres e compromissos (da oficina ou de um mecânico) ──
   Para a atendente combinar o horário sem sair da conversa. */

type Appt = {
  id: string; title: string; scheduled_at: string; estimated_hours: number | null; workshop_mechanic_id: string | null;
  customer: { full_name: string } | null; vehicle: { model: string; plate: string } | null; mechanic: { name: string } | null;
};
type Mech = { id: string; name: string };

const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

function dayTitle(d: Date, today: Date) {
  if (sameDay(d, today)) return 'hoje';
  if (sameDay(d, addDays(today, 1))) return 'amanhã';
  return `${WEEKDAY_SHORT[d.getDay()].toLowerCase()}, ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
}

/** "Tenho horário amanhã (sex, 10/10) às 09:00 com o Carlos. Pode ser?" */
function proposal(slot: Date, today: Date, mech: Mech | null) {
  const date = `${WEEKDAY_SHORT[slot.getDay()].toLowerCase()}, ${slot.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  const t = dayTitle(slot, today);
  const when = t === 'hoje' || t === 'amanhã' ? `${t} (${date})` : date;
  const who = mech ? ` com o ${mech.name.split(' ')[0]}` : '';
  return `Tenho horário ${when} às ${fmtTime(slot)}${who}. Pode ser?`;
}

export default function MiniAgenda({ workshopId, onPropose, onClose }: {
  workshopId: string; onPropose: (text: string) => void; onClose: () => void;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [day, setDay] = useState(today);
  const [cfg, setCfg] = useState<ScheduleConfig>(DEFAULT_SCHEDULE);
  const [mechs, setMechs] = useState<Mech[]>([]);
  const [mechId, setMechId] = useState<string>('');
  const [appts, setAppts] = useState<Appt[] | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('workshop_schedule').select('*').eq('workshop_id', workshopId).maybeSingle(),
      supabase.from('workshop_mechanics').select('id, name').eq('workshop_id', workshopId).eq('active', true).order('name'),
    ]).then(([s, m]) => {
      if (s.data) setCfg(s.data as ScheduleConfig);
      setMechs((m.data as Mech[]) ?? []);
    });
  }, [workshopId]);

  useEffect(() => {
    setAppts(null);
    supabase.from('service_orders')
      .select('id, title, scheduled_at, estimated_hours, workshop_mechanic_id, customer:customers(full_name), vehicle:vehicles(model, plate), mechanic:workshop_mechanics!fk_so_workshop_mechanic(name)')
      .eq('workshop_id', workshopId).neq('status', 'cancelled')
      .gte('scheduled_at', day.toISOString()).lt('scheduled_at', addDays(day, 1).toISOString())
      .order('scheduled_at')
      .then(({ data }) => setAppts((data as unknown as Appt[]) ?? []));
  }, [workshopId, day]);

  // Fecha ao clicar fora
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const mech = mechs.find(m => m.id === mechId) ?? null;
  const shown = (appts ?? []).filter(a => !mechId || a.workshop_mechanic_id === mechId);

  /** Livre: oficina = cabe mais um carro no horário; mecânico = ele não tem serviço nesse período */
  const free = useMemo(() => {
    const slotMs = cfg.slot_minutes * 60000;
    const now = Date.now();
    return daySlots(day, cfg).filter(s => {
      const from = s.getTime(), to = from + slotMs;
      if (to <= now) return false;
      if (mechId) {
        return !(appts ?? []).some(a => {
          if (a.workshop_mechanic_id !== mechId) return false;
          const st = new Date(a.scheduled_at).getTime();
          const end = st + Math.max(slotMs, (a.estimated_hours ?? 0) * 3600000);
          return st < to && end > from;
        });
      }
      return (appts ?? []).filter(a => { const t = new Date(a.scheduled_at).getTime(); return t >= from && t < to; }).length < cfg.cars_per_slot;
    });
  }, [appts, cfg, day, mechId]);

  const closed = !cfg.weekdays.includes(day.getDay());
  const isToday = sameDay(day, today);

  return (
    <div ref={box} className="absolute right-2 top-full mt-1 w-[380px] max-w-[calc(100vw-24px)] rounded-2xl border border-steel-200 bg-white shadow-2xl z-30 overflow-hidden">
      {/* Cabeçalho: mecânico + dia */}
      <div className="px-4 pt-3 pb-3 bg-sky-50/70 border-b border-steel-100 space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="font-bold text-steel-900">📅 Agenda</p>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white border border-steel-200 text-steel-600">
            {appts == null ? '…' : `${shown.length} ${isToday ? 'hoje' : 'no dia'}`}
          </span>
        </div>
        <div className="flex gap-2">
          <select className="input !py-1.5 text-sm flex-1 min-w-0" value={mechId} onChange={e => setMechId(e.target.value)}>
            <option value="">👥 Todos os mecânicos</option>
            {mechs.map(m => <option key={m.id} value={m.id}>🔧 {m.name}</option>)}
          </select>
          <div className="flex items-center rounded-xl border border-steel-200 bg-white shrink-0">
            <button type="button" onClick={() => setDay(d => addDays(d, -1))} disabled={isToday}
              className="h-8 w-7 grid place-items-center text-steel-500 hover:text-steel-900 disabled:opacity-30">‹</button>
            <button type="button" onClick={() => setDay(today)}
              className="px-1.5 text-xs font-bold text-sky-700 min-w-[64px] text-center capitalize">{dayTitle(day, today)}</button>
            <button type="button" onClick={() => setDay(d => addDays(d, 1))}
              className="h-8 w-7 grid place-items-center text-steel-500 hover:text-steel-900">›</button>
          </div>
        </div>
      </div>

      {/* Horários livres */}
      <div className="px-4 py-3 border-b border-steel-100 bg-emerald-50/50">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 mb-2">
          ✓ Horários livres {dayTitle(day, today)}{mech ? ` · ${mech.name.split(' ')[0]}` : ''}
        </p>
        {appts == null ? (
          <p className="text-xs text-steel-400">Carregando…</p>
        ) : closed ? (
          <p className="text-xs text-steel-500">Oficina fechada neste dia.</p>
        ) : free.length === 0 ? (
          <p className="text-xs text-steel-500">Nenhum horário livre. Veja o próximo dia ›</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {free.map(s => (
              <button key={s.toISOString()} type="button" onClick={() => onPropose(proposal(s, today, mech))}
                title="Propor esse horário ao cliente"
                className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700 tabular-nums hover:bg-emerald-100">
                {fmtTime(s)}
              </button>
            ))}
          </div>
        )}
        {free.length > 0 && <p className="text-[10px] text-steel-400 mt-1.5">Toque num horário para propor ao cliente.</p>}
      </div>

      {/* Compromissos do dia */}
      <div className="max-h-60 overflow-y-auto">
        {appts == null ? null : shown.length === 0 ? (
          <div className="text-center py-6 px-4">
            <div className="text-3xl opacity-40">📅</div>
            <p className="text-sm text-steel-500 mt-1">Nenhum compromisso {dayTitle(day, today) === 'hoje' ? 'hoje' : 'neste dia'}{mech ? ` para ${mech.name.split(' ')[0]}` : ''}</p>
          </div>
        ) : shown.map(a => (
          <Link key={a.id} to={`/oficina/os/${a.id}`} className="flex gap-3 px-4 py-2 border-b border-steel-50 hover:bg-steel-50">
            <span className="text-sm font-bold text-steel-800 tabular-nums w-11 shrink-0">{fmtTime(new Date(a.scheduled_at))}</span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-steel-800 truncate">{a.title}</span>
              <span className="block text-[11px] text-steel-500 truncate">
                {[a.vehicle?.model, a.customer?.full_name?.split(' ')[0], a.mechanic?.name ? `🔧 ${a.mechanic.name.split(' ')[0]}` : null].filter(Boolean).join(' · ')}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <Link to="/oficina/agenda" className="block px-4 py-2.5 border-t border-steel-100 text-sm font-semibold text-sky-700 hover:bg-sky-50">
        📅 Ver agenda completa
      </Link>
    </div>
  );
}
