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
import CustomerCarPicker, { EMPTY_PICK, plateNorm, type Pick as CarPick } from '@/components/checkup/CustomerCarPicker';
import { findDuplicatesRemote } from '@/components/customers/CustomerForm';
import type { WorkshopMechanic } from '@/types/database';

/* Check-up — área própria do sistema.
   Gestor: Painel · Inspeções · Histórico (· Modelos, em breve).
   Mecânico (PIN): só a fila dele. */

const EMPTY = { workshop_mechanic_id: '', km: '' };

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
  const [mechs, setMechs]         = useState<Pick<WorkshopMechanic, 'id' | 'name'>[]>(demo ? DEMO_MECHANICS : []);
  const [showNew, setShowNew]     = useState(false);
  const [form, setForm]           = useState(EMPTY);
  // Cliente e carro: cadastrado (busca) ou novo (entra no cadastro ao criar)
  const [carPick, setCarPick]     = useState<CarPick>(EMPTY_PICK);
  const [dups, setDups]           = useState<{ id: string; full_name: string; reason: string }[]>([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid, access.isMechanic]);

  async function load() {
    const [c, m, s] = await Promise.all([
      fetchAll<PanelCheckup>((a, b) => supabase.from('vehicle_checkups')
        .select('*, mechanic:workshop_mechanics(name, phone), items:checkup_items(status, updated_at, system, quote_labor, quote_parts, customer_decision), sale_os:service_orders!vehicle_checkups_sale_os_id_fkey(number, status, workshop_mechanic_id, executor)')
        .eq('workshop_id', wid!).order('created_at', { ascending: false }).order('id').range(a, b) as unknown as PromiseLike<{ data: PanelCheckup[] | null; error: unknown }>),
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
    setMechs(m.data ?? []);
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

  /** Cliente e carro do check-up: usa o cadastro escolhido ou cria cliente/carro novos */
  async function resolveCustomer(force: boolean) {
    const pk = carPick;
    if (pk.mode === 'search') {
      if (!pk.match) return null;
      const { customer, vehicle } = pk.match;
      let v = vehicle;
      const car = pk.car;
      if (!v && car && (car.plate.trim() || car.make.trim())) {
        if (!force && car.plate.trim()) {
          const found = await findDuplicatesRemote(wid!, { plate: car.plate }, customer.id);
          if (found.length) { setDups(found); return 'dups' as const; }
        }
        const { data, error } = await supabase.from('vehicles').insert({
          workshop_id: wid!, customer_id: customer.id, plate: plateNorm(car.plate) || 'S/P',
          make: car.make.trim() || 'Não informado', model: car.model.trim() || 'Não informado',
          year: car.year ? parseInt(car.year, 10) || null : null,
        }).select('*').single();
        if (error) throw error;
        v = data;
      }
      return { customer_id: customer.id, vehicle_id: v?.id ?? null, customer_name: customer.full_name, customer_phone: customer.phone ?? null,
        plate: v?.plate ?? null, make: v?.make ?? null, model: v?.model ?? null, year: v?.year ?? null };
    }
    const d = pk.data;
    const base = { customer_name: d.name.trim() || null, customer_phone: d.phone.trim() || null,
      plate: plateNorm(d.plate) || null, make: d.make.trim() || null, model: d.model.trim() || null,
      year: d.year ? parseInt(d.year, 10) || null : null };
    // Sem nome: check-up avulso (sem cadastro)
    if (demo || !d.name.trim()) return { customer_id: null, vehicle_id: null, ...base };
    if (!force) {
      const found = await findDuplicatesRemote(wid!, { phone: d.phone, plate: d.plate });
      if (found.length) { setDups(found); return 'dups' as const; }
    }
    const { data: cu, error } = await supabase.from('customers').insert({
      workshop_id: wid!, full_name: d.name.trim(), phone: d.phone.trim() || null,
    }).select('id').single();
    if (error) throw error;
    let vehicleId: string | null = null;
    if (d.plate.trim() || d.make.trim()) {
      const { data: ve, error: vErr } = await supabase.from('vehicles').insert({
        workshop_id: wid!, customer_id: cu.id, plate: plateNorm(d.plate) || 'S/P',
        make: d.make.trim() || 'Não informado', model: d.model.trim() || 'Não informado', year: base.year,
      }).select('id').single();
      if (vErr) throw vErr;
      vehicleId = ve.id;
    }
    return { ...base, customer_id: cu.id, vehicle_id: vehicleId };
  }

  async function create(e: FormEvent, force = false) {
    e.preventDefault();
    const pk = carPick;
    const hasCar = pk.mode === 'search' ? !!pk.match : !!(pk.data.plate.trim() || pk.data.model.trim() || pk.data.name.trim());
    if (!hasCar) { toast.error('Escolha o cliente ou cadastre um novo'); return; }
    const itemKeys = modelItemKeys(modelKey, systems);
    if (!itemKeys.length) { toast.error('Escolha ao menos um sistema para verificar'); return; }
    setSaving(true);
    try {
      const who = await resolveCustomer(force);
      if (who === 'dups') return;
      if (!who) { toast.error('Escolha o cliente ou cadastre um novo'); return; }
      const payload = {
        ...who,
        template_key:         modelKey === 'completo' ? null : modelKey,
        workshop_mechanic_id: access.isMechanic ? access.mechanicId : form.workshop_mechanic_id || null,
        km_reading:           form.km ? parseInt(form.km.replace(/\D/g, '')) : null,
      };
      if (demo) {
        startDemo(payload);
        navigate('/demo/checkup/demo');
        return;
      }
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
  const closeNew = () => { setShowNew(false); setForm(EMPTY); setModelKey('completo'); setSystems([]); setCarPick(EMPTY_PICK); setDups([]); };

  const newForm = (
    <form onSubmit={create} className="space-y-4">
      <CustomerCarPicker workshopId={demo ? null : wid} value={carPick} onChange={p => { setCarPick(p); setDups([]); }} />

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
        <Field label="KM" value={form.km} onChange={set('km')} placeholder="85000" inputMode="numeric" />
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

      {dups.length > 0 && (
        <div className="rounded-xl bg-pending-50 border border-pending-200 px-3 py-2.5 text-sm space-y-1.5">
          <div className="font-semibold text-steel-800">Parece que esse cliente já tem cadastro:</div>
          {dups.map(d => <div key={d.id} className="text-xs text-steel-600">• {d.full_name} — {d.reason}</div>)}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => { setDups([]); setCarPick(EMPTY_PICK); }} className="btn-ghost text-xs !py-1.5 border border-steel-200 bg-white">Buscar o cadastro</button>
            <button type="button" onClick={e => create(e as unknown as FormEvent, true)} className="btn-primary text-xs !py-1.5">Criar mesmo assim</button>
          </div>
        </div>
      )}

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
