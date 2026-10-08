import { useMemo, useRef, useState } from 'react';
import { fmtBRL } from '@/components/os/osHelpers';

/* Busca de serviço + peças para o orçamento do check-up.
   Sugere da Tabela de serviços e do Cadastro de peças pelo nome do item (ex.: Pastilhas → "pastilha")
   e filtra pelo que for digitado. Tocar numa opção junta na descrição e soma o preço. */

export type CatalogEntry = { kind: 'service' | 'part'; name: string; price: number };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Palavras do item que servem para sugerir (tira as genéricas) */
const STOP = new Set(['do', 'da', 'de', 'dos', 'das', 'e', 'nivel', 'cor', 'motor', 'dianteiro', 'dianteira', 'traseiro', 'traseira', 'esquerdo', 'direito', 'oleo']);
const keywords = (label: string) => norm(label).split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w))
  // singular simples: "pastilhas" → "pastilha", "amortecedores" → "amortecedor"
  .map(w => w.replace(/(es|s)$/, ''));

export default function QuoteSearch({ itemLabel, catalog, value, onChange, onPick, onBlur }: {
  itemLabel: string;
  catalog: CatalogEntry[];
  value: string;
  onChange: (v: string) => void;
  /** Escolheu do cadastro: quem chamou junta a descrição e soma o preço */
  onPick: (e: CatalogEntry) => void;
  onBlur: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    const term = norm(q.trim());
    if (term.length >= 2) return catalog.filter(c => norm(c.name).includes(term)).slice(0, 8);
    const kw = keywords(itemLabel);
    if (!kw.length) return [];
    return catalog.filter(c => kw.some(k => norm(c.name).includes(k))).slice(0, 8);
  }, [q, catalog, itemLabel]);

  return (
    <div ref={box} className="relative flex-1 min-w-0"
      onBlur={e => { if (!box.current?.contains(e.relatedTarget as Node)) { setOpen(false); onBlur(); } }}>
      <input className="input !py-1.5 text-sm w-full" value={value}
        placeholder="Buscar serviço ou peça… (ou escreva)"
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setQ(lastPart(e.target.value)); setOpen(true); }} />
      {open && (list.length > 0 || catalog.length === 0) && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-steel-200 bg-white shadow-lg overflow-hidden">
          {catalog.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-steel-500">
              Cadastre seus serviços em <strong>Tabela de serviços</strong> e as peças em <strong>Peças</strong> para buscar aqui com o preço.
            </div>
          ) : (
            <>
              {q.trim().length < 2 && <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-steel-400">Sugestões para este item</div>}
              {list.map(c => (
                <button key={`${c.kind}-${c.name}`} type="button" tabIndex={0}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { onPick(c); setQ(''); }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-brand-50 text-sm">
                  <span className="shrink-0">{c.kind === 'service' ? '🔧' : '🔩'}</span>
                  <span className="flex-1 min-w-0 truncate text-steel-800">{c.name}</span>
                  <span className="shrink-0 text-xs font-semibold text-steel-600">{c.price > 0 ? `+ ${fmtBRL(c.price)}` : 'sem preço'}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** O que está sendo digitado depois do último " + " */
const lastPart = (v: string) => v.split('+').pop() ?? '';
