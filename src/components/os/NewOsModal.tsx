import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import LicensePlate from './LicensePlate';
import { fmtPhone } from './osHelpers';
import type { Customer, ServiceRecommendation, Vehicle, WorkshopMechanic } from '@/types/database';

type CustomerWithVehicles = Customer & { vehicles: Vehicle[] };
type Match = { customer: Customer; vehicle: Vehicle | null };

/** Serviços mais comuns — um toque preenche o título e a categoria */
const QUICK_SERVICES: { label: string; category: string }[] = [
  { label: 'Revisão geral',   category: 'Revisão geral' },
  { label: 'Troca de óleo',   category: 'Troca de óleo' },
  { label: 'Freios',          category: 'Freios' },
  { label: 'Suspensão',       category: 'Suspensão' },
  { label: 'Diagnóstico',     category: 'Diagnóstico' },
  { label: 'Alinhamento e balanceamento', category: 'Alinhamento' },
  { label: 'Elétrica',        category: 'Elétrica' },
  { label: 'Ar-condicionado', category: 'Ar-condicionado' },
  { label: 'Embreagem',       category: 'Embreagem' },
  { label: 'Motor',           category: 'Motor' },
];

const plateNorm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const digits = (s: string) => s.replace(/\D/g, '');
/** Parece placa (antiga AAA1234 ou Mercosul AAA1A23), mesmo incompleta */
const looksLikePlate = (s: string) => /^[A-Z]{3}[0-9][A-Z0-9]?[0-9]{0,2}$/.test(plateNorm(s));

export interface NewOsPreset {
  title?: string;
  category?: string;
  free?: boolean;       // check-up gratuito
  schedule?: boolean;   // abrir já em "Agendar"
}

interface Props {
  workshopId: string;
  preset?: NewOsPreset;
  onClose: () => void;
  onCreated: (osId: string, number: number | null) => void;
}

/**
 * Abertura rápida de OS, do jeito do balcão: primeiro o carro (placa, nome ou telefone),
 * depois o que o cliente relatou. Peças e serviços são lançados na página da OS.
 */
export default function NewOsModal({ workshopId, preset, onClose, onCreated }: Props) {
  // 1. Carro / cliente
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState<Match[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked]     = useState<Match | null>(null);
  const [newCar, setNewCar]     = useState(false);   // cadastrar carro (e cliente, se não houver)
  const [car, setCar]           = useState({ plate: '', make: '', model: '', year: '' });
  const [person, setPerson]     = useState({ name: '', phone: '' });
  const [recs, setRecs]         = useState<ServiceRecommendation[]>([]);
  const [lastKm, setLastKm]     = useState<number | null>(null);

  // 2. Serviço
  const [title, setTitle]       = useState(preset?.title ?? '');
  const [category, setCategory] = useState(preset?.category ?? '');
  const [report, setReport]     = useState('');
  const [km, setKm]             = useState('');
  const [schedule, setSchedule] = useState(!!preset?.schedule);
  const [when, setWhen]         = useState('');
  const [mechId, setMechId]     = useState('');
  const [mechs, setMechs]       = useState<WorkshopMechanic[]>([]);
  const [saving, setSaving]     = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    supabase.from('workshop_mechanics').select('*').eq('workshop_id', workshopId).eq('active', true).order('name')
      .then(({ data }) => setMechs((data as WorkshopMechanic[]) ?? []));
  }, [workshopId]);

  // Busca por placa, nome ou telefone (com pequena espera enquanto digita)
  useEffect(() => {
    if (picked) return;
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
        : `full_name.ilike.%${q.replace(/[,()%]/g, " ").trim()}%`;
      const { data: cs } = await supabase.from('customers').select('*, vehicles(*)')
        .eq('workshop_id', workshopId).or(filter).limit(6);
      for (const c of (cs ?? []) as CustomerWithVehicles[]) {
        const { vehicles, ...customer } = c;
        if (!vehicles?.length) { found.push({ customer, vehicle: null }); continue; }
        for (const v of vehicles) if (!seen.has(v.id)) { found.push({ customer, vehicle: v }); seen.add(v.id); }
      }
      if (!alive) return;
      setResults(found.slice(0, 8));
      setSearching(false);
    }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [query, picked, workshopId]);

  // Ao escolher o carro: recomendações pendentes e último KM
  useEffect(() => {
    if (!picked) { setRecs([]); setLastKm(null); return; }
    supabase.from('service_recommendations').select('*')
      .eq('customer_id', picked.customer.id).eq('status', 'pending').order('recommended_at', { ascending: false })
      .then(({ data }) => setRecs((data as ServiceRecommendation[]) ?? []));
    if (picked.vehicle) {
      supabase.from('service_orders').select('km_reading').eq('vehicle_id', picked.vehicle.id)
        .not('km_reading', 'is', null).order('created_at', { ascending: false }).limit(1)
        .then(({ data }) => setLastKm((data?.[0] as { km_reading: number } | undefined)?.km_reading ?? null));
    }
  }, [picked]);

  function choose(p: Match) {
    setPicked(p);
    setNewCar(!p.vehicle); // cliente sem carro cadastrado → já abre o cadastro do carro
    setCar({ plate: '', make: '', model: '', year: '' });
  }

  function startNew() {
    const q = query.trim();
    setPicked(null);
    setNewCar(true);
    setCar({ plate: looksLikePlate(q) ? plateNorm(q) : '', make: '', model: '', year: '' });
    const onlyDigits = digits(q);
    setPerson({
      name:  !looksLikePlate(q) && onlyDigits.length < 4 ? q : '',
      phone: onlyDigits.length >= 8 && !looksLikePlate(q) ? q : '',
    });
  }

  function reset() {
    setPicked(null); setNewCar(false); setResults([]); setQuery('');
    setTimeout(() => searchRef.current?.focus(), 0);
  }

  const hasCustomer = !!picked || (newCar && person.name.trim().length > 0);
  const carOk = !newCar || (car.make.trim() && car.model.trim()) || !car.plate.trim();
  const canSave = hasCustomer && !!title.trim() && carOk && (!schedule || !!when);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!hasCustomer) { toast.error('Escolha ou cadastre o cliente'); return; }
    if (newCar && car.plate.trim() && !(car.make.trim() && car.model.trim())) { toast.error('Informe marca e modelo do carro'); return; }
    if (!title.trim()) { toast.error('Escolha ou digite o serviço'); return; }
    if (schedule && !when) { toast.error('Escolha a data do agendamento'); return; }

    setSaving(true);
    try {
      // Cliente
      let customerId = picked?.customer.id ?? null;
      if (!customerId) {
        const { data, error } = await supabase.from('customers').insert({
          workshop_id: workshopId, full_name: person.name.trim(), phone: person.phone.trim() || null,
        }).select('id').single();
        if (error) throw error;
        customerId = data.id;
      }

      // Veículo
      let vehicleId = picked?.vehicle?.id ?? null;
      if (newCar && (car.plate.trim() || car.make.trim())) {
        const { data, error } = await supabase.from('vehicles').insert({
          workshop_id: workshopId, customer_id: customerId,
          plate: plateNorm(car.plate) || 'S/P',
          make: car.make.trim() || 'Não informado',
          model: car.model.trim() || 'Não informado',
          year: car.year ? parseInt(car.year, 10) || null : null,
        }).select('id').single();
        if (error) throw error;
        vehicleId = data.id;
      }

      // OS
      const { data: os, error } = await supabase.from('service_orders').insert({
        workshop_id: workshopId,
        customer_id: customerId,
        vehicle_id: vehicleId,
        title: title.trim(),
        category: category || null,
        description: report.trim() || null,
        km_reading: km ? parseInt(digits(km), 10) || null : null,
        scheduled_at: schedule && when ? new Date(when).toISOString() : null,
        workshop_mechanic_id: mechId || null,
        status: 'open',
        price: 0,
      }).select('id, number').single();
      if (error) throw error;
      onCreated(os.id, os.number);
    } catch (err: any) {
      console.error('[NewOsModal] erro:', err);
      toast.error('Não foi possível abrir a OS: ' + (err?.message ?? 'erro'));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{preset?.free ? '🎁 Check-up gratuito' : 'Nova OS'}</h2>
            <p className="text-xs text-steel-500">Peças e serviços você lança em seguida, na página da OS.</p>
          </div>
          <button type="button" onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* ── 1. Carro ── */}
          <section>
            <div className="text-xs font-bold text-steel-700 mb-2">1. Qual é o carro?</div>

            {!picked && !newCar && (
              <>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel-400">🔎</span>
                  <input ref={searchRef} className="input !pl-10 text-base" value={query} onChange={e => setQuery(e.target.value)}
                    placeholder="Placa, nome ou telefone do cliente" autoComplete="off" />
                </div>
                {query.trim().length >= 2 && (
                  <div className="mt-2 border border-steel-200 rounded-xl overflow-hidden divide-y divide-steel-100">
                    {searching && results.length === 0 && <div className="px-4 py-3 text-sm text-steel-400">Buscando…</div>}
                    {results.map(r => (
                      <button type="button" key={`${r.customer.id}-${r.vehicle?.id ?? 'x'}`} onClick={() => choose(r)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-brand-50 transition">
                        {r.vehicle ? <LicensePlate plate={r.vehicle.plate} size="sm" /> : <span className="text-2xl">👤</span>}
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm text-steel-900 truncate">
                            {r.vehicle ? `${r.vehicle.make} ${r.vehicle.model}` : 'Sem carro cadastrado'}
                          </div>
                          <div className="text-xs text-steel-500 truncate">{r.customer.full_name}{r.customer.phone ? ` · ${fmtPhone(r.customer.phone)}` : ''}</div>
                        </div>
                      </button>
                    ))}
                    {!searching && (
                      <button type="button" onClick={startNew}
                        className="w-full px-4 py-3 text-left text-sm font-semibold text-brand-700 hover:bg-brand-50 transition">
                        ➕ {results.length ? 'Não é nenhum desses — cadastrar novo' : `Cliente novo — cadastrar${looksLikePlate(query) ? ` a placa ${plateNorm(query)}` : ''}`}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Selecionado */}
            {picked && (
              <div className="border-2 border-signal-500 bg-signal-50 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  {picked.vehicle && !newCar ? <LicensePlate plate={picked.vehicle.plate} size="sm" /> : <span className="text-2xl">👤</span>}
                  <div className="min-w-0 flex-1">
                    {picked.vehicle && !newCar && <div className="font-semibold text-sm">{picked.vehicle.make} {picked.vehicle.model}{picked.vehicle.year ? ` · ${picked.vehicle.year}` : ''}</div>}
                    <div className="text-xs text-steel-600">{picked.customer.full_name}{picked.customer.phone ? ` · ${fmtPhone(picked.customer.phone)}` : ''}</div>
                    {lastKm != null && !newCar && <div className="text-[11px] text-steel-500">Último KM registrado: {lastKm.toLocaleString('pt-BR')}</div>}
                  </div>
                  <button type="button" onClick={reset} className="text-xs text-steel-500 hover:text-steel-800 font-semibold">Trocar</button>
                </div>
                {!newCar && (
                  <button type="button" onClick={() => setNewCar(true)} className="mt-2 text-xs text-brand-700 font-semibold hover:underline">
                    + Outro carro deste cliente
                  </button>
                )}
                {recs.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-signal-200 text-xs text-pending-800">
                    🔧 <strong>Recomendado anteriormente:</strong> {recs.map(r => r.description).join(' · ')}
                  </div>
                )}
              </div>
            )}

            {/* Cadastro rápido: carro (e cliente, se novo) */}
            {newCar && (
              <div className="mt-3 bg-steel-50 rounded-xl p-4 space-y-3">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">🚗 Carro</div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input !py-2 uppercase font-mono" placeholder="Placa" value={car.plate}
                    onChange={e => setCar(c => ({ ...c, plate: e.target.value.toUpperCase() }))} />
                  <input className="input !py-2" placeholder="Ano" inputMode="numeric" value={car.year}
                    onChange={e => setCar(c => ({ ...c, year: e.target.value }))} />
                  <input className="input !py-2" placeholder="Marca (ex.: Chevrolet)" value={car.make}
                    onChange={e => setCar(c => ({ ...c, make: e.target.value }))} />
                  <input className="input !py-2" placeholder="Modelo (ex.: Onix)" value={car.model}
                    onChange={e => setCar(c => ({ ...c, model: e.target.value }))} />
                </div>
                {!picked && (
                  <>
                    <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest pt-1">👤 Cliente</div>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="input !py-2" placeholder="Nome *" value={person.name}
                        onChange={e => setPerson(p => ({ ...p, name: e.target.value }))} />
                      <input className="input !py-2" placeholder="Telefone / WhatsApp" inputMode="tel" value={person.phone}
                        onChange={e => setPerson(p => ({ ...p, phone: e.target.value }))} />
                    </div>
                    <button type="button" onClick={reset} className="text-xs text-steel-500 hover:underline">← Voltar para a busca</button>
                  </>
                )}
              </div>
            )}
          </section>

          {/* ── 2. Serviço ── */}
          <section>
            <div className="text-xs font-bold text-steel-700 mb-2">2. Qual o serviço?</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {QUICK_SERVICES.map(s => (
                <button type="button" key={s.label} onClick={() => { setTitle(s.label); setCategory(s.category); }}
                  className={`text-xs px-3 py-1.5 rounded-full border transition ${
                    title === s.label ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <input className="input" placeholder="Ou digite (ex.: Troca de correia dentada) *" value={title}
              onChange={e => { setTitle(e.target.value); setCategory(''); }} />
            <textarea className="input mt-2" rows={2} placeholder="O que o cliente relatou? (ex.: barulho na suspensão dianteira)"
              value={report} onChange={e => setReport(e.target.value)} />
          </section>

          {/* ── 3. Detalhes ── */}
          <section className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">KM hoje</label>
              <input className="input" inputMode="numeric" value={km} onChange={e => setKm(e.target.value)}
                placeholder={lastKm != null ? `último: ${lastKm.toLocaleString('pt-BR')}` : 'Ex.: 85000'} />
            </div>
            <div>
              <label className="label">Mecânico</label>
              <select className="input" value={mechId} onChange={e => setMechId(e.target.value)}>
                <option value="">— Definir depois —</option>
                {mechs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <div className="flex gap-2">
                <button type="button" onClick={() => setSchedule(false)}
                  className={`flex-1 text-sm font-semibold py-2 rounded-xl border-2 transition ${!schedule ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-600'}`}>
                  ⚡ Agora
                </button>
                <button type="button" onClick={() => setSchedule(true)}
                  className={`flex-1 text-sm font-semibold py-2 rounded-xl border-2 transition ${schedule ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-steel-200 text-steel-600'}`}>
                  📅 Agendar
                </button>
              </div>
              {schedule && <input className="input mt-2" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />}
            </div>
          </section>

          <p className="text-xs text-steel-500">
            Precisa de um mecânico de fora? <Link to="/oficina/dashboard?nova=1" className="text-brand-600 font-semibold hover:underline">Chamar mecânico da plataforma →</Link>
          </p>
        </div>

        <div className="px-6 py-4 border-t border-steel-100 flex gap-3">
          <button type="button" onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button className="btn-primary flex-[2]" disabled={saving || !canSave}>
            {saving ? 'Abrindo…' : schedule ? '📅 Agendar OS' : 'Abrir OS →'}
          </button>
        </div>
      </form>
    </div>
  );
}
