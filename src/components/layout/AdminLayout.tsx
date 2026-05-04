import { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@/components/Logo';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { signOut, profile } = useAuth();
  return (
    <div className="min-h-screen bg-steel-50 grid grid-cols-[260px_1fr]">
      <aside className="bg-steel-900 text-steel-100 p-5 flex flex-col gap-1 sticky top-0 h-screen">
        <div className="mb-6"><Logo /></div>
        <Item to="/admin/dashboard" icon="📊">Dashboard</Item>
        <Item to="/admin/aprovacoes" icon="✅">Aprovações</Item>
        <Item to="/admin/mecanicos" icon="🔧">Mecânicos</Item>
        <Item to="/admin/oficinas" icon="🏭">Oficinas</Item>
        <Item to="/admin/jobs" icon="📋">Jobs</Item>
        <Item to="/admin/configuracoes" icon="⚙️">Configurações</Item>
        <div className="mt-auto pt-6 border-t border-steel-800">
          <div className="text-xs text-steel-400 mb-2">{profile?.full_name}</div>
          <button onClick={signOut} className="btn-ghost w-full text-sm text-steel-200 hover:text-white">Sair</button>
        </div>
      </aside>
      <main className="p-8">{children}</main>
    </div>
  );
}

function Item({ to, icon, children }: { to: string; icon: string; children: ReactNode }) {
  return (
    <NavLink to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${isActive ? 'bg-brand-500 text-white' : 'text-steel-300 hover:bg-steel-800'}`
      }>
      <span>{icon}</span>{children}
    </NavLink>
  );
}
