import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/* Primitivas visuais da home. Tudo mobile-first, sem dependência externa. */

export function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

type Tone = 'light' | 'muted' | 'dark';
const TONE: Record<Tone, string> = {
  light: 'bg-white text-steel-900',
  muted: 'bg-steel-50 text-steel-900',
  dark:  'bg-steel-900 text-white',
};

export function Section({ id, tone = 'light', children, className = '', labelledBy }: {
  id?: string; tone?: Tone; children: ReactNode; className?: string; labelledBy?: string;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy}
      className={`scroll-mt-16 py-14 sm:py-20 lg:py-28 ${TONE[tone]} ${className}`}>
      {children}
    </section>
  );
}

export function Kicker({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className={`text-xs font-bold uppercase tracking-[0.14em] sm:tracking-[0.18em] ${dark ? 'text-brand-400' : 'text-brand-600'}`}>
      {children}
    </p>
  );
}

export function SectionHead({ id, kicker, title, sub, dark = false, center = false }: {
  id?: string; kicker: string; title: ReactNode; sub?: ReactNode; dark?: boolean; center?: boolean;
}) {
  return (
    <div className={`max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
      <Kicker dark={dark}>{kicker}</Kicker>
      <h2 id={id} className="mt-3 font-display text-[1.75rem] font-bold leading-[1.12] tracking-tight sm:text-4xl sm:leading-[1.08] lg:text-5xl">
        {title}
      </h2>
      {sub && (
        <p className={`mt-4 text-base leading-relaxed sm:mt-5 sm:text-lg ${dark ? 'text-steel-300' : 'text-steel-600'}`}>{sub}</p>
      )}
    </div>
  );
}

/* ── Botões ── */

type Variant = 'primary' | 'dark' | 'outline' | 'ghost' | 'white';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600',
  dark:    'bg-steel-900 text-white shadow-lg shadow-steel-900/15 hover:bg-steel-800',
  outline: 'border border-steel-200 bg-white text-steel-900 hover:border-steel-300 hover:bg-steel-50',
  ghost:   'text-steel-700 hover:text-steel-900',
  white:   'bg-white text-steel-900 hover:bg-steel-100',
};
const BTN_BASE = 'group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-bold sm:min-h-[48px] transition duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';

interface BtnProps { children: ReactNode; variant?: Variant; className?: string; arrow?: boolean }

function Inner({ children, arrow }: { children: ReactNode; arrow?: boolean }) {
  return (
    <>
      {children}
      {arrow && <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>}
    </>
  );
}

export function ButtonLink({ to, children, variant = 'primary', className = '', arrow }: BtnProps & { to: string }) {
  return (
    <Link to={to} className={`${BTN_BASE} ${VARIANT[variant]} ${className}`}>
      <Inner arrow={arrow}>{children}</Inner>
    </Link>
  );
}

export function Button({ onClick, children, variant = 'primary', className = '', arrow }: BtnProps & { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${BTN_BASE} ${VARIANT[variant]} ${className}`}>
      <Inner arrow={arrow}>{children}</Inner>
    </button>
  );
}

/* ── Cards ── */

export function FeatureCard({ icon, title, desc, dark = false }: {
  icon: IconName; title: string; desc: string; dark?: boolean;
}) {
  return (
    <div className={`group flex gap-4 rounded-2xl border p-4 transition duration-300 hover:-translate-y-0.5 sm:block sm:p-5 ${
      dark
        ? 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]'
        : 'border-steel-100 bg-white shadow-sm hover:border-brand-200 hover:shadow-md'
    }`}>
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${dark ? 'bg-brand-500/15 text-brand-400' : 'bg-brand-50 text-brand-600'}`}>
        <Icon name={icon} />
      </span>
      <div className="min-w-0">
        <h3 className={`font-bold leading-snug sm:mt-4 ${dark ? 'text-white' : 'text-steel-900'}`}>{title}</h3>
        <p className={`mt-1 text-[15px] leading-relaxed sm:mt-1.5 sm:text-sm ${dark ? 'text-steel-300' : 'text-steel-600'}`}>{desc}</p>
      </div>
    </div>
  );
}

export function Check({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${dark ? 'bg-brand-500/20 text-brand-400' : 'bg-brand-50 text-brand-600'}`}>
        <Icon name="check" size={12} />
      </span>
      <span>{children}</span>
    </li>
  );
}

/** Selo visível de conteúdo provisório — só deve aparecer em dev. */
export function PlaceholderTag() {
  return (
    <span className="inline-flex items-center rounded-md border border-dashed border-pending-500 bg-pending-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-pending-700">
      Placeholder · substituir
    </span>
  );
}

/* ── Reveal: entrada suave ao rolar (respeita prefers-reduced-motion) ── */

export function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }}
      className={`transition duration-700 ease-out motion-reduce:transition-none ${shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} ${className}`}>
      {children}
    </div>
  );
}

/* ── Ícones (traço 2px, 24x24) ── */

export type IconName =
  | 'check' | 'megaphone' | 'search' | 'user' | 'star' | 'heart' | 'repeat' | 'users' | 'shield'
  | 'clock' | 'wallet' | 'calendar' | 'trend' | 'lock' | 'id' | 'chat' | 'history' | 'wrench'
  | 'car' | 'clipboard' | 'menu' | 'close' | 'plus' | 'chevron';

const PATHS: Record<IconName, ReactNode> = {
  check:     <path d="M5 12.5l4.5 4.5L19 7.5" />,
  megaphone: <><path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z" /><path d="M17 9a4 4 0 0 1 0 6" /></>,
  search:    <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  user:      <><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" /></>,
  star:      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  heart:     <path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7.5 3c0 5.4-7.5 10-7.5 10z" />,
  repeat:    <><path d="M4 12a7 7 0 0 1 12-4.9L18 9" /><path d="M18 4v5h-5" /><path d="M20 12a7 7 0 0 1-12 4.9L6 15" /><path d="M6 20v-5h5" /></>,
  users:     <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 19c1-3 3.6-4.5 6.5-4.5s5.5 1.5 6.5 4.5" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4" /><path d="M18 14.8c1.6.6 2.8 2 3.5 4.2" /></>,
  shield:    <><path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" /><path d="M8.5 12l2.5 2.5 4.5-4.5" /></>,
  clock:     <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  wallet:    <><rect x="3" y="6" width="18" height="13" rx="2.5" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1" /></>,
  calendar:  <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  trend:     <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  lock:      <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  id:        <><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16c.6-1.5 1.8-2.3 3.2-2.3s2.6.8 3.2 2.3M14.5 10h4M14.5 13.5h3" /></>,
  chat:      <path d="M4.5 18.5V7a2.5 2.5 0 0 1 2.5-2.5h10A2.5 2.5 0 0 1 19.5 7v6a2.5 2.5 0 0 1-2.5 2.5H8z" />,
  history:   <><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /><path d="M12 8v4l3 2" /></>,
  wrench:    <path d="M14.5 4a5 5 0 0 0-4.6 6.9l-6 6a1.8 1.8 0 0 0 2.6 2.6l6-6A5 5 0 0 0 19.8 7.7l-3 3-2.5-.5-.5-2.5 3-3A5 5 0 0 0 14.5 4z" />,
  car:       <><path d="M4 16.5V12l2-5h12l2 5v4.5" /><path d="M3 16.5h18v2H3z" /><circle cx="7.5" cy="13.5" r="1" /><circle cx="16.5" cy="13.5" r="1" /></>,
  clipboard: <><rect x="5" y="4.5" width="14" height="16" rx="2.5" /><path d="M9 4.5h6v3H9zM8.5 12h7M8.5 16h4.5" /></>,
  menu:      <path d="M4 7h16M4 12h16M4 17h16" />,
  close:     <path d="M6 6l12 12M18 6L6 18" />,
  plus:      <path d="M12 5v14M5 12h14" />,
  chevron:   <path d="M6 9l6 6 6-6" />,
};

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {PATHS[name]}
    </svg>
  );
}
