import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

/** Conta avisos não lidos do usuário atual, com atualização em tempo real. */
export function useUnreadNotifications(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    let alive = true;

    async function fetchCount() {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .eq('read', false);
      if (alive) setCount(count ?? 0);
    }
    fetchCount();

    const ch = supabase.channel(`notif-badge:${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        fetchCount)
      .subscribe();

    return () => { alive = false; supabase.removeChannel(ch); };
  }, [user]);

  return count;
}
