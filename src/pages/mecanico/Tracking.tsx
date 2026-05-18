import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useGeoBroadcast } from '@/hooks/useGeoBroadcast';
import { getSetting } from '@/lib/settings';
import MapView from '@/components/maps/MapView';
import { ChatBox } from '@/components/chat/ChatBox';
import { useMessages } from '@/hooks/useMessages';
import { attachAutoUnlock, playJobAlert } from '@/lib/alertSound';
import { distKm, etaLabel } from '@/lib/geo';
import { mechanicNet } from '@/lib/payment';
import type { Job, Workshop } from '@/types/database';

export default function MechanicTracking() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const [job, setJob]               = useState<Job | null>(null);
  const [shop, setShop]             = useState<Workshop | null>(null);
  const [mechanicId, setMechanicId] = useState<string | null>(null);
  const [busy, setBusy]             = useState(false);
  const [chatOpen, setChatOpen]     = useState(false);

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
  const prevConfirmedRef            = useRef<boolean>(false);
  const [waitSecs, setWaitSecs]     = useState(0);

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

  /* ── Detecta confirmação da oficina (workshop_confirmed_at) e toca som ── */
  useEffect(() => {
    const wasConfirmed = prevConfirmedRef.current;
    const isConfirmed  = !!job?.workshop_confirmed_at;
    prevConfirmedRef.current = isConfirmed;
    if (!wasConfirmed && isConfirmed && job?.status === 'completed') {
      playJobAlert();
    }
  }, [job?.workshop_confirmed_at, job?.status]);

  /* ── Cronômetro da espera pós-finalização ── */
  useEffect(() => {
    if (job?.status !== 'completed' || job.workshop_confirmed_at) {
      setWaitSecs(0);
      return;
    }
    const start = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
    const tick = () => setWaitSecs(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [job?.status, job?.completed_at, job?.workshop_confirmed_at]);

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
    setBusy(true);
    const completedAt = new Date();
    // Calcula horas reais a partir do started_at — apenas pra métrica (não afeta preço)
    const startedAt = job.started_at ? new Date(job.started_at) : null;
    const actualHours = startedAt
      ? Math.max(0.1, +(((completedAt.getTime() - startedAt.getTime()) / 3_600_000)).toFixed(2))
      : null;
    // Preço é FECHADO — sempre price_per_hour × max_hours, independente do tempo real
    await supabase.from('jobs').update({
      status:       'completed',
      completed_at: completedAt.toISOString(),
      actual_hours: actualHours,
    }).eq('id', job.id);
    setBusy(false);
    // NÃO navega — fica na tela de espera até a oficina confirmar (realtime atualiza job)
  }

  function goBackToDashboard() {
    if (!job) { nav('/mecanico/dashboard'); return; }
    const net = mechanicNet((job.price_per_hour ?? 0) * (job.max_hours ?? 1));
    const state = job.workshop_confirmed_at
      ? { justEarned: { net, jobTitle: job.title } }
      : undefined;
    nav('/mecanico/dashboard', state ? { state } : undefined);
  }

  const arrived = !!job?.arrived_at;
  const pixPaid = !!job?.pix_paid_at;
  const grossCap = (job?.price_per_hour ?? 0) * (job?.max_hours ?? 1);
  const netCap   = mechanicNet(grossCap);

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
                    ? '✅ Pago — toque em Iniciar quando começar o trabalho'
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
              Pacote: {job?.max_hours ?? '—'}h previstas · <span className="text-signal-400 font-bold">você recebe R$ {netCap.toFixed(0)}</span>
            </div>
          </div>
        )}

        {/* Ações por estado */}
        {job?.status === 'assigned' && !arrived && (
          <div className="space-y-2">
            <button onClick={confirmArrival} disabled={busy} className="btn-primary btn-lg w-full">
              {busy ? '…' : '📍 Confirmar chegada'}
            </button>
            <button
              onClick={() => {
                const reason = prompt('Por que você precisa cancelar?\n(Cancelamentos repetidos afetam sua avaliação)');
                if (!reason || !reason.trim()) return;
                if (!confirm('Confirma o cancelamento?')) return;
                supabase.functions.invoke('cancel-job', {
                  body: { job_id: job.id, reason: reason.trim(), cancelled_by: 'mechanic' },
                }).then(({ data, error }) => {
                  if (error || data?.error) alert('Erro: ' + (data?.error ?? error?.message));
                  else nav('/mecanico/dashboard');
                });
              }}
              className="text-xs text-steel-500 hover:text-alert-600 w-full text-center py-1"
            >
              Não vou conseguir ir — cancelar
            </button>
          </div>
        )}

        {/* Estado: cancelado */}
        {job?.status === 'cancelled' && (
          <div className="bg-alert-500/10 border border-alert-500/30 rounded-2xl px-4 py-4 text-center space-y-1">
            <div className="text-alert-400 font-bold text-base">🚫 Demanda cancelada</div>
            {job.cancellation_reason && (
              <p className="text-xs text-steel-400 italic">"{job.cancellation_reason}"</p>
            )}
          </div>
        )}

        {job?.status === 'assigned' && arrived && !pixPaid && (
          <div className="bg-pending-500/10 border border-pending-500/30 rounded-2xl px-4 py-3 text-center space-y-1">
            <div className="text-pending-400 font-semibold text-sm">⏳ Aguardando pagamento da oficina…</div>
            <div className="text-xs text-steel-500">O serviço inicia automaticamente assim que o pagamento for confirmado.</div>
          </div>
        )}

        {job?.status === 'assigned' && arrived && pixPaid && (
          <div className="space-y-2">
            <div className="bg-signal-500/15 border border-signal-500/30 rounded-2xl px-4 py-3 text-center">
              <div className="text-signal-400 font-bold text-sm">✅ Pagamento confirmado</div>
              <div className="text-xs text-steel-400 mt-1">
                Toque em <strong>Iniciar serviço</strong> apenas quando começar o trabalho — o tempo é contabilizado a partir desse momento.
              </div>
            </div>
            <button onClick={startJob} disabled={busy} className="btn-primary btn-lg w-full !bg-signal-500 animate-pulse-soft">
              {busy ? '…' : '▶️ Iniciar serviço agora'}
            </button>
          </div>
        )}

        {job?.status === 'in_progress' && (
          <button onClick={completeJob} disabled={busy} className="btn-primary btn-lg w-full !bg-signal-500">
            {busy ? '…' : '✅ Finalizar serviço'}
          </button>
        )}

        {/* Estado: finalizado, aguardando confirmação da oficina */}
        {job?.status === 'completed' && !job.workshop_confirmed_at && (
          <div className="bg-pending-500/10 border border-pending-500/40 rounded-2xl p-4 space-y-3">
            <div className="text-center">
              <div className="text-3xl mb-1">⏳</div>
              <div className="text-pending-300 font-bold text-base">Aguardando confirmação da oficina</div>
              <div className="text-xs text-steel-400 mt-1">
                Notificação enviada — assim que confirmarem, seu PIX de <strong>R$ {netCap.toFixed(2)}</strong> é liberado.
              </div>
            </div>
            <div className="bg-steel-900/60 rounded-xl py-2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-steel-500 font-bold">aguardando há</div>
              <div className="font-display text-2xl text-pending-300 font-bold">
                {Math.floor(waitSecs / 60)}:{String(waitSecs % 60).padStart(2, '0')}
              </div>
            </div>
            <p className="text-[11px] text-steel-500 text-center px-2">
              💡 Aguarde aqui antes de sair da oficina — assim você confirma o pagamento na hora.
            </p>
            <button
              onClick={goBackToDashboard}
              className="btn-ghost w-full text-xs !text-steel-400 !border-steel-700"
            >
              Voltar ao dashboard mesmo assim
            </button>
          </div>
        )}

        {/* Estado: confirmado — repasse liberado */}
        {job?.status === 'completed' && job.workshop_confirmed_at && (
          <div className="bg-gradient-to-b from-signal-500/20 to-signal-500/5 border-2 border-signal-500/50 rounded-2xl p-5 space-y-3 animate-fade-in">
            <div className="text-center space-y-1">
              <div className="text-5xl">✅</div>
              <div className="text-signal-400 font-bold text-lg">Confirmado! Pode ir embora.</div>
              <div className="text-xs text-steel-300">Seu repasse foi liberado no PIX cadastrado.</div>
            </div>
            <div className="bg-steel-900/70 rounded-xl py-3 text-center border border-signal-500/30">
              <div className="text-[10px] uppercase tracking-wider text-steel-500 font-bold">Liberado</div>
              <div className="font-display text-3xl text-signal-400 font-bold">
                + R$ {netCap.toFixed(2).replace('.', ',')}
              </div>
            </div>
            <button onClick={goBackToDashboard} className="btn-primary btn-lg w-full !bg-signal-500">
              Voltar ao dashboard
            </button>
          </div>
        )}
      </div>

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
