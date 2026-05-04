import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, Mechanic } from '@/types/database';

export default function MechanicDashboard() {
  const { user } = useAuth();
  const [me, setMe]             = useState<Mechanic | null>(null);
  const [openJobs, setOpenJobs] = useState<Job[]>([]);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [loading, setLoading]   = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    const { data: m } = await supabase.from('mechanics').select('*').eq('profile_id', user!.id).maybeSingle();
    setMe(m as Mechanic);
    await fetchJobs(m?.id ?? '');
    setLoading(false);
  }

  async function fetchJobs(mechId: string) {
    const [{ data: open }, { data: mine }] = await Promise.all([
      supabase.from('jobs').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(20),
      mechId
        ? supabase.from('jobs').select('*').eq('mechanic_id', mechId).in('status', ['assigned', 'in_progress'])
        : Promise.resolve({ data: [] }),
    ]);
    setOpenJobs((open as Job[]) ?? []);
    setActiveJobs((mine as Job[]) ?? []);
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
      // Move job from open list to active
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
                    <div>
                      <div className="text-sm opacity-80">{j.status === 'assigned' ? 'A caminho' : 'Em serviço'}</div>
                      <div className="font-bold text-lg">{j.title}</div>
                    </div>
                    <span className="text-2xl font-bold font-display">R$ {j.price.toFixed(0)}</span>
                  </div>
                  <div className="mt-2 text-xs opacity-80">Toque para ver mapa →</div>
                </Link>
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
              {openJobs.map(j => (
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
                      <span className="text-xl font-bold text-brand-500 font-display">R$ {j.price.toFixed(0)}</span>
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
              ))}
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
