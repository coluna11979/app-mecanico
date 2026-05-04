import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, Mechanic } from '@/types/database';

type PendingRating = Job & { workshop_name?: string };

export default function MechanicDashboard() {
  const { user } = useAuth();
  const [me, setMe]                       = useState<Mechanic | null>(null);
  const [openJobs, setOpenJobs]           = useState<Job[]>([]);
  const [activeJobs, setActiveJobs]       = useState<Job[]>([]);
  const [pendingRatings, setPendingRatings] = useState<PendingRating[]>([]);
  const [loading, setLoading]             = useState(true);
  const [accepting, setAccepting]         = useState<string | null>(null);
  // Rating state
  const [ratingJob, setRatingJob]         = useState<PendingRating | null>(null);
  const [stars, setStars]                 = useState(0);
  const [hovered, setHovered]             = useState(0);
  const [ratingNote, setRatingNote]       = useState('');
  const [submitting, setSubmitting]       = useState(false);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    const { data: m } = await supabase.from('mechanics').select('*').eq('profile_id', user!.id).maybeSingle();
    setMe(m as Mechanic);
    await fetchJobs(m?.id ?? '');
    setLoading(false);
  }

  async function fetchJobs(mechId: string) {
    const [{ data: open }, { data: mine }, { data: toRate }] = await Promise.all([
      supabase.from('jobs').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(20),
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
    setOpenJobs((open as Job[]) ?? []);
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
    const { data } = await supabase.from('mechanics').update({ is_available: !me.is_available }).eq('id', me.id).select().single();
    setMe(data as Mechanic);
  }

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
      <div className="p-4 space-y-4">

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
                        R$ {j.price_per_hour?.toFixed(0) ?? '—'}/h · máx {j.max_hours ?? '—'}h
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="text-xs opacity-70">até</div>
                      <span className="text-2xl font-bold font-display">R$ {j.price.toFixed(0)}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs opacity-80">Toque para ver mapa →</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Avaliações pendentes */}
        {pendingRatings.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-steel-400 uppercase tracking-wider mb-2">Avaliar oficina</h2>
            <div className="space-y-2">
              {pendingRatings.map(j => (
                <button key={j.id} onClick={() => { setRatingJob(j); setStars(0); setRatingNote(''); }}
                  className="card !bg-steel-800 w-full text-left border border-brand-500/30 hover:border-brand-500/60 transition">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">{j.title}</div>
                      <div className="text-xs text-steel-400 mt-0.5">{j.workshop_name ?? 'Oficina'}</div>
                    </div>
                    <span className="text-brand-400 text-xs font-semibold bg-brand-500/10 px-3 py-1 rounded-full">
                      ★ Avaliar
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Jobs disponíveis */}
        <section>
          <h2 className="text-sm font-bold text-steel-400 uppercase tracking-wider mb-2">Jobs disponíveis</h2>
          {loading ? <Skeleton /> : openJobs.length === 0 ? (
            <div className="card !bg-steel-800 text-center text-steel-400 py-10">Nenhum job aberto agora.</div>
          ) : (
            <div className="space-y-2">
              {openJobs.map(j => {
                const cap = (j.price_per_hour ?? 0) * (j.max_hours ?? 1);
                return (
                  <div key={j.id} className="card !bg-steel-800 hover:!bg-steel-700 transition">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold truncate">{j.title}</div>
                        <div className="text-sm text-steel-400 line-clamp-2 mt-0.5">{j.description}</div>
                        {j.scheduled_at && (
                          <div className="text-xs text-steel-500 mt-1">
                            📅 {new Date(j.scheduled_at).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-brand-400 font-bold font-display text-lg">
                          R$ {(j.price_per_hour ?? 0).toFixed(0)}<span className="text-sm font-normal">/h</span>
                        </div>
                        <div className="text-xs text-steel-500">máx {j.max_hours ?? 1}h</div>
                        <div className="text-xs text-signal-400 font-semibold mt-0.5">
                          até R$ {cap.toFixed(0)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Link to={`/mecanico/job/${j.id}`} className="btn-ghost flex-1 text-center text-sm py-2">
                        Ver detalhes
                      </Link>
                      <button
                        onClick={() => acceptJob(j)}
                        disabled={accepting === j.id || !me?.is_available}
                        className="btn-primary flex-1 text-sm py-2 disabled:opacity-50"
                      >
                        {accepting === j.id ? 'Aceitando…' : !me?.is_available ? 'Fique online' : 'Aceitar job'}
                      </button>
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
