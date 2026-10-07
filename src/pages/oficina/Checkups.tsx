import { FormEvent, useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import NewOsModal from '@/components/os/NewOsModal';
import { CHECKUP_MODELS, CHECKUP_TEMPLATE, checkupForOs, createCheckup, modelItemKeys, type CheckupModelKey } from '@/lib/checkup';
import { DEMO_MECHANICS, demoPanel, startDemo } from '@/lib/checkupDemo';
import { useCheckupAccess } from '@/lib/checkupAccess';
import { fetchAll } from '@/lib/fetchAll';
import type { PanelCheckup, ScheduledOs } from '@/lib/checkupPanel';
import MechanicQueue from '@/components/checkup/MechanicQueue';
import ManagerPanel, { type Tab } from '@/components/checkup/ManagerPanel';
import type { Customer, Vehicle, WorkshopMechanic } from '@/types/database';

/* Check-up — área própria do sistema.
   Gestor: Painel · Inspeções · Histórico (· Modelos, em breve).
   Mecânico (PIN): só a fila dele. */

const EMPTY = {
  customer_id: '', vehicle_id: '', workshop_mechanic_id: '',
  plate: '', make: '', model: '', year: '', km: '', customer_name: '', customer_phone: '',
};

const TABS: Tab[] = ['painel', 'inspecoes', 'historico', 'modelos'];

export default function WorkshopCheckups() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  // Pré-visualização sem banco — só em dev (/demo/checkup)
  const demo = import.meta.env.DEV && pathname.startsWith('/demo/');

  const [list, setList]           = useState<PanelCheckup[] | null>(() => demo ? demoPanel().list as PanelCheckup[] : null);
  const [scheduled, setScheduled] = useState<ScheduledOs[]>(() => demo ? demoPanel().scheduled : []);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles]   = useState<Vehicle[]>([]);
  const [mechs, setMechs]         = useState<Pick<WorkshopMechanic, 'id' | 'name'>[]>(demo ? DEMO_MECHANICS : []);
  const [showNew, setShowNew]     = useState(false);
  const [form, setForm]           = useState(EMPTY);
  // Tipo do check-up: completo, revisão, troca de óleo… ou montado na hora (sistemas escolhidos)
  const [modelKey, setModelKey]   = useState<CheckupModelKey>('completo');
  const [systems, setSystems]     = useState<string[]>([]);
  const [saving, setSaving]       = useState(false);
  const [scheduling, setScheduling] = useState(false);

  // Mecânico (PIN): vê a fila dele, não o painel da oficina
  const access = useCheckupAccess();
  // Caixa/atendente/vendedor no modo balcão: cria e manda para o mecânico (não faz a inspeção)
  const dispatchOnly = !demo && !access.canInspect;

  // Cada tela do módulo tem endereço próprio (/oficina/checkup/inspecoes…); ?aba= antigo ainda funciona
  const fromPath = pathname.replace(/\/$/, '').split('/').pop() as Tab;
  const tabParam = (TABS.includes(fromPath) ? fromPath : params.get('aba')) as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'painel';
  // Demonstração (dev) não tem as sub-rotas: usa ?aba=
  const setTab = (t: Tab) => demo
    ? setParams(t === 'painel' ? {} : { aba: t }, { replace: true })
    : navigate(t === 'painel' ? '/oficina/checkup' : `/oficina/checkup/${t}`);

  useEffect(() => {
    if (!wid || demo) return;
    const osId = params.get('os');
    if (osId) { startFromOs(osId); return; }
    if (!access.isMechanic) load();
    else loadCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid, access.isMechanic]);

  async function load() {
    const [c, cu, m, s] = await Promise.all([
      fetchAll<PanelCheckup>((a, b) => supabase.from('vehicle_checkups')
        .select('*, mechanic:workshop_mechanics(name, phone), items:checkup_items(status, updated_at, system, quote_labor, quote_parts, customer_decision), sale_os:service_orders!vehicle_checkups_sale_os_id_fkey(number, status, workshop_mechanic_id, executor)')
        .eq('workshop_id', wid!).order('created_at', { ascending: false }).order('id').range(a, b) as unknown as PromiseLike<{ data: PanelCheckup[] | null; error: unknown }>),
      supabase.from('customers').select('*').eq('workshop_id', wid!).order('full_name'),
      supabase.from('workshop_mechanics').select('id, name').eq('workshop_id', wid!).eq('active', true).order('name'),
      supabase.from('service_orders')
        .select('id, number, scheduled_at, workshop_mechanic_id, customer:customers(full_name), vehicle:vehicles(plate, make, model, year), mechanic:workshop_mechanics!fk_so_workshop_mechanic(name)')
        .eq('workshop_id', wid!).not('scheduled_at', 'is', null)
        .not('status', 'in', '(completed,cancelled)')
        .or('category.eq.Check-up,title.ilike.*check*up*')
        .order('scheduled_at'),
    ]);
    if (c.error) toast.error('Não foi possível carregar os check-ups');
    const rows = c.data;
    const withCheckup = new Set(rows.map(r => r.service_order_id).filter(Boolean));
    setList(rows);
    setScheduled(((s.data as unknown as ScheduledOs[]) ?? []).filter(o => !withCheckup.has(o.id)));
    setCustomers((cu.data as Customer[]) ?? []);
    setMechs(m.data ?? []);
  }

  /** Mecânico: só os clientes, para o formulário de novo check-up */
  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('*').eq('workshop_id', wid!).order('full_name');
    setCustomers((data as Customer[]) ?? []);
  }

  /** Veio de uma OS (?os=id) ou "Iniciar" de um agendado: abre o check-up dela ou cria um já preenchido. */
  async function startFromOs(osId: string) {
    try {
      const id = await checkupForOs(osId);
      if (!id) { toast.error('OS não encontrada'); load(); return; }
      navigate(`/oficina/checkup/${id}`, { replace: !!params.get('os') });
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
    const itemKeys = modelItemKeys(modelKey, systems);
    if (!itemKeys.length) { toast.error('Escolha ao menos um sistema para verificar'); return; }
    const payload = {
      template_key:   modelKey === 'completo' ? null : modelKey,
      customer_id:          form.customer_id || null,
      vehicle_id:           form.vehicle_id || null,
      workshop_mechanic_id: access.isMechanic ? access.mechanicId : form.workshop_mechanic_id || null,
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
      const id = await createCheckup({ workshop_id: wid!, ...payload }, itemKeys);
      navigate(`/oficina/checkup/${id}`);
    } catch {
      toast.error('Erro ao criar check-up');
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const closeNew = () => { setShowNew(false); setForm(EMPTY); setModelKey('completo'); setSystems([]); };

  const newForm = (
    <form onSubmit={create} className="space-y-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block sm:col-span-1">
          <span className="label">Mecânico que vai inspecionar</span>
          {access.isMechanic && !demo ? (
            <div className="input mt-1 bg-steel-50 text-steel-700">{access.mechanicName ?? 'Você'}</div>
          ) : (
            <select className="input mt-1" value={form.workshop_mechanic_id}
              onChange={e => setForm(f => ({ ...f, workshop_mechanic_id: e.target.value }))}>
              <option value="">— Sem responsável —</option>
              {mechs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
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

      {/* Tipo do check-up */}
      <div>
        <span className="label">O que vamos verificar?</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1">
          {CHECKUP_MODELS.map(m => {
            const n = m.key === 'custom' ? null : modelItemKeys(m.key).length;
            const on = modelKey === m.key;
            return (
              <button key={m.key} type="button" onClick={() => setModelKey(m.key)}
                className={`text-left rounded-xl border px-3 py-2 transition ${on ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-steel-200 bg-white hover:bg-steel-50'}`}>
                <div className="text-sm font-semibold text-steel-800">{m.icon} {m.label}</div>
                <div className="text-[11px] text-steel-500 leading-tight mt-0.5">{n != null ? `${n} itens · ` : ''}{m.desc}</div>
              </button>
            );
          })}
        </div>
        {modelKey === 'custom' && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {CHECKUP_TEMPLATE.map(s => {
              const on = systems.includes(s.system);
              return (
                <button key={s.system} type="button"
                  onClick={() => setSystems(v => on ? v.filter(x => x !== s.system) : [...v, s.system])}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${on ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                  {s.icon} {s.system} <span className="opacity-60">({s.items.length})</span>
                </button>
              );
            })}
          </div>
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
        <button type="button" onClick={closeNew} className="btn-ghost text-sm border border-steel-200">Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary text-sm">{saving ? 'Criando…' : dispatchOnly ? 'Criar e enviar ao mecânico →' : access.isMechanic ? 'Começar →' : 'Criar check-up →'}</button>
      </div>
    </form>
  );

  const newModal = showNew && (
    <div className="fixed inset-0 z-50 bg-steel-900/60 flex items-end sm:items-center justify-center sm:p-4" onClick={closeNew}>
      <div className="bg-white w-full sm:max-w-3xl rounded-t-3xl sm:rounded-2xl max-h-[94vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">Novo check-up</h2>
          <button onClick={closeNew} className="h-8 w-8 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100" aria-label="Fechar">✕</button>
        </div>
        <div className="px-6 py-5">{newForm}</div>
      </div>
    </div>
  );

  if (access.isMechanic && !demo) {
    return (
      <WorkshopLayout>
        {wid && access.ready
          ? <MechanicQueue workshopId={wid} mechanicId={access.mechanicId} mechanicName={access.mechanicName}
              onNew={access.mechanicId ? () => setShowNew(true) : undefined} />
          : <div className="card max-w-md mx-auto text-center text-steel-500 text-sm py-10">Carregando…</div>}
        {newModal}
      </WorkshopLayout>
    );
  }

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">🩺 Check-up</h1>
            <p className="text-sm text-steel-500 mt-0.5">Inspeções da oficina: do carro na rampa à aprovação do cliente.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            {!demo && (
              <button onClick={() => setScheduling(true)} className="btn-ghost text-sm !py-2.5 border border-steel-200 bg-white">📅 Agendar</button>
            )}
            <button onClick={() => setShowNew(true)} className="btn-primary text-sm !py-2.5">+ Novo check-up</button>
          </div>
        </div>

        <ManagerPanel tab={tab} onTab={setTab} list={list} scheduled={scheduled} mechanics={mechs}
          workshopName={currentWorkshop?.business_name}
          onStartOs={startFromOs} onSchedule={() => setScheduling(true)} onNew={() => setShowNew(true)} />
      </div>

      {newModal}

      {scheduling && wid && (
        <NewOsModal workshopId={wid} preset={{ title: 'Check-up', category: 'Check-up', schedule: true }}
          onClose={() => setScheduling(false)}
          onCreated={(id, number, now) => {
            setScheduling(false);
            if (now) { startFromOs(id); return; }  // desmarcou o agendamento → inspeção já
            toast.success(`Check-up agendado ✓ (OS nº ${String(number ?? '').padStart(4, '0')})`);
            load();
          }} />
      )}
    </WorkshopLayout>
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
