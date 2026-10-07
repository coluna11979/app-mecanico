import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import LicensePlate from '@/components/os/LicensePlate';
import { checkupForOs, modelLabel, modelOf, type CheckupItemStatus } from '@/lib/checkup';
import { ago, countsOf, hoursSince, lastActivity, systemsOf, weekStart } from '@/lib/checkupStatus';

/* Fila do mecânico (modo balcão): só o que é dele + o que está sem responsável.
   Um botão por card, sem preço e sem nada comercial.
   Ordem: 1) Continuar  2) Pra fazer hoje  3) Sem responsável (Pegar este). */

type Draft = {
  id: string; plate: string | null; make: string | null; model: string | null; year: number | null;
  customer_name: string | null; workshop_mechanic_id: string | null;
  created_at: string; updated_at: string;
  template_key: string | null;
  items: { status: CheckupItemStatus | null; updated_at: string | null; system: string }[];
};
type Sched = {
  id: string; scheduled_at: string; workshop_mechanic_id: string | null;
  customer: { full_name: string } | null;
  vehicle: { plate: string; make: string; model: string; year: number | null } | null;
};

type Done = {
  id: string; plate: string | null; make: string | null; model: string | null; year: number | null;
  customer_name: string | null; completed_at: string | null; sale_os_id: string | null;
  items: { status: CheckupItemStatus | null }[];
};
const FINISHED_LIMIT = 10;

/** Parado há mais que isso → avisa "parado" */
const STALE_HOURS = 2;

/** Cliente + tipo do check-up (quando não é o completo): o mecânico sabe o que vai olhar */
const subOf = (d: Draft) => [d.customer_name, d.template_key && `${modelOf(d.template_key).icon} ${modelLabel(d.template_key, systemsOf(d.items))}`]
  .filter(Boolean).join(' · ') || null;

const carOf = (v: { make: string | null; model: string | null; year: number | null } | null) =>
  v ? [v.make, v.model, v.year].filter(Boolean).join(' ') || 'Veículo' : 'Veículo';

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export default function MechanicQueue({ workshopId, mechanicId, mechanicName, onNew }: {
  workshopId: string; mechanicId: string | null; mechanicName: string | null;
  /** Abre o formulário de novo check-up (já com ele como responsável) */
  onNew?: () => void;
}) {
  const navigate = useNavigate();
  const { pathname, state } = useLocation() as { pathname: string; state: { finished?: string } | null };
  // Aviso de "Pronto!" só uma vez: some ao recarregar a página
  const [finished] = useState(state?.finished ?? null);
  useEffect(() => {
    if (state?.finished !== undefined) navigate(pathname, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [sched, setSched]   = useState<Sched[]>([]);
  const [week, setWeek]     = useState({ done: 0, sold: 0 });
  /** Últimos check-ups que ele terminou (só leitura) */
  const [doneList, setDoneList] = useState<Done[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]     = useState<string | null>(null);

  useEffect(() => { load(); }, [workshopId, mechanicId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    const mine = mechanicId ? `workshop_mechanic_id.eq.${mechanicId},workshop_mechanic_id.is.null` : 'workshop_mechanic_id.is.null';
    const [d, s, used, w, f] = await Promise.all([
      supabase.from('vehicle_checkups')
        .select('id, plate, make, model, year, customer_name, workshop_mechanic_id, created_at, updated_at, template_key, items:checkup_items(status, updated_at, system)')
        .eq('workshop_id', workshopId).eq('status', 'draft').or(mine)
        .order('created_at', { ascending: false }),
      supabase.from('service_orders')
        .select('id, scheduled_at, workshop_mechanic_id, customer:customers(full_name), vehicle:vehicles(plate, make, model, year)')
        .eq('workshop_id', workshopId).not('scheduled_at', 'is', null)
        .lte('scheduled_at', endOfToday().toISOString())
        .not('status', 'in', '(completed,cancelled)')
        .or('category.eq.Check-up,title.ilike.*check*up*')
        .order('scheduled_at'),
      supabase.from('vehicle_checkups').select('service_order_id')
        .eq('workshop_id', workshopId).not('service_order_id', 'is', null),
      mechanicId
        ? supabase.from('vehicle_checkups').select('sale_os_id')
            .eq('workshop_id', workshopId).eq('workshop_mechanic_id', mechanicId).eq('status', 'completed').is('replaced_by', null)
            .gte('completed_at', weekStart().toISOString())
        : Promise.resolve({ data: [] as { sale_os_id: string | null }[] }),
      mechanicId
        ? supabase.from('vehicle_checkups')
            .select('id, plate, make, model, year, customer_name, completed_at, sale_os_id, items:checkup_items(status)')
            .eq('workshop_id', workshopId).eq('workshop_mechanic_id', mechanicId).eq('status', 'completed').is('replaced_by', null)
            .order('completed_at', { ascending: false }).limit(FINISHED_LIMIT)
        : Promise.resolve({ data: [] as Done[] }),
    ]);
    setDoneList((f.data as unknown as Done[]) ?? []);
    const withCheckup = new Set(((used.data ?? []) as { service_order_id: string }[]).map(r => r.service_order_id));
    setDrafts((d.data as unknown as Draft[]) ?? []);
    setSched(((s.data as unknown as Sched[]) ?? []).filter(o =>
      !withCheckup.has(o.id) && (o.workshop_mechanic_id === null || o.workshop_mechanic_id === mechanicId)));
    const wk = (w.data ?? []) as { sale_os_id: string | null }[];
    setWeek({ done: wk.length, sold: wk.filter(r => r.sale_os_id).length });
    setLoading(false);
  }

  /** Abre o check-up (ou cria o da OS agendada) já com o nome do mecânico */
  async function openOs(osId: string) {
    setBusy(osId);
    try {
      const id = await checkupForOs(osId, mechanicId);
      if (!id) { toast.error('OS não encontrada'); load(); return; }
      navigate(`/oficina/checkup/${id}`);
    } catch {
      toast.error('Não foi possível abrir — verifique a conexão');
    } finally {
      setBusy(null);
    }
  }

  /** Pega um check-up sem responsável (se outro não pegou antes) */
  async function take(d: Draft) {
    if (!mechanicId) return;
    setBusy(d.id);
    const { data, error } = await supabase.from('vehicle_checkups')
      .update({ workshop_mechanic_id: mechanicId, updated_at: new Date().toISOString() })
      .eq('id', d.id).is('workshop_mechanic_id', null).select('id');
    setBusy(null);
    if (error) { toast.error('Não foi possível pegar — verifique a conexão'); return; }
    if (!data?.length) { toast.info('Outro mecânico já pegou este'); load(); return; }
    navigate(`/oficina/checkup/${d.id}`);
  }

  const mineDrafts = drafts.filter(d => mechanicId && d.workshop_mechanic_id === mechanicId);
  const started    = mineDrafts.filter(d => countsOf(d.items).answered > 0)
    .sort((a, b) => lastActivity(b, b.items).localeCompare(lastActivity(a, a.items)));
  const toStart    = mineDrafts.filter(d => countsOf(d.items).answered === 0);
  const mySched    = sched.filter(o => mechanicId && o.workshop_mechanic_id === mechanicId);
  const freeDrafts = drafts.filter(d => d.workshop_mechanic_id === null);
  const freeSched  = sched.filter(o => o.workshop_mechanic_id === null);
  const todayCount = toStart.length + mySched.length;
  const first      = mechanicName?.trim().split(' ')[0];
  const nothing    = !started.length && !todayCount && !freeDrafts.length && !freeSched.length;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{first ? `Olá, ${first} 👋` : '🩺 Meus check-ups'}</h1>
          <p className="text-sm text-steel-500 mt-0.5">O que fazer agora, em ordem.</p>
        </div>
        {onNew && <button onClick={onNew} className="btn-primary text-sm !py-2.5 shrink-0">+ Novo check-up</button>}
      </div>

      {finished !== null && (
        <div className="card !py-3 bg-signal-50 border-signal-200 text-signal-800 font-semibold text-sm">
          ✅ Pronto! O gestor já recebeu{finished ? ` o check-up do ${finished}` : ''}.
        </div>
      )}

      {!mechanicId && (
        <div className="card !py-3 bg-pending-50 border-pending-200 text-sm text-steel-700">
          Seu acesso ainda não está ligado ao seu nome na Equipe. Peça ao gestor para ligar em <strong>Acessos e funções</strong> —
          aí aparecem aqui os check-ups que são seus.
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Pra fazer hoje" value={todayCount} />
        <Kpi label="Em andamento" value={started.length} />
        <Kpi label="Terminei na semana" value={week.done} />
      </div>

      {loading ? (
        <div className="card text-center text-steel-500 text-sm py-10">Carregando…</div>
      ) : nothing ? (
        <div className="card text-center py-10 space-y-2">
          <div className="text-4xl">👍</div>
          <div className="font-bold text-steel-800">Nada pra fazer agora</div>
          <p className="text-sm text-steel-500">Quando o gestor mandar um check-up pra você, ele aparece aqui.</p>
        </div>
      ) : (
        <>
          <Section title="Continuar" show={started.length > 0}>
            {started.map(d => {
              const c = countsOf(d.items);
              const last = lastActivity(d, d.items);
              const stale = (hoursSince(last) ?? 0) >= STALE_HOURS;
              return (
                <Card key={d.id} plate={d.plate} car={carOf(d)} sub={subOf(d)}
                  extra={<>
                    <Progress done={c.answered} total={c.total} />
                    <div className="text-xs text-steel-500 flex flex-wrap gap-x-3">
                      <span>Faltam {c.pending}</span>
                      {c.warn > 0 && <span>🟡 {c.warn}</span>}
                      {c.urgent > 0 && <span>🔴 {c.urgent}</span>}
                      <span className={stale ? 'text-pending-700 font-semibold' : ''}>{stale ? `parado ${ago(last)}` : `mexido ${ago(last)}`}</span>
                    </div>
                  </>}
                  action="Continuar →" busy={busy === d.id} onClick={() => navigate(`/oficina/checkup/${d.id}`)} />
              );
            })}
          </Section>

          <Section title="Pra fazer hoje" show={todayCount > 0}>
            {mySched.map(o => (
              <Card key={o.id} plate={o.vehicle?.plate ?? null} car={carOf(o.vehicle)} sub={o.customer?.full_name ?? null}
                extra={<When iso={o.scheduled_at} />}
                action="Começar" busy={busy === o.id} onClick={() => openOs(o.id)} />
            ))}
            {toStart.map(d => (
              <Card key={d.id} plate={d.plate} car={carOf(d)} sub={subOf(d)}
                extra={<div className="text-xs text-steel-500">{d.items.length} itens para olhar</div>}
                action="Começar" busy={busy === d.id} onClick={() => navigate(`/oficina/checkup/${d.id}`)} />
            ))}
          </Section>

          <Section title="Sem responsável" show={freeDrafts.length + freeSched.length > 0}>
            {freeSched.map(o => (
              <Card key={o.id} plate={o.vehicle?.plate ?? null} car={carOf(o.vehicle)} sub={o.customer?.full_name ?? null}
                extra={<When iso={o.scheduled_at} />}
                action="Pegar este" secondary disabled={!mechanicId} busy={busy === o.id} onClick={() => openOs(o.id)} />
            ))}
            {freeDrafts.map(d => (
              <Card key={d.id} plate={d.plate} car={carOf(d)} sub={subOf(d)}
                extra={<div className="text-xs text-steel-500">Criado {ago(d.created_at)}</div>}
                action="Pegar este" secondary disabled={!mechanicId} busy={busy === d.id} onClick={() => take(d)} />
            ))}
          </Section>
        </>
      )}

      {!loading && (
        <Section title="Terminados" show={doneList.length > 0}>
          {doneList.map(d => {
            const c = countsOf(d.items);
            return (
              <button key={d.id} onClick={() => navigate(`/oficina/checkup/${d.id}`)}
                className="card !p-3 w-full text-left flex items-center gap-3 hover:shadow-md transition">
                {d.plate && <LicensePlate plate={d.plate} size="sm" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-steel-800 truncate">{carOf(d)}{d.customer_name && <span className="font-normal text-steel-500"> · {d.customer_name}</span>}</div>
                  <div className="text-xs text-steel-500">
                    Terminado {ago(d.completed_at)} · 🟡 {c.warn} · 🔴 {c.urgent}{d.sale_os_id && ' · ✅ virou serviço'}
                  </div>
                </div>
                <span className="text-xs font-semibold text-brand-600 shrink-0">Ver →</span>
              </button>
            );
          })}
        </Section>
      )}

      {mechanicId && week.done > 0 && (
        <div className="text-center text-sm text-steel-500 pb-4">
          ✅ Seus check-ups da semana: <strong className="text-steel-800">{week.done}</strong>
          {week.sold > 0 && <> · <strong className="text-steel-800">{week.sold}</strong> {week.sold === 1 ? 'virou serviço' : 'viraram serviço'}</>}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="card !p-3 text-center">
      <div className="text-2xl font-bold font-display text-steel-900">{value}</div>
      <div className="text-[11px] text-steel-500 leading-tight">{label}</div>
    </div>
  );
}

function Section({ title, show, children }: { title: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-steel-500">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Card({ plate, car, sub, extra, action, onClick, busy, secondary, disabled }: {
  plate: string | null; car: string; sub: string | null; extra?: React.ReactNode;
  action: string; onClick: () => void; busy?: boolean; secondary?: boolean; disabled?: boolean;
}) {
  return (
    <div className="card space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {plate && <LicensePlate plate={plate} />}
          <span className="font-semibold text-steel-800 truncate">{car}</span>
        </div>
        {sub && <div className="text-xs text-steel-500 truncate">{sub}</div>}
        {extra}
      </div>
      <button onClick={onClick} disabled={busy || disabled}
        className={`w-full !py-3 text-base ${secondary ? 'btn-ghost border border-steel-300 bg-white font-semibold' : 'btn-primary'}`}>
        {busy ? 'Abrindo…' : action}
      </button>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-steel-100 overflow-hidden">
        <div className="h-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-steel-600 shrink-0">{done} de {total}</span>
    </div>
  );
}

function When({ iso }: { iso: string }) {
  const d = new Date(iso);
  const today = d.toDateString() === new Date().toDateString();
  const late = d.getTime() < Date.now();
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`text-xs font-semibold ${late ? 'text-alert-600' : 'text-brand-600'}`}>
      📅 {today ? `Hoje às ${time}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} às ${time}`}
      {late && ' · atrasado'}
    </div>
  );
}
