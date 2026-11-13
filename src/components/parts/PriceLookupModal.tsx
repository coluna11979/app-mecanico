import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fmtBRL } from '@/components/os/osHelpers';
import { fmtPct, fmtQty, loadAllParts, loadMargins, marginOf, partCategory, salePriceOf, type WorkshopPart } from '@/lib/parts';
import { fmtYears, isAnyModel, loadPartVehicles, norm, type PartVehicle } from '@/lib/partVehicles';

type Part = Pick<WorkshopPart, 'id' | 'name' | 'code' | 'brand' | 'category' | 'cost' | 'margin_percent' | 'sale_price' | 'stock_qty' | 'unit'>;
type Hit =
  | { kind: 'part'; id: string; name: string; sub: string; price: number; cost: number; stock: number; unit: string; text: string; inStock: boolean }
  | { kind: 'service'; id: string; name: string; sub: string; price: number; text: string };

const MAX = 40;

/**
 * Consulta rápida de preço (balcão / telefone): peça ou serviço por nome, código, marca ou carro.
 * Mostra o preço de venda; custo, margem e estoque só para quem pode ver peças e estoque.
 */
export default function PriceLookupModal({ wid, showCost, onClose }: { wid: string; showCost: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'tudo' | 'pecas' | 'servicos'>('tudo');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [parts, margins, vehicles, svc] = await Promise.all([
        loadAllParts<Part>(wid, 'id, name, code, brand, category, cost, margin_percent, sale_price, stock_qty, unit'),
        loadMargins(wid),
        loadPartVehicles(wid).catch(() => new Map<string, PartVehicle[]>()),
        supabase.from('workshop_services').select('id, name, price, category').eq('workshop_id', wid).eq('active', true).order('name'),
      ]);
      if (!alive) return;
      const veh = (id: string) => (vehicles.get(id) ?? []).map(v => `${v.brand}${isAnyModel(v.model) ? '' : ' ' + v.model} ${fmtYears(v)}`);
      setHits([
        ...parts.map(p => {
          const cars = veh(p.id);
          return {
            kind: 'part' as const, id: p.id, name: p.name, price: salePriceOf(p, margins), cost: Number(p.cost),
            stock: Number(p.stock_qty), unit: p.unit, inStock: Number(p.stock_qty) > 0,
            sub: [p.code && `cód. ${p.code}`, p.brand, `${partCategory(p.category).icon} ${partCategory(p.category).label}`, cars.slice(0, 2).join(', ') + (cars.length > 2 ? ` +${cars.length - 2}` : '')].filter(Boolean).join(' · '),
            text: norm(`${p.name} ${p.code ?? ''} ${p.brand ?? ''} ${cars.join(' ')}`),
          };
        }),
        ...((svc.data ?? []) as { id: string; name: string; price: number; category: string | null }[]).map(s => ({
          kind: 'service' as const, id: s.id, name: s.name, price: Number(s.price), sub: s.category ? `🔧 ${s.category}` : '🔧 Serviço',
          text: norm(`${s.name} ${s.category ?? ''}`),
        })),
      ]);
    })();
    return () => { alive = false; };
  }, [wid]);

  const list = useMemo(() => {
    if (!hits) return [];
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const found = hits.filter(h => (tab === 'tudo' || (tab === 'pecas' ? h.kind === 'part' : h.kind === 'service')) && words.every(w => h.text.includes(w)));
    // Nome começando pela busca e peça com estoque primeiro
    const score = (h: Hit) => (norm(h.name).startsWith(words[0]) ? 2 : 0) + (h.kind === 'part' && h.inStock ? 1 : 0);
    return found.map((h, i) => ({ h, i, k: score(h) })).sort((a, b) => b.k - a.k || a.i - b.i).map(x => x.h);
  }, [hits, q, tab]);

  return (
    <div className="fixed inset-0 z-[90] bg-steel-900/60 flex items-start justify-center px-4 pt-[8vh]" onClick={onClose} role="dialog" aria-modal="true" aria-label="Consultar preço">
      <div onClick={e => e.stopPropagation()} className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[84vh]">
        <div className="p-4 border-b border-steel-100 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">🏷️ Consultar preço</h2>
            <button onClick={onClose} className="h-9 w-9 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100" aria-label="Fechar">✕</button>
          </div>
          <input ref={input} className="input" placeholder="Peça, serviço, código, marca ou carro (ex.: pastilha gol, 5w30, GC5008)"
            value={q} onChange={e => setQ(e.target.value)} />
          <div className="flex gap-2">
            {([['tudo', 'Tudo'], ['pecas', 'Peças'], ['servicos', 'Serviços']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${tab === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {hits === null ? (
            <div className="p-8 text-center text-sm text-steel-500">Carregando o cadastro…</div>
          ) : !q.trim() ? (
            <div className="p-8 text-center text-sm text-steel-500">Digite o nome, o código ou o carro.</div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-sm text-steel-500">Nada encontrado. Tente outra palavra.</div>
          ) : (
            <ul className="divide-y divide-steel-100">
              {list.slice(0, MAX).map(h => (
                <li key={`${h.kind}${h.id}`} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-steel-800">{h.name}</div>
                    {h.sub && <div className="text-[11px] text-steel-500 truncate">{h.sub}</div>}
                    {h.kind === 'part' && showCost && (
                      <div className="text-[11px] text-steel-500 mt-0.5">
                        custo {fmtBRL(h.cost)} · margem {fmtPct(marginOf(h.cost, h.price))} ·{' '}
                        <span className={h.inStock ? 'text-signal-700 font-semibold' : 'text-alert-600 font-semibold'}>
                          {h.inStock ? `estoque ${fmtQty(h.stock)} ${h.unit}` : 'sem estoque'}
                        </span>
                      </div>
                    )}
                    {h.kind === 'part' && !showCost && !h.inStock && <div className="text-[11px] text-alert-600 font-semibold mt-0.5">sem estoque</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-base font-bold text-steel-900">{fmtBRL(h.price)}</div>
                    {h.kind === 'part' && <div className="text-[10px] text-steel-400">por {h.unit}</div>}
                  </div>
                </li>
              ))}
              {list.length > MAX && (
                <li className="px-4 py-3 text-center text-xs text-steel-500">Mostrando {MAX} de {list.length}. Digite mais uma palavra para refinar.</li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
