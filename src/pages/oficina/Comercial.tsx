import { useEffect, useMemo, useState } from 'react';
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
  const [stage, setStage] = useState<Stage>('aguardando');
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
                <button onClick={() => setStage('lembrar')}
                  className={`rounded-full px-3 py-1 border transition ${stage === 'lembrar' ? 'bg-brand-600 text-white border-brand-600' : 'bg-brand-50 text-brand-700 border-brand-200'}`}>
                  🔔 Lembrar depois · {fn.lembrar.length} <span className="opacity-70">(retorno futuro, não é perda)</span>
                </button>
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
                <div className="font-bold text-sm">{STAGE_LABEL[stage]} <span className="text-steel-400 font-medium">({list.length})</span>
                  <span className="text-xs font-normal text-steel-400 ml-2">{stage === 'montando' || stage === 'aguardando' ? 'situação de agora' : 'no período'}</span>
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
              {list.length === 0 ? (
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
          </>
        )}
      </div>

      {wa && (
        <SendWhatsAppModal phone={wa.phone} messages={[{ key: 'cobrar', label: 'Retorno do orçamento', text: waMessage(wa) }]} onClose={() => setWa(null)} />
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
