import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtBRL } from '@/components/os/osHelpers';
import { fmtQty } from '@/lib/parts';

export type CatalogPart = { id: string; name: string; code: string | null; brand: string | null; price: number; cost: number; stock: number; unit: string };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Descrição da peça na conferência com busca no cadastro (nome, código ou marca).
 * Escolher uma peça do cadastro liga o item a ela (o valor cobrado continua o da nota; vazio = preço do cadastro);
 * digitar livremente desliga — aí vale a regra de "Salvar as peças no cadastro".
 */
export default function PartSearchInput({ value, partId, catalog, className, onType, onPick }: {
  value: string; partId: string | null; catalog: CatalogPart[]; className?: string;
  onType: (v: string) => void; onPick: (p: CatalogPart) => void;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const linked = partId ? catalog.find(p => p.id === partId) : undefined;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const hits = useMemo(() => {
    const words = norm(typed ? value : '').split(/\s+/).filter(w => w.length >= 2);
    if (!words.length) return [];
    return catalog
      .filter(p => { const t = norm(`${p.name} ${p.code ?? ''} ${p.brand ?? ''}`); return words.every(w => t.includes(w)); })
      .slice(0, 12);
  }, [catalog, value, typed]);

  return (
    <div ref={box} className="relative col-span-9">
      <input className={className} placeholder="Descrição ou busque no cadastro (nome, código)" value={value}
        onFocus={() => setOpen(true)}
        onChange={e => { onType(e.target.value); setTyped(true); setOpen(true); }} />
      {linked ? (
        <div className="text-[11px] text-signal-700 mt-0.5 pl-1">
          ✓ Do cadastro{linked.code ? ` · cód. ${linked.code}` : ''}{linked.brand ? ` · ${linked.brand}` : ''} · preço no cadastro {fmtBRL(linked.price)} · estoque {fmtQty(linked.stock)} {linked.unit}
        </div>
      ) : value.trim() && typed && hits.length === 0 ? (
        <div className="text-[11px] text-steel-400 mt-0.5 pl-1">Não achei no cadastro: entra como peça nova (se "Salvar no cadastro" estiver marcado).</div>
      ) : null}
      {open && hits.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-steel-200 bg-white shadow-lg max-h-72 overflow-y-auto py-1">
          {hits.map(p => (
            <li key={p.id}>
              <button type="button" onClick={() => { onPick(p); setOpen(false); setTyped(false); }}
                className="w-full text-left px-3 py-1.5 hover:bg-steel-50">
                <div className="text-sm font-medium text-steel-800 truncate">{p.name}</div>
                <div className="text-[11px] text-steel-500 truncate">
                  {[p.code && `cód. ${p.code}`, p.brand, `${fmtBRL(p.price)}`, `estoque ${fmtQty(p.stock)}`].filter(Boolean).join(' · ')}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
