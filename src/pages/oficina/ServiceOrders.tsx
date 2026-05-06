import { FormEvent, useEffect, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type {
  ServiceOrder, Customer, Vehicle,
  OsStatus, WorkshopMechanic,
} from '@/types/database';

/* ─── tipos locais ──────────────────────────────────────────── */
type OsRow = ServiceOrder & {
  customer: Customer | null;
  vehicle:  Vehicle  | null;
  mechanic: WorkshopMechanic | null;
};

type MainTab   = 'os' | 'agendados' | 'mecanicos';
type MechType  = 'internal' | 'marketplace';

/* ─── constantes ────────────────────────────────────────────── */
const STATUSES: OsStatus[] = ['open', 'in_progress', 'completed', 'cancelled'];

const OS_CATEGORIES = [
  // Captação / gratuitos
  'Avaliação','Check-up',
  // Mais comuns
  'Troca de óleo','Revisão geral','Freios','Pneus','Alinhamento','Balanceamento',
  // Mecânica
  'Motor','Câmbio','Suspensão','Transmissão','Embreagem','Injeção eletrônica',
  // Elétrica / outros
  'Elétrica','Ar-condicionado','Diagnóstico','Funilaria','Outro',
];

const SKILL_OPTIONS = [
  'Motor','Freios','Suspensão','Elétrica','Câmbio',
  'Ar-condicionado','Injeção eletrônica','Diagnóstico','Transmissão',
  'Embreagem','Funilaria','Alinhamento','Balanceamento','Diesel','Geral',
];

const SPECIALTIES = [
  'Motor','Elétrica','Freios','Suspensão','Câmbio',
  'Funilaria','Ar-condicionado','Geral',
];

const EMPTY_OS = {
  title: '', description: '', category: '',
  customer_id: '', vehicle_id: '', workshop_mechanic_id: '',
  notes: '', estimated_hours: '', km_reading: '',
  parts_cost: '', labor_cost: '',
};
const EMPTY_MECH        = { name: '', specialty: '', skills: [] as string[] };
const EMPTY_INLINE_CUST = { full_name: '', phone: '', cpf: '', email: '', veh_make: '', veh_model: '', veh_plate: '' };
const EMPTY_INLINE_VEH  = { plate: '', make: '', model: '', year: '', color: '' };

/* ─── helpers ───────────────────────────────────────────────── */
function toBRL(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseCents(v: string) { return parseInt(v.replace(/\D/g, '') || '0', 10); }

function osLabel(s: string) {
  return ({ open:'Aberta', in_progress:'Em andamento', completed:'Concluída', cancelled:'Cancelada' } as Record<string,string>)[s] ?? s;
}
function osColor(s: string) {
  return ({
    open:        'bg-pending-100 text-pending-700',
    in_progress: 'bg-brand-100 text-brand-700',
    completed:   'bg-signal-100 text-signal-700',
    cancelled:   'bg-steel-100 text-steel-500',
  } as Record<string,string>)[s] ?? '';
}
function durationMin(os: OsRow): number | null {
  if (!os.started_at || !os.completed_at) return null;
  return Math.round((new Date(os.completed_at).getTime() - new Date(os.started_at).getTime()) / 60000);
}
function fmtDur(min: number) {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}
function toDatetimeLocal(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ══════════════════════════════════════════════════════════════
   Componente principal
══════════════════════════════════════════════════════════════ */
export default function ServiceOrders() {
  const { user, currentWorkshop } = useAuth();

  const shop = currentWorkshop;
  const [list, setList]                   = useState<OsRow[]>([]);
  const [customers, setCustomers]         = useState<Customer[]>([]);
  const [vehicles, setVehicles]           = useState<Vehicle[]>([]);
  const [internalMechs, setInternalMechs] = useState<WorkshopMechanic[]>([]);

  const [tab, setTab]                     = useState<MainTab>('os');
  const [filterStatus, setFilterStatus]   = useState<OsStatus|'all'>('all');
  const [filterMech, setFilterMech]       = useState('all');
  const [search, setSearch]               = useState('');
  const [detail, setDetail]               = useState<OsRow | null>(null);
  const [modalOS, setModalOS]             = useState(false);
  const [modalMech, setModalMech]         = useState(false);
  const [editMech, setEditMech]           = useState<WorkshopMechanic | null>(null);

  /* ── form OS ── */
  const [formOS, setFormOS]             = useState(EMPTY_OS);
  const [priceCents, setPriceCents]     = useState(0);
  const [scheduleMode, setScheduleMode] = useState<'now'|'later'>('now');
  const [scheduledAt, setScheduledAt]   = useState('');
  const [mechType, setMechType]         = useState<MechType>('internal');

  /* Marketplace fields */
  const [mktPricePerHour, setMktPricePerHour] = useState(0);   // cents
  const [mktMaxHours, setMktMaxHours]         = useState('');
  const [mktSkills, setMktSkills]             = useState<string[]>([]);

  /* Check-up */
  const [isCheckup, setIsCheckup]           = useState(false);

  /* Inline – novo cliente */
  const [showNewCust, setShowNewCust]       = useState(false);
  const [inlineCust, setInlineCust]         = useState(EMPTY_INLINE_CUST);
  const [savingCust, setSavingCust]         = useState(false);

  /* Inline – novo veículo */
  const [showNewVeh, setShowNewVeh]         = useState(false);
  const [inlineVeh, setInlineVeh]           = useState(EMPTY_INLINE_VEH);
  const [savingVeh, setSavingVeh]           = useState(false);

  /* Mechanic modal */
  const [formMech, setFormMech]   = useState(EMPTY_MECH);
  const [newSkill, setNewSkill]   = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!user || !currentWorkshop) return;
    Promise.all([
      fetchOS(currentWorkshop.id),
      fetchCustomers(currentWorkshop.id),
      fetchMechs(currentWorkshop.id),
    ]);
  }, [user, currentWorkshop?.id]);

  async function fetchOS(wid: string) {
    const { data } = await supabase
      .from('service_orders')
      .select('*, customer:customers(*), vehicle:vehicles(*), mechanic:workshop_mechanics(*)')
      .eq('workshop_id', wid)
      .order('created_at', { ascending: false });
    setList((data as OsRow[]) ?? []);
  }
  async function fetchCustomers(wid: string) {
    const { data } = await supabase.from('customers').select('*').eq('workshop_id', wid).order('full_name');
    setCustomers((data as Customer[]) ?? []);
  }
  async function fetchMechs(wid: string) {
    const { data } = await supabase
      .from('workshop_mechanics').select('*').eq('workshop_id', wid).eq('active', true).order('name');
    setInternalMechs((data as WorkshopMechanic[]) ?? []);
  }
  async function loadVehicles(cid: string) {
    if (!shop) return;
    const { data } = await supabase.from('vehicles').select('*').eq('customer_id', cid).eq('workshop_id', shop.id);
    setVehicles((data as Vehicle[]) ?? []);
  }

  /* ── inline: criar cliente (+ veículo opcional) ── */
  async function createCustomerInline() {
    if (!shop || !inlineCust.full_name.trim()) return;
    setSavingCust(true);
    const { data } = await supabase.from('customers').insert({
      workshop_id: shop.id,
      full_name:   inlineCust.full_name.trim(),
      phone:       inlineCust.phone.trim()  || null,
      cpf:         inlineCust.cpf.trim()    || null,
      email:       inlineCust.email.trim()  || null,
    }).select('*').single();
    if (data) {
      const c = data as Customer;
      setCustomers(prev => [...prev, c].sort((a,b) => a.full_name.localeCompare(b.full_name)));
      setFormOS(f => ({ ...f, customer_id: c.id, vehicle_id: '' }));

      // Se preencheu veículo, já cria e seleciona
      if (inlineCust.veh_make.trim() && inlineCust.veh_model.trim()) {
        const { data: vData } = await supabase.from('vehicles').insert({
          customer_id: c.id,
          workshop_id: shop.id,
          plate: inlineCust.veh_plate.toUpperCase().trim() || 'S/P',
          make:  inlineCust.veh_make.trim(),
          model: inlineCust.veh_model.trim(),
        }).select('*').single();
        if (vData) {
          const v = vData as Vehicle;
          setVehicles([v]);
          setFormOS(f => ({ ...f, customer_id: c.id, vehicle_id: v.id }));
        }
      } else {
        setVehicles([]);
      }
    }
    setShowNewCust(false);
    setInlineCust(EMPTY_INLINE_CUST);
    setSavingCust(false);
  }

  /* ── inline: criar veículo ── */
  async function createVehicleInline() {
    if (!shop || !formOS.customer_id || !inlineVeh.plate.trim() || !inlineVeh.make.trim() || !inlineVeh.model.trim()) return;
    setSavingVeh(true);
    const { data } = await supabase.from('vehicles').insert({
      customer_id: formOS.customer_id,
      workshop_id: shop.id,
      plate:  inlineVeh.plate.toUpperCase().trim(),
      make:   inlineVeh.make.trim(),
      model:  inlineVeh.model.trim(),
      year:   inlineVeh.year ? parseInt(inlineVeh.year) : null,
      color:  inlineVeh.color.trim() || null,
    }).select('*').single();
    if (data) {
      const v = data as Vehicle;
      setVehicles(prev => [...prev, v]);
      setFormOS(f => ({ ...f, vehicle_id: v.id }));
    }
    setShowNewVeh(false);
    setInlineVeh(EMPTY_INLINE_VEH);
    setSavingVeh(false);
  }

  /* ── mecânico interno ── */
  function openNewMech() { setEditMech(null); setFormMech(EMPTY_MECH); setNewSkill(''); setModalMech(true); }
  function openEditMech(m: WorkshopMechanic) {
    setEditMech(m); setFormMech({ name: m.name, specialty: m.specialty ?? '', skills: [...m.skills] });
    setNewSkill(''); setModalMech(true);
  }
  function addSkill(s: string) {
    const t = s.trim();
    if (t && !formMech.skills.includes(t)) setFormMech(f => ({ ...f, skills: [...f.skills, t] }));
    setNewSkill('');
  }
  function removeSkill(s: string) { setFormMech(f => ({ ...f, skills: f.skills.filter(x => x !== s) })); }
  function toggleMktSkill(s: string) {
    setMktSkills(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  async function saveMech(e: FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    const payload = { workshop_id: shop.id, name: formMech.name.trim(), specialty: formMech.specialty || null, skills: formMech.skills };
    if (editMech) await supabase.from('workshop_mechanics').update(payload).eq('id', editMech.id);
    else          await supabase.from('workshop_mechanics').insert(payload);
    await fetchMechs(shop.id); setModalMech(false); setSaving(false);
  }
  async function deactivateMech(id: string) {
    if (!confirm('Remover mecânico da lista?')) return;
    await supabase.from('workshop_mechanics').update({ active: false }).eq('id', id);
    setInternalMechs(prev => prev.filter(m => m.id !== id));
  }

  /* ── abrir modal OS ── */
  function openModalOS(opts?: { checkup?: boolean; schedMode?: 'now' | 'later' }) {
    const checkup = opts?.checkup ?? false;
    setIsCheckup(checkup);
    setFormOS({
      ...EMPTY_OS,
      title:    checkup ? 'Check-up Gratuito' : '',
      category: checkup ? 'Avaliação' : '',
    });
    setPriceCents(0);
    setScheduleMode(opts?.schedMode ?? 'now');
    setScheduledAt('');
    setMechType('internal');
    setMktPricePerHour(0); setMktMaxHours(''); setMktSkills([]);
    setVehicles([]);
    setShowNewCust(false); setInlineCust(EMPTY_INLINE_CUST);
    setShowNewVeh(false);  setInlineVeh(EMPTY_INLINE_VEH);
    setModalOS(true);
  }

  /* ── salvar OS ── */
  async function saveOS(e: FormEvent) {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);

    const schedIso = scheduleMode === 'later' && scheduledAt
      ? new Date(scheduledAt).toISOString() : null;

    if (mechType === 'marketplace') {
      /* publica como job no marketplace */
      await supabase.from('jobs').insert({
        workshop_id:    shop.id,
        title:          formOS.title.trim(),
        description:    formOS.description.trim() || null,
        price:          priceCents / 100,
        price_per_hour: mktPricePerHour / 100,
        max_hours:      mktMaxHours ? parseFloat(mktMaxHours) : 0,
        status:         'open',
        scheduled_at:   schedIso,
      });
    } else {
      /* OS interna */
      const partsVal  = formOS.parts_cost ? parseFloat(formOS.parts_cost) : null;
      const laborVal  = formOS.labor_cost ? parseFloat(formOS.labor_cost) : null;
      const computed  = (partsVal ?? 0) + (laborVal ?? 0);
      const finalPrice = isCheckup ? 0 : (computed > 0 ? computed : priceCents / 100);

      await supabase.from('service_orders').insert({
        workshop_id:          shop.id,
        title:                formOS.title.trim(),
        description:          formOS.description.trim() || null,
        category:             formOS.category || null,
        price:                finalPrice,
        customer_id:          formOS.customer_id || null,
        vehicle_id:           formOS.vehicle_id  || null,
        workshop_mechanic_id: formOS.workshop_mechanic_id || null,
        status:               'open',
        scheduled_at:         schedIso,
        estimated_hours:      formOS.estimated_hours ? parseFloat(formOS.estimated_hours) : null,
        notes:                formOS.notes.trim() || null,
        km_reading:           formOS.km_reading ? parseInt(formOS.km_reading) : null,
        parts_cost:           partsVal,
        labor_cost:           laborVal,
      });
      await fetchOS(shop.id);
    }

    setModalOS(false); setSaving(false);
  }

  /* ── status ── */
  async function updateStatus(os: OsRow, status: OsStatus) {
    const extra: Record<string, unknown> = {};
    if (status === 'in_progress' && !os.started_at)  extra.started_at  = new Date().toISOString();
    if (status === 'completed')                        extra.completed_at = new Date().toISOString();
    await supabase.from('service_orders').update({ status, ...extra }).eq('id', os.id);
    const updated = { ...os, status, ...extra } as OsRow;
    setList(prev => prev.map(o => o.id === os.id ? updated : o));
    if (detail?.id === os.id) setDetail(updated);
  }

  /* ─── analytics ──────────────────────────────────────────── */
  const now          = new Date();
  const completed    = list.filter(o => o.status === 'completed');
  const revenue      = completed.reduce((a, o) => a + o.price, 0);
  const thisMonth    = completed.filter(o =>
    new Date(o.completed_at!).getMonth() === now.getMonth() &&
    new Date(o.completed_at!).getFullYear() === now.getFullYear()
  );
  const revenueMonth = thisMonth.reduce((a, o) => a + o.price, 0);

  const catMap: Record<string, { count: number; revenue: number; durations: number[] }> = {};
  list.forEach(o => {
    const cat = o.category || 'Sem categoria';
    if (!catMap[cat]) catMap[cat] = { count: 0, revenue: 0, durations: [] };
    catMap[cat].count++;
    if (o.status === 'completed') catMap[cat].revenue += o.price;
    const d = durationMin(o); if (d !== null) catMap[cat].durations.push(d);
  });
  const topCats  = Object.entries(catMap).sort((a, b) => b[1].count - a[1].count).slice(0, 6);
  const maxCount = topCats[0]?.[1].count ?? 1;

  const mechMap: Record<string, { name: string; count: number; revenue: number; durations: number[] }> = {};
  list.forEach(o => {
    if (!o.mechanic) return;
    const id = o.mechanic.id;
    if (!mechMap[id]) mechMap[id] = { name: o.mechanic.name, count: 0, revenue: 0, durations: [] };
    mechMap[id].count++;
    if (o.status === 'completed') mechMap[id].revenue += o.price;
    const d = durationMin(o); if (d !== null) mechMap[id].durations.push(d);
  });
  const topMechs = Object.values(mechMap).sort((a, b) => b.count - a.count);

  const allDurs = completed.map(durationMin).filter((d): d is number => d !== null);
  const avgDur  = allDurs.length ? Math.round(allDurs.reduce((a,b) => a+b,0) / allDurs.length) : null;

  /* ─── listas filtradas ───────────────────────────────────── */
  const filtered = list.filter(o => {
    if (filterStatus !== 'all' && o.status !== filterStatus) return false;
    if (filterMech !== 'all' && (o.workshop_mechanic_id ?? 'none') !== filterMech) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.title.toLowerCase().includes(q) ||
        (o.customer?.full_name ?? '').toLowerCase().includes(q) ||
        (o.vehicle?.plate ?? '').toLowerCase().includes(q) ||
        (o.mechanic?.name ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const agendados = list
    .filter(o => o.scheduled_at && o.status === 'open')
    .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());

  const counts  = STATUSES.reduce((acc, s) => ({ ...acc, [s]: list.filter(o => o.status === s).length }), {} as Record<string, number>);
  const osCount = list.filter(o => !o.scheduled_at || o.status !== 'open').length;

  /* ══════════════════════════════════════════════ RENDER ══ */
  return (
    <WorkshopLayout>

      {/* Cabeçalho */}
      <div className="flex flex-wrap justify-between items-start gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Ordens de Serviço</h1>
          <p className="text-sm text-steel-500 mt-1">{list.length} OS cadastradas</p>
        </div>
        <button onClick={() => tab === 'mecanicos' ? openNewMech() : openModalOS()} className="btn-primary">
          {tab === 'mecanicos' ? '+ Mecânico' : '+ Nova OS'}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KPI label="Faturamento total" value={`R$ ${revenue.toLocaleString('pt-BR',{minimumFractionDigits:2})}`}      sub={`${completed.length} concluídas`} color="text-signal-600" />
        <KPI label="Este mês"          value={`R$ ${revenueMonth.toLocaleString('pt-BR',{minimumFractionDigits:2})}`} sub={`${thisMonth.length} OS`}         color="text-brand-600" />
        <KPI label="Tempo médio"       value={avgDur !== null ? fmtDur(avgDur) : '—'}                                  sub="por OS concluída" />
        <KPI label="Equipe ativa"      value={internalMechs.length}                                                    sub="mecânicos" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-steel-100 rounded-xl p-1">
        {([
          { key: 'os',        label: `📋 OS (${osCount})` },
          { key: 'agendados', label: `📅 Agendados (${agendados.length})` },
          { key: 'mecanicos', label: `🔧 Equipe (${internalMechs.length})` },
        ] as { key: MainTab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              tab === t.key ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ TAB: OS ══ */}
      {tab === 'os' && (
        <div className="space-y-5">

          {/* ── Banner Check-up Gratuito ── */}
          <div className="rounded-2xl overflow-hidden border border-signal-200 bg-gradient-to-r from-signal-50 to-brand-50">
            <div className="px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="text-4xl shrink-0">🎁</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-steel-800 text-base">Check-up Gratuito — Estratégia de captação</div>
                <p className="text-sm text-steel-500 mt-0.5">
                  Ofereça uma avaliação gratuita do veículo para atrair novos clientes.
                  Pode ser executado por mecânico interno ou profissional do marketplace.
                </p>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <button onClick={() => openModalOS({ checkup: true, schedMode: 'now' })}
                  className="btn-primary text-sm !py-2 !px-4">
                  ⚡ Agora
                </button>
                <button onClick={() => openModalOS({ checkup: true, schedMode: 'later' })}
                  className="btn-secondary text-sm !py-2 !px-4">
                  📅 Agendar
                </button>
              </div>
            </div>
          </div>

          {topCats.length > 0 && (
            <div className="card">
              <h2 className="font-bold text-steel-800 mb-4">Serviços mais realizados</h2>
              <div className="space-y-3">
                {topCats.map(([cat, info]) => {
                  const avgD = info.durations.length ? Math.round(info.durations.reduce((a,b)=>a+b,0)/info.durations.length) : null;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold truncate">{cat}</span>
                          {avgD !== null && <span className="text-xs text-steel-400 whitespace-nowrap">⏱ {fmtDur(avgD)}</span>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {info.revenue > 0 && <span className="text-xs text-signal-600 font-semibold">R$ {info.revenue.toLocaleString('pt-BR',{minimumFractionDigits:2})}</span>}
                          <span className="text-xs font-bold text-steel-700 w-8 text-right">{info.count}×</span>
                        </div>
                      </div>
                      <div className="h-2 bg-steel-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-700"
                          style={{ width: `${(info.count / maxCount) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 items-center">
            <input className="input max-w-xs text-sm" placeholder="Buscar OS, cliente, placa, mecânico…"
              value={search} onChange={e => setSearch(e.target.value)} />
            <select className="input max-w-[160px] text-sm" value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as OsStatus|'all')}>
              <option value="all">Todos status</option>
              {STATUSES.map(s => <option key={s} value={s}>{osLabel(s)} ({counts[s] ?? 0})</option>)}
            </select>
            {internalMechs.length > 0 && (
              <select className="input max-w-[180px] text-sm" value={filterMech}
                onChange={e => setFilterMech(e.target.value)}>
                <option value="all">Todos mecânicos</option>
                <option value="none">Sem mecânico</option>
                {internalMechs.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="card text-center text-steel-500 py-14">
              {list.length === 0
                ? <><p className="text-lg font-semibold">Nenhuma OS ainda</p><p className="text-sm mt-1">Crie a primeira ordem de serviço.</p></>
                : 'Nenhuma OS com esses filtros.'}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(os => <OsCard key={os.id} os={os} onClick={() => setDetail(os)} />)}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: AGENDADOS ══ */}
      {tab === 'agendados' && (
        <div className="space-y-4">
          {agendados.length === 0 ? (
            <div className="card text-center text-steel-500 py-16">
              <div className="text-4xl mb-3">📅</div>
              <p className="text-lg font-semibold">Nenhum serviço agendado</p>
              <p className="text-sm mt-1">Ao criar uma OS, escolha "Agendar para uma data".</p>
              <button onClick={() => openModalOS()} className="btn-primary mt-5">+ Agendar OS</button>
            </div>
          ) : (
            <>
              <p className="text-sm text-steel-500">{agendados.length} serviço{agendados.length !== 1 ? 's' : ''} agendado{agendados.length !== 1 ? 's' : ''}</p>
              <div className="space-y-3">
                {agendados.map(os => {
                  const d      = new Date(os.scheduled_at!);
                  const isToday = d.toDateString() === now.toDateString();
                  const isPast  = d < now;
                  return (
                    <button key={os.id} onClick={() => setDetail(os)}
                      className="card w-full text-left hover:shadow-md transition hover:-translate-y-0.5">
                      <div className="flex items-start gap-4">
                        <div className={`shrink-0 rounded-xl px-3 py-2 text-center min-w-[56px] ${
                          isPast ? 'bg-alert-50 border border-alert-200' :
                          isToday ? 'bg-brand-50 border border-brand-200' :
                          'bg-steel-50 border border-steel-200'
                        }`}>
                          <div className={`text-xs font-bold uppercase ${isPast ? 'text-alert-600' : isToday ? 'text-brand-600' : 'text-steel-500'}`}>
                            {d.toLocaleDateString('pt-BR', { month: 'short' })}
                          </div>
                          <div className={`text-2xl font-bold leading-tight font-display ${isPast ? 'text-alert-700' : isToday ? 'text-brand-700' : 'text-steel-800'}`}>
                            {d.getDate()}
                          </div>
                          <div className={`text-[10px] font-semibold ${isPast ? 'text-alert-500' : isToday ? 'text-brand-500' : 'text-steel-400'}`}>
                            {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isPast  && <span className="badge bg-alert-100 text-alert-700 text-xs">Atrasado</span>}
                            {isToday && !isPast && <span className="badge bg-brand-100 text-brand-700 text-xs">Hoje</span>}
                            <span className="font-bold truncate">{os.title}</span>
                          </div>
                          <div className="text-xs text-steel-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {os.customer  && <span>👤 {os.customer.full_name}</span>}
                            {os.vehicle   && <span>🚗 {os.vehicle.plate} · {os.vehicle.make} {os.vehicle.model}</span>}
                            {os.mechanic  && <span>🔧 {os.mechanic.name}</span>}
                            {os.estimated_hours && <span>⏱ {os.estimated_hours}h estimadas</span>}
                          </div>
                          {os.category && <span className="badge bg-steel-100 text-steel-600 text-xs mt-2">{os.category}</span>}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-lg font-bold font-display">R$ {os.price.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ TAB: EQUIPE ══ */}
      {tab === 'mecanicos' && (
        <div className="space-y-4">
          {topMechs.length > 0 && (
            <div className="card">
              <h2 className="font-bold text-steel-800 mb-3">Performance da equipe</h2>
              <div className="divide-y divide-steel-100">
                {topMechs.map(m => {
                  const avgD = m.durations.length ? Math.round(m.durations.reduce((a,b)=>a+b,0)/m.durations.length) : null;
                  return (
                    <div key={m.name} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold shrink-0">
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-sm">{m.name}</div>
                          <div className="text-xs text-steel-500">{m.count} OS {avgD !== null && `· ⏱ ${fmtDur(avgD)} em média`}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold font-display text-sm">R$ {m.revenue.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
                        <div className="text-xs text-steel-400">faturado</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {internalMechs.length === 0 ? (
            <div className="card text-center py-14 text-steel-500">
              <p className="text-lg font-semibold">Nenhum mecânico cadastrado</p>
              <p className="text-sm mt-1">Adicione a equipe para vincular nas OS e medir performance.</p>
              <button onClick={openNewMech} className="btn-primary mt-4">+ Adicionar mecânico</button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {internalMechs.map(m => (
                <div key={m.id} className="card">
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-full bg-brand-500 grid place-items-center text-white font-bold text-lg shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate">{m.name}</div>
                      {m.specialty && <div className="text-xs text-steel-500 mt-0.5">{m.specialty}</div>}
                      <div className="text-xs text-steel-400 mt-0.5">{(mechMap[m.id]?.count ?? 0)} OS realizadas</div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => openEditMech(m)} className="h-7 w-7 rounded-lg bg-steel-100 hover:bg-steel-200 grid place-items-center text-steel-500 hover:text-steel-700 transition text-xs">✏️</button>
                      <button onClick={() => deactivateMech(m.id)} className="h-7 w-7 rounded-lg bg-steel-100 hover:bg-alert-100 grid place-items-center text-steel-400 hover:text-alert-600 transition text-xs">✕</button>
                    </div>
                  </div>
                  {m.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {m.skills.map(s => (
                        <span key={s} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-100">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ DETALHE DA OS ══ */}
      {detail && (
        <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50" onClick={() => setDetail(null)}>
          <div onClick={e => e.stopPropagation()} className="card max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex gap-2 flex-wrap mb-2">
                  <span className={`badge ${osColor(detail.status)}`}>{osLabel(detail.status)}</span>
                  {detail.category && <span className="badge bg-steel-100 text-steel-600">{detail.category}</span>}
                  {detail.scheduled_at && detail.status === 'open' && <span className="badge bg-brand-50 text-brand-700 border border-brand-200">📅 Agendado</span>}
                </div>
                <h2 className="text-xl font-bold">{detail.title}</h2>
              </div>
              <button onClick={() => setDetail(null)} className="text-steel-400 hover:text-steel-700 text-xl leading-none">✕</button>
            </div>
            {detail.description && <p className="text-sm text-steel-600 bg-steel-50 rounded-xl p-3">{detail.description}</p>}
            {detail.notes && (
              <div className="bg-pending-50 border border-pending-200 rounded-xl p-3">
                <div className="text-[10px] text-pending-600 font-bold uppercase tracking-wider mb-1">Notas internas</div>
                <p className="text-sm text-pending-800">{detail.notes}</p>
              </div>
            )}
            <div className="bg-steel-50 rounded-xl p-4 space-y-2">
              <div className="text-xs font-bold text-steel-500 uppercase tracking-wider mb-2">Timeline</div>
              {detail.scheduled_at && <TimelineRow label="Agendada para" value={fmtDateTime(detail.scheduled_at)} done />}
              <TimelineRow label="Criada"    value={fmtDateTime(detail.created_at)} done />
              <TimelineRow label="Iniciada"  value={detail.started_at   ? fmtDateTime(detail.started_at)   : '—'} done={!!detail.started_at}   />
              <TimelineRow label="Concluída" value={detail.completed_at ? fmtDateTime(detail.completed_at) : '—'} done={!!detail.completed_at} />
              {durationMin(detail) !== null && (
                <div className="pt-2 border-t border-steel-200">
                  <span className="text-xs text-steel-500">Duração total: </span>
                  <span className="text-sm font-bold text-brand-600">{fmtDur(durationMin(detail)!)}</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {detail.customer      && <InfoCard label="Cliente"       value={detail.customer.full_name} />}
              {detail.vehicle       && <InfoCard label="Veículo"       value={`${detail.vehicle.plate} · ${detail.vehicle.make} ${detail.vehicle.model}`} />}
              {detail.mechanic      && <InfoCard label="Mecânico"      value={detail.mechanic.name} sub={detail.mechanic.specialty ?? undefined} />}
              <InfoCard label="Valor total"   value={`R$ ${detail.price.toLocaleString('pt-BR',{minimumFractionDigits:2})}`} bold />
              {detail.estimated_hours != null && <InfoCard label="Tempo estimado" value={`${detail.estimated_hours}h`} />}
              {detail.km_reading     != null && <InfoCard label="KM atual"        value={`${detail.km_reading.toLocaleString('pt-BR')} km`} />}
              {detail.parts_cost     != null && <InfoCard label="Peças"           value={`R$ ${detail.parts_cost.toLocaleString('pt-BR',{minimumFractionDigits:2})}`} />}
              {detail.labor_cost     != null && <InfoCard label="Mão de obra"     value={`R$ ${detail.labor_cost.toLocaleString('pt-BR',{minimumFractionDigits:2})}`} />}
            </div>
            {detail.status !== 'completed' && detail.status !== 'cancelled' && (
              <div>
                <div className="label mb-2">Alterar status</div>
                <div className="flex gap-2 flex-wrap">
                  {detail.status === 'open'        && <button onClick={() => updateStatus(detail,'in_progress')} className="btn-secondary text-sm">▶ Iniciar</button>}
                  {detail.status === 'in_progress' && <button onClick={() => updateStatus(detail,'completed')}   className="btn-primary  text-sm">✓ Concluir</button>}
                  <button onClick={() => updateStatus(detail,'cancelled')} className="btn-ghost text-sm text-alert-600 hover:bg-alert-50">Cancelar OS</button>
                </div>
              </div>
            )}
            {detail.status === 'completed' && (
              <div className="bg-signal-50 border border-signal-200 rounded-xl p-3 text-sm text-signal-700 font-semibold flex items-center gap-2">
                <span>✓</span>
                <span>Concluída · R$ {detail.price.toLocaleString('pt-BR',{minimumFractionDigits:2})}{durationMin(detail) !== null && ` · ${fmtDur(durationMin(detail)!)}`}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL NOVA OS ══ */}
      {modalOS && (
        <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50" onClick={() => setModalOS(false)}>
          <form onSubmit={saveOS} onClick={e => e.stopPropagation()}
            className="card max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto">

            <h2 className="text-xl font-bold sticky top-0 bg-white py-1">
              {isCheckup ? '🎁 Check-up Gratuito' : 'Nova Ordem de Serviço'}
            </h2>

            {/* ── Badge check-up ── */}
            {isCheckup && (
              <div className="bg-signal-50 border border-signal-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-2xl">🎁</span>
                <div>
                  <div className="font-bold text-signal-700 text-sm">Serviço gratuito — Check-up de captação</div>
                  <div className="text-xs text-signal-600">Preço fixado em R$ 0,00. Use para atrair e cadastrar novos clientes.</div>
                </div>
              </div>
            )}

            {/* ── Tipo de mecânico ── */}
            <div className="bg-steel-50 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold text-steel-500 uppercase tracking-wider">Quem vai executar?</div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setMechType('internal')}
                  className={`py-3 rounded-xl text-sm font-semibold border-2 transition flex flex-col items-center gap-1 ${
                    mechType === 'internal'
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'
                  }`}>
                  <span className="text-xl">🔧</span>
                  <span>Mecânico interno</span>
                </button>
                <button type="button" onClick={() => setMechType('marketplace')}
                  className={`py-3 rounded-xl text-sm font-semibold border-2 transition flex flex-col items-center gap-1 ${
                    mechType === 'marketplace'
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'
                  }`}>
                  <span className="text-xl">🌐</span>
                  <span>Marketplace</span>
                </button>
              </div>

              {mechType === 'marketplace' && (
                <div className="bg-brand-50 border border-brand-200 rounded-xl px-3 py-2.5 text-xs text-brand-700">
                  🌐 A OS será publicada no marketplace e mecânicos cadastrados poderão aceitar o serviço.
                </div>
              )}
            </div>

            {/* ── Agendamento ── */}
            <div className="bg-steel-50 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold text-steel-500 uppercase tracking-wider">Quando executar?</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setScheduleMode('now')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${scheduleMode === 'now' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
                  ⚡ Agora
                </button>
                <button type="button" onClick={() => setScheduleMode('later')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${scheduleMode === 'later' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
                  📅 Agendar para...
                </button>
              </div>
              {scheduleMode === 'later' && (
                <div>
                  <label className="label">Data e hora</label>
                  <input type="datetime-local" className="input" required={scheduleMode === 'later'}
                    value={scheduledAt} min={toDatetimeLocal(new Date().toISOString())}
                    onChange={e => setScheduledAt(e.target.value)} />
                </div>
              )}
            </div>

            {/* ── Serviço ── */}
            <div>
              <label className="label">Título do serviço *</label>
              <input className="input" required value={formOS.title}
                onChange={e => setFormOS(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex.: Troca de correia dentada" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Categoria</label>
                <input
                  className="input"
                  list="os-categories-list"
                  value={formOS.category}
                  onChange={e => setFormOS(f => ({ ...f, category: e.target.value }))}
                  placeholder="Selecionar ou digitar nova…"
                />
                <datalist id="os-categories-list">
                  {OS_CATEGORIES.map(c => <option key={c} value={c} />)}
                </datalist>
                {formOS.category && !OS_CATEGORIES.includes(formOS.category) && (
                  <p className="text-[10px] text-brand-600 font-semibold mt-1">✨ Nova categoria: "{formOS.category}"</p>
                )}
              </div>
              <div>
                <label className="label">Tempo estimado (h)</label>
                <input className="input" type="number" min="0" step="0.5"
                  value={formOS.estimated_hours}
                  onChange={e => setFormOS(f => ({ ...f, estimated_hours: e.target.value }))}
                  placeholder="2" />
              </div>
            </div>

            <div>
              <label className="label">Descrição / diagnóstico</label>
              <textarea className="input" rows={2} value={formOS.description}
                onChange={e => setFormOS(f => ({ ...f, description: e.target.value }))}
                placeholder="Descreva o problema, diagnóstico inicial…" />
            </div>

            {mechType === 'internal' && (
              <div>
                <label className="label">Notas internas</label>
                <textarea className="input" rows={2} value={formOS.notes}
                  onChange={e => setFormOS(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Observações internas da oficina…" />
              </div>
            )}

            {/* ── Cliente & Veículo ── */}
            <div className="bg-steel-50 rounded-xl p-4 space-y-3">
              <div className="text-xs font-bold text-steel-500 uppercase tracking-wider">Cliente & Veículo</div>

              {/* Select cliente */}
              {!showNewCust ? (
                <div>
                  <label className="label">Cliente</label>
                  <div className="flex gap-2">
                    <select className="input flex-1" value={formOS.customer_id}
                      onChange={e => {
                        setFormOS(f => ({ ...f, customer_id: e.target.value, vehicle_id: '' }));
                        setShowNewVeh(false);
                        if (e.target.value) loadVehicles(e.target.value); else setVehicles([]);
                      }}>
                      <option value="">— Selecionar cliente —</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
                    </select>
                    <button type="button" onClick={() => setShowNewCust(true)}
                      className="shrink-0 px-3 py-2 rounded-xl bg-brand-500 text-white text-xs font-bold hover:bg-brand-600 transition whitespace-nowrap">
                      + Novo
                    </button>
                  </div>
                </div>
              ) : (
                /* Formulário inline – novo cliente */
                <div className="bg-white border border-brand-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-brand-700">➕ Cadastrar novo cliente</span>
                    <button type="button" onClick={() => setShowNewCust(false)} className="text-steel-400 hover:text-steel-700 text-lg leading-none">✕</button>
                  </div>

                  {/* Dados do cliente */}
                  <div>
                    <label className="label">Nome completo *</label>
                    <input className="input" required value={inlineCust.full_name}
                      onChange={e => setInlineCust(f => ({ ...f, full_name: e.target.value }))}
                      placeholder="Maria da Silva" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Telefone / WhatsApp</label>
                      <input className="input" value={inlineCust.phone}
                        onChange={e => setInlineCust(f => ({ ...f, phone: e.target.value }))}
                        placeholder="(11) 9 9999-9999" />
                    </div>
                    <div>
                      <label className="label">CPF</label>
                      <input className="input" value={inlineCust.cpf}
                        onChange={e => setInlineCust(f => ({ ...f, cpf: e.target.value }))}
                        placeholder="000.000.000-00" />
                    </div>
                  </div>

                  {/* Veículo rápido */}
                  <div className="bg-steel-50 rounded-xl p-3 space-y-2">
                    <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">🚗 Veículo (opcional — cadastra junto)</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="label !text-[10px]">Marca</label>
                        <input className="input text-sm" value={inlineCust.veh_make}
                          onChange={e => setInlineCust(f => ({ ...f, veh_make: e.target.value }))}
                          placeholder="Honda" />
                      </div>
                      <div>
                        <label className="label !text-[10px]">Modelo</label>
                        <input className="input text-sm" value={inlineCust.veh_model}
                          onChange={e => setInlineCust(f => ({ ...f, veh_model: e.target.value }))}
                          placeholder="Civic" />
                      </div>
                    </div>
                    <div>
                      <label className="label !text-[10px]">Placa</label>
                      <input className="input text-sm uppercase" value={inlineCust.veh_plate}
                        onChange={e => setInlineCust(f => ({ ...f, veh_plate: e.target.value.toUpperCase() }))}
                        placeholder="ABC1D23 (opcional)" />
                    </div>
                  </div>

                  <button type="button" onClick={createCustomerInline} disabled={savingCust || !inlineCust.full_name.trim()}
                    className="btn-primary w-full text-sm disabled:opacity-50">
                    {savingCust ? '…' : inlineCust.veh_make && inlineCust.veh_model
                      ? '✓ Salvar cliente + veículo'
                      : '✓ Salvar e selecionar cliente'}
                  </button>
                </div>
              )}

              {/* Select veículo */}
              {formOS.customer_id && !showNewCust && (
                <div>
                  <label className="label">Veículo</label>
                  {!showNewVeh ? (
                    <div className="flex gap-2">
                      <select className="input flex-1" value={formOS.vehicle_id}
                        onChange={e => setFormOS(f => ({ ...f, vehicle_id: e.target.value }))}>
                        <option value="">— Selecionar veículo —</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} · {v.make} {v.model}{v.year ? ` (${v.year})` : ''}</option>)}
                      </select>
                      <button type="button" onClick={() => setShowNewVeh(true)}
                        className="shrink-0 px-3 py-2 rounded-xl bg-brand-500 text-white text-xs font-bold hover:bg-brand-600 transition whitespace-nowrap">
                        + Novo
                      </button>
                    </div>
                  ) : (
                    /* Formulário inline – novo veículo */
                    <div className="bg-white border border-brand-200 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-brand-700">🚗 Cadastrar novo veículo</span>
                        <button type="button" onClick={() => setShowNewVeh(false)} className="text-steel-400 hover:text-steel-700 text-lg leading-none">✕</button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Placa *</label>
                          <input className="input uppercase" required value={inlineVeh.plate}
                            onChange={e => setInlineVeh(f => ({ ...f, plate: e.target.value.toUpperCase() }))}
                            placeholder="ABC1D23" />
                        </div>
                        <div>
                          <label className="label">Ano</label>
                          <input className="input" type="number" min={1950} max={2030} value={inlineVeh.year}
                            onChange={e => setInlineVeh(f => ({ ...f, year: e.target.value }))}
                            placeholder="2020" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">Marca *</label>
                          <input className="input" required value={inlineVeh.make}
                            onChange={e => setInlineVeh(f => ({ ...f, make: e.target.value }))}
                            placeholder="Honda" />
                        </div>
                        <div>
                          <label className="label">Modelo *</label>
                          <input className="input" required value={inlineVeh.model}
                            onChange={e => setInlineVeh(f => ({ ...f, model: e.target.value }))}
                            placeholder="Civic" />
                        </div>
                      </div>
                      <div>
                        <label className="label">Cor</label>
                        <input className="input" value={inlineVeh.color}
                          onChange={e => setInlineVeh(f => ({ ...f, color: e.target.value }))}
                          placeholder="Prata" />
                      </div>
                      <button type="button" onClick={createVehicleInline}
                        disabled={savingVeh || !inlineVeh.plate.trim() || !inlineVeh.make.trim() || !inlineVeh.model.trim()}
                        className="btn-primary w-full text-sm disabled:opacity-50">
                        {savingVeh ? '…' : '✓ Salvar e selecionar veículo'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* KM */}
              {mechType === 'internal' && (
                <div>
                  <label className="label">KM atual do veículo</label>
                  <input className="input" type="number" min="0"
                    value={formOS.km_reading}
                    onChange={e => setFormOS(f => ({ ...f, km_reading: e.target.value }))}
                    placeholder="Ex.: 85000" />
                </div>
              )}
            </div>

            {/* ── Mecânico (interno) ── */}
            {mechType === 'internal' && (
              <div>
                <label className="label">Mecânico responsável</label>
                <select className="input" value={formOS.workshop_mechanic_id}
                  onChange={e => setFormOS(f => ({ ...f, workshop_mechanic_id: e.target.value }))}>
                  <option value="">— Selecionar —</option>
                  {internalMechs.map(m => <option key={m.id} value={m.id}>{m.name}{m.specialty ? ` · ${m.specialty}` : ''}</option>)}
                </select>
                {internalMechs.length === 0 && (
                  <p className="text-xs text-steel-400 mt-1">
                    <button type="button" className="text-brand-500 underline"
                      onClick={() => { setModalOS(false); setTab('mecanicos'); openNewMech(); }}>
                      Cadastrar mecânico primeiro
                    </button>
                  </p>
                )}
              </div>
            )}

            {/* ── Marketplace: skills e remuneração ── */}
            {mechType === 'marketplace' && (
              <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 space-y-4">
                <div className="text-xs font-bold text-brand-700 uppercase tracking-wider">Configuração do Marketplace</div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Valor/hora (R$)</label>
                    <input className="input font-display" inputMode="numeric"
                      placeholder="0,00"
                      value={mktPricePerHour === 0 ? '' : toBRL(mktPricePerHour)}
                      onChange={e => setMktPricePerHour(parseCents(e.target.value))} />
                  </div>
                  <div>
                    <label className="label">Máx. de horas</label>
                    <input className="input" type="number" min="1" step="0.5"
                      value={mktMaxHours}
                      onChange={e => setMktMaxHours(e.target.value)}
                      placeholder="Ex.: 4" />
                  </div>
                </div>

                <div>
                  <label className="label">Valor fixo do serviço (R$)</label>
                  <input className="input font-display" inputMode="numeric"
                    placeholder="0,00 (opcional se usar valor/hora)"
                    value={priceCents === 0 ? '' : toBRL(priceCents)}
                    onChange={e => setPriceCents(parseCents(e.target.value))} />
                </div>

                <div>
                  <label className="label">Habilidades necessárias</label>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {SKILL_OPTIONS.map(s => (
                      <button key={s} type="button" onClick={() => toggleMktSkill(s)}
                        className={`text-xs px-2.5 py-1 rounded-full border font-semibold transition ${
                          mktSkills.includes(s)
                            ? 'bg-brand-500 text-white border-brand-500'
                            : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'
                        }`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {mktPricePerHour > 0 && mktMaxHours && (
                  <div className="flex justify-between items-center pt-1 border-t border-brand-200">
                    <span className="text-sm text-brand-600">Estimativa total</span>
                    <span className="font-bold font-display text-brand-700 text-lg">
                      R$ {((mktPricePerHour / 100) * parseFloat(mktMaxHours)).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Valor (interno) ── */}
            {mechType === 'internal' && (
              <div className="bg-steel-50 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-steel-500 uppercase tracking-wider">Valor do serviço</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Peças (R$)</label>
                    <input className="input font-display" inputMode="decimal"
                      value={formOS.parts_cost} onChange={e => setFormOS(f => ({ ...f, parts_cost: e.target.value }))}
                      placeholder="0,00" />
                  </div>
                  <div>
                    <label className="label">Mão de obra (R$)</label>
                    <input className="input font-display" inputMode="decimal"
                      value={formOS.labor_cost} onChange={e => setFormOS(f => ({ ...f, labor_cost: e.target.value }))}
                      placeholder="0,00" />
                  </div>
                </div>
                {(!formOS.parts_cost && !formOS.labor_cost) && (
                  <div>
                    <label className="label">Ou valor total (R$)</label>
                    <input className="input font-display" inputMode="numeric" placeholder="0,00"
                      value={priceCents === 0 ? '' : toBRL(priceCents)}
                      onChange={e => setPriceCents(parseCents(e.target.value))} />
                  </div>
                )}
                {(formOS.parts_cost || formOS.labor_cost) && (
                  <div className="flex justify-between items-center pt-1 border-t border-steel-200">
                    <span className="text-sm text-steel-500">Total calculado</span>
                    <span className="font-bold font-display text-lg">
                      R$ {((parseFloat(formOS.parts_cost||'0'))+(parseFloat(formOS.labor_cost||'0'))).toLocaleString('pt-BR',{minimumFractionDigits:2})}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setModalOS(false)} className="btn-ghost flex-1">Cancelar</button>
              <button className="btn-primary flex-1 btn-lg" disabled={saving}>
                {saving ? '…' : mechType === 'marketplace'
                  ? (scheduleMode === 'later' ? '📅 Agendar no Marketplace' : '🌐 Publicar no Marketplace')
                  : (scheduleMode === 'later' ? '📅 Agendar OS' : 'Criar OS')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══ MODAL MECÂNICO ══ */}
      {modalMech && (
        <div className="fixed inset-0 bg-steel-900/60 grid place-items-center p-4 z-50" onClick={() => setModalMech(false)}>
          <form onSubmit={saveMech} onClick={e => e.stopPropagation()}
            className="card max-w-md w-full max-h-[90vh] overflow-y-auto space-y-5">
            <div>
              <h2 className="text-xl font-bold">{editMech ? 'Editar mecânico' : 'Novo mecânico'}</h2>
              <p className="text-sm text-steel-500 mt-0.5">Funcionário interno da oficina.</p>
            </div>
            <div>
              <label className="label">Nome completo *</label>
              <input className="input" required value={formMech.name}
                onChange={e => setFormMech(f => ({ ...f, name: e.target.value }))} placeholder="João da Silva" />
            </div>
            <div>
              <label className="label">Especialidade principal</label>
              <select className="input" value={formMech.specialty}
                onChange={e => setFormMech(f => ({ ...f, specialty: e.target.value }))}>
                <option value="">— Selecionar —</option>
                {SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Habilidades</label>
              <div className="flex flex-wrap gap-2 mb-3 min-h-[28px]">
                {formMech.skills.map(s => (
                  <span key={s} className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-brand-500/15 text-brand-700 border border-brand-300/40">
                    {s}<button type="button" onClick={() => removeSkill(s)} className="hover:text-alert-600 text-sm">×</button>
                  </span>
                ))}
                {formMech.skills.length === 0 && <span className="text-sm text-steel-400">Nenhuma selecionada.</span>}
              </div>
              <div className="text-[10px] text-steel-500 uppercase tracking-wider font-semibold mb-2">Sugestões rápidas</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {SKILL_OPTIONS.filter(s => !formMech.skills.includes(s)).map(s => (
                  <button key={s} type="button" onClick={() => addSkill(s)}
                    className="text-xs px-2.5 py-1 rounded-full bg-steel-100 text-steel-600 hover:bg-brand-50 hover:text-brand-700 border border-steel-200 hover:border-brand-300 transition">
                    + {s}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="input flex-1 text-sm" placeholder="Outra habilidade…"
                  value={newSkill} onChange={e => setNewSkill(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(newSkill); } }} />
                <button type="button" onClick={() => addSkill(newSkill)} className="btn-primary !py-2 !px-4 shrink-0 text-sm">+</button>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setModalMech(false)} className="btn-ghost flex-1">Cancelar</button>
              <button className="btn-primary flex-1" disabled={saving}>{saving ? '…' : editMech ? 'Salvar' : 'Cadastrar'}</button>
            </div>
          </form>
        </div>
      )}

    </WorkshopLayout>
  );
}

/* ─── sub-componentes ─────────────────────────────────────── */
function OsCard({ os, onClick }: { os: OsRow; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card w-full text-left hover:shadow-md transition hover:-translate-y-0.5 active:scale-[0.99]">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge text-xs ${osColor(os.status)}`}>{osLabel(os.status)}</span>
            {os.category && <span className="badge bg-steel-100 text-steel-600 text-xs">{os.category}</span>}
            {os.scheduled_at && os.status === 'open' && (
              <span className="badge bg-brand-50 text-brand-700 text-xs border border-brand-200">
                📅 {new Date(os.scheduled_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}
              </span>
            )}
            <span className="font-bold truncate">{os.title}</span>
          </div>
          <div className="text-xs text-steel-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {os.customer && <span>👤 {os.customer.full_name}</span>}
            {os.vehicle  && <span>🚗 {os.vehicle.plate} · {os.vehicle.make} {os.vehicle.model}</span>}
            {os.mechanic && <span>🔧 {os.mechanic.name}</span>}
          </div>
          <div className="text-xs text-steel-400 mt-1">
            <span>{fmtDate(os.created_at)}</span>
            {os.completed_at && durationMin(os) !== null && <span className="ml-3">⏱ {fmtDur(durationMin(os)!)}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-bold font-display">R$ {os.price.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
        </div>
      </div>
    </button>
  );
}

function KPI({ label, value, sub, color }: { label: string; value: string|number; sub?: string; color?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-steel-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold font-display mt-1 ${color ?? 'text-steel-800'}`}>{value}</div>
      {sub && <div className="text-xs text-steel-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function TimelineRow({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-5 w-5 rounded-full grid place-items-center text-xs shrink-0 ${done ? 'bg-signal-500 text-white' : 'bg-steel-200 text-steel-400'}`}>
        {done ? '✓' : '·'}
      </div>
      <div className="flex-1 flex justify-between text-sm">
        <span className={done ? 'font-semibold text-steel-700' : 'text-steel-400'}>{label}</span>
        <span className="text-steel-500">{value}</span>
      </div>
    </div>
  );
}

function InfoCard({ label, value, sub, bold }: { label: string; value: string; sub?: string; bold?: boolean }) {
  return (
    <div className="card !p-3">
      <div className="label">{label}</div>
      <div className={`${bold ? 'font-bold font-display text-lg' : 'font-semibold'} truncate`}>{value}</div>
      {sub && <div className="text-xs text-steel-500">{sub}</div>}
    </div>
  );
}
