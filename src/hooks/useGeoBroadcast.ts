/**
 * useGeoBroadcast — transmite a posição GPS do mecânico em tempo real
 *
 * Estratégia dupla:
 *  1. Supabase Broadcast (canal efêmero): atualização < 200 ms, sem depender de RLS
 *  2. Escrita no banco a cada 15 s: persistência + fallback para quem entrar depois
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface Args {
  enabled: boolean;
  jobId: string | null;
  mechanicId: string | null;
}

export function useGeoBroadcast({ enabled, jobId, mechanicId }: Args) {
  const watchId    = useRef<number | null>(null);
  const dbTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPos    = useRef<{ lat: number; lng: number } | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subReady   = useRef(false);

  useEffect(() => {
    if (!enabled || !jobId || !mechanicId || !navigator.geolocation) return;

    // ── 1. Abre e aguarda o canal Broadcast estar pronto ──
    const ch = supabase.channel(`tracking:${jobId}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    ch.subscribe((status) => {
      subReady.current = status === 'SUBSCRIBED';
    });

    channelRef.current = ch;

    // ── 2. Inicia watchPosition do GPS ──
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        lastPos.current = { lat, lng };

        // Só envia quando o canal já está conectado
        if (subReady.current) {
          ch.send({
            type: 'broadcast',
            event: 'position',
            payload: { lat, lng, at: new Date().toISOString() },
          });
        }
      },
      (err) => console.warn('[geo]', err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );

    // ── 3. Persiste no banco a cada 15 s (para fallback e histórico) ──
    dbTimer.current = setInterval(async () => {
      const p = lastPos.current;
      if (!p) return;
      try {
        await Promise.all([
          supabase
            .from('mechanics')
            .update({
              current_lat: p.lat,
              current_lng: p.lng,
              last_location_update: new Date().toISOString(),
            })
            .eq('id', mechanicId),
          supabase.from('job_locations').insert({
            job_id: jobId,
            mechanic_id: mechanicId,
            lat: p.lat,
            lng: p.lng,
          }),
        ]);
      } catch {
        // silencioso — broadcast principal já está funcionando
      }
    }, 15_000);

    return () => {
      subReady.current = false;
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      if (dbTimer.current) clearInterval(dbTimer.current);
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [enabled, jobId, mechanicId]);
}
