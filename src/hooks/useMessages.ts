import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/types/database';

/**
 * Persistent message subscription that survives tab switches and panel toggles.
 * Uses postgres_changes (realtime) + a 4-second polling fallback so messages
 * always arrive even if the realtime socket drops.
 */
export function useMessages(jobId: string | undefined): Message[] {
  const [messages, setMessages] = useState<Message[]>([]);
  const lastEventAt = useRef<number>(0);

  const fetchAll = useCallback(async () => {
    if (!jobId) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });
    if (data) {
      setMessages(data as Message[]);
      lastEventAt.current = Date.now();
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;

    // 1. Initial load
    fetchAll();

    // 2. Realtime subscription — stays alive regardless of which UI tab is shown
    const channel = supabase
      .channel(`messages:job:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `job_id=eq.${jobId}` },
        payload => {
          const msg = payload.new as Message;
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev; // dedup
            return [...prev, msg];
          });
          lastEventAt.current = Date.now();
        },
      )
      .subscribe();

    // 3. Polling fallback — fires every 4 s but only re-fetches if realtime
    //    hasn't delivered anything in the last 3.5 s (handles WS drop / cold start)
    const poll = setInterval(() => {
      if (Date.now() - lastEventAt.current > 3500) {
        fetchAll();
      }
    }, 4000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [jobId, fetchAll]);

  return messages;
}
