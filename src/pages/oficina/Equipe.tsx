import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import TeamTabs from '@/components/team/TeamTabs';
import AbsenceReport from '@/components/team/AbsenceReport';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fmtBRL, osNumber } from '@/components/os/osHelpers';
import {
  ABSENCE_REASONS, DAY_STATE, TEAM_STATUS, absenceToday, dayState, expiryState, fmtDay, isoToday, returnStatus,
  type Absence, type DayState,
} from '@/lib/team';
import { useTeamAccess } from '@/lib/teamAccess';
import { currentHalf, halfLabel, loadCommissionHalf, shiftHalf } from '@/lib/commissionClosing';
import { loadPayroll } from '@/lib/payroll';
import { addMonthsCompetence, fmtCompetence } from '@/lib/payableForms';
import type { MechanicCertification, TeamStatus, WorkshopMechanic } from '@/types/database';
import type { WorkshopOperator } from '@/lib/operators';

/** OS que ainda precisam de alguém: aberta, aguardando aprovação, aprovada ou em andamento */
const OPEN_STATUSES = ['open', 'awaiting_approval', 'approved', 'in_progress'];
/** Sem responsável só conta o que já é trabalho (orçamento com o cliente não precisa de mecânico ainda) */
const WORK_STATUSES = ['open', 'approved', 'in_progress'];

type OpenOs = {
  id: string; number: number | null; title: string; status: string; executor: string | null;
  workshop_mechanic_id: string | null; scheduled_at: string | null; started_at: string | null;
  vehicle: { plate: string | null } | null;
};

type Alert = { key: string; icon: string; tone: 'alert' | 'pending' | 'info'; text: React.ReactNode; actions: { label: string; to: string }[] };

type Filter = 'active' | 'terminated' | 'all';

const when = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date(); const y = new Date(); y.setDate(y.getDate() - 1);
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `hoje ${hm}`;
  if (d.toDateString() === y.toDateString()) return `ontem ${hm}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

export default function Equipe() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const access = useTeamAccess();

  const [list, setList]         = useState<WorkshopMechanic[]>([]);
  const [certs, setCerts]       = useState<MechanicCertification[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [openOs, setOpenOs]     = useState<OpenOs[]>([]);
  const [lastAt, setLastAt]     = useState<Record<string, string>>({});
  const [photos, setPhotos]     = useState<Record<string, string>>({});
  const [payAlerts, setPayAlerts] = useState<Alert[]>([]);
  const [accessAlerts, setAccessAlerts] = useState<Alert[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<Filter>('active');
  const [q, setQ]               = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [now, setNow]           = useState(() => new Date());

  // Status do dia muda com o relógio
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!wid) return;
    let alive = true;
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 60);
      const [m, c, ab, o, done, logs] = await Promise.all([
        supabase.from('workshop_mechanics').select('*').eq('workshop_id', wid).order('name'),
        supabase.from('workshop_mechanic_certifications').select('*').eq('workshop_id', wid),
        supabase.from('workshop_mechanic_absences').select('*').eq('workshop_id', wid).order('started_on', { ascending: false }).limit(1000),
        supabase.from('service_orders')
          .select('id, number, title, status, executor, workshop_mechanic_id, scheduled_at, started_at, vehicle:vehicles(plate)')
          .eq('workshop_id', wid).in('status', OPEN_STATUSES).is('quote_status', null)
          .order('created_at', { ascending: false }).limit(1000),
        // Última atividade: OS concluída mais recente de cada um (últimos 60 dias)
        supabase.from('service_orders').select('workshop_mechanic_id, completed_at')
          .eq('workshop_id', wid).eq('status', 'completed').not('workshop_mechanic_id', 'is', null)
          .gte('completed_at', since.toISOString()).order('completed_at', { ascending: false }).limit(2000),
        supabase.from('service_order_work_logs').select('workshop_mechanic_id, started_at, ended_at')
          .eq('workshop_id', wid).not('workshop_mechanic_id', 'is', null)
          .gte('started_at', since.toISOString()).order('started_at', { ascending: false }).limit(1000),
      ]);
      if (!alive) return;
      const mechs = (m.data as WorkshopMechanic[]) ?? [];
      setList(mechs);
      setCerts((c.data as MechanicCertification[]) ?? []);
      setAbsences((ab.data as Absence[]) ?? []);
      setOpenOs((o.data as unknown as OpenOs[]) ?? []);
      const last: Record<string, string> = {};
      const bump = (id: string | null, at: string | null) => { if (id && at && (!last[id] || at > last[id])) last[id] = at; };
      for (const r of (done.data ?? []) as { workshop_mechanic_id: string; completed_at: string }[]) bump(r.workshop_mechanic_id, r.completed_at);
      for (const r of (logs.data ?? []) as { workshop_mechanic_id: string; started_at: string; ended_at: string | null }[]) bump(r.workshop_mechanic_id, r.ended_at ?? r.started_at);
      setLastAt(last);
      setLoading(false);

      const paths = mechs.filter(x => x.photo_url).map(x => x.photo_url!);
      if (paths.length) {
        const { data: signed } = await supabase.storage.from('os-attachments').createSignedUrls(paths, 3600);
        const byPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl]));
        if (alive) setPhotos(Object.fromEntries(mechs.filter(x => x.photo_url).map(x => [x.id, byPath.get(x.photo_url!) ?? ''])));
      }
    })();
    return () => { alive = false; };
  }, [wid]);

  // Comissões, folha e contas a pagar: só para quem fecha comissões e folha
  useEffect(() => {
    if (!wid || !access.canPay) { setPayAlerts([]); return; }
    let alive = true;
    (async () => {
      const prev = shiftHalf(currentHalf().competence, currentHalf().half, -1);
      const prevMonth = addMonthsCompetence(isoToday().slice(0, 7), -1);
      const [comm, pay, due] = await Promise.all([
        loadCommissionHalf(wid, prev.competence, prev.half),
        loadPayroll(wid, prevMonth),
        supabase.from('payables').select('amount, category').eq('workshop_id', wid)
          .in('category', ['Comissões', 'Salários']).is('paid_at', null).is('cancelled_at', null)
          .lte('due_date', isoToday()),
      ]);
      if (!alive) return;
      const out: Alert[] = [];
      const open = comm.filter(r => !r.closed && r.calc.commission > 0);
      if (open.length) {
        out.push({
          key: 'comm', icon: '🏅', tone: 'pending',
          text: <>Comissões da <strong>{halfLabel(prev.competence, prev.half)}</strong> sem fechar · {open.length} colaborador{open.length === 1 ? '' : 'es'} · <strong>{fmtBRL(open.reduce((a, r) => a + r.calc.commission, 0))}</strong></>,
          actions: [{ label: 'Fechar comissões', to: `/oficina/comissoes?quinzena=${prev.competence}-${prev.half}` }],
        });
      }
      const payPending = pay.filter(r => r.active && !r.closed && !r.manual && r.base > 0);
      if (payPending.length) {
        out.push({
          key: 'folha', icon: '💼', tone: 'pending',
          text: <>Folha de <strong>{fmtCompetence(prevMonth)}</strong> sem fechar · {payPending.length} colaborador{payPending.length === 1 ? '' : 'es'} com salário</>,
          actions: [{ label: 'Fechar folha', to: `/oficina/folha?competencia=${prevMonth}` }],
        });
      }
      const dueRows = (due.data ?? []) as { amount: number; category: string }[];
      if (dueRows.length) {
        out.push({
          key: 'due', icon: '📤', tone: 'alert',
          text: <>{dueRows.length} pagamento{dueRows.length === 1 ? '' : 's'} de comissão/salário vencendo hoje ou atrasado{dueRows.length === 1 ? '' : 's'} · <strong>{fmtBRL(dueRows.reduce((a, r) => a + Number(r.amount), 0))}</strong></>,
          actions: access.route('/oficina/contas-a-pagar') ? [{ label: 'Ver contas a pagar', to: '/oficina/contas-a-pagar' }] : [],
        });
      }
      setPayAlerts(out);
    })();
    return () => { alive = false; };
  }, [wid, access.canPay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Problemas de acesso: só para quem administra acessos (dono / gestor)
  useEffect(() => {
    if (!wid || !access.canAccessAlerts) { setAccessAlerts([]); return; }
    let alive = true;
    supabase.from('workshop_operators').select('*').eq('workshop_id', wid).then(({ data }) => {
      if (!alive) return;
      const ops = (data as WorkshopOperator[]) ?? [];
      const byMech = new Map(list.map(x => [x.id, x]));
      const out: Alert[] = [];
      const noPin = ops.filter(o => o.active && o.roles.length > 0 && !o.has_pin);
      if (noPin.length) out.push({
        key: 'nopin', icon: '🔐', tone: 'info',
        text: <>Sem PIN para entrar no balcão: <strong>{noPin.map(o => o.name).join(', ')}</strong></>,
        actions: [{ label: 'Cadastrar PIN', to: '/oficina/acessos' }],
      });
      const gone = ops.filter(o => o.active && o.mechanic_id && (byMech.get(o.mechanic_id)?.status ?? 'active') === 'terminated');
      if (gone.length) out.push({
        key: 'gone', icon: '⛔', tone: 'alert',
        text: <>Desligado com acesso ativo: <strong>{gone.map(o => o.name).join(', ')}</strong></>,
        actions: [{ label: 'Bloquear acesso', to: '/oficina/acessos' }],
      });
      setAccessAlerts(out);
    });
    return () => { alive = false; };
  }, [wid, access.canAccessAlerts, list]);

  /* ── Derivados ─────────────────────────────────────────────────────────── */

  const statusOf = (x: WorkshopMechanic): TeamStatus => x.status ?? (x.active ? 'active' : 'terminated');
  const team = useMemo(() => list.filter(x => statusOf(x) !== 'terminated'), [list]);

  const byMech = useMemo(() => {
    const map = new Map<string, OpenOs[]>();
    for (const o of openOs) {
      if (!o.workshop_mechanic_id) continue;
      map.set(o.workshop_mechanic_id, [...(map.get(o.workshop_mechanic_id) ?? []), o]);
    }
    return map;
  }, [openOs]);

  const today = isoToday();
  const info = useMemo(() => new Map(list.map(x => {
    const ab = absenceToday(absences, x.id, today);
    const absent = statusOf(x) === 'away' || !!ab;
    return [x.id, { ab, state: statusOf(x) === 'terminated' ? 'none' as DayState : dayState(x.work_schedule, absent, now) }];
  })), [list, absences, now, today]);

  const working = team.filter(x => ['on', 'out'].includes(info.get(x.id)!.state));
  const onNow = working.filter(x => info.get(x.id)!.state === 'on').length;
  const absent = team.filter(x => info.get(x.id)!.state === 'absent');
  const noSchedule = team.filter(x => info.get(x.id)!.state === 'none').length;
  const teamOpen = openOs.filter(o => o.workshop_mechanic_id && team.some(t => t.id === o.workshop_mechanic_id));
  const unassigned = openOs.filter(o => !o.workshop_mechanic_id && o.executor !== 'platform' && WORK_STATUSES.includes(o.status));

  const osLink = (o: OpenOs) => ({ label: `OS ${osNumber(o)}${o.vehicle?.plate ? ` · ${o.vehicle.plate}` : ''}`, to: `/oficina/os/${o.id}` });

  const alerts: Alert[] = [];
  for (const x of absent) {
    const os = byMech.get(x.id) ?? [];
    if (!os.length) continue;
    const ab = info.get(x.id)!.ab;
    alerts.push({
      key: `abs-${x.id}`, icon: '⚠️', tone: 'alert',
      text: <><strong>{x.name}</strong> está ausente{ab ? ` (${ABSENCE_REASONS[ab.reason].label.toLowerCase()})` : ''} e tem {os.length} OS em aberto. Passe para outra pessoa.</>,
      actions: os.slice(0, 3).map(osLink),
    });
  }
  if (unassigned.length) alerts.push({
    key: 'unassigned', icon: '👤', tone: 'pending',
    text: <><strong>{unassigned.length} OS</strong> sem responsável</>,
    actions: [...unassigned.slice(0, 3).map(osLink), ...(unassigned.length > 3 ? [{ label: 'Ver todas', to: '/oficina/os' }] : [])],
  });
  // Agendada que já passou da hora e não foi iniciada (só aparece se a agenda for usada)
  const late = openOs.filter(o => o.scheduled_at && !o.started_at && new Date(o.scheduled_at).getTime() < now.getTime() - 30 * 60_000
    && o.scheduled_at.slice(0, 10) === today);
  if (late.length) alerts.push({
    key: 'late', icon: '⏰', tone: 'pending',
    text: <><strong>{late.length} OS agendada{late.length === 1 ? '' : 's'}</strong> para hoje passou do horário e não foi iniciada</>,
    actions: late.slice(0, 3).map(osLink),
  });
  alerts.push(...payAlerts, ...accessAlerts);

  const shown = list
    .filter(x => filter === 'all' || (filter === 'terminated' ? statusOf(x) === 'terminated' : statusOf(x) !== 'terminated'))
    .filter(x => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()) || (x.role_title ?? '').toLowerCase().includes(q.trim().toLowerCase()));

  function expiryAlerts(x: WorkshopMechanic) {
    const out: { text: string; expired: boolean }[] = [];
    const cnh = expiryState(x.cnh_expires_at);
    if (cnh && cnh.state !== 'ok') out.push({ text: cnh.state === 'expired' ? 'CNH vencida' : 'CNH vencendo', expired: cnh.state === 'expired' });
    for (const c of certs.filter(c => c.mechanic_id === x.id)) {
      const e = expiryState(c.expires_at);
      if (e && e.state !== 'ok') out.push({ text: `${c.name} ${e.state === 'expired' ? 'vencido' : 'vencendo'}`, expired: e.state === 'expired' });
    }
    return out;
  }

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">👷 Equipe</h1>
            <p className="text-sm text-steel-500 mt-1">Quem está trabalhando hoje e o que precisa de atenção.</p>
          </div>
          <Link to="/oficina/equipe/novo" className="btn-primary">+ Novo colaborador</Link>
        </div>

        <TeamTabs />

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}</div>
            <div className="h-40 bg-white rounded-2xl animate-pulse" />
          </div>
        ) : list.length === 0 ? (
          <div className="card text-center py-14">
            <div className="text-4xl mb-2">👷</div>
            <h2 className="text-lg font-bold">Cadastre sua equipe</h2>
            <p className="text-sm text-steel-500 mt-1 max-w-md mx-auto">Com a equipe cadastrada você escolhe quem executa cada OS e acompanha comissões e folha.</p>
            <Link to="/oficina/equipe/novo" className="btn-primary mt-5 inline-block">+ Cadastrar primeiro colaborador</Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Indicadores */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi value={working.length} label="Trabalhando hoje"
                sub={noSchedule ? `${onNow} em horário agora · ${noSchedule} sem jornada` : `${onNow} em horário agora`} />
              <Kpi value={absent.length} label="Ausentes" tone={absent.length ? 'pending' : undefined}
                sub={absent.length ? absent.map(x => x.name.split(' ')[0]).join(', ') : 'ninguém afastado'} />
              <Kpi value={teamOpen.length} label="OS em aberto da equipe" sub="aberta, aguardando, aprovada ou em andamento" />
              <Kpi value={unassigned.length} label="OS sem responsável" tone={unassigned.length ? 'alert' : undefined}
                sub={unassigned.length ? 'precisam de alguém' : 'todas com responsável'} />
            </div>

            {/* Atenção agora */}
            {alerts.length > 0 && (
              <section>
                <h2 className="text-[11px] font-bold text-steel-500 uppercase tracking-widest mb-2">Atenção agora</h2>
                <ul className="space-y-2">
                  {alerts.map(a => (
                    <li key={a.key} className={`card !py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 border-l-4 ${
                      a.tone === 'alert' ? 'border-l-alert-500' : a.tone === 'pending' ? 'border-l-pending-500' : 'border-l-steel-300'}`}>
                      <div className="flex-1 text-sm text-steel-700"><span className="mr-1.5">{a.icon}</span>{a.text}</div>
                      {a.actions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 sm:justify-end">
                          {a.actions.map(ac => (
                            <Link key={ac.to + ac.label} to={ac.to}
                              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-steel-200 bg-white hover:border-brand-300 hover:text-brand-700 transition whitespace-nowrap">
                              {ac.label} →
                            </Link>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Colaboradores */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h2 className="text-[11px] font-bold text-steel-500 uppercase tracking-widest">Colaboradores</h2>
                <div className="flex flex-wrap items-center gap-2">
                  {(['active', 'terminated', 'all'] as Filter[]).map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                      className={`text-xs font-semibold px-3 py-1 rounded-full border transition ${filter === f ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                      {f === 'active' ? `Ativos (${team.length})` : f === 'terminated' ? `Desligados (${list.length - team.length})` : 'Todos'}
                    </button>
                  ))}
                  <input className="input !py-1.5 !w-44 text-sm" placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} />
                </div>
              </div>

              {shown.length === 0 ? (
                <div className="card text-center text-sm text-steel-400 py-8">Ninguém nesta lista.</div>
              ) : (
                <div className="card !p-0 overflow-hidden">
                  <div className="hidden md:grid grid-cols-[2fr_1.4fr_1fr_1fr_auto] gap-4 px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">
                    <span>Colaborador</span><span>Hoje</span><span>OS em aberto</span><span>Última OS</span><span className="w-32" />
                  </div>
                  <ul className="divide-y divide-steel-100">
                    {shown.map(x => {
                      const i = info.get(x.id)!;
                      const ds = DAY_STATE[i.state];
                      const st = statusOf(x);
                      const os = byMech.get(x.id) ?? [];
                      const exp = expiryAlerts(x);
                      const rs = i.ab ? returnStatus(i.ab) : null;
                      const isOpen = expanded === x.id;
                      return (
                        <li key={x.id}>
                          <div className="px-4 md:px-5 py-3 grid grid-cols-[1fr_auto] md:grid-cols-[2fr_1.4fr_1fr_1fr_auto] gap-x-4 gap-y-2 items-center">
                            {/* Colaborador */}
                            <Link to={`/oficina/equipe/${x.id}`} className="flex items-center gap-3 min-w-0 group">
                              {photos[x.id]
                                ? <img src={photos[x.id]} alt="" className="h-10 w-10 rounded-full object-cover shrink-0" />
                                : <div className="h-10 w-10 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold shrink-0">{x.name.charAt(0).toUpperCase()}</div>}
                              <div className="min-w-0">
                                <div className="font-semibold text-steel-900 truncate group-hover:text-brand-700">{x.name}</div>
                                <div className="text-xs text-steel-500 truncate">
                                  {x.role_title || 'Função não informada'}
                                  {st !== 'active' && <span className={`badge text-[10px] ml-1.5 ${TEAM_STATUS[st].badge}`}>{TEAM_STATUS[st].label}</span>}
                                </div>
                              </div>
                            </Link>

                            {/* Ações (celular: à direita do nome) */}
                            <div className="md:hidden flex gap-1.5 row-span-1">
                              <Link to={`/oficina/equipe/${x.id}`} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-steel-200">Ficha</Link>
                            </div>

                            {/* Hoje */}
                            <div className="col-span-2 md:col-span-1 min-w-0">
                              {st === 'terminated' ? <span className="text-xs text-steel-400">Desligado</span> : (
                                <>
                                  <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${ds.text}`}>
                                    <span className={`h-2 w-2 rounded-full ${ds.dot}`} />{ds.label}
                                  </span>
                                  {i.ab && (
                                    <div className={`text-[11px] ${rs?.late ? 'text-alert-700 font-semibold' : 'text-steel-500'}`}>
                                      {ABSENCE_REASONS[i.ab.reason].icon} {ABSENCE_REASONS[i.ab.reason].label}
                                      {i.ab.expected_return ? ` · volta ${fmtDay(i.ab.expected_return)}` : ' · sem previsão'}
                                      {rs?.late && ` · ${rs.text}`}
                                    </div>
                                  )}
                                  {i.state === 'none' && <div className="text-[11px] text-steel-400">cadastre a jornada na ficha</div>}
                                </>
                              )}
                            </div>

                            {/* OS em aberto */}
                            <div className="text-sm">
                              <span className="md:hidden text-[10px] text-steel-400 uppercase mr-1.5">OS em aberto</span>
                              {os.length ? (
                                <button onClick={() => setExpanded(isOpen ? null : x.id)}
                                  className={`font-semibold ${i.state === 'absent' ? 'text-alert-600' : 'text-steel-900'} hover:text-brand-700`}>
                                  {os.length} {isOpen ? '▴' : '▾'}
                                </button>
                              ) : <span className="text-steel-400">—</span>}
                            </div>

                            {/* Última OS */}
                            <div className="text-sm text-steel-600">
                              <span className="md:hidden text-[10px] text-steel-400 uppercase mr-1.5">Última OS</span>
                              {when(lastAt[x.id] ?? null)}
                            </div>

                            {/* Ações (desktop) */}
                            <div className="hidden md:flex gap-1.5 justify-end w-32">
                              {os.length > 0 && (
                                <button onClick={() => setExpanded(isOpen ? null : x.id)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-steel-200 hover:border-brand-300">Ver OS</button>
                              )}
                              <Link to={`/oficina/equipe/${x.id}`} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-steel-200 hover:border-brand-300">Ficha</Link>
                            </div>

                            {exp.length > 0 && (
                              <div className="col-span-2 md:col-span-5 flex flex-wrap gap-1 -mt-1">
                                {exp.map((a, k) => (
                                  <span key={k} className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${a.expired ? 'bg-alert-50 text-alert-700' : 'bg-pending-50 text-pending-800'}`}>⚠️ {a.text}</span>
                                ))}
                              </div>
                            )}
                          </div>

                          {isOpen && (
                            <ul className="px-4 md:px-5 pb-3 md:pl-[4.5rem] space-y-1">
                              {os.map(o => (
                                <li key={o.id}>
                                  <Link to={`/oficina/os/${o.id}`} className="flex items-center justify-between gap-3 text-sm rounded-lg px-3 py-2 bg-steel-50 hover:bg-brand-50">
                                    <span className="truncate">OS {osNumber(o)} · {o.title}{o.vehicle?.plate ? ` · ${o.vehicle.plate}` : ''}</span>
                                    <span className="text-[11px] text-steel-500 shrink-0">{STATUS_TEXT[o.status] ?? o.status}</span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <p className="text-[11px] text-steel-400 mt-2">
                “Hoje” vem da jornada de cada um e dos afastamentos. Quem está livre ou ocupado só vai aparecer quando o relógio da OS for usado.
                {' '}<button className="underline" onClick={() => setShowReport(v => !v)}>{showReport ? 'Esconder' : 'Ver'} relatório de afastamentos</button>
              </p>
              {showReport && <div className="mt-3"><AbsenceReport absences={absences} mechanics={list} /></div>}
            </section>
          </div>
        )}
      </div>
    </WorkshopLayout>
  );
}

const STATUS_TEXT: Record<string, string> = {
  open: 'Aberta', awaiting_approval: 'Aguardando aprovação', approved: 'Aprovada', in_progress: 'Em andamento',
};

function Kpi({ value, label, sub, tone }: { value: number; label: string; sub: string; tone?: 'alert' | 'pending' }) {
  return (
    <div className="card !p-4">
      <div className={`text-3xl font-bold ${tone === 'alert' ? 'text-alert-600' : tone === 'pending' ? 'text-pending-700' : 'text-steel-900'}`}>{value}</div>
      <div className="text-sm font-semibold text-steel-800 mt-0.5">{label}</div>
      <div className="text-[11px] text-steel-500 mt-0.5 truncate" title={sub}>{sub}</div>
    </div>
  );
}
