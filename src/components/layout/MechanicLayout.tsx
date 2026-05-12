import { ReactNode, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';

const LS_KEY_MEC = 'mecanico_msgs_last_seen';

export default function MechanicLayout({ children }: { children: ReactNode }) {
  const { signOut, profile, user } = useAuth();
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Mecânico';
  const location = useLocation();
  const [unread, setUnread] = useState(0);

  /* ── Conta mensagens não lidas para os jobs ativos deste mecânico ── */
  useEffect(() => {
    if (!user) return;
    const lastSeen = localStorage.getItem(LS_KEY_MEC) ?? new Date(0).toISOString();

    async function countUnread() {
      const { data: meRow } = await supabase
        .from('mechanics').select('id').eq('profile_id', user!.id).maybeSingle();
      const mechId = meRow?.id;
      if (!mechId) { setUnread(0); return; }
      const { data: jobs } = await supabase
        .from('jobs').select('id')
        .eq('mechanic_id', mechId)
        .in('status', ['assigned', 'in_progress']);
      if (!jobs?.length) { setUnread(0); return; }
      const jobIds = jobs.map(j => j.id);
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('job_id', jobIds)
        .neq('sender_id', user!.id)
        .gt('created_at', lastSeen);
      setUnread(count ?? 0);
    }
    countUnread();

    const ch = supabase.channel('mec-layout:new_msgs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          const msg = payload.new as { sender_id: string };
          if (msg.sender_id === user!.id) return;
          // Se estamos na tela de tracking do job, não conta
          if (window.location.pathname.includes('/mecanico/job/') && window.location.pathname.includes('/tracking')) return;
          setUnread(n => n + 1);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  /* Zera badge ao entrar na tela de tracking (onde o chat vive) */
  useEffect(() => {
    if (location.pathname.includes('/mecanico/job/') && location.pathname.includes('/tracking')) {
      setUnread(0);
      localStorage.setItem(LS_KEY_MEC, new Date().toISOString());
    }
  }, [location.pathname]);

  return (
    <div className="dark min-h-screen bg-steel-900 text-steel-100 flex flex-col">
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-steel-900/95 backdrop-blur border-b border-steel-800 shrink-0">
        <div className="px-4 h-14 flex items-center justify-between">
          <Logo size={28} light />
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-steel-400 hidden sm:block">{firstName}</span>
            <button
              onClick={signOut}
              className="text-xs text-steel-500 hover:text-brand-400 transition px-3 py-2 rounded-xl hover:bg-steel-800 active:scale-95"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main className="flex-1 pb-24">{children}</main>

      {/* ── Bottom tab bar ── */}
      <nav className="fixed bottom-0 inset-x-0 bg-steel-950/98 backdrop-blur border-t border-steel-800 z-30 safe-area-inset-bottom">
        <div className="grid grid-cols-4 max-w-lg mx-auto">
          <Tab to="/mecanico/dashboard" label="Jobs"    icon={<IconJobs />}    badge={unread} />
          <Tab to="/mecanico/mapa"      label="Mapa"    icon={<IconMap />}     />
          <Tab to="/mecanico/perfil"    label="Perfil"  icon={<IconProfile />} />
          <Tab to="/mecanico/ganhos"    label="Ganhos"  icon={<IconGanhos />}  />
        </div>
      </nav>
    </div>
  );
}

function Tab({
  to,
  label,
  icon,
  end = true,
  badge = 0,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  badge?: number;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-1 h-16 text-[10px] font-semibold transition-colors active:scale-95 ${
          isActive ? 'text-brand-400' : 'text-steel-500 hover:text-steel-300'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`relative h-8 w-8 flex items-center justify-center rounded-xl transition-colors ${
              isActive ? 'bg-brand-500/15' : ''
            }`}
          >
            {icon}
            {badge > 0 && (
              <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold grid place-items-center">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

function IconJobs() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function IconMap() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  );
}

function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function IconGanhos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}
