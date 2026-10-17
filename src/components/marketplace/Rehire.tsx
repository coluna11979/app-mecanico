import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/** Último serviço feito por esse mecânico na oficina: base do "chamar de novo" */
export type LastJob = {
  title: string; description: string; pricing: 'hour' | 'fixed';
  price_per_hour: number; max_hours: number; estimated_hours: number | null;
};
export type PastMechanic = {
  id: string; name: string; rating: number; available: boolean;
  /** Nota que a oficina deu no último serviço (null = não avaliou) */
  myRating: number | null; jobs: number; last: LastJob;
};

/** Nota mínima que a oficina deu para o mecânico aparecer em "chamar de novo" (sem nota também entra) */
const MIN_RATING = 4;

type JobRow = LastJob & { mechanic_id: string; mechanic_rating: number | null };

/** Mecânicos que já fizeram serviço na oficina e foram bem avaliados, o mais recente primeiro */
export function usePastMechanics(workshopId: string | null, reloadKey: unknown) {
  const [list, setList] = useState<PastMechanic[]>([]);
  useEffect(() => {
    if (!workshopId) return;
    let alive = true;
    (async () => {
      const { data: jobs } = await supabase.from('jobs')
        .select('mechanic_id, title, description, pricing, price_per_hour, max_hours, estimated_hours, mechanic_rating')
        .eq('workshop_id', workshopId).eq('status', 'completed').not('mechanic_id', 'is', null)
        .order('completed_at', { ascending: false }).limit(100);
      const byMech = new Map<string, { last: JobRow; jobs: number }>();
      for (const j of (jobs ?? []) as JobRow[]) {
        const cur = byMech.get(j.mechanic_id);
        if (cur) cur.jobs++; else byMech.set(j.mechanic_id, { last: j, jobs: 1 });
      }
      const ids = [...byMech.keys()].filter(id => {
        const r = byMech.get(id)!.last.mechanic_rating;
        return r == null || r >= MIN_RATING;
      });
      if (!ids.length) { if (alive) setList([]); return; }
      const { data: mechs } = await supabase.from('mechanics')
        .select('id, rating, is_available, profile:profiles!inner(full_name, status)')
        .in('id', ids).eq('profile.status', 'approved');
      if (!alive) return;
      const info = new Map(((mechs ?? []) as unknown as { id: string; rating: number; is_available: boolean; profile: { full_name: string } }[])
        .map(m => [m.id, m]));
      setList(ids.filter(id => info.has(id)).map(id => {
        const m = info.get(id)!;
        const { last, jobs: n } = byMech.get(id)!;
        return {
          id, name: m.profile.full_name, rating: Number(m.rating) || 0, available: !!m.is_available,
          myRating: last.mechanic_rating, jobs: n,
          last: {
            title: last.title, description: last.description, pricing: last.pricing === 'hour' ? 'hour' : 'fixed',
            price_per_hour: Number(last.price_per_hour) || 0, max_hours: Number(last.max_hours) || 1,
            estimated_hours: last.estimated_hours,
          },
        };
      }));
    })();
    return () => { alive = false; };
  }, [workshopId, reloadKey]);
  return list;
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');

/** "Chamar de novo": quem já trabalhou bem na oficina, a um toque */
export function RehireStrip({ mechanics, disabled, onRehire }: {
  mechanics: PastMechanic[];
  disabled?: boolean;
  onRehire: (m: PastMechanic) => void;
}) {
  if (!mechanics.length) return null;
  return (
    <section className="mb-5">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h2 className="text-[15px] lg:text-lg font-bold">Chamar de novo</h2>
        <span className="text-xs text-steel-500">quem já trabalhou bem com vocês</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {mechanics.slice(0, 6).map(m => (
          <div key={m.id} className="rounded-2xl bg-white ring-1 ring-steel-200/70 p-3 flex items-center gap-3 min-w-0">
            <span className="h-11 w-11 rounded-full bg-brand-50 grid place-items-center text-sm font-bold text-brand-700 shrink-0">{initials(m.name)}</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-steel-900 text-sm leading-tight truncate">{m.name}</div>
              <div className="text-[11px] text-steel-500 truncate">
                {m.rating > 0 ? `★ ${m.rating.toFixed(1)} · ` : ''}{m.jobs} {m.jobs === 1 ? 'serviço' : 'serviços'} aqui
              </div>
              <div className="text-[11px] text-steel-400 truncate">Último: {m.last.title}</div>
            </div>
            {m.available ? (
              <button type="button" disabled={disabled} onClick={() => onRehire(m)}
                className="shrink-0 h-11 px-3 rounded-xl bg-brand-500 text-white text-xs font-bold active:scale-95 hover:bg-brand-600 transition disabled:opacity-50">
                Chamar
              </button>
            ) : (
              <span className="shrink-0 text-[11px] font-semibold text-steel-400 text-right leading-tight w-16">indisponível agora</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
