import { useEffect, useState } from 'react';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Job } from '@/types/database';

type Period = 'week' | 'month' | 'all';

export default function MechanicGanhos() {
  const { user } = useAuth();
  const [jobs, setJobs]     = useState<Job[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    const { data: m } = await supabase
      .from('mechanics').select('id').eq('profile_id', user!.id).maybeSingle();
    if (m?.id) {
      const { data } = await supabase
        .from('jobs').select('*')
        .eq('mechanic_id', m.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });
      setJobs((data as Job[]) ?? []);
    }
    setLoading(false);
  }

  function filter(j: Job) {
    if (period === 'all') return true;
    const date = new Date(j.completed_at!);
    const now = new Date();
    if (period === 'week') {
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      return date >= weekAgo;
    }
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }

  const filtered = jobs.filter(filter);
  const gross    = filtered.reduce((a, j) => a + j.price, 0);
  const net      = gross * 0.85;
  const fee      = gross * 0.15;

  const byMonth: Record<string, number> = {};
  jobs.forEach(j => {
    const key = new Date(j.completed_at!).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    byMonth[key] = (byMonth[key] ?? 0) + j.price * 0.85;
  });
  const months = Object.entries(byMonth).slice(0, 6);

  return (
    <MechanicLayout>
      <div className="p-4 space-y-4">

        {/* Period selector */}
        <div className="flex gap-2">
          {(['week', 'month', 'all'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition active:scale-95 ${
                period === p
                  ? 'bg-brand-500 text-white'
                  : 'bg-steel-800 text-steel-400 hover:text-steel-200'
              }`}
            >
              {p === 'week' ? '7 dias' : p === 'month' ? 'Este mês' : 'Histórico'}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Seus ganhos (85%)</div>
            <div className="text-2xl font-bold text-signal-400 font-display mt-1">
              {loading ? '…' : `R$ ${net.toFixed(0)}`}
            </div>
            <div className="text-[11px] text-steel-500 mt-0.5">{filtered.length} jobs</div>
          </div>
          <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Bruto faturado</div>
            <div className="text-2xl font-bold text-white font-display mt-1">
              {loading ? '…' : `R$ ${gross.toFixed(0)}`}
            </div>
            <div className="text-[11px] text-steel-500 mt-0.5">plataforma R$ {fee.toFixed(0)}</div>
          </div>
        </div>

        {/* Historical breakdown */}
        {months.length > 0 && (
          <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold mb-3">Por mês</div>
            <div className="space-y-3">
              {months.map(([month, val]) => {
                const max = Math.max(...months.map(([, v]) => v));
                const pct = max > 0 ? (val / max) * 100 : 0;
                return (
                  <div key={month}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-steel-300 capitalize">{month}</span>
                      <span className="font-bold text-signal-400 font-display">R$ {val.toFixed(0)}</span>
                    </div>
                    <div className="h-2 bg-steel-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-brand-500 to-signal-400 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Job list */}
        <div>
          <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold mb-3 px-1">
            Detalhamento — {filtered.length} jobs
          </div>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="rounded-2xl bg-steel-800 h-16 animate-pulse" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl bg-steel-800 border border-steel-700 text-center py-12 text-steel-500 text-sm">
              Nenhum job concluído nesse período.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(j => (
                <div key={j.id} className="rounded-2xl bg-steel-800 border border-steel-700 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{j.title}</div>
                    <div className="text-xs text-steel-500 mt-0.5">
                      {new Date(j.completed_at!).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {j.actual_hours != null && ` · ${j.actual_hours}h`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-signal-400 font-bold font-display">R$ {(j.price * 0.85).toFixed(0)}</div>
                    <div className="text-[10px] text-steel-600">seus 85%</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MechanicLayout>
  );
}
