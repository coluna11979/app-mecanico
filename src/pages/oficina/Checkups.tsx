import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import LicensePlate from '@/components/os/LicensePlate';
import NewOsModal from '@/components/os/NewOsModal';
import { saleStage, scoreMeta, templateRows, type VehicleCheckup } from '@/lib/checkup';
import { DEMO_MECHANICS, startDemo } from '@/lib/checkupDemo';
import type { Customer, Vehicle, WorkshopMechanic } from '@/types/database';

type Row = VehicleCheckup & { mechanic: { name: string } | null };
type Filter = 'scheduled' | 'draft' | 'completed';
/** OS de check-up agendada que ainda não virou inspeção */
type Scheduled = {
  id: string; number: number | null; scheduled_at: string;
  customer: { full_name: string } | null;
  vehicle: { plate: string; make: string; model: string; year: number | null } | null;
  mechanic: { name: string } | null;
};

const FILTER_LABEL: Record<Filter, string> = { scheduled: '📅 Agendados', draft: 'Em andamento', completed: 'Finalizados' };

const EMPTY = {
  customer_id: '', vehicle_id: '', workshop_mechanic_id: '',
  plate: '', make: '', model: '', year: '', km: '', customer_name: '', customer_phone: '',
};

const SCORE_TEXT = { signal: 'text-signal-600', pending: 'text-pending-600', alert: 'text-alert-600' };

/** Etapa da venda no card (mesmo funil do Comercial) */
const STAGE_LABEL: Record<ReturnType<typeof saleStage>, JSX.Element | null> = {
  draft:    null,
  quote:    <span className="text-steel-400">💰 Falta enviar o orçamento</span>,
  sent:     <span className="text-steel-500">📤 Enviado ao cliente</span>,
  viewed:   <span className="text-pending-700">👀 Cliente viu — sem resposta</span>,
  answered: <span className="text-steel-500">❌ Não aprovou agora</span>,
  won:      <span className="text-signal-700">✅ Aprovado — virou OS</span>,
};

/** Cria o check-up + itens do checklist e devolve o id. */
async function createCheckup(payload: Partial<VehicleCheckup> & { workshop_id: string }) {
  const { data: c, error } = await supabase.from('vehicle_checkups').insert(payload).select('id').single();
  if (error || !c) throw error ?? new Error('insert');
  const { error: itemsErr } = await supabase.from('checkup_items').insert(templateRows(c.id));
  if (itemsErr) throw itemsErr;
  return c.id as string;
}

export default function WorkshopCheckups() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  // Pré-visualização sem banco — só em dev (/demo/checkup)
  const demo = import.meta.env.DEV && pathname.startsWith('/demo/');

  const [list, setList]           = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles]   = useState<Vehicle[]>([]);
  const [mechs, setMechs]         = useState<Pick<WorkshopMechanic, 'id' | 'name'>[]>(demo ? DEMO_MECHANICS : []);
  const [loading, setLoading]     = useState(!demo);
  const [showNew, setShowNew]     = useState(demo);
  const [form, setForm]           = useState(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [filter, setFilter]       = useState<Filter>('draft');
  const [search, setSearch]       = useState('');
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);
  const [scheduling, setScheduling] = useState(false);

  useEffect(() => {
    if (!wid || demo) return;
    const osId = params.get('os');
    if (osId) { startFromOs(osId); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid]);

  async function load() {
    setLoading(true);
    const [c, cu, m, s] = await Promise.all([
      supabase.from('vehicle_checkups').select('*, mechanic:workshop_mechanics(name)')
        .eq('workshop_id', wid!).order('created_at', { ascending: false }),
      supabase.from('customers').select('*').eq('workshop_id', wid!).order('full_name'),
      supabase.from('workshop_mechanics').select('id, name').eq('workshop_id', wid!).eq('active', true).order('name'),
      supabase.from('service_orders')
        .select('id, number, scheduled_at, customer:customers(full_name), vehicle:vehicles(plate, make, model, year), mechanic:workshop_mechanics!fk_so_workshop_mechanic(name)')
        .eq('workshop_id', wid!).not('scheduled_at', 'is', null)
        .not('status', 'in', '(completed,cancelled)')
        .or('category.eq.Check-up,title.ilike.*check*up*')
        .order('scheduled_at'),
    ]);
    const rows = (c.data as Row[]) ?? [];
    const withCheckup = new Set(rows.map(r => r.service_order_id).filter(Boolean));
    const sched = ((s.data as unknown as Scheduled[]) ?? []).filter(o => !withCheckup.has(o.id));
    setList(rows);
    setScheduled(sched);
    setCustomers((cu.data as Customer[]) ?? []);
    setMechs(m.data ?? []);
    if (!rows.some(r => r.status === 'draft')) {
      if (sched.length) setFilter('scheduled');
      else if (rows.length) setFilter('completed');
    }
    setLoading(false);
  }

  /** Veio de uma OS (?os=id): abre o check-up dela ou cria um já preenchido. */
  async function startFromOs(osId: string) {
    const { data: existing } = await supabase.from('vehicle_checkups').select('id')
      .eq('service_order_id', osId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (existing) { navigate(`/oficina/checkup/${existing.id}`, { replace: true }); return; }
    const { data: os } = await supabase.from('service_orders')
      .select('id, workshop_id, customer_id, vehicle_id, workshop_mechanic_id, km_reading, customer:customers(full_name, phone), vehicle:vehicles(plate, make, model, year)')
      .eq('id', osId).maybeSingle();
    if (!os) { toast.error('OS não encontrada'); load(); return; }
    const cu = os.customer as unknown as { full_name: string; phone: string | null } | null;
    const ve = os.vehicle as unknown as { plate: string; make: string; model: string; year: number | null } | null;
    try {
      const id = await createCheckup({
        workshop_id: os.workshop_id, service_order_id: os.id,
        customer_id: os.customer_id, vehicle_id: os.vehicle_id, workshop_mechanic_id: os.workshop_mechanic_id,
        km_reading: os.km_reading,
        customer_name: cu?.full_name ?? null, customer_phone: cu?.phone ?? null,
        plate: ve?.plate ?? null, make: ve?.make ?? null, model: ve?.model ?? null, year: ve?.year ?? null,
      });
      navigate(`/oficina/checkup/${id}`, { replace: true });
    } catch {
      toast.error('Erro ao criar o check-up');
      load();
    }
  }

  // Veículos do cliente escolhido
  useEffect(() => {
    if (demo || !form.customer_id) { setVehicles([]); return; }
    supabase.from('vehicles').select('*').eq('customer_id', form.customer_id)
      .then(({ data }) => setVehicles((data as Vehicle[]) ?? []));
  }, [form.customer_id, demo]);

  function pickCustomer(id: string) {
    const c = customers.find(x => x.id === id);
    setForm(f => ({ ...f, customer_id: id, vehicle_id: '',
      customer_name: c?.full_name ?? '', customer_phone: c?.phone ?? '' }));
  }
  function pickVehicle(id: string) {
    const v = vehicles.find(x => x.id === id);
    setForm(f => ({ ...f, vehicle_id: id,
      plate: v?.plate ?? '', make: v?.make ?? '', model: v?.model ?? '', year: v?.year ? String(v.year) : '' }));
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!form.plate.trim() && !form.model.trim()) { toast.error('Informe ao menos a placa ou o modelo'); return; }
    const payload = {
      customer_id:          form.customer_id || null,
      vehicle_id:           form.vehicle_id || null,
      workshop_mechanic_id: form.workshop_mechanic_id || null,
      plate:          form.plate.trim().toUpperCase() || null,
      make:           form.make.trim() || null,
      model:          form.model.trim() || null,
      year:           form.year ? parseInt(form.year) : null,
      km_reading:     form.km ? parseInt(form.km.replace(/\D/g, '')) : null,
      customer_name:  form.customer_name.trim() || null,
      customer_phone: form.customer_phone.trim() || null,
    };
    if (demo) {
      startDemo(payload);
      navigate('/demo/checkup/demo');
      return;
    }
    setSaving(true);
    try {
      const id = await createCheckup({ workshop_id: wid!, ...payload });
      navigate(`/oficina/checkup/${id}`);
    } catch {
      toast.error('Erro ao criar check-up');
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list
      .filter(c => c.status === filter)
      .filter(c => !q || [c.plate, c.make, c.model, c.customer_name].some(v => v?.toLowerCase().includes(q)));
  }, [list, filter, search]);
  const shownScheduled = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scheduled.filter(o => !q || [o.vehicle?.plate, o.vehicle?.make, o.vehicle?.model, o.customer?.full_name]
      .some(v => v?.toLowerCase().includes(q)));
  }, [scheduled, search]);
  const count = (f: Filter) => f === 'scheduled' ? scheduled.length : list.filter(c => c.status === f).length;

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">🔍 Check-up</h1>
            <p className="text-sm text-steel-500 mt-0.5">
              Inspeção guiada feita pela sua equipe — gera nota de saúde e relatório com fotos para o cliente.
            </p>
          </div>
          {!showNew && (
            <div className="flex gap-2 shrink-0">
              {!demo && (
                <button onClick={() => setScheduling(true)} className="btn-ghost text-sm !py-2.5 border border-steel-200 bg-white">📅 Agendar</button>
              )}
              <button onClick={() => setShowNew(true)} className="btn-primary text-sm !py-2.5">+ Novo check-up</button>
            </div>
          )}
        </div>

        {showNew && (
          <form onSubmit={create} className="card space-y-4">
            <div className="font-bold text-steel-800">Novo check-up</div>

            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block sm:col-span-1">
                <span className="label">Mecânico que vai inspecionar</span>
                <select className="input mt-1" value={form.workshop_mechanic_id}
                  onChange={e => setForm(f => ({ ...f, workshop_mechanic_id: e.target.value }))}>
                  <option value="">— Escolher —</option>
                  {mechs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </label>
              {!demo && customers.length > 0 && (
                <>
                  <label className="block">
                    <span className="label">Cliente cadastrado</span>
                    <select className="input mt-1" value={form.customer_id} onChange={e => pickCustomer(e.target.value)}>
                      <option value="">— Cliente novo / avulso —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Veículo</span>
                    <select className="input mt-1" value={form.vehicle_id} disabled={!form.customer_id}
                      onChange={e => pickVehicle(e.target.value)}>
                      <option value="">{form.customer_id ? (vehicles.length ? '— Escolher —' : 'Nenhum veículo cadastrado') : 'Escolha o cliente'}</option>
                      {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.make} {v.model}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Field label="Placa"  value={form.plate} onChange={set('plate')} placeholder="ABC1D23" upper />
              <Field label="Marca"  value={form.make}  onChange={set('make')}  placeholder="Fiat" />
              <Field label="Modelo" value={form.model} onChange={set('model')} placeholder="Argo" />
              <Field label="Ano"    value={form.year}  onChange={set('year')}  placeholder="2019" inputMode="numeric" />
              <Field label="KM"     value={form.km}    onChange={set('km')}    placeholder="85000" inputMode="numeric" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nome do cliente" value={form.customer_name}  onChange={set('customer_name')}  placeholder="João Silva" />
              <Field label="WhatsApp"        value={form.customer_phone} onChange={set('customer_phone')} placeholder="(11) 99999-9999" inputMode="tel" />
            </div>

            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowNew(false); setForm(EMPTY); }} className="btn-ghost text-sm border border-steel-200">Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Criando…' : 'Começar inspeção →'}</button>
            </div>
          </form>
        )}

        {!demo && (
          <>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
              <div className="flex gap-2 flex-wrap">
                {(['scheduled', 'draft', 'completed'] as Filter[]).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${filter === f ? 'bg-steel-900 text-white' : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
                    {FILTER_LABEL[f]} <span className="opacity-60">({count(f)})</span>
                  </button>
                ))}
              </div>
              <input className="input sm:max-w-xs" placeholder="Buscar placa, carro ou cliente…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {loading ? (
              <div className="card text-center text-steel-500 text-sm py-10">Carregando…</div>
            ) : filter === 'scheduled' ? (
              shownScheduled.length === 0 ? (
                <div className="card text-center py-10 space-y-3">
                  <div className="text-4xl">📅</div>
                  <div className="font-bold text-steel-800">Nenhum check-up agendado</div>
                  <p className="text-sm text-steel-500 max-w-md mx-auto">
                    Agende o check-up do cliente (ex.: oferta de avaliação gratuita). Ele aparece aqui e na agenda de OS;
                    quando o carro chegar, é só clicar em “Iniciar check-up”.
                  </p>
                  <button onClick={() => setScheduling(true)} className="btn-primary text-sm">📅 Agendar check-up</button>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {shownScheduled.map(o => <ScheduledCard key={o.id} o={o} onStart={() => startFromOs(o.id)} />)}
                </div>
              )
            ) : list.length === 0 ? (
              <div className="card text-center py-10 space-y-3">
                <div className="text-4xl">🔍</div>
                <div className="font-bold text-steel-800">Nenhum check-up ainda</div>
                <p className="text-sm text-steel-500 max-w-md mx-auto">
                  Faça a inspeção item por item, tire fotos e mande ao cliente um relatório com nota de saúde.
                  Também dá para abrir um check-up direto de uma OS.
                </p>
                {!showNew && <button onClick={() => setShowNew(true)} className="btn-primary text-sm">Fazer o primeiro</button>}
              </div>
            ) : shown.length === 0 ? (
              <div className="card text-center text-steel-500 text-sm py-8">Nada por aqui.</div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {shown.map(c => <CheckupCard key={c.id} c={c} />)}
              </div>
            )}
          </>
        )}
      </div>

      {scheduling && wid && (
        <NewOsModal workshopId={wid} preset={{ title: 'Check-up', category: 'Check-up', schedule: true }}
          onClose={() => setScheduling(false)}
          onCreated={(id, number, now) => {
            setScheduling(false);
            if (now) { startFromOs(id); return; }  // desmarcou o agendamento → inspeção já
            toast.success(`Check-up agendado ✓ (OS nº ${String(number ?? '').padStart(4, '0')})`);
            setFilter('scheduled');
            load();
          }} />
      )}
    </WorkshopLayout>
  );
}

function ScheduledCard({ o, onStart }: { o: Scheduled; onStart: () => void }) {
  const [starting, setStarting] = useState(false);
  const car  = o.vehicle ? [o.vehicle.make, o.vehicle.model, o.vehicle.year].filter(Boolean).join(' ') : 'Veículo';
  const when = new Date(o.scheduled_at);
  const today = new Date().toDateString() === when.toDateString();
  const late  = !today && when.getTime() < Date.now();
  return (
    <div className="card flex items-center gap-4">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          {o.vehicle?.plate && <LicensePlate plate={o.vehicle.plate} />}
          <span className="font-semibold text-steel-800 truncate">{car}</span>
        </div>
        <div className={`text-xs font-semibold ${late ? 'text-alert-600' : today ? 'text-brand-600' : 'text-steel-600'}`}>
          📅 {today ? 'Hoje' : when.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
          {' às '}{when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{late && ' · atrasado'}
        </div>
        <div className="text-xs text-steel-500 truncate">
          {[o.customer?.full_name, o.mechanic?.name && `🔧 ${o.mechanic.name}`].filter(Boolean).join(' · ')}
          {' · '}<Link to={`/oficina/os/${o.id}`} className="hover:underline">OS nº {String(o.number ?? '').padStart(4, '0')}</Link>
        </div>
      </div>
      <button onClick={() => { setStarting(true); onStart(); }} disabled={starting} className="btn-primary text-xs !py-2 !px-3 shrink-0">
        {starting ? 'Abrindo…' : 'Iniciar check-up →'}
      </button>
    </div>
  );
}

function CheckupCard({ c }: { c: Row }) {
  const car  = [c.make, c.model, c.year].filter(Boolean).join(' ') || 'Veículo';
  const meta = c.score != null ? scoreMeta(c.score) : null;
  return (
    <Link to={`/oficina/checkup/${c.id}`} className="card flex items-center gap-4 hover:shadow-md transition">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          {c.plate && <LicensePlate plate={c.plate} />}
          <span className="font-semibold text-steel-800 truncate">{car}</span>
        </div>
        <div className="text-xs text-steel-500 truncate">
          {[c.customer_name, c.mechanic?.name && `🔧 ${c.mechanic.name}`,
            new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })].filter(Boolean).join(' · ')}
        </div>
        {c.status === 'completed' && <div className="text-[11px] font-semibold">{STAGE_LABEL[saleStage(c)]}</div>}
      </div>
      {c.status === 'completed' && meta ? (
        <div className="text-right shrink-0">
          <div className={`text-3xl font-bold font-display ${SCORE_TEXT[meta.color]}`}>{c.score}</div>
          <div className="text-[10px] text-steel-400">{meta.label}</div>
        </div>
      ) : (
        <span className="badge bg-pending-500/15 text-pending-600 shrink-0">Continuar →</span>
      )}
    </Link>
  );
}

function Field({ label, upper, ...props }: { label: string; upper?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input {...props} className={`input mt-1 ${upper ? 'uppercase' : ''}`} />
    </label>
  );
}
