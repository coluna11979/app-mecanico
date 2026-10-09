import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { sessionAllows, useOperator } from '@/lib/operators';
import LicensePlate from '@/components/os/LicensePlate';
import SendWhatsAppModal from '@/components/os/SendWhatsAppModal';
import { fmtBRL } from '@/components/os/osHelpers';
import { publicReportUrl } from '@/lib/checkup';
import { fetchAll } from '@/lib/fetchAll';
import PeriodPicker, { PRESETS, usePeriod, type Preset } from '@/components/PeriodPicker';
import { useModuleAllows } from '@/lib/modules';
import { toast } from '@/components/ui/Toast';
import {
  buildOpps, daysSince, followUps, funnelOf, type CkRow, type FollowUp, type Opp, type OsQuote, type Stage,
} from '@/lib/commercialFunnel';

const STAGES: { key: Stage; title: string; icon: string; hint: string }[] = [
  { key: 'montando',   title: 'Montando orçamento', icon: '🛠', hint: 'agora' },
  { key: 'aguardando', title: 'Aguardando cliente', icon: '⏳', hint: 'agora' },
  { key: 'aprovado',   title: 'Aprovado',           icon: '✅', hint: 'no período' },
  { key: 'recusado',   title: 'Perdido',            icon: '✕',  hint: 'recusados no período' },
];
const STAGE_LABEL: Record<Stage, string> = {
  montando: 'Montando', aguardando: 'Aguardando', aprovado: 'Aprovado', recusado: 'Recusado', lembrar: 'Lembrar depois',
};
const STAGE_BADGE: Record<Stage, string> = {
  montando: 'bg-steel-100 text-steel-700', aguardando: 'bg-pending-100 text-pending-800', aprovado: 'bg-signal-100 text-signal-700',
  recusado: 'bg-alert-100 text-alert-700', lembrar: 'bg-brand-50 text-brand-700',
};

const MONTHS_BACK = 12;

/** Interessado: conversa do WhatsApp marcada como oportunidade, antes de existir orçamento */
type Lead = {
  id: string; phone: string; name: string | null; customer_id: string | null;
  lead_at: string; lead_note: string | null; lead_value: number | null; lead_by: string | null;
  customer: { full_name: string } | null;
};
type View = 'lista' | 'colunas';
const LS_VIEW = 'comercial_view';
const loadView = (): View => { try { return localStorage.getItem(LS_VIEW) === 'colunas' ? 'colunas' : 'lista'; } catch { return 'lista'; } };

/**
 * Comercial: funil simples dos orçamentos (check-up e OS enviada para aprovação),
 * quem precisa de retorno hoje e a lista da etapa escolhida.
 */
export default function Comercial() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const canOpen = (path: string) => !balcao || !session || sessionAllows(session, path);
  const period = usePeriod('comercial-periodo', 'month');
  const { preset, range } = period;

  const [checkups, setCheckups] = useState<CkRow[] | null>(null);
  const [osQuotes, setOsQuotes] = useState<OsQuote[]>([]);
  const [ckSaleOs, setCkSaleOs] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState<Stage | 'interessado'>('aguardando');
  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(LS_VIEW, v); } catch { /* sem localStorage */ } };
  const inboxOn = useModuleAllows()('/oficina/inbox');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [origin, setOrigin] = useState<'all' | 'checkup' | 'os'>('all');
  const [mechanic, setMechanic] = useState('all');
  const [moreFilters, setMoreFilters] = useState(false);
  const [showAllFu, setShowAllFu] = useState(false);
  const [wa, setWa] = useState<Opp | null>(null);

  useEffect(() => {
    if (!wid) return;
    setCheckups(null);
    const since = new Date(); since.setMonth(since.getMonth() - MONTHS_BACK);
    const s = since.toISOString();
    (async () => {
      const [ck, os, links] = await Promise.all([
        // Check-ups finalizados: os em aberto (qualquer data) e os dos últimos 12 meses
        fetchAll((a, b) => supabase.from('vehicle_checkups')
          .select('*, mechanic:workshop_mechanics(name), items:checkup_items(status, quote_labor, quote_parts, customer_decision), sale_os:service_orders!vehicle_checkups_sale_os_id_fkey(number, status, price)')
          .eq('workshop_id', wid).eq('status', 'completed')
          .or(`and(sale_os_id.is.null,customer_responded_at.is.null),completed_at.gte.${s},customer_responded_at.gte.${s}`)
          .order('completed_at', { ascending: false }).order('id').range(a, b)),
        // Orçamentos de OS que foram enviados para aprovação
        fetchAll((a, b) => supabase.from('service_orders')
          .select('id, number, title, status, quote_status, price, approval_requested_at, approved_at, customer_id, customer:customers(id, full_name, phone), vehicle:vehicles(make, model, plate)')
          .eq('workshop_id', wid).not('approval_requested_at', 'is', null)
          .or(`status.eq.awaiting_approval,approval_requested_at.gte.${s}`)
          .order('id').range(a, b)),
        // OS que nasceram de check-up (não entram de novo como orçamento de OS)
        fetchAll((a, b) => supabase.from('vehicle_checkups').select('sale_os_id')
          .eq('workshop_id', wid).not('sale_os_id', 'is', null).order('id').range(a, b)),
      ]);
      setOsQuotes((os.data as unknown as OsQuote[]) ?? []);
      setCkSaleOs(new Set(((links.data ?? []) as { sale_os_id: string }[]).map(x => x.sale_os_id)));
      setCheckups((ck.data as unknown as CkRow[]) ?? []);
    })();
  }, [wid]);

  /** Interessados que ainda não viraram orçamento (OS ou check-up do cliente depois de marcar) */
  const loadLeads = useCallback(async () => {
    if (!wid || !inboxOn) { setLeads([]); return; }
    const { data } = await supabase.from('whatsapp_chats')
      .select('id, phone, name, customer_id, lead_at, lead_note, lead_value, lead_by, customer:customers(full_name)')
      .eq('workshop_id', wid).not('lead_at', 'is', null).order('lead_at', { ascending: false });
    const rows = (data ?? []) as unknown as Lead[];
    const ids = [...new Set(rows.map(r => r.customer_id).filter(Boolean))] as string[];
    if (!ids.length) { setLeads(rows); return; }
    const oldest = rows.reduce((m, r) => (r.lead_at < m ? r.lead_at : m), rows[0].lead_at);
    const [os, ck] = await Promise.all([
      supabase.from('service_orders').select('customer_id, created_at').in('customer_id', ids).gte('created_at', oldest),
      supabase.from('vehicle_checkups').select('customer_id, created_at').in('customer_id', ids).gte('created_at', oldest),
    ]);
    const later = [...(os.data ?? []), ...(ck.data ?? [])] as { customer_id: string; created_at: string }[];
    setLeads(rows.filter(r => !r.customer_id || !later.some(x => x.customer_id === r.customer_id && x.created_at >= r.lead_at)));
  }, [wid, inboxOn]);
  useEffect(() => { loadLeads(); }, [loadLeads]);

  async function discardLead(l: Lead) {
    if (!confirm(`Tirar ${l.customer?.full_name ?? l.name ?? 'este contato'} dos interessados?`)) return;
    const { error } = await supabase.from('whatsapp_chats')
      .update({ lead_at: null, lead_note: null, lead_value: null, lead_by: null }).eq('id', l.id);
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    loadLeads();
  }
  const leadsValue = leads.reduce((a, l) => a + Number(l.lead_value ?? 0), 0);

  const opps = useMemo(() => buildOpps(checkups ?? [], osQuotes, ckSaleOs), [checkups, osQuotes, ckSaleOs]);
  const fu = useMemo(() => followUps(opps), [opps]);
  const fn = useMemo(() => funnelOf(opps, range), [opps, range]);
  const prevFn = useMemo(() => {
    const len = range.to.getTime() - range.from.getTime();
    return funnelOf(opps, { from: new Date(range.from.getTime() - len), to: range.from });
  }, [opps, range]);

  const mechanics = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of opps) if (o.mechanicId && o.mechanicName) m.set(o.mechanicId, o.mechanicName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [opps]);

  const list = useMemo(() => {
    if (stage === 'interessado') return [];
    const base = stage === 'montando' ? fn.montando : stage === 'aguardando' ? fn.aguardando
      : stage === 'aprovado' ? fn.aprovado : stage === 'recusado' ? fn.recusado : fn.lembrar;
    return base
      .filter(o => origin === 'all' || o.origin === origin)
      .filter(o => mechanic === 'all' || o.mechanicId === mechanic)
      .sort((a, b) => (a.stage === 'montando' || a.stage === 'aguardando')
        ? (daysSince(b.since) ?? 0) - (daysSince(a.since) ?? 0)
        : (b.since ?? '').localeCompare(a.since ?? ''));
  }, [fn, stage, origin, mechanic]);

  const loading = checkups === null;
  const convDelta = fn.conversion != null && prevFn.conversion != null ? Math.round(fn.conversion - prevFn.conversion) : null;
  const shownFu = showAllFu ? fu : fu.slice(0, 5);
  const shop = currentWorkshop?.business_name ?? 'a oficina';

  function waMessage(o: Opp) {
    const first = o.customerName?.trim().split(' ')[0];
    const car = `${o.car}${o.plate ? ` (${o.plate})` : ''}`;
    if (o.origin === 'checkup' && o.publicToken) {
      return `Olá${first ? ` ${first}` : ''}! Aqui é da ${shop}. Conseguiu ver o orçamento do check-up do ${car}? ` +
        `Pelo link você aprova o que quiser e já escolhe o horário: ${publicReportUrl(o.publicToken)}`;
    }
    return `Olá${first ? ` ${first}` : ''}! Aqui é da ${shop}. Conseguiu ver o orçamento do ${car}` +
      `${o.saleOsNumber != null ? ` (OS nº ${String(o.saleOsNumber).padStart(4, '0')})` : ''} no valor de ${fmtBRL(o.value)}? ` +
      `É só responder SIM para aprovar ou me chamar se tiver dúvida.`;
  }
  const openLink = (o: Opp) => (o.origin === 'checkup' ? `/oficina/checkup/${o.id}` : `/oficina/os/${o.id}`);

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Topo */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">Comercial</h1>
            <p className="text-xs text-steel-500 mt-0.5">Orçamentos de check-up e de OS: do envio até a aprovação.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select className="input !py-2 text-sm flex-1 sm:hidden" value={preset} onChange={e => period.setPreset(e.target.value as Preset)}>
              {PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <div className="hidden sm:block"><PeriodPicker period={period} /></div>
            <div className="hidden md:flex rounded-xl border border-steel-200 bg-white p-0.5 shrink-0">
              {(['lista', 'colunas'] as View[]).map(v => (
                <button key={v} type="button" onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${view === v ? 'bg-steel-900 text-white' : 'text-steel-600 hover:bg-steel-50'}`}>
                  {v === 'lista' ? '☰ Lista' : '▥ Colunas'}
                </button>
              ))}
            </div>
            {canOpen('/oficina/checkup') && <Link to="/oficina/checkup" className="btn-primary text-sm !py-2 shrink-0">+ Novo check-up</Link>}
          </div>
        </div>
        {preset === 'custom' && (
          <div className="sm:hidden flex items-center gap-1.5">
            <input type="date" className="input !py-1.5 text-sm" value={period.custom.from} onChange={e => period.setCustom(c => ({ ...c, from: e.target.value }))} />
            <span className="text-steel-400 text-sm">a</span>
            <input type="date" className="input !py-1.5 text-sm" value={period.custom.to} onChange={e => period.setCustom(c => ({ ...c, to: e.target.value }))} />
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi label="Em aberto" value={String(fn.open.length)} sub="montando + aguardando cliente" />
              <Kpi label="Valor em aberto" value={fmtBRL(fn.openValue)} sub={fn.viewedWaiting ? `${fn.viewedWaiting} já viram o orçamento` : 'aguardando decisão'} />
              <Kpi label="Conversão" value={fn.conversion == null ? '—' : `${Math.round(fn.conversion)}%`}
                sub={fn.conversion == null ? 'nenhuma resposta no período' : convDelta != null ? `${convDelta >= 0 ? '▲' : '▼'} ${Math.abs(convDelta)} pts vs. período anterior` : 'dos respondidos no período'}
                tip="Dos orçamentos respondidos no período, quantos foram aprovados (lembrar depois conta como não aprovado)." />
              <Kpi label="Aprovados no período" value={`${fn.aprovado.length}`} dark
                sub={fn.aprovado.length ? `${fmtBRL(fn.approvedValue)} · ticket ${fmtBRL(fn.ticket)}` : 'nenhum no período'} />
            </div>

            {view === 'colunas' ? (
              <div className="hidden md:block">
                <Board
                  leads={inboxOn ? leads : null} leadsValue={leadsValue} fn={fn}
                  canOpen={canOpen} openLink={openLink} onWa={setWa} onDiscardLead={discardLead}
                />
              </div>
            ) : null}
            <div className={view === 'colunas' ? 'md:hidden space-y-5' : 'space-y-5'}>
            {/* Funil */}
            <div>
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-4 snap-x">
                {STAGES.map((s, i) => {
                  const n = fn[s.key].length;
                  const v = fn.values[s.key];
                  const active = stage === s.key;
                  return (
                    <button key={s.key} onClick={() => setStage(s.key)}
                      className={`snap-start shrink-0 w-44 sm:w-auto text-left rounded-2xl border p-3 transition relative ${active ? 'border-steel-900 bg-white shadow-sm ring-1 ring-steel-900' : 'border-steel-200 bg-white hover:border-steel-300'}`}>
                      <div className="text-xs font-semibold text-steel-600">{s.icon} {s.title}</div>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-2xl font-bold font-display">{n}</span>
                        <span className="text-sm text-steel-500">{fmtBRL(v)}</span>
                      </div>
                      <div className="text-[10px] text-steel-400 mt-0.5">
                        {s.key === 'aprovado' && fn.conversion != null ? `${Math.round(fn.conversion)}% dos respondidos · ` : ''}{s.hint}
                      </div>
                      {i < 2 && <span className="hidden sm:block absolute -right-2.5 top-1/2 -translate-y-1/2 text-steel-300 text-lg z-10">›</span>}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-xs">
                <span className="text-steel-500">
                  {fn.leaks[0] ? <>Maior gargalo: <strong className="text-steel-700">{fn.leaks[0].n} {fn.leaks[0].label}</strong></> : 'Sem gargalos no momento.'}
                </span>
                <div className="flex flex-wrap gap-2">
                {inboxOn && (
                  <button onClick={() => setStage('interessado')}
                    className={`rounded-full px-3 py-1 border transition ${stage === 'interessado' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    💬 Interessados · {leads.length}{leadsValue > 0 && <span className="opacity-70"> · ~{fmtBRL(leadsValue)}</span>}
                  </button>
                )}
                <button onClick={() => setStage('lembrar')}
                  className={`rounded-full px-3 py-1 border transition ${stage === 'lembrar' ? 'bg-brand-600 text-white border-brand-600' : 'bg-brand-50 text-brand-700 border-brand-200'}`}>
                  🔔 Lembrar depois · {fn.lembrar.length} <span className="opacity-70">(retorno futuro, não é perda)</span>
                </button>
                </div>
              </div>
            </div>

            {/* Quem precisa de retorno hoje */}
            <div className="card !p-0 overflow-hidden">
              <div className="px-5 py-3 flex items-center justify-between border-b border-steel-100">
                <div className="font-bold text-sm">📞 Quem precisa de retorno hoje {fu.length > 0 && <span className="text-steel-400 font-medium">({fu.length})</span>}</div>
              </div>
              {fu.length === 0 ? (
                <p className="px-5 py-6 text-sm text-steel-500 text-center">Ninguém para cobrar agora. Os orçamentos estão em dia. 👏</p>
              ) : (
                <ul className="divide-y divide-steel-100">
                  {shownFu.map(f => <FollowUpRow key={f.opp.key} f={f} canOpen={canOpen} openLink={openLink(f.opp)} onWa={() => setWa(f.opp)} />)}
                </ul>
              )}
              {fu.length > 5 && (
                <button onClick={() => setShowAllFu(v => !v)} className="w-full py-2.5 text-sm font-semibold text-brand-700 border-t border-steel-100 hover:bg-steel-50">
                  {showAllFu ? 'Mostrar menos' : `Ver todos (${fu.length})`}
                </button>
              )}
            </div>

            {/* Lista da etapa */}
            <div className="card !p-0 overflow-hidden">
              <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-steel-100">
                <div className="font-bold text-sm">{stage === 'interessado' ? '💬 Interessados' : STAGE_LABEL[stage]} <span className="text-steel-400 font-medium">({stage === 'interessado' ? leads.length : list.length})</span>
                  <span className="text-xs font-normal text-steel-400 ml-2">{stage === 'interessado' ? 'pediram preço no WhatsApp, ainda sem orçamento' : stage === 'montando' || stage === 'aguardando' ? 'situação de agora' : 'no período'}</span>
                </div>
                <button onClick={() => setMoreFilters(v => !v)} className="text-xs font-semibold text-steel-600 hover:text-steel-900">
                  {moreFilters ? 'Menos filtros' : 'Mais filtros'}{(origin !== 'all' || mechanic !== 'all') && ' •'}
                </button>
              </div>
              {moreFilters && (
                <div className="px-5 py-3 flex flex-wrap gap-2 bg-steel-50 border-b border-steel-100">
                  <select className="input !py-1.5 !w-auto text-sm" value={origin} onChange={e => setOrigin(e.target.value as typeof origin)}>
                    <option value="all">Origem: todas</option>
                    <option value="checkup">Veio do check-up (inclui os que viraram OS)</option>
                    <option value="os">Orçamento direto na OS</option>
                  </select>
                  {mechanics.length > 0 && (
                    <select className="input !py-1.5 !w-auto text-sm" value={mechanic} onChange={e => setMechanic(e.target.value)}>
                      <option value="all">Mecânico do check-up: todos</option>
                      {mechanics.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                    </select>
                  )}
                </div>
              )}
              {stage === 'interessado' ? (
                leads.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-steel-500 text-center">
                    Nenhum interessado. No WhatsApp, abra a conversa e toque em “💰 Marcar como interessado”.
                  </p>
                ) : (
                  <ul className="divide-y divide-steel-100">
                    {leads.map(l => <LeadRow key={l.id} l={l} canOpen={canOpen} onDiscard={() => discardLead(l)} />)}
                  </ul>
                )
              ) : list.length === 0 ? (
                <p className="px-5 py-8 text-sm text-steel-500 text-center">
                  {opps.length === 0
                    ? 'Ainda não há orçamentos. Faça um check-up ou envie um orçamento pela OS para começar.'
                    : 'Nada nesta etapa com os filtros escolhidos.'}
                </p>
              ) : (
                <ul className="divide-y divide-steel-100">
                  {list.map(o => <OppRow key={o.key} o={o} canOpen={canOpen} openLink={openLink(o)} onWa={() => setWa(o)} />)}
                </ul>
              )}
            </div>
            </div>
          </>
        )}
      </div>

      {wa && (
        <SendWhatsAppModal phone={wa.phone} customerId={wa.customerId} customerName={wa.customerName} messages={[{ key: 'cobrar', label: 'Retorno do orçamento', text: waMessage(wa) }]} onClose={() => setWa(null)} />
      )}
    </WorkshopLayout>
  );
}

function Kpi({ label, value, sub, tip, dark }: { label: string; value: string; sub?: string; tip?: string; dark?: boolean }) {
  return (
    <div className={`card !p-4 ${dark ? '!bg-steel-900 text-white' : ''}`} title={tip}>
      <div className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-steel-400' : 'text-steel-500'}`}>{label}{tip && <span className="opacity-60 ml-1">ⓘ</span>}</div>
      <div className="text-xl lg:text-2xl font-bold font-display mt-1">{value}</div>
      {sub && <div className={`text-[11px] mt-0.5 ${dark ? 'text-steel-300' : 'text-steel-500'}`}>{sub}</div>}
    </div>
  );
}

function Who({ o }: { o: Opp }) {
  return (
    <div className="min-w-0 flex items-center gap-2">
      {o.plate && <LicensePlate plate={o.plate} size="sm" />}
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{o.customerName ?? 'Cliente avulso'} <span className="font-normal text-steel-500">· {o.car}</span></div>
        <div className="text-[11px] text-steel-400 truncate">
          {o.origin === 'checkup' ? `Check-up${o.saleOsNumber != null ? ` · virou OS nº ${String(o.saleOsNumber).padStart(4, '0')}` : ''}` : `Orçamento da OS${o.saleOsNumber != null ? ` nº ${String(o.saleOsNumber).padStart(4, '0')}` : ''}`}
          {o.mechanicName && ` · 🔧 ${o.mechanicName}`}
        </div>
      </div>
    </div>
  );
}

function FollowUpRow({ f, canOpen, openLink, onWa }: { f: FollowUp; canOpen: (p: string) => boolean; openLink: string; onWa: () => void }) {
  const o = f.opp;
  return (
    <li className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex-1 min-w-0 space-y-1">
        <Who o={o} />
        <div className={`text-xs ${f.days >= 5 ? 'text-alert-600 font-semibold' : 'text-pending-800'}`}>{f.reason}</div>
      </div>
      <div className="text-sm font-bold shrink-0">{o.value > 0 ? fmtBRL(o.value) : <span className="text-xs text-pending-700">sem valor</span>}</div>
      <div className="flex flex-wrap gap-2 shrink-0">
        {f.action === 'enviar' ? (
          canOpen(openLink) && <Link to={openLink} className="btn-primary text-sm !py-2">Enviar orçamento</Link>
        ) : (
          <>
            {o.phone && <button onClick={onWa} className="text-sm font-semibold px-3 py-2 rounded-xl bg-[#25D366] text-white">WhatsApp</button>}
            {canOpen(openLink) && <Link to={openLink} className="btn-secondary text-sm !py-2">{o.origin === 'checkup' ? 'Ver orçamento' : 'Ver OS'}</Link>}
          </>
        )}
        {o.customerId && canOpen('/oficina/clientes') && <Link to={`/oficina/clientes/${o.customerId}`} className="btn-secondary text-sm !py-2">Cliente</Link>}
      </div>
    </li>
  );
}

function OppRow({ o, canOpen, openLink, onWa }: { o: Opp; canOpen: (p: string) => boolean; openLink: string; onWa: () => void }) {
  const d = daysSince(o.since);
  const open = o.stage === 'montando' || o.stage === 'aguardando';
  return (
    <li className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex-1 min-w-0 space-y-1">
        <Who o={o} />
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className={`badge ${STAGE_BADGE[o.stage]}`}>{STAGE_LABEL[o.stage]}</span>
          {o.stage === 'aguardando' && o.viewed && <span className="badge bg-steel-100 text-steel-600">👀 viu</span>}
          {o.stage === 'aprovado' && o.saleOsId && <span className="badge bg-steel-100 text-steel-600">Virou OS{o.saleOsNumber != null ? ` nº ${String(o.saleOsNumber).padStart(4, '0')}` : ''}</span>}
          {d != null && <span className="text-steel-400">{open ? `parado ${d === 0 ? 'hoje' : `há ${d}d`}` : new Date(o.since!).toLocaleDateString('pt-BR')}</span>}
        </div>
      </div>
      <div className="text-sm font-bold shrink-0">{o.value > 0 ? fmtBRL(o.value) : <span className="text-xs text-pending-700">sem valor</span>}</div>
      <div className="flex flex-wrap gap-2 shrink-0">
        {o.stage === 'aguardando' && o.phone && <button onClick={onWa} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#25D366] text-white">WhatsApp</button>}
        {o.stage === 'aprovado' && o.saleOsId && canOpen('/oficina/os') && <Link to={`/oficina/os/${o.saleOsId}`} className="btn-secondary text-xs !py-1.5">Ver OS</Link>}
        {canOpen(openLink) && (
          <Link to={openLink} className={o.stage === 'montando' ? 'btn-primary text-xs !py-1.5' : 'btn-secondary text-xs !py-1.5'}>
            {o.stage === 'montando' ? 'Montar e enviar' : o.origin === 'checkup' ? 'Ver orçamento' : 'Ver OS'}
          </Link>
        )}
      </div>
    </li>
  );
}

/* ── Interessados (conversas do WhatsApp marcadas como oportunidade) ─────────── */

const leadName = (l: Lead) => l.customer?.full_name ?? l.name ?? fmtPhoneShort(l.phone);
function fmtPhoneShort(p: string) {
  let d = p.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : p;
}
const newOsFor = (l: Lead) => (l.customer_id ? `/oficina/os?nova=1&cliente=${l.customer_id}` : '/oficina/os?nova=1');

function LeadRow({ l, canOpen, onDiscard }: { l: Lead; canOpen: (p: string) => boolean; onDiscard: () => void }) {
  const d = daysSince(l.lead_at);
  return (
    <li className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-sm font-semibold truncate">{leadName(l)} <span className="font-normal text-steel-500">· {l.lead_note ?? 'sem descrição'}</span></div>
        <div className="text-[11px] text-steel-400">
          💬 pelo WhatsApp · {d === 0 ? 'hoje' : `há ${d}d`}{l.lead_by ? ` · marcado por ${l.lead_by}` : ''}{!l.customer_id ? ' · sem cadastro' : ''}
        </div>
      </div>
      <div className="text-sm font-bold shrink-0">{l.lead_value ? `~${fmtBRL(Number(l.lead_value))}` : <span className="text-xs text-steel-400">sem valor</span>}</div>
      <div className="flex flex-wrap gap-2 shrink-0">
        {canOpen('/oficina/inbox') && <Link to={`/oficina/inbox?conversa=${l.id}`} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#25D366] text-white">Conversa</Link>}
        {canOpen('/oficina/os') && <Link to={newOsFor(l)} className="btn-primary text-xs !py-1.5">Montar orçamento</Link>}
        <button onClick={onDiscard} className="btn-ghost text-xs !py-1.5">Descartar</button>
      </div>
    </li>
  );
}

/* ── Quadro em colunas (como o pipeline do Cockpit) ─────────────────────────── */

type Fn = ReturnType<typeof funnelOf>;
const COLUMNS: { key: Stage; title: string; dot: string; hint: string }[] = [
  { key: 'montando',   title: 'Montando orçamento', dot: 'bg-steel-400',   hint: 'agora' },
  { key: 'aguardando', title: 'Aguardando cliente', dot: 'bg-pending-500', hint: 'agora' },
  { key: 'aprovado',   title: 'Aprovado',           dot: 'bg-signal-500',  hint: 'no período' },
  { key: 'recusado',   title: 'Perdido',            dot: 'bg-alert-500',   hint: 'no período' },
  { key: 'lembrar',    title: 'Lembrar depois',     dot: 'bg-brand-500',   hint: 'no período' },
];

function Board({ leads, leadsValue, fn, canOpen, openLink, onWa, onDiscardLead }: {
  leads: Lead[] | null; leadsValue: number; fn: Fn;
  canOpen: (p: string) => boolean; openLink: (o: Opp) => string;
  onWa: (o: Opp) => void; onDiscardLead: (l: Lead) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 items-start">
      {leads && (
        <Column title="💬 Interessados" dot="bg-emerald-500" n={leads.length} value={leadsValue} approx hint="pediram preço, sem orçamento">
          {leads.map(l => {
            const d = daysSince(l.lead_at);
            return (
              <div key={l.id} className="rounded-xl border border-steel-200 bg-white p-3 shadow-sm">
                <p className="text-sm font-semibold truncate">{leadName(l)}</p>
                <p className="text-xs text-steel-600 line-clamp-2">{l.lead_note ?? 'sem descrição'}</p>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-sm font-bold">{l.lead_value ? `~${fmtBRL(Number(l.lead_value))}` : <span className="text-xs font-normal text-steel-400">sem valor</span>}</span>
                  <span className={`text-[10px] ${(d ?? 0) >= 3 ? 'text-alert-600 font-semibold' : 'text-steel-400'}`}>{d === 0 ? 'hoje' : `há ${d}d`}</span>
                </div>
                <div className="flex gap-1.5 mt-2">
                  {canOpen('/oficina/os') && <Link to={newOsFor(l)} className="flex-1 text-center text-[11px] font-bold py-1 rounded-lg bg-brand-500 text-white">Orçamento</Link>}
                  {canOpen('/oficina/inbox') && <Link to={`/oficina/inbox?conversa=${l.id}`} className="text-[11px] font-bold px-2 py-1 rounded-lg bg-[#25D366] text-white" title="Abrir conversa">💬</Link>}
                  <button onClick={() => onDiscardLead(l)} className="text-[11px] px-2 py-1 rounded-lg border border-steel-200 text-steel-500" title="Descartar">✕</button>
                </div>
              </div>
            );
          })}
        </Column>
      )}
      {COLUMNS.map(c => (
        <Column key={c.key} title={c.title} dot={c.dot} n={fn[c.key].length} value={fn.values[c.key]} hint={c.hint}>
          {[...fn[c.key]]
            .sort((a, b) => (c.key === 'montando' || c.key === 'aguardando')
              ? (daysSince(b.since) ?? 0) - (daysSince(a.since) ?? 0)
              : (b.since ?? '').localeCompare(a.since ?? ''))
            .map(o => <OppCard key={o.key} o={o} canOpen={canOpen} openLink={openLink(o)} onWa={() => onWa(o)} />)}
        </Column>
      ))}
    </div>
  );
}

function Column({ title, dot, n, value, hint, approx, children }: {
  title: string; dot: string; n: number; value: number; hint: string; approx?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="w-[272px] shrink-0 rounded-2xl border border-steel-200 bg-steel-50/60">
      <div className="px-3 pt-3 pb-2 border-b border-steel-200">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <span className="text-sm font-bold text-steel-800 truncate">{title}</span>
          <span className="ml-auto text-[11px] font-bold px-1.5 rounded-full bg-white border border-steel-200 text-steel-600">{n}</span>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-sm font-semibold text-steel-700">{approx && value > 0 ? '~' : ''}{fmtBRL(value)}</span>
          <span className="text-[10px] text-steel-400">{hint}</span>
        </div>
      </div>
      <div className="p-2 space-y-2 max-h-[62vh] overflow-y-auto">
        {n === 0 ? <p className="text-xs text-steel-400 text-center py-6">Nada aqui</p> : children}
      </div>
    </div>
  );
}

function OppCard({ o, canOpen, openLink, onWa }: { o: Opp; canOpen: (p: string) => boolean; openLink: string; onWa: () => void }) {
  const d = daysSince(o.since);
  const open = o.stage === 'montando' || o.stage === 'aguardando';
  const card = (
    <>
      <div className="flex items-center gap-2">
        {o.plate && <LicensePlate plate={o.plate} size="sm" />}
        <p className="text-sm font-semibold truncate">{o.customerName ?? 'Cliente avulso'}</p>
      </div>
      <p className="text-xs text-steel-500 truncate mt-0.5">{o.car} · {o.origin === 'checkup' ? 'check-up' : `OS${o.saleOsNumber != null ? ` ${String(o.saleOsNumber).padStart(4, '0')}` : ''}`}</p>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-sm font-bold">{o.value > 0 ? fmtBRL(o.value) : <span className="text-xs font-normal text-pending-700">sem valor</span>}</span>
        <span className={`text-[10px] ${open && (d ?? 0) >= 5 ? 'text-alert-600 font-semibold' : 'text-steel-400'}`}>
          {open ? (d === 0 ? 'hoje' : `parado ${d}d`) : o.since ? new Date(o.since).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}
        </span>
      </div>
      {o.stage === 'aguardando' && o.viewed && <span className="inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-steel-100 text-steel-600">👀 viu</span>}
    </>
  );
  return (
    <div className="rounded-xl border border-steel-200 bg-white p-3 shadow-sm">
      {canOpen(openLink) ? <Link to={openLink} className="block hover:opacity-80">{card}</Link> : card}
      {o.stage === 'aguardando' && o.phone && (
        <button onClick={onWa} className="w-full mt-2 text-[11px] font-bold py-1 rounded-lg bg-[#25D366] text-white">Cobrar no WhatsApp</button>
      )}
    </div>
  );
}
