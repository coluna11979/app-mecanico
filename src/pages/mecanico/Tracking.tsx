import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useGeoBroadcast } from '@/hooks/useGeoBroadcast';
import MapView from '@/components/maps/MapView';
import { ChatBox } from '@/components/chat/ChatBox';
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
  const [hoursModal, setHoursModal] = useState(false);
  const [actualHours, setActualHours] = useState('');

  useEffect(() => { if (id && user) load(); }, [id, user]);

  async function load() {
    const { data: m } = await supabase.from('mechanics').select('id').eq('profile_id', user!.id).maybeSingle();
    setMechanicId(m?.id ?? null);
    const { data: j } = await supabase.from('jobs').select('*').eq('id', id).maybeSingle();
    setJob(j as Job);
    if (j?.workshop_id) {
      const { data: w } = await supabase.from('workshops').select('*').eq('id', j.workshop_id).maybeSingle();
      setShop(w as Workshop);
    }
  }

  // Realtime — detecta quando oficina confirma PIX (pix_paid_at) ou status muda
  useEffect(() => {
    if (!id) return;
    const ch = supabase.channel(`job:${id}:mecanico`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `id=eq.${id}` },
        payload => setJob(payload.new as Job))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  useGeoBroadcast({
    enabled: !!job && (job.status === 'assigned' || job.status === 'in_progress'),
    jobId: job?.id ?? null,
    mechanicId,
  });

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
      status:       'completed',
      completed_at: new Date().toISOString(),
      actual_hours: hours,
      price:        finalPrice,
    }).eq('id', job.id);
    setBusy(false);
    nav('/mecanico/dashboard');
  }

  const arrived   = !!job?.arrived_at;
  const pixPaid   = !!job?.pix_paid_at;
  const cap       = (job?.price_per_hour ?? 0) * (job?.max_hours ?? 1);
  const center: [number, number] = shop?.lat && shop?.lng ? [shop.lat, shop.lng] : [-23.55, -46.63];

  return (
    <div className="dark fixed inset-0 bg-steel-900 text-steel-100 flex flex-col">

      {/* Topo */}
      <div className="absolute top-3 left-3 right-3 z-10 flex justify-between items-start">
        <button onClick={() => nav('/mecanico/dashboard')} className="bg-steel-900/90 backdrop-blur rounded-full px-4 py-2 text-sm font-semibold">
          ← Sair
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChatOpen(o => !o)}
            className="bg-steel-800/90 backdrop-blur rounded-full px-4 py-2 text-sm font-semibold flex items-center gap-2 border border-steel-700"
          >
            💬 Chat
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
          center={center}
          zoom={14}
          markers={shop?.lat && shop?.lng ? [{ id: 'shop', lat: shop.lat, lng: shop.lng, label: '🏭', color: '#0B1117' }] : []}
        />
      </div>

      {/* Painel inferior */}
      <div className="bg-steel-800 border-t border-steel-700 p-5">
        {shop && (
          <>
            <div className="text-xs text-brand-500 uppercase tracking-wider font-bold">
              {job?.status === 'in_progress' ? 'Em serviço' : arrived && !pixPaid ? 'Aguardando PIX' : 'Indo para'}
            </div>
            <div className="font-bold text-xl mt-0.5">{shop.business_name}</div>
            <div className="text-sm text-steel-400">{shop.address}, {shop.city}</div>
            <div className="text-xs text-steel-500 mt-1">
              R$ {job?.price_per_hour?.toFixed(0) ?? '—'}/h · máx {job?.max_hours ?? '—'}h · até R$ {cap.toFixed(0)}
            </div>
          </>
        )}

        {/* Estados do botão */}
        {job?.status === 'assigned' && !arrived && (
          <button onClick={confirmArrival} disabled={busy} className="btn-primary btn-lg w-full mt-4">
            {busy ? '…' : '📍 Confirmar chegada'}
          </button>
        )}

        {job?.status === 'assigned' && arrived && !pixPaid && (
          <div className="mt-4 bg-pending-500/10 border border-pending-500/30 rounded-2xl px-4 py-3 text-center">
            <div className="text-pending-400 font-semibold text-sm">⏳ Aguardando pagamento PIX da oficina…</div>
            <div className="text-xs text-steel-500 mt-1">A oficina foi notificada. Assim que confirmar o PIX você poderá iniciar.</div>
          </div>
        )}

        {job?.status === 'assigned' && arrived && pixPaid && (
          <button onClick={startJob} disabled={busy} className="btn-primary btn-lg w-full mt-4 !bg-signal-500">
            {busy ? '…' : '✅ Iniciar serviço'}
          </button>
        )}

        {job?.status === 'in_progress' && (
          <button onClick={() => setHoursModal(true)} className="btn-primary btn-lg w-full mt-4 !bg-signal-500">
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
                  <span className="text-signal-400 font-bold text-lg">R$ {(Number(actualHours) * (job?.price_per_hour ?? 0)).toFixed(2)}</span>
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
            <ChatBox jobId={id} otherName={shop?.business_name ?? 'Oficina'} dark />
          </div>
        </div>
      )}
    </div>
  );
}
