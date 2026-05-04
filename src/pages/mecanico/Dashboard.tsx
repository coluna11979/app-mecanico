import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, Mechanic } from '@/types/database';

export default function MechanicDashboard() {
  const { user } = useAuth();
  const [me, setMe] = useState<Mechanic | null>(null);
  const [openJobs, setOpenJobs] = useState<Job[]>([]);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    const { data: m } = await supabase.from('mechanics').select('*').eq('profile_id', user!.id).maybeSingle();
    setMe(m as Mechanic);
    const [{ data: open }, { data: mine }] = await Promise.all([
      supabase.from('jobs').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(20),
      supabase.from('jobs').select('*').eq('mechanic_id', m?.id ?? '').in('status', ['assigned', 'in_progress']),
    ]);
    setOpenJobs((open as Job[]) ?? []);
    setActiveJobs((mine as Job[]) ?? []);
    setLoading(false);
  }

  async function toggleAvailable() {
    if (!me) return;
    const { data } = await supabase.from('mechanics').update({ is_available: !me.is_available }).eq('id', me.id).select().single();
    setMe(data as Mechanic);
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
            </div>
            <button onClick={toggleAvailable}
              className={`relative w-16 h-9 rounded-full transition ${me?.is_available ? 'bg-signal-500' : 'bg-steel-600'}`}>
              <span className={`absolute top-1 left-1 h-7 w-7 rounded-full bg-white transition ${me?.is_available ? 'translate-x-7' : ''}`} />
            </button>
          </div>
        </div>

        {/* Ativos */}
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

        {/* Disponíveis */}
        <section>
          <h2 className="text-sm font-bold text-steel-400 uppercase tracking-wider mb-2">Jobs disponíveis</h2>
          {loading ? <Skeleton /> : openJobs.length === 0 ? (
            <div className="card !bg-steel-800 text-center text-steel-400 py-10">Nenhum job aberto agora.</div>
          ) : (
            <div className="space-y-2">
              {openJobs.map(j => (
                <Link key={j.id} to={`/mecanico/job/${j.id}`} className="card !bg-steel-800 block hover:!bg-steel-700 transition">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold">{j.title}</div>
                      <div className="text-sm text-steel-400 line-clamp-2 mt-0.5">{j.description}</div>
                    </div>
                    <span className="text-xl font-bold text-brand-500 font-display">R$ {j.price.toFixed(0)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

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
  return <div><div className="text-xl font-bold font-display">{n}</div><div className="text-[11px] text-steel-400 uppercase tracking-wider">{l}</div></div>;
}
function Skeleton() {
  return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="card !bg-steel-800 h-20 animate-pulse-soft" />)}</div>;
}
