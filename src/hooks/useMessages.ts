import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { playChatAlert } from '@/lib/alertSound';
import type { Message } from '@/types/database';

/**
 * Persistent message subscription that survives tab switches and panel toggles.
 * Uses postgres_changes (realtime) + a 4-second polling fallback so messages
 * always arrive even if the realtime socket drops.
 *
 * @param jobId   id do job
 * @param myId    id do usuário atual — para NÃO tocar som quando ele mesmo envia
 */
export function useMessages(jobId: string | undefined, myId?: string): Message[] {
  const [messages, setMessages] = useState<Message[]>([]);
  const lastEventAt = useRef<number>(0);
  const initialLoadDone = useRef<boolean>(false);

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
      initialLoadDone.current = true;
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    initialLoadDone.current = false;

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
          // 🔔 Toca som SE: load inicial concluído (não buzina pelas msgs antigas)
          //              E a mensagem é de OUTRO usuário (não eu mesmo enviando)
          if (initialLoadDone.current && myId && msg.sender_id !== myId) {
            playChatAlert();
          }
          lastEventAt.current = Date.now();
        },
      )
      .subscribe();

    // 3. Polling fallback — fires every 15 s but only re-fetches if realtime
    //    hasn't delivered anything in the last 14 s (handles WS drop / cold start)
    const poll = setInterval(() => {
      if (Date.now() - lastEventAt.current > 14000) {
        fetchAll();
      }
    }, 15000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [jobId, fetchAll]);

  return messages;
}
