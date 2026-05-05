import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { getSetting } from '@/lib/settings';

export interface Marker { id: string; lat: number; lng: number; color?: string; label?: string }

interface Props {
  center: [number, number];        // [lat, lng]
  zoom?: number;
  markers?: Marker[];
  liveMechanic?: { lat: number; lng: number };
  routeCoords?: [number, number][]; // [lng, lat][] vindo do Mapbox Directions
  styleUrl?: string;
  className?: string;
  followMechanic?: boolean;
}

export default function MapView({
  center,
  zoom = 13,
  markers = [],
  liveMechanic,
  routeCoords,
  styleUrl,
  className,
  followMechanic = true,
}: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<mapboxgl.Map | null>(null);
  const markerRefs    = useRef<Record<string, mapboxgl.Marker>>({});
  const liveMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const initialCenter = useRef(center);
  const mapLoaded     = useRef(false);

  /* ── Inicia o mapa uma única vez ── */
  useEffect(() => {
    let alive = true;

    (async () => {
      const token = await getSetting('mapbox_token', '');
      if (!alive || !containerRef.current || !token) return;

      mapboxgl.accessToken = token;

      const m = new mapboxgl.Map({
        container: containerRef.current,
        style: styleUrl ?? 'mapbox://styles/mapbox/dark-v11',
        center: [initialCenter.current[1], initialCenter.current[0]],
        zoom,
        pitchWithRotate: false,
      });

      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

      m.on('load', () => {
        mapLoaded.current = true;
      });

      mapRef.current = m;
    })();

    return () => {
      alive = false;
      mapLoaded.current = false;
      liveMarkerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Marcadores estáticos (oficina, etc.) ── */
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    Object.values(markerRefs.current).forEach(mk => mk.remove());
    markerRefs.current = {};
    markers.forEach(mk => {
      const el = document.createElement('div');
      el.className = 'rounded-full w-9 h-9 border-2 border-white shadow-xl grid place-items-center text-sm font-bold text-white';
      el.style.background = mk.color ?? '#FF5C0A';
      el.textContent = mk.label ?? '';
      markerRefs.current[mk.id] = new mapboxgl.Marker(el)
        .setLngLat([mk.lng, mk.lat])
        .addTo(m);
    });
  }, [markers]);

  /* ── Linha da rota ── */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !routeCoords?.length) return;

    const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: routeCoords },
    };

    const apply = () => {
      // Linha de fundo (sombra)
      if (!m.getSource('route-bg')) {
        m.addSource('route-bg', { type: 'geojson', data: geojson });
        m.addLayer({
          id: 'route-bg', type: 'line', source: 'route-bg',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#000', 'line-width': 9, 'line-opacity': 0.25 },
        });
      } else {
        (m.getSource('route-bg') as mapboxgl.GeoJSONSource).setData(geojson);
      }

      // Linha principal laranja
      if (!m.getSource('route')) {
        m.addSource('route', { type: 'geojson', data: geojson });
        m.addLayer({
          id: 'route', type: 'line', source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#FF5C0A', 'line-width': 5, 'line-opacity': 0.95 },
        });
      } else {
        (m.getSource('route') as mapboxgl.GeoJSONSource).setData(geojson);
      }
    };

    if (m.loaded()) apply();
    else m.on('load', apply);
  }, [routeCoords]);

  /* ── Marcador do mecânico + câmera que segue ── */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !liveMechanic) return;

    const lngLat: [number, number] = [liveMechanic.lng, liveMechanic.lat];

    if (!liveMarkerRef.current) {
      // Injeta keyframe de ping
      if (!document.getElementById('map-ping-style')) {
        const style = document.createElement('style');
        style.id = 'map-ping-style';
        style.textContent = `@keyframes ping{75%,100%{transform:scale(2);opacity:0}}`;
        document.head.appendChild(style);
      }
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position:relative;width:44px;height:44px;">
          <div style="position:absolute;inset:-8px;border-radius:50%;background:rgba(255,92,10,0.25);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:relative;width:44px;height:44px;border-radius:50%;background:#FF5C0A;border:3px solid #fff;box-shadow:0 4px 16px rgba(255,92,10,0.5);display:flex;align-items:center;justify-content:center;font-size:20px;">🔧</div>
        </div>`;
      liveMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lngLat)
        .addTo(m);
    } else {
      liveMarkerRef.current.setLngLat(lngLat);
    }

    if (followMechanic) {
      m.easeTo({ center: lngLat, duration: 800, easing: t => t });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveMechanic]);

  /* ── Atualiza centro quando não há liveMechanic ── */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || liveMechanic) return;
    m.easeTo({ center: [center[1], center[0]], duration: 600 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);

  return <div ref={containerRef} className={className ?? 'w-full h-full'} />;
}
