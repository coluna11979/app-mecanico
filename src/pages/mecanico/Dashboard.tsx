import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { unlockAudio, attachAutoUnlock } from '@/lib/alertSound';
import { useNewJobAlert } from '@/hooks/useNewJobAlert';
import { distKm, formatDistance } from '@/lib/geo';
import type { Job, Mechanic, Workshop } from '@/types/database';

type Toast = { id: string; job: Job };

type WorkshopBrief = Pick<Workshop, 'business_name' | 'city' | 'state' | 'lat' | 'lng'>;
type JobWithShop = Job & { workshop: WorkshopBrief | null };

type PendingRating = Job & { workshop_name?: string };

type JustEarned = { gross: number; net: number; jobTitle: string };

export default function MechanicDashboard() {
  const { user } = useAuth();
  const location = useLocation();
  const nav = useNavigate();
  const [justEarned, setJustEarned] = useState<JustEarned | null>(null);

  useEffect(() => {
    const st = location.state as { justEarned?: JustEarned } | null;
    if (st?.justEarned) {
      setJustEarned(st.justEarned);
      nav(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, nav]);
  const [me, setMe]                       = useState<Mechanic | null>(null);
  const [openJobs, setOpenJobs]           = useState<JobWithShop[]>([]);
  const [activeJobs, setActiveJobs]       = useState<Job[]>([]);
  const [userPos, setUserPos]             = useState<[number, number] | null>(null);
  const [pendingRatings, setPendingRatings] = useState<PendingRating[]>([]);
  const [loading, setLoading]             = useState(true);
  const [accepting, setAccepting]         = useState<string | null>(null);
  // Rating state
  const [ratingJob, setRatingJob]         = useState<PendingRating | null>(null);
  const [stars, setStars]                 = useState(0);
  const [hovered, setHovered]             = useState(0);
  const [ratingNote, setRatingNote]       = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [toasts, setToasts]               = useState<Toast[]>([]);
  const toastTimer = useRef<Record<string, number>>({});
  const [showEarnings, setShowEarnings]   = useState(() =>
    localStorage.getItem('mec_earnings_dismissed') !== '1'
  );

  useEffect(() => { if (user) load(); }, [user]);

  /* Destrava áudio na primeira interação (clique/toque/tecla) */
  useEffect(() => { attachAutoUnlock(); }, []);

  /* ── Alerta sonoro de novo job ── */
  useNewJobAlert({
    enabled: !!me?.is_available,
    onNewJob: async (job) => {
      // Mostra toast imediatamente
      const tid = job.id;
      setToasts(prev => [{ id: tid, job }, ...prev.slice(0, 2)]);
      toastTimer.current[tid] = window.setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== tid));
      }, 7000);
      // Re-busca com workshop para já vir com cidade/coords
      const { data: j } = await supabase
        .from('jobs')
        .select('*, workshop:workshops(business_name, city, state, lat, lng)')
        .eq('id', job.id).maybeSingle();
      const enriched = (j as JobWithShop | null) ?? { ...job, workshop: null };
      setOpenJobs(prev => [enriched, ...prev.filter(x => x.id !== enriched.id)]);
    },
  });

  /* ── Geolocalização do mecânico para distância nos cards ── */
  useEffect(() => {
    if (!navigator.geolocation) return;
    const gotFix = (p: GeolocationPosition) =>
      setUserPos([p.coords.latitude, p.coords.longitude]);
    navigator.geolocation.getCurrentPosition(gotFix, () => { /* mantém null */ }, { timeout: 6000 });
  }, []);

  /* Fallback: posição salva do mecânico (atualizada pelo useGeoBroadcast em outras telas) */
  useEffect(() => {
    if (userPos) return;
    if (me?.current_lat && me?.current_lng) setUserPos([me.current_lat, me.current_lng]);
  }, [me, userPos]);

  async function load() {
    setLoading(true);
    const { data: m } = await supabase.from('mechanics').select('*').eq('profile_id', user!.id).maybeSingle();
    setMe(m as Mechanic);
    await fetchJobs(m?.id ?? '');
    setLoading(false);
  }

  async function fetchJobs(mechId: string) {
    const [{ data: open }, { data: mine }, { data: toRate }] = await Promise.all([
      supabase.from('jobs')
        .select('*, workshop:workshops(business_name, city, state, lat, lng)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(20),
      mechId
        ? supabase.from('jobs').select('*').eq('mechanic_id', mechId).in('status', ['assigned', 'in_progress'])
        : Promise.resolve({ data: [] }),
      mechId
        ? supabase.from('jobs')
            .select('*, workshop:workshops(business_name)')
            .eq('mechanic_id', mechId)
            .eq('status', 'completed')
            .not('workshop_confirmed_at', 'is', null)
            .is('workshop_rating', null)
            .order('completed_at', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
    ]);
    setOpenJobs((open as JobWithShop[]) ?? []);
    setActiveJobs((mine as Job[]) ?? []);
    setPendingRatings(((toRate ?? []) as any[]).map(j => ({
      ...j, workshop_name: j.workshop?.business_name,
    })));
  }

  async function submitRating() {
    if (!ratingJob || stars === 0) return;
    setSubmitting(true);
    await supabase.from('jobs').update({
      workshop_rating:      stars,
      workshop_rating_note: ratingNote.trim() || null,
    }).eq('id', ratingJob.id);
    setPendingRatings(prev => prev.filter(j => j.id !== ratingJob.id));
    setRatingJob(null); setStars(0); setRatingNote(''); setHovered(0);
    setSubmitting(false);
  }

  async function toggleAvailable() {
    if (!me) return;
    unlockAudio(); // destrava AudioContext no clique do usuário
    const { data } = await supabase.from('mechanics').update({ is_available: !me.is_available }).eq('id', me.id).select().single();
    setMe(data as Mechanic);
  }

  /* Jobs decorados com distância (quando há posição) e ordenados por proximidade */
  const decoratedJobs = useMemo(() => {
    const withDist = openJobs.map(j => {
      const ws = j.workshop;
      const km = (userPos && ws?.lat != null && ws?.lng != null)
        ? distKm(userPos[0], userPos[1], ws.lat, ws.lng)
        : null;
      return { job: j, km };
    });
    if (userPos) {
      withDist.sort((a, b) => {
        if (a.km == null && b.km == null) return 0;
        if (a.km == null) return 1;
        if (b.km == null) return -1;
        return a.km - b.km;
      });
    }
    return withDist;
  }, [openJobs, userPos]);

  async function acceptJob(job: Job) {
    if (!me) return;
    setAccepting(job.id);
    const { error } = await supabase.from('jobs').update({ mechanic_id: me.id, status: 'assigned' }).eq('id', job.id).eq('status', 'open');
    if (!error) {
      setOpenJobs(prev => prev.filter(j => j.id !== job.id));
      setActiveJobs(prev => [{ ...job, mechanic_id: me.id, status: 'assigned' }, ...prev]);
    }
    setAccepting(null);
  }

  return (
    <MechanicLayout>
      {/* ── Toasts de novo job ── */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
        {toasts.map(t => {
          const cap = (t.job.price_per_hour ?? 0) * (t.job.max_hours ?? 1);
          return (
            <div
              key={t.id}
              className="pointer-events-auto bg-brand-500 text-white rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3 animate-slide-down"
            >
              <span className="text-2xl shrink-0">🔧</span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">Nova demanda!</div>
                <div className="font-bold truncate">{t.job.title}</div>
                <div className="text-xs opacity-80">
                  R$ {cap.toFixed(0)} fechado · {t.job.max_hours ?? '—'}h previstas
                </div>
              </div>
              <button
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                className="opacity-60 hover:opacity-100 text-lg leading-none shrink-0"
              >✕</button>
            </div>
          );
        })}
      </div>

      <div className="p-4 space-y-4">

        {/* 🚨 Sem chave PIX cadastrada — bloqueador pra receber pagamento */}
        {me && !(me as any).pix_key && (
          <Link to="/mecanico/perfil" className="block">
            <div className="bg-gradient-to-r from-alert-500/20 to-alert-600/10 border-2 border-alert-500/50 rounded-2xl p-4 hover:border-alert-500 transition">
              <div className="flex items-start gap-3">
                <div className="text-3xl shrink-0 animate-pulse">⚠️</div>
                <div className="flex-1">
                  <h3 className="font-bold text-white text-base leading-tight">
                    Cadastre sua chave PIX agora
                  </h3>
                  <p className="text-xs text-steel-300 mt-1 leading-relaxed">
                    Sem chave PIX cadastrada, você <strong className="text-alert-300">não recebe</strong> o repasse dos jobs.
                    Toque pra cadastrar (leva 30 segundos).
                  </p>
                  <span className="inline-block mt-2 bg-alert-500 text-white text-xs font-bold rounded-lg px-3 py-1">
                    Cadastrar chave PIX →
                  </span>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Toggle disponibilidade */}
        <div className="card !bg-steel-800 border border-steel-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-steel-400 uppercase tracking-wider">Status</div>
              <div className="text-2xl font-bold">{me?.is_available ? 'Você está online' : 'Você está offline'}</div>
              {!me?.is_available && (
                <div className="text-xs text-steel-400 mt-1">Fique online para ver e aceitar jobs</div>
              )}
            </div>
            <button onClick={toggleAvailable}
              className={`relative w-16 h-9 rounded-full transition ${me?.is_available ? 'bg-signal-500' : 'bg-steel-600'}`}>
              <span className={`absolute top-1 left-1 h-7 w-7 rounded-full bg-white transition-transform ${me?.is_available ? 'translate-x-7' : ''}`} />
            </button>
          </div>
        </div>

        {/* ── Card: Como funciona seu ganho (aparece 1 vez, dismissível) ── */}
        {showEarnings && (
          <div className="card !bg-gradient-to-br from-brand-600 to-brand-700 border border-brand-500/40 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-10 translate-x-10 pointer-events-none" />
            <button
              onClick={() => { setShowEarnings(false); localStorage.setItem('mec_earnings_dismissed', '1'); }}
              className="absolute top-3 right-3 text-white/50 hover:text-white text-lg leading-none"
              aria-label="Fechar"
            >✕</button>
            <div className="relative">
              <div className="text-xs font-bold uppercase tracking-widest text-brand-200 mb-2">💰 Como funciona seu ganho</div>
              <p className="text-white text-sm leading-relaxed mb-4">
                Você define seu valor por hora. A plataforma cobra{' '}
                <span className="font-bold text-white bg-white/20 px-1.5 py-0.5 rounded">18%</span>{' '}
                apenas quando o serviço é concluído e aprovado. Sem mensalidade, sem taxa de cadastro, sem custo fixo.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['R$ 100/h', '2h de serviço', 'R$ 200 bruto'],
                  ['18%', 'Taxa plataforma', '– R$ 36'],
                  ['R$ 164', 'Você recebe', 'via PIX'],
                ].map(([n, l, s]) => (
                  <div key={l} className="bg-white/10 rounded-xl py-2 px-1">
                    <div className="text-white font-bold text-base leading-none">{n}</div>
                    <div className="text-brand-200 text-[10px] mt-1 leading-tight">{l}</div>
                    <div className="text-white/60 text-[10px]">{s}</div>
                  </div>
                ))}
              </div>
              <p className="text-brand-200 text-xs mt-3">
                ✓ Sem surpresa · ✓ Só paga se trabalhar · ✓ PIX liberado rápido
              </p>
            </div>
          </div>
        )}

        {/* Jobs em andamento */}
        {activeJobs.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-steel-400 uppercase tracking-wider mb-2">Em andamento</h2>
            <div className="space-y-2">
              {activeJobs.map(j => (
                <Link key={j.id} to={`/mecanico/job/${j.id}/tracking`} className="card !bg-brand-500 !text-white block">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm opacity-80">{j.status === 'assigned' ? 'A caminho' : 'Em serviço'}</div>
                      <div className="font-bold text-lg truncate">{j.title}</div>
                      <div className="text-xs opacity-70 mt-0.5">
                        Pacote: {j.max_hours ?? '—'}h × R$ {j.price_per_hour?.toFixed(0) ?? '—'}/h
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="text-xs opacity-70">valor</div>
                      <span className="text-2xl font-bold font-display">R$ {j.price.toFixed(0)}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs opacity-80">Toque para ver mapa →</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* 🔔 Avaliações pendentes — destaque alto */}
        {pendingRatings.length > 0 && (
          <section>
            <div className="bg-gradient-to-r from-brand-500/20 to-brand-600/10 border-2 border-brand-500/50 rounded-2xl p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="text-2xl shrink-0 animate-pulse">🔔</div>
                <div className="flex-1">
                  <h3 className="font-bold text-white text-base leading-tight">
                    {pendingRatings.length === 1
                      ? 'Avalie a oficina'
                      : `${pendingRatings.length} oficinas pra avaliar`}
                  </h3>
                  <p className="text-xs text-steel-300 mt-0.5">
                    Pagamento já liberado — sua avaliação fecha o ciclo.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {pendingRatings.map(j => (
                  <button
                    key={j.id}
                    onClick={() => { setRatingJob(j); setStars(0); setRatingNote(''); }}
                    className="w-full bg-steel-800/80 hover:bg-steel-800 rounded-xl px-3 py-2.5 transition flex items-center justify-between gap-3 border border-steel-700"
                  >
                    <div className="flex-1 min-w-0 text-left">
                      <div className="font-semibold text-sm text-white truncate">{j.title}</div>
                      <div className="text-xs text-steel-400 mt-0.5">🏭 {j.workshop_name ?? 'Oficina'}</div>
                    </div>
                    <span className="bg-brand-500 text-white text-xs font-bold rounded-lg px-3 py-1.5 shrink-0">
                      ★ Avaliar
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Jobs disponíveis */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-steel-400 uppercase tracking-wider">Jobs disponíveis</h2>
            <Link to="/mecanico/mapa" className="text-xs font-semibold text-brand-400 hover:text-brand-300 transition flex items-center gap-1">
              🗺️ Ver no mapa
            </Link>
          </div>
          {loading ? <Skeleton /> : decoratedJobs.length === 0 ? (
            <div className="card !bg-steel-800 text-center text-steel-400 py-10">Nenhum job aberto agora.</div>
          ) : (
            <div className="space-y-2">
              {decoratedJobs.map(({ job: j, km }) => {
                const cap = (j.price_per_hour ?? 0) * (j.max_hours ?? 1);
                const ws = j.workshop;
                const region = ws ? `${ws.city}${ws.state ? `/${ws.state}` : ''}` : null;
                return (
                  <div key={j.id} className="card !bg-steel-800 hover:!bg-steel-700 transition">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{j.title}</div>
                        <div className="text-sm text-steel-400 line-clamp-2 mt-0.5">{j.description}</div>
                        {region && (
                          <div className="text-xs text-steel-500 mt-1 flex items-center gap-1.5">
                            <span>📍 {region}</span>
                            {km != null && (
                              <>
                                <span className="text-steel-700">·</span>
                                <span className="text-brand-400 font-semibold">~{formatDistance(km)}</span>
                              </>
                            )}
                          </div>
                        )}
                        {j.scheduled_at && (
                          <div className="text-xs text-steel-500 mt-1">
                            📅 {new Date(j.scheduled_at).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-signal-400 font-bold font-display text-2xl">
                          R$ {cap.toFixed(0)}
                        </div>
                        <div className="text-[10px] text-steel-500 uppercase tracking-wider">fechado</div>
                        <div className="text-xs text-steel-400 mt-0.5">
                          {j.max_hours ?? 1}h × R$ {(j.price_per_hour ?? 0).toFixed(0)}/h
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      <button
                        onClick={() => acceptJob(j)}
                        disabled={accepting === j.id || !me?.is_available}
                        className="btn-primary w-full text-sm py-2.5 disabled:opacity-50"
                      >
                        {accepting === j.id ? 'Aceitando…' : !me?.is_available ? 'Fique online para aceitar' : '✓ Aceitar job'}
                      </button>
                      <Link
                        to={`/mecanico/job/${j.id}`}
                        className="text-xs text-steel-400 hover:text-steel-200 text-center underline-offset-2 hover:underline"
                      >
                        Ver detalhes
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Stats */}
        <div className="card !bg-steel-800 grid grid-cols-3 text-center">
          <Stat n={me?.total_jobs ?? 0} l="Jobs" />
          <Stat n={(me?.rating ?? 0).toFixed(1)} l="★ Nota" />
          <Stat n={`R$${me?.hourly_rate?.toFixed(0) ?? 0}`} l="/hora" />
        </div>
      </div>
      {/* Modal "Você ganhou R$ X" pós-finalização */}
      {justEarned && (
        <div className="fixed inset-0 bg-steel-900/85 grid place-items-center p-4 z-50">
          <div className="bg-gradient-to-b from-signal-500/20 to-steel-800 border border-signal-500/40 rounded-2xl p-6 max-w-sm w-full text-center space-y-4">
            <div className="text-5xl">💰</div>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-signal-400 font-bold">Serviço concluído</div>
              <div className="text-sm text-steel-300 mt-1 line-clamp-2">{justEarned.jobTitle}</div>
            </div>
            <div className="bg-steel-900/60 rounded-xl py-4 border border-steel-700/50">
              <div className="text-[10px] uppercase tracking-wider text-steel-500 font-bold">Seu repasse</div>
              <div className="text-4xl font-bold text-signal-400 font-display mt-1">
                + R$ {justEarned.net.toFixed(2).replace('.', ',')}
              </div>
              <div className="text-xs text-steel-500 mt-1">de R$ {justEarned.gross.toFixed(0)} (82%)</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setJustEarned(null)} className="btn-ghost flex-1 text-sm">
                Fechar
              </button>
              <Link to="/mecanico/ganhos" onClick={() => setJustEarned(null)} className="btn-primary flex-1 text-sm">
                Ver ganhos
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Modal avaliação oficina */}
      {ratingJob && (
        <div className="fixed inset-0 bg-steel-900/80 grid place-items-center p-4 z-50">
          <div className="bg-steel-800 border border-steel-700 rounded-2xl p-6 max-w-sm w-full space-y-5">
            <div>
              <h3 className="text-lg font-bold">Como foi a oficina?</h3>
              <p className="text-sm text-steel-400 mt-1">{ratingJob.workshop_name ?? 'Oficina'} · {ratingJob.title}</p>
            </div>
            <div className="flex gap-2 justify-center">
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button"
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setStars(n)}
                  className="text-3xl transition hover:scale-110">
                  {n <= (hovered || stars) ? '★' : '☆'}
                </button>
              ))}
            </div>
            {stars > 0 && (
              <p className="text-center text-sm font-semibold text-brand-400">
                {['','Ruim','Regular','Bom','Ótimo','Excelente'][stars]}
              </p>
            )}
            <textarea
              className="input !bg-steel-900 !text-white !border-steel-600 resize-none text-sm"
              rows={2} placeholder="Comentário opcional…"
              value={ratingNote} onChange={e => setRatingNote(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => setRatingJob(null)} className="btn-ghost flex-1 text-sm">Agora não</button>
              <button onClick={submitRating} disabled={submitting || stars === 0}
                className="btn-primary flex-1 disabled:opacity-50">
                {submitting ? '…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </MechanicLayout>
  );
}

function Stat({ n, l }: { n: string | number; l: string }) {
  return (
    <div>
      <div className="text-xl font-bold font-display">{n}</div>
      <div className="text-[11px] text-steel-400 uppercase tracking-wider">{l}</div>
    </div>
  );
}
function Skeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map(i => <div key={i} className="card !bg-steel-800 h-20 animate-pulse-soft" />)}
    </div>
  );
}
