import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getSetting } from '@/lib/settings';
import { useNewJobAlert } from '@/hooks/useNewJobAlert';
import mapboxgl from 'mapbox-gl';
import type { Job, Mechanic, Workshop } from '@/types/database';

type JobWithShop = Job & { workshop: Workshop | null };

export default function MechanicMapa() {
  const { user } = useAuth();
  const nav = useNavigate();

  const mapRef    = useRef<HTMLDivElement>(null);
  const mapInst   = useRef<mapboxgl.Map | null>(null);
  const markers   = useRef<mapboxgl.Marker[]>([]);
  const meMarker  = useRef<mapboxgl.Marker | null>(null);

  const [me, setMe]           = useState<Mechanic | null>(null);
  const [jobs, setJobs]       = useState<JobWithShop[]>([]);
  const [selected, setSelected] = useState<JobWithShop | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [mapReady, setMapReady]   = useState(false);
  const [userPos, setUserPos]     = useState<[number, number] | null>(null);

  /* ── Alerta sonoro de novo job (também no mapa) ── */
  useNewJobAlert({
    enabled: !!me?.is_available,
    onNewJob: async (job) => {
      // Busca com join de workshop para ter lat/lng e mostrar no mapa
      const { data: j } = await supabase
        .from('jobs').select('*, workshop:workshops(*)')
        .eq('id', job.id).maybeSingle();
      if (j) setJobs(prev => [j as JobWithShop, ...prev.filter(x => x.id !== j.id)]);
    },
  });

  /* ── Load mechanic + open jobs ── */
  useEffect(() => {
    if (!user) return;

    let alive = true;
    (async () => {
      const { data: m } = await supabase
        .from('mechanics').select('*').eq('profile_id', user.id).maybeSingle();
      if (alive) setMe(m as Mechanic);

      const { data } = await supabase
        .from('jobs')
        .select('*, workshop:workshops(*)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(40);
      if (alive) setJobs((data ?? []) as JobWithShop[]);
    })();

    /* Real-time: new open jobs appear, assigned jobs disappear */
    const ch = supabase.channel('mapa:jobs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs' }, async payload => {
        if (!alive || payload.new.status !== 'open') return;
        // Fetch with workshop join
        const { data: j } = await supabase
          .from('jobs').select('*, workshop:workshops(*)')
          .eq('id', payload.new.id).maybeSingle();
        if (j) setJobs(prev => [j as JobWithShop, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' }, payload => {
        if (!alive) return;
        if (payload.new.status !== 'open') {
          // Remove from map
          setJobs(prev => prev.filter(j => j.id !== payload.new.id));
          setSelected(sel => sel?.id === payload.new.id ? null : sel);
        }
      })
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [user]);

  /* ── Get mechanic GPS ── */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p  => setUserPos([p.coords.latitude, p.coords.longitude]),
      () => setUserPos([-23.5505, -46.6333]),   // São Paulo fallback
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  /* ── Init Mapbox map ── */
  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await getSetting('mapbox_token', '');
      if (!alive || !mapRef.current || !token) return;

      mapboxgl.accessToken = token;
      const center: [number, number] = userPos
        ? [userPos[1], userPos[0]]
        : [-46.6333, -23.5505];

      const m = new mapboxgl.Map({
        container: mapRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center,
        zoom: 13,
        attributionControl: false,
      });
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      m.on('load', () => { if (alive) setMapReady(true); });
      mapInst.current = m;
    })();
    return () => {
      alive = false;
      mapInst.current?.remove();
      mapInst.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPos]);

  /* ── "Você está aqui" marker ── */
  useEffect(() => {
    const m = mapInst.current;
    if (!m || !mapReady || !userPos) return;
    if (meMarker.current) { meMarker.current.remove(); meMarker.current = null; }

    const el = document.createElement('div');
    el.style.cssText = 'position:relative; width:36px; height:36px;';
    el.innerHTML = `
      <div style="position:absolute;inset:-10px;border-radius:50%;background:rgba(59,130,246,0.25);animation:ping 1.5s ease-in-out infinite;"></div>
      <div style="position:relative;width:36px;height:36px;border-radius:50%;background:#3b82f6;border:3px solid #fff;display:grid;place-items-center;color:#fff;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.5);">📍</div>
    `;
    meMarker.current = new mapboxgl.Marker(el).setLngLat([userPos[1], userPos[0]]).addTo(m);
  }, [mapReady, userPos]);

  /* ── Job markers ── */
  useEffect(() => {
    const m = mapInst.current;
    if (!m || !mapReady) return;

    // Clear old
    markers.current.forEach(mk => mk.remove());
    markers.current = [];

    jobs.forEach(job => {
      const ws = job.workshop;
      if (!ws?.lat || !ws?.lng) return;
      const pph = (job.price_per_hour ?? 0).toFixed(0);

      const el = document.createElement('div');
      el.style.cssText = 'cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:2px;';
      el.innerHTML = `
        <div style="width:40px;height:40px;border-radius:50%;background:#FF5C0A;border:2px solid #fff;display:grid;place-items-center;color:#fff;font-size:18px;box-shadow:0 2px 10px rgba(0,0,0,.5);transition:transform .15s;">🔧</div>
        <div style="background:rgba(11,17,23,.92);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;white-space:nowrap;letter-spacing:0.02em;">R$ ${pph}/h</div>
      `;
      el.addEventListener('mouseenter', () => {
        const inner = el.querySelector('div')!;
        (inner as HTMLDivElement).style.transform = 'scale(1.15)';
      });
      el.addEventListener('mouseleave', () => {
        const inner = el.querySelector('div')!;
        (inner as HTMLDivElement).style.transform = 'scale(1)';
      });
      el.addEventListener('click', () => {
        setSelected(job);
        m.flyTo({ center: [ws.lng!, ws.lat!], zoom: 14, duration: 600 });
      });

      const mk = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([ws.lng, ws.lat])
        .addTo(m);
      markers.current.push(mk);
    });
  }, [mapReady, jobs]);

  /* ── Accept job ── */
  async function acceptJob() {
    if (!me || !selected) return;
    setAccepting(true);
    const { error } = await supabase
      .from('jobs')
      .update({ mechanic_id: me.id, status: 'assigned' })
      .eq('id', selected.id)
      .eq('status', 'open');
    setAccepting(false);
    if (!error) nav(`/mecanico/job/${selected.id}/tracking`);
  }

  const jobsWithLocation = jobs.filter(j => j.workshop?.lat && j.workshop?.lng);
  const cap = selected ? (selected.price_per_hour ?? 0) * (selected.max_hours ?? 1) : 0;

  return (
    <MechanicLayout>
      {/* The map fills remaining viewport — overflow-hidden prevents scroll from pb-24 on main */}
      <div className="relative overflow-hidden" style={{ height: 'calc(100dvh - 56px - 64px)' }}>

        {/* Mapbox canvas */}
        <div ref={mapRef} className="absolute inset-0" />

        {/* Top badge */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <div className="bg-steel-950/90 backdrop-blur text-white text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 border border-steel-700/50">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
            {jobsWithLocation.length} job{jobsWithLocation.length !== 1 ? 's' : ''} no mapa
          </div>
          {!me?.is_available && (
            <div className="bg-steel-900/90 backdrop-blur text-steel-400 text-xs font-semibold px-3 py-1.5 rounded-full border border-steel-700/50">
              Você está offline
            </div>
          )}
        </div>

        {/* Selected job bottom sheet */}
        {selected && (
          <div
            className="absolute bottom-0 left-0 right-0 z-20 bg-steel-900 border-t border-steel-700 rounded-t-3xl p-5 space-y-4"
            style={{ boxShadow: '0 -8px 32px rgba(0,0,0,.6)' }}
          >
            {/* Handle */}
            <div className="flex justify-center -mt-1 mb-2">
              <div className="w-10 h-1 bg-steel-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-brand-400 font-bold uppercase tracking-widest">Job disponível</div>
                <h3 className="font-bold text-lg text-white leading-tight mt-0.5">{selected.title}</h3>
                {selected.workshop && (
                  <div className="text-xs text-steel-400 mt-1">
                    🏭 {selected.workshop.business_name} · {selected.workshop.city}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="h-8 w-8 rounded-full bg-steel-800 grid place-items-center text-steel-400 hover:text-white transition shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Price strip */}
            <div className="flex items-center justify-between bg-steel-800 rounded-2xl px-4 py-3 border border-steel-700/50">
              <div>
                <div className="text-2xl font-bold text-brand-400 font-display leading-none">
                  R$ {selected.price_per_hour?.toFixed(0)}
                  <span className="text-sm font-normal text-steel-500">/h</span>
                </div>
                <div className="text-xs text-steel-500 mt-1">máx {selected.max_hours}h</div>
              </div>
              <div className="w-px h-10 bg-steel-700" />
              <div className="text-right">
                <div className="text-xs text-steel-500">Teto do job</div>
                <div className="text-2xl font-bold text-signal-400 font-display leading-none">R$ {cap.toFixed(0)}</div>
                <div className="text-xs text-steel-600 mt-1">seus R$ {(cap * 0.85).toFixed(0)}</div>
              </div>
            </div>

            {/* Scheduled */}
            {selected.scheduled_at && (
              <div className="flex items-center gap-2 text-xs text-steel-400">
                <span>📅</span>
                <span>
                  {new Date(selected.scheduled_at).toLocaleString('pt-BR', {
                    weekday: 'short', day: '2-digit', month: 'short',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => nav(`/mecanico/job/${selected.id}`)}
                className="btn-ghost flex-1 text-sm !border-steel-700"
              >
                Ver detalhes
              </button>
              <button
                onClick={acceptJob}
                disabled={accepting || !me?.is_available}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {accepting ? 'Aceitando…' : !me?.is_available ? 'Fique online' : 'Aceitar job'}
              </button>
            </div>
          </div>
        )}

        {/* No location jobs warning */}
        {jobs.length > 0 && jobsWithLocation.length === 0 && (
          <div className="absolute inset-x-4 bottom-4 z-10 bg-steel-900/90 backdrop-blur border border-steel-700 rounded-2xl px-4 py-3 text-center text-sm text-steel-400">
            Os jobs disponíveis ainda não têm localização cadastrada.
          </div>
        )}

        {/* Empty state */}
        {jobs.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="bg-steel-900/90 backdrop-blur border border-steel-800 rounded-2xl px-6 py-5 text-center max-w-xs">
              <div className="text-3xl mb-2">🔍</div>
              <div className="font-bold text-white">Nenhum job no momento</div>
              <div className="text-sm text-steel-400 mt-1">Novos jobs aparecerão aqui em tempo real.</div>
            </div>
          </div>
        )}
      </div>
    </MechanicLayout>
  );
}
