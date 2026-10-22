import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { waNumber } from '@/components/os/osHelpers';
import {
  DEFAULT_SCHEDULE, WEEKDAY_SHORT, addDays, dayKey, daySlots, localInput, type ScheduleConfig,
} from '@/lib/agenda';
import WhatsAppButton from '@/components/inbox/WhatsAppButton';

type ScheduleOs = {
  id: string; workshop_id: string; title: string; scheduled_at: string | null;
  customer: { full_name: string; phone: string | null } | null;
  vehicle: { plate: string | null; make: string | null; model: string | null } | null;
};

const fmtTime = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Agendar (ou remarcar) a OS direto da tela dela: mostra os horários do atendimento da oficina
 * com as vagas de cada um (mesma regra da Agenda) e depois oferece confirmar pelo WhatsApp.
 */
export default function ScheduleOsModal({ os, shopName, onClose, onSaved }: {
  os: ScheduleOs; shopName: string; onClose: () => void; onSaved: () => void;
}) {
  const [cfg, setCfg] = useState<ScheduleConfig>(DEFAULT_SCHEDULE);
  const [taken, setTaken] = useState<Record<string, number>>({}); // horário (ms) → carros marcados
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [day, setDay] = useState<Date>(() => {
    if (os.scheduled_at) { const d = new Date(os.scheduled_at); d.setHours(0, 0, 0, 0); return d; }
    return today;
  });
  const [picked, setPicked] = useState<Date | null>(os.scheduled_at ? new Date(os.scheduled_at) : null);
  const [other, setOther] = useState(false); // horário fora da grade
  const [otherWhen, setOtherWhen] = useState(os.scheduled_at ? localInput(new Date(os.scheduled_at)) : '');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Date | null>(null);

  useEffect(() => {
    supabase.from('workshop_schedule').select('*').eq('workshop_id', os.workshop_id).maybeSingle()
      .then(({ data }) => { if (data) setCfg(data as ScheduleConfig); });
  }, [os.workshop_id]);

  // Ocupação dos próximos 14 dias (não conta "não veio" nem esta própria OS)
  useEffect(() => {
    supabase.from('service_orders').select('id, scheduled_at, schedule_status')
      .eq('workshop_id', os.workshop_id).neq('status', 'cancelled').neq('id', os.id)
      .gte('scheduled_at', today.toISOString()).lt('scheduled_at', addDays(today, 15).toISOString())
      .then(({ data }) => {
        const m: Record<string, number> = {};
        for (const o of (data ?? []) as { scheduled_at: string; schedule_status: string | null }[]) {
          if (o.schedule_status === 'no_show') continue;
          const k = String(new Date(o.scheduled_at).getTime());
          m[k] = (m[k] ?? 0) + 1;
        }
        setTaken(m);
      });
  }, [os.id, os.workshop_id, today]);

  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(today, i)).filter(d => cfg.weekdays.includes(d.getDay())), [today, cfg]);
  const slots = useMemo(() => daySlots(day, cfg).filter(s => s.getTime() > Date.now()), [day, cfg]);
  const when = other ? (otherWhen ? new Date(otherWhen) : null) : picked;

  async function save() {
    if (!when || Number.isNaN(when.getTime())) return toast.error('Escolha o dia e o horário');
    setBusy(true);
    const { error } = await supabase.from('service_orders').update({
      scheduled_at: when.toISOString(), schedule_status: null, schedule_reminded_at: null, schedule_status_at: null,
    }).eq('id', os.id);
    setBusy(false);
    if (error) return toast.error('Não foi possível agendar: ' + error.message);
    toast.success(os.scheduled_at ? 'Remarcado ✓' : 'Agendado ✓ — já aparece na Agenda');
    onSaved();
    setSaved(when);
  }

  async function unschedule() {
    if (!confirm('Tirar esta OS da agenda?')) return;
    setBusy(true);
    const { error } = await supabase.from('service_orders').update({
      scheduled_at: null, schedule_status: null, schedule_reminded_at: null, schedule_status_at: null,
    }).eq('id', os.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Agendamento removido');
    onSaved(); onClose();
  }

  const phone = waNumber(os.customer?.phone);
  const car = os.vehicle ? [os.vehicle.make, os.vehicle.model].filter(Boolean).join(' ') : '';
  const waMsg = (d: Date) => {
    const first = os.customer?.full_name.split(' ')[0];
    const dayTxt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
    return `Olá${first ? ` ${first}` : ''}! Aqui é da ${shopName}. Seu horário ficou marcado para ${dayTxt} às ${fmtTime(d)}`
      + `${car ? ` para o ${car}${os.vehicle?.plate ? ` (${os.vehicle.plate})` : ''}` : ''} — ${os.title}. `
      + 'Podemos confirmar? Se precisar mudar, é só responder aqui. 🙂';
  };

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">📅 {os.scheduled_at ? 'Remarcar serviço' : 'Agendar serviço'}</h2>
            <div className="text-sm text-steel-500">{[os.customer?.full_name, car, os.vehicle?.plate].filter(Boolean).join(' · ')}</div>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        {saved ? (
          <div className="mt-5 text-center">
            <div className="text-4xl">✅</div>
            <div className="font-bold text-lg mt-2">
              {saved.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} às {fmtTime(saved)}
            </div>
            <p className="text-sm text-steel-500 mt-1">Já aparece na Agenda como "a confirmar".</p>
            <div className="grid gap-2 mt-5">
              {phone && (
                <WhatsAppButton phone={phone} text={waMsg(saved)} customerName={os.customer?.full_name} title="Confirmar agendamento"
                  onSent={() => { supabase.from('service_orders').update({ schedule_reminded_at: new Date().toISOString() }).eq('id', os.id).then(); }}
                  className="btn-primary !bg-signal-600">💬 Confirmar com o cliente no WhatsApp</WhatsAppButton>
              )}
              <button onClick={onClose} className="btn-ghost">Fechar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="label mt-4 mb-2">Dia</div>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {days.map(d => {
                const on = dayKey(d) === dayKey(day) && !other;
                return (
                  <button key={dayKey(d)} type="button" onClick={() => { setDay(d); setOther(false); setPicked(null); }}
                    className={`shrink-0 w-14 py-2 rounded-xl border text-center transition ${on ? 'bg-steel-900 text-white border-steel-900' : 'bg-white border-steel-200 text-steel-700'}`}>
                    <div className="text-[10px] uppercase">{dayKey(d) === dayKey(today) ? 'Hoje' : WEEKDAY_SHORT[d.getDay()]}</div>
                    <div className="font-bold">{d.getDate()}</div>
                  </button>
                );
              })}
            </div>

            {!other && (
              <>
                <div className="label mt-4 mb-2">Horário</div>
                {slots.length === 0 ? (
                  <div className="text-sm text-steel-500 bg-steel-50 rounded-xl px-3 py-3">Sem horários livres neste dia.</div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {slots.map(s => {
                      const n = taken[String(s.getTime())] ?? 0;
                      const full = n >= cfg.cars_per_slot;
                      const on = picked?.getTime() === s.getTime();
                      return (
                        <button key={s.getTime()} type="button" onClick={() => setPicked(s)}
                          className={`py-2 rounded-xl border text-center transition ${on ? 'bg-brand-500 text-white border-brand-500'
                            : full ? 'bg-steel-50 text-steel-400 border-steel-200' : 'bg-white border-steel-200 hover:border-brand-300'}`}>
                          <div className="font-semibold text-sm">{fmtTime(s)}</div>
                          <div className={`text-[10px] ${on ? 'text-white/80' : full ? 'text-alert-600' : 'text-steel-400'}`}>
                            {full ? 'lotado' : `${cfg.cars_per_slot - n} vaga${cfg.cars_per_slot - n > 1 ? 's' : ''}`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {picked && (taken[String(picked.getTime())] ?? 0) >= cfg.cars_per_slot && (
                  <p className="text-xs text-pending-800 mt-2">Esse horário já está lotado — dá para marcar mesmo assim (encaixe).</p>
                )}
              </>
            )}

            <button type="button" onClick={() => setOther(o => !o)} className="text-xs text-steel-500 underline mt-3">
              {other ? 'Voltar para os horários da agenda' : 'Outro dia ou horário'}
            </button>
            {other && <input type="datetime-local" className="input mt-2" value={otherWhen} onChange={e => setOtherWhen(e.target.value)} />}

            <button onClick={save} disabled={busy || !when} className="btn-primary w-full mt-5 btn-lg">
              {busy ? 'Salvando…' : when && !Number.isNaN(when.getTime())
                ? `${os.scheduled_at ? 'Remarcar' : 'Agendar'} · ${when.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${fmtTime(when)}`
                : 'Escolha o horário'}
            </button>
            {os.scheduled_at && (
              <button onClick={unschedule} disabled={busy} className="text-sm text-alert-600 w-full mt-3 hover:underline">Tirar da agenda</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
