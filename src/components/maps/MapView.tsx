import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { getSetting } from '@/lib/settings';

export interface Marker { id: string; lat: number; lng: number; color?: string; label?: string }

interface Props {
  center: [number, number];         // [lat, lng]
  zoom?: number;
  markers?: Marker[];
  liveMechanic?: { lat: number; lng: number };
  routeCoords?: [number, number][]; // [lng, lat][] do Mapbox Directions
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
  // Guarda última routeCoords para aplicar após o style carregar
  const pendingRoute  = useRef<[number, number][] | null>(null);

  /* ── helper: aplica rota no mapa (requer style carregado) ── */
  function applyRoute(m: mapboxgl.Map, coords: [number, number][]) {
    const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coords },
    };
    try {
      // Sombra
      if (m.getSource('route-bg')) {
        (m.getSource('route-bg') as mapboxgl.GeoJSONSource).setData(geojson);
      } else {
        m.addSource('route-bg', { type: 'geojson', data: geojson });
        m.addLayer({
          id: 'route-bg', type: 'line', source: 'route-bg',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#000', 'line-width': 10, 'line-opacity': 0.18 },
        });
      }
      // Linha laranja
      if (m.getSource('route')) {
        (m.getSource('route') as mapboxgl.GeoJSONSource).setData(geojson);
      } else {
        m.addSource('route', { type: 'geojson', data: geojson });
        m.addLayer({
          id: 'route', type: 'line', source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#FF5C0A', 'line-width': 5, 'line-opacity': 0.95 },
        });
      }
      pendingRoute.current = null;
    } catch {
      // style ainda não carregou — salva como pendente
      pendingRoute.current = coords;
    }
  }

  /* ── Inicializa mapa ── */
  useEffect(() => {
    let alive = true;

    (async () => {
      const token = await getSetting('mapbox_token', '');
      if (!alive || !containerRef.current || !token) return;

      mapboxgl.accessToken = token;

      const m = new mapboxgl.Map({
        container: containerRef.current,
        style: styleUrl ?? 'mapbox://styles/mapbox/streets-v12',
        center: [initialCenter.current[1], initialCenter.current[0]],
        zoom,
        pitchWithRotate: false,
      });

      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

      // Quando o style carregar, aplica rota pendente
      m.on('styledata', () => {
        if (pendingRoute.current?.length) {
          applyRoute(m, pendingRoute.current);
        }
      });

      mapRef.current = m;
    })();

    return () => {
      alive = false;
      pendingRoute.current = null;
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
      el.className = 'rounded-full w-9 h-9 border-2 border-white shadow-xl grid place-items-center text-sm text-white';
      el.style.background = mk.color ?? '#FF5C0A';
      el.textContent = mk.label ?? '';
      markerRefs.current[mk.id] = new mapboxgl.Marker(el)
        .setLngLat([mk.lng, mk.lat])
        .addTo(m);
    });
  }, [markers]);

  /* ── Rota: aplica quando chega ou atualiza ── */
  useEffect(() => {
    const m = mapRef.current;

    // Rota removida (chegou na oficina)
    if (!routeCoords?.length) {
      if (m) {
        try { if (m.getLayer('route'))    m.removeLayer('route');    } catch { /* ok */ }
        try { if (m.getLayer('route-bg')) m.removeLayer('route-bg'); } catch { /* ok */ }
        try { if (m.getSource('route'))    m.removeSource('route');    } catch { /* ok */ }
        try { if (m.getSource('route-bg')) m.removeSource('route-bg'); } catch { /* ok */ }
      }
      pendingRoute.current = null;
      return;
    }

    if (!m) {
      // Mapa ainda não criado — salva para aplicar depois
      pendingRoute.current = routeCoords;
      return;
    }

    if (m.isStyleLoaded()) {
      applyRoute(m, routeCoords);
    } else {
      // Style ainda carregando (comum no mobile) — salva como pendente
      pendingRoute.current = routeCoords;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCoords]);

  /* ── Marcador do mecânico + câmera ── */
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !liveMechanic) return;

    const lngLat: [number, number] = [liveMechanic.lng, liveMechanic.lat];

    if (!liveMarkerRef.current) {
      if (!document.getElementById('map-ping-style')) {
        const s = document.createElement('style');
        s.id = 'map-ping-style';
        s.textContent = `@keyframes ping{75%,100%{transform:scale(2);opacity:0}}`;
        document.head.appendChild(s);
      }
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position:relative;width:44px;height:44px;">
          <div style="position:absolute;inset:-8px;border-radius:50%;background:rgba(255,92,10,0.25);animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:relative;width:44px;height:44px;border-radius:50%;background:#FF5C0A;border:3px solid #fff;box-shadow:0 4px 16px rgba(255,92,10,0.5);display:flex;align-items:center;justify-content:center;font-size:20px;">🔧</div>
        </div>`;
      liveMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lngLat).addTo(m);
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
