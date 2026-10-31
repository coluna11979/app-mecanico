import { useEffect, useRef, useState, type ReactNode } from 'react';
import { track } from '../config';

/* ---------------------------------------------------------------------
   Reveal — entrada suave ao rolar (some com prefers-reduced-motion)
   --------------------------------------------------------------------- */
export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-1000 ease-apple motion-reduce:transition-none ${visible ? 'translate-y-0 opacity-100' : 'motion-safe:translate-y-6 motion-safe:opacity-0'} ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------
   Botões — grandes, arredondados, silenciosos
   --------------------------------------------------------------------- */
type BtnProps = { href: string; id: string; children: ReactNode; variant?: 'gold' | 'outline-dark' | 'outline-light'; className?: string; external?: boolean };

const variants = {
  gold: 'bg-gold text-black hover:bg-[#E9B90C]',
  'outline-dark': 'text-white ring-1 ring-inset ring-white/25 hover:ring-white/60',
  'outline-light': 'text-black ring-1 ring-inset ring-black/15 hover:ring-black/40',
};

export function Button({ href, id, children, variant = 'gold', className = '', external = true }: BtnProps) {
  return (
    <a
      href={href}
      onClick={() => track(id, href)}
      {...(external ? { target: '_blank', rel: 'noopener' } : {})}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-7 text-[17px] font-medium tracking-tight transition-all duration-300 ease-apple active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold ${variants[variant]} ${className}`}
    >
      {children}
    </a>
  );
}

/** Link de texto com seta — estilo Apple */
export function ArrowLink({ href, id, children, className = '' }: { href: string; id: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      onClick={() => track(id, href)}
      target={href.startsWith('#') ? undefined : '_blank'}
      rel={href.startsWith('#') ? undefined : 'noopener'}
      className={`group inline-flex min-h-[44px] items-center gap-1.5 text-[17px] font-medium tracking-tight ${className}`}
    >
      <span className="underline-offset-4 group-hover:underline">{children}</span>
      <span aria-hidden="true" className="transition-transform duration-300 ease-apple group-hover:translate-x-1">→</span>
    </a>
  );
}

/** Rótulo pequeno acima dos títulos */
export function Eyebrow({ children, tone = 'mist' }: { children: ReactNode; tone?: 'mist' | 'gold' }) {
  return <p className={`text-[15px] font-semibold tracking-tight ${tone === 'gold' ? 'text-gold' : 'text-mist'}`}>{children}</p>;
}

/* ---------------------------------------------------------------------
   Ícones de linha (monocromáticos, herdam a cor do texto)
   --------------------------------------------------------------------- */
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Icon = {
  oil: () => <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true"><path {...base} d="M12 3.5s-5 6-5 9.5a5 5 0 0 0 10 0c0-3.5-5-9.5-5-9.5Z" /><path {...base} d="M10 13.5a2 2 0 0 0 2 2" /></svg>,
  brake: () => <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true"><circle {...base} cx="12" cy="12" r="8" /><circle {...base} cx="12" cy="12" r="2.5" /><path {...base} strokeWidth={2.4} d="M5 6.5a9.5 9.5 0 0 0 0 11" /></svg>,
  chip: () => <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true"><rect {...base} x="6" y="6" width="12" height="12" rx="2" /><path {...base} d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5" /><rect x="10" y="10" width="4" height="4" rx="0.5" fill="currentColor" /></svg>,
  tire: () => <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true"><circle {...base} cx="12" cy="12" r="9" /><circle {...base} cx="12" cy="12" r="4" /><path {...base} d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>,
  pin: () => <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path {...base} d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21Z" /><circle {...base} cx="12" cy="9.5" r="2.5" /></svg>,
  plus: () => <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true"><path {...base} strokeWidth={2} d="M12 5v14M5 12h14" /></svg>,
  wa: () => <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true"><path fill="currentColor" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.24 8.22Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.13-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.3-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.17-.48-.29Z" /></svg>,
};
