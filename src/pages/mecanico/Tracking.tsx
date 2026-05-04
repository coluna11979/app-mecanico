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
  const [job, setJob]           = useState<Job | null>(null);
  const [shop, setShop]         = useState<Workshop | null>(null);
  const [mechanicId, setMechanicId] = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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

  useGeoBroadcast({
    enabled: !!job && (job.status === 'assigned' || job.status === 'in_progress'),
    jobId: job?.id ?? null,
    mechanicId,
  });

  async function confirmArrival() {
    if (!job) return;
    setBusy(true);
    await supabase.from('jobs').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', job.id);
    setJob({ ...job, status: 'in_progress' });
    setBusy(false);
  }

  async function completeJob() {
    if (!job) return;
    setBusy(true);
    await supabase.from('jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', job.id);
    setBusy(false);
    nav('/mecanico/dashboard');
  }

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

      {/* Painel inferior — info + ação */}
      <div className="bg-steel-800 border-t border-steel-700 p-5">
        {shop && (
          <>
            <div className="text-xs text-brand-500 uppercase tracking-wider font-bold">
              {job?.status === 'in_progress' ? 'Em serviço' : 'Indo para'}
            </div>
            <div className="font-bold text-xl mt-0.5">{shop.business_name}</div>
            <div className="text-sm text-steel-400">{shop.address}, {shop.city}</div>
          </>
        )}
        {job?.status === 'assigned' && (
          <button onClick={confirmArrival} disabled={busy} className="btn-primary btn-lg w-full mt-5">
            {busy ? '…' : 'Confirmar chegada'}
          </button>
        )}
        {job?.status === 'in_progress' && (
          <button onClick={completeJob} disabled={busy} className="btn-primary btn-lg w-full mt-5 !bg-signal-500 !shadow-none">
            {busy ? '…' : 'Finalizar serviço'}
          </button>
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
            <ChatBox jobId={id} otherName={shop?.business_name ?? 'Oficina'} dark />
          </div>
        </div>
      )}
    </div>
  );
}
