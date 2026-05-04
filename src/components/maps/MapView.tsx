import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { getSetting } from '@/lib/settings';

export interface Marker { id: string; lat: number; lng: number; color?: string; label?: string }
interface Props {
  center: [number, number];
  zoom?: number;
  markers?: Marker[];
  liveMechanic?: { lat: number; lng: number };
  styleUrl?: string;
  className?: string;
}

export default function MapView({ center, zoom = 13, markers = [], liveMechanic, styleUrl, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markerRefs = useRef<Record<string, mapboxgl.Marker>>({});
  const liveMarker = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const token = await getSetting('mapbox_token', '');
      if (!alive || !ref.current || !token) return;
      mapboxgl.accessToken = token;
      map.current = new mapboxgl.Map({
        container: ref.current,
        style: styleUrl ?? 'mapbox://styles/mapbox/dark-v11',
        center: [center[1], center[0]],
        zoom,
      });
      map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    })();
    return () => { alive = false; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    Object.values(markerRefs.current).forEach(mk => mk.remove());
    markerRefs.current = {};
    markers.forEach(mk => {
      const el = document.createElement('div');
      el.className = 'rounded-full w-8 h-8 border-2 border-white shadow-lg grid place-items-center text-xs font-bold text-white';
      el.style.background = mk.color ?? '#FF5C0A';
      el.textContent = mk.label ?? '';
      const marker = new mapboxgl.Marker(el).setLngLat([mk.lng, mk.lat]).addTo(m);
      markerRefs.current[mk.id] = marker;
    });
  }, [markers]);

  useEffect(() => {
    const m = map.current; if (!m || !liveMechanic) return;
    if (!liveMarker.current) {
      const el = document.createElement('div');
      el.className = 'relative';
      el.innerHTML = `
        <div class="absolute inset-0 -m-4 rounded-full bg-brand-500/30 animate-ping"></div>
        <div class="relative w-10 h-10 rounded-full bg-brand-500 border-2 border-white shadow-lg grid place-items-center text-white text-base">🔧</div>`;
      liveMarker.current = new mapboxgl.Marker(el).setLngLat([liveMechanic.lng, liveMechanic.lat]).addTo(m);
    } else {
      liveMarker.current.setLngLat([liveMechanic.lng, liveMechanic.lat]);
    }
  }, [liveMechanic]);

  return <div ref={ref} className={className ?? 'w-full h-full'} />;
}
