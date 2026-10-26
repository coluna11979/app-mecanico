import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { BannerCard, DEMO_BANNERS, type PanelBanner } from './BannerCard';

const DISMISS_KEY = (uid: string) => `banners_fechados_${uid}`;

function readDismissed(uid: string): string[] {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY(uid)) || '[]'); } catch { return []; }
}

/**
 * Banners do admin no topo do painel (oficina ou mecânico). O banco só devolve
 * os que estão no ar para o público de quem está logado. Vários: desliza de lado.
 */
export default function PanelBanners({ className = '' }: { className?: string }) {
  const { session, profile } = useAuth();
  const uid = session?.user?.id;
  const role = profile?.role;
  const nav = useNavigate();
  const [items, setItems] = useState<PanelBanner[]>([]);
  const [index, setIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    supabase.from('panel_banners').select('*')
      .order('priority', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return;
        let rows = (data ?? []) as PanelBanner[];
        if (error) {
          // Sem tabela/rede não mostra nada; no localhost mostra exemplos pra ver o visual
          if (!import.meta.env.DEV) return;
          rows = DEMO_BANNERS.filter(b => b.audience === 'all' || b.audience === role);
        }
        const closed = new Set(readDismissed(uid));
        setItems(rows.filter(b => !closed.has(b.id)));
      });
    return () => { alive = false; };
  }, [uid, role]);

  // Conta "visto" uma vez por sessão do navegador
  useEffect(() => {
    const b = items[index];
    if (!b) return;
    if (b.id.startsWith('demo-')) return;
    const key = `banner_visto_${b.id}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* conta mesmo assim */ }
    void supabase.rpc('panel_banner_event', { p_id: b.id, p_kind: 'view' });
  }, [items, index]);

  if (!uid || items.length === 0) return null;

  function open(b: PanelBanner) {
    if (!b.cta_url) return;
    if (!b.id.startsWith('demo-')) void supabase.rpc('panel_banner_event', { p_id: b.id, p_kind: 'click' });
    if (b.cta_url.startsWith('/')) nav(b.cta_url);
    else window.open(b.cta_url, '_blank', 'noopener,noreferrer');
  }

  function dismiss(b: PanelBanner) {
    try { localStorage.setItem(DISMISS_KEY(uid!), JSON.stringify([...readDismissed(uid!), b.id])); } catch { /* fecha só agora */ }
    setItems(list => list.filter(x => x.id !== b.id));
    setIndex(0);
  }

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function go(i: number) {
    scroller.current?.scrollTo({ left: i * scroller.current.clientWidth, behavior: 'smooth' });
  }

  return (
    <div className={className}>
      <div ref={scroller} onScroll={onScroll}
        className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-2xl">
        {items.map(b => (
          <div key={b.id} className="w-full shrink-0 snap-center">
            <BannerCard b={b} onCta={() => open(b)} onDismiss={() => dismiss(b)} />
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1 mt-1">
          {items.map((b, i) => (
            <button key={b.id} onClick={() => go(i)} aria-label={`Banner ${i + 1}`} className="h-6 w-6 grid place-items-center">
              <span className={`block rounded-full transition-all ${i === index ? 'h-2 w-5 bg-brand-500' : 'h-2 w-2 bg-steel-300'}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
