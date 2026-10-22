import { Link, useLocation } from 'react-router-dom';

const TABS: { to: string; label: string }[] = [
  { to: '/admin/leads',               label: 'Pipeline'        },
  { to: '/admin/leads/metricas',      label: 'Métricas'        },
  { to: '/admin/leads/importar',      label: 'Importar Google' },
  { to: '/admin/leads/importar-csv',  label: 'Importar CSV'    },
];

export function LeadsTabs() {
  const { pathname } = useLocation();
  return (
    <div className="flex items-center gap-1 mb-5 border-b border-steel-200 -mt-1 overflow-x-auto">
      {TABS.map(t => {
        const active = pathname === t.to;
        return (
          <Link key={t.to} to={t.to}
            className={`relative px-3 py-2 text-sm font-semibold transition inline-block whitespace-nowrap ${
              active ? 'text-steel-900' : 'text-steel-500 hover:text-steel-700'
            }`}>
            {t.label}
            {active && <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-brand-500 rounded-t" />}
          </Link>
        );
      })}
    </div>
  );
}
