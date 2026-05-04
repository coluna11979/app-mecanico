import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  const { signOut, profile } = useAuth();
  return (
    <div className="min-h-screen bg-steel-50">
      <header className="bg-white border-b border-steel-200 sticky top-0 z-30">
        <div className="section h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-1">
            <Item to="/oficina/dashboard">Início</Item>
            <Item to="/oficina/buscar">Buscar mecânicos</Item>
            <Item to="/oficina/perfil">Oficina</Item>
            <button onClick={signOut} className="btn-ghost text-sm">Sair</button>
          </nav>
        </div>
        <div className="section text-xs text-steel-500 pb-2">{profile?.full_name}</div>
      </header>
      <main className="section py-8">{children}</main>
    </div>
  );
}

function Item({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink to={to}
      className={({ isActive }) =>
        `px-4 py-2 rounded-xl text-sm font-semibold transition ${isActive ? 'bg-brand-500 text-white' : 'text-steel-600 hover:bg-steel-100'}`
      }>{children}</NavLink>
  );
}
