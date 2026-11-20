import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, parseMoney } from '@/components/os/osHelpers';
import { codeHit, matchesAll, searchHay, searchWords } from '@/lib/partSearch';
import { makeOfModel } from '@/lib/vehicleCatalog';

/** Peça do cadastro, para escolher no kit */
export type KitCatPart = { id: string; name: string; code: string | null; cost: number | null; stock_qty: number | null };

const n0 = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Busca de peça do cadastro (nome ou código). Escolher vincula a peça (custo e estoque);
 * Enter sem escolher usa o texto digitado (peça sem cadastro), quando `onText` existe.
 */
export function PartSearch({ parts, model, placeholder, autoFocus, onPick, onText, onCancel }: {
  parts: KitCatPart[]; model?: string | null; placeholder?: string; autoFocus?: boolean;
  onPick: (p: KitCatPart) => void; onText?: (text: string) => void; onCancel?: () => void;
}) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const ws = searchWords(q);
  const results = useMemo(() => {
    if (!ws.length) return [];
    const m = n0(model ?? '').trim();
    const hits = parts.filter(p => matchesAll(searchHay(p.name, p.code), ws));
    const score = (p: KitCatPart) => (codeHit(p.code, ws) ? 4 : 0) + (m && n0(p.name).includes(m) ? 2 : 0) + (Number(p.stock_qty) > 0 ? 1 : 0);
    return hits.map((p, i) => ({ p, i, k: score(p) })).sort((a, b) => b.k - a.k || a.i - b.i).map(x => x.p).slice(0, 8);
  }, [q, parts, model]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setHi(0), [q]);

  const pick = (p: KitCatPart) => { onPick(p); setQ(''); };
  return (
    <div ref={box} className="relative flex-1 min-w-0">
      <input className="input !py-1.5 text-sm w-full" value={q} autoFocus={autoFocus}
        placeholder={placeholder ?? 'Buscar peça no cadastro (nome ou código)'}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (results[hi]) pick(results[hi]); else if (onText && q.trim()) { onText(q.trim()); setQ(''); } }
          else if (e.key === 'Escape') onCancel?.();
        }} />
      {q.trim() && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-steel-200 bg-white shadow-lg">
          {results.map((p, i) => (
            <li key={p.id}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => pick(p)}
                className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between gap-3 ${i === hi ? 'bg-brand-50' : 'hover:bg-steel-50'}`}>
                <span className="min-w-0">
                  <span className="block font-medium text-steel-900 truncate">{p.name}</span>
                  <span className="block text-xs text-steel-500">{[p.code ? `cód. ${p.code}` : null, `${Number(p.stock_qty ?? 0)} em estoque`].filter(Boolean).join(' · ')}</span>
                </span>
                {p.cost != null && <span className="shrink-0 text-xs text-steel-500">custo {fmtBRL(Number(p.cost))}</span>}
              </button>
            </li>
          ))}
          {!results.length && <li className="px-3 py-2 text-sm text-steel-500">Nenhuma peça no cadastro com “{q.trim()}”.</li>}
          {onText && (
            <li className="border-t border-steel-100">
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onText(q.trim()); setQ(''); }}
                className="w-full px-3 py-2 text-left text-sm text-brand-700 font-semibold hover:bg-brand-50">
                ＋ Usar “{q.trim()}” sem cadastro
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

type Draft = { part_id: string | null; description: string; quantity: string };

/** Criar um kit novo: serviço + carro + peças */
export function NewKitModal({ wid, parts, onClose, onSaved }: {
  wid: string; parts: KitCatPart[]; onClose: () => void; onSaved: () => void;
}) {
  const [services, setServices] = useState<{ id: string; name: string; category: string | null }[]>([]);
  const [svc, setSvc] = useState('');
  const [anyCar, setAnyCar] = useState(false);
  const [make, setMake] = useState('');
  const [makeTouched, setMakeTouched] = useState(false);
  const [model, setModel] = useState('');
  const [yFrom, setYFrom] = useState('');
  const [yTo, setYTo] = useState('');
  const [list, setList] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('workshop_services').select('id, name, category').eq('workshop_id', wid).eq('active', true).order('name')
      .then(({ data }) => setServices((data ?? []) as { id: string; name: string; category: string | null }[]));
  }, [wid]);

  const add = (d: Draft) => setList(l => l.some(x => x.part_id && x.part_id === d.part_id) ? l : [...l, d]);
  const year = (s: string) => { const n = parseInt(s, 10); return n >= 1950 && n <= 2100 ? n : null; };

  async function save() {
    if (!svc) return toast.error('Escolha o serviço do kit');
    if (!anyCar && !model.trim()) return toast.error('Informe o modelo do carro (ou marque "Serve em qualquer carro")');
    if (!list.length) return toast.error('Inclua pelo menos uma peça');
    const bad = list.find(l => !(parseMoney(l.quantity) > 0));
    if (bad) return toast.error(`Quantidade inválida em ${bad.description}`);
    setSaving(true);
    const { error } = await supabase.from('workshop_service_parts').insert(list.map((l, i) => ({
      workshop_id: wid, service_id: svc, description: l.description.trim(), quantity: parseMoney(l.quantity), part_id: l.part_id, position: i,
      vehicle_make: anyCar ? null : (make.trim() || null), vehicle_model: anyCar ? null : model.trim(),
      year_from: anyCar ? null : year(yFrom), year_to: anyCar ? null : year(yTo), tech_vehicle_id: null,
    })));
    setSaving(false);
    if (error) return toast.error('Não foi possível criar o kit: ' + error.message);
    toast.success('Kit criado ✓');
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/50 flex items-end md:items-center justify-center md:p-6" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Novo kit"
        className="bg-white w-full md:max-w-xl max-h-[94vh] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-steel-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg text-steel-900">Novo kit</h3>
            <p className="text-xs text-steel-500">As peças que o serviço leva neste carro. Na OS, entram com um toque.</p>
          </div>
          <button type="button" onClick={onClose} className="h-11 w-11 rounded-xl grid place-items-center text-steel-500 hover:bg-steel-100" aria-label="Fechar">✕</button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          <div>
            <label className="label" htmlFor="kit-svc">Serviço</label>
            <select id="kit-svc" className="input" value={svc} onChange={e => setSvc(e.target.value)}>
              <option value="">Escolha o serviço…</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}{s.category ? ` · ${s.category}` : ''}</option>)}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <span className="label !mb-0">Carro</span>
              <label className="text-xs text-steel-600 flex items-center gap-1.5">
                <input type="checkbox" checked={anyCar} onChange={e => setAnyCar(e.target.checked)} /> Serve em qualquer carro
              </label>
            </div>
            {!anyCar && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5">
                <input className="input col-span-2 sm:col-span-1" placeholder="Modelo (ex.: Palio)" value={model} aria-label="Modelo"
                  onChange={e => { setModel(e.target.value); if (!makeTouched) setMake(makeOfModel(e.target.value) ?? ''); }} />
                <input className="input col-span-2 sm:col-span-1" placeholder="Marca" value={make} aria-label="Marca"
                  onChange={e => { setMake(e.target.value); setMakeTouched(true); }} />
                <input className="input" placeholder="Ano de" inputMode="numeric" value={yFrom} onChange={e => setYFrom(e.target.value)} aria-label="Ano de" />
                <input className="input" placeholder="Ano até" inputMode="numeric" value={yTo} onChange={e => setYTo(e.target.value)} aria-label="Ano até" />
              </div>
            )}
          </div>

          <div>
            <span className="label">Peças do kit</span>
            {list.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {list.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input className="input !py-1.5 text-sm w-16 text-center shrink-0" value={l.quantity} aria-label="Quantidade"
                      onChange={e => setList(xs => xs.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                    <span className="flex-1 min-w-0 text-sm">
                      <span className="block truncate text-steel-900">{l.description}</span>
                      {!l.part_id && <span className="block text-[11px] text-pending-700">sem cadastro</span>}
                    </span>
                    <button type="button" className="h-9 w-9 text-steel-400 hover:text-red-600" aria-label="Tirar a peça"
                      onClick={() => setList(xs => xs.filter((_, j) => j !== i))}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <PartSearch parts={parts} model={model} placeholder="Buscar peça no cadastro para incluir"
              onPick={p => add({ part_id: p.id, description: p.name, quantity: '1' })}
              onText={t => add({ part_id: null, description: t, quantity: '1' })} />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-steel-100 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Criar kit'}</button>
        </div>
      </div>
    </div>
  );
}
