import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { canDo, useOperator } from '@/lib/operators';
import { moduleAllows, useWorkshopModules } from '@/lib/modules';

const TABS = [
  { to: '/oficina/pecas/painel', label: 'Painel',       perm: 'pecas_estoque' },
  { to: '/oficina/pecas',        label: 'Peças',        perm: 'pecas_estoque' },
  { to: '/oficina/compras',      label: 'Compras',      perm: 'compras' },
  { to: '/oficina/fornecedores', label: 'Fornecedores', perm: 'compras' },
] as const;

/** Quem está operando pode ver Compras/Fornecedores? (permissão + módulo ligado) */
export function useStockAccess() {
  const { balcao, session } = useOperator();
  const disabled = useWorkshopModules(s => s.disabled);
  return {
    pecas: canDo(session, balcao, 'pecas_estoque') && moduleAllows(disabled, '/oficina/pecas'),
    compras: canDo(session, balcao, 'compras') && moduleAllows(disabled, '/oficina/compras'),
  };
}

/** Cabeçalho comum de Estoque e compras: título, ações e as 4 abas */
export default function StockTabs({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  const access = useStockAccess();
  const disabled = useWorkshopModules(s => s.disabled);
  const tabs = TABS.filter(t => (t.perm === 'compras' ? access.compras : access.pecas) && moduleAllows(disabled, t.to));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-widest text-steel-400">Estoque e compras</div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-steel-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {tabs.length > 1 && (
        <nav className="flex gap-1 border-b border-steel-200 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end
              className={({ isActive }) => `shrink-0 px-3 sm:px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${
                isActive ? 'border-steel-900 text-steel-900' : 'border-transparent text-steel-500 hover:text-steel-800'}`}>
              {t.label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
