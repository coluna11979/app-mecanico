import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import {
  CHECKUP_TEMPLATE, SYSTEM_ICON, STATUS_META, checkupPhotoUrl, scoreMeta,
  type CheckupItemStatus,
} from '@/lib/checkup';
import { DEMO_ID, demoResult } from '@/lib/checkupDemo';

function demoReport(): PublicCheckup {
  const { checkup: c, items } = demoResult();
  return {
    score: c.score ?? 0, plate: c.plate, make: c.make, model: c.model, year: c.year,
    km_reading: c.km_reading, notes: c.notes, completed_at: c.completed_at ?? c.created_at,
    customer_first_name: c.customer_name?.trim().split(' ')[0] || null,
    mechanic: { full_name: 'Mecânico Demonstração', avatar_url: null },
    items: items.filter(i => i.status).map(i => ({
      system: i.system, label: i.label, status: i.status!,
      measurement: i.measurement, note: i.note, photo_path: i.photo_path,
    })),
  };
}

interface PublicItem {
  system: string; label: string; status: CheckupItemStatus;
  measurement: string | null; note: string | null; photo_path: string | null;
}
interface PublicCheckup {
  score: number; plate: string | null; make: string | null; model: string | null; year: number | null;
  km_reading: number | null; notes: string | null; completed_at: string;
  customer_first_name: string | null;
  mechanic: { full_name: string; avatar_url: string | null };
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
        <header className="flex items-center justify-between">
          <Logo size={28} />
          <span className="text-xs text-steel-500">{date}</span>
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

        {/* ── Itens que pedem ação ── */}
        {(urgent.length > 0 || warn.length > 0) && (
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
        <footer className="card !p-4 flex items-center gap-3">
          {data.mechanic.avatar_url
            ? <img src={data.mechanic.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" />
            : <div className="h-11 w-11 rounded-full bg-brand-100 text-brand-600 grid place-items-center font-bold">{data.mechanic.full_name?.[0] ?? '?'}</div>}
          <div className="flex-1 min-w-0">
            <div className="text-xs text-steel-500">Inspeção realizada por</div>
            <div className="font-semibold truncate">{data.mechanic.full_name}</div>
          </div>
        </footer>
        <p className="text-center text-xs text-steel-400 pb-4">
          Relatório gerado pelo <Link to="/" className="text-brand-600 font-semibold">MecânicoApp</Link>
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
