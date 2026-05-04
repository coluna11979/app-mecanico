import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function useMechanicLive(mechanicId: string | null) {
  const [pos, setPos] = useState<{ lat: number; lng: number; at: string } | null>(null);

  useEffect(() => {
    if (!mechanicId) return;
    let alive = true;
    supabase.from('mechanics').select('current_lat,current_lng,last_location_update').eq('id', mechanicId).maybeSingle()
      .then(({ data }) => {
        if (alive && data?.current_lat && data?.current_lng)
          setPos({ lat: data.current_lat, lng: data.current_lng, at: data.last_location_update });
      });
    const ch = supabase.channel(`mech:${mechanicId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'mechanics', filter: `id=eq.${mechanicId}` },
        payload => {
          const r = payload.new as { current_lat: number; current_lng: number; last_location_update: string };
          if (r.current_lat && r.current_lng) setPos({ lat: r.current_lat, lng: r.current_lng, at: r.last_location_update });
        })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [mechanicId]);

  return pos;
}
