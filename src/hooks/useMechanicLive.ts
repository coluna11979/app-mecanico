/**
 * useMechanicLive — recebe a posição do mecânico em tempo real
 *
 * Prioridade:
 *  1. Supabase Broadcast (canal efêmero do job) — atualização instantânea
 *  2. Fallback: último valor salvo no banco (mechanics.current_lat/lng)
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type LivePos = { lat: number; lng: number; at: string };

export function useMechanicLive(
  mechanicId: string | null,
  jobId?: string | null,
) {
  const [pos, setPos] = useState<LivePos | null>(null);

  // ── Fallback: busca última posição salva no banco ──
  useEffect(() => {
    if (!mechanicId) return;
    supabase
      .from('mechanics')
      .select('current_lat,current_lng,last_location_update')
      .eq('id', mechanicId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.current_lat && data?.current_lng) {
          setPos({
            lat: data.current_lat,
            lng: data.current_lng,
            at: data.last_location_update ?? new Date().toISOString(),
          });
        }
      });
  }, [mechanicId]);

  // ── Canal Broadcast: atualização em tempo real ──
  useEffect(() => {
    if (!jobId) return;

    const ch = supabase.channel(`tracking:${jobId}`);

    ch.on('broadcast', { event: 'position' }, ({ payload }) => {
      const p = payload as { lat: number; lng: number; at: string };
      if (p.lat && p.lng) setPos(p);
    }).subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [jobId]);

  // ── Realtime DB como segundo fallback (caso o canal broadcast falhe) ──
  useEffect(() => {
    if (!mechanicId) return;
    const ch = supabase
      .channel(`mech-db:${mechanicId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mechanics', filter: `id=eq.${mechanicId}` },
        payload => {
          const r = payload.new as { current_lat: number; current_lng: number; last_location_update: string };
          if (r.current_lat && r.current_lng) {
            setPos({ lat: r.current_lat, lng: r.current_lng, at: r.last_location_update });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [mechanicId]);

  return pos;
}
