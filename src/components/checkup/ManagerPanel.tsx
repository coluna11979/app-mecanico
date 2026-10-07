import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LicensePlate from '@/components/os/LicensePlate';
import SendWhatsAppModal from '@/components/os/SendWhatsAppModal';
import { CHECKUP_MODELS, CHECKUP_TEMPLATE, itemQuote, mechanicWhatsappLink, modelItemKeys, modelLabel, modelOf, publicReportUrl } from '@/lib/checkup';
import { systemsOf } from '@/lib/checkupStatus';
import {
  ACTION_LABEL, attentionOf, kpisOf, rowOf, sinceLabel,
  type Action, type Attention, type PanelCheckup, type Row, type ScheduledOs,
} from '@/lib/checkupPanel';
import type { Situation } from '@/lib/checkupStatus';
import type { WorkshopMechanic } from '@/types/database';

/* Painel do gestor: Painel · Inspeções · Histórico · Modelos.
   Um botão principal por card/linha; tudo calculado em lib/checkupPanel. */

export type Tab = 'painel' | 'inspecoes' | 'historico' | 'modelos';
type Filter = 'todos' | 'agendados' | 'andamento' | 'aguardando' | 'finalizados' | 'aprovados';

const TAB_LABEL: Record<Tab, string> = { painel: 'Painel', inspecoes: 'Inspeções', historico: 'Histórico', modelos: 'Modelos' };
const FILTER_LABEL: Record<Exclude<Filter, 'aprovados'>, string> = {
  todos: 'Todos', agendados: 'Agendados', andamento: 'Em andamento', aguardando: 'Aguardando cliente', finalizados: 'Finalizados',
};
const PANEL_LIMIT = 12;

const SITUATION_PILL: Record<Situation, { label: string; cls: string }> = {
  nao_iniciado:  { label: 'Não iniciado',          cls: 'bg-steel-100 text-steel-600' },
  inspecionando: { label: 'Em inspeção',           cls: 'bg-brand-50 text-brand-700' },
  falta_enviar:  { label: 'Pronto · falta enviar', cls: 'bg-pending-500/15 text-pending-700' },
  enviado:       { label: 'Enviado ao cliente',    cls: 'bg-sky-50 text-sky-700' },
  cliente_viu:   { label: 'Cliente viu',           cls: 'bg-sky-50 text-sky-700' },
  aprovado:      { label: 'Aprovado',              cls: 'bg-signal-100 text-signal-800' },
  respondido:    { label: 'Respondido',            cls: 'bg-steel-100 text-steel-600' },
  refeito:       { label: 'Refeito',               cls: 'bg-steel-100 text-steel-500' },
};

const carOf = (v: { make: string | null; model: string | null; year: number | null } | null) =>
  v ? [v.make, v.model, v.year].filter(Boolean).join(' ') || 'Veículo' : 'Veículo';

export default function ManagerPanel({ tab, onTab, list, scheduled, mechanics, workshopName, onStartOs, onSchedule, onNew }: {
  tab: Tab; onTab: (t: Tab) => void;
  /** null = carregando */
  list: PanelCheckup[] | null;
  scheduled: ScheduledOs[];
  mechanics: Pick<WorkshopMechanic, 'id' | 'name'>[];
  workshopName?: string;
  onStartOs: (osId: string) => void;
  onSchedule: () => void;
  onNew: () => void;
}) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('todos');
  const [period, setPeriod] = useState<7 | 30>(7);
  const [search, setSearch] = useState('');
  const [mechFilter, setMechFilter] = useState('');
  const [wa, setWa] = useState<Row | null>(null);
  const [starting, setStarting] = useState<string | null>(null);

  const rows = useMemo(() => (list ?? []).map(rowOf), [list]);
  const k = useMemo(() => kpisOf(rows, scheduled, period), [rows, scheduled, period]);
  const attention = useMemo(() => attentionOf(rows, scheduled), [rows, scheduled]);

  function act(action: Action, row?: Row, os?: ScheduledOs) {
    if (action === 'iniciar' && os) { setStarting(os.id); onStartOs(os.id); return; }
    if (!row) return;
    const c = row.c;
    if ((action === 'abrir_os' || action === 'definir_responsavel') && c.sale_os_id) { navigate(`/oficina/os/${c.sale_os_id}`); return; }
    if (action === 'abrir_novo' && c.replaced_by) { navigate(`/oficina/checkup/${c.replaced_by}`); return; }
    if (action === 'whatsapp') { setWa(row); return; }
    if (action === 'cobrar_mecanico') {
      const valid = c.mechanic_token && c.mechanic_token_expires_at && new Date(c.mechanic_token_expires_at) > new Date();
      if (valid) {
        window.open(mechanicWhatsappLink(c, { token: c.mechanic_token!, mechanic_name: c.mechanic?.name ?? null, mechanic_phone: c.mechanic?.phone ?? null }), '_blank', 'noopener');
        return;
      }
      // Link vencido: reenviar pela tela do check-up (gera um novo)
    }
    navigate(`/oficina/checkup/${c.id}`);
  }

  function waText(r: Row) {
    const c = r.c;
    const first = c.customer_name?.trim().split(' ')[0];
    const car = `${carOf(c)}${c.plate ? ` (${c.plate})` : ''}`;
    const hasQuote = c.items.some(i => itemQuote(i) > 0);
    return `Olá${first ? ` ${first}` : ''}! Aqui é da ${workshopName || 'oficina'}. ` +
      (hasQuote
        ? `Conseguiu ver o orçamento do check-up do ${car}? Pelo link você aprova o que quiser e já escolhe o horário: `
        : `Conseguiu ver o relatório do check-up do ${car}? Qualquer dúvida é só me chamar: `) +
      publicReportUrl(c.public_token);
  }

  const loading = list === null;

  return (
    <div className="space-y-5">
      {/* Abas do módulo */}
      <div className="flex gap-1 border-b border-steel-200 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
        {(Object.keys(TAB_LABEL) as Tab[]).map(t => (
          <button key={t} onClick={() => onTab(t)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition ${
              tab === t ? 'border-brand-500 text-steel-900' : 'border-transparent text-steel-500 hover:text-steel-800'}`}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card text-center text-steel-500 text-sm py-10">Carregando…</div>
      ) : tab === 'painel' ? (
        <>
          {/* KPIs — clicar filtra a lista */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Agendados hoje" value={k.agendadosHoje} active={filter === 'agendados'} onClick={() => setFilter('agendados')} />
            <Kpi label="Em andamento" value={k.andamento} active={filter === 'andamento'} onClick={() => setFilter('andamento')} />
            <Kpi label="Aguardando cliente" value={k.aguardando} active={filter === 'aguardando'} onClick={() => setFilter('aguardando')} />
            <Kpi label={`Aprovados (${period} dias)`} value={k.aprovados} active={filter === 'aprovados'} onClick={() => setFilter('aprovados')}
              extra={
                <span className="inline-flex rounded-lg bg-steel-100 p-0.5 text-[10px] font-bold" onClick={e => e.stopPropagation()}>
                  {([7, 30] as const).map(p => (
                    <button key={p} onClick={() => setPeriod(p)}
                      className={`px-1.5 py-0.5 rounded-md ${period === p ? 'bg-white text-steel-800 shadow-sm' : 'text-steel-500'}`}>{p}d</button>
                  ))}
                </span>
              } />
          </div>

          {/* Atenção agora */}
          {attention.length > 0 && (
            <section className="card !p-0 overflow-hidden border-pending-200">
              <div className="px-5 py-3 bg-pending-50 border-b border-pending-200 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-pending-800">⚠️ Atenção agora</h2>
                {attention.length > 5 && <span className="text-xs text-pending-800">mostrando 5 de {attention.length}</span>}
              </div>
              <ul className="divide-y divide-steel-100">
                {attention.slice(0, 5).map(a => <AttentionRow key={a.key} a={a} busy={starting === a.os?.id} onAct={() => act(a.action, a.row, a.os)} />)}
              </ul>
            </section>
          )}

          <CheckupList rows={rows} scheduled={scheduled} filter={filter} onFilter={setFilter}
            approvedIds={k.approvedIds} period={period} limit={PANEL_LIMIT} starting={starting}
            onAct={act} onMore={() => onTab('inspecoes')} onSchedule={onSchedule} onNew={onNew} />
        </>
      ) : tab === 'inspecoes' ? (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input sm:max-w-xs" placeholder="Buscar placa, carro ou cliente…" value={search} onChange={e => setSearch(e.target.value)} />
            <select className="input sm:max-w-[14rem]" value={mechFilter} onChange={e => setMechFilter(e.target.value)}>
              <option value="">Todos os mecânicos</option>
              <option value="-">Sem responsável</option>
              {mechanics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <CheckupList rows={rows} scheduled={scheduled} filter={filter} onFilter={setFilter}
            approvedIds={k.approvedIds} period={period} starting={starting} search={search} mechFilter={mechFilter}
            onAct={act} onSchedule={onSchedule} onNew={onNew} />
        </>
      ) : tab === 'historico' ? (
        <History rows={rows} onAct={act} />
      ) : (
        <ModelsSoon />
      )}

      {wa && (
        <SendWhatsAppModal phone={wa.c.customer_phone}
          messages={[{ key: 'retorno', label: 'Retorno do check-up', text: waText(wa) }]}
          onClose={() => setWa(null)} />
      )}
    </div>
  );
}

/* ─── KPI ─────────────────────────────────────────────────── */
function Kpi({ label, value, active, onClick, extra }: {
  label: string; value: number; active: boolean; onClick: () => void; extra?: React.ReactNode;
}) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()}
      className={`card !p-4 text-left cursor-pointer transition hover:shadow-md ${active ? 'ring-2 ring-brand-500' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-steel-500">{label}</span>
        {extra}
      </div>
      <div className="text-3xl font-bold font-display text-steel-900 mt-1">{value}</div>
    </div>
  );
}

/* ─── Atenção agora: uma linha, um botão ───────────────────── */
function AttentionRow({ a, busy, onAct }: { a: Attention; busy: boolean; onAct: () => void }) {
  const c = a.row?.c;
  const plate = c ? c.plate : a.os?.vehicle?.plate ?? null;
  const car = c ? carOf(c) : carOf(a.os?.vehicle ?? null);
  const who = c ? c.customer_name : a.os?.customer?.full_name;
  return (
    <li className="px-5 py-3 flex flex-col sm:grid sm:grid-cols-[minmax(0,34rem)_auto] sm:justify-start sm:items-center gap-2 sm:gap-6">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 min-w-0">
          {plate && <LicensePlate plate={plate} size="sm" />}
          <span className="text-sm font-semibold text-steel-800 truncate">{car}{who && <span className="font-normal text-steel-500"> · {who}</span>}</span>
        </div>
        <div className="text-xs text-pending-800">{a.reason}</div>
      </div>
      <button onClick={onAct} disabled={busy}
        className={`text-sm !py-2 sm:min-w-40 ${a.action === 'whatsapp' ? 'btn-primary !bg-[#25D366]' : 'btn-primary'}`}>
        {busy ? 'Abrindo…' : `${ACTION_LABEL[a.action]} →`}
      </button>
    </li>
  );
}

/* ─── Lista com filtros (Painel e Inspeções) ───────────────── */
function CheckupList({ rows, scheduled, filter, onFilter, approvedIds, period, limit, starting, search = '', mechFilter = '', onAct, onMore, onSchedule, onNew }: {
  rows: Row[]; scheduled: ScheduledOs[]; filter: Filter; onFilter: (f: Filter) => void;
  approvedIds: Set<string>; period: number; limit?: number; starting: string | null;
  search?: string; mechFilter?: string;
  onAct: (a: Action, r?: Row, os?: ScheduledOs) => void; onMore?: () => void; onSchedule: () => void; onNew: () => void;
}) {
  const q = search.trim().toLowerCase();
  const matchText = (vals: (string | null | undefined)[]) => !q || vals.some(v => v?.toLowerCase().includes(q));
  const byMech = (id: string | null) => !mechFilter || (mechFilter === '-' ? !id : id === mechFilter);

  const fRows = rows.filter(r => matchText([r.c.plate, r.c.make, r.c.model, r.c.customer_name, r.c.mechanic?.name]) && byMech(r.c.workshop_mechanic_id));
  const fSched = scheduled.filter(o => matchText([o.vehicle?.plate, o.vehicle?.make, o.vehicle?.model, o.customer?.full_name, o.mechanic?.name])
    && byMech(o.workshop_mechanic_id));

  const count = (f: Exclude<Filter, 'aprovados'>) =>
    f === 'todos' ? fRows.length + fSched.length
    : f === 'agendados' ? fSched.length
    : fRows.filter(r => r.bucket === (f === 'finalizados' ? 'finalizado' : f)).length;

  const showSched = filter === 'todos' || filter === 'agendados';
  const shownRows = filter === 'agendados' ? []
    : filter === 'todos' ? fRows
    : filter === 'aprovados' ? fRows.filter(r => approvedIds.has(r.c.id))
    : fRows.filter(r => r.bucket === (filter === 'finalizados' ? 'finalizado' : filter));
  // Aberto primeiro (andamento → aguardando), depois finalizados; dentro de cada um, o mais recente primeiro
  const order = { andamento: 0, aguardando: 1, finalizado: 2 } as const;
  const sorted = [...shownRows].sort((a, b) => order[a.bucket] - order[b.bucket] || b.since.localeCompare(a.since));
  const sched = showSched ? fSched : [];
  const total = sched.length + sorted.length;
  const cut = limit && total > limit;
  const schedShown = cut ? sched.slice(0, limit) : sched;
  const rowsShown = cut ? sorted.slice(0, Math.max(0, limit! - schedShown.length)) : sorted;

  return (
    <section className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {(Object.keys(FILTER_LABEL) as Exclude<Filter, 'aprovados'>[]).map(f => (
          <button key={f} onClick={() => onFilter(f)}
            className={`px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition ${filter === f ? 'bg-steel-900 text-white' : 'bg-white border border-steel-200 text-steel-600 hover:bg-steel-50'}`}>
            {FILTER_LABEL[f]} <span className="opacity-60">({count(f)})</span>
          </button>
        ))}
        {filter === 'aprovados' && (
          <button onClick={() => onFilter('todos')} className="px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap bg-signal-600 text-white">
            Aprovados ({period} dias) ✕
          </button>
        )}
      </div>

      {total === 0 ? (
        <div className="card text-center py-10 space-y-3">
          {rows.length + scheduled.length === 0 ? (
            <>
              <div className="text-4xl">🩺</div>
              <div className="font-bold text-steel-800">Nenhum check-up ainda</div>
              <p className="text-sm text-steel-500 max-w-md mx-auto">
                Agende ou crie o primeiro. O mecânico faz a inspeção (aqui ou pelo celular), você coloca os valores e o cliente aprova pelo link.
              </p>
              <div className="flex gap-2 justify-center">
                <button onClick={onSchedule} className="btn-ghost text-sm border border-steel-200">📅 Agendar</button>
                <button onClick={onNew} className="btn-primary text-sm">+ Novo check-up</button>
              </div>
            </>
          ) : <div className="text-sm text-steel-500">Nada por aqui.</div>}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {schedShown.map(o => <ScheduledCard key={o.id} o={o} busy={starting === o.id} onStart={() => onAct('iniciar', undefined, o)} />)}
          {rowsShown.map(r => <CheckupCard key={r.c.id} r={r} onAct={a => onAct(a, r)} />)}
        </div>
      )}

      {cut && onMore && (
        <div className="text-center">
          <button onClick={onMore} className="text-sm font-semibold text-brand-600 hover:underline">Ver todos em Inspeções ({total}) →</button>
        </div>
      )}
    </section>
  );
}

/* ─── Card de check-up ─────────────────────────────────────── */
function CheckupCard({ r, onAct, replacedOn }: {
  r: Row; onAct: (a: Action) => void;
  /** Refeito: data do check-up novo (null = não carregado) */
  replacedOn?: string | null;
}) {
  const { c, counts } = r;
  const pill = SITUATION_PILL[r.situation];
  const draft = c.status === 'draft';
  return (
    <div className="card !p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            {c.plate && <LicensePlate plate={c.plate} size="sm" />}
            <span className="font-semibold text-steel-800 truncate">{carOf(c)}</span>
          </div>
          <div className="text-xs text-steel-500 truncate">
            {[c.customer_name, c.mechanic?.name ? `🔧 ${c.mechanic.name}` : '🔧 sem responsável'].filter(Boolean).join(' · ')}
          </div>
          {c.template_key && (
            <div className="text-[11px] font-semibold text-steel-600 truncate">{modelOf(c.template_key).icon} {modelLabel(c.template_key, systemsOf(c.items))}</div>
          )}
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide rounded-md px-2 py-1 shrink-0 ${pill.cls}`}>{pill.label}</span>
      </div>

      <div className="space-y-1.5">
        {draft && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-steel-100 overflow-hidden">
              <div className="h-full bg-brand-500" style={{ width: `${counts.progress}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-steel-600 shrink-0">{counts.answered} de {counts.total} itens</span>
          </div>
        )}
        <div className="text-xs text-steel-600 flex flex-wrap gap-x-3">
          <span>🟢 {counts.ok} OK</span>
          <span>🟡 {counts.warn} Atenção</span>
          <span>🔴 {counts.urgent} Urgente</span>
        </div>
      </div>

      <div className="mt-auto space-y-2">
        <div className={`text-[11px] ${r.situation === 'falta_enviar' && r.noPrice ? 'text-pending-700 font-semibold' : 'text-steel-400'}`}>
          {r.situation === 'refeito'
            ? `Substituído pelo check-up${replacedOn ? ` de ${new Date(replacedOn).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ' novo'}`
            : <>{sinceLabel(r)}{r.situation === 'falta_enviar' && r.noPrice > 0 && ` · ${r.noPrice} sem preço`}</>}
        </div>
        <button onClick={() => onAct(r.action)}
          className={`w-full text-sm !py-2 ${r.action === 'whatsapp' ? 'btn-primary !bg-[#25D366]'
            : r.action === 'ver' || r.action === 'abrir_os' || r.action === 'abrir_novo' ? 'btn-ghost border border-steel-300 bg-white font-semibold' : 'btn-primary'}`}>
          {ACTION_LABEL[r.action]} →
        </button>
      </div>
    </div>
  );
}

function ScheduledCard({ o, busy, onStart }: { o: ScheduledOs; busy: boolean; onStart: () => void }) {
  const when = new Date(o.scheduled_at);
  const today = new Date().toDateString() === when.toDateString();
  const late = when.getTime() < Date.now();
  return (
    <div className="card !p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 min-w-0">
            {o.vehicle?.plate && <LicensePlate plate={o.vehicle.plate} size="sm" />}
            <span className="font-semibold text-steel-800 truncate">{carOf(o.vehicle)}</span>
          </div>
          <div className="text-xs text-steel-500 truncate">
            {[o.customer?.full_name, o.mechanic?.name ? `🔧 ${o.mechanic.name}` : '🔧 sem responsável'].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wide rounded-md px-2 py-1 shrink-0 bg-steel-100 text-steel-600">Agendado</span>
      </div>
      <div className={`text-xs font-semibold ${late ? 'text-alert-600' : today ? 'text-brand-600' : 'text-steel-600'}`}>
        📅 {today ? 'Hoje' : when.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
        {' às '}{when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{late && ' · atrasado'}
        <span className="font-normal text-steel-400"> · OS nº {String(o.number ?? '').padStart(4, '0')}</span>
      </div>
      <button onClick={onStart} disabled={busy} className="btn-primary w-full text-sm !py-2 mt-auto">{busy ? 'Abrindo…' : 'Iniciar →'}</button>
    </div>
  );
}

/* ─── Histórico: finalizados e resultado no período ────────── */
function History({ rows, onAct }: { rows: Row[]; onAct: (a: Action, r?: Row) => void }) {
  const [days, setDays] = useState<30 | 90 | 365>(30);
  const from = Date.now() - days * 86400000;
  const done = rows.filter(r => r.bucket === 'finalizado' && new Date(r.since).getTime() >= from)
    .sort((a, b) => b.since.localeCompare(a.since));
  // Refeito fica na lista, mas não conta no resultado (quem conta é o check-up novo)
  const answered = done.filter(r => r.situation !== 'refeito');
  const approved = answered.filter(r => r.situation === 'aprovado').length;
  const remind = answered.filter(r => r.situation === 'respondido' && r.c.items.some(i => i.customer_decision === 'remind')).length;
  const declined = answered.length - approved - remind;
  const byId = new Map(rows.map(r => [r.c.id, r.c]));
  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-sm text-steel-600">
          {answered.length === 0 ? 'Nenhum cliente respondeu no período.' : (
            <><strong className="text-steel-900">{approved} de {answered.length}</strong> clientes aprovaram
              {remind > 0 && <> · {remind} pediram para lembrar depois</>}
              {declined > 0 && <> · {declined} não aprovaram agora</>}</>
          )}
        </div>
        <div className="inline-flex rounded-xl bg-steel-100 p-1 text-xs font-semibold self-start">
          {([30, 90, 365] as const).map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg ${days === d ? 'bg-white text-steel-900 shadow-sm' : 'text-steel-500'}`}>
              {d === 365 ? '12 meses' : `${d} dias`}
            </button>
          ))}
        </div>
      </div>
      {done.length > 0 && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {done.map(r => <CheckupCard key={r.c.id} r={r} onAct={a => onAct(a, r)}
            replacedOn={r.c.replaced_by ? byId.get(r.c.replaced_by)?.created_at ?? null : undefined} />)}
        </div>
      )}
    </section>
  );
}

/* ─── Modelos: o que cada tipo de check-up verifica ────────── */
function ModelsSoon() {
  return (
    <section className="space-y-3">
      <p className="text-sm text-steel-500">
        Escolha o tipo na hora de criar o check-up. Check-up de uma OS já sugere o tipo pelo serviço (ex.: freio → Freios e suspensão),
        e dá para trocar antes de começar. O mecânico sempre pode incluir um item fora do modelo.
      </p>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {CHECKUP_MODELS.map(m => {
          const keys = m.key === 'custom' ? [] : modelItemKeys(m.key);
          const systems = CHECKUP_TEMPLATE.filter(s => s.items.some(i => keys.includes(i.key))).map(s => s.system);
          return (
            <div key={m.key} className="card !p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-steel-800">{m.icon} {m.label}</span>
                <span className="text-xs font-semibold text-steel-500">{m.key === 'custom' ? 'você escolhe' : `${keys.length} itens`}</span>
              </div>
              <div className="text-xs text-steel-500">{m.desc}</div>
              {systems.length > 0 && <div className="text-[11px] text-steel-400">{systems.join(' · ')}</div>}
              {m.partial && <div className="text-[11px] text-pending-700">Relatório do cliente: “estado dos itens verificados”</div>}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-steel-400">Modelos criados pela própria oficina (com itens seus): em breve.</p>
    </section>
  );
}
