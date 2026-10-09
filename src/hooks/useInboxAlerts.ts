import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { playChatAlert } from '@/lib/alertSound';

/* ── Aviso de mensagem nova do WhatsApp (som + contador no menu) ───────────── */

const LS_MUTED = 'inbox_muted';

/** Som ligado/desligado neste aparelho (botão 🔔 no Inbox) */
export const useInboxMute = create<{ muted: boolean; toggle: () => void }>(set => ({
  muted: (() => { try { return localStorage.getItem(LS_MUTED) === '1'; } catch { return false; } })(),
  toggle: () => set(s => {
    try { localStorage.setItem(LS_MUTED, s.muted ? '0' : '1'); } catch { /* sem localStorage */ }
    return { muted: !s.muted };
  }),
}));

/** Conversas com mensagem não lida; toca o som quando chega mensagem de cliente */
export function useInboxAlerts(workshopId: string | null, enabled: boolean) {
  const [unreadChats, setUnreadChats] = useState(0);

  useEffect(() => {
    if (!workshopId || !enabled) { setUnreadChats(0); return; }
    let alive = true;
    const count = async () => {
      const { count: n } = await supabase.from('whatsapp_chats').select('id', { count: 'exact', head: true })
        .eq('workshop_id', workshopId).gt('unread_count', 0);
      if (alive) setUnreadChats(n ?? 0);
    };
    count();
    const ch = supabase.channel(`wa-alerts-${workshopId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_chats', filter: `workshop_id=eq.${workshopId}` }, () => count())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `workshop_id=eq.${workshopId}` }, p => {
        const m = p.new as { from_me?: boolean };
        if (!m.from_me && !useInboxMute.getState().muted) playChatAlert();
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [workshopId, enabled]);

  return unreadChats;
}
