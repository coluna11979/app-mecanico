import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MapView from '@/components/maps/MapView';
import { ChatBox } from '@/components/chat/ChatBox';
import { supabase } from '@/lib/supabase';
import { getSetting } from '@/lib/settings';
import { getPublicStripeConfig } from '@/lib/stripeConfig';
import { useMechanicLive } from '@/hooks/useMechanicLive';
import { useMessages } from '@/hooks/useMessages';
import { attachAutoUnlock } from '@/lib/alertSound';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, Mechanic, Profile, Workshop } from '@/types/database';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type Step     = { label: string; done: boolean; active: boolean };
type Tab      = 'progresso' | 'chat';
type PayMethod = 'card' | 'pix';

/* Haversine ETA */
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
function etaLabel(km: number) {
  const mins = Math.round((km / 30) * 60);
  if (mins < 1)  return 'Chegando!';
  if (mins < 60) return `~${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `~${h}h${m > 0 ? ` ${m}min` : ''}`;
}

export default function WorkshopTracking() {
  const { id } = useParams();
  const [job, setJob]               = useState<Job | null>(null);
  const [shop, setShop]             = useState<Workshop | null>(null);
  const [mech, setMech]             = useState<(Mechanic & { profile: Profile }) | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [tab, setTab]               = useState<Tab>('progresso');

  /* Método de pagamento: cartão (padrão) ou PIX */
  const [payMethod, setPayMethod]   = useState<PayMethod>('card');

  /* Stripe PIX */
  const [pixLoading, setPixLoading] = useState(false);
  const [pixCode, setPixCode]       = useState<string | null>(null);
  const [pixQrUrl, setPixQrUrl]     = useState<string | null>(null);
  const [pixExpires, setPixExpires] = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);

  /* Stripe Cartão */
  const [stripe, setStripe]             = useState<any>(null);
  const [cardSecret, setCardSecret]     = useState<string | null>(null);
  const [cardElReady, setCardElReady]   = useState(false);
  const [cardLoading, setCardLoading]   = useState(false);
  const [cardProcessing, setCardProcessing] = useState(false);
  const [cardError, setCardError]       = useState<string | null>(null);
  const [cardSuccess, setCardSuccess]   = useState(false);
  const cardDivRef  = useRef<HTMLDivElement>(null);
  const cardElRef   = useRef<any>(null);

  /* Misc */
  const [rating, setRating]         = useState(0);
  const [ratingNote, setRatingNote] = useState('');
  const [hovered, setHovered]       = useState(0);
  const [routeCoords, setRouteCoords] = useState<[number, number][] | null>(null);
  const [sheetOpen, setSheetOpen]   = useState(false);
  const [toast, setToast]           = useState<string | null>(null);
  const lastRouteFetch = useRef<{ lat: number; lng: number } | null>(null);
  const prevStatusRef  = useRef<string | null>(null);

  /* Cancelamento */
  const [cancelOpen, setCancelOpen]     = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling]     = useState(false);
  const [cancelError, setCancelError]   = useState<string | null>(null);

  /* ── Chat — subscription vive aqui (fora de qualquer condicional) ── */
  const { user } = useAuth();
  const messages    = useMessages(id, user?.id);
  const [chatSeen, setChatSeen] = useState(0);
  // Mensagens não lidas: só conta quando a aba chat não está visível
  const chatUnread  = (tab !== 'chat' || !sheetOpen) ? Math.max(0, messages.length - chatSeen) : 0;

  /* Destrava áudio na primeira interação do usuário */
  useEffect(() => { attachAutoUnlock(); }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 6000);
  }

  /* Carrega Stripe.js — tenta env var primeiro, depois app_settings */
  useEffect(() => {
    (async () => {
      const cfg = await getPublicStripeConfig();
      const envKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string;
      const key = cfg.publishable_key || envKey || await getSetting('stripe_publishable_key', '');
      if (!key) return;
      const { loadStripe } = await import('@stripe/stripe-js');
      const s = await loadStripe(key);
      setStripe(s);
    })();
  }, []);

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

  /* Realtime — status do job */
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`job:${id}:oficina`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${id}` },
        payload => setJob(payload.new as Job))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  /* Polling fallback — garante atualização mesmo se realtime cair */
  useEffect(() => {
    if (!id) return;
    const poll = setInterval(async () => {
      const { data } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
      if (data) setJob(data as Job);
    }, 5000);
    return () => clearInterval(poll);
  }, [id]);

  /* Detecta mudanças de status e dispara toast.
     ALÉM disso, no PRIMEIRO load abre o sheet automaticamente se há ação pendente
     do usuário (pagamento ou avaliação) — evita o cenário onde a oficina entra na
     tracking depois do mecânico finalizar e não enxerga a UI de avaliação. */
  useEffect(() => {
    if (!job) return;
    const prev = prevStatusRef.current;

    // Primeiro load: detecta ação pendente e abre o sheet
    if (prev === null) {
      const needsAction =
        (job.status === 'completed' && !job.workshop_confirmed_at) ||                  // precisa avaliar
        (!!job.arrived_at && !job.pix_paid_at && job.status === 'assigned');           // precisa pagar
      if (needsAction) {
        setSheetOpen(true);
        setTab('progresso'); // garante que o usuário enxerga a UI de avaliação/pagamento
      }
      prevStatusRef.current = job.status;
      return;
    }

    prevStatusRef.current = job.status;

    if (prev !== 'in_progress' && job.status === 'in_progress') {
      setSheetOpen(true);
      setTab('progresso');
      showToast('💳 Pagamento confirmado! Mecânico iniciando o serviço.');
    }
    if (prev !== 'completed' && job.status === 'completed') {
      setSheetOpen(true);
      setTab('progresso');
      showToast('🔔 Mecânico finalizou o serviço! Confirme a conclusão.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, job?.workshop_confirmed_at, job?.arrived_at, job?.pix_paid_at]);

  const live = useMechanicLive(mech?.id ?? null, id);

  /* Remove rota quando mecânico chegou */
  useEffect(() => {
    if (job?.arrived_at || job?.status === 'in_progress' || job?.status === 'completed') {
      setRouteCoords(null);
    }
  }, [job?.arrived_at, job?.status]);

  /* Busca rota Mapbox Directions */
  useEffect(() => {
    if (!live || !shop?.lat || !shop?.lng) return;
    if (job?.arrived_at || job?.status !== 'assigned') return;

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

  /* ── PIX ── */
  async function loadPixPayment(jobId: string) {
    if (pixCode || pixLoading) return;
    setPixLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-pix-payment`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
          'apikey':        SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = await res.json();
      if (data.pix_code) {
        setPixCode(data.pix_code);
        setPixQrUrl(data.qr_url);
        setPixExpires(data.expires_at);
      }
    } catch { /* silencioso */ }
    setPixLoading(false);
  }

  function copyPix() {
    if (!pixCode) return;
    navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  /* ── Cartão ── */
  async function loadCardSecret(jobId: string) {
    if (cardSecret || cardLoading) return;
    setCardLoading(true);
    setCardError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-card-payment`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
          'apikey':        SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ job_id: jobId }),
      });
      const data = await res.json();
      if (data.client_secret) setCardSecret(data.client_secret);
      else setCardError(data.error ?? 'Erro ao preparar pagamento');
    } catch {
      setCardError('Erro de conexão. Tente novamente.');
    }
    setCardLoading(false);
  }

  /* Calcula se o modal de pagamento deve aparecer (precisa estar acima dos useEffects que dependem dele) */
  const cap          = (job?.price_per_hour ?? 0) * (job?.max_hours ?? 1);
  const showPixModal = !!job?.arrived_at && !job?.pix_paid_at && job?.status === 'assigned';

  /* ── Análise pré-cancelamento ── */
  const cancellation = (() => {
    if (!job) return null;
    if (job.status === 'completed' || job.status === 'cancelled') {
      return { allowed: false, reason: 'Demanda já encerrada.' };
    }
    if (job.status === 'in_progress') {
      return {
        allowed: false,
        reason: 'Serviço em andamento. Use o cancelamento bilateral em acordo com o mecânico (em breve).',
      };
    }
    const TOLERANCE_MS = 5 * 60 * 1000;
    const FEE_PCT = 0.30;
    const fee = Number((cap * FEE_PCT).toFixed(2));

    // Sem mecânico
    if (!job.mechanic_id || job.status === 'open') {
      return { allowed: true, scenario: 'open' as const, fee: 0, refund: 0,
        title: 'Cancelar demanda', message: 'Demanda ainda não foi aceita por um mecânico. Cancelamento sem custo.' };
    }
    // Mecânico aceitou, não chegou
    if (job.status === 'assigned' && !job.arrived_at) {
      const elapsed = Date.now() - new Date(job.created_at).getTime();
      if (elapsed <= TOLERANCE_MS) {
        return { allowed: true, scenario: 'tolerance' as const, fee: 0, refund: 0,
          title: 'Cancelar dentro da tolerância', message: 'Mecânico aceitou há menos de 5 minutos — cancelamento sem multa.' };
      }
      return { allowed: true, scenario: 'after_tolerance' as const, fee, refund: 0,
        title: `Cancelar com multa de R$ ${fee.toFixed(2)}`,
        message: `Mecânico aceitou há mais de 5 min. Multa de 30% (R$ ${fee.toFixed(2)}) ficará registrada como pendente.` };
    }
    // Chegou, não pago
    if (job.arrived_at && !job.pix_paid_at) {
      return { allowed: true, scenario: 'arrived_unpaid' as const, fee, refund: 0,
        title: `Cancelar com multa de R$ ${fee.toFixed(2)}`,
        message: `Mecânico já chegou. Multa de 30% (R$ ${fee.toFixed(2)}) ficará registrada como pendente.` };
    }
    // Pago, não iniciado
    if (job.pix_paid_at && job.status === 'assigned') {
      const refund = Number((cap - fee).toFixed(2));
      return { allowed: true, scenario: 'paid' as const, fee, refund,
        title: `Cancelar com estorno parcial`,
        message: `Pagamento já feito. Você receberá estorno de R$ ${refund.toFixed(2)} (70%) e a plataforma retém R$ ${fee.toFixed(2)} (30%) de multa.` };
    }
    return { allowed: false, reason: 'Estado inválido pra cancelamento.' };
  })();

  async function cancelJob() {
    if (!job || !cancelReason.trim() || !cancellation?.allowed) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const { data, error } = await supabase.functions.invoke('cancel-job', {
        body: {
          job_id: job.id,
          reason: cancelReason.trim(),
          cancelled_by: 'workshop',
        },
      });
      if (error || data?.error) {
        setCancelError(data?.error ?? error?.message ?? 'Erro ao cancelar');
        setCancelling(false);
        return;
      }
      setCancelling(false);
      setCancelOpen(false);
      // Realtime + polling vão atualizar o estado
    } catch (e: any) {
      setCancelError(e?.message ?? 'Erro de conexão');
      setCancelling(false);
    }
  }

  /* Monta o Stripe Card Element. O div agora está SEMPRE visível (sem display:none),
     então o Stripe consegue montar o iframe corretamente. */
  useEffect(() => {
    if (!stripe || !cardSecret || cardElRef.current) return;
    if (payMethod !== 'card') return; // só monta se a aba ativa for cartão
    if (!showPixModal) return;        // só monta se o modal está aberto

    let cancelled = false;

    const tryMount = () => {
      if (cancelled || cardElRef.current) return;
      if (!cardDivRef.current) {
        // Div ainda não no DOM — tenta de novo no próximo frame
        requestAnimationFrame(tryMount);
        return;
      }
      const elements = stripe.elements();
      const el = elements.create('card', {
        hidePostalCode: true,
        style: {
          base: {
            fontSize: '16px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: '#111827',
            '::placeholder': { color: '#9ca3af' },
            iconColor: '#6b7280',
          },
          invalid: { color: '#ef4444', iconColor: '#ef4444' },
        },
      });
      el.mount(cardDivRef.current);
      el.on('ready', () => { if (!cancelled) setCardElReady(true); });
      cardElRef.current = el;
    };

    // requestAnimationFrame garante que o React já comitou o DOM antes de montar
    requestAnimationFrame(tryMount);

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe, cardSecret, payMethod, showPixModal]);

  /* Cleanup: desmonta o Stripe Element quando o modal fecha */
  useEffect(() => {
    if (!showPixModal && cardElRef.current) {
      try { cardElRef.current.unmount(); } catch { /* ignora */ }
      cardElRef.current = null;
      setCardElReady(false);
    }
  }, [showPixModal]);

  async function payWithCard() {
    if (!stripe || !cardElRef.current || !cardSecret) return;
    setCardProcessing(true);
    setCardError(null);
    const { error, paymentIntent } = await stripe.confirmCardPayment(cardSecret, {
      payment_method: { card: cardElRef.current },
    });
    if (error) {
      setCardError(error.message ?? 'Erro no pagamento. Verifique os dados do cartão.');
      setCardProcessing(false);
    } else if (paymentIntent?.status === 'succeeded') {
      setCardSuccess(true);
      setCardProcessing(false);
    }
  }

  /* Dispara carregamento conforme método selecionado */
  useEffect(() => {
    if (!showPixModal || !job?.id) return;
    if (payMethod === 'card') loadCardSecret(job.id);
    if (payMethod === 'pix')  loadPixPayment(job.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPixModal, job?.id, payMethod]);

  /** Confirma a conclusão do serviço (sem rating obrigatório) */
  async function confirmJob() {
    if (!job) return;
    setConfirming(true);
    await supabase.from('jobs').update({
      workshop_confirmed_at: new Date().toISOString(),
    }).eq('id', job.id);
    setConfirming(false);
  }

  /** Envia a avaliação do mecânico (opcional, feita depois) */
  async function submitRating() {
    if (!job || rating === 0) return;
    setConfirming(true);
    await supabase.from('jobs').update({
      mechanic_rating:      rating,
      mechanic_rating_note: ratingNote.trim() || null,
    }).eq('id', job.id);
    setConfirming(false);
    setRating(0);
    setRatingNote('');
  }

  const steps: Step[] = (() => {
    const s = job?.status ?? 'open';
    const arrived = !!job?.arrived_at;
    const pixPaid = !!job?.pix_paid_at;
    const started = !!job?.started_at;
    return [
      { label: 'Contratado',          done: true,                                                    active: false },
      { label: 'A caminho',           done: arrived || ['in_progress','completed'].includes(s),       active: s === 'assigned' && !arrived },
      { label: 'Chegou — pagamento',  done: pixPaid,                                                 active: arrived && !pixPaid },
      { label: 'Aguardando início',   done: started || s === 'completed',                            active: pixPaid && !started && s === 'assigned' },
      { label: 'Em serviço',          done: s === 'completed',                                        active: s === 'in_progress' },
      { label: 'Aguardando confirmação', done: !!job?.workshop_confirmed_at,                          active: s === 'completed' && !job?.workshop_confirmed_at },
    ];
  })();

  /* ETA */
  const km = live && shop?.lat && shop?.lng
    ? distKm(live.lat, live.lng, shop.lat, shop.lng)
    : null;
  const eta = km !== null && !job?.arrived_at && job?.status === 'assigned' ? etaLabel(km) : null;

  /* Centro dinâmico */
  const mapCenter: [number, number] =
    live && shop?.lat && shop?.lng
      ? [(live.lat + shop.lat) / 2, (live.lng + shop.lng) / 2]
      : shop?.lat && shop?.lng
        ? [shop.lat, shop.lng]
        : live
          ? [live.lat, live.lng]
          : [-23.55, -46.63];

  const mapZoom = km !== null && km > 5 ? 11 : km !== null && km > 2 ? 12 : 13;

  /* ── RENDER ── */
  return (
    <div className="fixed inset-0 flex flex-col bg-steel-900">

      {/* ── Toast de notificação ── */}
      {toast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-brand-600 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-xl max-w-xs text-center">
          {toast}
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between gap-2 p-3">
        <Link
          to="/oficina/dashboard"
          className="bg-white/90 backdrop-blur rounded-full px-4 py-2 text-sm font-semibold text-steel-800 shadow"
        >
          ← Voltar
        </Link>

        <div className="flex-1 min-w-0 mx-2">
          <div className="bg-white/90 backdrop-blur rounded-2xl px-3 py-1.5 shadow text-center truncate">
            <span className="text-sm font-bold text-steel-800 truncate">{job?.title ?? 'Carregando…'}</span>
          </div>
        </div>

        {eta && (
          <div className="bg-steel-900/90 backdrop-blur border border-steel-700 rounded-2xl px-3 py-1.5 text-center shadow-xl shrink-0">
            <div className="text-[9px] text-brand-400 font-bold uppercase tracking-wider">ETA</div>
            <div className="text-lg font-bold text-white leading-none">{eta}</div>
            {km !== null && <div className="text-[10px] text-steel-400">{km.toFixed(1)} km</div>}
          </div>
        )}
      </div>

      {/* ── Mapa ── */}
      <div className="flex-1">
        <MapView
          center={mapCenter}
          zoom={mapZoom}
          followMechanic={false}
          liveMechanic={live ? { lat: live.lat, lng: live.lng } : undefined}
          routeCoords={routeCoords ?? undefined}
          markers={shop?.lat && shop?.lng
            ? [{ id: 'shop', lat: shop.lat, lng: shop.lng, label: '🏭', color: '#0B1117' }]
            : []}
          styleUrl="mapbox://styles/mapbox/streets-v12"
        />
      </div>

      {/* ── Painel inferior (bottom sheet) ── */}
      <div className="bg-white border-t border-steel-200 shadow-2xl z-10">

        <button
          onClick={() => {
            setSheetOpen(o => {
              const next = !o;
              if (next && tab === 'chat') setChatSeen(messages.length);
              return next;
            });
          }}
          className="w-full flex flex-col items-center pt-2 pb-1 touch-manipulation"
          aria-label="Expandir painel"
        >
          <div className="w-10 h-1 rounded-full bg-steel-300 mb-2" />
          <div className="flex items-center justify-between w-full px-4 pb-2">
            {mech ? (
              <div className="flex items-center gap-2 min-w-0">
                <div className="h-9 w-9 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-sm shrink-0">
                  {mech.profile.full_name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{mech.profile.full_name}</div>
                  <div className="text-xs text-steel-500">★ {mech.rating.toFixed(1)} · {mech.total_jobs} jobs</div>
                </div>
              </div>
            ) : (
              <div className="text-sm font-semibold text-steel-600">{job?.title ?? 'Carregando…'}</div>
            )}

            <div className="flex items-center gap-2 shrink-0 ml-2">
              {mech?.profile.phone && (
                <a href={`tel:${mech.profile.phone}`}
                  className="h-9 w-9 rounded-full bg-steel-100 grid place-items-center text-lg"
                  onClick={e => e.stopPropagation()}>
                  📞
                </a>
              )}
              <span className="text-steel-400 text-lg">{sheetOpen ? '▼' : '▲'}</span>
            </div>
          </div>
        </button>

        {sheetOpen && (
          <div className="px-4 pb-4 space-y-4 max-h-[60vh] overflow-y-auto">

            {job && (
              <div className="flex items-center justify-between text-sm py-2 border-b border-steel-100">
                <span className="text-steel-500">{job.max_hours}h × R$ {job.price_per_hour?.toFixed(0)}/h</span>
                <span className="font-bold text-signal-600">R$ {cap.toFixed(2)} fechado</span>
              </div>
            )}

            {live && (
              <div className="text-xs text-steel-400 text-right -mt-2">
                Pos. atualizada {new Date(live.at).toLocaleTimeString('pt-BR')}
              </div>
            )}

            <div className="flex gap-1 bg-steel-100 rounded-xl p-1">
              {(['progresso', 'chat'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    if (t === 'chat') setChatSeen(messages.length);
                  }}
                  className={`relative flex-1 rounded-lg py-1.5 text-sm font-semibold capitalize transition touch-manipulation ${
                    tab === t ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'
                  }`}
                >
                  {t === 'chat' ? '💬 Chat' : '📋 Progresso'}
                  {t === 'chat' && chatUnread > 0 && (
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-brand-500 text-white text-[10px] font-bold grid place-items-center leading-none">
                      {chatUnread > 9 ? '9+' : chatUnread}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {tab === 'progresso' ? (
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

                {/* Step 1 — Confirmação simples (sem rating obrigatório) */}
                {job?.status === 'completed' && !job.workshop_confirmed_at && (
                  <div className="pt-3 border-t border-steel-200 space-y-3">
                    <div className="bg-signal-500/10 rounded-xl px-3 py-2 text-sm text-signal-700 font-semibold flex items-center justify-between">
                      <span>✅ Mecânico finalizou o serviço</span>
                      {job.actual_hours != null && (
                        <span className="text-xs text-signal-600 font-normal">
                          ⏱ {job.actual_hours}h reais
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-steel-600 leading-relaxed">
                      Confirme que o serviço foi concluído. Você poderá avaliar o mecânico depois, no seu tempo.
                    </p>
                    <button
                      onClick={confirmJob}
                      disabled={confirming}
                      className="btn-primary w-full disabled:opacity-50 touch-manipulation"
                    >
                      {confirming ? '…' : '✅ Confirmar conclusão'}
                    </button>
                  </div>
                )}

                {/* Step 2 — Avaliação opcional (após confirmação, sem pressa) */}
                {job?.status === 'completed' && job.workshop_confirmed_at && !job.mechanic_rating && (
                  <div className="pt-3 border-t border-steel-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-steel-700">⭐ Avaliar o mecânico</p>
                      <span className="text-[10px] text-steel-400 uppercase tracking-wider font-bold">opcional</span>
                    </div>
                    <p className="text-xs text-steel-500">
                      Sua avaliação ajuda outros mecânicos e mantém a qualidade da plataforma.
                    </p>
                    <div className="flex gap-1">
                      {[1,2,3,4,5].map(n => (
                        <button key={n} type="button"
                          onMouseEnter={() => setHovered(n)}
                          onMouseLeave={() => setHovered(0)}
                          onClick={() => setRating(n)}
                          className="text-2xl transition hover:scale-110 touch-manipulation">
                          {n <= (hovered || rating) ? '★' : '☆'}
                        </button>
                      ))}
                      {rating > 0 && (
                        <span className="ml-2 text-sm text-steel-500 self-center">
                          {['','Ruim','Regular','Bom','Ótimo','Excelente'][rating]}
                        </span>
                      )}
                    </div>
                    {rating > 0 && (
                      <>
                        <textarea
                          className="input text-sm resize-none"
                          rows={2}
                          placeholder="Comentário (opcional)…"
                          value={ratingNote}
                          onChange={e => setRatingNote(e.target.value)}
                        />
                        <button
                          onClick={submitRating}
                          disabled={confirming}
                          className="btn-primary w-full disabled:opacity-50 touch-manipulation"
                        >
                          {confirming ? '…' : 'Enviar avaliação'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Step 3 — Avaliação já feita (visualização) */}
                {job?.status === 'completed' && job.mechanic_rating && (
                  <div className="pt-3 border-t border-steel-100">
                    <div className="text-xs text-steel-400 mb-1">Sua avaliação do mecânico</div>
                    <div className="flex items-center gap-2">
                      <div className="text-brand-500 text-lg">{'★'.repeat(job.mechanic_rating)}{'☆'.repeat(5 - job.mechanic_rating)}</div>
                      <span className="text-sm font-semibold">{['','Ruim','Regular','Bom','Ótimo','Excelente'][job.mechanic_rating]}</span>
                    </div>
                    {job.mechanic_rating_note && <p className="text-xs text-steel-500 mt-1 italic">"{job.mechanic_rating_note}"</p>}
                  </div>
                )}

                {/* Botão Cancelar Demanda */}
                {cancellation?.allowed && job?.status !== 'cancelled' && job?.status !== 'completed' && (
                  <div className="pt-3 border-t border-steel-200">
                    <button
                      onClick={() => { setCancelOpen(true); setCancelReason(''); setCancelError(null); }}
                      className="w-full text-sm text-alert-600 font-semibold hover:bg-alert-500/5 rounded-xl py-2.5 border border-alert-200 hover:border-alert-300 transition"
                    >
                      🚫 Cancelar demanda
                    </button>
                  </div>
                )}

                {/* Estado: cancelado */}
                {job?.status === 'cancelled' && (
                  <div className="pt-3 border-t border-steel-200 bg-steel-50 rounded-xl p-3 -mx-1">
                    <div className="flex items-center gap-2 text-sm font-bold text-alert-700">
                      <span>🚫</span>
                      <span>Demanda cancelada</span>
                    </div>
                    {job.cancellation_reason && (
                      <p className="text-xs text-steel-600 mt-1 italic">"{job.cancellation_reason}"</p>
                    )}
                    {job.cancellation_fee != null && Number(job.cancellation_fee) > 0 && (
                      <p className="text-xs text-pending-700 mt-1">
                        Multa registrada: R$ {Number(job.cancellation_fee).toFixed(2)}
                      </p>
                    )}
                    {job.cancellation_refund != null && Number(job.cancellation_refund) > 0 && (
                      <p className="text-xs text-signal-600 mt-1">
                        Estorno aplicado: R$ {Number(job.cancellation_refund).toFixed(2)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-64">
                {id && (
                  <ChatBox
                    jobId={id}
                    otherName={mech?.profile.full_name ?? 'Mecânico'}
                    messages={messages}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          Modal de Cancelamento
      ══════════════════════════════════════════ */}
      {cancelOpen && cancellation?.allowed && (
        <div
          className="fixed inset-0 bg-steel-900/80 grid place-items-center p-4 z-[60]"
          onClick={() => !cancelling && setCancelOpen(false)}
        >
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0">🚫</span>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-steel-900">{cancellation.title}</h3>
                <p className="text-sm text-steel-600 mt-1 leading-relaxed">{cancellation.message}</p>
              </div>
            </div>

            {(cancellation.fee ?? 0) > 0 && (
              <div className="bg-pending-500/10 border border-pending-300 rounded-xl px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-steel-700">Valor original</span>
                  <span className="font-semibold">R$ {cap.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-alert-700 font-semibold mt-1">
                  <span>Multa de cancelamento (30%)</span>
                  <span>− R$ {(cancellation.fee ?? 0).toFixed(2)}</span>
                </div>
                {(cancellation.refund ?? 0) > 0 && (
                  <div className="flex items-center justify-between text-signal-700 font-bold mt-2 pt-2 border-t border-pending-300">
                    <span>Você recebe (estorno)</span>
                    <span>R$ {(cancellation.refund ?? 0).toFixed(2)}</span>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-steel-500 uppercase tracking-wider mb-1 block">
                Motivo do cancelamento *
              </label>
              <textarea
                className="input text-sm resize-none"
                rows={3}
                placeholder="Ex.: cliente cancelou, engano na publicação, etc."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                disabled={cancelling}
                autoFocus
              />
            </div>

            {cancelError && (
              <div className="text-sm text-alert-700 bg-alert-50 rounded-lg px-3 py-2">
                ⚠️ {cancelError}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setCancelOpen(false)}
                disabled={cancelling}
                className="btn-ghost flex-1"
              >
                Voltar
              </button>
              <button
                onClick={cancelJob}
                disabled={cancelling || !cancelReason.trim()}
                className="btn-ghost flex-1 border border-alert-500 text-alert-700 disabled:opacity-50"
              >
                {cancelling ? 'Cancelando…' : 'Confirmar cancelamento'}
              </button>
            </div>

            <p className="text-[11px] text-steel-400 text-center pt-1">
              Cancelamentos repetidos podem afetar a reputação da sua oficina.
            </p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          Modal de Pagamento (aparece quando mecânico chega)
      ══════════════════════════════════════════ */}
      {showPixModal && (
        <div className="fixed inset-0 bg-steel-900/85 grid place-items-end sm:place-items-center p-0 sm:p-4 z-50">
          <div className="card w-full sm:max-w-md border-2 border-brand-500 rounded-t-3xl sm:rounded-2xl rounded-b-none sm:rounded-b-2xl max-h-[95vh] overflow-y-auto">

            {/* Header */}
            <div className="text-center pt-2 pb-1">
              <div className="text-4xl mb-2">🔔</div>
              <h2 className="text-xl font-bold">Mecânico chegou!</h2>
              <p className="text-sm text-steel-500 mt-1">
                {mech?.profile.full_name ?? 'O mecânico'} está aguardando o pagamento para iniciar.
              </p>
            </div>

            {/* Valor */}
            <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 text-center">
              <div className="text-xs text-brand-600 uppercase tracking-widest font-bold mb-1">Valor a pagar</div>
              <div className="text-4xl font-bold font-display text-brand-700">R$ {cap.toFixed(2)}</div>
              <div className="text-xs text-brand-500 mt-1">
                Pacote fechado · {job?.max_hours}h × R$ {job?.price_per_hour?.toFixed(0)}/h
              </div>
              <div className="text-[11px] text-steel-500 mt-1">
                Valor não muda se o mecânico terminar antes ou levar mais tempo
              </div>
            </div>

            {/* Abas de método de pagamento */}
            <div className="flex gap-1 bg-steel-100 rounded-2xl p-1">
              <button
                onClick={() => setPayMethod('card')}
                className={`flex-1 rounded-xl py-2 text-sm font-bold transition ${
                  payMethod === 'card'
                    ? 'bg-white shadow text-steel-900'
                    : 'text-steel-500 hover:text-steel-700'
                }`}
              >
                💳 Cartão
              </button>
              <button
                disabled
                title="PIX em breve — em fase de aprovação no Stripe"
                className="flex-1 rounded-xl py-2 text-sm font-bold text-steel-400 cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <span>PIX</span>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-steel-200 text-steel-600 rounded-full px-1.5 py-0.5">
                  Em breve
                </span>
              </button>
            </div>

            {/* ── CARTÃO ── */}
            {payMethod === 'card' && (
              <div className="space-y-4">
                {cardSuccess ? (
                  /* Sucesso */
                  <div className="bg-signal-500/10 rounded-2xl p-6 text-center space-y-2">
                    <div className="text-5xl">✅</div>
                    <p className="text-lg font-bold text-signal-700">Pagamento confirmado!</p>
                    <p className="text-sm text-signal-600">O serviço já pode ser iniciado.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Container do Stripe Card Element — SEMPRE visível pra não dar mount em display:none */}
                    <div>
                      <label className="text-xs font-bold text-steel-500 uppercase tracking-widest mb-2 block">
                        Dados do cartão
                      </label>
                      <div className="relative">
                        <div
                          ref={cardDivRef}
                          className="border border-steel-300 rounded-xl px-4 py-3.5 bg-white min-h-[52px] focus-within:border-brand-500 transition"
                        />
                        {/* Overlay de loading por cima — não esconde o div do Stripe */}
                        {(cardLoading || !cardElReady) && (
                          <div className="absolute inset-0 bg-white/95 rounded-xl flex items-center justify-center gap-3 pointer-events-none">
                            <div className="h-5 w-5 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
                            <p className="text-sm text-steel-500">Preparando pagamento seguro…</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {cardError && (
                      <p className="text-sm text-alert-600 bg-alert-50 rounded-xl px-3 py-2">
                        ⚠️ {cardError}
                      </p>
                    )}

                    <button
                      onClick={payWithCard}
                      disabled={cardProcessing || !cardElReady}
                      className="btn-primary w-full disabled:opacity-60 touch-manipulation"
                    >
                      {cardProcessing
                        ? <span className="flex items-center justify-center gap-2">
                            <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                            Processando…
                          </span>
                        : `Pagar R$ ${cap.toFixed(2)}`
                      }
                    </button>

                    {/* Selo de segurança */}
                    <div className="bg-steel-50 rounded-xl px-3 py-2 text-center">
                      <p className="text-[11px] text-steel-500">
                        🔒 Pagamento seguro processado pela <strong>Stripe</strong>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── PIX ── */}
            {payMethod === 'pix' && (
              <div className="space-y-3">
                {pixLoading ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <div className="h-10 w-10 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
                    <p className="text-sm text-steel-500">Gerando PIX seguro…</p>
                  </div>
                ) : pixCode ? (
                  <>
                    {pixQrUrl && (
                      <div className="flex justify-center">
                        <div className="bg-white p-3 rounded-2xl shadow-sm border border-steel-100">
                          <img src={pixQrUrl} alt="QR Code PIX" className="w-48 h-48" />
                        </div>
                      </div>
                    )}
                    <div className="bg-steel-50 rounded-2xl p-4 space-y-2">
                      <div className="text-xs text-steel-500 uppercase tracking-widest font-bold">PIX Copia e Cola</div>
                      <div className="bg-white border border-steel-200 rounded-xl px-3 py-2">
                        <p className="text-[11px] text-steel-600 font-mono break-all leading-relaxed line-clamp-3">
                          {pixCode}
                        </p>
                      </div>
                      <button onClick={copyPix} className="btn-primary w-full !py-2.5 touch-manipulation">
                        {copied ? '✅ Copiado!' : '📋 Copiar código PIX'}
                      </button>
                    </div>
                    {pixExpires && (
                      <p className="text-xs text-steel-400 text-center">
                        ⏱ Expira em {new Date(pixExpires).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    <div className="bg-signal-500/10 rounded-2xl px-4 py-3 text-center">
                      <p className="text-sm font-semibold text-signal-700">✅ Pagamento confirmado automaticamente</p>
                      <p className="text-xs text-signal-600 mt-0.5">Assim que o PIX cair, o serviço inicia sozinho.</p>
                    </div>
                  </>
                ) : (
                  <div className="bg-steel-50 rounded-2xl p-4 text-center space-y-2">
                    <p className="text-sm text-steel-600">Não foi possível gerar o QR Code PIX.</p>
                    <p className="text-xs text-steel-400">Ative o PIX no Stripe Dashboard ou use cartão.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
