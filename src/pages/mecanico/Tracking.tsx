import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useGeoBroadcast } from '@/hooks/useGeoBroadcast';
import { getSetting } from '@/lib/settings';
import MapView from '@/components/maps/MapView';
import { ChatBox } from '@/components/chat/ChatBox';
import { useMessages } from '@/hooks/useMessages';
import { attachAutoUnlock } from '@/lib/alertSound';
import type { Job, Workshop } from '@/types/database';

/* ── Haversine distance in km ── */
function distKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function etaLabel(km: number): string {
  const mins = Math.round((km / 30) * 60);
  if (mins < 1)  return 'Chegando!';
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `~${h}h${m > 0 ? ` ${m}min` : ''}`;
}

export default function MechanicTracking() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const [job, setJob]               = useState<Job | null>(null);
  const [shop, setShop]             = useState<Workshop | null>(null);
  const [mechanicId, setMechanicId] = useState<string | null>(null);
  const [busy, setBusy]             = useState(false);
  const [chatOpen, setChatOpen]     = useState(false);
  const [hoursModal, setHoursModal] = useState(false);
  const [actualHours, setActualHours] = useState('');

  /* ── Chat — subscription vive aqui (fora de qualquer condicional) ── */
  const messages   = useMessages(id, user?.id);
  const [chatSeen, setChatSeen] = useState(0);
  const chatUnread = !chatOpen ? Math.max(0, messages.length - chatSeen) : 0;

  /* Destrava áudio na primeira interação do usuário */
  useEffect(() => { attachAutoUnlock(); }, []);

  /* ── Toast de notificação ── */
  const [toast, setToast]           = useState<string | null>(null);
  const prevStatusRef               = useRef<string | null>(null);
  const prevPixPaidRef              = useRef<boolean>(false);

  /* ── Posição GPS do mecânico ── */
  const [mechPos, setMechPos] = useState<{ lat: number; lng: number } | null>(null);
  const watchRef = useRef<number | null>(null);

  /* ── Rota Mapbox Directions ── */
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const lastRouteFetch = useRef<{ lat: number; lng: number } | null>(null);

  /* GPS watch */
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      p => setMechPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
    );
    return () => {
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  useEffect(() => { if (id && user) load(); }, [id, user]);

  async function load() {
    const { data: m } = await supabase.from('mechanics').select('id').eq('profile_id', user!.id).maybeSingle();
    setMechanicId(m?.id ?? null);
    const { data: j } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    setJob(prev => {
      // Define estado inicial dos refs sem disparar toast
      if (!prev && j) {
        prevStatusRef.current  = j.status;
        prevPixPaidRef.current = !!j.pix_paid_at;
      }
      return j as Job;
    });
    if (j?.workshop_id) {
      const { data: w } = await supabase.from('workshops').select('*').eq('id', j.workshop_id).maybeSingle();
      setShop(w as Workshop);
    }
  }

  /* ── Realtime: escuta mudanças no job ── */
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`job:${id}:mecanico`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${id}`,
      }, payload => setJob(payload.new as Job))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  /* ── Polling fallback: garante atualização mesmo se realtime cair ── */
  useEffect(() => {
    if (!id) return;
    const poll = setInterval(async () => {
      const { data } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
      if (data) setJob(data as Job);
    }, 5000);
    return () => clearInterval(poll);
  }, [id]);

  /* ── Detecta mudanças de status e dispara toast ── */
  useEffect(() => {
    if (!job) return;
    const prevStatus  = prevStatusRef.current;
    const prevPixPaid = prevPixPaidRef.current;

    // Atualiza refs
    prevStatusRef.current  = job.status;
    prevPixPaidRef.current = !!job.pix_paid_at;

    // Sem estado anterior = primeiro load, não notifica
    if (prevStatus === null) return;

    // Pagamento recebido → serviço liberado
    if (!prevPixPaid && job.pix_paid_at) {
      showToast('💳 Pagamento confirmado! O serviço foi iniciado.');
    }
    // Oficina confirmou / encerrou
    if (prevStatus !== 'completed' && job.status === 'completed') {
      showToast('✅ Serviço marcado como concluído.');
    }
  }, [job?.status, job?.pix_paid_at]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }

  useGeoBroadcast({
    enabled: !!job && (job.status === 'assigned' || job.status === 'in_progress'),
    jobId: job?.id ?? null,
    mechanicId,
  });

  /* Remove rota quando chegou */
  useEffect(() => {
    if (job?.arrived_at || job?.status === 'in_progress' || job?.status === 'completed') {
      setRouteCoords(null);
    }
  }, [job?.arrived_at, job?.status]);

  /* Busca rota Mapbox Directions */
  useEffect(() => {
    if (job?.status !== 'assigned' || job?.arrived_at) return;
    if (!mechPos || !shop?.lat || !shop?.lng) return;

    const prev = lastRouteFetch.current;
    if (prev) {
      const dlat = Math.abs(prev.lat - mechPos.lat);
      const dlng = Math.abs(prev.lng - mechPos.lng);
      if (dlat < 0.0003 && dlng < 0.0003) return;
    }
    lastRouteFetch.current = { lat: mechPos.lat, lng: mechPos.lng };

    (async () => {
      try {
        const token = await getSetting('mapbox_token', '');
        if (!token) return;
        const url =
          `https://api.mapbox.com/directions/v5/mapbox/driving/` +
          `${mechPos.lng},${mechPos.lat};${shop.lng},${shop.lat}` +
          `?geometries=geojson&overview=full&steps=false&access_token=${token}`;
        const res  = await fetch(url);
        const data = await res.json();
        const coords = data?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
        if (coords?.length) setRouteCoords(coords);
      } catch { /* silencioso */ }
    })();
  }, [mechPos, shop, job?.status, job?.arrived_at]);

  async function confirmArrival() {
    if (!job) return;
    setBusy(true);
    await supabase.from('jobs').update({ arrived_at: new Date().toISOString() }).eq('id', job.id);
    setBusy(false);
  }

  async function startJob() {
    if (!job) return;
    setBusy(true);
    await supabase.from('jobs').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', job.id);
    setBusy(false);
  }

  async function completeJob() {
    if (!job) return;
    const hours = Number(actualHours);
    if (!hours || hours <= 0) return;
    setBusy(true);
    const finalPrice = hours * (job.price_per_hour ?? 0);
    await supabase.from('jobs').update({
      status: 'completed', completed_at: new Date().toISOString(),
      actual_hours: hours, price: finalPrice,
    }).eq('id', job.id);
    setBusy(false);
    nav('/mecanico/dashboard');
  }

  const arrived = !!job?.arrived_at;
  const pixPaid = !!job?.pix_paid_at;
  const cap     = (job?.price_per_hour ?? 0) * (job?.max_hours ?? 1);

  const km = mechPos && shop?.lat && shop?.lng
    ? distKm(mechPos.lat, mechPos.lng, shop.lat, shop.lng)
    : null;
  const eta = km !== null ? etaLabel(km) : null;

  const mapCenter: [number, number] =
    mechPos && shop?.lat && shop?.lng
      ? [(mechPos.lat + shop.lat) / 2, (mechPos.lng + shop.lng) / 2]
      : shop?.lat && shop?.lng
        ? [shop.lat, shop.lng]
        : mechPos
          ? [mechPos.lat, mechPos.lng]
          : [-23.55, -46.63];

  const mapZoom = km !== null && km > 5 ? 11 : km !== null && km > 2 ? 12 : 13;

  return (
    <div className="dark fixed inset-0 bg-steel-900 text-steel-100 flex flex-col">

      {/* ── Toast de notificação ── */}
      {toast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-signal-500 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl max-w-xs text-center animate-fade-in">
          {toast}
        </div>
      )}

      {/* Topo */}
      <div className="absolute top-3 left-3 right-3 z-10 flex justify-between items-start gap-2">
        <button onClick={() => nav('/mecanico/dashboard')}
          className="bg-steel-900/90 backdrop-blur rounded-full px-4 py-2 text-sm font-semibold">
          ← Sair
        </button>

        {eta && !arrived && job?.status === 'assigned' && (
          <div className="bg-steel-900/95 backdrop-blur border border-steel-700 rounded-2xl px-4 py-2 text-center shadow-xl">
            <div className="text-[10px] text-brand-400 font-bold uppercase tracking-wider">Estimativa</div>
            <div className="text-2xl font-bold text-white leading-none mt-0.5">{eta}</div>
            {km !== null && <div className="text-[11px] text-steel-400 mt-0.5">{km.toFixed(1)} km</div>}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setChatOpen(o => {
                if (!o) setChatSeen(messages.length); // abrindo → marca como lido
                return !o;
              });
            }}
            className="relative bg-steel-800/90 backdrop-blur rounded-full px-4 py-2 text-sm font-semibold flex items-center gap-2 border border-steel-700"
          >
            💬 Chat
            {chatUnread > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-brand-500 text-white text-[10px] font-bold grid place-items-center leading-none">
                {chatUnread > 9 ? '9+' : chatUnread}
              </span>
            )}
          </button>
          <div className="bg-brand-500 text-white text-xs font-semibold rounded-full px-3 py-2 flex items-center gap-2 shadow-brand">
            <span className="h-2 w-2 rounded-full bg-white animate-pulse-soft" />
            📍 Ao vivo
          </div>
        </div>
      </div>

      {/* Mapa */}
      <div className="flex-1">
        <MapView
          center={mapCenter}
          zoom={mapZoom}
          liveMechanic={mechPos ?? undefined}
          routeCoords={routeCoords ?? undefined}
          markers={shop?.lat && shop?.lng
            ? [{ id: 'shop', lat: shop.lat, lng: shop.lng, label: '🏭', color: '#0B1117' }]
            : []}
          styleUrl="mapbox://styles/mapbox/streets-v12"
        />
      </div>

      {/* Painel inferior */}
      <div className="bg-steel-800 border-t border-steel-700 p-5 space-y-4">

        {shop && (
          <div>
            <div className="text-xs text-brand-400 uppercase tracking-wider font-bold mb-1">
              {job?.status === 'in_progress'
                ? '🔧 Em serviço'
                : arrived && !pixPaid
                  ? '⏳ Aguardando pagamento'
                  : arrived && pixPaid
                    ? '✅ Pagamento recebido'
                    : '🧭 Indo para'}
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-lg leading-tight">{shop.business_name}</div>
                <div className="text-sm text-steel-400">{shop.address}, {shop.city}</div>
              </div>
              {eta && !arrived && km !== null && (
                <div className="text-right shrink-0">
                  <div className="text-2xl font-bold text-brand-400 leading-none">{eta}</div>
                  <div className="text-xs text-steel-500">{km.toFixed(1)} km</div>
                </div>
              )}
            </div>
            <div className="text-xs text-steel-500 mt-1">
              R$ {job?.price_per_hour?.toFixed(0) ?? '—'}/h · máx {job?.max_hours ?? '—'}h · até R$ {cap.toFixed(0)}
            </div>
          </div>
        )}

        {/* Ações por estado */}
        {job?.status === 'assigned' && !arrived && (
          <button onClick={confirmArrival} disabled={busy} className="btn-primary btn-lg w-full">
            {busy ? '…' : '📍 Confirmar chegada'}
          </button>
        )}

        {job?.status === 'assigned' && arrived && !pixPaid && (
          <div className="bg-pending-500/10 border border-pending-500/30 rounded-2xl px-4 py-3 text-center space-y-1">
            <div className="text-pending-400 font-semibold text-sm">⏳ Aguardando pagamento da oficina…</div>
            <div className="text-xs text-steel-500">O serviço inicia automaticamente assim que o pagamento for confirmado.</div>
          </div>
        )}

        {job?.status === 'assigned' && arrived && pixPaid && (
          <button onClick={startJob} disabled={busy} className="btn-primary btn-lg w-full !bg-signal-500">
            {busy ? '…' : '✅ Iniciar serviço'}
          </button>
        )}

        {job?.status === 'in_progress' && (
          <button onClick={() => setHoursModal(true)} className="btn-primary btn-lg w-full !bg-signal-500">
            Finalizar serviço
          </button>
        )}
      </div>

      {/* Modal: horas reais */}
      {hoursModal && (
        <div className="absolute inset-0 z-30 bg-steel-900/95 flex flex-col items-center justify-center p-6">
          <div className="bg-steel-800 border border-steel-700 rounded-2xl p-6 w-full max-w-sm space-y-5">
            <div>
              <h3 className="text-xl font-bold">Finalizar serviço</h3>
              <p className="text-sm text-steel-400 mt-1">Informe as horas reais trabalhadas para calcular o valor final.</p>
            </div>

            <div>
              <label className="text-xs text-steel-400 uppercase tracking-wider">Horas trabalhadas</label>
              <div className="relative mt-1">
                <input
                  type="number" min={0.5} max={job?.max_hours ?? 24} step={0.5}
                  className="input !bg-steel-900 !text-white !border-steel-600 !pr-10 text-2xl font-bold"
                  placeholder="1.5"
                  value={actualHours}
                  onChange={e => setActualHours(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 font-semibold">h</span>
              </div>
              {actualHours && Number(actualHours) > 0 && (
                <div className="mt-2 text-center">
                  <span className="text-steel-400 text-sm">{actualHours}h × R$ {job?.price_per_hour?.toFixed(0)}/h = </span>
                  <span className="text-signal-400 font-bold text-lg">
                    R$ {(Number(actualHours) * (job?.price_per_hour ?? 0)).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setHoursModal(false)} className="btn-ghost flex-1">Cancelar</button>
              <button
                onClick={completeJob}
                disabled={busy || !actualHours || Number(actualHours) <= 0}
                className="btn-primary flex-1 !bg-signal-500"
              >
                {busy ? '…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat drawer */}
      {chatOpen && id && (
        <div className="absolute inset-0 z-20 flex flex-col bg-steel-900/95 backdrop-blur">
          <div className="flex items-center justify-between px-4 py-3 border-b border-steel-700">
            <div className="font-bold">Chat — {shop?.business_name ?? 'Oficina'}</div>
            <button onClick={() => setChatOpen(false)} className="text-steel-400 hover:text-white text-xl leading-none">✕</button>
          </div>
          <div className="flex-1 min-h-0">
            <ChatBox
              jobId={id}
              otherName={shop?.business_name ?? 'Oficina'}
              dark
              messages={messages}
            />
          </div>
        </div>
      )}
    </div>
  );
}
