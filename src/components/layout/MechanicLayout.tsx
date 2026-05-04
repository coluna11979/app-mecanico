import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';

export default function MechanicLayout({ children }: { children: ReactNode }) {
  const { signOut, profile } = useAuth();
  return (
    <div className="dark min-h-screen bg-steel-900 text-steel-100 flex flex-col">
      <header className="sticky top-0 z-30 bg-steel-900/90 backdrop-blur border-b border-steel-800">
        <div className="px-4 h-14 flex items-center justify-between">
          <Logo size={28} />
          <button onClick={signOut} className="text-xs text-steel-400 hover:text-brand-500">Sair</button>
        </div>
      </header>

      <main className="flex-1 pb-20">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-steel-900/95 backdrop-blur border-t border-steel-800 z-30">
        <div className="grid grid-cols-2 h-16">
          <Tab to="/mecanico/dashboard" label="Jobs" icon="🔧" />
          <Tab to="/mecanico/perfil" label="Perfil" icon="👤" />
        </div>
        <div className="text-center text-[10px] text-steel-500 pb-1">{profile?.full_name}</div>
      </nav>
    </div>
  );
}

function Tab({ to, label, icon }: { to: string; label: string; icon: string }) {
  return (
    <NavLink to={to} end
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-0.5 text-xs font-semibold transition ${isActive ? 'text-brand-500' : 'text-steel-400'}`
      }>
      <span className="text-xl leading-none">{icon}</span>
      {label}
    </NavLink>
  );
}
