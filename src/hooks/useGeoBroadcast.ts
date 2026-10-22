/**
 * useGeoBroadcast — transmite a posição GPS do mecânico em tempo real
 *
 * Estratégia dupla:
 *  1. Supabase Broadcast (canal efêmero): atualização < 200 ms, sem depender de RLS
 *  2. Escrita no banco a cada 15 s (e logo na primeira posição): persistência + fallback para quem entrar depois
 *
 * Devolve o estado do GPS para a tela avisar o mecânico quando a oficina NÃO está vendo ele
 * (localização bloqueada, sem sinal etc.) — antes o erro era ignorado em silêncio.
 * Limite da web: com o celular bloqueado ou o navegador em segundo plano, o GPS para.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface Args {
  enabled: boolean;
  jobId: string | null;
  mechanicId: string | null;
}

/** idle = não precisa enviar · waiting = esperando o GPS · sharing = enviando · denied = bloqueado · unavailable = sem sinal · unsupported = aparelho sem GPS */
export type GeoState = 'idle' | 'waiting' | 'sharing' | 'denied' | 'unavailable' | 'unsupported';

export function useGeoBroadcast({ enabled, jobId, mechanicId }: Args) {
  const watchId    = useRef<number | null>(null);
  const dbTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPos    = useRef<{ lat: number; lng: number } | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subReady   = useRef(false);
  const [state, setState] = useState<GeoState>('idle');
  const [lastFixAt, setLastFixAt] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !jobId || !mechanicId) { setState('idle'); return; }
    if (!navigator.geolocation) { setState('unsupported'); return; }
    setState('waiting');

    // ── 1. Abre e aguarda o canal Broadcast estar pronto ──
    const ch = supabase.channel(`tracking:${jobId}`, {
      config: { broadcast: { ack: false, self: false } },
    });

    ch.subscribe((status) => {
      subReady.current = status === 'SUBSCRIBED';
    });

    channelRef.current = ch;

    async function persist(p: { lat: number; lng: number }) {
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
    }

    // ── 2. Inicia watchPosition do GPS ──
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const first = lastPos.current === null;
        lastPos.current = { lat, lng };
        setState('sharing');
        setLastFixAt(new Date().toISOString());

        // Primeira posição vai direto pro banco: a oficina vê o mecânico mesmo se o broadcast atrasar
        if (first) persist({ lat, lng });

        // Só envia quando o canal já está conectado
        if (subReady.current) {
          ch.send({
            type: 'broadcast',
            event: 'position',
            payload: { lat, lng, at: new Date().toISOString() },
          });
        }
      },
      (err) => {
        console.warn('[geo]', err.message);
        // 1 = permissão negada · 2 = sem sinal · 3 = demorou (continua tentando)
        if (err.code === 1) setState('denied');
        else if (err.code === 2) setState('unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );

    // ── 3. Persiste no banco a cada 15 s (para fallback e histórico) ──
    dbTimer.current = setInterval(() => {
      const p = lastPos.current;
      if (p) persist(p);
    }, 15_000);

    return () => {
      subReady.current = false;
      lastPos.current = null;
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      if (dbTimer.current) clearInterval(dbTimer.current);
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [enabled, jobId, mechanicId]);

  return { state, lastFixAt };
}
