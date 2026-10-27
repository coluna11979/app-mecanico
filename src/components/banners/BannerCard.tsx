import { type CSSProperties, useEffect, useRef, useState } from 'react';

export type BannerTheme = 'grafite' | 'laranja' | 'claro' | 'impacto';
export type BannerBadge = 'novidade' | 'lancamento' | 'promocao' | 'aviso';

export interface PanelBanner {
  id: string;
  audience: 'workshop' | 'mechanic' | 'all';
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_url: string | null;
  theme: BannerTheme;
  badge: BannerBadge | null;
  image_url: string | null;
  illustration_url?: string | null;   // ilustração da biblioteca ao lado do texto
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  priority: number;
  dismissible: boolean;
  views: number;
  clicks: number;
  created_at: string;
}

/** Só no localhost, quando a tabela ainda não existe no banco: banners de exemplo pra ver o visual. */
const demo = (id: string, b: Partial<PanelBanner>): PanelBanner => ({
  id, audience: 'all', title: '', body: null, cta_label: null, cta_url: null, theme: 'grafite', badge: null,
  image_url: null, starts_at: new Date().toISOString(), ends_at: null, active: true, priority: 0,
  dismissible: true, views: 0, clicks: 0, created_at: new Date().toISOString(), ...b,
});
export const DEMO_BANNERS: PanelBanner[] = [
  demo('demo-1', { audience: 'mechanic', theme: 'laranja', badge: 'novidade', title: 'Indique mecânicos e ganhe com isso',
    body: 'Vire embaixador: você recebe uma parte da nossa comissão pelos serviços de quem você indicar.',
    cta_label: 'Quero ser embaixador', cta_url: '/mecanico/embaixador' }),
  demo('demo-2', { audience: 'mechanic', theme: 'grafite', badge: 'aviso', title: 'Perfil completo recebe mais chamados',
    body: 'Foto, especialidades e valor/hora em dia ajudam as oficinas a escolherem você.',
    cta_label: 'Completar perfil', cta_url: '/mecanico/perfil' }),
  demo('demo-3', { audience: 'workshop', theme: 'grafite', badge: 'novidade', title: 'Pátio cheio? Chame um mecânico em minutos',
    body: 'Publique a demanda e profissionais verificados da sua região aceitam.',
    cta_label: 'Chamar mecânico', cta_url: '/oficina/dashboard' }),
  demo('demo-4', { audience: 'all', theme: 'impacto', badge: 'lancamento', title: 'Novidade no MecânicoApp',
    body: 'Exemplo de banner para todos os usuários.' }),
];

export const BANNER_THEMES: { v: BannerTheme; label: string }[] = [
  { v: 'grafite', label: 'Grafite' },
  { v: 'laranja', label: 'Laranja' },
  { v: 'claro',   label: 'Claro' },
  { v: 'impacto', label: 'Impacto' },
];

export const BANNER_BADGES: { v: BannerBadge; label: string; emoji: string }[] = [
  { v: 'novidade',   label: 'Novidade',   emoji: '✨' },
  { v: 'lancamento', label: 'Lançamento', emoji: '🚀' },
  { v: 'promocao',   label: 'Promoção',   emoji: '🏷️' },
  { v: 'aviso',      label: 'Aviso',      emoji: '📢' },
];

const THEME_STYLE: Record<BannerTheme, { box: CSSProperties; title: string; body: string; cta: string; badge: string; close: string }> = {
  grafite: {
    box: { background: 'radial-gradient(120% 140% at 100% 0%, rgba(255,92,10,.38) 0%, rgba(255,92,10,0) 55%), #0B1117' },
    title: 'text-white', body: 'text-steel-300', cta: 'bg-brand-500 text-white', badge: 'bg-brand-500/20 text-brand-300', close: 'text-steel-400',
  },
  laranja: {
    box: { background: 'linear-gradient(135deg, #FF7A38 0%, #E64500 100%)' },
    title: 'text-white', body: 'text-white/85', cta: 'bg-steel-900 text-white', badge: 'bg-white/20 text-white', close: 'text-white/80',
  },
  claro: {
    box: { background: 'linear-gradient(120deg, #FFFFFF 60%, #FFF4ED 100%)', boxShadow: 'inset 0 0 0 1px #FFC9A8' },
    title: 'text-steel-900', body: 'text-steel-600', cta: 'bg-steel-900 text-white', badge: 'bg-brand-500/10 text-brand-700', close: 'text-steel-400',
  },
  impacto: {
    box: { background: 'repeating-linear-gradient(135deg, rgba(255,255,255,.03) 0 10px, transparent 10px 22px), linear-gradient(100deg, #151C24 84%, #E64500 84.2%, #FF7A38 100%)' },
    title: 'text-white', body: 'text-steel-300', cta: 'bg-white text-steel-900', badge: 'bg-brand-500/20 text-brand-300', close: 'text-white/80',
  },
};

/**
 * Banner dos painéis. Com imagem: mostra a arte inteira (e o botão por cima, se houver).
 * Sem imagem: desenho padrão com o tema da marca.
 */
export function BannerCard({ b, onCta, onDismiss }: {
  b: Pick<PanelBanner, 'title' | 'body' | 'cta_label' | 'cta_url' | 'theme' | 'badge' | 'image_url' | 'dismissible'> & { illustration_url?: string | null };
  onCta?: () => void;
  onDismiss?: () => void;
}) {
  const s = THEME_STYLE[b.theme] ?? THEME_STYLE.grafite;
  // Lado a lado só quando o próprio banner é largo (não a tela): funciona em coluna estreita no PC
  const box = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const badge = BANNER_BADGES.find(x => x.v === b.badge);
  const hasCta = !!(b.cta_label && b.cta_url);

  const close = b.dismissible && onDismiss ? (
    <button onClick={onDismiss} aria-label="Fechar banner"
      className={`absolute top-1 right-1 h-11 w-11 grid place-items-center rounded-full ${b.image_url ? 'text-white drop-shadow' : s.close}`}>
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  ) : null;

  if (b.image_url) {
    return (
      <div ref={box} className="mech-keep-dark relative rounded-2xl overflow-hidden bg-steel-100">
        <button type="button" onClick={hasCta ? onCta : undefined} className={`block w-full ${hasCta ? '' : 'cursor-default'}`}
          aria-label={b.title}>
          <img src={b.image_url} alt={b.title} className="w-full h-auto block" />
        </button>
        {close}
      </div>
    );
  }

  // Com ilustração: cartão editorial (imagem em cima no celular, ao lado no largo)
  if (b.illustration_url) {
    return (
      <div ref={box} className="mech-keep-dark relative rounded-2xl overflow-hidden flex items-stretch" style={s.box}>
        <div className={`shrink-0 order-2 ${wide ? 'w-[40%]' : 'w-[34%]'}`}>
          <img src={b.illustration_url} alt="" className="w-full h-full object-cover saturate-[.75]" loading="lazy" />
        </div>
        <div className={`min-w-0 flex-1 flex flex-col justify-center order-1 ${wide ? 'px-6 py-5' : 'px-4 py-3'}`}>
          {badge && (
            <span className={`self-start inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 mb-1.5 ${s.badge}`}>
              {badge.emoji} {badge.label}
            </span>
          )}
          <div className={`font-display font-bold leading-snug ${wide ? 'text-xl' : 'text-base'} ${s.title}`}>{b.title}</div>
          {b.body && <p className={`mt-0.5 leading-snug line-clamp-2 ${wide ? 'text-sm' : 'text-[13px]'} ${s.body}`}>{b.body}</p>}
          {hasCta && (
            <button type="button" onClick={onCta}
              className={`mt-2 self-start inline-flex items-center gap-1.5 rounded-xl px-3.5 min-h-[44px] text-sm font-bold ${s.cta}`}>
              {b.cta_label} <span aria-hidden>→</span>
            </button>
          )}
        </div>
        {b.dismissible && onDismiss && (
          <button onClick={onDismiss} aria-label="Fechar banner"
            className="absolute top-1 right-1 h-11 w-11 grid place-items-center">
            <span className="h-7 w-7 grid place-items-center rounded-full bg-black/40 text-white">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    // mech-keep-dark: o banner tem fundo próprio; o modo claro do mecânico não pode inverter as cores dele
    <div ref={box} className={`mech-keep-dark relative rounded-2xl overflow-hidden flex flex-col justify-center ${wide ? 'px-6 py-5' : 'px-4 py-3'}`} style={s.box}>
      <div className={`${wide ? 'flex items-center gap-6' : ''} ${b.dismissible && onDismiss ? 'pr-10' : ''}`}>
        <div className="min-w-0 flex-1">
          {badge && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 mb-1.5 ${s.badge}`}>
              {badge.emoji} {badge.label}
            </span>
          )}
          <div className={`font-display font-bold leading-snug ${wide ? 'text-xl' : 'text-base'} ${s.title}`}>{b.title}</div>
          {b.body && <p className={`mt-0.5 leading-snug line-clamp-2 ${wide ? 'text-sm' : 'text-[13px]'} ${s.body}`}>{b.body}</p>}
        </div>
        {hasCta && (
          <button type="button" onClick={onCta}
            className={`${wide ? '' : 'mt-2'} shrink-0 inline-flex items-center gap-1.5 rounded-xl px-4 min-h-[44px] text-sm font-bold ${s.cta}`}>
            {b.cta_label} <span aria-hidden>→</span>
          </button>
        )}
      </div>
      {close}
    </div>
  );
}
