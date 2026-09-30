import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import {
  CHECKUP_TEMPLATE, DECISION_META, SYSTEM_ICON, STATUS_META, checkupPhotoUrl, itemQuote, scoreMeta,
  type CheckupItemStatus, type CustomerDecision,
} from '@/lib/checkup';
import { fmtBRL } from '@/components/os/osHelpers';
import { DEMO_ID, demoMechanicName, demoResult } from '@/lib/checkupDemo';

function demoReport(): PublicCheckup {
  const { checkup: c, items } = demoResult();
  return {
    score: c.score ?? 0, plate: c.plate, make: c.make, model: c.model, year: c.year,
    km_reading: c.km_reading, notes: c.notes, completed_at: c.completed_at ?? c.created_at,
    customer_first_name: c.customer_name?.trim().split(' ')[0] || null,
    workshop: { business_name: 'Oficina Demonstração', logo_url: null, city: 'São Paulo', state: 'SP' },
    mechanic_name: demoMechanicName(c.workshop_mechanic_id),
    responded_at: null, scheduled_at: null,
    items: items.filter(i => i.status).map(i => ({
      id: i.id, system: i.system, label: i.label, status: i.status!,
      measurement: i.measurement, note: i.note, photo_path: i.photo_path,
    })),
  };
}

interface PublicItem {
  id?: string; system: string; label: string; status: CheckupItemStatus;
  measurement: string | null; note: string | null; photo_path: string | null;
  quote_service?: string | null; quote_labor?: number | null;
  quote_part?: string | null; quote_parts?: number | null;
  decision?: CustomerDecision | null;
}
interface PublicCheckup {
  score: number; plate: string | null; make: string | null; model: string | null; year: number | null;
  km_reading: number | null; notes: string | null; completed_at: string;
  customer_first_name: string | null;
  workshop: { business_name: string; logo_url: string | null; city: string | null; state: string | null };
  mechanic_name: string | null;
  responded_at: string | null;
  scheduled_at: string | null;
  items: PublicItem[];
}

const SCORE_RING = { signal: '#16C784', pending: '#F5A524', alert: '#E5484D' };
const ROW_STYLE: Record<CheckupItemStatus, string> = {
  urgent: 'border-alert-500/40 bg-alert-500/5',
  warn:   'border-pending-500/40 bg-pending-500/5',
  ok:     'border-steel-100 bg-white',
  na:     'border-steel-100 bg-white',
};

export default function CheckupReport() {
  const { token } = useParams<{ token: string }>();
  const [data, setData]   = useState<PublicCheckup | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');
  const [zoom, setZoom]   = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    if (import.meta.env.DEV && token === DEMO_ID) { setData(demoReport()); setState('ok'); return; }
    supabase.rpc('get_public_checkup', { p_token: token }).then(({ data, error }) => {
      if (error || !data) { setState('notfound'); return; }
      setData(data as PublicCheckup);
      setState('ok');
      supabase.rpc('checkup_mark_viewed', { p_token: token }).then(() => {});  // a oficina vê que o cliente abriu
    });
  }, [token]);

  if (state === 'loading') {
    return <div className="min-h-screen grid place-items-center bg-steel-50 text-steel-500 text-sm">Carregando relatório…</div>;
  }
  if (state === 'notfound' || !data) {
    return (
      <div className="min-h-screen grid place-items-center bg-steel-50 p-6 text-center">
        <div className="space-y-2">
          <div className="text-4xl">🔍</div>
          <div className="font-bold text-steel-800">Relatório não encontrado</div>
          <p className="text-sm text-steel-500">O link pode estar incorreto ou o check-up ainda não foi finalizado.</p>
        </div>
      </div>
    );
  }

  const meta    = scoreMeta(data.score);
  const car     = [data.make, data.model, data.year].filter(Boolean).join(' ') || 'Veículo';
  const urgent  = data.items.filter(i => i.status === 'urgent');
  const warn    = data.items.filter(i => i.status === 'warn');
  const okCount = data.items.filter(i => i.status === 'ok').length;
  const date    = new Date(data.completed_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const circumference = 2 * Math.PI * 42;

  return (
    <div className="min-h-screen bg-steel-50 text-steel-800">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <header className="flex items-center gap-3">
          {data.workshop.logo_url
            ? <img src={data.workshop.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover bg-white border border-steel-100" />
            : <div className="h-12 w-12 rounded-xl bg-brand-100 text-brand-600 grid place-items-center font-bold text-lg">{data.workshop.business_name?.[0] ?? '?'}</div>}
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{data.workshop.business_name}</div>
            <div className="text-xs text-steel-500">{[data.workshop.city, data.workshop.state].filter(Boolean).join('/')}{data.workshop.city ? ' · ' : ''}{date}</div>
          </div>
        </header>

        {/* ── Veículo + nota ── */}
        <section className="card !p-5 space-y-4">
          <div>
            <div className="text-xs text-steel-500 font-semibold uppercase tracking-wider">
              Check-up do veículo{data.customer_first_name ? ` · ${data.customer_first_name}` : ''}
            </div>
            <h1 className="text-xl font-bold mt-1">{car}</h1>
            <div className="flex items-center gap-2 mt-1 text-sm text-steel-500">
              {data.plate && <span className="font-mono font-bold bg-steel-100 text-steel-700 rounded px-1.5 py-0.5 text-xs">{data.plate}</span>}
              {data.km_reading != null && <span>{data.km_reading.toLocaleString('pt-BR')} km</span>}
            </div>
          </div>
          <div className="flex items-center gap-5">
            <svg viewBox="0 0 100 100" className="w-28 h-28 shrink-0 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="#E8ECF1" strokeWidth="10" />
              <circle cx="50" cy="50" r="42" fill="none" stroke={SCORE_RING[meta.color]} strokeWidth="10" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={circumference * (1 - data.score / 100)} />
              <text x="50" y="50" textAnchor="middle" dominantBaseline="central" transform="rotate(90 50 50)"
                className="font-display font-bold" fontSize="28" fill="currentColor">{data.score}</text>
            </svg>
            <div className="space-y-1.5">
              <div className="font-bold text-lg" style={{ color: SCORE_RING[meta.color] }}>{meta.label}</div>
              <div className="text-sm text-steel-600 space-y-0.5">
                <div>🔴 {urgent.length} {urgent.length === 1 ? 'item urgente' : 'itens urgentes'}</div>
                <div>🟡 {warn.length} {warn.length === 1 ? 'item' : 'itens'} para atenção</div>
                <div>🟢 {okCount} {okCount === 1 ? 'item' : 'itens'} em ordem</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Observações ── */}
        {data.notes && (
          <section className="card !p-4">
            <div className="text-xs text-steel-500 font-semibold uppercase tracking-wider mb-1">Recomendação do mecânico</div>
            <p className="text-sm text-steel-700 whitespace-pre-line">{data.notes}</p>
          </section>
        )}

        {/* ── Orçamento: o cliente aprova e escolhe o horário ── */}
        {token && <QuoteSection token={token} data={data} onDone={setData} onZoom={setZoom} />}

        {/* ── Itens que pedem ação (sem orçamento) ── */}
        {(urgent.length > 0 || warn.length > 0) && !data.items.some(i => itemQuote(i) > 0) && (
          <section className="space-y-2">
            <h2 className="font-bold text-steel-800">O que precisa de atenção</h2>
            {[...urgent, ...warn].map((i, idx) => (
              <ItemCard key={idx} item={i} onZoom={setZoom} />
            ))}
          </section>
        )}

        {/* ── Tudo por sistema ── */}
        <section className="space-y-3">
          <h2 className="font-bold text-steel-800">Inspeção completa</h2>
          {CHECKUP_TEMPLATE.map(({ system }) => {
            const list = data.items.filter(i => i.system === system);
            if (!list.length) return null;
            return (
              <div key={system} className="card !p-0 overflow-hidden">
                <div className="px-4 py-3 font-semibold text-sm bg-steel-50 border-b border-steel-100">
                  {SYSTEM_ICON[system]} {system}
                </div>
                <div className="divide-y divide-steel-100">
                  {list.map((i, idx) => (
                    <div key={idx} className="px-4 py-2.5 flex items-start gap-2 text-sm">
                      <span>{STATUS_META[i.status].dot}</span>
                      <div className="flex-1 min-w-0">
                        <span>{i.label}</span>
                        {i.measurement && <span className="text-steel-500"> · {i.measurement}</span>}
                        {i.note && <div className="text-xs text-steel-500">{i.note}</div>}
                      </div>
                      {i.photo_path && (
                        <button onClick={() => setZoom(checkupPhotoUrl(i.photo_path!))} className="text-xs text-brand-600 shrink-0">📷</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {/* ── Rodapé ── */}
        <footer className="card !p-4">
          <div className="text-xs text-steel-500">Inspeção realizada por</div>
          <div className="font-semibold">
            {data.mechanic_name ? `${data.mechanic_name} · ` : ''}{data.workshop.business_name}
          </div>
        </footer>
        <p className="text-center text-xs text-steel-400 pb-4 flex items-center justify-center gap-1.5">
          Relatório gerado pelo <Link to="/" className="inline-flex"><Logo size={16} /></Link>
        </p>
      </div>

      {zoom && (
        <div className="fixed inset-0 z-50 bg-steel-900/90 grid place-items-center p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-h-[90vh] max-w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}

function ItemCard({ item, onZoom }: { item: PublicItem; onZoom: (url: string) => void }) {
  return (
    <div className={`rounded-2xl border p-3 flex gap-3 ${ROW_STYLE[item.status]}`}>
      {item.photo_path && (
        <button onClick={() => onZoom(checkupPhotoUrl(item.photo_path!))} className="shrink-0">
          <img src={checkupPhotoUrl(item.photo_path)} alt="" className="h-16 w-16 rounded-xl object-cover" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold">
          {STATUS_META[item.status].dot} {STATUS_META[item.status].label}
          <span className="font-normal text-steel-500"> · {item.system}</span>
        </div>
        <div className="font-semibold text-sm mt-0.5">
          {item.label}{item.measurement && <span className="font-normal text-steel-500"> · {item.measurement}</span>}
        </div>
        {item.note && <div className="text-sm text-steel-600 mt-0.5">{item.note}</div>}
      </div>
    </div>
  );
}

/* ─── Orçamento com aprovação por item e agendamento ─────────────────────── */
function QuoteSection({ token, data, onDone, onZoom }: {
  token: string; data: PublicCheckup; onDone: (d: PublicCheckup) => void; onZoom: (url: string) => void;
}) {
  const quoted = data.items.filter(i => (i.status === 'urgent' || i.status === 'warn') && itemQuote(i) > 0)
    .sort((a, b) => (a.status === 'urgent' ? 0 : 1) - (b.status === 'urgent' ? 0 : 1));
  const others = data.items.filter(i => (i.status === 'urgent' || i.status === 'warn') && !(itemQuote(i) > 0));
  const [dec, setDec] = useState<Record<string, CustomerDecision>>({});
  const [day, setDay] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approved = quoted.filter(i => dec[i.id!] === 'approve');
  const total = approved.reduce((a, i) => a + itemQuote(i), 0);
  const allAnswered = quoted.every(i => dec[i.id!]);

  // Próximos 14 dias (a oficina define quais têm horário)
  const days = useMemo(() => Array.from({ length: 14 }, (_, k) => {
    const d = new Date(); d.setDate(d.getDate() + k);
    return d.toLocaleDateString('en-CA');   // AAAA-MM-DD no fuso do aparelho
  }), []);

  useEffect(() => {
    if (!day) return;
    setSlots(null); setSlot(null);
    supabase.rpc('checkup_public_slots', { p_token: token, p_day: day })
      .then(({ data: r }) => setSlots(((r as string[] | null) ?? [])));
  }, [day, token]);

  if (!quoted.length) return null;

  // Já respondido: mostra o que ficou combinado
  if (data.responded_at) {
    const ok = quoted.filter(i => i.decision === 'approve');
    return (
      <section className="card !p-5 space-y-3">
        <div className="text-lg font-bold">{ok.length ? '✅ Orçamento aprovado' : 'Resposta enviada'}</div>
        {data.scheduled_at && (
          <div className="rounded-xl bg-signal-50 border border-signal-200 px-3 py-2 text-sm">
            📅 Esperamos você em <strong>{new Date(data.scheduled_at).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}</strong>
          </div>
        )}
        <ul className="space-y-1.5 text-sm">
          {quoted.map(i => {
            const m = i.decision ? DECISION_META[i.decision] : null;
            return (
              <li key={i.id} className="flex justify-between gap-2">
                <span className="min-w-0">{m ? m.icon : '•'} {i.label}</span>
                <span className={`shrink-0 font-semibold ${m?.tone ?? 'text-steel-400'}`}>{i.decision === 'approve' ? fmtBRL(itemQuote(i)) : m?.short ?? '—'}</span>
              </li>
            );
          })}
        </ul>
        {ok.length > 0 && (
          <div className="flex justify-between border-t border-steel-100 pt-2 font-bold">
            <span>Total aprovado</span><span>{fmtBRL(ok.reduce((a, i) => a + itemQuote(i), 0))}</span>
          </div>
        )}
      </section>
    );
  }

  async function confirm() {
    setError(null);
    if (!allAnswered) { setError('Escolha uma opção em cada item.'); return; }
    if (approved.length && !slot) { setError('Escolha o dia e o horário para trazer o carro.'); return; }
    setSending(true);
    const { data: r, error: e } = await supabase.rpc('checkup_customer_respond', {
      p_token: token,
      p_decisions: quoted.map(i => ({ id: i.id, decision: dec[i.id!] })),
      p_schedule: approved.length ? slot : null,
    });
    setSending(false);
    const res = r as { ok: boolean; error?: string } | null;
    if (e || !res?.ok) {
      setError(res?.error ?? 'Não foi possível enviar. Tente de novo.');
      // Alguém pegou o horário antes: recarrega os livres do dia
      if (res?.error?.includes('horário') && day) {
        setSlot(null); setSlots(null);
        supabase.rpc('checkup_public_slots', { p_token: token, p_day: day }).then(({ data: x }) => setSlots((x as string[] | null) ?? []));
      }
      return;
    }
    onDone({
      ...data, responded_at: new Date().toISOString(), scheduled_at: approved.length ? slot : null,
      items: data.items.map(i => i.id && dec[i.id] ? { ...i, decision: dec[i.id] } : i),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const choice = (i: PublicItem, d: CustomerDecision) => (
    <button key={d} onClick={() => setDec(x => ({ ...x, [i.id!]: d }))}
      className={`flex-1 text-xs font-bold px-2 py-2.5 rounded-xl border transition active:scale-95 ${
        dec[i.id!] === d
          ? d === 'approve' ? 'bg-signal-500 text-white border-signal-500' : d === 'remind' ? 'bg-pending-500 text-steel-900 border-pending-500' : 'bg-steel-600 text-white border-steel-600'
          : 'bg-white text-steel-600 border-steel-200'}`}>
      {DECISION_META[d].icon} {DECISION_META[d].label}
    </button>
  );

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-bold text-steel-800 text-lg">Seu orçamento</h2>
        <p className="text-sm text-steel-500">Escolha o que quer fazer em cada item. Você só paga o que aprovar.</p>
      </div>
      {quoted.map(i => (
        <div key={i.id} className={`rounded-2xl border p-3 space-y-2.5 ${ROW_STYLE[i.status]}`}>
          <div className="flex gap-3">
            {i.photo_path && (
              <button onClick={() => onZoom(checkupPhotoUrl(i.photo_path!))} className="shrink-0">
                <img src={checkupPhotoUrl(i.photo_path)} alt="" className="h-16 w-16 rounded-xl object-cover" />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold">{STATUS_META[i.status].dot} {STATUS_META[i.status].label}<span className="font-normal text-steel-500"> · {i.system}</span></div>
              <div className="font-semibold text-sm mt-0.5">{i.label}{i.measurement && <span className="font-normal text-steel-500"> · {i.measurement}</span>}</div>
              {i.note && <div className="text-sm text-steel-600 mt-0.5">{i.note}</div>}
              <div className="text-xs text-steel-500 mt-1">
                {[i.quote_service, i.quote_part].filter(Boolean).join(' + ')}
              </div>
            </div>
            <div className="text-right shrink-0 font-bold">{fmtBRL(itemQuote(i))}</div>
          </div>
          <div className="flex gap-1.5">{(['approve', 'remind', 'decline'] as CustomerDecision[]).map(d => choice(i, d))}</div>
        </div>
      ))}

      {others.map((i, idx) => <ItemCard key={`o${idx}`} item={i} onZoom={onZoom} />)}

      <div className="card !p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-semibold">Total aprovado</span>
          <span className="text-2xl font-bold font-display">{fmtBRL(total)}</span>
        </div>

        {approved.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">📅 Quando você pode trazer o carro?</div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
              {days.map(d => {
                const dt = new Date(`${d}T12:00:00`);
                return (
                  <button key={d} onClick={() => setDay(d)}
                    className={`shrink-0 w-14 py-2 rounded-xl border text-center transition ${day === d ? 'bg-steel-900 text-white border-steel-900' : 'bg-white border-steel-200'}`}>
                    <div className="text-[10px] uppercase">{dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</div>
                    <div className="text-lg font-bold leading-tight">{dt.getDate()}</div>
                  </button>
                );
              })}
            </div>
            {day && (slots === null ? <div className="text-xs text-steel-500">Buscando horários…</div>
              : slots.length === 0 ? <div className="text-xs text-steel-500">Sem horário livre neste dia. Escolha outro.</div>
              : (
                <div className="grid grid-cols-4 gap-1.5">
                  {slots.map(t => (
                    <button key={t} onClick={() => setSlot(t)}
                      className={`py-2 rounded-xl border text-sm font-semibold ${slot === t ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-steel-200'}`}>
                      {new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </button>
                  ))}
                </div>
              ))}
          </div>
        )}

        {error && <div className="text-sm text-alert-600 font-semibold">{error}</div>}
        <button onClick={confirm} disabled={sending} className="btn-primary w-full !py-3 text-base">
          {sending ? 'Enviando…' : approved.length ? `Confirmar ${fmtBRL(total)}${slot ? ' e agendar' : ''}` : 'Enviar minha resposta'}
        </button>
        <p className="text-[11px] text-steel-400 text-center">A oficina recebe sua resposta na hora. O pagamento é feito na oficina.</p>
      </div>
    </section>
  );
}
