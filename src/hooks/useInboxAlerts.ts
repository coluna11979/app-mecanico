import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { playChatAlert } from '@/lib/alertSound';
import { toast } from '@/components/ui/Toast';
import { sectorVisible, type Sector } from '@/lib/inbox';

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

/** Conversas com mensagem não lida; toca o som quando chega mensagem de cliente ou conversa transferida.
 *  `role` = função no modo balcão (null = fora do balcão): transferência só avisa quem vê o setor. */
export function useInboxAlerts(workshopId: string | null, enabled: boolean, role: string | null = null) {
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_chats', filter: `workshop_id=eq.${workshopId}` }, async p => {
        count();
        // Conversa transferida de setor: avisa quem vê o setor de destino
        const n = p.new as { transferred_at?: string | null; sector_id?: string | null; name?: string | null; phone?: string };
        const o = p.old as { transferred_at?: string | null };
        if (p.eventType !== 'UPDATE' || !n.transferred_at || n.transferred_at === o?.transferred_at || !n.sector_id) return;
        const { data } = await supabase.from('whatsapp_sectors').select('*').eq('id', n.sector_id).maybeSingle();
        const s = data as Sector | null;
        if (!s || !sectorVisible(s, role)) return;
        if (!useInboxMute.getState().muted) playChatAlert();
        toast.info(`↪ Conversa de ${n.name || n.phone || 'cliente'} transferida para ${s.icon} ${s.name}`);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `workshop_id=eq.${workshopId}` }, p => {
        const m = p.new as { from_me?: boolean };
        if (!m.from_me && !useInboxMute.getState().muted) playChatAlert();
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [workshopId, enabled, role]);

  return unreadChats;
}
