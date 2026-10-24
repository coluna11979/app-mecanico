import { useMemo, useState } from 'react';
import { fmtQty } from '@/lib/parts';
import { fmtBRL } from './osHelpers';
import type { Suggestion } from './OsItemsEditor';

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
type Tab = 'servico' | 'peca';

/**
 * 🔍 Buscar no catálogo — painel lateral (desktop) / gaveta (celular) para montar a OS clicando,
 * em vez de digitar. Mostra serviços da tabela e peças do estoque (com saldo e preço) e fica
 * aberto para adicionar vários itens seguidos.
 */
export default function CatalogPanel({ suggestions, services, itemCount, total, partsAsCost, showCost, onPick, onClose }: {
  suggestions: Suggestion[];
  /** Serviços já na OS (destino das peças): key + nome */
  services: { key: string; name: string }[];
  itemCount: number;
  total: number;
  /** Peças entram dentro de um item: mostra o custo (e não o preço de venda) */
  partsAsCost?: boolean;
  showCost?: boolean;
  /** targetKey = serviço que recebe a peça ('' = peça avulsa/sem destino) */
  onPick: (s: Suggestion, targetKey: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('servico');
  const [q, setQ] = useState('');
  const [target, setTarget] = useState(services.at(-1)?.key ?? '');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  const list = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return suggestions
      .filter(s => (tab === 'peca' ? s.kind === 'part' : s.kind === 'labor'))
      .filter(s => { const n = norm(s.description); return words.every(w => n.includes(w)); })
      .slice(0, 60);
  }, [suggestions, tab, q]);

  // O destino pode sumir (serviço removido) — cai para o último
  const validTarget = services.some(s => s.key === target) ? target : services.at(-1)?.key ?? '';

  function pick(s: Suggestion) {
    onPick(s, s.kind === 'part' ? validTarget : '');
    setJustAdded(s.description);
    setTimeout(() => setJustAdded(j => (j === s.description ? null : j)), 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end" role="dialog" aria-label="Buscar no catálogo">
      <div className="absolute inset-0 bg-steel-900/40" onClick={onClose} />
      <div className="relative bg-white w-full md:w-[440px] max-h-[88vh] md:max-h-none md:h-full rounded-t-2xl md:rounded-none shadow-2xl flex flex-col">
        <div className="px-4 pt-4 pb-3 border-b border-steel-100">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-bold text-lg text-steel-900">Buscar no catálogo</h3>
            <button type="button" onClick={onClose} className="h-10 w-10 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100" aria-label="Fechar">✕</button>
          </div>
          <input autoFocus className="input text-sm" placeholder="Digite para buscar…" value={q} onChange={e => setQ(e.target.value)} />
          <div className="flex gap-1.5 mt-3">
            {([['servico', 'Serviços'], ['peca', 'Peças']] as [Tab, string][]).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`flex-1 h-11 rounded-xl text-sm font-semibold transition ${tab === k ? 'bg-brand-500 text-white' : 'bg-steel-100 text-steel-700'}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'peca' && services.length > 0 && (
            <label className="mt-3 flex items-center gap-2 text-xs text-steel-500">
              <span className="shrink-0">Peças entram no item:</span>
              <select className="input !py-1.5 !px-2 text-xs flex-1 min-w-0" value={validTarget} onChange={e => setTarget(e.target.value)}>
                {services.map(s => <option key={s.key} value={s.key}>{s.name || 'sem nome'}</option>)}
              </select>
            </label>
          )}
        </div>

        <ul className="flex-1 overflow-y-auto divide-y divide-steel-100">
          {list.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-steel-500">
              {suggestions.some(s => (tab === 'peca' ? s.kind === 'part' : s.kind === 'labor'))
                ? 'Nada encontrado com essa busca.'
                : tab === 'peca' ? 'Nenhuma peça cadastrada ainda.' : 'Nenhum serviço cadastrado ainda.'}
            </li>
          )}
          {list.map(s => {
            const out = s.part_id != null && (s.stock ?? 0) <= 0;
            return (
              <li key={s.description + (s.part_id ?? '')}>
                <button type="button" onClick={() => pick(s)}
                  className="w-full min-h-[56px] px-4 py-2 flex items-center gap-3 text-left hover:bg-steel-50 active:bg-brand-50">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-steel-800 truncate">{s.description}</span>
                    <span className="block text-xs text-steel-500">
                      {s.part_id ? <span className={out ? 'text-alert-600 font-semibold' : ''}>{fmtQty(s.stock)} {s.unit} em estoque</span>
                        : s.fromTable ? 'Tabela de serviços' : 'Já usado antes'}
                    </span>
                  </span>
                  <span className="text-sm font-bold text-steel-900 shrink-0">
                    {s.kind === 'part' && partsAsCost
                      ? (showCost ? (s.cost ? `custo ${fmtBRL(s.cost)}` : 'sem custo') : '')
                      : s.unit_price > 0 ? fmtBRL(s.unit_price) : 'a definir'}
                  </span>
                  <span className={`h-11 w-11 shrink-0 rounded-xl grid place-items-center text-lg font-bold transition ${justAdded === s.description ? 'bg-signal-500 text-white' : 'bg-brand-50 text-brand-700'}`}>
                    {justAdded === s.description ? '✓' : '+'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="px-4 py-3 border-t border-steel-100 flex items-center justify-between gap-3 bg-steel-50 md:rounded-none">
          <div className="text-sm text-steel-600">
            <strong className="text-steel-900">{itemCount}</strong> {itemCount === 1 ? 'item' : 'itens'} · <strong className="text-steel-900">{fmtBRL(total)}</strong>
          </div>
          <button type="button" onClick={onClose} className="btn-primary text-sm !py-2.5 !px-5">Pronto</button>
        </div>
      </div>
    </div>
  );
}
