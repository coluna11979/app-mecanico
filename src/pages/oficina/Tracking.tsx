import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import MapView from '@/components/maps/MapView';
import { supabase } from '@/lib/supabase';
import { useMechanicLive } from '@/hooks/useMechanicLive';
import type { Job, Mechanic, Profile, Workshop } from '@/types/database';

type Step = { label: string; done: boolean; active: boolean };

export default function WorkshopTracking() {
  const { id } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [shop, setShop] = useState<Workshop | null>(null);
  const [mech, setMech] = useState<(Mechanic & { profile: Profile }) | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    const { data: j } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    setJob(j as Job);
    if (j) {
      const [{ data: w }, { data: m }] = await Promise.all([
        supabase.from('workshops').select('*').eq('id', j.workshop_id).maybeSingle(),
        j.mechanic_id ? supabase.from('mechanics').select('*, profile:profiles!inner(*)').eq('id', j.mechanic_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setShop(w as Workshop);
      setMech(m as never);
    }
  }

  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`job:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${id}` },
        payload => setJob(payload.new as Job))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  const live = useMechanicLive(mech?.id ?? null);

  async function confirmJob() {
    if (!job) return;
    setConfirming(true);
    await supabase.from('jobs').update({ workshop_confirmed_at: new Date().toISOString() }).eq('id', job.id);
    setConfirming(false);
  }

  const steps: Step[] = (() => {
    const s = job?.status ?? 'open';
    return [
      { label: 'Contratado', done: true, active: false },
      { label: 'A caminho', done: ['in_progress', 'completed'].includes(s), active: s === 'assigned' },
      { label: 'Chegou / em serviço', done: s === 'completed', active: s === 'in_progress' },
      { label: 'Finalizado', done: !!job?.workshop_confirmed_at, active: s === 'completed' && !job?.workshop_confirmed_at },
    ];
  })();

  const center: [number, number] = live ? [live.lat, live.lng] : shop?.lat && shop?.lng ? [shop.lat, shop.lng] : [-23.55, -46.63];

  return (
    <WorkshopLayout>
      <Link to="/oficina/dashboard" className="text-sm text-steel-500 hover:text-brand-500">← Voltar</Link>
      <h1 className="text-3xl font-bold tracking-tight mt-1 mb-6">{job?.title ?? 'Carregando…'}</h1>

      <div className="grid lg:grid-cols-[3fr_2fr] gap-5 h-[640px]">
        <div className="rounded-2xl overflow-hidden shadow-card relative">
          <MapView center={center} zoom={14}
            liveMechanic={live ? { lat: live.lat, lng: live.lng } : undefined}
            markers={shop?.lat && shop?.lng ? [{ id: 'shop', lat: shop.lat, lng: shop.lng, label: '🏭', color: '#0B1117' }] : []}
            styleUrl="mapbox://styles/mapbox/streets-v12" />
        </div>

        <aside className="card flex flex-col">
          {mech && (
            <>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-brand-500 grid place-items-center text-white font-bold">
                  {mech.profile.full_name.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="font-bold">{mech.profile.full_name}</div>
                  <div className="text-xs text-steel-500">★ {mech.rating.toFixed(1)} · {mech.total_jobs} jobs</div>
                </div>
                {mech.profile.phone && (
                  <a href={`tel:${mech.profile.phone}`} className="btn-secondary !py-2 !px-3">📞</a>
                )}
              </div>
              {live && <div className="text-xs text-steel-500 mt-2">Última posição: {new Date(live.at).toLocaleTimeString('pt-BR')}</div>}
            </>
          )}

          <div className="mt-6 space-y-3">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`h-7 w-7 rounded-full grid place-items-center text-xs font-bold ${
                  s.done ? 'bg-signal-500 text-white' :
                  s.active ? 'bg-brand-500 text-white animate-pulse-soft' :
                  'bg-steel-200 text-steel-500'}`}>
                  {s.done ? '✓' : i + 1}
                </div>
                <div className={`text-sm font-semibold ${s.active ? 'text-brand-600' : s.done ? 'text-steel-700' : 'text-steel-400'}`}>{s.label}</div>
              </div>
            ))}
          </div>

          {job?.status === 'completed' && !job.workshop_confirmed_at && (
            <div className="mt-auto pt-5 border-t border-steel-200">
              <p className="text-sm text-steel-500 mb-3">Mecânico finalizou o serviço. Confirme em até 24h ou abra disputa.</p>
              <button onClick={confirmJob} disabled={confirming} className="btn-primary w-full">{confirming ? '…' : 'Confirmar e liberar pagamento'}</button>
            </div>
          )}
        </aside>
      </div>
    </WorkshopLayout>
  );
}
