import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import MapView from '@/components/maps/MapView';
import { ChatBox } from '@/components/chat/ChatBox';
import { supabase } from '@/lib/supabase';
import { getSetting } from '@/lib/settings';
import { useMechanicLive } from '@/hooks/useMechanicLive';
import type { Job, Mechanic, Profile, Workshop } from '@/types/database';

const PIX_KEY  = '11982907309';
const PIX_NAME = 'José Pedrosa Machado Filho';

type Step = { label: string; done: boolean; active: boolean };
type Tab  = 'progresso' | 'chat';

export default function WorkshopTracking() {
  const { id } = useParams();
  const [job, setJob]               = useState<Job | null>(null);
  const [shop, setShop]             = useState<Workshop | null>(null);
  const [mech, setMech]             = useState<(Mechanic & { profile: Profile }) | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [payingPix, setPayingPix]   = useState(false);
  const [tab, setTab]               = useState<Tab>('progresso');
  const [rating, setRating]         = useState(0);
  const [ratingNote, setRatingNote] = useState('');
  const [hovered, setHovered]       = useState(0);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const lastRouteFetch = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => { if (id) load(); }, [id]);

  async function load() {
    const { data: j } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    setJob(j as Job);
    if (j) {
      const [{ data: w }, { data: m }] = await Promise.all([
        supabase.from('workshops').select('*').eq('id', j.workshop_id).maybeSingle(),
        j.mechanic_id
          ? supabase.from('mechanics').select('*, profile:profiles!inner(*)').eq('id', j.mechanic_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setShop(w as Workshop);
      setMech(m as never);
    }
  }

  // Realtime — status do job (detecta arrived_at, pix_paid_at, status)
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`job:${id}:oficina`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${id}` },
        payload => setJob(payload.new as Job))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  const live = useMechanicLive(mech?.id ?? null, id);

  /* ── Remove rota quando mecânico já chegou ── */
  useEffect(() => {
    if (job?.arrived_at || job?.status === 'in_progress' || job?.status === 'completed') {
      setRouteCoords(null);
    }
  }, [job?.arrived_at, job?.status]);

  /* ── Busca rota da posição do mecânico até a oficina ── */
  useEffect(() => {
    if (!live || !shop?.lat || !shop?.lng) return;
    if (job?.arrived_at || job?.status !== 'assigned') return;

    // Só refaz se mecânico se moveu > 30 metros
    const prev = lastRouteFetch.current;
    if (prev) {
      const dlat = Math.abs(prev.lat - live.lat);
      const dlng = Math.abs(prev.lng - live.lng);
      if (dlat < 0.0003 && dlng < 0.0003) return;
    }
    lastRouteFetch.current = { lat: live.lat, lng: live.lng };

    (async () => {
      try {
        const token = await getSetting('mapbox_token', '');
        if (!token) return;
        const url =
          `https://api.mapbox.com/directions/v5/mapbox/driving/` +
          `${live.lng},${live.lat};${shop.lng},${shop.lat}` +
          `?geometries=geojson&overview=full&steps=false&access_token=${token}`;
        const res  = await fetch(url);
        const data = await res.json();
        const coords = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
        if (coords?.length) setRouteCoords(coords);
      } catch { /* silencioso */ }
    })();
  }, [live, shop, job?.arrived_at, job?.status]);

  async function confirmPixPayment() {
    if (!job) return;
    setPayingPix(true);
    await supabase.from('jobs').update({
      pix_paid_at: new Date().toISOString(),
      status: 'in_progress',
      started_at: new Date().toISOString(),
    }).eq('id', job.id);
    setPayingPix(false);
  }

  async function confirmJob() {
    if (!job || rating === 0) return;
    setConfirming(true);
    await supabase.from('jobs').update({
      workshop_confirmed_at: new Date().toISOString(),
      mechanic_rating:       rating,
      mechanic_rating_note:  ratingNote.trim() || null,
    }).eq('id', job.id);
    setConfirming(false);
  }

  const steps: Step[] = (() => {
    const s = job?.status ?? 'open';
    const arrived = !!job?.arrived_at;
    const pixPaid = !!job?.pix_paid_at;
    return [
      { label: 'Contratado',             done: true,                                                   active: false },
      { label: 'A caminho',              done: arrived || ['in_progress','completed'].includes(s),      active: s === 'assigned' && !arrived },
      { label: 'Chegou — aguard. PIX',   done: pixPaid,                                                active: arrived && !pixPaid },
      { label: 'Em serviço',             done: s === 'completed',                                       active: s === 'in_progress' },
      { label: 'Finalizado',             done: !!job?.workshop_confirmed_at,                            active: s === 'completed' && !job?.workshop_confirmed_at },
    ];
  })();

  const cap         = (job?.price_per_hour ?? 0) * (job?.max_hours ?? 1);
  const finalPrice  = job?.actual_hours != null ? (job.actual_hours * (job.price_per_hour ?? 0)) : null;
  const showPixModal = !!job?.arrived_at && !job?.pix_paid_at && job?.status === 'assigned';

  const center: [number, number] = live
    ? [live.lat, live.lng]
    : shop?.lat && shop?.lng ? [shop.lat, shop.lng] : [-23.55, -46.63];

  return (
    <WorkshopLayout>
      <Link to="/oficina/dashboard" className="text-sm text-steel-500 hover:text-brand-500">← Voltar</Link>
      <h1 className="text-3xl font-bold tracking-tight mt-1 mb-6">{job?.title ?? 'Carregando…'}</h1>

      <div className="grid lg:grid-cols-[3fr_2fr] gap-5" style={{ height: 640 }}>

        {/* Mapa */}
        <div className="rounded-2xl overflow-hidden shadow-card relative">
          <MapView
            center={center}
            zoom={14}
            followMechanic={false}
            liveMechanic={live ? { lat: live.lat, lng: live.lng } : undefined}
            routeCoords={routeCoords ?? undefined}
            markers={shop?.lat && shop?.lng
              ? [{ id: 'shop', lat: shop.lat, lng: shop.lng, label: '🏭', color: '#0B1117' }]
              : []}
            styleUrl="mapbox://styles/mapbox/streets-v12"
          />
        </div>

        {/* Painel lateral */}
        <aside className="card flex flex-col min-h-0">

          {/* Info mecânico */}
          {mech && (
            <div className="flex items-center gap-3 pb-4 border-b border-steel-100">
              <div className="h-12 w-12 rounded-full bg-brand-500 grid place-items-center text-white font-bold shrink-0">
                {mech.profile.full_name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{mech.profile.full_name}</div>
                <div className="text-xs text-steel-500">★ {mech.rating.toFixed(1)} · {mech.total_jobs} jobs</div>
                {live && <div className="text-xs text-steel-400">Atualizado {new Date(live.at).toLocaleTimeString('pt-BR')}</div>}
              </div>
              {mech.profile.phone && (
                <a href={`tel:${mech.profile.phone}`} className="btn-secondary !py-2 !px-3 shrink-0">📞</a>
              )}
            </div>
          )}

          {/* Preço */}
          {job && (
            <div className="flex items-center justify-between text-sm py-3 border-b border-steel-100">
              <span className="text-steel-500">R$ {job.price_per_hour?.toFixed(0)}/h · máx {job.max_hours}h</span>
              <span className="font-bold font-display">
                {finalPrice != null
                  ? <>R$ {finalPrice.toFixed(2)} <span className="text-xs text-signal-600 font-semibold">final</span></>
                  : <>até R$ {cap.toFixed(0)}</>
                }
              </span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mt-4 mb-3 bg-steel-100 rounded-xl p-1">
            {(['progresso', 'chat'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-1.5 text-sm font-semibold capitalize transition ${
                  tab === t ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'
                }`}
              >
                {t === 'chat' ? '💬 Chat' : '📋 Progresso'}
              </button>
            ))}
          </div>

          {/* Conteúdo da tab */}
          {tab === 'progresso' ? (
            <div className="flex flex-col flex-1">
              <div className="space-y-3">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`h-7 w-7 rounded-full grid place-items-center text-xs font-bold shrink-0 ${
                      s.done   ? 'bg-signal-500 text-white' :
                      s.active ? 'bg-brand-500 text-white animate-pulse-soft' :
                                 'bg-steel-200 text-steel-500'
                    }`}>
                      {s.done ? '✓' : i + 1}
                    </div>
                    <div className={`text-sm font-semibold ${
                      s.active ? 'text-brand-600' : s.done ? 'text-steel-700' : 'text-steel-400'
                    }`}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              {job?.status === 'completed' && !job.workshop_confirmed_at && (
                <div className="mt-auto pt-4 border-t border-steel-200 space-y-3">
                  {job.actual_hours != null && (
                    <div className="bg-signal-500/10 rounded-xl px-3 py-2 text-sm text-signal-700 font-semibold">
                      {job.actual_hours}h × R$ {job.price_per_hour}/h = R$ {(job.actual_hours * (job.price_per_hour ?? 0)).toFixed(2)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-steel-700 mb-2">
                      Avalie o mecânico para liberar o pagamento
                    </p>
                    <div className="flex gap-1 mb-3">
                      {[1,2,3,4,5].map(n => (
                        <button key={n} type="button"
                          onMouseEnter={() => setHovered(n)}
                          onMouseLeave={() => setHovered(0)}
                          onClick={() => setRating(n)}
                          className="text-2xl transition hover:scale-110">
                          {n <= (hovered || rating) ? '★' : '☆'}
                        </button>
                      ))}
                      {rating > 0 && (
                        <span className="ml-2 text-sm text-steel-500 self-center">
                          {['','Ruim','Regular','Bom','Ótimo','Excelente'][rating]}
                        </span>
                      )}
                    </div>
                    <textarea
                      className="input text-sm resize-none"
                      rows={2}
                      placeholder="Comentário opcional…"
                      value={ratingNote}
                      onChange={e => setRatingNote(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={confirmJob}
                    disabled={confirming || rating === 0}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {confirming ? '…' : rating === 0 ? 'Selecione uma avaliação' : 'Confirmar e liberar pagamento'}
                  </button>
                </div>
              )}

              {job?.status === 'completed' && job.workshop_confirmed_at && job.mechanic_rating && (
                <div className="mt-auto pt-4 border-t border-steel-100">
                  <div className="text-xs text-steel-400 mb-1">Sua avaliação do mecânico</div>
                  <div className="flex items-center gap-2">
                    <div className="text-brand-500 text-lg">{'★'.repeat(job.mechanic_rating)}{'☆'.repeat(5 - job.mechanic_rating)}</div>
                    <span className="text-sm font-semibold">{['','Ruim','Regular','Bom','Ótimo','Excelente'][job.mechanic_rating]}</span>
                  </div>
                  {job.mechanic_rating_note && <p className="text-xs text-steel-500 mt-1 italic">"{job.mechanic_rating_note}"</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 -mx-5 -mb-5">
              {id && <ChatBox jobId={id} otherName={mech?.profile.full_name ?? 'Mecânico'} />}
            </div>
          )}

        </aside>
      </div>

      {/* Modal PIX — aparece quando mecânico chega */}
      {showPixModal && (
        <div className="fixed inset-0 bg-steel-900/80 grid place-items-center p-4 z-50">
          <div className="card max-w-sm w-full space-y-5 border-2 border-brand-500">
            <div className="text-center">
              <div className="text-4xl mb-3">🔔</div>
              <h2 className="text-xl font-bold">Mecânico chegou!</h2>
              <p className="text-sm text-steel-500 mt-1">
                {mech?.profile.full_name ?? 'O mecânico'} está na oficina e aguardando o pagamento para iniciar.
              </p>
            </div>

            {/* Valor */}
            <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 text-center">
              <div className="text-xs text-brand-600 uppercase tracking-wider font-semibold mb-1">Valor a pagar (teto)</div>
              <div className="text-4xl font-bold font-display text-brand-700">R$ {cap.toFixed(2)}</div>
              <div className="text-xs text-brand-500 mt-1">
                {job?.price_per_hour?.toFixed(0)}/h × máx {job?.max_hours}h · cobrado pelo real ao final
              </div>
            </div>

            {/* Chave PIX */}
            <div className="bg-steel-50 rounded-2xl p-4 space-y-2">
              <div className="text-xs text-steel-500 uppercase tracking-wider font-semibold">Chave PIX (Telefone)</div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold font-display text-lg tracking-widest">{PIX_KEY}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(PIX_KEY)}
                  className="btn-secondary !py-1.5 !px-3 text-xs shrink-0"
                >
                  Copiar
                </button>
              </div>
              <div className="text-xs text-steel-400">{PIX_NAME}</div>
            </div>

            <p className="text-xs text-steel-400 text-center">
              Após realizar o PIX, clique em confirmar para liberar o mecânico iniciar o serviço.
            </p>

            <button
              onClick={confirmPixPayment}
              disabled={payingPix}
              className="btn-primary w-full btn-lg"
            >
              {payingPix ? 'Confirmando…' : '✅ Confirmei o pagamento PIX'}
            </button>
          </div>
        </div>
      )}
    </WorkshopLayout>
  );
}
