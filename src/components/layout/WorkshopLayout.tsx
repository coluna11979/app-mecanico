import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';
import { supabase } from '@/lib/supabase';

interface NavItem { to: string; icon: string; label: string }

const PLATAFORMA: NavItem[] = [
  { to: '/oficina/dashboard',  icon: '⚡', label: 'Demandas'         },
  { to: '/oficina/buscar',     icon: '🔍', label: 'Buscar mecânicos' },
  { to: '/oficina/mensagens',  icon: '💬', label: 'Mensagens'        },
];

const GESTAO: NavItem[] = [
  { to: '/oficina/os',       icon: '📋', label: 'Ordens de Serviço' },
  { to: '/oficina/clientes', icon: '👥', label: 'Clientes'           },
  { to: '/oficina/perfil',   icon: '🏪', label: 'Perfil da oficina'  },
];

const BOTTOM_TABS: NavItem[] = [
  { to: '/oficina/dashboard',  icon: '⚡', label: 'Demandas'  },
  { to: '/oficina/mensagens',  icon: '💬', label: 'Mensagens' },
  { to: '/oficina/os',         icon: '📋', label: 'OS'        },
  { to: '/oficina/perfil',     icon: '🏪', label: 'Perfil'    },
];

const LS_KEY = 'oficina_msgs_last_seen';

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  const { signOut, profile, user } = useAuth();
  const nav      = useNavigate();
  const location = useLocation();
  const [open, setOpen]         = useState(false);
  const [unread, setUnread]     = useState(0);
  const [shopId, setShopId]     = useState<string | null>(null);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Oficina';
  const initials  = (profile?.full_name ?? 'O')
    .split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  /* ── Busca workshop ID uma vez ── */
  useEffect(() => {
    if (!user) return;
    supabase.from('workshops').select('id').eq('profile_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setShopId(data.id); });
  }, [user]);

  /* ── Conta mensagens não lidas ── */
  useEffect(() => {
    if (!shopId || !user) return;

    const lastSeen = localStorage.getItem(LS_KEY) ?? new Date(0).toISOString();

    async function countUnread() {
      // Busca jobs ativos desta oficina
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id')
        .eq('workshop_id', shopId!)
        .in('status', ['open', 'assigned', 'in_progress']);

      if (!jobs?.length) { setUnread(0); return; }
      const jobIds = jobs.map(j => j.id);

      // Mensagens novas de outros (mecânicos), após lastSeen
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('job_id', jobIds)
        .neq('sender_id', user!.id)
        .gt('created_at', lastSeen);

      setUnread(count ?? 0);
    }

    countUnread();

    // Realtime: quando nova mensagem chega, incrementa badge
    const ch = supabase.channel('layout:new_msgs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          const msg = payload.new as { sender_id: string; job_id: string };
          if (msg.sender_id === user!.id) return; // minha própria mensagem
          // Não estamos na página de mensagens → incrementa
          if (!window.location.pathname.startsWith('/oficina/mensagens')) {
            setUnread(n => n + 1);
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [shopId, user]);

  /* ── Zera badge ao entrar em /oficina/mensagens ── */
  useEffect(() => {
    if (location.pathname.startsWith('/oficina/mensagens')) {
      setUnread(0);
      localStorage.setItem(LS_KEY, new Date().toISOString());
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex bg-steel-50">

      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 bg-steel-900/60 z-30 lg:hidden" onClick={() => setOpen(false)} />
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
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-6">
          <div>
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest px-3 mb-2">
              Plataforma
            </div>
            <div className="space-y-0.5">
              {PLATAFORMA.map(item => (
                <SideItem
                  key={item.to}
                  {...item}
                  badge={item.to === '/oficina/mensagens' ? unread : 0}
                  onClick={() => setOpen(false)}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest px-3 mb-2">
              Gestão da oficina
            </div>
            <div className="space-y-0.5">
              {GESTAO.map(item => (
                <SideItem key={item.to} {...item} badge={0} onClick={() => setOpen(false)} />
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest px-3 mb-2">
              Ferramentas
            </div>
            <div className="mx-3 rounded-xl border border-dashed border-steel-700 px-4 py-3 text-center">
              <div className="text-steel-500 text-xs">Em breve</div>
              <div className="text-steel-600 text-[11px] mt-0.5">Relatórios, estoque e mais</div>
            </div>
          </div>
        </nav>

        {/* User footer */}
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
          {/* Avatar + badge mobile no topo */}
          <div className="relative">
            <div className="h-9 w-9 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-sm">
              {initials}
            </div>
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-8 pb-24 lg:pb-8">
          {children}
        </main>
      </div>

      {/* ── Bottom tab bar (mobile only) ── */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-steel-200 z-20 lg:hidden safe-area-inset-bottom">
        <div className="grid grid-cols-4 h-16">
          {BOTTOM_TABS.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors relative ${
                  isActive ? 'text-brand-500' : 'text-steel-400'
                }`
              }
            >
              <span className="relative text-xl leading-none">
                {tab.icon}
                {tab.to === '/oficina/mensagens' && unread > 0 && (
                  <span className="absolute -top-1 -right-2 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </span>
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function SideItem({ to, icon, label, badge, onClick }: NavItem & { badge: number; onClick: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) => `
        flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all
        ${isActive
          ? 'bg-brand-500 text-white shadow-brand'
          : 'text-steel-400 hover:text-white hover:bg-steel-800'
        }
      `}
    >
      <span className="text-base w-5 text-center">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="h-5 min-w-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  );
}
