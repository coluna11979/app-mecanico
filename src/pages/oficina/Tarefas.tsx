import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { osNumber } from '@/components/os/osHelpers';

/**
 * Tarefas da equipe (modelo do CRM IA First adaptado à oficina): quem faz o quê e até quando.
 * Gestor (ou quem tem a permissão Equipe) vê e distribui as de todos; o colaborador vê e cria as dele.
 */

type Status = 'a_fazer' | 'fazendo' | 'feito';
type Priority = 'alta' | 'media' | 'baixa';
type TaskType = 'ligar_cliente' | 'peca' | 'conferir_os' | 'entregar_carro' | 'organizacao' | 'outro';
type Recurrence = 'nenhuma' | 'diaria' | 'semanal' | 'dias';

type Task = {
  id: string; workshop_id: string; title: string; description: string | null;
  task_type: TaskType; priority: Priority; status: Status;
  assignee_id: string | null; due_at: string | null;
  recurrence: Recurrence; recurrence_days: number | null;
  service_order_id: string | null; customer_id: string | null;
  completed_at: string | null; completed_by: string | null;
  created_by: string | null; created_by_name: string | null; created_at: string;
  os?: { id: string; number: number | null; title: string } | null;
  customer?: { id: string; full_name: string } | null;
};
type Person = { id: string; name: string; photo_url: string | null };

const TYPES: Record<TaskType, { label: string; icon: string }> = {
  ligar_cliente:  { label: 'Ligar para cliente', icon: '📞' },
  peca:           { label: 'Buscar / comprar peça', icon: '📦' },
  conferir_os:    { label: 'Conferir OS', icon: '📋' },
  entregar_carro: { label: 'Entregar carro', icon: '🚗' },
  organizacao:    { label: 'Organização / limpeza', icon: '🧹' },
  outro:          { label: 'Outro', icon: '📝' },
};
const PRIORITY: Record<Priority, { label: string; chip: string }> = {
  alta:  { label: 'Alta',  chip: 'bg-alert-500/15 text-alert-700' },
  media: { label: 'Média', chip: 'bg-pending-500/15 text-pending-700' },
  baixa: { label: 'Baixa', chip: 'bg-steel-100 text-steel-600' },
};
const STATUS: Record<Status, string> = { a_fazer: 'A fazer', fazendo: 'Fazendo', feito: 'Feito' };
const RECURRENCE: Record<Recurrence, string> = { nenhuma: 'Não repete', diaria: 'Todo dia', semanal: 'Toda semana', dias: 'A cada N dias' };

type Quick = 'todas' | 'atrasadas' | 'hoje' | 'semana' | 'feitas';

const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isLate = (t: Task) => t.status !== 'feito' && !!t.due_at && new Date(t.due_at) < new Date();
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
function dueLabel(iso: string) {
  const d = new Date(iso), today = startOfDay();
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const day = startOfDay(d).getTime();
  if (day === today.getTime()) return `Hoje, ${hm}`;
  if (day === addDays(today, 1).getTime()) return `Amanhã, ${hm}`;
  if (day === addDays(today, -1).getTime()) return `Ontem, ${hm}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hm}`;
}
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');

export default function Tarefas() {
  const { user, profile, currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  /** Gestor / dono / permissão Equipe: vê a equipe toda e distribui tarefas */
  const manager = canDo(session, balcao, 'equipe');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'minhas' | 'equipe'>('equipe');
  const [who, setWho] = useState('');
  const [quick, setQuick] = useState<Quick>('todas');
  const [tab, setTab] = useState<'lista' | 'quadro'>('lista');
  const [editing, setEditing] = useState<Task | 'nova' | null>(null);

  // Quem está usando: colaborador (login/PIN) → a pessoa da equipe ligada ao acesso dele
  useEffect(() => {
    if (!wid) return;
    if (!session?.operator_id) { setMe(null); return; }
    supabase.from('workshop_operators').select('mechanic_id').eq('id', session.operator_id).maybeSingle()
      .then(({ data }) => setMe(data?.mechanic_id ?? null));
  }, [wid, session?.operator_id]);

  // Colaborador sem a permissão Equipe vê só as dele
  useEffect(() => { if (!manager) setView('minhas'); else if (me) setView('minhas'); }, [manager, me]);

  const load = useCallback(async () => {
    if (!wid) return;
    const since = addDays(startOfDay(), -30).toISOString();
    const [t, p] = await Promise.all([
      supabase.from('workshop_tasks')
        .select('*, os:service_orders(id, number, title), customer:customers(id, full_name)')
        .eq('workshop_id', wid)
        .or(`status.neq.feito,completed_at.gte.${since}`)
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(1000),
      supabase.from('workshop_mechanics').select('id, name, photo_url').eq('workshop_id', wid).eq('active', true).order('name'),
    ]);
    if (t.error) toast.error('Não foi possível carregar as tarefas: ' + t.error.message);
    setTasks((t.data as Task[]) ?? []);
    setPeople((p.data as Person[]) ?? []);
    setLoading(false);
  }, [wid]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  // Atualiza sozinho quando alguém da equipe mexe
  useEffect(() => {
    if (!wid) return;
    const ch = supabase.channel(`tarefas:${wid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workshop_tasks', filter: `workshop_id=eq.${wid}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [wid, load]);

  const personName = (id: string | null) => people.find(p => p.id === id)?.name ?? (id ? 'Ex-colaborador' : 'Sem responsável');

  // Base: minhas (ou da pessoa escolhida) × equipe toda
  const base = useMemo(() => tasks.filter(t =>
    view === 'minhas' ? (me ? t.assignee_id === me : t.created_by === user?.id)
      : (!who || (who === 'ninguem' ? !t.assignee_id : t.assignee_id === who))), [tasks, view, me, who, user?.id]);

  const stats = useMemo(() => {
    const today = startOfDay(), tomorrow = addDays(today, 1), week = addDays(today, 7);
    const open = base.filter(t => t.status !== 'feito');
    const at = (t: Task) => new Date(t.due_at!);
    return {
      atrasadas: open.filter(isLate).length,
      hoje: open.filter(t => t.due_at && !isLate(t) && at(t) < tomorrow).length,
      semana: open.filter(t => t.due_at && at(t) >= today && at(t) < week).length,
      feitas: base.filter(t => t.status === 'feito').length,
    };
  }, [base]);

  const shown = useMemo(() => {
    const today = startOfDay(), tomorrow = addDays(today, 1), week = addDays(today, 7);
    const at = (t: Task) => new Date(t.due_at!);
    switch (quick) {
      case 'atrasadas': return base.filter(isLate);
      case 'hoje':      return base.filter(t => t.status !== 'feito' && t.due_at && !isLate(t) && at(t) < tomorrow);
      case 'semana':    return base.filter(t => t.status !== 'feito' && t.due_at && at(t) >= today && at(t) < week);
      case 'feitas':    return base.filter(t => t.status === 'feito');
      default:          return base.filter(t => t.status !== 'feito' || tab === 'quadro');
    }
  }, [base, quick, tab]);

  async function setStatus(t: Task, status: Status) {
    const who = session?.name ?? profile?.full_name ?? null;
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status } : x));
    const { error } = await supabase.from('workshop_tasks')
      .update({ status, completed_by: status === 'feito' ? who : null }).eq('id', t.id);
    if (error) { toast.error('Não foi possível atualizar: ' + error.message); load(); return; }
    if (status === 'feito' && t.recurrence !== 'nenhuma') toast.success('Feito! A próxima já foi criada.');
  }

  const meName = me ? personName(me) : null;

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Tarefas</h1>
            <p className="text-sm text-steel-500 mt-0.5">
              {view === 'minhas' ? `Suas tarefas${meName ? `, ${meName.split(' ')[0]}` : ''}` : 'Tudo o que a equipe tem para fazer'}
            </p>
          </div>
          <button type="button" onClick={() => setEditing('nova')} className="btn-primary min-h-[44px]">＋ Nova tarefa</button>
        </div>

        {/* Cards (clique filtra) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            ['atrasadas', 'Atrasadas', stats.atrasadas, 'text-alert-600', 'border-alert-400 bg-alert-500/5'],
            ['hoje', 'Hoje', stats.hoje, 'text-brand-600', 'border-brand-400 bg-brand-50'],
            ['semana', 'Esta semana', stats.semana, 'text-steel-800', 'border-steel-400 bg-steel-50'],
            ['feitas', 'Feitas (30 dias)', stats.feitas, 'text-signal-600', 'border-signal-400 bg-signal-500/5'],
          ] as const).map(([k, label, n, color, on]) => (
            <button key={k} type="button" onClick={() => setQuick(quick === k ? 'todas' : k)} aria-pressed={quick === k}
              className={`text-left rounded-xl border-2 bg-white px-4 py-3 transition ${quick === k ? on : 'border-transparent hover:border-steel-200'} ${k === 'atrasadas' && n > 0 && quick !== k ? 'ring-1 ring-alert-200' : ''}`}>
              <div className={`font-display text-2xl font-bold tabular-nums ${n ? color : 'text-steel-300'}`}>{n}</div>
              <div className="text-xs font-semibold text-steel-500">{label}</div>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white border border-steel-200 p-2">
          {manager && (
            <div className="flex gap-1 bg-steel-100 rounded-lg p-0.5">
              {([['minhas', 'Minhas'], ['equipe', 'Toda a equipe']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k}
                  className={`h-9 px-3 rounded-md text-sm font-semibold transition ${view === k ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'}`}>
                  {l}
                </button>
              ))}
            </div>
          )}
          {manager && view === 'equipe' && (
            <select value={who} onChange={e => setWho(e.target.value)}
              className="h-9 rounded-lg border border-steel-200 px-2 text-sm font-semibold text-steel-700 bg-white max-w-[200px]">
              <option value="">Todos os responsáveis</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="ninguem">Sem responsável</option>
            </select>
          )}
          {quick !== 'todas' && (
            <button type="button" onClick={() => setQuick('todas')} className="h-9 px-2 text-xs font-semibold text-steel-500 underline">Limpar filtro</button>
          )}
          <div className="ml-auto flex gap-1 bg-steel-100 rounded-lg p-0.5">
            {([['lista', 'Lista'], ['quadro', 'Quadro']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
                className={`h-9 px-3 rounded-md text-sm font-semibold transition ${tab === k ? 'bg-white shadow text-steel-900' : 'text-steel-500 hover:text-steel-700'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {view === 'minhas' && !me && manager && balcao && (
          <p className="text-xs text-steel-500">Seu acesso não está ligado a uma pessoa do Painel da equipe: aqui aparecem as tarefas que você criou.</p>
        )}

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-xl animate-pulse" />)}</div>
        ) : tab === 'lista' ? (
          <TaskList tasks={shown} quick={quick} personName={personName} showAssignee={view === 'equipe'}
            onToggle={t => setStatus(t, t.status === 'feito' ? 'a_fazer' : 'feito')} onOpen={t => setEditing(t)}
            onNew={() => setEditing('nova')} />
        ) : (
          <TaskBoard tasks={shown} personName={personName} showAssignee={view === 'equipe'}
            onMove={setStatus} onOpen={t => setEditing(t)} />
        )}
      </div>

      {editing && wid && (
        <TaskModal wid={wid} task={editing === 'nova' ? null : editing} people={people} manager={manager} me={me}
          authorId={user?.id ?? null} authorName={session?.name ?? profile?.full_name ?? null}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </WorkshopLayout>
  );
}

/* ── Lista agrupada por prazo ── */
function TaskList({ tasks, quick, personName, showAssignee, onToggle, onOpen, onNew }: {
  tasks: Task[]; quick: Quick; personName: (id: string | null) => string; showAssignee: boolean;
  onToggle: (t: Task) => void; onOpen: (t: Task) => void; onNew: () => void;
}) {
  if (!tasks.length) {
    return (
      <div className="rounded-xl bg-white border border-steel-200 text-center px-5 py-10">
        <div className="text-3xl" aria-hidden>✅</div>
        <div className="font-semibold text-steel-900 mt-2">{quick === 'todas' ? 'Nenhuma tarefa pendente' : 'Nada por aqui'}</div>
        <p className="text-sm text-steel-500 mt-1">Crie uma tarefa e escolha quem faz e até quando.</p>
        <button type="button" onClick={onNew} className="btn-primary mt-4">＋ Nova tarefa</button>
      </div>
    );
  }
  const today = startOfDay(), tomorrow = addDays(today, 1), after = addDays(today, 2);
  const groups: [string, Task[]][] = quick === 'feitas'
    ? [['Feitas', [...tasks].sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))]]
    : [
        ['Atrasadas', tasks.filter(isLate)],
        ['Hoje', tasks.filter(t => !isLate(t) && t.due_at && new Date(t.due_at) < tomorrow)],
        ['Amanhã', tasks.filter(t => t.due_at && new Date(t.due_at) >= tomorrow && new Date(t.due_at) < after)],
        ['Próximos dias', tasks.filter(t => t.due_at && new Date(t.due_at) >= after)],
        ['Sem prazo', tasks.filter(t => !t.due_at)],
      ];
  return (
    <div className="space-y-4">
      {groups.filter(([, l]) => l.length).map(([label, list]) => (
        <section key={label}>
          <div className="flex items-center gap-2 mb-2">
            <h2 className={`text-sm font-bold ${label === 'Atrasadas' ? 'text-alert-600' : 'text-steel-800'}`}>{label}</h2>
            <span className="text-xs font-semibold text-steel-400 tabular-nums">{list.length}</span>
          </div>
          <ul className="rounded-xl bg-white border border-steel-200 divide-y divide-steel-100">
            {list.map(t => <TaskRow key={t.id} t={t} personName={personName} showAssignee={showAssignee} onToggle={onToggle} onOpen={onOpen} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TaskRow({ t, personName, showAssignee, onToggle, onOpen }: {
  t: Task; personName: (id: string | null) => string; showAssignee: boolean;
  onToggle: (t: Task) => void; onOpen: (t: Task) => void;
}) {
  const done = t.status === 'feito';
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <button type="button" onClick={() => onToggle(t)} aria-label={done ? 'Reabrir tarefa' : 'Marcar como feita'}
        className={`mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 grid place-items-center transition ${done ? 'bg-signal-500 border-signal-500 text-white' : 'border-steel-300 hover:border-signal-500'}`}>
        {done && <span className="text-xs font-bold">✓</span>}
      </button>
      <button type="button" onClick={() => onOpen(t)} className="flex-1 min-w-0 text-left">
        <div className={`text-sm font-semibold leading-snug break-words ${done ? 'text-steel-400 line-through' : 'text-steel-900'}`}>
          <span aria-hidden className="mr-1">{TYPES[t.task_type].icon}</span>{t.title}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-steel-500">
          {t.status === 'fazendo' && <span className="font-semibold text-brand-600">Fazendo</span>}
          {t.due_at && <span className={isLate(t) ? 'font-semibold text-alert-600' : ''}>{dueLabel(t.due_at)}</span>}
          <span className={`rounded-full px-2 py-0.5 font-semibold ${PRIORITY[t.priority].chip}`}>{PRIORITY[t.priority].label}</span>
          {showAssignee && <span>· {personName(t.assignee_id)}</span>}
          {t.recurrence !== 'nenhuma' && <span title={RECURRENCE[t.recurrence]}>🔁 {t.recurrence === 'dias' ? `a cada ${t.recurrence_days} dias` : RECURRENCE[t.recurrence].toLowerCase()}</span>}
          {t.os && <span>· OS {osNumber(t.os)}</span>}
          {t.customer && <span>· {t.customer.full_name}</span>}
          {done && t.completed_by && <span>· feita por {t.completed_by.split(' ')[0]}</span>}
        </div>
      </button>
    </li>
  );
}

/* ── Quadro: A fazer · Fazendo · Feito (botões em vez de arrastar: funciona no celular) ── */
function TaskBoard({ tasks, personName, showAssignee, onMove, onOpen }: {
  tasks: Task[]; personName: (id: string | null) => string; showAssignee: boolean;
  onMove: (t: Task, s: Status) => void; onOpen: (t: Task) => void;
}) {
  const cols: Status[] = ['a_fazer', 'fazendo', 'feito'];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {cols.map(c => {
        const list = tasks.filter(t => t.status === c);
        return (
          <section key={c} className="rounded-xl bg-steel-50 border border-steel-200 p-2.5">
            <div className="flex items-center gap-2 px-1 mb-2">
              <h2 className="text-sm font-bold text-steel-800">{STATUS[c]}</h2>
              <span className="text-xs font-semibold text-steel-400 tabular-nums">{list.length}</span>
            </div>
            <div className="space-y-2">
              {list.length === 0 && <div className="text-xs text-steel-400 text-center py-4">Vazio</div>}
              {list.map(t => (
                <div key={t.id} className={`rounded-lg bg-white border p-2.5 ${isLate(t) ? 'border-alert-300' : 'border-steel-200'}`}>
                  <button type="button" onClick={() => onOpen(t)} className="block w-full text-left">
                    <div className={`text-sm font-semibold break-words ${c === 'feito' ? 'text-steel-400 line-through' : 'text-steel-900'}`}>
                      <span aria-hidden className="mr-1">{TYPES[t.task_type].icon}</span>{t.title}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-steel-500">
                      {t.due_at && <span className={isLate(t) ? 'font-semibold text-alert-600' : ''}>{dueLabel(t.due_at)}</span>}
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${PRIORITY[t.priority].chip}`}>{PRIORITY[t.priority].label}</span>
                      {showAssignee && <span>{personName(t.assignee_id)}</span>}
                    </div>
                  </button>
                  <div className="mt-2 flex gap-1.5">
                    {c !== 'a_fazer' && (
                      <button type="button" onClick={() => onMove(t, c === 'feito' ? 'fazendo' : 'a_fazer')}
                        className="h-8 px-2.5 rounded-md border border-steel-200 text-xs font-semibold text-steel-600 hover:bg-steel-50">←</button>
                    )}
                    {c !== 'feito' && (
                      <button type="button" onClick={() => onMove(t, c === 'a_fazer' ? 'fazendo' : 'feito')}
                        className={`flex-1 h-8 rounded-md text-xs font-bold text-white ${c === 'a_fazer' ? 'bg-brand-500 hover:bg-brand-600' : 'bg-signal-500 hover:bg-signal-600'}`}>
                        {c === 'a_fazer' ? 'Começar' : 'Concluir'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ── Nova / editar tarefa ── */
function TaskModal({ wid, task, people, manager, me, authorId, authorName, onClose, onSaved }: {
  wid: string; task: Task | null; people: Person[]; manager: boolean; me: string | null;
  authorId: string | null; authorName: string | null; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [type, setType] = useState<TaskType>(task?.task_type ?? 'outro');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'media');
  const [assignee, setAssignee] = useState<string>(task?.assignee_id ?? (manager ? '' : me ?? ''));
  const [due, setDue] = useState(toLocalInput(task?.due_at ?? null));
  const [recurrence, setRecurrence] = useState<Recurrence>(task?.recurrence ?? 'nenhuma');
  const [recDays, setRecDays] = useState(String(task?.recurrence_days ?? 3));
  const [osNum, setOsNum] = useState(task?.os?.number != null ? String(task.os.number) : '');
  const [customer, setCustomer] = useState<{ id: string; full_name: string } | null>(task?.customer ?? null);
  const [custQ, setCustQ] = useState('');
  const [custHits, setCustHits] = useState<{ id: string; full_name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Busca de cliente (nome)
  useEffect(() => {
    const q = custQ.trim();
    if (q.length < 2) { setCustHits([]); return; }
    let alive = true;
    const h = setTimeout(async () => {
      const { data } = await supabase.from('customers').select('id, full_name').eq('workshop_id', wid)
        .ilike('full_name', `%${q}%`).order('full_name').limit(6);
      if (alive) setCustHits((data as { id: string; full_name: string }[]) ?? []);
    }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [custQ, wid]);

  const quickDue = (days: number, h: number) => { const d = addDays(startOfDay(), days); d.setHours(h, 0, 0, 0); setDue(toLocalInput(d.toISOString())); };

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!title.trim()) return setErr('Diga o que precisa ser feito.');
    if (recurrence !== 'nenhuma' && !due) return setErr('Tarefa que repete precisa de prazo.');
    if (recurrence === 'dias' && !(Number(recDays) >= 1 && Number(recDays) <= 365)) return setErr('Repetição: de 1 a 365 dias.');
    setSaving(true);
    let osId: string | null = null;
    if (osNum.trim()) {
      const { data } = await supabase.from('service_orders').select('id').eq('workshop_id', wid).eq('number', Number(osNum.trim())).maybeSingle();
      if (!data) { setSaving(false); return setErr(`Não achei a OS nº ${osNum.trim()} nesta loja.`); }
      osId = data.id;
    }
    const payload = {
      title: title.trim(), description: description.trim() || null, task_type: type, priority,
      assignee_id: assignee || null, due_at: due ? new Date(due).toISOString() : null,
      recurrence, recurrence_days: recurrence === 'dias' ? Number(recDays) : null,
      service_order_id: osId, customer_id: customer?.id ?? null,
    };
    const { error } = task
      ? await supabase.from('workshop_tasks').update(payload).eq('id', task.id)
      : await supabase.from('workshop_tasks').insert({ ...payload, workshop_id: wid, created_by: authorId, created_by_name: authorName });
    setSaving(false);
    if (error) return setErr('Não foi possível salvar: ' + error.message);
    toast.success(task ? 'Tarefa atualizada' : 'Tarefa criada');
    onSaved();
  }

  async function remove() {
    if (!task || !confirm(`Excluir a tarefa "${task.title}"?`)) return;
    const { error } = await supabase.from('workshop_tasks').delete().eq('id', task.id);
    if (error) return toast.error('Não foi possível excluir: ' + error.message);
    toast.success('Tarefa excluída');
    onSaved();
  }

  const canDelete = !!task && (manager || task.created_by === authorId);

  return (
    <div className="fixed inset-0 z-[80] bg-steel-900/70 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl">
        <div className="flex-1 overflow-y-auto px-5 pt-5 pb-3 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold tracking-tight">{task ? 'Editar tarefa' : 'Nova tarefa'}</h2>
            <button type="button" onClick={onClose} aria-label="Fechar" className="h-10 w-10 -mr-2 -mt-1 rounded-full grid place-items-center text-steel-500 hover:bg-steel-100">✕</button>
          </div>

          <div>
            <label className="label" htmlFor="tk-title">O que precisa ser feito</label>
            <input id="tk-title" className="input" autoFocus placeholder="Ex.: Ligar para o cliente do Onix sobre o orçamento"
              value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div>
            <div className="label">Tipo</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TYPES) as TaskType[]).map(k => (
                <button key={k} type="button" onClick={() => setType(k)} aria-pressed={type === k}
                  className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold transition ${type === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-700 border-steel-200 hover:border-steel-300'}`}>
                  {TYPES[k].icon} {TYPES[k].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="tk-who">Responsável</label>
              <select id="tk-who" className="input" value={assignee} onChange={e => setAssignee(e.target.value)} disabled={!manager}>
                <option value="">Sem responsável</option>
                {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <div className="label">Prioridade</div>
              <div className="flex gap-1 bg-steel-100 rounded-xl p-1">
                {(['alta', 'media', 'baixa'] as Priority[]).map(k => (
                  <button key={k} type="button" onClick={() => setPriority(k)} aria-pressed={priority === k}
                    className={`flex-1 min-h-[36px] rounded-lg text-sm font-semibold transition ${priority === k ? 'bg-white shadow text-steel-900' : 'text-steel-500'}`}>
                    {PRIORITY[k].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="tk-due">Prazo</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {([['Hoje 18h', 0, 18], ['Amanhã 9h', 1, 9], ['Em 3 dias', 3, 9]] as const).map(([l, d, h]) => (
                <button key={l} type="button" onClick={() => quickDue(d, h)}
                  className="min-h-[36px] rounded-full border border-steel-200 px-3 text-xs font-semibold text-steel-700 hover:border-steel-300">{l}</button>
              ))}
              {due && <button type="button" onClick={() => setDue('')} className="min-h-[36px] px-2 text-xs font-semibold text-steel-500 underline">Sem prazo</button>}
            </div>
            <input id="tk-due" className="input" type="datetime-local" value={due} onChange={e => setDue(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="tk-rec">Repetir</label>
              <select id="tk-rec" className="input" value={recurrence} onChange={e => setRecurrence(e.target.value as Recurrence)}>
                {(Object.keys(RECURRENCE) as Recurrence[]).map(k => <option key={k} value={k}>{RECURRENCE[k]}</option>)}
              </select>
            </div>
            {recurrence === 'dias' && (
              <div>
                <label className="label" htmlFor="tk-days">A cada quantos dias</label>
                <input id="tk-days" className="input" type="number" min={1} max={365} value={recDays} onChange={e => setRecDays(e.target.value)} />
              </div>
            )}
          </div>

          <div>
            <label className="label" htmlFor="tk-desc">Detalhes <span className="normal-case tracking-normal font-normal text-steel-400">· opcional</span></label>
            <textarea id="tk-desc" className="input" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="tk-os">OS <span className="normal-case tracking-normal font-normal text-steel-400">· opcional</span></label>
              <input id="tk-os" className="input" inputMode="numeric" placeholder="Nº da OS" value={osNum} onChange={e => setOsNum(e.target.value.replace(/\D/g, ''))} />
              {task?.os && task.os.number != null && String(task.os.number) === osNum && (
                <Link to={`/oficina/os/${task.os.id}`} className="text-xs font-semibold text-brand-600 underline">Abrir OS {osNumber(task.os)}</Link>
              )}
            </div>
            <div>
              <label className="label" htmlFor="tk-cust">Cliente <span className="normal-case tracking-normal font-normal text-steel-400">· opcional</span></label>
              {customer ? (
                <div className="flex items-center gap-2 rounded-xl border border-steel-200 px-3 min-h-[46px]">
                  <Link to={`/oficina/clientes/${customer.id}`} className="flex-1 min-w-0 truncate text-sm font-semibold text-brand-600">{customer.full_name}</Link>
                  <button type="button" onClick={() => setCustomer(null)} aria-label="Tirar cliente" className="text-steel-400 hover:text-steel-700">✕</button>
                </div>
              ) : (
                <div className="relative">
                  <input id="tk-cust" className="input" placeholder="Buscar pelo nome" autoComplete="off" value={custQ} onChange={e => setCustQ(e.target.value)} />
                  {custHits.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full rounded-xl bg-white border border-steel-200 shadow-lg overflow-hidden">
                      {custHits.map(c => (
                        <li key={c.id}>
                          <button type="button" onClick={() => { setCustomer(c); setCustQ(''); setCustHits([]); }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-steel-50">{c.full_name}</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {task && (
            <p className="text-xs text-steel-400">
              Criada {task.created_by_name ? `por ${task.created_by_name} ` : ''}em {new Date(task.created_at).toLocaleDateString('pt-BR')}
              {task.completed_at && ` · feita em ${new Date(task.completed_at).toLocaleDateString('pt-BR')}${task.completed_by ? ` por ${task.completed_by}` : ''}`}
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-steel-100 space-y-3">
          {err && <div role="alert" className="bg-alert-500/10 border border-alert-300 text-alert-700 text-sm font-semibold rounded-xl px-4 py-2.5">{err}</div>}
          <div className="flex gap-2">
            {canDelete && <button type="button" onClick={remove} className="btn-ghost text-alert-600 min-h-[48px]">Excluir</button>}
            <button type="button" onClick={onClose} className="btn-ghost flex-1 min-h-[48px]">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-[2] min-h-[48px]">{saving ? 'Salvando…' : task ? 'Salvar' : 'Criar tarefa'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
