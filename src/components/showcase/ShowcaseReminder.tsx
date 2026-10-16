import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { completeness, emptyShowcase, type Showcase, type ShowcasePhoto } from '@/lib/showcase';

/** Lembrete no Painel enquanto a vitrine estiver abaixo de 70% (com "agora não" por 7 dias) */
export default function ShowcaseReminder({ workshopId }: { workshopId: string }) {
  const [state, setState] = useState<{ s: Showcase; percent: number; next: string | null } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: row }, { data: ph }] = await Promise.all([
        supabase.from('workshop_showcase').select('*').eq('workshop_id', workshopId).maybeSingle(),
        supabase.from('workshop_showcase_photos').select('id, kind').eq('workshop_id', workshopId),
      ]);
      if (!alive) return;
      const s = row ? { ...emptyShowcase(workshopId), ...(row as Showcase) } : emptyShowcase(workshopId);
      const c = completeness(s, (ph as ShowcasePhoto[]) ?? []);
      setState({ s, percent: c.percent, next: c.next?.label ?? null });
    })();
    return () => { alive = false; };
  }, [workshopId]);

  if (!state || hidden) return null;
  const snoozed = state.s.reminder_snoozed_until && new Date(state.s.reminder_snoozed_until) > new Date();
  if (state.percent >= 70 || snoozed) return null;

  async function snooze() {
    setHidden(true);
    const until = new Date(); until.setDate(until.getDate() + 7);
    await supabase.from('workshop_showcase').upsert(
      { workshop_id: workshopId, reminder_snoozed_until: until.toISOString() }, { onConflict: 'workshop_id' },
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-r from-steel-900 to-steel-800 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-bold">🚀 Vamos levar mais clientes até sua oficina?</div>
        <div className="text-sm text-steel-300">
          Sua vitrine está <strong className="text-white">{state.percent}% completa</strong>.
          {state.next && <> Próximo passo: {state.next.toLowerCase()}.</>}
        </div>
        <div className="mt-2 h-1.5 w-56 max-w-full rounded-full bg-white/15 overflow-hidden">
          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.max(3, state.percent)}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={snooze} className="text-xs text-steel-300 hover:text-white">Agora não</button>
        <Link to="/oficina/perfil#vitrine" className="btn-primary text-sm !py-2">Completar vitrine</Link>
      </div>
    </div>
  );
}
