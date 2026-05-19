import { useEffect, useMemo, useState } from 'react';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { mechanicNet } from '@/lib/payment';
import type { Job } from '@/types/database';

type JobWithShop = Job & { workshop?: { business_name: string } | null };
const DAY_NAMES = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const HOUR_BUCKETS: Array<[string, (h: number) => boolean]> = [
  ['Madrugada (00–06h)', h => h < 6],
  ['Manhã (06–12h)',     h => h >= 6 && h < 12],
  ['Tarde (12–18h)',     h => h >= 12 && h < 18],
  ['Noite (18–24h)',     h => h >= 18],
];

type Period = 'week' | 'month' | 'all';

export default function MechanicGanhos() {
  const { user } = useAuth();
  const [jobs, setJobs]     = useState<JobWithShop[]>([]);
  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (user) load(); }, [user]);

  async function load() {
    setLoading(true);
    const { data: m } = await supabase
      .from('mechanics').select('id').eq('profile_id', user!.id).maybeSingle();
    if (m?.id) {
      const { data } = await supabase
        .from('jobs').select('*, workshop:workshops(business_name)')
        .eq('mechanic_id', m.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });
      setJobs((data as JobWithShop[]) ?? []);
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
  // Tudo em líquido — o que o mecânico recebe / vai receber
  const received = filtered
    .filter(j => j.workshop_confirmed_at)
    .reduce((a, j) => a + mechanicNet(j.price ?? 0), 0);
  const pending = filtered
    .filter(j => !j.workshop_confirmed_at)
    .reduce((a, j) => a + mechanicNet(j.price ?? 0), 0);

  const byMonth: Record<string, number> = {};
  jobs.forEach(j => {
    const key = new Date(j.completed_at!).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    byMonth[key] = (byMonth[key] ?? 0) + mechanicNet(j.price ?? 0);
  });
  const months = Object.entries(byMonth).slice(0, 6);

  /* ── Insights de desempenho (usam histórico completo, não o filtro de período) ── */
  const insights = useMemo(() => {
    // Top oficinas — mais ganhou
    const byShop: Record<string, { count: number; total: number }> = {};
    jobs.forEach(j => {
      const name = j.workshop?.business_name ?? 'Oficina';
      byShop[name] = byShop[name] || { count: 0, total: 0 };
      byShop[name].count += 1;
      byShop[name].total += mechanicNet(j.price ?? 0);
    });
    const topShops = Object.entries(byShop)
      .sort(([, a], [, b]) => b.total - a.total)
      .slice(0, 5);

    // Por dia da semana
    const byDay: Record<string, { count: number; total: number }> = {};
    DAY_NAMES.forEach(d => { byDay[d] = { count: 0, total: 0 }; });
    jobs.forEach(j => {
      if (!j.completed_at) return;
      const dn = DAY_NAMES[new Date(j.completed_at).getDay()];
      byDay[dn].count += 1;
      byDay[dn].total += mechanicNet(j.price ?? 0);
    });

    // Por bucket de horário
    const byHour: Record<string, { count: number; total: number }> = {};
    HOUR_BUCKETS.forEach(([name]) => { byHour[name] = { count: 0, total: 0 }; });
    jobs.forEach(j => {
      if (!j.completed_at) return;
      const h = new Date(j.completed_at).getHours();
      const bucket = HOUR_BUCKETS.find(([, test]) => test(h));
      if (!bucket) return;
      byHour[bucket[0]].count += 1;
      byHour[bucket[0]].total += mechanicNet(j.price ?? 0);
    });

    return { topShops, byDay, byHour };
  }, [jobs]);

  const maxDay  = Math.max(...Object.values(insights.byDay).map(d => d.total), 1);
  const maxHour = Math.max(...Object.values(insights.byHour).map(d => d.total), 1);

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

        {/* Summary cards — só o que vai pro PIX */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Recebido no PIX</div>
            <div className="text-2xl font-bold text-signal-400 font-display mt-1">
              {loading ? '…' : `R$ ${received.toFixed(0)}`}
            </div>
            <div className="text-[11px] text-steel-500 mt-0.5">
              {filtered.filter(j => j.workshop_confirmed_at).length} jobs confirmados
            </div>
          </div>
          <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
            <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold">Aguardando</div>
            <div className="text-2xl font-bold text-pending-400 font-display mt-1">
              {loading ? '…' : `R$ ${pending.toFixed(0)}`}
            </div>
            <div className="text-[11px] text-steel-500 mt-0.5">
              {filtered.filter(j => !j.workshop_confirmed_at).length} jobs pendentes
            </div>
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

        {/* ── INSIGHTS DE DESEMPENHO ── */}
        {jobs.length > 0 && (
          <>
            <div className="pt-4 border-t border-steel-800 -mx-4 px-4">
              <h2 className="text-sm font-bold text-steel-400 uppercase tracking-widest mb-1">
                📊 Desempenho
              </h2>
              <p className="text-xs text-steel-500 mb-4">
                Análise do seu histórico — use pra decidir onde focar.
              </p>
            </div>

            {/* Top oficinas */}
            {insights.topShops.length > 0 && (
              <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
                <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold mb-3">
                  Top oficinas (onde você mais ganhou)
                </div>
                <div className="space-y-2">
                  {insights.topShops.map(([name, data], i) => (
                    <div key={name} className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="h-6 w-6 rounded-full bg-brand-500/20 text-brand-400 grid place-items-center text-xs font-bold shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-sm font-semibold text-steel-100 truncate">{name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-signal-400 font-display">R$ {data.total.toFixed(0)}</div>
                        <div className="text-[10px] text-steel-500">{data.count} {data.count === 1 ? 'job' : 'jobs'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Por dia da semana */}
            <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
              <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold mb-3">
                Por dia da semana
              </div>
              <div className="space-y-2">
                {DAY_NAMES.map(day => {
                  const d = insights.byDay[day];
                  const pct = (d.total / maxDay) * 100;
                  return (
                    <div key={day}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-steel-300">{day}</span>
                        <span className="font-bold text-signal-400 font-display">
                          {d.total > 0 ? `R$ ${d.total.toFixed(0)}` : '—'}
                          {d.count > 0 && <span className="text-steel-500 font-normal text-[10px] ml-1">({d.count})</span>}
                        </span>
                      </div>
                      <div className="h-2 bg-steel-700 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Por horário */}
            <div className="rounded-2xl bg-steel-800 border border-steel-700 p-4">
              <div className="text-[10px] text-steel-500 uppercase tracking-widest font-semibold mb-3">
                Por horário do dia
              </div>
              <div className="space-y-2">
                {HOUR_BUCKETS.map(([name]) => {
                  const d = insights.byHour[name];
                  const pct = (d.total / maxHour) * 100;
                  return (
                    <div key={name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-steel-300">{name}</span>
                        <span className="font-bold text-signal-400 font-display">
                          {d.total > 0 ? `R$ ${d.total.toFixed(0)}` : '—'}
                          {d.count > 0 && <span className="text-steel-500 font-normal text-[10px] ml-1">({d.count})</span>}
                        </span>
                      </div>
                      <div className="h-2 bg-steel-700 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
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
                    <div className="text-signal-400 font-bold font-display">
                      {(j.price ?? 0) > 0 ? `R$ ${mechanicNet(j.price ?? 0).toFixed(0)}` : '—'}
                    </div>
                    <div className="text-[10px] text-steel-600">
                      {j.workshop_confirmed_at ? 'no PIX' : 'aguardando'}
                    </div>
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
