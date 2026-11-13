import { useEffect, useMemo, useRef, useState } from 'react';
import { VEHICLE_CATALOG, vehicleYears } from '@/lib/vehicleCatalog';
import { ANY_MODEL, fmtYears, isAnyModel, norm, type VehicleDraft } from '@/lib/partVehicles';

const same = (a: VehicleDraft, b: VehicleDraft) =>
  norm(a.brand) === norm(b.brand) && norm(a.model) === norm(b.model) && a.year_from === b.year_from && a.year_to === b.year_to;

/**
 * Escolher em quais carros a peça serve: busca única (digite "corolla", "gol", "toyota"),
 * clique nos carros — cada clique adiciona e a busca continua aberta, ideal para peça que serve em vários
 * (ex.: óleo). Anos são opcionais e valem para os próximos que você adicionar.
 */
export default function VehiclePicker({ list, onChange, extraBrands, extraModels }: {
  list: VehicleDraft[]; onChange: (l: VehicleDraft[]) => void;
  /** marcas/modelos já cadastrados na oficina que não estão no catálogo */
  extraBrands: string[]; extraModels: (brand: string) => string[];
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  /** Cadastro só pela marca: serve em todos os modelos dela */
  const [byBrand, setByBrand] = useState(false);
  const [manual, setManual] = useState(false);
  const [mBrand, setMBrand] = useState('');
  const [mModel, setMModel] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const years = useMemo(() => vehicleYears(1970), []);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  /** Catálogo + o que a oficina já cadastrou, sem repetir */
  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: { brand: string; model: string; text: string }[] = [];
    const add = (brand: string, model: string) => {
      const k = `${norm(brand)}|${norm(model)}`;
      if (seen.has(k)) return;
      seen.add(k); out.push({ brand, model, text: norm(`${brand} ${model}`) });
    };
    for (const [b, ms] of Object.entries(VEHICLE_CATALOG)) for (const m of ms) add(b, m);
    for (const b of extraBrands) for (const m of extraModels(b)) add(b, m);
    return out;
  }, [extraBrands, extraModels]);

  const yFrom = /^\d{4}$/.test(from) ? Number(from) : null;
  const yTo = /^\d{4}$/.test(to) ? Number(to) : null;
  const yearsBad = yFrom != null && yTo != null && yTo < yFrom;

  const brands = useMemo(() => [...new Set(all.map(v => v.brand))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [all]);

  const hits = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (byBrand) return brands.filter(b => !words.length || words.every(w => norm(b).includes(w))).map(b => ({ brand: b, model: ANY_MODEL, text: '' })).slice(0, 12);
    if (!words.length) return [];
    return all.filter(v => words.every(w => v.text.includes(w)))
      .sort((a, b) => Number(norm(b.model).startsWith(words[0])) - Number(norm(a.model).startsWith(words[0])) || a.model.localeCompare(b.model, 'pt-BR'))
      .slice(0, 10);
  }, [all, brands, q, byBrand]);

  const draft = (brand: string, model: string): VehicleDraft => ({ brand, model, year_from: yFrom, year_to: yTo });
  const has = (brand: string, model: string) => list.some(x => same(x, draft(brand, model)));
  function toggle(brand: string, model: string) {
    if (yearsBad) return;
    const d = draft(brand, model);
    onChange(has(brand, model) ? list.filter(x => !same(x, d)) : [...list, d]);
  }
  function addManual() {
    if (!mBrand.trim() || !mModel.trim() || yearsBad) return;
    const d = draft(mBrand.trim(), mModel.trim());
    if (!list.some(x => same(x, d))) onChange([...list, d]);
    setMModel('');
  }

  return (
    <div className="space-y-3">
      {list.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {list.map((v, i) => (
            <li key={i} className="flex items-center gap-1 text-xs bg-steel-100 rounded-full pl-3 pr-1 py-1">
              <span><strong className="font-semibold">{isAnyModel(v.model) ? `${v.brand} · todos os modelos` : `${v.brand} ${v.model}`}</strong> <span className="text-steel-500">· {fmtYears(v)}</span></span>
              <button type="button" aria-label={`Remover ${v.brand} ${v.model}`} onClick={() => onChange(list.filter((_, j) => j !== i))}
                className="h-6 w-6 rounded-full grid place-items-center text-steel-500 hover:bg-steel-200">✕</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-steel-400">Nenhum carro ainda. Busque abaixo e clique nos que usam esta peça.</p>
      )}

      <div className="flex gap-2">
        {([[false, 'Por modelo'], [true, 'Só pela marca']] as const).map(([k, l]) => (
          <button key={l} type="button" onClick={() => { setByBrand(k); setQ(''); }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${byBrand === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>{l}</button>
        ))}
      </div>

      <div ref={box} className="relative">
        <input className="input !py-2.5 text-sm" placeholder={byBrand ? '🔍 Buscar marca: toyota, fiat, honda…' : '🔍 Buscar carro: corolla, gol, hb20, toyota…'}
          value={q} onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true); }} />
        {open && (byBrand || q.trim()) && (
          <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-steel-200 bg-white shadow-lg max-h-64 overflow-y-auto py-1">
            {hits.map(v => {
              const on = has(v.brand, v.model);
              return (
                <button key={`${v.brand}|${v.model}`} type="button" onClick={() => toggle(v.brand, v.model)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-steel-50">
                  <span className={`h-5 w-5 rounded-md border grid place-items-center text-[11px] shrink-0 ${on ? 'bg-signal-600 border-signal-600 text-white' : 'border-steel-300 text-transparent'}`}>✓</span>
                  <span className="text-sm text-steel-800">{byBrand
                    ? <><strong className="font-semibold">{v.brand}</strong> <span className="text-steel-500">todos os modelos</span></>
                    : <><strong className="font-semibold">{v.model}</strong> <span className="text-steel-500">{v.brand}</span></>}</span>
                </button>
              );
            })}
            {hits.length === 0 && (
              <div className="px-3 py-3 text-sm text-steel-500">
                Não achei “{q.trim()}”.{' '}
                <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => { setManual(true); setOpen(false); setMModel(q.trim()); }}>Digitar marca e modelo</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-steel-600">
        <span>Anos <span className="text-steel-400">(opcional, vale para os próximos que adicionar)</span>:</span>
        <select className="input !py-1.5 !px-2 text-xs !w-auto" value={from} onChange={e => setFrom(e.target.value)}>
          <option value="">de —</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="input !py-1.5 !px-2 text-xs !w-auto" value={to} onChange={e => setTo(e.target.value)}>
          <option value="">até —</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {(from || to) && <button type="button" className="text-steel-500 hover:underline" onClick={() => { setFrom(''); setTo(''); }}>limpar</button>}
        {yearsBad && <span className="text-alert-600 font-semibold">O ano final é menor que o inicial</span>}
      </div>

      {manual ? (
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !py-1.5 text-sm !w-36" placeholder="Marca" value={mBrand} onChange={e => setMBrand(e.target.value)} />
          <input className="input !py-1.5 text-sm !w-44" placeholder="Modelo" value={mModel} onChange={e => setMModel(e.target.value)} />
          <button type="button" onClick={addManual} disabled={!mBrand.trim() || !mModel.trim() || yearsBad}
            className="btn-ghost border border-steel-200 text-sm !py-1.5 disabled:opacity-40">＋ Adicionar</button>
          <button type="button" onClick={() => setManual(false)} className="text-xs text-steel-500 hover:underline">fechar</button>
        </div>
      ) : (
        <button type="button" onClick={() => setManual(true)} className="text-xs text-steel-500 hover:text-brand-700 hover:underline">Carro que não está na lista? Digitar marca e modelo</button>
      )}
    </div>
  );
}
