import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import LicensePlate from '@/components/os/LicensePlate';
import { fmtPhone } from '@/components/os/osHelpers';
import { maskPhone } from '@/lib/customers';
import type { Customer, Vehicle } from '@/types/database';

/* Cliente e carro do check-up: busca por placa, nome ou telefone (ou clientes recentes)
   e, se não achar, cadastra novo — o cadastro de verdade é criado ao salvar (createFromPick). */

export type Match = { customer: Customer; vehicle: Vehicle | null };
export type NewCar = { name: string; phone: string; plate: string; make: string; model: string; year: string };
/** search: cliente cadastrado (car = carro novo dele, se ainda não tinha) · new: cliente e carro novos */
export type Pick = { mode: 'search'; match: Match | null; car?: NewCar } | { mode: 'new'; data: NewCar };

export const EMPTY_PICK: Pick = { mode: 'search', match: null };
const EMPTY_NEW: NewCar = { name: '', phone: '', plate: '', make: '', model: '', year: '' };

export const plateNorm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const digits = (s: string) => s.replace(/\D/g, '');
const looksLikePlate = (s: string) => /^[A-Z]{3}[0-9][A-Z0-9]?[0-9]{0,2}$/.test(plateNorm(s));

export default function CustomerCarPicker({ workshopId, value, onChange }: {
  /** null = demonstração (sem banco): só o cadastro novo */
  workshopId: string | null;
  value: Pick;
  onChange: (p: Pick) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Match[]>([]);
  const [recent, setRecent] = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [newCarFor, setNewCarFor] = useState(false); // cliente escolhido sem carro: cadastrar o carro

  // Clientes recentes (últimas OS e check-ups)
  useEffect(() => {
    if (!workshopId) return;
    supabase.from('service_orders').select('created_at, customer:customers(*), vehicle:vehicles(*)')
      .eq('workshop_id', workshopId).not('customer_id', 'is', null)
      .order('created_at', { ascending: false }).limit(40)
      .then(({ data }) => {
        const seen = new Set<string>();
        const list: Match[] = [];
        for (const o of (data ?? []) as unknown as { customer: Customer | null; vehicle: Vehicle | null }[]) {
          if (!o.customer) continue;
          const key = `${o.customer.id}-${o.vehicle?.id ?? 'x'}`;
          if (seen.has(key)) continue;
          seen.add(key);
          list.push({ customer: o.customer, vehicle: o.vehicle });
          if (list.length >= 5) break;
        }
        setRecent(list);
      });
  }, [workshopId]);

  // Busca por placa, nome ou telefone
  useEffect(() => {
    if (!workshopId || value.mode !== 'search' || value.match) return;
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      setSearching(true);
      const found: Match[] = [];
      const seen = new Set<string>();
      const plate = plateNorm(q);
      if (plate.length >= 3 && /[A-Z]/.test(plate) && /[0-9]/.test(plate)) {
        const { data } = await supabase.from('vehicles').select('*, customer:customers(*)')
          .eq('workshop_id', workshopId).ilike('plate', `%${plate}%`).limit(6);
        for (const v of (data ?? []) as (Vehicle & { customer: Customer | null })[]) {
          if (!v.customer) continue;
          found.push({ customer: v.customer, vehicle: v }); seen.add(v.id);
        }
      }
      const tel = digits(q);
      const filter = tel.length >= 4 && tel.length === q.replace(/[\s()-]/g, '').length
        ? `phone.ilike.%${tel.slice(-8)}%`
        : `full_name.ilike.%${q.replace(/[,()%]/g, ' ').trim()}%`;
      const { data: cs } = await supabase.from('customers').select('*, vehicles(*)')
        .eq('workshop_id', workshopId).or(filter).limit(6);
      for (const c of (cs ?? []) as (Customer & { vehicles: Vehicle[] })[]) {
        const { vehicles, ...customer } = c;
        if (!vehicles?.length) { found.push({ customer, vehicle: null }); continue; }
        for (const v of vehicles) if (!seen.has(v.id)) { found.push({ customer, vehicle: v }); seen.add(v.id); }
      }
      if (!alive) return;
      setResults(found.slice(0, 8));
      setSearching(false);
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [query, value, workshopId]);

  function startNew() {
    const q = query.trim();
    const only = digits(q);
    onChange({ mode: 'new', data: {
      ...EMPTY_NEW,
      plate: looksLikePlate(q) ? plateNorm(q) : '',
      name: !looksLikePlate(q) && only.length < 4 ? q : '',
      phone: only.length >= 8 && !looksLikePlate(q) ? maskPhone(q) : '',
    } });
  }

  // Demonstração: só o cadastro novo
  const mode = !workshopId ? 'new' : value.mode;
  const data = value.mode === 'new' ? value.data : EMPTY_NEW;
  const setData = (patch: Partial<NewCar>) => onChange({ mode: 'new', data: { ...data, ...patch } });

  /* ── Escolhido ── */
  if (mode === 'search' && value.mode === 'search' && value.match) {
    const { customer, vehicle } = value.match;
    return (
      <div className="space-y-2">
        <span className="label">Cliente e carro</span>
        <div className="rounded-xl border border-brand-300 bg-brand-50 px-3 py-2.5 flex items-center gap-3">
          {vehicle && <LicensePlate plate={vehicle.plate} size="sm" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-steel-800 truncate">{customer.full_name}</div>
            <div className="text-xs text-steel-500 truncate">
              {[vehicle ? `${vehicle.make} ${vehicle.model}${vehicle.year ? ` ${vehicle.year}` : ''}` : 'Sem carro cadastrado', customer.phone && fmtPhone(customer.phone)].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button type="button" onClick={() => { onChange(EMPTY_PICK); setNewCarFor(false); setQuery(''); }}
            className="text-xs font-semibold text-brand-700 hover:underline shrink-0">Trocar</button>
        </div>
        {!vehicle && (
          newCarFor ? (
            <CarFields data={value.car ?? EMPTY_NEW} hint="Carro novo deste cliente"
              onFields={p => onChange({ mode: 'search', match: value.match, car: { ...(value.car ?? EMPTY_NEW), ...p } })} />
          ) : (
            <button type="button" onClick={() => setNewCarFor(true)} className="text-xs font-semibold text-brand-600 hover:underline">
              + Cadastrar o carro deste cliente
            </button>
          )
        )}
      </div>
    );
  }

  /* ── Cadastro novo ── */
  if (mode === 'new') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="label !mb-0">Cliente novo</span>
          {workshopId && (
            <button type="button" onClick={() => onChange(EMPTY_PICK)} className="text-xs font-semibold text-brand-600 hover:underline">
              ← Buscar cliente cadastrado
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome do cliente" value={data.name} onChange={v => setData({ name: v })} placeholder="João Silva" />
          <Field label="WhatsApp" value={data.phone} onChange={v => setData({ phone: maskPhone(v) })} placeholder="(11) 99999-9999" inputMode="tel" />
        </div>
        <CarFields data={data} onFields={setData} />
        {workshopId && <p className="text-[11px] text-steel-400">O cliente e o carro entram no cadastro da oficina ao criar o check-up.</p>}
      </div>
    );
  }

  /* ── Busca ── */
  const list = query.trim().length >= 2 ? results : recent;
  return (
    <div className="space-y-2">
      <span className="label">Cliente e carro</span>
      <input className="input" autoFocus value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Buscar por placa, nome ou telefone…" />
      <div className="rounded-xl border border-steel-200 divide-y divide-steel-100 overflow-hidden">
        {query.trim().length < 2 && recent.length > 0 && (
          <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-steel-400 uppercase tracking-widest bg-steel-50">Clientes recentes</div>
        )}
        {query.trim().length >= 2 && searching && results.length === 0 && <div className="px-3 py-2.5 text-sm text-steel-400">Buscando…</div>}
        {query.trim().length >= 2 && !searching && results.length === 0 && <div className="px-3 py-2.5 text-sm text-steel-400">Nenhum cliente encontrado.</div>}
        {list.map(r => (
          <button key={`${r.customer.id}-${r.vehicle?.id ?? 'x'}`} type="button"
            onClick={() => onChange({ mode: 'search', match: r })}
            className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-steel-50">
            {r.vehicle ? <LicensePlate plate={r.vehicle.plate} size="sm" /> : <span className="text-xs text-steel-400 w-16">sem carro</span>}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-steel-800 truncate">{r.customer.full_name}</div>
              <div className="text-xs text-steel-500 truncate">
                {[r.vehicle && `${r.vehicle.make} ${r.vehicle.model}`, r.customer.phone && fmtPhone(r.customer.phone)].filter(Boolean).join(' · ')}
              </div>
            </div>
          </button>
        ))}
        <button type="button" onClick={startNew} className="w-full text-left px-3 py-2.5 text-sm font-semibold text-brand-600 hover:bg-brand-50">
          + Cadastrar cliente novo{query.trim() ? ` (“${query.trim()}”)` : ''}
        </button>
      </div>
    </div>
  );
}

function CarFields({ data, onFields, hint }: { data: NewCar; onFields: (p: Partial<NewCar>) => void; hint?: string }) {
  return (
    <div className="space-y-1">
      {hint && <div className="text-[11px] font-semibold text-steel-500">{hint}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Placa" value={data.plate} onChange={v => onFields({ plate: v.toUpperCase() })} placeholder="ABC1D23" />
        <Field label="Marca" value={data.make} onChange={v => onFields({ make: v })} placeholder="Fiat" />
        <Field label="Modelo" value={data.model} onChange={v => onFields({ model: v })} placeholder="Argo" />
        <Field label="Ano" value={data.year} onChange={v => onFields({ year: v.replace(/\D/g, '').slice(0, 4) })} placeholder="2019" inputMode="numeric" />
      </div>
    </div>
  );
}

function Field({ label, value, onChange, ...props }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input {...props} value={value} onChange={e => onChange(e.target.value)} className="input mt-1" />
    </label>
  );
}
