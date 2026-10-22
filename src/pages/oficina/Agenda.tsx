import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import LicensePlate from '@/components/os/LicensePlate';
import NewOsModal, { type NewOsPreset } from '@/components/os/NewOsModal';
import { osLabel, osColor, waNumber } from '@/components/os/osHelpers';
import {
  DEFAULT_SCHEDULE, WEEKDAY_SHORT, addDays, dayKey, daySlots, localInput, startOfWeek, type ScheduleConfig,
} from '@/lib/agenda';
import { useCheckupAccess } from '@/lib/checkupAccess';
import WhatsAppButton from '@/components/inbox/WhatsAppButton';

type Appt = {
  id: string; number: number | null; title: string; category: string | null; status: string;
  scheduled_at: string; estimated_hours: number | null; workshop_mechanic_id: string | null;
  schedule_status: 'confirmed' | 'no_show' | null; schedule_reminded_at: string | null;
  customer: { full_name: string; phone: string | null } | null;
  vehicle: { plate: string; make: string; model: string } | null;
  mechanic: { name: string } | null;
};
type Mech = { id: string; name: string };

const fmtTime = (d: Date | string) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const isCheckup = (a: Appt) => a.category === 'Check-up' || /check-?up/i.test(a.title);

export default function Agenda() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;

  const [view, setView]       = useState<'day' | 'week'>('day');
  const [anchor, setAnchor]   = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [mechFilter, setMechFilter] = useState('');
  const [cfg, setCfg]         = useState<ScheduleConfig>(DEFAULT_SCHEDULE);
  const [appts, setAppts]     = useState<Appt[] | null>(null);
  const [mechs, setMechs]     = useState<Mech[]>([]);
  const [newOs, setNewOs]     = useState<NewOsPreset | null>(null);
  const [settings, setSettings] = useState(false);
  // Mecânico (PIN): só o que está atribuído a ele; sem agendar, confirmar ou remarcar (isso é do balcão)
  const access = useCheckupAccess();
  const mech = access.isMechanic;

  const range = useMemo(() => view === 'day'
    ? { from: anchor, to: addDays(anchor, 1) }
    : { from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), 7) }, [view, anchor]);

  const load = useCallback(async () => {
    if (!wid) return;
    const [o, m, s] = await Promise.all([
      supabase.from('service_orders')
        .select('id, number, title, category, status, scheduled_at, estimated_hours, workshop_mechanic_id, schedule_status, schedule_reminded_at, customer:customers(full_name, phone), vehicle:vehicles(plate, make, model), mechanic:workshop_mechanics!fk_so_workshop_mechanic(name)')
        .eq('workshop_id', wid).neq('status', 'cancelled')
        .gte('scheduled_at', range.from.toISOString()).lt('scheduled_at', range.to.toISOString())
        .order('scheduled_at'),
      supabase.from('workshop_mechanics').select('id, name').eq('workshop_id', wid).eq('active', true).order('name'),
      supabase.from('workshop_schedule').select('*').eq('workshop_id', wid).maybeSingle(),
    ]);
    setAppts((o.data as unknown as Appt[]) ?? []);
    setMechs((m.data as Mech[]) ?? []);
    if (s.data) setCfg(s.data as ScheduleConfig);
  }, [wid, range]);

  useEffect(() => { setAppts(null); load(); }, [load]);

  const shown = useMemo(() => (appts ?? []).filter(a => mech
    ? !!access.mechanicId && a.workshop_mechanic_id === access.mechanicId
    : !mechFilter || a.workshop_mechanic_id === mechFilter), [appts, mechFilter, mech, access.mechanicId]);
  const stats = useMemo(() => ({
    total: shown.length,
    confirmed: shown.filter(a => a.schedule_status === 'confirmed').length,
    pending: shown.filter(a => !a.schedule_status && a.status !== 'completed').length,
    noShow: shown.filter(a => a.schedule_status === 'no_show').length,
  }), [shown]);

  async function patch(a: Appt, row: Record<string, unknown>, msg?: string) {
    const { error } = await supabase.from('service_orders').update(row).eq('id', a.id);
    if (error) return toast.error('Não foi possível salvar: ' + error.message);
    if (msg) toast.success(msg);
    load();
  }

  function schedule(when?: Date) {
    setNewOs({ schedule: true, when: when ? localInput(when) : undefined, mechanicId: mechFilter || undefined });
  }

  const title = view === 'day'
    ? anchor.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    : `${range.from.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${addDays(range.to, -1).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`;
  const isToday = dayKey(anchor) === dayKey(new Date());

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">📅 {mech ? 'Minha agenda' : 'Agenda'}</h1>
            <p className="text-sm text-steel-500 mt-1">{mech
              ? 'Serviços e check-ups atribuídos a você.'
              : 'Serviços e check-ups agendados. Confirme com o cliente pelo WhatsApp e marque quem não veio.'}</p>
          </div>
          {!mech && <div className="flex gap-2">
            <button className="btn-ghost border border-steel-200 bg-white" onClick={() => setSettings(true)}>⚙️ Horário de atendimento</button>
            <button className="btn-primary" onClick={() => schedule()}>+ Agendar</button>
          </div>}
        </div>

        {mech && access.ready && !access.mechanicId && (
          <div className="card !py-3 bg-pending-50 border-pending-200 text-sm text-steel-700">
            Seu acesso ainda não está ligado ao seu nome na Equipe. Peça ao gestor para ligar em <strong>Acessos e funções</strong>.
          </div>
        )}

        {/* Navegação */}
        <div className="card !py-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-steel-100 p-1">
            {(['day', 'week'] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${view === v ? 'bg-white shadow text-steel-900' : 'text-steel-500'}`}>
                {v === 'day' ? 'Dia' : 'Semana'}
              </button>
            ))}
          </div>
          <button className="btn-ghost !px-3 border border-steel-200" onClick={() => setAnchor(a => addDays(a, view === 'day' ? -1 : -7))}>‹</button>
          <button className="btn-ghost border border-steel-200 text-sm" onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setAnchor(d); }}>Hoje</button>
          <button className="btn-ghost !px-3 border border-steel-200" onClick={() => setAnchor(a => addDays(a, view === 'day' ? 1 : 7))}>›</button>
          <input type="date" className="input !w-auto !py-1.5 text-sm" value={dayKey(anchor)}
            onChange={e => { if (e.target.value) setAnchor(new Date(`${e.target.value}T00:00:00`)); }} />
          <div className="font-bold text-steel-800 capitalize ml-1">{title}{view === 'day' && isToday && <span className="ml-2 badge bg-brand-100 text-brand-700">hoje</span>}</div>
          {!mech && <select className="input !w-auto !py-1.5 text-sm ml-auto" value={mechFilter} onChange={e => setMechFilter(e.target.value)}>
            <option value="">Todos os mecânicos</option>
            {mechs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>}
        </div>

        {/* Números */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Agendados" value={stats.total} />
          <Stat label="Confirmados" value={stats.confirmed} tone="text-signal-700" />
          <Stat label="A confirmar" value={stats.pending} tone={stats.pending ? 'text-pending-700' : undefined} />
          <Stat label="Não vieram" value={stats.noShow} tone={stats.noShow ? 'text-alert-600' : undefined} />
        </div>

        {appts === null ? (
          <div className="card h-64 animate-pulse" />
        ) : view === 'day' ? (
          <DayView day={anchor} cfg={cfg} appts={shown} mechs={mechs} workshopName={currentWorkshop?.business_name}
            onNew={schedule} onPatch={patch} mech={mech} />
        ) : (
          <WeekView start={range.from} cfg={cfg} appts={shown}
            onOpenDay={d => { setAnchor(d); setView('day'); }} />
        )}
      </div>

      {newOs && wid && (
        <NewOsModal workshopId={wid} preset={newOs} onClose={() => setNewOs(null)}
          onCreated={(_, number) => {
            setNewOs(null);
            toast.success(`Agendado ✓ OS nº ${String(number ?? '').padStart(4, '0')}`);
            load();
          }} />
      )}
      {settings && wid && (
        <ScheduleSettings wid={wid} cfg={cfg} onClose={() => setSettings(false)} onSaved={c => { setCfg(c); setSettings(false); load(); }} />
      )}
    </WorkshopLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="card !py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">{label}</div>
      <div className={`text-2xl font-bold font-display ${tone ?? 'text-steel-900'}`}>{value}</div>
    </div>
  );
}

/* ─── Dia: horários com vagas ─────────────────────────────────────────── */
function DayView({ day, cfg, appts, mechs, workshopName, onNew, onPatch, mech }: {
  day: Date; cfg: ScheduleConfig; appts: Appt[]; mechs: Mech[]; workshopName?: string;
  onNew: (when: Date) => void; onPatch: (a: Appt, row: Record<string, unknown>, msg?: string) => void;
  /** Mecânico: só vê; sem vagas, sem agendar */
  mech?: boolean;
}) {
  const slots = daySlots(day, cfg);
  const inSlot = (a: Appt, s: Date) => {
    const t = new Date(a.scheduled_at).getTime();
    return t >= s.getTime() && t < s.getTime() + cfg.slot_minutes * 60000;
  };
  const outside = appts.filter(a => !slots.some(s => inSlot(a, s)));
  const past = (s: Date) => s.getTime() + cfg.slot_minutes * 60000 < Date.now();

  return (
    <div className="space-y-3">
      {slots.length === 0 && (
        <div className="card text-center py-6 text-sm text-steel-500">🔒 A oficina não atende neste dia (ajuste em Horário de atendimento).</div>
      )}
      {outside.length > 0 && (
        <div className="card space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Fora do horário de atendimento</div>
          {outside.map(a => <ApptCard key={a.id} a={a} mechs={mechs} workshopName={workshopName} onPatch={onPatch} mech={mech} />)}
        </div>
      )}
      {slots.length > 0 && (
        <div className="card !p-0 overflow-hidden divide-y divide-steel-100">
          {slots.map(s => {
            const list = appts.filter(a => inSlot(a, s));
            const full = list.filter(a => a.schedule_status !== 'no_show').length >= cfg.cars_per_slot;
            return (
              <div key={s.toISOString()} className={`flex gap-3 px-4 py-3 ${past(s) ? 'bg-steel-50/60' : ''}`}>
                <div className="w-16 shrink-0">
                  <div className="font-bold text-steel-800">{fmtTime(s)}</div>
                  {!mech && <div className={`text-[10px] font-semibold ${full ? 'text-alert-600' : 'text-steel-400'}`}>
                    {list.length}/{cfg.cars_per_slot} {full ? 'lotado' : 'vagas'}
                  </div>}
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  {list.map(a => <ApptCard key={a.id} a={a} mechs={mechs} workshopName={workshopName} onPatch={onPatch} mech={mech} />)}
                  {mech && !list.length && <div className="text-xs text-steel-300 py-2">—</div>}
                  {!mech && !full && !past(s) && (
                    <button onClick={() => onNew(s)}
                      className="w-full text-left text-xs font-semibold text-steel-400 hover:text-brand-600 border border-dashed border-steel-200 hover:border-brand-300 rounded-xl px-3 py-2 transition">
                      + Agendar às {fmtTime(s)}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApptCard({ a, mechs, workshopName, onPatch, mech }: {
  a: Appt; mechs: Mech[]; workshopName?: string;
  onPatch: (a: Appt, row: Record<string, unknown>, msg?: string) => void;
  mech?: boolean;
}) {
  const [moving, setMoving] = useState(false);
  const [when, setWhen] = useState(localInput(new Date(a.scheduled_at)));
  const car = a.vehicle ? `${a.vehicle.make} ${a.vehicle.model}` : '';
  const phone = waNumber(a.customer?.phone);
  const dayTxt = new Date(a.scheduled_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  const first = a.customer?.full_name.split(' ')[0];
  const msg = `Olá${first ? ` ${first}` : ''}! Aqui é da ${workshopName ?? 'oficina'}. ` +
    `Confirmando seu horário ${dayTxt} às ${fmtTime(a.scheduled_at)}` +
    `${car ? ` para o ${car}${a.vehicle?.plate ? ` (${a.vehicle.plate})` : ''}` : ''} — ${a.title}. ` +
    `Podemos confirmar? Se precisar mudar, é só responder aqui. 🙂`;
  const done = a.status === 'completed' || !!mech;

  const tone = a.schedule_status === 'no_show' ? 'border-l-alert-500 bg-alert-50/40'
    : a.schedule_status === 'confirmed' ? 'border-l-signal-500' : 'border-l-pending-500';

  return (
    <div className={`rounded-xl border border-steel-200 border-l-4 ${tone} bg-white px-3 py-2.5 space-y-2`}>
      <div className="flex items-start gap-2">
        {a.vehicle?.plate && <LicensePlate plate={a.vehicle.plate} size="sm" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">
            {isCheckup(a) && <span className="mr-1">🩺</span>}{a.title}
          </div>
          <div className="text-xs text-steel-500 truncate">
            {fmtTime(a.scheduled_at)} · {[a.customer?.full_name, car].filter(Boolean).join(' · ') || 'Sem cliente'}
          </div>
        </div>
        <div className="text-right shrink-0 space-y-1">
          <span className={`badge ${osColor(a.status)}`}>{osLabel(a.status)}</span>
          <div className={`text-[11px] font-semibold ${a.schedule_status === 'confirmed' ? 'text-signal-700' : a.schedule_status === 'no_show' ? 'text-alert-600' : 'text-pending-700'}`}>
            {a.schedule_status === 'confirmed' ? '✅ Confirmado' : a.schedule_status === 'no_show' ? '🚫 Não veio' : done ? '' : a.schedule_reminded_at ? '💬 Aguardando resposta' : '⏳ A confirmar'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {!mech && <select className="input !py-1 !px-2 !w-auto text-xs" value={a.workshop_mechanic_id ?? ''}
          onChange={e => onPatch(a, { workshop_mechanic_id: e.target.value || null }, 'Mecânico definido ✓')}>
          <option value="">🔧 Sem mecânico</option>
          {mechs.map(m => <option key={m.id} value={m.id}>🔧 {m.name}</option>)}
        </select>}
        {!done && phone && a.schedule_status !== 'confirmed' && (
          <WhatsAppButton phone={phone} text={msg} customerName={a.customer?.full_name} title="Confirmar agendamento"
            onSent={() => onPatch(a, { schedule_reminded_at: new Date().toISOString() })}
            className="px-2.5 py-1 rounded-lg bg-[#25D366] text-white font-semibold">💬 Confirmar pelo WhatsApp</WhatsAppButton>
        )}
        {!done && a.schedule_status !== 'confirmed' && (
          <button onClick={() => onPatch(a, { schedule_status: 'confirmed', schedule_status_at: new Date().toISOString() }, 'Confirmado ✓')}
            className="px-2.5 py-1 rounded-lg border border-signal-300 text-signal-700 font-semibold hover:bg-signal-50">✅ Confirmou</button>
        )}
        {!done && a.schedule_status !== 'no_show' && new Date(a.scheduled_at).getTime() < Date.now() && (
          <button onClick={() => onPatch(a, { schedule_status: 'no_show', schedule_status_at: new Date().toISOString() }, 'Marcado: não veio')}
            className="px-2.5 py-1 rounded-lg border border-alert-200 text-alert-600 font-semibold hover:bg-alert-50">🚫 Não veio</button>
        )}
        {!done && (
          <button onClick={() => setMoving(v => !v)} className="px-2.5 py-1 rounded-lg border border-steel-200 text-steel-600 font-semibold hover:bg-steel-50">🔁 Remarcar</button>
        )}
        <Link to={`/oficina/os/${a.id}`} className="ml-auto text-brand-600 font-semibold hover:underline">
          OS nº {String(a.number ?? '').padStart(4, '0')} →
        </Link>
      </div>

      {moving && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="datetime-local" className="input !py-1.5 !w-auto text-sm" value={when} onChange={e => setWhen(e.target.value)} />
          <button className="btn-primary !py-1.5 text-sm" onClick={() => {
            if (!when) return;
            setMoving(false);
            onPatch(a, { scheduled_at: new Date(when).toISOString(), schedule_status: null, schedule_reminded_at: null, schedule_status_at: null }, 'Remarcado ✓ — confirme o novo horário com o cliente');
          }}>Salvar novo horário</button>
        </div>
      )}
    </div>
  );
}

/* ─── Semana ─────────────────────────────────────────────────────────── */
function WeekView({ start, cfg, appts, onOpenDay }: {
  start: Date; cfg: ScheduleConfig; appts: Appt[]; onOpenDay: (d: Date) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {days.map(d => {
        const list = appts.filter(a => dayKey(new Date(a.scheduled_at)) === dayKey(d));
        const capacity = daySlots(d, cfg).length * cfg.cars_per_slot;
        const today = dayKey(d) === dayKey(new Date());
        return (
          <div key={dayKey(d)} className={`card !p-2 min-h-[140px] ${today ? 'ring-2 ring-brand-300' : ''}`}>
            <button onClick={() => onOpenDay(d)} className="w-full text-left px-1 pb-2 border-b border-steel-100">
              <div className="text-[10px] font-bold uppercase text-steel-500">{WEEKDAY_SHORT[d.getDay()]}</div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-bold">{d.getDate()}</span>
                <span className="text-[10px] text-steel-400">{capacity ? `${list.length}/${capacity}` : 'fechado'}</span>
              </div>
            </button>
            <div className="space-y-1 pt-2">
              {list.map(a => (
                <Link key={a.id} to={`/oficina/os/${a.id}`}
                  className={`block rounded-lg px-2 py-1 text-[11px] leading-tight border-l-4 bg-steel-50 hover:bg-steel-100 ${
                    a.schedule_status === 'no_show' ? 'border-l-alert-500' : a.schedule_status === 'confirmed' ? 'border-l-signal-500' : 'border-l-pending-500'}`}>
                  <div className="font-bold">{fmtTime(a.scheduled_at)} {isCheckup(a) ? '🩺' : ''}</div>
                  <div className="truncate">{a.vehicle?.plate ?? ''} {a.title}</div>
                  {a.mechanic && <div className="truncate text-steel-500">🔧 {a.mechanic.name}</div>}
                </Link>
              ))}
              {!list.length && capacity > 0 && <div className="text-[11px] text-steel-400 px-1">Livre</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Horário de atendimento ────────────────────────────────────────── */
function ScheduleSettings({ wid, cfg, onClose, onSaved }: {
  wid: string; cfg: ScheduleConfig; onClose: () => void; onSaved: (c: ScheduleConfig) => void;
}) {
  const [days, setDays]   = useState<number[]>(cfg.weekdays);
  const [open, setOpen]   = useState(cfg.open_time.slice(0, 5));
  const [close, setClose] = useState(cfg.close_time.slice(0, 5));
  const [sat, setSat]     = useState(cfg.saturday_close?.slice(0, 5) ?? '');
  const [slot, setSlot]   = useState(cfg.slot_minutes);
  const [cars, setCars]   = useState(cfg.cars_per_slot);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (open >= close) return toast.error('O horário de fechar precisa ser depois do de abrir');
    const row = {
      workshop_id: wid, weekdays: [...days].sort(), open_time: open, close_time: close,
      saturday_close: sat || null, slot_minutes: slot, cars_per_slot: cars,
    };
    setSaving(true);
    const { error } = await supabase.from('workshop_schedule').upsert(row);
    setSaving(false);
    if (error) return toast.error('Não foi possível salvar: ' + error.message);
    toast.success('Horário de atendimento salvo ✓');
    onSaved(row as ScheduleConfig);
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">⚙️ Horário de atendimento</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="label">Dias que atende</label>
            <div className="flex gap-1.5">
              {WEEKDAY_SHORT.map((l, i) => (
                <button key={i} type="button" onClick={() => setDays(d => d.includes(i) ? d.filter(x => x !== i) : [...d, i])}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border ${days.includes(i) ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-500 border-steel-200'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Abre</label><input type="time" className="input" value={open} onChange={e => setOpen(e.target.value)} /></div>
            <div><label className="label">Fecha</label><input type="time" className="input" value={close} onChange={e => setClose(e.target.value)} /></div>
            <div><label className="label">Sábado fecha</label><input type="time" className="input" value={sat} onChange={e => setSat(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tamanho do horário</label>
              <select className="input" value={slot} onChange={e => setSlot(Number(e.target.value))}>
                {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60}h`.replace('.5h', 'h30')}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Carros por horário</label>
              <input type="number" min={1} max={50} className="input" value={cars} onChange={e => setCars(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>
          <p className="text-[11px] text-steel-400">
            Vale para a Agenda e para o link do check-up, onde o cliente escolhe o horário: só aparecem horários com vaga.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-steel-100 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
