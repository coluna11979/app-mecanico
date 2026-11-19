// Peças de filtro para as listas do admin (padrão Shopify Polaris / Linear / Baymard):
//  - MultiSelectFilter: botão "Filtro ▾" que abre um menu com caixas de seleção, contagem por
//    opção e busca. No computador é um menu suspenso; no celular, uma folha que sobe de baixo.
//    Filtra na hora (lista local, rápida) e o rodapé mostra quantos resultados ficam.
//  - FilterPill: etiqueta de filtro aplicado com × para remover só aquele.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export type FilterOption = { key: string; label: string; count?: number };
export type MatchMode = 'any' | 'all';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function MultiSelectFilter({
  label, options, selected, onChange, mode, onModeChange, applyLabel, searchPlaceholder = 'Buscar…',
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (keys: string[]) => void;
  /** Se informado, mostra a escolha "Qualquer uma / Todas" */
  mode?: MatchMode;
  onModeChange?: (m: MatchMode) => void;
  /** Texto do botão de confirmar, ex.: "Mostrar 4 mecânicos" */
  applyLabel: string;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  function close() {
    setOpen(false);
    setQuery('');
    buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    // Foco na busca só no computador — no celular o teclado cobriria a lista
    if (window.matchMedia('(min-width: 768px)').matches) searchRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter(k => k !== key) : [...selected, key]);

  const visible = query.trim()
    ? options.filter(o => norm(o.label).includes(norm(query)))
    : options;
  const active = selected.length > 0;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        className={`w-full sm:w-auto inline-flex items-center justify-between sm:justify-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold whitespace-nowrap transition ${
          active
            ? 'border-brand-500 bg-brand-50 text-brand-700'
            : 'border-steel-200 bg-white text-steel-700 hover:bg-steel-50'
        }`}
      >
        <span className="inline-flex items-center gap-2">
          {label}
          {active && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[11px] font-bold text-white">
              {selected.length}
            </span>
          )}
        </span>
        <svg viewBox="0 0 20 20" className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <>
          {/* Fundo: escurece no celular; no computador só fecha ao clicar fora */}
          <div className="fixed inset-0 z-40 bg-steel-900/40 md:bg-transparent" onClick={close} aria-hidden />

          <div
            id={panelId}
            role="dialog"
            aria-label={label}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl
                       md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-full md:mt-2 md:w-80 md:max-h-[min(32rem,75vh)] md:rounded-xl md:border md:border-steel-200 md:shadow-xl"
          >
            {/* Puxador + título (celular) */}
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-steel-200 md:hidden" aria-hidden />
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <span className="text-base font-bold text-steel-900 md:text-sm">{label}</span>
              <button
                type="button"
                onClick={close}
                aria-label="Fechar"
                className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-steel-500 hover:bg-steel-100 md:h-8 md:w-8"
              >
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            {mode && onModeChange && (
              <div className="px-4 pb-3">
                <div role="radiogroup" aria-label="Como combinar" className="grid grid-cols-2 gap-1 rounded-lg bg-steel-100 p-1">
                  {(['any', 'all'] as const).map(m => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={mode === m}
                      onClick={() => onModeChange(m)}
                      className={`rounded-md px-2 py-2.5 text-xs font-semibold transition md:py-1.5 ${
                        mode === m ? 'bg-white text-steel-900 shadow' : 'text-steel-500 hover:text-steel-700'
                      }`}
                    >
                      {m === 'any' ? 'Qualquer uma' : 'Todas'}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-steel-500">
                  {mode === 'any'
                    ? 'Aparece quem tem pelo menos uma das marcadas.'
                    : 'Aparece só quem tem todas as marcadas.'}
                </p>
              </div>
            )}

            {options.length > 6 && (
              <div className="px-4 pb-2">
                <input
                  ref={searchRef}
                  className="input !py-2"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
              </div>
            )}

            <ul className="flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
              {visible.map(o => {
                const checked = selected.includes(o.key);
                const empty = o.count === 0 && !checked;
                return (
                  <li key={o.key}>
                    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-steel-50 md:min-h-[36px]">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 accent-brand-500"
                        checked={checked}
                        onChange={() => toggle(o.key)}
                      />
                      <span className={`flex-1 text-sm ${empty ? 'text-steel-400' : 'text-steel-800'} ${checked ? 'font-semibold' : ''}`}>
                        {o.label}
                      </span>
                      {o.count !== undefined && (
                        <span className="text-xs tabular-nums text-steel-400">{o.count}</span>
                      )}
                    </label>
                  </li>
                );
              })}
              {visible.length === 0 && (
                <li className="px-2 py-4 text-sm text-steel-500">Nada encontrado para “{query}”.</li>
              )}
            </ul>

            <div className="flex items-center justify-between gap-3 border-t border-steel-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => onChange([])}
                disabled={!active}
                className="min-h-[44px] px-1 text-sm font-semibold text-steel-600 hover:text-steel-900 disabled:opacity-40 md:min-h-0"
              >
                Limpar
              </button>
              <button type="button" onClick={close} className="btn-primary !px-4 !py-2.5">
                {applyLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function FilterPill({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-steel-200 bg-white py-1 pl-3 pr-1 text-xs font-semibold text-steel-700">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover filtro"
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-steel-400 hover:bg-steel-100 hover:text-steel-700"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </span>
  );
}
