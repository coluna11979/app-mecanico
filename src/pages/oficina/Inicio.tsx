import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll } from '@/lib/fetchAll';
import { toast } from '@/components/ui/Toast';
import { sessionAllows, useOperator } from '@/lib/operators';
import { fmtBRL, osNumber } from '@/components/os/osHelpers';
import NewOsModal, { type NewOsPreset } from '@/components/os/NewOsModal';
import { PLATFORM, ResponsibleModal } from '@/components/cash/ResponsiblePicker';
import { DEFAULT_SCHEDULE, addDays, type ScheduleConfig } from '@/lib/agenda';
import { cashFlowOf, receivables, type FinEntry, type FinOs } from '@/lib/finance';
import { timeAgo } from '@/lib/relativeTime';
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

  // Cada bloco só aparece para quem pode abrir a tela de destino (no modo balcão, pela função/permissões)
  const can = (path: string) => !balcao || !session || sessionAllows(session, path);

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

  // Algum alerta visível? (senão mostra "Tudo em dia")
  const anyAttention = !!data && !!v && (
    (can('/oficina/dashboard') && data.pendingJobs.length > 0)
    || v.att.noResponsible.length > 0 || v.att.late.length > 0 || v.att.stopped.length > 0
    || v.att.awaitingCustomer.length > 0 || (can('/oficina/comercial') && data.checkups.length > 0)
    || v.att.unconfirmed.length > 0 || (can('/oficina/checkup') && data.reminders.length > 0)
    || (can('/oficina/financeiro') && data.toReceive.overdue.length > 0)
    || (can('/oficina/contas-a-pagar') && data.payables.length > 0)
    || (can('/oficina/caixa') && v.cashClosed));

  const name = (balcao && session ? session.name : profile?.full_name ?? '').split(' ')[0];
  const dateRaw = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const dateLabel = dateRaw.charAt(0).toUpperCase() + dateRaw.slice(1);

  const shortcuts = (
    <Shortcuts items={[
      can('/oficina/os')        && { label: '+ Nova OS',      onClick: () => setNewOs({}) },
      can('/oficina/clientes')  && { label: '+ Novo cliente', onClick: () => nav('/oficina/clientes?novo=1') },
      can('/oficina/os')        && { label: '+ Agendar',      onClick: () => setNewOs({ schedule: true }) },
      can('/oficina/caixa')     && { label: '💰 Receber',     onClick: () => nav('/oficina/caixa') },
      can('/oficina/dashboard') && { label: '+ Nova demanda', onClick: () => nav('/oficina/dashboard?nova=1') },
    ]} />
  );

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Saudação */}
        <div>
          <div className="text-sm text-steel-500">{dateLabel}</div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">{greeting()}{name ? `, ${name}` : ''}.</h1>
          <p className="text-steel-600 mt-1">Veja o que precisa da sua atenção hoje.</p>
        </div>

        <div className="lg:hidden">{shortcuts}</div>

        {!data || !v ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <>
            {/* ── Precisa da sua atenção ── */}
            <section>
              <SectionTitle>Precisa da sua atenção</SectionTitle>
              <div className="space-y-3">
                {can('/oficina/dashboard') && data.pendingJobs.length > 0 && (
                  <Attention tone="urgent" icon="✅"
                    title={data.pendingJobs.length === 1
                      ? 'Mecânico da plataforma terminou — confirme a conclusão'
                      : `${data.pendingJobs.length} serviços da plataforma aguardando sua confirmação`}
                    hint="O mecânico está esperando a confirmação para receber."
                    actions={[{ label: 'Confirmar', to: data.pendingJobs.length === 1 ? `/oficina/job/${data.pendingJobs[0].id}/tracking` : '/oficina/dashboard', primary: true }]}>
                    {data.pendingJobs.slice(0, 3).map(j => (
                      <Row key={j.id} to={`/oficina/job/${j.id}/tracking`} label={j.title}
                        sub={j.completed_at ? `finalizou ${timeAgo(j.completed_at)}` : undefined} />
                    ))}
                  </Attention>
                )}

                {v.att.noResponsible.length > 0 && (
                  <Attention tone="warn" icon="👷"
                    title={`${plural(v.att.noResponsible.length, 'OS sem responsável', 'OS sem responsável')}`}
                    hint="Defina quem da equipe vai fazer. Se ninguém puder, chame um profissional da rede."
                    actions={[{ label: 'Ver OS', to: '/oficina/os' }]}>
                    {v.att.noResponsible.slice(0, 3).map(o => (
                      <div key={o.id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-2">
                        <Link to={`/oficina/os/${o.id}`} className="flex-1 min-w-0 hover:underline">
                          <div className="text-sm font-semibold truncate">OS {osNumber(o)} · {o.title}</div>
                          <div className="text-xs text-steel-500 truncate">{[carOf(o.vehicle), o.customer?.full_name].filter(Boolean).join(' · ')}</div>
                        </Link>
                        <div className="flex gap-2 shrink-0">
                          <button onClick={() => setResp({ os: o, platform: false })} className="btn-secondary !py-1.5 !px-3 text-xs flex-1 sm:flex-none">Definir responsável</button>
                          {can('/oficina/dashboard') && (
                            <button onClick={() => setResp({ os: o, platform: true })} className="btn-ghost !py-1.5 !px-3 text-xs flex-1 sm:flex-none">Chamar da plataforma</button>
                          )}
                        </div>
                      </div>
                    ))}
                    <More n={v.att.noResponsible.length - 3} to="/oficina/os" />
                  </Attention>
                )}

                {v.att.late.length > 0 && (
                  <Attention tone="warn" icon="⏰"
                    title={v.att.late.length === 1 ? '1 agendamento passou da hora e não começou' : `${v.att.late.length} agendamentos passaram da hora e não começaram`}
                    actions={[{ label: 'Abrir agenda', to: '/oficina/agenda' }]}>
                    {v.att.late.slice(0, 3).map(o => (
                      <Row key={o.id} to={`/oficina/os/${o.id}`} label={`OS ${osNumber(o)} · ${o.title}`}
                        sub={`marcado ${new Date(o.scheduled_at!).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${o.customer?.full_name ? ` · ${o.customer.full_name}` : ''}`} />
                    ))}
                    <More n={v.att.late.length - 3} to="/oficina/agenda" />
                  </Attention>
                )}

                {v.att.stopped.length > 0 && (
                  <Attention tone="warn" icon="⏸️"
                    title={v.att.stopped.length === 1 ? '1 serviço parado' : `${v.att.stopped.length} serviços parados`}
                    actions={[{ label: 'Ver OS', to: '/oficina/os' }]}>
                    {v.att.stopped.slice(0, 3).map(({ os: o, pause }) => (
                      <Row key={o.id} to={`/oficina/os/${o.id}`} label={`OS ${osNumber(o)} · ${o.title}`}
                        sub={`${pause.reason} · ${timeAgo(pause.started_at)}`} />
                    ))}
                    <More n={v.att.stopped.length - 3} to="/oficina/os" />
                  </Attention>
                )}

                {(v.att.awaitingCustomer.length > 0 || (can('/oficina/comercial') && data.checkups.length > 0)) && (
                  <Attention tone="info" icon="📞"
                    title={`${plural(v.att.awaitingCustomer.length + (can('/oficina/comercial') ? data.checkups.length : 0), 'orçamento esperando o cliente', 'orçamentos esperando o cliente')}`
                      + (v.awaitingValue > 0 ? ` · ${fmtBRL(v.awaitingValue)}` : '')}
                    hint="Vale um lembrete para não esfriar."
                    actions={can('/oficina/comercial') && data.checkups.length > 0 ? [{ label: 'Ver no Comercial', to: '/oficina/comercial' }] : []}>
                    {v.att.awaitingCustomer.slice(0, 3).map(o => (
                      <Row key={o.id} to={`/oficina/os/${o.id}`} label={`OS ${osNumber(o)} · ${o.title}`}
                        sub={`${o.customer?.full_name ?? 'Sem cliente'}${o.approval_requested_at ? ` · enviado ${timeAgo(o.approval_requested_at)}` : ''}`}
                        right={fmtBRL(o.price)} />
                    ))}
                    {can('/oficina/comercial') && data.checkups.slice(0, Math.max(0, 3 - v.att.awaitingCustomer.length)).map(c => (
                      <Row key={c.id} to="/oficina/comercial" label={`Check-up · ${c.customer_name ?? c.plate ?? 'cliente'}`}
                        sub={`orçamento enviado ${timeAgo(c.quote_sent_at)}`} />
                    ))}
                  </Attention>
                )}

                {v.att.unconfirmed.length > 0 && (
                  <Attention tone="info" icon="📅"
                    title={v.att.unconfirmed.length === 1 ? '1 agendamento de hoje/amanhã sem confirmação' : `${v.att.unconfirmed.length} agendamentos de hoje/amanhã sem confirmação`}
                    hint="Confirme com o cliente para evitar faltas."
                    actions={[{ label: 'Confirmar na agenda', to: '/oficina/agenda', primary: true }]}>
                    {v.att.unconfirmed.slice(0, 3).map(o => (
                      <Row key={o.id} to={`/oficina/os/${o.id}`} label={`${o.customer?.full_name ?? 'Sem cliente'} · ${o.title}`}
                        sub={new Date(o.scheduled_at!).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} />
                    ))}
                  </Attention>
                )}

                {can('/oficina/checkup') && data.reminders.length > 0 && (
                  <Attention tone="info" icon="🔁"
                    title={`${plural(data.reminders.length, 'item que o cliente pediu para lembrar', 'itens que os clientes pediram para lembrar')}`}
                    hint="No check-up, o cliente escolheu “me lembre depois” — chegou a data.">
                    {data.reminders.slice(0, 3).map(r => (
                      <Row key={r.id} to={`/oficina/checkup/${r.checkup.id}`} label={`${r.checkup.customer_name ?? r.checkup.plate ?? 'Cliente'} · ${r.label}`}
                        sub={`lembrar em ${fmtDay(r.remind_on)}`} />
                    ))}
                    <More n={data.reminders.length - 3} to="/oficina/checkup" />
                  </Attention>
                )}

                {can('/oficina/financeiro') && data.toReceive.overdue.length > 0 && (
                  <Attention tone="money" icon="💸"
                    title={`${fmtBRL(data.toReceive.overdueTotal)} a receber vencido · ${plural(data.toReceive.overdue.length, 'OS', 'OS')}`}
                    actions={[{ label: 'Ver a receber', to: '/oficina/financeiro?aba=receber', primary: true }]}>
                    {data.toReceive.overdue.slice(0, 3).map(r => (
                      <Row key={r.os.id} to={`/oficina/os/${r.os.id}`} label={`OS ${osNumber(r.os)} · ${r.os.title}`}
                        sub={[r.os.customer?.full_name, r.dueIn != null ? `venceu há ${plural(-r.dueIn, 'dia', 'dias')}` : `concluída há ${plural(r.days, 'dia', 'dias')}`].filter(Boolean).join(' · ')}
                        right={fmtBRL(r.open)} />
                    ))}
                    <More n={data.toReceive.overdue.length - 3} to="/oficina/financeiro?aba=receber" />
                  </Attention>
                )}

                {can('/oficina/contas-a-pagar') && (v.payablesLate.length > 0 || v.payablesToday.length > 0) && (
                  <Attention tone="money" icon="📤"
                    title={[
                      v.payablesLate.length > 0 && `${plural(v.payablesLate.length, 'conta vencida', 'contas vencidas')}`,
                      v.payablesToday.length > 0 && `${plural(v.payablesToday.length, 'conta vence hoje', 'contas vencem hoje')}`,
                    ].filter(Boolean).join(' · ') + ` · ${fmtBRL(data.payables.reduce((a, p) => a + Number(p.amount), 0))}`}
                    actions={[{ label: 'Pagar', to: '/oficina/contas-a-pagar', primary: true }]}>
                    {data.payables.slice(0, 3).map(p => (
                      <Row key={p.id} to="/oficina/contas-a-pagar" label={p.description}
                        sub={`vence ${fmtDay(p.due_date)}`} right={fmtBRL(p.amount)} />
                    ))}
                  </Attention>
                )}

                {can('/oficina/caixa') && v.cashClosed && (
                  <Attention tone="money" icon="💰" title="O caixa de hoje ainda não foi aberto"
                    actions={[{ label: 'Abrir caixa', to: '/oficina/caixa', primary: true }]} />
                )}

                {!anyAttention && (
                  <div className="card text-center py-8">
                    <div className="text-3xl">✅</div>
                    <div className="font-bold mt-2">Tudo em dia por aqui.</div>
                    <div className="text-sm text-steel-500">Nenhuma pendência no momento.</div>
                  </div>
                )}
              </div>
            </section>

            {/* ── Hoje na oficina ── */}
            <section>
              <SectionTitle>Hoje na oficina</SectionTitle>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {can('/oficina/agenda') && (
                  <Tile to="/oficina/agenda" label="Agendados hoje" value={String(v.agendaToday.booked)}
                    note={v.agendaToday.booked > 0 && v.agendaToday.capacity ? `${v.agendaToday.booked} de ${v.agendaToday.capacity} vagas` : undefined} />
                )}
                <Tile to="/oficina/os" label="Em andamento" value={String(v.inProgress)} />
                {(can('/oficina/caixa') || can('/oficina/financeiro')) && (
                  <Tile to={can('/oficina/caixa') ? '/oficina/caixa' : '/oficina/financeiro'} label="Recebido hoje" value={fmtBRL(v.receivedToday)} />
                )}
                {can('/oficina/financeiro') && v.dueToday.count > 0 && (
                  <Tile to="/oficina/financeiro?aba=receber" label="A receber hoje" value={fmtBRL(v.dueToday.total)}
                    note={plural(v.dueToday.count, 'OS combinada', 'OS combinadas')} />
                )}
              </div>
            </section>

            {/* ── Equipe hoje ── */}
            {can('/oficina/equipe') && (
              <section>
                <SectionTitle>Equipe hoje</SectionTitle>
                <div className="card space-y-3">
                  {v.team.total === 0 ? (
                    <p className="text-sm text-steel-500">
                      Cadastre sua equipe em <Link to="/oficina/equipe" className="text-brand-600 hover:underline">Colaboradores</Link> para ver quem está trabalhando.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-2xl font-bold font-display">{v.team.working} de {v.team.total}</span>
                        <span className="text-steel-600">trabalhando hoje</span>
                        {v.team.dayOff > 0 && <span className="text-sm text-steel-500">· {plural(v.team.dayOff, 'de folga', 'de folga')}</span>}
                        {v.team.away.length > 0 && <span className="text-sm text-steel-500">· {plural(v.team.away.length, 'afastado', 'afastados')}</span>}
                      </div>
                      {v.team.away.length > 0 && (
                        <ul className="text-sm space-y-1">
                          {v.team.away.map(a => (
                            <li key={a.id} className="text-steel-600">
                              {a.reason ? ABSENCE_REASONS[a.reason].icon : '⏸️'} <strong className="text-steel-800">{a.name}</strong>
                              {a.reason && ` · ${ABSENCE_REASONS[a.reason].label}`}
                              {a.expected_return && ` · volta ${fmtDay(a.expected_return)}`}
                            </li>
                          ))}
                        </ul>
                      )}
                      {v.team.withoutSchedule > 0 && (
                        <p className="text-xs text-steel-400">
                          {plural(v.team.withoutSchedule, 'colaborador sem jornada cadastrada', 'colaboradores sem jornada cadastrada')} (contado como trabalhando).
                        </p>
                      )}
                    </>
                  )}

                  <div className="grid sm:grid-cols-2 gap-2 pt-3 border-t border-steel-100 text-sm">
                    <Fact label="Serviço em aberto"
                      value={v.workload.count === 0 ? 'nenhum'
                        : v.workload.hours === 0 ? `${plural(v.workload.count, 'OS', 'OS')} (sem estimativa)`
                        : `~${String(Math.round(v.workload.hours * 10) / 10).replace('.', ',')} h estimadas · ${plural(v.workload.count, 'OS', 'OS')}`} />
                    {v.workload.hours > 0 && v.workload.withoutEstimate > 0 && <Fact label="Sem tempo estimado" value={plural(v.workload.withoutEstimate, 'OS', 'OS')} />}
                    <Fact label="Sem responsável" value={v.att.noResponsible.length ? plural(v.att.noResponsible.length, 'OS', 'OS') : 'nenhuma'}
                      warn={v.att.noResponsible.length > 0} />
                    {/* Agenda: só quando há agendamentos, senão "0% ocupada" engana */}
                    {v.agendaToday.booked > 0 && v.agendaToday.pct != null && (
                      <Fact label="Agenda de hoje" value={`${v.agendaToday.booked} de ${v.agendaToday.capacity} vagas (${v.agendaToday.pct}%)`} />
                    )}
                    {v.agendaTomorrow.booked > 0 && v.agendaTomorrow.pct != null && (
                      <Fact label="Agenda de amanhã" value={`${v.agendaTomorrow.booked} de ${v.agendaTomorrow.capacity} vagas (${v.agendaTomorrow.pct}%)`} />
                    )}
                  </div>

                  {/* Reforço: só com necessidade concreta (OS sem ninguém, ou equipe desfalcada com serviço em aberto) */}
                  {can('/oficina/buscar') && (v.att.noResponsible.length > 0 || (v.team.away.length > 0 && v.workload.count > 0)) && (
                    <div className="rounded-xl bg-brand-50 border border-brand-100 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 text-sm text-steel-700">
                        <strong className="text-steel-900">Precisa de reforço?</strong>{' '}
                        {v.att.noResponsible.length > 0
                          ? `${plural(v.att.noResponsible.length, 'serviço está', 'serviços estão')} sem ninguém da equipe. Se não der conta, um profissional da rede pode fazer.`
                          : `Equipe desfalcada hoje e ${plural(v.workload.count, 'OS', 'OS')} em aberto. Se não der conta, um profissional da rede pode ajudar.`}
                      </div>
                      <button
                        onClick={() => (v.att.noResponsible.length === 1
                          ? setResp({ os: v.att.noResponsible[0], platform: true })
                          : nav('/oficina/buscar'))}
                        className="btn-primary shrink-0"
                      >
                        Buscar profissional
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="hidden lg:block">
              <SectionTitle>Atalhos</SectionTitle>
              {shortcuts}
            </section>
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

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[11px] font-bold text-steel-500 uppercase tracking-widest mb-2">{children}</h2>;
}

type Action = { label: string; to: string; primary?: boolean };
const TONE = {
  urgent: 'border-l-signal-500',
  warn:   'border-l-pending-500',
  info:   'border-l-brand-500',
  money:  'border-l-steel-400',
} as const;

function Attention({ tone, icon, title, hint, actions = [], children }: {
  tone: keyof typeof TONE; icon: string; title: string; hint?: string; actions?: Action[]; children?: ReactNode;
}) {
  return (
    <div className={`card !p-4 border-l-4 ${TONE[tone]}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-xl leading-none mt-0.5">{icon}</span>
          <div className="min-w-0">
            <div className="font-bold text-steel-900">{title}</div>
            {hint && <div className="text-sm text-steel-500 mt-0.5">{hint}</div>}
          </div>
        </div>
        {actions.length > 0 && (
          <div className="flex gap-2 shrink-0">
            {actions.map(a => (
              <Link key={a.label} to={a.to}
                className={`${a.primary ? 'btn-primary' : 'btn-secondary'} !py-2 !px-4 text-sm flex-1 sm:flex-none text-center`}>
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
      {children && <div className="mt-2 sm:ml-8 divide-y divide-steel-100">{children}</div>}
    </div>
  );
}

function Row({ to, label, sub, right }: { to: string; label: string; sub?: string; right?: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 py-2 hover:bg-steel-50 -mx-2 px-2 rounded-lg">
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{label}</div>
        {sub && <div className="text-xs text-steel-500 truncate">{sub}</div>}
      </div>
      {right && <div className="text-sm font-bold shrink-0">{right}</div>}
    </Link>
  );
}

function More({ n, to }: { n: number; to: string }) {
  if (n <= 0) return null;
  return <Link to={to} className="block py-2 text-xs font-semibold text-brand-600 hover:underline">+ {n} mais</Link>;
}

function Tile({ to, label, value, note }: { to: string; label: string; value: string; note?: string }) {
  return (
    <Link to={to} className="card !p-4 hover:shadow-md transition">
      <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">{label}</div>
      <div className={`text-2xl font-bold font-display mt-1 truncate ${/^(R\$\s*)?0(,00)?$/.test(value) ? 'text-steel-300' : ''}`}>{value}</div>
      {note && <div className="text-xs text-steel-500 mt-0.5">{note}</div>}
    </Link>
  );
}

function Fact({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-3 rounded-lg bg-steel-50 px-3 py-2">
      <span className="text-steel-600">{label}</span>
      <span className={`font-semibold text-right ${warn ? 'text-pending-700' : 'text-steel-900'}`}>{value}</span>
    </div>
  );
}

function Shortcuts({ items }: { items: (false | { label: string; onClick: () => void })[] }) {
  const list = items.filter((i): i is { label: string; onClick: () => void } => !!i);
  if (!list.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap pb-1">
      {list.map(i => (
        <button key={i.label} onClick={i.onClick}
          className="shrink-0 rounded-xl border border-steel-200 bg-white px-4 py-2.5 text-sm font-semibold text-steel-800 hover:border-brand-300 hover:bg-brand-50 transition">
          {i.label}
        </button>
      ))}
    </div>
  );
}
