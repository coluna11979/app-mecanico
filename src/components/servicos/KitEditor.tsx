import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, parseMoney } from '@/components/os/osHelpers';
import { codeHit, matchesAll, searchHay, searchWords } from '@/lib/partSearch';
import { makeOfModel } from '@/lib/vehicleCatalog';
import { subOf } from '@/lib/parts';
import { lookupPlate } from '@/lib/techCatalog';
import { carFromPlate, catalogMake, catalogModel } from '@/lib/plateToCar';

/** Peça do cadastro, para escolher no kit */
export type KitCatPart = {
  id: string; name: string; code: string | null; cost: number | null; stock_qty: number | null;
  category: string | null; subcategory?: string | null;
};
/** Tipo da peça (categoria + subcategoria), para sugerir as do mesmo tipo */
export type PartKind = { category: string; sub: string | null };

const n0 = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const kindOfPart = (p: KitCatPart): PartKind | null =>
  p.category ? { category: p.category, sub: subOf(p.category, { category: p.category, name: p.name, subcategory: p.subcategory }) } : null;

/** Tipo de uma peça do kit: pela peça vinculada ou, se for só texto, pela peça do cadastro mais parecida */
export function kindOf(parts: KitCatPart[], description: string, partId: string | null): PartKind | null {
  const linked = partId ? parts.find(p => p.id === partId) : undefined;
  if (linked) return kindOfPart(linked);
  const ws = searchWords(description);
  for (const words of [ws, ws.slice(0, 2), ws.slice(0, 1)]) {
    if (!words.length) continue;
    const hit = parts.find(p => p.category && matchesAll(searchHay(p.name, p.code), words));
    if (hit) return kindOfPart(hit);
  }
  return null;
}

const sameKind = (p: KitCatPart, k: PartKind | null) => {
  if (!k || p.category !== k.category) return false;
  if (!k.sub || k.sub === 'outros') return true;
  return kindOfPart(p)?.sub === k.sub;
};

/**
 * Busca de peça do cadastro (nome ou código). Com `like`, já abre mostrando as peças do mesmo tipo
 * (trocar um óleo → todos os óleos). Escolher vincula a peça (custo e estoque);
 * Enter sem escolher usa o texto digitado (peça sem cadastro), quando `onText` existe.
 */
export function PartSearch({ parts, model, like, placeholder, autoFocus, onPick, onText, onCancel }: {
  parts: KitCatPart[]; model?: string | null; like?: PartKind | null; placeholder?: string; autoFocus?: boolean;
  onPick: (p: KitCatPart) => void; onText?: (text: string) => void; onCancel?: () => void;
}) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [focus, setFocus] = useState(!!autoFocus);
  const box = useRef<HTMLDivElement>(null);
  const ws = searchWords(q);
  const m = n0(model ?? '').trim();
  const rank = (list: KitCatPart[], extra: (p: KitCatPart) => number) =>
    list.map((p, i) => ({ p, i, k: extra(p) + (m && n0(p.name).includes(m) ? 2 : 0) + (Number(p.stock_qty) > 0 ? 1 : 0) }))
      .sort((a, b) => b.k - a.k || a.p.name.localeCompare(b.p.name, 'pt-BR') || a.i - b.i).map(x => x.p);

  // Sem nada digitado: as do mesmo tipo
  const seed = useMemo(() => (like ? rank(parts.filter(p => sameKind(p, like)), () => 0) : []), [parts, like, m]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(() => {
    if (!ws.length) return seed.slice(0, 60);
    const hits = parts.filter(p => matchesAll(searchHay(p.name, p.code), ws));
    return rank(hits, p => (codeHit(p.code, ws) ? 6 : 0) + (sameKind(p, like ?? null) ? 3 : 0)).slice(0, 30);
  }, [q, parts, seed, like, m]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setHi(0), [q]);

  const pick = (p: KitCatPart) => { onPick(p); setQ(''); };
  const show = focus && (q.trim().length > 0 || seed.length > 0);
  return (
    <div ref={box} className="relative flex-1 min-w-0">
      <input className="input !py-1.5 text-sm w-full" value={q} autoFocus={autoFocus}
        placeholder={placeholder ?? 'Buscar peça no cadastro (nome ou código)'}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (results[hi]) pick(results[hi]); else if (onText && q.trim()) { onText(q.trim()); setQ(''); } }
          else if (e.key === 'Escape') onCancel?.();
        }} />
      {show && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-xl border border-steel-200 bg-white shadow-lg">
          {!ws.length && <li className="px-3 pt-2 pb-1 text-xs font-semibold text-steel-500">Do mesmo tipo ({seed.length}) · digite para buscar outras</li>}
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
          {ws.length > 0 && !results.length && <li className="px-3 py-2 text-sm text-steel-500">Nenhuma peça no cadastro com “{q.trim()}”.</li>}
          {onText && ws.length > 0 && (
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

/** Custo das peças do kit e margem sobre o valor do serviço */
export function KitMoney({ items, parts, servicePrice }: {
  items: { part_id: string | null; quantity: number }[]; parts: KitCatPart[]; servicePrice: number | null;
}) {
  let cost = 0; let missing = 0;
  for (const it of items) {
    const p = it.part_id ? parts.find(x => x.id === it.part_id) : undefined;
    if (p?.cost != null) cost += Number(p.cost) * Number(it.quantity); else missing++;
  }
  const price = Number(servicePrice ?? 0);
  const margin = price - cost;
  const pct = price > 0 ? (margin / price) * 100 : null;
  return (
    <span className="text-xs text-steel-500 tabular-nums">
      custo <strong className="text-steel-800">{fmtBRL(cost)}</strong>
      {price > 0 ? <>
        {' · '}serviço {fmtBRL(price)}{' · '}margem{' '}
        <strong className={margin < 0 ? 'text-red-600' : 'text-signal-700'}>{fmtBRL(margin)}{pct != null ? ` (${pct.toFixed(0)}%)` : ''}</strong>
      </> : <> · <span className="text-steel-400">serviço sem preço na tabela</span></>}
      {missing > 0 && <span className="text-pending-700"> · {missing} peça{missing === 1 ? '' : 's'} sem custo</span>}
    </span>
  );
}

type Draft = { part_id: string | null; description: string; quantity: string };
const plateNorm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const PLATE_FULL = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

/** Criar um kit novo: serviço + carro (pela placa ou digitado) + peças */
export function NewKitModal({ wid, parts, onClose, onSaved }: {
  wid: string; parts: KitCatPart[]; onClose: () => void; onSaved: () => void;
}) {
  const [services, setServices] = useState<{ id: string; name: string; category: string | null; price: number | null }[]>([]);
  const [svc, setSvc] = useState('');
  const [anyCar, setAnyCar] = useState(false);
  const [plate, setPlate] = useState('');
  const [plateMsg, setPlateMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const looked = useRef('');
  const [make, setMake] = useState('');
  const [makeTouched, setMakeTouched] = useState(false);
  const [model, setModel] = useState('');
  const [yFrom, setYFrom] = useState('');
  const [yTo, setYTo] = useState('');
  const [list, setList] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('workshop_services').select('id, name, category, price').eq('workshop_id', wid).eq('active', true).order('name')
      .then(({ data }) => setServices((data ?? []) as { id: string; name: string; category: string | null; price: number | null }[]));
  }, [wid]);

  // Placa completa → carro: primeiro os carros já cadastrados na loja, depois a consulta de placa
  useEffect(() => {
    const p = plateNorm(plate);
    if (!PLATE_FULL.test(p)) { looked.current = ''; setPlateMsg(null); return; }
    if (looked.current === p) return;
    looked.current = p;
    setPlateMsg({ ok: true, text: 'Buscando o carro da placa…' });
    (async () => {
      const { data: v } = await supabase.from('vehicles').select('make, model, year').eq('plate', p).limit(1).maybeSingle();
      let mk = '', md = '', yr: number | null = null;
      if (v && (v as { model: string | null }).model) {
        const r = v as { make: string | null; model: string | null; year: number | null };
        mk = catalogMake(r.make) || (r.make ?? '');
        md = mk ? catalogModel(mk, r.model).model : (r.model ?? '');
        yr = r.year;
      } else {
        const res = await lookupPlate(wid, p);
        if (res.status !== 'found') { if (looked.current === p) setPlateMsg({ ok: false, text: 'Não achei essa placa. Digite o modelo abaixo.' }); return; }
        const c = carFromPlate(res.car);
        mk = c.make; md = c.model; yr = c.year ? Number(c.year) : null;
      }
      if (looked.current !== p) return;
      setMake(mk); setMakeTouched(!!mk); setModel(md);
      setPlateMsg({ ok: true, text: `${[mk, md].filter(Boolean).join(' ')}${yr ? ` ${yr}` : ''} — o kit vale para o modelo. Anos só se a peça mudar por ano.` });
    })();
  }, [plate, wid]);

  const add = (d: Draft) => setList(l => l.some(x => x.part_id && x.part_id === d.part_id) ? l : [...l, d]);
  const year = (s: string) => { const n = parseInt(s, 10); return n >= 1950 && n <= 2100 ? n : null; };
  const svcPrice = services.find(s => s.id === svc)?.price ?? null;

  async function save() {
    if (!svc) return toast.error('Escolha o serviço do kit');
    if (!anyCar && !model.trim()) return toast.error('Informe o carro (placa ou modelo), ou marque "Serve em qualquer carro"');
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
              <div className="space-y-2 mt-1.5">
                <input className="input uppercase tracking-wider" placeholder="Placa (opcional) — preenche o carro" value={plate}
                  maxLength={8} onChange={e => setPlate(e.target.value)} aria-label="Placa" />
                {plateMsg && <p className={`text-xs ${plateMsg.ok ? 'text-steel-600' : 'text-pending-700'}`}>{plateMsg.text}</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input className="input col-span-2 sm:col-span-1" placeholder="Modelo (ex.: Palio)" value={model} aria-label="Modelo"
                    onChange={e => { setModel(e.target.value); if (!makeTouched) setMake(makeOfModel(e.target.value) ?? ''); }} />
                  <input className="input col-span-2 sm:col-span-1" placeholder="Marca" value={make} aria-label="Marca"
                    onChange={e => { setMake(e.target.value); setMakeTouched(true); }} />
                  <input className="input" placeholder="Ano de" inputMode="numeric" value={yFrom} onChange={e => setYFrom(e.target.value)} aria-label="Ano de" />
                  <input className="input" placeholder="Ano até" inputMode="numeric" value={yTo} onChange={e => setYTo(e.target.value)} aria-label="Ano até" />
                </div>
              </div>
            )}
          </div>

          <div>
            <span className="label">Peças do kit</span>
            {list.length > 0 && (
              <div className="space-y-1.5 mb-2">
                {list.map((l, i) => {
                  const cp = l.part_id ? parts.find(p => p.id === l.part_id) : undefined;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <input className="input !py-1.5 text-sm w-16 text-center shrink-0" value={l.quantity} aria-label="Quantidade"
                        onChange={e => setList(xs => xs.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                      <span className="flex-1 min-w-0 text-sm">
                        <span className="block truncate text-steel-900">{l.description}</span>
                        <span className={`block text-[11px] ${l.part_id ? 'text-steel-500' : 'text-pending-700'}`}>
                          {l.part_id ? (cp?.cost != null ? `custo ${fmtBRL(Number(cp.cost))}` : 'do cadastro') : 'sem cadastro'}
                        </span>
                      </span>
                      <button type="button" className="h-9 w-9 text-steel-400 hover:text-red-600" aria-label="Tirar a peça"
                        onClick={() => setList(xs => xs.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
            <PartSearch parts={parts} model={model} placeholder="Buscar peça no cadastro para incluir"
              onPick={p => add({ part_id: p.id, description: p.name, quantity: '1' })}
              onText={t => add({ part_id: null, description: t, quantity: '1' })} />
            {list.length > 0 && (
              <div className="mt-2">
                <KitMoney items={list.map(l => ({ part_id: l.part_id, quantity: parseMoney(l.quantity) || 0 }))} parts={parts} servicePrice={svcPrice} />
              </div>
            )}
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
