import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { playJobAlert } from '@/lib/alertSound';
import type { Job } from '@/types/database';

interface Options {
  /** Só dispara alertas se o mecânico estiver disponível */
  enabled: boolean;
  /** Callback com o novo job — use para exibir toast / adicionar à lista */
  onNewJob: (job: Job) => void;
}

/**
 * Assina inserções na tabela `jobs` (status=open) via Supabase Realtime.
 * Toca o som de alerta e chama `onNewJob` para cada novo job.
 */
export function useNewJobAlert({ enabled, onNewJob }: Options) {
  const onNewJobRef = useRef(onNewJob);
  useEffect(() => { onNewJobRef.current = onNewJob; }, [onNewJob]);

  useEffect(() => {
    if (!enabled) return;

    const ch = supabase.channel('mechanic:job_alerts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'jobs' },
        payload => {
          const job = payload.new as Job;
          if (job.status !== 'open') return;
          playJobAlert();
          onNewJobRef.current(job);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [enabled]);
}
