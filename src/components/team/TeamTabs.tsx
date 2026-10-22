import { Link, useLocation } from 'react-router-dom';
import { useTeamAccess } from '@/lib/teamAccess';

const TABS = [
  { to: '/oficina/equipe',     label: 'Painel' },
  { to: '/oficina/desempenho', label: 'Desempenho' },
  { to: '/oficina/comissoes',  label: 'Comissões' },
  { to: '/oficina/folha',      label: 'Folha' },
  { to: '/oficina/acessos',    label: 'Acessos' },
];

/** Navegação da área Equipe: só as abas que a pessoa pode abrir */
export default function TeamTabs() {
  const { pathname } = useLocation();
  const { route } = useTeamAccess();
  const tabs = TABS.filter(t => route(t.to));
  if (tabs.length < 2) return null;
  return (
    <nav className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1 mb-5" aria-label="Equipe">
      {tabs.map(t => {
        const on = pathname === t.to || (t.to === '/oficina/equipe' && pathname.startsWith('/oficina/equipe/'));
        return (
          <Link key={t.to} to={t.to}
            className={`shrink-0 text-sm font-semibold px-3.5 py-1.5 rounded-full border transition ${
              on ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
