/* Ícones do painel do mecânico — traço único (estilo Lucide), herdam a cor do texto.
   Substituem os emojis, que mudam de desenho de um celular pro outro. */
import type { ReactNode } from 'react';

function Svg({ children, className = 'w-5 h-5' }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { className?: string };

export const IconWrench = (p: P) => (
  <Svg {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></Svg>
);
export const IconBell = (p: P) => (
  <Svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></Svg>
);
export const IconCalendar = (p: P) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Svg>
);
export const IconClipboardCheck = (p: P) => (
  <Svg {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3h6v3H9z" /><path d="m9 13 2 2 4-4" /></Svg>
);
export const IconMap = (p: P) => (
  <Svg {...p}><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" /><path d="M9 3v15M15 6v15" /></Svg>
);
export const IconDollar = (p: P) => (
  <Svg {...p}><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></Svg>
);
export const IconUser = (p: P) => (
  <Svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></Svg>
);
export const IconMapPin = (p: P) => (
  <Svg {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></Svg>
);
export const IconStar = ({ className = 'w-5 h-5', filled = false }: P & { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
export const IconAlert = (p: P) => (
  <Svg {...p}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></Svg>
);
export const IconChevronRight = (p: P) => (
  <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>
);
export const IconChevronDown = (p: P) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
export const IconX = (p: P) => (
  <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
);
export const IconInfo = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></Svg>
);
export const IconGift = (p: P) => (
  <Svg {...p}><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5" /></Svg>
);
export const IconClock = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Svg>
);
export const IconNavigation = (p: P) => (
  <Svg {...p}><polygon points="3 11 22 2 13 21 11 13 3 11" /></Svg>
);
export const IconLogOut = (p: P) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></Svg>
);
export const IconBuilding = (p: P) => (
  <Svg {...p}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" /></Svg>
);
