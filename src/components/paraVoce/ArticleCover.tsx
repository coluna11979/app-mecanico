import type { CSSProperties } from 'react';
import { type Article, articleCategory } from '@/lib/paraVoce';

/**
 * Capa automática do artigo, com a cara da marca (usada quando não há imagem).
 * O fundo muda pela categoria; o ícone, pelo público. Na versão "hero" leva o título.
 */

const BG: Record<string, CSSProperties> = {
  renda: { background: 'radial-gradient(110% 120% at 100% 0%, rgba(255,92,10,.55) 0%, rgba(255,92,10,0) 55%), #0B1117' },
  dicas: { background: 'linear-gradient(135deg, #FF7A38 0%, #E64500 100%)' },
  gestao: { background: 'repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 12px, transparent 12px 26px), linear-gradient(160deg, #151C24 0%, #222C37 100%)' },
  tecnica: { background: 'radial-gradient(90% 120% at 0% 100%, rgba(255,92,10,.35) 0%, rgba(255,92,10,0) 60%), #151C24' },
  atendimento: { background: 'radial-gradient(100% 120% at 0% 0%, rgba(255,122,56,.45) 0%, rgba(255,122,56,0) 55%), #222C37' },
  equipe: { background: 'repeating-linear-gradient(90deg, rgba(255,255,255,.035) 0 2px, transparent 2px 22px), radial-gradient(90% 110% at 100% 100%, rgba(255,92,10,.45), rgba(255,92,10,0) 60%), #0B1117' },
  novidades: { background: 'repeating-conic-gradient(from 200deg at 92% 0%, rgba(255,92,10,.16) 0deg 4deg, transparent 4deg 10deg), radial-gradient(80% 90% at 92% 0%, rgba(255,92,10,.5), rgba(255,92,10,0) 70%), #0B1117' },
};

const ICON: Record<string, string[]> = {
  // chave de boca (mecânico), oficina (prédio com portão), os dois (pessoas)
  mechanic: ['M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z'],
  workshop: ['M3 21V9l9-6 9 6v12', 'M7 21v-7h10v7', 'M7 17.5h10'],
  all: ['M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2', 'M9 11a4 4 0 100-8 4 4 0 000 8z', 'M22 21v-2a4 4 0 00-3-3.87', 'M16 3.13a4 4 0 010 7.75'],
};

const SHAPE = 'M32 10c-7.2 0-13 5.8-13 13 0 4.6 2.4 8.6 6 10.9V50a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V33.9c3.6-2.3 6-6.3 6-10.9 0-7.2-5.8-13-13-13Zm0 6.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Z';

function BrandMark({ hero, label, light = true }: { hero: boolean; label?: string; light?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 64 64" className={hero ? 'w-8 h-8' : 'w-6 h-6'} aria-hidden>
        <rect width="64" height="64" rx="14" fill="#0B1117" />
        <path fill="#FF5C0A" d={SHAPE} />
      </svg>
      {label && <span className={`font-bold uppercase tracking-wider ${hero ? 'text-xs' : 'text-[10px]'} ${light ? 'text-white/90' : 'text-steel-900'}`}>{label}</span>}
    </div>
  );
}

export default function ArticleCover({ a, variant = 'card', className = '' }: {
  a: Pick<Article, 'title' | 'category' | 'audience' | 'cover_url'> & { cover_credit?: string | null };
  variant?: 'card' | 'hero';
  className?: string;
}) {
  const hero = variant === 'hero';

  // Com foto: a foto ligada ao assunto + acabamento da marca por cima (estilo editorial)
  if (a.cover_url) {
    return (
      <div className={`relative w-full overflow-hidden bg-steel-900 ${hero ? 'min-h-[18rem] sm:min-h-[22rem]' : 'h-full'} ${className}`}>
        <img src={a.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        <div className="absolute inset-0" style={{ background: hero
          ? 'linear-gradient(180deg, rgba(11,17,23,.35) 0%, rgba(11,17,23,.05) 35%, rgba(11,17,23,.85) 100%)'
          : 'linear-gradient(180deg, rgba(11,17,23,.3) 0%, rgba(11,17,23,0) 35%)' }} />
        <div className="absolute left-0 bottom-0 h-1.5 w-1/3 bg-brand-500" />
        <div className={`relative flex flex-col ${hero ? 'min-h-[18rem] sm:min-h-[22rem] p-5 pb-9 sm:p-8 sm:pb-10' : 'h-full p-3'}`}>
          {/* No cartão fica só o ícone: o nome da categoria cobria a ilustração */}
          <BrandMark hero={hero} label={hero ? articleCategory(a.category) : undefined} />
          {hero && (
            <h1 className="font-display font-bold text-white text-2xl sm:text-4xl leading-tight mt-auto pt-12 max-w-[22ch] drop-shadow">
              {a.title}
            </h1>
          )}
        </div>
        {hero && a.cover_credit && (
          <span className="absolute bottom-2.5 right-3 text-[10px] text-white/60">{a.cover_credit}</span>
        )}
      </div>
    );
  }

  const onOrange = a.category === 'dicas';
  const accent = onOrange ? '#0B1117' : '#FF7A38';

  return (
    <div className={`relative w-full overflow-hidden ${hero ? 'min-h-[18rem] sm:min-h-[22rem]' : 'h-full'} ${className}`} style={BG[a.category] ?? BG.renda}>
      {/* Ícone grande do público, vazando pela direita */}
      <svg viewBox="0 0 24 24" aria-hidden
        className={`absolute ${hero ? '-right-6 -bottom-8 w-64 h-64 sm:w-80 sm:h-80' : '-right-4 -bottom-6 w-40 h-40'}`}
        fill="none" stroke={accent} strokeOpacity={onOrange ? 0.22 : 0.35} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
        {(ICON[a.audience] ?? ICON.all).map(d => <path key={d} d={d} />)}
      </svg>

      <div className={`relative flex flex-col ${hero ? 'min-h-[18rem] sm:min-h-[22rem] p-5 sm:p-8' : 'h-full p-4 justify-between'}`}>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 64 64" className={hero ? 'w-8 h-8' : 'w-6 h-6'} aria-hidden>
            <rect width="64" height="64" rx="14" fill="#0B1117" />
            <path fill="#FF5C0A" d={SHAPE} />
          </svg>
          <span className={`font-bold uppercase tracking-wider ${hero ? 'text-xs' : 'text-[10px]'} ${onOrange ? 'text-steel-900' : 'text-white/80'}`}>
            {articleCategory(a.category)}
          </span>
        </div>
        {hero ? (
          <h1 className="font-display font-bold text-white text-2xl sm:text-4xl leading-tight mt-auto pt-12 max-w-[20ch] drop-shadow-sm">
            {a.title}
          </h1>
        ) : (
          // No cartão o título já vem logo abaixo; a capa diz pra quem é
          <div className={`font-display font-bold leading-tight text-xl ${onOrange ? 'text-steel-900' : 'text-white'}`}>
            {a.audience === 'mechanic' ? 'Para mecânicos' : a.audience === 'workshop' ? 'Para oficinas' : 'Mecânicos e oficinas'}
          </div>
        )}
      </div>
    </div>
  );
}
