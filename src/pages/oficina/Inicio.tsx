import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll } from '@/lib/fetchAll';
import { toast } from '@/components/ui/Toast';
import { sessionAllows, useOperator } from '@/lib/operators';
import { useModuleAllows } from '@/lib/modules';
import { fmtBRL, osNumber } from '@/components/os/osHelpers';
import NewOsModal, { type NewOsPreset } from '@/components/os/NewOsModal';
import { PLATFORM, ResponsibleModal } from '@/components/cash/ResponsiblePicker';
import { DEFAULT_SCHEDULE, addDays, type ScheduleConfig } from '@/lib/agenda';
import { cashFlowOf, receivables, type FinEntry, type FinOs } from '@/lib/finance';
import { timeAgo } from '@/lib/relativeTime';
import { Icon, type IconName } from '@/components/home/ui';
import { ABSENCE_REASONS, fmtDay } from '@/lib/team';
import {
  agendaDay, greeting, openWorkload, osAttention, teamToday,
  type TeamAbsence, type TeamMember, type TodayOs,
} from '@/lib/today';

type Payable = { id: string; description: string; amount: number; due_date: string };
type PendingCheckup = { id: string; plate: string | null; customer_name: string | null; quote_sent_at: string };
type Reminder = { id: string; label: string; remind_on: string; checkup: { id: string; customer_name: string | null; plate: string | null } };
type PendingJob = { id: string; title: string; completed_at: string | null };

type Data = {
  active: TodayOs[];
  scheduled: Pick<TodayOs, 'scheduled_at' | 'status' | 'schedule_status'>[];
  toReceive: ReturnType<typeof receivables>;
  entriesToday: FinEntry[];
  lastRegister: { status: string; opened_at: string } | null;
  hadRegister: boolean;
  payables: Payable[];
  checkups: PendingCheckup[];
  reminders: Reminder[];
  team: TeamMember[];
  absences: TeamAbsence[];
  cfg: ScheduleConfig;
  pendingJobs: PendingJob[];
};

const ACTIVE_COLS = 'id, number, title, status, scheduled_at, started_at, estimated_hours, workshop_mechanic_id, executor, '
  + 'approval_requested_at, schedule_status, price, customer:customers(full_name, phone), vehicle:vehicles(plate, make, model), '
  + 'pauses:service_order_pauses(reason, started_at, ended_at)';

const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const isoDate = (d: Date) => d.toLocaleDateString('en-CA');
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const carOf = (v: TodayOs['vehicle']) => (v ? [v.make, v.model].filter(Boolean).join(' ') || v.plate || '' : '');

export default function Inicio() {
  const { profile, currentWorkshop } = useAuth();
  const { balcao, session } = useOperator();
  const nav = useNavigate();
  const wid = currentWorkshop?.id ?? null;

  const [data, setData] = useState<Data | null>(null);
  const [reload, setReload] = useState(0);
  const [newOs, setNewOs] = useState<NewOsPreset | null>(null);
  const [resp, setResp] = useState<{ os: TodayOs; platform: boolean } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());   // pendências com detalhes abertos
  const [showAll, setShowAll] = useState(false);
  const [showCap, setShowCap] = useState(false);   // Equipe: detalhes de capacidade

  // Cada bloco só aparece para quem pode abrir a tela de destino (no modo balcão, pela função/permissões)
  const modAllows = useModuleAllows();
  const can = (path: string) => modAllows(path) && (!balcao || !session || sessionAllows(session, path));

  useEffect(() => {
    if (!wid) return;
    let alive = true;
    (async () => {
      const now = new Date();
      const today = dayStart(now);
      const afterTomorrow = addDays(today, 2);
      const todayIso = isoDate(today);

      const [act, sch, first, last, ent, pay, chk, rem, team, abs, cfg, jobs] = await Promise.all([
        fetchAll((a, b) => supabase.from('service_orders').select(ACTIVE_COLS)
          .eq('workshop_id', wid).in('status', ['open', 'awaiting_approval', 'approved', 'in_progress'])
          .order('id').range(a, b)),
        supabase.from('service_orders').select('scheduled_at, status, schedule_status')
          .eq('workshop_id', wid).neq('status', 'cancelled')
          .gte('scheduled_at', today.toISOString()).lt('scheduled_at', afterTomorrow.toISOString()),
        supabase.from('cash_registers').select('opened_at').eq('workshop_id', wid)
          .order('opened_at').limit(1).maybeSingle(),
        supabase.from('cash_registers').select('status, opened_at').eq('workshop_id', wid)
          .order('opened_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('cash_entries').select('id, kind, method, amount, installments, category, mechanic_id, created_at')
          .eq('workshop_id', wid).is('cancelled_at', null).gte('created_at', today.toISOString()),
        supabase.from('payables').select('id, description, amount, due_date')
          .eq('workshop_id', wid).is('paid_at', null).is('cancelled_at', null).lte('due_date', todayIso)
          .order('due_date'),
        supabase.from('vehicle_checkups').select('id, plate, customer_name, quote_sent_at')
          .eq('workshop_id', wid).eq('status', 'completed').not('quote_sent_at', 'is', null)
          .is('customer_responded_at', null).is('sale_os_id', null)
          .gte('quote_sent_at', addDays(today, -30).toISOString()).order('quote_sent_at'),
        supabase.from('checkup_items')
          .select('id, label, remind_on, checkup:vehicle_checkups!inner(id, workshop_id, customer_name, plate)')
          .eq('checkup.workshop_id', wid).eq('customer_decision', 'remind')
          .gte('remind_on', isoDate(addDays(today, -7))).lte('remind_on', todayIso).order('remind_on'),
        supabase.from('workshop_mechanics').select('id, name, active, status, role_title, work_schedule')
          .eq('workshop_id', wid).neq('status', 'terminated').order('name'),
        supabase.from('workshop_mechanic_absences').select('mechanic_id, reason, started_on, returned_on, expected_return')
          .eq('workshop_id', wid).lte('started_on', todayIso).or(`returned_on.is.null,returned_on.gt.${todayIso}`),
        supabase.from('workshop_schedule').select('*').eq('workshop_id', wid).maybeSingle(),
        supabase.from('jobs').select('id, title, completed_at').eq('workshop_id', wid)
          .eq('status', 'completed').is('workshop_confirmed_at', null).order('completed_at', { ascending: false }),
      ]);

      // A receber: mesma regra do Financeiro (só o que veio depois do 1º caixa, ou "pagar depois" combinado)
      const firstOpen = (first.data as { opened_at: string } | null)?.opened_at ?? null;
      const rec = await fetchAll((a, b) => {
        let q = supabase.from('service_orders')
          .select('id, number, title, status, quote_status, price, paid_amount, counter_discount, pay_later_due, completed_at, customer:customers(full_name)')
          .eq('workshop_id', wid).eq('status', 'completed').is('paid_at', null);
        q = firstOpen ? q.or(`pay_later_due.not.is.null,completed_at.gte.${firstOpen}`) : q.not('pay_later_due', 'is', null);
        return q.order('id').range(a, b);
      });

      if (!alive) return;
      setData({
        active: (act.data as unknown as TodayOs[]) ?? [],
        scheduled: (sch.data as Data['scheduled']) ?? [],
        toReceive: receivables((rec.data as unknown as FinOs[]) ?? [], firstOpen),
        entriesToday: (ent.data as FinEntry[]) ?? [],
        lastRegister: (last.data as Data['lastRegister']) ?? null,
        hadRegister: !!firstOpen,
        payables: (pay.data as Payable[]) ?? [],
        checkups: (chk.data as PendingCheckup[]) ?? [],
        reminders: (rem.data as unknown as Reminder[]) ?? [],
        team: (team.data as TeamMember[]) ?? [],
        absences: (abs.data as TeamAbsence[]) ?? [],
        cfg: (cfg.data as ScheduleConfig | null) ?? DEFAULT_SCHEDULE,
        pendingJobs: (jobs.data as PendingJob[]) ?? [],
      });
    })();
    return () => { alive = false; };
  }, [wid, reload]);

  const v = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const today = dayStart(now);
    const todayKey = isoDate(today);
    const att = osAttention(data.active, now);
    const flow = cashFlowOf(data.entriesToday, [], { from: today, to: addDays(today, 1) });
    const dueToday = data.toReceive.rows.filter(r => r.dueIn === 0);
    const reg = data.lastRegister;
    return {
      att,
      workload: openWorkload(data.active),
      team: teamToday(data.team, data.absences, now),
      agendaToday: agendaDay(today, data.cfg, data.scheduled),
      agendaTomorrow: agendaDay(addDays(today, 1), data.cfg, data.scheduled),
      inProgress: data.active.filter(o => o.status === 'in_progress').length,
      receivedToday: flow.received,
      dueToday: { count: dueToday.length, total: dueToday.reduce((a, r) => a + r.open, 0) },
      payablesLate: data.payables.filter(p => p.due_date < todayKey),
      payablesToday: data.payables.filter(p => p.due_date === todayKey),
      awaitingValue: att.awaitingCustomer.reduce((a, o) => a + Number(o.price), 0),
      // Caixa: avisa só se a loja já usa o caixa e hoje ainda não abriu nenhum
      cashClosed: data.hadRegister && !(reg && (reg.status === 'open' || isoDate(new Date(reg.opened_at)) === todayKey)),
    };
  }, [data]);

  const name = (balcao && session ? session.name : profile?.full_name ?? '').split(' ')[0];
  const dateRaw = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateLabel = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1);

  /* ── Pendências: mesmas condições de antes; só viraram linhas com prioridade ── */
  const items: Pending[] = [];
  if (data && v) {
    const toggle = (key: string) => setOpen(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
    const osSub = (o: TodayOs) => [o.title, carOf(o.vehicle), o.customer?.full_name].filter(Boolean).join(' · ');

    if (can('/oficina/dashboard') && data.pendingJobs.length > 0) {
      const n = data.pendingJobs.length;
      items.push({
        key: 'platform', sev: 'urgent', icon: 'check',
        title: n === 1 ? 'Profissional da plataforma terminou o serviço' : `${n} serviços da plataforma terminados`,
        meta: 'Confirme para liberar o pagamento',
        actions: [{ label: 'Confirmar', to: n === 1 ? `/oficina/job/${data.pendingJobs[0].id}/tracking` : '/oficina/dashboard', primary: true }],
        details: n > 1 ? data.pendingJobs.slice(0, 5).map(j => (
          <Row key={j.id} to={`/oficina/job/${j.id}/tracking`} label={j.title} sub={j.completed_at ? `finalizou ${timeAgo(j.completed_at)}` : undefined} />
        )) : undefined,
      });
    }

    const late = v.att.late;
    if (late.length > 0) {
      const one = late.length === 1 ? late[0] : null;
      items.push({
        key: 'late', sev: 'urgent', icon: 'clock',
        title: one ? `OS ${osNumber(one)} passou da hora agendada` : `${late.length} agendamentos passaram da hora`,
        meta: one ? osSub(one) : 'Ainda não começaram',
        actions: [one ? { label: 'Abrir OS', to: `/oficina/os/${one.id}`, primary: true } : { label: 'Abrir agenda', to: '/oficina/agenda', primary: true }],
        details: one ? undefined : late.slice(0, 5).map(o => (
          <Row key={o.id} to={`/oficina/os/${o.id}`} label={`OS ${osNumber(o)} · ${o.title}`}
            sub={`marcado ${new Date(o.scheduled_at!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`} />
        )),
      });
    }

    if (can('/oficina/contas-a-pagar') && data.payables.length > 0) {
      const lateSum = v.payablesLate.reduce((a, p) => a + Number(p.amount), 0);
      const todaySum = v.payablesToday.reduce((a, p) => a + Number(p.amount), 0);
      items.push({
        key: 'payables', sev: v.payablesLate.length > 0 ? 'urgent' : 'important', icon: 'receipt',
        title: v.payablesLate.length > 0
          ? `${fmtBRL(lateSum)} em contas vencidas`
          : `${plural(v.payablesToday.length, 'conta vence hoje', 'contas vencem hoje')} · ${fmtBRL(todaySum)}`,
        meta: [
          v.payablesLate.length > 0 && plural(v.payablesLate.length, 'conta vencida', 'contas vencidas'),
          v.payablesLate.length > 0 && v.payablesToday.length > 0 && `+ ${plural(v.payablesToday.length, 'vence hoje', 'vencem hoje')}`,
        ].filter(Boolean).join(' '),
        actions: [{ label: 'Ver contas', to: '/oficina/contas-a-pagar', primary: true }],
        details: data.payables.slice(0, 5).map(p => (
          <Row key={p.id} to="/oficina/contas-a-pagar" label={p.description} sub={`vence ${fmtDay(p.due_date)}`} right={fmtBRL(p.amount)} />
        )),
      });
    }

    const noResp = v.att.noResponsible;
    if (noResp.length > 0) {
      const one = noResp.length === 1 ? noResp[0] : null;
      const canCall = can('/oficina/dashboard');
      items.push({
        key: 'noresp', sev: 'important', icon: 'user',
        title: one ? `OS ${osNumber(one)} sem responsável` : `${noResp.length} OS sem responsável`,
        meta: one ? osSub(one) : noResp.slice(0, 3).map(o => `OS ${osNumber(o)}`).join(', ') + (noResp.length > 3 ? ` +${noResp.length - 3}` : ''),
        actions: one
          ? [
              { label: 'Definir responsável', onClick: () => setResp({ os: one, platform: false }), primary: true },
              ...(canCall ? [{ label: 'Buscar profissional', onClick: () => setResp({ os: one, platform: true }) }] : []),
            ]
          : [{ label: 'Definir responsáveis', onClick: () => toggle('noresp'), primary: true }],
        details: one ? undefined : noResp.slice(0, 5).map(o => (
          <div key={o.id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2">
            <Link to={`/oficina/os/${o.id}`} className="flex-1 min-w-0 hover:underline">
              <div className="text-sm font-medium text-steel-900 truncate">OS {osNumber(o)} · {o.title}</div>
              <div className="text-xs text-steel-500 truncate">{[carOf(o.vehicle), o.customer?.full_name].filter(Boolean).join(' · ')}</div>
            </Link>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setResp({ os: o, platform: false })} className={`${BTN_SEC} flex-1 sm:flex-none`}>Definir</button>
              {canCall && <button onClick={() => setResp({ os: o, platform: true })} className={`${BTN_GHOST} flex-1 sm:flex-none`}>Buscar profissional</button>}
            </div>
          </div>
        )),
      });
    }

    const stopped = v.att.stopped;
    if (stopped.length > 0) {
      const one = stopped.length === 1 ? stopped[0] : null;
      items.push({
        key: 'stopped', sev: 'important', icon: 'pause',
        title: one ? `OS ${osNumber(one.os)} parada` : `${stopped.length} serviços parados`,
        meta: one ? `${one.pause.reason} · ${timeAgo(one.pause.started_at)}` : stopped.slice(0, 2).map(x => x.pause.reason).join(', '),
        actions: [one ? { label: 'Abrir OS', to: `/oficina/os/${one.os.id}`, primary: true } : { label: 'Ver OS', to: '/oficina/os', primary: true }],
        details: one ? undefined : stopped.slice(0, 5).map(({ os: o, pause }) => (
          <Row key={o.id} to={`/oficina/os/${o.id}`} label={`OS ${osNumber(o)} · ${o.title}`} sub={`${pause.reason} · ${timeAgo(pause.started_at)}`} />
        )),
      });
    }

    const quotes = v.att.awaitingCustomer.length + (can('/oficina/comercial') ? data.checkups.length : 0);
    if (quotes > 0) {
      items.push({
        key: 'quotes', sev: 'important', icon: 'clipboard',
        title: `${plural(quotes, 'orçamento aguardando', 'orçamentos aguardando')} o cliente`,
        meta: v.awaitingValue > 0 ? fmtBRL(v.awaitingValue) : undefined,
        actions: [{ label: 'Ver orçamentos', onClick: () => toggle('quotes'), primary: true }],
        details: [
          ...v.att.awaitingCustomer.slice(0, 5).map(o => (
            <Row key={o.id} to={`/oficina/os/${o.id}`} label={`OS ${osNumber(o)} · ${o.title}`}
              sub={`${o.customer?.full_name ?? 'Sem cliente'}${o.approval_requested_at ? ` · enviado ${timeAgo(o.approval_requested_at)}` : ''}`}
              right={fmtBRL(o.price)} />
          )),
          ...(can('/oficina/comercial') ? data.checkups.slice(0, 5).map(c => (
            <Row key={c.id} to="/oficina/comercial" label={`Check-up · ${c.customer_name ?? c.plate ?? 'cliente'}`} sub={`enviado ${timeAgo(c.quote_sent_at)}`} />
          )) : []),
        ],
      });
    }

    if (can('/oficina/financeiro') && data.toReceive.overdue.length > 0) {
      items.push({
        key: 'receive', sev: 'important', icon: 'wallet',
        title: `${fmtBRL(data.toReceive.overdueTotal)} a receber vencido`,
        meta: plural(data.toReceive.overdue.length, 'OS', 'OS'),
        actions: [{ label: 'Ver a receber', to: '/oficina/financeiro?aba=receber', primary: true }],
        details: data.toReceive.overdue.slice(0, 5).map(r => (
          <Row key={r.os.id} to={`/oficina/os/${r.os.id}`} label={`OS ${osNumber(r.os)} · ${r.os.title}`}
            sub={[r.os.customer?.full_name, r.dueIn != null ? `venceu há ${plural(-r.dueIn, 'dia', 'dias')}` : `concluída há ${plural(r.days, 'dia', 'dias')}`].filter(Boolean).join(' · ')}
            right={fmtBRL(r.open)} />
        )),
      });
    }

    if (can('/oficina/caixa') && v.cashClosed) {
      items.push({
        key: 'cash', sev: 'important', icon: 'lock', title: 'Caixa de hoje ainda fechado',
        actions: [{ label: 'Abrir caixa', to: '/oficina/caixa', primary: true }],
      });
    }

    if (v.att.unconfirmed.length > 0) {
      items.push({
        key: 'unconfirmed', sev: 'info', icon: 'calendar',
        title: `${plural(v.att.unconfirmed.length, 'agendamento', 'agendamentos')} sem confirmação`,
        meta: 'Hoje e amanhã',
        actions: [{ label: 'Confirmar na agenda', to: '/oficina/agenda', primary: true }],
        details: v.att.unconfirmed.slice(0, 5).map(o => (
          <Row key={o.id} to={`/oficina/os/${o.id}`} label={`${o.customer?.full_name ?? 'Sem cliente'} · ${o.title}`}
            sub={new Date(o.scheduled_at!).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} />
        )),
      });
    }

    if (can('/oficina/checkup') && data.reminders.length > 0) {
      items.push({
        key: 'reminders', sev: 'info', icon: 'repeat',
        title: `${plural(data.reminders.length, 'cliente pediu', 'clientes pediram')} para ser lembrado`,
        meta: 'Pedido feito no check-up',
        actions: [{ label: 'Ver', onClick: () => toggle('reminders') }],
        details: data.reminders.slice(0, 5).map(r => (
          <Row key={r.id} to={`/oficina/checkup/${r.checkup.id}`} label={`${r.checkup.customer_name ?? r.checkup.plate ?? 'Cliente'} · ${r.label}`}
            sub={`lembrar em ${fmtDay(r.remind_on)}`} />
        )),
      });
    }
  }
  // Urgente primeiro; dentro do mesmo nível, a ordem acima
  const RANK: Record<Sev, number> = { urgent: 0, important: 1, info: 2 };
  const sorted = items.map((it, i) => ({ it, i })).sort((a, b) => RANK[a.it.sev] - RANK[b.it.sev] || a.i - b.i).map(x => x.it);
  const visible = showAll ? sorted : sorted.slice(0, 3);

  const quotesCount = v ? v.att.awaitingCustomer.length + (data && can('/oficina/comercial') ? data.checkups.length : 0) : 0;
  const shortcutList = [
    can('/oficina/os')       && { label: 'Nova OS',      icon: 'plus' as IconName,     onClick: () => setNewOs({}), primary: true },
    can('/oficina/clientes') && { label: 'Novo cliente', icon: 'user' as IconName,     onClick: () => nav('/oficina/clientes?novo=1') },
    can('/oficina/os')       && { label: 'Agendar',      icon: 'calendar' as IconName, onClick: () => setNewOs({ schedule: true }) },
    can('/oficina/caixa')    && { label: 'Receber',      icon: 'wallet' as IconName,   onClick: () => nav('/oficina/caixa') },
  ].filter((x): x is { label: string; icon: IconName; onClick: () => void; primary?: boolean } => !!x);

  const needReinforcement = !!v && can('/oficina/buscar')
    && (v.att.noResponsible.length > 0 || (v.team.away.length > 0 && v.workload.count > 0));

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* ── Cabeçalho executivo ── */}
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-medium text-steel-500">{dateLabel}</div>
            <h1 className="text-2xl lg:text-[28px] font-bold tracking-tight text-steel-900 leading-tight mt-0.5">
              {greeting()}{name ? `, ${name}` : ''}.
            </h1>
            <p className="text-sm text-steel-600 mt-1">
              {!data ? 'Carregando o dia…'
                : sorted.length === 0 ? <span className="inline-flex items-center gap-1.5 text-signal-700"><Icon name="check" size={16} /> Tudo em dia por aqui.</span>
                : <><strong className="text-steel-900">{plural(sorted.length, 'item precisa', 'itens precisam')}</strong> da sua atenção hoje.</>}
            </p>
          </div>
          {shortcutList.length > 0 && (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 pb-1 lg:pb-0">
              {shortcutList.map(s => (
                <button key={s.label} onClick={s.onClick}
                  className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3.5 h-10 lg:h-9 text-sm font-semibold transition ${
                    s.primary ? 'bg-brand-500 text-white hover:bg-brand-600' : 'bg-white text-steel-700 ring-1 ring-steel-200 hover:ring-steel-300 hover:bg-steel-50'}`}>
                  <Icon name={s.icon} size={16} />{s.label}
                </button>
              ))}
            </div>
          )}
        </header>

        {!data || !v ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-[76px] rounded-xl bg-white ring-1 ring-steel-200/70 animate-pulse" />)}
            </div>
            <div className="h-48 rounded-xl bg-white ring-1 ring-steel-200/70 animate-pulse" />
          </div>
        ) : (
          <>
            {/* ── Resumo rápido ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat to="/oficina/os" icon="wrench" label="Em andamento" value={String(v.inProgress)} muted={v.inProgress === 0} />
              {(can('/oficina/caixa') || can('/oficina/financeiro')) && (
                <Stat to={can('/oficina/caixa') ? '/oficina/caixa' : '/oficina/financeiro'} icon="wallet" label="Recebido hoje"
                  value={fmtBRL(v.receivedToday)} muted={v.receivedToday === 0} tone={v.receivedToday > 0 ? 'good' : undefined} />
              )}
              <Stat to="/oficina/os" icon="clipboard" label="Orçamentos aguardando" value={String(quotesCount)} muted={quotesCount === 0}
                note={v.awaitingValue > 0 ? fmtBRL(v.awaitingValue) : undefined} />
              <Stat to="/oficina/os" icon="user" label="Sem responsável" value={String(v.att.noResponsible.length)}
                tone={v.att.noResponsible.length > 0 ? 'warn' : 'good'} note={v.att.noResponsible.length === 0 ? 'tudo atribuído' : undefined} />
            </div>

            <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
              {/* ── Atenção agora ── */}
              <section className="min-w-0">
                <div className="flex items-center justify-between h-6 mb-2">
                  <h2 className="text-sm font-semibold text-steel-900">Atenção agora</h2>
                  {sorted.length > 3 && (
                    <button onClick={() => setShowAll(s => !s)} className="text-xs font-semibold text-brand-600 hover:underline">
                      {showAll ? 'Mostrar só as principais' : `Ver todas as pendências (${sorted.length})`}
                    </button>
                  )}
                </div>
                {sorted.length === 0 ? (
                  <div className="rounded-xl bg-white ring-1 ring-steel-200/70 px-4 py-5 flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full bg-signal-50 text-signal-600 grid place-items-center"><Icon name="check" size={18} /></span>
                    <div>
                      <div className="font-semibold text-steel-900">Nenhuma pendência agora</div>
                      <div className="text-sm text-steel-500">Quando algo precisar de você, aparece aqui.</div>
                    </div>
                  </div>
                ) : (
                  <ul className="rounded-xl bg-white ring-1 ring-steel-200/70 divide-y divide-steel-100 overflow-hidden">
                    {visible.map(it => (
                      <PendingRow key={it.key} item={it} expanded={open.has(it.key)}
                        onToggle={() => setOpen(prev => { const n = new Set(prev); if (n.has(it.key)) n.delete(it.key); else n.add(it.key); return n; })} />
                    ))}
                  </ul>
                )}
              </section>

              {/* ── Coluna lateral: hoje + equipe ── */}
              <aside className="space-y-5 min-w-0">
                <section>
                  <h2 className="flex items-center h-6 mb-2 text-sm font-semibold text-steel-900">Hoje na oficina</h2>
                  <div className="rounded-xl bg-white ring-1 ring-steel-200/70 divide-y divide-steel-100">
                    {can('/oficina/agenda') && (
                      <Line to="/oficina/agenda" icon="calendar" label="Agendados hoje"
                        value={String(v.agendaToday.booked)} muted={v.agendaToday.booked === 0}
                        note={[
                          v.agendaToday.booked > 0 && v.agendaToday.capacity ? `${v.agendaToday.booked} de ${v.agendaToday.capacity} vagas` : null,
                          v.agendaTomorrow.booked > 0 ? `amanhã: ${v.agendaTomorrow.booked}` : null,
                        ].filter(Boolean).join(' · ') || undefined} />
                    )}
                    {can('/oficina/financeiro') && (
                      <Line to="/oficina/financeiro?aba=receber" icon="wallet" label="A receber hoje" value={fmtBRL(v.dueToday.total)}
                        muted={v.dueToday.count === 0} note={v.dueToday.count > 0 ? plural(v.dueToday.count, 'OS combinada', 'OS combinadas') : undefined} />
                    )}
                    {can('/oficina/contas-a-pagar') && (
                      <Line to="/oficina/contas-a-pagar" icon="receipt" label="Contas de hoje"
                        value={fmtBRL(v.payablesToday.reduce((a, p) => a + Number(p.amount), 0))} muted={v.payablesToday.length === 0}
                        note={v.payablesToday.length > 0 ? plural(v.payablesToday.length, 'conta', 'contas') : undefined} />
                    )}
                  </div>
                </section>

                {can('/oficina/equipe') && (
                  <section>
                    <h2 className="flex items-center h-6 mb-2 text-sm font-semibold text-steel-900">Equipe</h2>
                    <div className="rounded-xl bg-white ring-1 ring-steel-200/70 p-4">
                      {v.team.total === 0 ? (
                        <p className="text-sm text-steel-500">
                          Cadastre a equipe em <Link to="/oficina/equipe" className="text-brand-600 hover:underline">Colaboradores</Link>.
                        </p>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold text-steel-900 tabular-nums">{v.team.working}<span className="text-steel-400 font-semibold"> / {v.team.total}</span></span>
                            <span className="text-sm text-steel-600">disponíveis hoje</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-steel-100 mt-2 overflow-hidden">
                            <div className="h-full rounded-full bg-signal-500" style={{ width: `${Math.round((v.team.working / Math.max(1, v.team.total)) * 100)}%` }} />
                          </div>
                          {(v.team.away.length > 0 || v.att.noResponsible.length > 0) && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {v.team.away.length > 0 && (
                                <span className="inline-flex items-center rounded-md bg-steel-100 px-2 py-0.5 text-xs font-medium text-steel-700">
                                  {plural(v.team.away.length, 'afastado', 'afastados')}
                                </span>
                              )}
                              {v.att.noResponsible.length > 0 && (
                                <span className="inline-flex items-center rounded-md bg-pending-50 px-2 py-0.5 text-xs font-medium text-pending-700">
                                  {plural(v.att.noResponsible.length, 'OS sem responsável', 'OS sem responsável')}
                                </span>
                              )}
                            </div>
                          )}

                          <button onClick={() => setShowCap(c => !c)} aria-expanded={showCap}
                            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-steel-500 hover:text-steel-800">
                            {showCap ? 'Ocultar capacidade' : 'Ver capacidade'}
                            <Icon name="chevron" size={14} className={`transition-transform ${showCap ? 'rotate-180' : ''}`} />
                          </button>
                          {showCap && (
                            <dl className="mt-2 pt-2 border-t border-steel-100 space-y-1.5 text-sm">
                              {v.team.away.length > 0 && (
                                <Fact label="Afastados"
                                  value={v.team.away.map(a => a.name.split(' ')[0] + (a.reason ? ` · ${ABSENCE_REASONS[a.reason].label}` : '')).join(', ')} />
                              )}
                              {v.team.dayOff > 0 && <Fact label="De folga" value={String(v.team.dayOff)} />}
                              <Fact label="Serviço em aberto"
                                value={v.workload.count === 0 ? 'nenhum'
                                  : v.workload.hours === 0 ? `${plural(v.workload.count, 'OS', 'OS')} sem estimativa`
                                  : `~${String(Math.round(v.workload.hours * 10) / 10).replace('.', ',')} h · ${plural(v.workload.count, 'OS', 'OS')}`} />
                              {v.workload.hours > 0 && v.workload.withoutEstimate > 0 && (
                                <Fact label="Sem estimativa" value={plural(v.workload.withoutEstimate, 'OS', 'OS')} />
                              )}
                              {v.agendaToday.booked > 0 && v.agendaToday.pct != null && (
                                <Fact label="Agenda de hoje" value={`${v.agendaToday.pct}% ocupada`} />
                              )}
                              {v.team.withoutSchedule > 0 && (
                                <p className="text-[11px] text-steel-400 pt-1">{plural(v.team.withoutSchedule, 'pessoa sem jornada cadastrada', 'pessoas sem jornada cadastrada')}, contadas como disponíveis.</p>
                              )}
                            </dl>
                          )}
                        </>
                      )}

                      {/* Reforço: só com necessidade concreta */}
                      {needReinforcement && (
                        <div className="mt-3 pt-3 border-t border-steel-100">
                          <p className="text-xs text-steel-500 mb-2">Precisa de reforço? Um profissional da rede pode ajudar.</p>
                          <button
                            onClick={() => (v.att.noResponsible.length === 1 ? setResp({ os: v.att.noResponsible[0], platform: true }) : nav('/oficina/buscar'))}
                            className={`${BTN_PRI} w-full gap-1.5`}>
                            <Icon name="search" size={16} /> Buscar reforço
                          </button>
                        </div>
                      )}
                    </div>
                  </section>
                )}
              </aside>
            </div>
          </>
        )}
      </div>

      {/* Mesmo fluxo da tela de OS: define o responsável e, se for da plataforma, chama o mecânico */}
      {resp && wid && (
        <ResponsibleModal wid={wid} team={data?.team ?? []} current={resp.platform ? PLATFORM : ''}
          os={{ id: resp.os.id, number: resp.os.number, title: resp.os.title, vehicle: resp.os.vehicle }}
          onClose={() => setResp(null)} onSaved={() => setReload(n => n + 1)} />
      )}

      {/* Mesma abertura de OS da tela de OS */}
      {newOs && wid && (
        <NewOsModal
          workshopId={wid}
          preset={newOs}
          onClose={() => setNewOs(null)}
          onManageTeam={() => { setNewOs(null); nav('/oficina/equipe'); }}
          onCreated={(id, number, isCheckup) => {
            setNewOs(null);
            const n = String(number ?? '').padStart(4, '0');
            if (isCheckup) {
              toast.success(`OS nº ${n} aberta ✓ — faça o check-up`);
              nav(`/oficina/checkup?os=${id}`);
            } else {
              toast.success(`OS nº ${n} aberta ✓ — lance as peças e serviços`);
              nav(`/oficina/os/${id}`);
            }
          }}
        />
      )}
    </WorkshopLayout>
  );
}

/* ── Peças da tela ── */

type Sev = 'urgent' | 'important' | 'info';
type PendingAction = { label: string; to?: string; onClick?: () => void; primary?: boolean };
type Pending = { key: string; sev: Sev; icon: IconName; title: string; meta?: string; actions: PendingAction[]; details?: ReactNode };

/** Laranja = ação · vermelho = urgente · amarelo = importante · cinza = informativo · verde = em dia */
const SEV: Record<Sev, { icon: string; bar: string }> = {
  urgent:    { icon: 'bg-alert-50 text-alert-600',     bar: 'bg-alert-500' },
  important: { icon: 'bg-pending-50 text-pending-700', bar: 'bg-pending-400' },
  info:      { icon: 'bg-steel-100 text-steel-500',    bar: 'bg-transparent' },
};
const BTN_PRI = 'inline-flex items-center justify-center rounded-lg bg-brand-500 text-white px-3.5 h-10 sm:h-8 text-sm font-semibold hover:bg-brand-600 transition';
const BTN_SEC = 'inline-flex items-center justify-center rounded-lg bg-white text-steel-700 ring-1 ring-steel-200 px-3.5 h-10 sm:h-8 text-sm font-semibold hover:bg-steel-50 transition';
const BTN_GHOST = 'inline-flex items-center justify-center rounded-lg text-steel-600 px-3 h-10 sm:h-8 text-sm font-semibold hover:bg-steel-100 transition';

function PendingRow({ item, expanded, onToggle }: { item: Pending; expanded: boolean; onToggle: () => void }) {
  const s = SEV[item.sev];
  return (
    <li className="relative">
      <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${s.bar}`} aria-hidden />
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${s.icon}`}><Icon name={item.icon} size={16} /></span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-steel-900 truncate">{item.title}</div>
            {item.meta && <div className="text-xs text-steel-500 truncate">{item.meta}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {item.actions.map(a => {
            const cls = `${a.primary ? BTN_PRI : BTN_SEC} flex-1 sm:flex-none ${a.primary ? 'sm:min-w-[132px]' : ''}`;
            return a.to
              ? <Link key={a.label} to={a.to} className={cls}>{a.label}</Link>
              : <button key={a.label} onClick={a.onClick} className={cls}>{a.label}</button>;
          })}
          {!item.details && <span className="hidden sm:block w-8 shrink-0" aria-hidden />}
          {item.details && (
            <button onClick={onToggle} aria-expanded={expanded} aria-label={expanded ? 'Recolher' : 'Ver detalhes'}
              className="h-10 w-10 sm:h-8 sm:w-8 shrink-0 grid place-items-center rounded-lg text-steel-400 hover:text-steel-700 hover:bg-steel-100 transition">
              <Icon name="chevron" size={16} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>
      {expanded && item.details && <div className="px-4 pb-3 sm:pl-[60px] divide-y divide-steel-100">{item.details}</div>}
    </li>
  );
}

function Row({ to, label, sub, right }: { to: string; label: string; sub?: string; right?: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 py-2 hover:bg-steel-50 -mx-2 px-2 rounded-lg">
      <div className="min-w-0">
        <div className="text-sm font-medium text-steel-900 truncate">{label}</div>
        {sub && <div className="text-xs text-steel-500 truncate">{sub}</div>}
      </div>
      {right && <div className="text-sm font-semibold text-steel-900 shrink-0 tabular-nums">{right}</div>}
    </Link>
  );
}

/** Número do resumo rápido */
function Stat({ to, icon, label, value, note, muted = false, tone }: {
  to: string; icon: IconName; label: string; value: string; note?: string; muted?: boolean; tone?: 'good' | 'warn';
}) {
  const valueCls = tone === 'warn' ? 'text-pending-700' : tone === 'good' && !muted ? 'text-signal-700' : muted ? 'text-steel-300' : 'text-steel-900';
  return (
    <Link to={to} className="group flex flex-col justify-between min-h-[88px] rounded-xl bg-white ring-1 ring-steel-200/70 hover:ring-steel-300 px-4 py-3 transition">
      <div className="flex items-center gap-1.5 text-xs font-medium text-steel-500">
        <Icon name={icon} size={14} className="text-steel-400" />
        <span className="truncate">{label}</span>
      </div>
      <div>
        <div className={`text-xl lg:text-2xl font-bold tracking-tight tabular-nums truncate ${valueCls}`}>{value}</div>
        <div className="text-[11px] text-steel-500 truncate h-4">{note}</div>
      </div>
    </Link>
  );
}

/** Linha de "Hoje na oficina" */
function Line({ to, icon, label, value, note, muted = false }: {
  to: string; icon: IconName; label: string; value: string; note?: string; muted?: boolean;
}) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 min-h-[60px] py-2.5 hover:bg-steel-50 transition first:rounded-t-xl last:rounded-b-xl">
      <span className="h-8 w-8 rounded-lg bg-steel-100 text-steel-500 grid place-items-center shrink-0"><Icon name={icon} size={16} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-steel-800 truncate">{label}</div>
        {note && <div className="text-[11px] text-steel-500 truncate">{note}</div>}
      </div>
      <div className={`text-base font-bold tabular-nums ${muted ? 'text-steel-300' : 'text-steel-900'}`}>{value}</div>
    </Link>
  );
}

function Fact({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-steel-500">{label}</dt>
      <dd className={`font-medium text-right truncate ${warn ? 'text-pending-700' : 'text-steel-800'}`}>{value}</dd>
    </div>
  );
}
