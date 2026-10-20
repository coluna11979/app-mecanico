import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

interface Goal {
  id: string;
  nome: string;
  tipo: string;
  target_value: number;
  current_value: number;
  period_end: string;
  period_start: string;
  arquivada: boolean;
}

export function MetasAtivasWidget() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('admin_goals_with_progress');
      setGoals(((data ?? []) as Goal[]).filter(g => !g.arquivada));
      setLoading(false);
    })();
  }, []);

  if (loading) return null;
  if (goals.length === 0) return null;

  return (
    <div className="admin-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="admin-h2">Metas ativas</h2>
        <Link to="/admin/crescimento/metas" className="text-xs font-semibold text-brand-600 hover:underline">
          ver todas →
        </Link>
      </div>
      <div className="space-y-2.5">
        {goals.slice(0, 4).map(g => <GoalMini key={g.id} g={g} />)}
      </div>
    </div>
  );
}

function GoalMini({ g }: { g: Goal }) {
  const target = Number(g.target_value);
  const current = Number(g.current_value);
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const now = Date.now();
  const start = new Date(g.period_start).getTime();
  const end = new Date(g.period_end).getTime();
  const total = Math.max(1, end - start);
  const expectedPct = Math.min(100, ((now - start) / total) * 100);
  const daysLeft = Math.max(0, Math.round((end - now) / (24 * 60 * 60 * 1000)));
  const onTrack = pct >= expectedPct;
  const barCls =
    pct >= 100 ? 'bg-signal-500'
    : onTrack ? 'bg-signal-500'
    : pct >= expectedPct * 0.7 ? 'bg-pending-500'
    : 'bg-alert-500';
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1 gap-2">
        <span className="font-semibold text-steel-700 truncate">{g.nome}</span>
        <span className="shrink-0 text-steel-500">
          <span className="admin-num font-bold text-steel-900">{current}</span>
          <span className="text-steel-400">/{target}</span>
          {daysLeft > 0 && <span className="admin-num ml-2 text-[10px] text-steel-400">({daysLeft}d)</span>}
        </span>
      </div>
      <div className="relative h-1.5 bg-steel-100 rounded-full overflow-hidden">
        <div className={`absolute top-0 left-0 h-full ${barCls} rounded-full`} style={{ width: `${pct}%` }} />
        {expectedPct < 100 && (
          <div className="absolute top-0 bottom-0 w-px bg-steel-500" style={{ left: `${expectedPct}%` }} />
        )}
      </div>
    </div>
  );
}
