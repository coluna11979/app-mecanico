import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { searchModels } from '@/lib/carModels';
import { vehicleYears } from '@/lib/vehicleCatalog';
import { DEFAULT_MARGIN, fmtQty, loadAllParts, loadMargins, salePriceOf, type Margins, type WorkshopPart } from '@/lib/parts';
import QuickPartModal from '@/components/parts/QuickPartModal';
import {
  filterLabel, fmtInterval, fmtLiters, loadSheet, logLookup, lookupPlate, matchTechVehicles, partsForFilter, partsForFluid,
  plateCarName, searchTechVehicles, systemLabel, vehicleDetail, vehicleName, FILTER_KINDS, PLATE_RE,
  type FilterRef, type FluidSpec, type TechVehicle,
} from '@/lib/techCatalog';
import { plateNorm } from '@/lib/customers';

type StockPart = Pick<WorkshopPart, 'id' | 'name' | 'code' | 'brand' | 'cost' | 'margin_percent' | 'sale_price' | 'stock_qty' | 'category' | 'unit'>;
const PART_COLS = 'id, name, code, brand, cost, margin_percent, sale_price, stock_qty, category, unit';
type Car = { id: string; plate: string; make: string; model: string; year: number | null; tech_vehicle_id: string | null };

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ConsultaTecnica() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const [params, setParams] = useSearchParams();
  const carId = params.get('carro');
  const sheetId = params.get('ficha');

  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [results, setResults] = useState<TechVehicle[] | null>(null);
  const [searched, setSearched] = useState('');
  const [searching, setSearching] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [car, setCar] = useState<Car | null>(null);
  const [plate, setPlate] = useState('');
  const [plateBusy, setPlateBusy] = useState(false);
  /** Carro que a placa identificou (nome para mostrar) ou o motivo de não ter identificado */
  const [plateInfo, setPlateInfo] = useState<{ name?: string; plate?: string; msg?: string } | null>(null);
  const years = useMemo(() => vehicleYears(1980), []);
  const hints = showHints ? searchModels(model) : [];

  async function run(m: string, y: string) {
    if (!wid || !m.trim()) return;
    setSearching(true);
    setShowHints(false);
    const yr = y ? Number(y) : null;
    const rows = await searchTechVehicles(m, yr);
    setResults(rows);
    setSearched(m.trim());
    setSearching(false);
    if (rows.length === 0) logLookup(wid, m, yr, null);
    if (rows.length === 1) open(rows[0], m, yr);
  }

  async function runPlate(e: FormEvent) {
    e.preventDefault();
    const p = plateNorm(plate);
    if (!wid) return;
    if (!PLATE_RE.test(p)) { setPlateInfo({ msg: 'Placa inválida. Confira as 7 letras e números (ex.: ABC1D23).' }); return; }
    setPlateBusy(true);
    setPlateInfo(null); setResults(null); setCar(null);
    const r = await lookupPlate(wid, p);
    setPlateBusy(false);
    if (r.status !== 'found') {
      setPlateInfo({ msg: {
        invalid: 'Placa inválida. Confira as 7 letras e números (ex.: ABC1D23).',
        not_found: 'Não encontramos essa placa. Busque pelo modelo do carro logo abaixo.',
        not_configured: 'A busca por placa ainda não está ativada para carros que não são de clientes cadastrados. Busque pelo modelo logo abaixo.',
        limit: 'Sua oficina atingiu o limite de consultas por placa de hoje. Busque pelo modelo logo abaixo.',
        unavailable: 'A consulta de placa está fora do ar agora. Tente de novo em instantes ou busque pelo modelo.',
      }[r.status] });
      return;
    }
    const name = plateCarName(r.car);
    setPlateInfo({ name, plate: r.plate });
    setModel(r.car.model ?? ''); setYear(r.car.year ? String(r.car.year) : '');
    // Carro de cliente: guarda para gravar a versão escolhida nele
    const own = r.vehicle_id
      ? { id: r.vehicle_id, plate: r.plate, make: r.car.make ?? '', model: r.car.model ?? '', year: r.car.year, tech_vehicle_id: r.tech_vehicle_id ?? null }
      : null;
    if (own?.tech_vehicle_id) {
      logLookup(wid, own.model, own.year, own.tech_vehicle_id);
      const next = new URLSearchParams(params);
      next.set('ficha', own.tech_vehicle_id);
      setParams(next);
      return;
    }
    const rows = await matchTechVehicles(r.car);
    setResults(rows);
    setSearched(name);
    if (rows.length === 0) logLookup(wid, r.car.model ?? name, r.car.year, null);
    if (rows.length === 1) open(rows[0], r.car.model ?? '', r.car.year, own);
    else setCar(own);
  }

  function open(v: TechVehicle, m = model, yr: number | null = year ? Number(year) : null, forCar: Car | null = car) {
    if (wid) logLookup(wid, m || v.model, yr, v.id);
    const next = new URLSearchParams(params);
    next.set('ficha', v.id);
    setParams(next);
    // A versão escolhida fica no carro do cliente: da próxima vez abre direto
    if (forCar && forCar.tech_vehicle_id !== v.id) {
      supabase.from('vehicles').update({ tech_vehicle_id: v.id }).eq('id', forCar.id).then(() => setCar({ ...forCar, tech_vehicle_id: v.id }));
    }
  }

  function back() {
    const next = new URLSearchParams(params);
    next.delete('ficha');
    setParams(next);
  }

  // Veio de um carro do cliente (?carro=id): já sabe modelo e ano; se a versão foi escolhida antes, abre a ficha
  useEffect(() => {
    if (!carId || !wid) return;
    let alive = true;
    supabase.from('vehicles').select('id, plate, make, model, year, tech_vehicle_id').eq('id', carId).eq('workshop_id', wid).maybeSingle()
      .then(({ data }) => {
        if (!alive || !data) return;
        const c = data as Car;
        setCar(c);
        setModel(c.model);
        setYear(c.year ? String(c.year) : '');
        if (c.tech_vehicle_id && !sheetId) {
          const next = new URLSearchParams(params);
          next.set('ficha', c.tech_vehicle_id);
          setParams(next, { replace: true });
        } else if (!sheetId) run(c.model, c.year ? String(c.year) : '');
      });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carId, wid]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setPlateInfo(null);
    run(model, year);
  }

  return (
    <WorkshopLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consulta de óleo e filtros</h1>
          <p className="text-sm text-steel-500">Digite a placa e veja qual óleo, quantos litros e quais filtros o carro usa.</p>
        </div>

        {plateInfo?.name ? (
          <div className="rounded-xl bg-signal-50 border border-signal-200 px-3 py-2 text-sm">
            Placa <strong className="font-mono">{plateInfo.plate}</strong>: <strong>{plateInfo.name}</strong>
          </div>
        ) : car && (
          <div className="rounded-xl bg-steel-50 border border-steel-200 px-3 py-2 text-sm">
            Carro do cliente: <strong>{car.make} {car.model}{car.year ? ` ${car.year}` : ''}</strong> · {car.plate}
          </div>
        )}

        {sheetId && wid ? (
          <Sheet key={sheetId} wid={wid} vehicleId={sheetId} onBack={back} />
        ) : (
          <>
            <form onSubmit={runPlate} className="card space-y-3">
              <label className="label" htmlFor="ct-plate">Placa do carro</label>
              <div className="flex gap-2">
                <input id="ct-plate" className="input uppercase font-mono text-lg tracking-widest flex-1 min-w-0" autoComplete="off" autoCapitalize="characters"
                  placeholder="ABC1D23" maxLength={8} value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} />
                <button className="btn-primary min-h-[44px] shrink-0" disabled={plateBusy || plateNorm(plate).length < 7}>
                  {plateBusy ? 'Buscando…' : 'Consultar'}
                </button>
              </div>
              {plateInfo?.msg && <p className="text-sm text-pending-700">{plateInfo.msg}</p>}
            </form>

            <form onSubmit={submit} className="card space-y-3">
              <div className="text-sm font-semibold text-steel-600">Ou busque pelo modelo</div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-3">
                <div className="relative">
                  <label className="label" htmlFor="ct-model">Modelo do carro</label>
                  <input id="ct-model" className="input" autoComplete="off" placeholder="Ex.: Onix, Gol, HB20"
                    value={model} onChange={e => { setModel(e.target.value); setShowHints(true); }} onFocus={() => setShowHints(true)} />
                  {hints.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-steel-200 rounded-xl shadow-lg divide-y divide-steel-100 overflow-hidden">
                      {hints.map(h => (
                        <button key={h} type="button" className="w-full text-left px-3 py-3 text-sm hover:bg-steel-50"
                          onClick={() => { setModel(h); run(h, year); }}>{h}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="ct-year">Ano</label>
                  <select id="ct-year" className="input" value={year} onChange={e => setYear(e.target.value)}>
                    <option value="">Qualquer ano</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <button className="btn-ghost border border-steel-200 w-full sm:w-auto min-h-[44px]" disabled={searching || !model.trim()}>
                {searching ? 'Buscando…' : 'Buscar pelo modelo'}
              </button>
            </form>

            {results && results.length === 0 && (
              <div className="card">
                <div className="font-semibold">Ainda não temos a ficha de “{searched}”{year && !plateInfo?.name ? ` ${year}` : ''}.</div>
                <p className="text-sm text-steel-500 mt-1">
                  Sua busca ficou registrada e esse modelo entrou na nossa fila de cadastro. Enquanto isso, confira o manual do proprietário.
                </p>
              </div>
            )}

            {results && results.length > 1 && (
              <div className="space-y-2">
                <div className="text-sm font-semibold text-steel-600">Qual é a versão?</div>
                {results.map(v => (
                  <button key={v.id} onClick={() => open(v)}
                    className="card w-full text-left min-h-[56px] hover:border-brand-400 transition flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <strong className="block">{vehicleName(v)}</strong>
                      <span className="block text-sm text-steel-500">{vehicleDetail(v) || 'Todas as versões'}</span>
                    </span>
                    <span className="text-brand-600 font-semibold text-sm shrink-0">Abrir</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}

type TabKey = 'motor' | 'cambio' | 'filtros' | 'outros';

function Sheet({ wid, vehicleId, onBack }: { wid: string; vehicleId: string; onBack: () => void }) {
  const [vehicle, setVehicle] = useState<TechVehicle | null>(null);
  const [fluids, setFluids] = useState<FluidSpec[]>([]);
  const [filters, setFilters] = useState<FilterRef[]>([]);
  const [parts, setParts] = useState<StockPart[]>([]);
  const [margins, setMargins] = useState<Margins>({ base: DEFAULT_MARGIN, byCategory: {} });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('motor');
  const [quick, setQuick] = useState<string | null>(null);

  const reloadParts = () => loadAllParts<StockPart>(wid, PART_COLS).then(setParts);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([loadSheet(vehicleId), loadAllParts<StockPart>(wid, PART_COLS), loadMargins(wid)]).then(([s, p, m]) => {
      if (!alive) return;
      setVehicle(s.vehicle); setFluids(s.fluids); setFilters(s.filters); setParts(p); setMargins(m);
      const has = (k: TabKey) =>
        k === 'filtros' ? s.filters.length > 0
          : k === 'outros' ? s.fluids.some(f => f.system !== 'motor' && f.system !== 'cambio')
            : s.fluids.some(f => f.system === k);
      setTab((['motor', 'cambio', 'filtros', 'outros'] as TabKey[]).find(has) ?? 'motor');
      setLoading(false);
    });
    return () => { alive = false; };
  }, [vehicleId, wid]);

  if (loading) return <div className="card h-40 animate-pulse" />;
  if (!vehicle) {
    return (
      <div className="card">
        <div className="font-semibold">Ficha não encontrada.</div>
        <button onClick={onBack} className="btn-ghost mt-3 border border-steel-200 min-h-[44px]">Fazer outra consulta</button>
      </div>
    );
  }

  const motor = fluids.find(f => f.system === 'motor');
  const byTab: Record<TabKey, FluidSpec[]> = {
    motor: fluids.filter(f => f.system === 'motor'),
    cambio: fluids.filter(f => f.system === 'cambio'),
    filtros: [],
    outros: fluids.filter(f => f.system !== 'motor' && f.system !== 'cambio'),
  };
  const tabs = ([
    ['motor', 'Motor', byTab.motor.length], ['cambio', 'Câmbio', byTab.cambio.length],
    ['filtros', 'Filtros', filters.length], ['outros', 'Outros fluidos', byTab.outros.length],
  ] as [TabKey, string, number][]).filter(t => t[2] > 0);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm font-semibold text-brand-700 min-h-[44px]">← Outra consulta</button>

      <div className="card">
        <div className="text-xs font-bold uppercase tracking-widest text-steel-500">{vehicleDetail(vehicle) || 'Todas as versões'}</div>
        <h2 className="text-xl font-bold mt-0.5">{vehicleName(vehicle)}</h2>
        {motor && (
          <p className="text-lg mt-3 leading-snug">
            Óleo do motor: <strong className="text-brand-700">{[motor.viscosity, motor.spec].filter(Boolean).join(' · ')}</strong>
            {motor.capacity_liters != null && <> — <strong className="text-brand-700">{fmtLiters(motor.capacity_liters)}</strong></>}
          </p>
        )}
        {vehicle.notes && <p className="text-sm text-steel-600 mt-2">{vehicle.notes}</p>}
        <p className="text-xs text-steel-500 mt-3">Confira sempre o manual do proprietário: a recomendação da montadora vem primeiro.</p>
      </div>

      {tabs.length === 0 ? (
        <div className="card text-sm text-steel-500">Esta ficha ainda está sendo conferida.</div>
      ) : (
        <>
          <div className="flex gap-1 bg-steel-100 rounded-xl p-1 overflow-x-auto">
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`text-sm font-semibold px-3.5 min-h-[44px] rounded-lg whitespace-nowrap transition ${tab === k ? 'bg-white shadow-sm text-steel-900' : 'text-steel-500'}`}>
                {l}
              </button>
            ))}
          </div>

          {tab !== 'filtros' && byTab[tab].map(s => (
            <div key={s.id} className="card space-y-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-steel-500">{systemLabel(s.system)}</div>
                <div className="text-lg font-bold">{[s.viscosity, s.spec].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {s.capacity_liters != null && <Fact label="Capacidade" value={fmtLiters(s.capacity_liters)} />}
                {fmtInterval(s) && <Fact label="Troca a cada" value={fmtInterval(s)} />}
              </dl>
              {s.notes && <p className="text-sm text-steel-600">{s.notes}</p>}
              <Source url={s.source_url} />
              <Stock matches={partsForFluid(parts, s)} margins={margins}
                onRegister={() => setQuick(`Óleo ${[s.viscosity, s.spec].filter(Boolean).join(' ')}`.trim())} />
            </div>
          ))}

          {tab === 'filtros' && FILTER_KINDS.filter(k => filters.some(f => f.kind === k.value)).map(k => {
            const rows = filters.filter(f => f.kind === k.value);
            const matches = [...new Map(rows.flatMap(f => partsForFilter(parts, f)).map(p => [p.id, p])).values()];
            return (
              <div key={k.value} className="card space-y-3">
                <div className="text-lg font-bold">{filterLabel(k.value)}</div>
                <ul className="divide-y divide-steel-100">
                  {rows.map(f => (
                    <li key={f.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-steel-600">{f.brand}{f.notes ? ` · ${f.notes}` : ''}</span>
                      <strong className="font-mono">{f.code}</strong>
                    </li>
                  ))}
                </ul>
                <Source url={rows.find(f => f.source_url)?.source_url ?? null} />
                <Stock matches={matches} margins={margins}
                  onRegister={() => setQuick(`${filterLabel(k.value)} ${rows[0].brand} ${rows[0].code}`)} />
              </div>
            );
          })}
        </>
      )}

      <Feedback wid={wid} vehicleId={vehicle.id} />

      {quick !== null && (
        <QuickPartModal wid={wid} osLabel="" registerOnly initialName={quick} quantity={1} defaultMargin={margins.base}
          onClose={() => setQuick(null)}
          onSaved={() => { setQuick(null); reloadParts(); }} />
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-steel-500">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Source({ url }: { url: string | null }) {
  if (!url) return null;
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* texto livre */ }
  return /^https?:\/\//.test(url)
    ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 underline">Fonte: {host}</a>
    : <span className="text-xs text-steel-500">Fonte: {url}</span>;
}

/** O que a oficina tem no estoque que serve aqui, com o preço de venda */
function Stock({ matches, margins, onRegister }: { matches: StockPart[]; margins: Margins; onRegister: () => void }) {
  return (
    <div className="rounded-xl bg-steel-50 border border-steel-100 p-3">
      <div className="text-xs font-bold uppercase tracking-widest text-steel-500 mb-1.5">No seu estoque</div>
      {matches.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-steel-600">Nenhuma peça cadastrada que sirva aqui.</span>
          <button onClick={onRegister} className="btn-ghost border border-steel-200 text-sm min-h-[44px]">Cadastrar peça</button>
        </div>
      ) : (
        <ul className="divide-y divide-steel-200">
          {matches.slice(0, 6).map(p => (
            <li key={p.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.name}</span>
                <span className={`block text-xs ${Number(p.stock_qty) > 0 ? 'text-signal-700' : 'text-alert-600'}`}>
                  {Number(p.stock_qty) > 0 ? `${fmtQty(p.stock_qty)} ${p.unit} em estoque` : 'Sem estoque'}
                </span>
              </span>
              <strong className="shrink-0">{brl(salePriceOf(p, margins))}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Feedback({ wid, vehicleId }: { wid: string; vehicleId: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!msg.trim()) return;
    setSending(true);
    const { error } = await supabase.from('tech_feedback')
      .insert({ workshop_id: wid, vehicle_id: vehicleId, message: msg.trim(), created_by: user?.id ?? null });
    setSending(false);
    if (error) { toast.error('Não foi possível enviar: ' + error.message); return; }
    toast.success('Recebemos seu aviso. Vamos conferir.');
    setMsg(''); setOpen(false);
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-sm text-steel-500 underline min-h-[44px]">Achou alguma informação errada?</button>;
  }
  return (
    <div className="card space-y-2">
      <label className="label" htmlFor="ct-fb">O que está errado nesta ficha?</label>
      <textarea id="ct-fb" className="input" rows={3} value={msg} onChange={e => setMsg(e.target.value)}
        placeholder="Ex.: o manual desse carro pede 0W20" />
      <div className="flex gap-2">
        <button onClick={send} disabled={sending || !msg.trim()} className="btn-primary min-h-[44px]">{sending ? 'Enviando…' : 'Enviar aviso'}</button>
        <button onClick={() => setOpen(false)} className="btn-ghost min-h-[44px]">Cancelar</button>
      </div>
    </div>
  );
}
