import { useEffect, useState } from 'react';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Mechanic, Job } from '@/types/database';

export default function MechanicProfile() {
  const { user, profile } = useAuth();
  const [me, setMe] = useState<Mechanic | null>(null);
  const [history, setHistory] = useState<Job[]>([]);

  useEffect(() => { if (user) load(); }, [user]);
  async function load() {
    const { data: m } = await supabase.from('mechanics').select('*').eq('profile_id', user!.id).maybeSingle();
    setMe(m as Mechanic);
    if (m?.id) {
      const { data: jobs } = await supabase.from('jobs').select('*').eq('mechanic_id', m.id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(20);
      setHistory((jobs as Job[]) ?? []);
    }
  }

  const earnings = history.reduce((a, j) => a + j.price * 0.85, 0);

  return (
    <MechanicLayout>
      <div className="p-4 space-y-4">
        <div className="card !bg-steel-800">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-brand-500 grid place-items-center text-white text-xl font-bold">
              {profile?.full_name?.charAt(0)}
            </div>
            <div>
              <div className="font-bold text-lg">{profile?.full_name}</div>
              <div className="text-xs text-steel-400">★ {(me?.rating ?? 0).toFixed(1)} · {me?.total_jobs ?? 0} jobs</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-5">
            <div className="bg-steel-900 rounded-xl p-3">
              <div className="text-xs text-steel-400 uppercase">Ganhos (últimos)</div>
              <div className="text-xl font-bold text-signal-500 font-display">R$ {earnings.toFixed(2)}</div>
            </div>
            <div className="bg-steel-900 rounded-xl p-3">
              <div className="text-xs text-steel-400 uppercase">Valor / hora</div>
              <div className="text-xl font-bold font-display">R$ {me?.hourly_rate?.toFixed(0) ?? 0}</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xs text-steel-400 uppercase mb-1">Especialidades</div>
            <div className="flex flex-wrap gap-1.5">
              {me?.skills?.map(s => <span key={s} className="badge-brand">{s}</span>)}
            </div>
          </div>
        </div>

        <section>
          <h2 className="text-sm font-bold text-steel-400 uppercase tracking-wider mb-2">Histórico</h2>
          {history.length === 0 ? (
            <div className="card !bg-steel-800 text-center text-steel-400 py-6">Nenhum job concluído ainda.</div>
          ) : (
            <div className="space-y-2">
              {history.map(j => (
                <div key={j.id} className="card !bg-steel-800">
                  <div className="flex justify-between">
                    <div className="font-semibold">{j.title}</div>
                    <div className="text-signal-500 font-bold font-display">R$ {(j.price * 0.85).toFixed(2)}</div>
                  </div>
                  <div className="text-xs text-steel-400 mt-1">{new Date(j.completed_at!).toLocaleDateString('pt-BR')}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </MechanicLayout>
  );
}
