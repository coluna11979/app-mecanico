import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface Args {
  enabled: boolean;
  jobId: string | null;
  mechanicId: string | null;
  intervalMs?: number;
}

export function useGeoBroadcast({ enabled, jobId, mechanicId, intervalMs = 5000 }: Args) {
  const watchId = useRef<number | null>(null);
  const last = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  const flushTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !jobId || !mechanicId || !navigator.geolocation) return;

    watchId.current = navigator.geolocation.watchPosition(
      pos => { last.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() }; },
      err => console.warn('[geo]', err.message),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );

    flushTimer.current = window.setInterval(async () => {
      const p = last.current; if (!p) return;
      await Promise.all([
        supabase.from('mechanics').update({
          current_lat: p.lat, current_lng: p.lng, last_location_update: new Date().toISOString(),
        }).eq('id', mechanicId),
        supabase.from('job_locations').insert({
          job_id: jobId, mechanic_id: mechanicId, lat: p.lat, lng: p.lng,
        }),
      ]);
    }, intervalMs);

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      if (flushTimer.current) clearInterval(flushTimer.current);
    };
  }, [enabled, jobId, mechanicId, intervalMs]);
}
