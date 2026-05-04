import { ReactNode, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';

interface NavItem { to: string; icon: string; label: string }

const PLATAFORMA: NavItem[] = [
  { to: '/oficina/dashboard',  icon: '⚡', label: 'Demandas'        },
  { to: '/oficina/buscar',     icon: '🔍', label: 'Buscar mecânicos' },
];

const GESTAO: NavItem[] = [
  { to: '/oficina/os',       icon: '📋', label: 'Ordens de Serviço' },
  { to: '/oficina/clientes', icon: '👥', label: 'Clientes'           },
  { to: '/oficina/perfil',   icon: '🏪', label: 'Perfil da oficina'  },
];

const FERRAMENTAS: NavItem[] = [
  // futuras ferramentas aqui
];

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  const { signOut, profile } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Oficina';
  const initials  = (profile?.full_name ?? 'O')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  return (
    <div className="min-h-screen flex bg-steel-50">

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
        lg:translate-x-0 lg:static lg:z-auto
      `}>

        {/* Logo */}
        <div className="px-5 py-5 border-b border-steel-800">
          <Logo light />
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">

          {/* Plataforma */}
          <div>
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest px-3 mb-2">
              Plataforma
            </div>
            <div className="space-y-0.5">
              {PLATAFORMA.map(item => <SideItem key={item.to} {...item} onClick={() => setOpen(false)} />)}
            </div>
          </div>

          {/* Gestão da oficina */}
          <div>
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest px-3 mb-2">
              Gestão da oficina
            </div>
            <div className="space-y-0.5">
              {GESTAO.map(item => <SideItem key={item.to} {...item} onClick={() => setOpen(false)} />)}
            </div>
          </div>

          {/* Ferramentas */}
          <div>
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest px-3 mb-2">
              Ferramentas
            </div>
            {FERRAMENTAS.length === 0 ? (
              <div className="mx-3 rounded-xl border border-dashed border-steel-700 px-4 py-3 text-center">
                <div className="text-steel-500 text-xs">Em breve</div>
                <div className="text-steel-600 text-[11px] mt-0.5">Relatórios, estoque e mais</div>
              </div>
            ) : (
              <div className="space-y-0.5">
                {FERRAMENTAS.map(item => <SideItem key={item.to} {...item} onClick={() => setOpen(false)} />)}
              </div>
            )}
          </div>
        </nav>

        {/* Usuário */}
        <div className="border-t border-steel-800 p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{firstName}</div>
              <div className="text-[11px] text-steel-500">Oficina</div>
            </div>
            <button
              onClick={() => { signOut(); nav('/login'); }}
              className="text-steel-500 hover:text-white transition text-xs px-2 py-1 rounded-lg hover:bg-steel-800"
              title="Sair"
            >
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* ── Conteúdo principal ── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">

        {/* Topbar mobile */}
        <header className="lg:hidden sticky top-0 z-20 bg-white border-b border-steel-200 flex items-center justify-between px-4 h-14">
          <button
            onClick={() => setOpen(true)}
            className="h-9 w-9 rounded-xl bg-steel-100 grid place-items-center"
          >
            <span className="block w-5 space-y-1">
              <span className="block h-0.5 bg-steel-700 rounded" />
              <span className="block h-0.5 bg-steel-700 rounded" />
              <span className="block h-0.5 bg-steel-700 rounded" />
            </span>
          </button>
          <Logo />
          <div className="w-9" />
        </header>

        <main className="flex-1 p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function SideItem({ to, icon, label, onClick }: NavItem & { onClick: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) => `
        flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
        ${isActive
          ? 'bg-brand-500 text-white shadow-brand'
          : 'text-steel-400 hover:text-white hover:bg-steel-800'
        }
      `}
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span>{label}</span>
    </NavLink>
  );
}
