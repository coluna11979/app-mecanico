import { ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { IconBell, IconCalendar, IconDollar, IconUser, IconWrench } from '@/components/mecanico/icons';
import { useGeoBroadcast } from '@/hooks/useGeoBroadcast';
import { GeoProblemBanner, GeoSharingBar } from '@/components/mecanico/GeoStatus';

const LS_KEY_MEC = 'mecanico_msgs_last_seen';
/** Tema do painel do mecânico: escuro (padrão) ou claro — cada um escolhe no topo */
const LS_THEME_MEC = 'mecanico_tema';

function readTheme(): 'dark' | 'light' {
  try { return localStorage.getItem(LS_THEME_MEC) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

export default function MechanicLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [agendaCount, setAgendaCount] = useState(0);
  const unreadNotif = useUnreadNotifications();
  // Viagem em andamento (a caminho ou em serviço): a posição segue para a oficina em qualquer tela do app
  const [trip, setTrip] = useState<{ jobId: string; mechanicId: string } | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(readTheme);

  // No <html>: vale também para avisos e janelas que abrem por cima da tela
  useEffect(() => {
    document.documentElement.classList.toggle('mech-light', theme === 'light');
    return () => document.documentElement.classList.remove('mech-light');
  }, [theme]);
  function toggleTheme() {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(LS_THEME_MEC, next); } catch { /* ignore */ }
      return next;
    });
  }

  /* ── Conta agendamentos aceitos aguardando deslocamento ── */
  useEffect(() => {
    if (!user) return;
    let alive = true;
    async function countAgenda() {
      const { data: meRow } = await supabase
        .from('mechanics').select('id').eq('profile_id', user!.id).maybeSingle();
      if (!meRow?.id || !alive) { setAgendaCount(0); return; }
      const { count } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('mechanic_id', meRow.id)
        .eq('status', 'assigned')
        .is('en_route_at', null);
      if (alive) setAgendaCount(count ?? 0);
      const { data: active } = await supabase
        .from('jobs').select('id')
        .eq('mechanic_id', meRow.id)
        .in('status', ['assigned', 'in_progress'])
        .not('en_route_at', 'is', null)
        .order('en_route_at', { ascending: false })
        .limit(1).maybeSingle();
      if (alive) setTrip(active ? { jobId: active.id, mechanicId: meRow.id } : null);
    }
    countAgenda();
    const ch = supabase.channel('mec-layout:agenda')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs' }, () => countAgenda())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'jobs' }, () => countAgenda())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [user, location.pathname]);

  const geo = useGeoBroadcast({ enabled: !!trip, jobId: trip?.jobId ?? null, mechanicId: trip?.mechanicId ?? null });

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
      {/* ── Header ── (Sair foi pro Perfil: no celular ficava colado no sino) */}
      <header className="sticky top-0 z-30 bg-steel-900/95 backdrop-blur border-b border-steel-800 shrink-0">
        <div className="px-4 h-14 flex items-center justify-between">
          <Logo size={28} light={theme === 'dark'} />
          <div className="flex items-center">
          <button type="button" onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Deixar o app claro' : 'Deixar o app escuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            className="h-11 w-11 grid place-items-center rounded-xl text-xl active:bg-steel-800 transition">
            <span aria-hidden>{theme === 'dark' ? '☀️' : '🌙'}</span>
          </button>
          <Link
            to="/mecanico/avisos"
            aria-label={unreadNotif > 0 ? `Avisos (${unreadNotif} novos)` : 'Avisos'}
            className="relative h-11 w-11 -mr-2 grid place-items-center rounded-xl text-steel-300 active:bg-steel-800 transition"
          >
            <IconBell className="w-6 h-6" />
            {unreadNotif > 0 && (
              <span className="absolute top-1 right-1 h-5 min-w-5 px-1 rounded-full bg-alert-500 text-white text-[11px] font-bold grid place-items-center">
                {unreadNotif > 9 ? '9+' : unreadNotif}
              </span>
            )}
          </Link>
          </div>
        </div>
      </header>

      {/* Viagem em andamento: confirma que a oficina está vendo, ou avisa o que fazer */}
      {trip && geo.state === 'sharing' && <GeoSharingBar jobId={trip.jobId} />}
      {trip && <GeoProblemBanner state={geo.state} className="mx-4 mt-3" />}

      {/* ── Page content ── */}
      <main className="flex-1 pb-28">{children}</main>

      {/* ── Bottom tab bar ── 4 abas: o Mapa vive dentro de Jobs */}
      <nav className="fixed bottom-0 inset-x-0 bg-steel-900/95 backdrop-blur border-t border-steel-800 z-30 safe-area-inset-bottom">
        <div className="grid grid-cols-4 max-w-lg mx-auto">
          <Tab to="/mecanico/dashboard" match={['/mecanico/dashboard', '/mecanico/mapa', '/mecanico/job/']}
            label="Jobs" icon={<IconWrench />} badge={unread} />
          <Tab to="/mecanico/agenda"  label="Agenda"   icon={<IconCalendar />}       badge={agendaCount} />
          <Tab to="/mecanico/ganhos"  match={['/mecanico/ganhos', '/mecanico/embaixador']}
            label="Ganhos" icon={<IconDollar />} />
          <Tab to="/mecanico/perfil"  label="Perfil"   icon={<IconUser />} />
        </div>
      </nav>
    </div>
  );
}

function Tab({
  to,
  match,
  label,
  icon,
  badge = 0,
}: {
  to: string;
  /** Prefixos de rota que também acendem a aba (padrão: o próprio `to`) */
  match?: string[];
  label: string;
  icon: ReactNode;
  badge?: number;
}) {
  const { pathname } = useLocation();
  const isActive = (match ?? [to]).some(p => pathname.startsWith(p));
  return (
    <Link
      to={to}
      aria-current={isActive ? 'page' : undefined}
      className={`flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-semibold transition-colors active:scale-95 ${
        isActive ? 'text-brand-400' : 'text-steel-300'
      }`}
    >
      <span
        className={`relative h-8 w-12 flex items-center justify-center rounded-full transition-colors ${
          isActive ? 'bg-brand-500/15' : ''
        }`}
      >
        {icon}
        {badge > 0 && (
          <span className="absolute -top-1 right-0.5 h-5 min-w-5 px-1 rounded-full bg-alert-500 text-white text-[11px] font-bold grid place-items-center">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      {label}
    </Link>
  );
}
