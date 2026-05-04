import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';

export default function MechanicLayout({ children }: { children: ReactNode }) {
  const { signOut } = useAuth();
  return (
    <div className="dark min-h-screen bg-steel-900 text-steel-100 flex flex-col">
      <header className="sticky top-0 z-30 bg-steel-900/95 backdrop-blur border-b border-steel-800">
        <div className="px-4 h-14 flex items-center justify-between">
          <Logo size={28} light />
          <button onClick={signOut} className="text-xs text-steel-500 hover:text-brand-400 transition px-3 py-1.5 rounded-lg hover:bg-steel-800">
            Sair
          </button>
        </div>
      </header>

      <main className="flex-1 pb-24">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-steel-950/95 backdrop-blur border-t border-steel-800 z-30 safe-area-inset-bottom">
        <div className="grid grid-cols-3 h-16 max-w-md mx-auto">
          <Tab to="/mecanico/dashboard" label="Jobs"    icon={<IconJobs />}    />
          <Tab to="/mecanico/perfil"    label="Perfil"  icon={<IconProfile />} />
          <Tab to="/mecanico/perfil"    label="Ganhos"  icon={<IconGanhos />}  end={false} />
        </div>
      </nav>
    </div>
  );
}

function Tab({ to, label, icon, end = true }: { to: string; label: string; icon: ReactNode; end?: boolean }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition ${
          isActive ? 'text-brand-400' : 'text-steel-500 hover:text-steel-300'
        }`
      }>
      <span className="h-6 w-6 flex items-center justify-center">{icon}</span>
      {label}
    </NavLink>
  );
}

function IconJobs() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}
function IconProfile() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  );
}
function IconGanhos() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}
