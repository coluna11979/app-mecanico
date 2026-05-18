import { ReactNode, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';

const NAV_GROUPS = [
  {
    label: 'Visão Geral',
    items: [
      { to: '/admin/dashboard', icon: '📊', label: 'Dashboard' },
    ],
  },
  {
    label: 'Operações',
    items: [
      { to: '/admin/aprovacoes', icon: '✅', label: 'Aprovações' },
      { to: '/admin/jobs',       icon: '📋', label: 'Jobs'       },
      { to: '/admin/mapa',       icon: '🗺️',  label: 'Mapa Ao Vivo' },
    ],
  },
  {
    label: 'Usuários',
    items: [
      { to: '/admin/mecanicos', icon: '🔧', label: 'Mecânicos' },
      { to: '/admin/oficinas',  icon: '🏭', label: 'Oficinas'  },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/admin/repasses',   icon: '💸', label: 'Repasses'   },
      { to: '/admin/financeiro', icon: '📈', label: 'Financeiro' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { to: '/admin/leads', icon: '🎯', label: 'Leads' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/admin/relatorios',    icon: '📄', label: 'Relatórios'    },
      { to: '/admin/configuracoes', icon: '⚙️', label: 'Configurações' },
    ],
  },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { signOut, profile } = useAuth();
  const [open, setOpen] = useState(false);

  const initials = (profile?.full_name ?? 'A')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-steel-50 flex">

      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-steel-900/60 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed top-0 left-0 h-full w-64 bg-steel-900 text-white z-40 flex flex-col
        transition-transform duration-300
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto lg:shrink-0
      `}>
        {/* Logo */}
        <div className="px-5 py-5 border-b border-steel-800">
          <Logo light />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="mb-2">
              <p className="px-3 mb-1 mt-3 text-[10px] font-semibold uppercase tracking-widest text-steel-500">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => `
                      flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all
                      ${isActive
                        ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/20'
                        : 'text-steel-300 hover:text-white hover:bg-steel-800'
                      }
                    `}
                  >
                    <span className="text-base w-5 text-center">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-steel-800 p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{profile?.full_name ?? 'Admin'}</div>
              <div className="text-[11px] text-steel-500">Administrador</div>
            </div>
            <button
              onClick={signOut}
              className="text-steel-500 hover:text-white transition text-xs px-2 py-1 rounded-lg hover:bg-steel-800"
              title="Sair"
            >
              Sair
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
            <svg className="w-5 h-5 text-steel-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Logo />
          <div className="w-10" />
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
