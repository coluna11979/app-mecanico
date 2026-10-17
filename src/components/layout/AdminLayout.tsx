import { ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { useAdminBadges, AdminBadges } from '@/hooks/useAdminBadges';

type NavItem = {
  to: string;
  label: string;
  icon: (p: { className?: string }) => JSX.Element;
  badge?: (b: AdminBadges) => number;
  badgeTone?: 'brand' | 'alert' | 'warn' | 'neutral';
};

type NavGroup = { label?: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  { items: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: IconHome },
  ]},
  { label: 'Captação', items: [
    { to: '/admin/leads', label: 'Leads', icon: IconTarget,
      badge: b => b.leadsEmPipeline, badgeTone: 'neutral' },
  ]},
  { label: 'Operação', items: [
    { to: '/admin/aprovacoes', label: 'Aprovações', icon: IconCheck,
      badge: b => b.aprovacoesPendentes, badgeTone: 'alert' },
    { to: '/admin/jobs', label: 'Jobs', icon: IconBolt,
      badge: b => b.jobsAtivos, badgeTone: 'warn' },
  ]},
  { label: 'Cadastros', items: [
    { to: '/admin/mecanicos', label: 'Mecânicos', icon: IconWrench },
    { to: '/admin/oficinas',  label: 'Oficinas',  icon: IconBuilding },
  ]},
  { label: 'Financeiro', items: [
    { to: '/admin/repasses',   label: 'Repasses',   icon: IconCash,
      badge: b => b.repassesPendentes, badgeTone: 'brand' },
    { to: '/admin/financeiro', label: 'Financeiro', icon: IconChart },
  ]},
  { label: 'Sistema', items: [
    { to: '/admin/agentes',       label: 'Agentes',       icon: IconSpark },
    { to: '/admin/modulos',       label: 'Módulos',       icon: IconGrid },
    { to: '/admin/avisos',        label: 'Avisos',        icon: IconMegaphone },
    { to: '/admin/embaixadores',  label: 'Embaixadores',  icon: IconUsers },
    { to: '/admin/configuracoes', label: 'Configurações', icon: IconCog },
  ]},
];

const BADGE_TONES: Record<NonNullable<NavItem['badgeTone']>, string> = {
  brand:   'bg-brand-500 text-white',
  alert:   'bg-alert-500 text-white',
  warn:    'bg-pending-500 text-white',
  neutral: 'bg-steel-700 text-steel-200 group-[.active]:bg-brand-400 group-[.active]:text-white',
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { signOut, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const { badges } = useAdminBadges();

  const initials = (profile?.full_name ?? 'A')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-steel-50 flex">
      {open && (
        <div className="fixed inset-0 bg-steel-900/60 z-30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed top-0 left-0 h-full w-60 bg-steel-900 text-white z-40 flex flex-col
        transition-transform duration-200
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto lg:shrink-0
        border-r border-steel-800
      `}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-steel-800">
          <Logo light />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {NAV_GROUPS.map((group, i) => (
            <div key={i} className={`${i > 0 ? 'mt-4' : ''}`}>
              {group.label && (
                <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-steel-500">
                  {group.label}
                </p>
              )}
              <div className="space-y-px">
                {group.items.map(item => {
                  const count = item.badge?.(badges) ?? 0;
                  const tone  = item.badgeTone ?? 'neutral';
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) => `
                        group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors
                        ${isActive
                          ? 'active bg-brand-500/15 text-white'
                          : 'text-steel-300 hover:text-white hover:bg-steel-800'
                        }
                      `}
                    >
                      <item.icon className="w-4 h-4 shrink-0 text-steel-400 group-[.active]:text-brand-400 group-hover:text-steel-200" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {count > 0 && (
                        <span className={`text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center ${BADGE_TONES[tone]}`}>
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-steel-800 p-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-xs shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate leading-tight">{profile?.full_name ?? 'Admin'}</div>
              <div className="text-[10px] text-steel-500 leading-tight">Administrador</div>
            </div>
            <button
              onClick={signOut}
              className="text-steel-500 hover:text-white transition p-1 rounded hover:bg-steel-800"
              title="Sair"
            >
              <IconLogout className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar mobile */}
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-steel-200 flex items-center justify-between px-4 h-14 shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="h-10 w-10 rounded-xl bg-steel-100 grid place-items-center"
            aria-label="Menu"
          >
            <IconMenu className="w-5 h-5 text-steel-700" />
          </button>
          <Logo />
          <div className="w-10" />
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ─────────────── Ícones SVG mono (24px, 1.75 stroke) ─────────────── */
type IP = { className?: string };
function Svg({ className, children }: IP & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}
function IconHome(p: IP)      { return <Svg {...p}><path d="M3 10l9-7 9 7v10a2 2 0 01-2 2h-4v-7h-6v7H5a2 2 0 01-2-2V10z" /></Svg>; }
function IconTarget(p: IP)    { return <Svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Svg>; }
function IconCheck(p: IP)     { return <Svg {...p}><path d="M20 6L9 17l-5-5" /></Svg>; }
function IconBolt(p: IP)      { return <Svg {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></Svg>; }
function IconWrench(p: IP)    { return <Svg {...p}><path d="M14.7 6.3a4 4 0 015.6 5.6l-9.9 9.9-5.6-5.6 9.9-9.9z" /><path d="M9 11l4 4" /></Svg>; }
function IconBuilding(p: IP)  { return <Svg {...p}><rect x="3" y="4" width="18" height="18" rx="1" /><path d="M9 22V12h6v10M9 8h.01M15 8h.01M9 12h.01M15 12h.01" /></Svg>; }
function IconCash(p: IP)      { return <Svg {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></Svg>; }
function IconChart(p: IP)     { return <Svg {...p}><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></Svg>; }
function IconSpark(p: IP)     { return <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" /></Svg>; }
function IconGrid(p: IP)      { return <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Svg>; }
function IconMegaphone(p: IP) { return <Svg {...p}><path d="M3 11v2a2 2 0 002 2h2l5 4V5L7 9H5a2 2 0 00-2 2z" /><path d="M18 5v14" /></Svg>; }
function IconUsers(p: IP)     { return <Svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" transform="translate(2 0)" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></Svg>; }
function IconCog(p: IP)       { return <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" /></Svg>; }
function IconLogout(p: IP)    { return <Svg {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></Svg>; }
function IconMenu(p: IP)      { return <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>; }
