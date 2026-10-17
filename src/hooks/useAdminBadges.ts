import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface AdminBadges {
  aprovacoesPendentes: number;
  jobsAtivos: number;
  repassesPendentes: number;
  leadsEmPipeline: number;
}

const EMPTY: AdminBadges = {
  aprovacoesPendentes: 0, jobsAtivos: 0, repassesPendentes: 0, leadsEmPipeline: 0,
};

/**
 * Contagens live para os badges do sidebar e do dashboard.
 * Usa `head: true` em todas (zero bytes de linha, só o count) — egress-safe.
 * Refaz a cada 60s + quando a aba volta a ficar visível.
 */
export function useAdminBadges() {
  const [badges, setBadges] = useState<AdminBadges>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function load() {
      const [a, j, r, l] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true })
          .in('status', ['pending', 'under_review']).neq('role', 'admin'),
        supabase.from('jobs').select('*', { count: 'exact', head: true })
          .in('status', ['assigned', 'in_progress']),
        supabase.from('jobs').select('*', { count: 'exact', head: true })
          .eq('status', 'completed').is('repasse_pago_at', null).not('workshop_confirmed_at', 'is', null),
        supabase.from('leads').select('*', { count: 'exact', head: true })
          .not('status', 'in', '(convertido,perdido)'),
      ]);
      if (!alive) return;
      setBadges({
        aprovacoesPendentes: a.count ?? 0,
        jobsAtivos:          j.count ?? 0,
        repassesPendentes:   r.count ?? 0,
        leadsEmPipeline:     l.count ?? 0,
      });
      setLoading(false);
    }

    load();
    interval = setInterval(load, 60_000);

    function onVisible() { if (document.visibilityState === 'visible') load(); }
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      if (interval) clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { badges, loading };
}
