import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll } from '@/lib/fetchAll';
import { fmtBRL, fmtDur } from '@/components/os/osHelpers';
import { arrivalDeadline } from '@/lib/arrivalDeadline';
import PeriodPicker, { usePeriod } from '@/components/PeriodPicker';
import { ChargeInput, loadCharges, saveCharge } from '@/components/marketplace/CustomerCharge';
import { isPlatformOnly, useWorkshopModules } from '@/lib/modules';
import { toast } from '@/components/ui/Toast';
import {
  DEFAULT_EST_PCT, loadEstPct, missingCharges, platformPanel, platformSeries, profitRows, profitTotals, realCostPct, saveEstPct,
  type PlatformItem, type PlatformJob, type PlatformOs, type ProfitRow,
} from '@/lib/platformPanel';

const JOB_COLS = 'id, title, status, price, created_at, accepted_at, en_route_at, arrived_at, completed_at, cancelled_at, cancelled_by, cancellation_fee, cancellation_fee_paid_at, workshop_confirmed_at, mechanic_rating, scheduled_at, mechanic_id, service_order_id, pricing, max_hours, estimated_hours, actual_hours, mechanic:mechanics!jobs_mechanic_id_fkey(id, profile:profiles(full_name))';

const ITEM_COLS = 'id, service_order_id, kind, description, quantity, unit_price, unit_cost, used_in_item_id, platform_job_id, executor, service_type';
const OS_COLS = 'id, number, executor, vehicle:vehicles(make, model, plate, color), customer:customers(full_name)';

/** Busca em lotes de ids (o filtro "in" da URL tem limite de tamanho) */
async function byIds<T>(ids: string[], run: (chunk: string[]) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await run(ids.slice(i, i + 100));
    out.push(...((data as T[]) ?? []));
  }
  return out;
}

const NO_CHARGES: Map<string, number> = new Map();

const fmtH = (h: number) => `${String(Math.round(h * 10) / 10).replace('.', ',')} h`;
const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

/**
 * Painel da Plataforma: o que aconteceu com as demandas de mecânicos da plataforma no período.
 * Só fatos (valores, tempos, notas, quem trabalhou) — sem comparações com outras formas de contratar.
 */
export default function PlataformaPainel() {
  const { currentWorkshop, user } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const period = usePeriod('plataforma-painel-periodo', 'month');
  const [jobs, setJobs] = useState<PlatformJob[]>([]);
  const [items, setItems] = useState<PlatformItem[]>([]);
  /** Quanto a oficina disse que cobrou do cliente, por demanda (só ela vê) */
  const [charges, setCharges] = useState<Map<string, number>>(new Map());
  const [osList, setOsList] = useState<PlatformOs[]>([]);
  const [showAllRows, setShowAllRows] = useState(false);
  /** % do preço usado como custo quando a peça não tem custo lançado (editável aqui) */
  const [estPct, setEstPct] = useState(() => loadEstPct(wid));
  useEffect(() => { setEstPct(loadEstPct(wid)); }, [wid]);
  const changeEst = (pct: number) => {
    const n = Math.min(100, Math.max(1, Math.round(pct)));
    setEstPct(n);
    if (wid) saveEstPct(wid, n);
  };
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [j, linked] = await Promise.all([
        fetchAll((a, b) => supabase.from('jobs').select(JOB_COLS).eq('workshop_id', wid).order('id').range(a, b)),
        // Serviços de OS feitos pela plataforma: dizem em quais OS os mecânicos trabalharam
        fetchAll((a, b) => supabase.from('service_order_items').select('service_order_id')
          .eq('workshop_id', wid).eq('kind', 'labor')
          .or('platform_job_id.not.is.null,executor.eq.platform')
          .order('id').range(a, b)),
      ]);
      const jobList = (j.data as unknown as PlatformJob[]) ?? [];
      // Essas OS inteiras (serviços + peças com custo) para o lucro por serviço
      const osIds = [...new Set([
        ...((linked.data as { service_order_id: string }[]) ?? []).map(i => i.service_order_id),
        ...jobList.map(x => x.service_order_id).filter((x): x is string => !!x),
      ])];
      const [osRows, itemRows, chargeMap] = await Promise.all([
        byIds<PlatformOs>(osIds, ids => supabase.from('service_orders').select(OS_COLS).eq('workshop_id', wid).in('id', ids)),
        byIds<PlatformItem>(osIds, ids => supabase.from('service_order_items').select(ITEM_COLS).eq('workshop_id', wid).in('service_order_id', ids)),
        loadCharges(wid),
      ]);
      if (!alive) return;
      setJobs(jobList);
      setOsList(osRows);
      setItems(itemRows);
      setCharges(chargeMap);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [wid]);

  const m = useMemo(() => platformPanel(jobs, period.range, j => arrivalDeadline(j)), [jobs, period.range]);
  // Valor cobrado informado à mão: só para a oficina "Só mecânicos" (quem tem OS tem o lucro pela OS)
  const platformOnly = useWorkshopModules(s => s.loaded && isPlatformOnly(s.off));
  const usedCharges = platformOnly ? charges : NO_CHARGES;
  const rows = useMemo(() => profitRows(jobs, osList, items, period.range, estPct, usedCharges), [jobs, osList, items, period.range, estPct, usedCharges]);
  const missing = useMemo(() => (platformOnly ? missingCharges(jobs, items, charges, period.range) : []), [platformOnly, jobs, items, charges, period.range]);
  const hasOsRows = rows.some(r => !r.manual);
  /** Grava o valor cobrado e atualiza o painel na hora */
  async function setCharge(jobId: string, amount: number | null) {
    if (!wid) return false;
    const { error } = await saveCharge(wid, jobId, amount, user?.id);
    if (error) { toast.error('Não salvou: ' + error.message); return false; }
    setCharges(prev => { const n = new Map(prev); if (amount == null) n.delete(jobId); else n.set(jobId, amount); return n; });
    toast.success(amount == null ? 'Valor apagado' : 'Valor salvo');
    return true;
  }
  const real = useMemo(() => realCostPct(items), [items]);
  const tot = useMemo(() => profitTotals(rows), [rows]);
  const series = useMemo(() => platformSeries(jobs, period.range), [jobs, period.range]);
  const maxBar = Math.max(1, ...series.rows.map(s => s.spent));
  const maxService = Math.max(1, ...m.services.map(s => s.count));
  const live = m.now.waiting + m.now.onTheWay + m.now.inService + m.pendingConfirm;

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Cabeçalho + período */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-steel-500">Painel da Plataforma</div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight truncate">{currentWorkshop?.business_name ?? '…'}</h1>
            <div className="text-xs text-steel-400 mt-0.5">{period.label}</div>
          </div>
          <PeriodPicker period={period} />
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : jobs.length === 0 ? (
          <div className="card text-center py-14">
            <div className="text-4xl mb-2">⚡</div>
            <h2 className="text-lg font-bold">Os números das suas demandas aparecem aqui</h2>
            <p className="text-sm text-steel-500 mt-1 max-w-md mx-auto">
              Assim que você contratar mecânicos pela plataforma, o painel mostra quanto foi pago, quanto o cliente pagou por esses serviços, tempos de chegada e quem trabalhou com vocês.
            </p>
            <Link to="/oficina/dashboard?nova=1" className="btn-primary mt-5 inline-block">⚡ Chamar mecânico</Link>
          </div>
        ) : (
          <>
            {/* Agora */}
            {live > 0 && (
              <Link to="/oficina/dashboard" className="card !py-3 grid grid-cols-4 divide-x divide-steel-100 text-center hover:ring-brand-200 transition">
                <Now n={m.now.waiting} label="Aguardando aceite" />
                <Now n={m.now.onTheWay} label="A caminho" />
                <Now n={m.now.inService} label="Em serviço" />
                <Now n={m.pendingConfirm} label="A confirmar" warn={m.pendingConfirm > 0} />
              </Link>
            )}

            {/* Dinheiro */}
            <section>
              <SectionTitle>Dinheiro</SectionTitle>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi highlight label="Pago aos mecânicos" value={fmtBRL(m.spent)}
                  note={m.doneCount ? `${plural(m.doneCount, 'demanda concluída', 'demandas concluídas')} · ticket ${fmtBRL(m.ticket)}` : 'nenhuma concluída no período'} />
                <Kpi label="Cobrado do cliente" value={tot.count ? fmtBRL(tot.charged) : '—'}
                  note={tot.count ? `de ${plural(tot.count, 'serviço', 'serviços')} feitos pela plataforma` : platformOnly ? 'informe quanto cobrou em cada serviço' : 'nenhuma demanda ligada a OS'} />
                <Kpi label="Lucro depois dos custos" value={tot.count ? fmtBRL(tot.profit) : '—'}
                  tone={tot.count ? (tot.profit >= 0 ? 'good' : 'bad') : undefined}
                  note={tot.count
                    ? `cobrado − peças ${fmtBRL(tot.partsCost)}${tot.costEst > 0 ? ` (${fmtBRL(tot.costEst)} estimado)` : ''} − mecânicos${tot.charged > 0 ? ` · ${Math.round((tot.profit / tot.charged) * 100)}%` : ''}`
                    : platformOnly ? 'aparece quando você informa quanto cobrou' : 'aparece quando a demanda sai de uma OS'} />
                <Kpi label="Multas de cancelamento" value={fmtBRL(m.feesPaid)}
                  note={m.pendingFees > 0 ? `${fmtBRL(m.pendingFees)} em aberto` : 'nada em aberto'} tone={m.pendingFees > 0 ? 'bad' : undefined} />
              </div>
            </section>

            {/* Lucro por serviço */}
            <section>
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <SectionTitle>Lucro por serviço</SectionTitle>
                {tot.count > 0 && <span className="text-[11px] text-steel-400">{plural(tot.count, 'serviço', 'serviços')} no período</span>}
              </div>
              {/* Serviços concluídos sem o valor cobrado: dá para informar aqui mesmo */}
              {missing.length > 0 && (
                <div className="card !p-4 mb-3">
                  <div className="text-sm font-bold text-steel-900">💰 Quanto você cobrou do cliente?</div>
                  <p className="text-xs text-steel-600 mt-0.5 mb-3">
                    Informe o valor geral de cada serviço para ver seu lucro. Só você vê; o mecânico não.
                  </p>
                  <ul className="divide-y divide-steel-100">
                    {missing.slice(0, 8).map(j => (
                      <li key={j.id} className="py-2.5 grid sm:grid-cols-[minmax(0,1fr)_260px] gap-2 sm:items-center">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-steel-900 truncate">{j.title}</div>
                          <div className="text-xs text-steel-600">
                            {j.completed_at && new Date(j.completed_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · pago ao mecânico {fmtBRL(Number(j.price))}
                          </div>
                        </div>
                        <ChargeInput compact initial={null} onSave={n => setCharge(j.id, n)} />
                      </li>
                    ))}
                  </ul>
                  {missing.length > 8 && <p className="text-xs text-steel-500 mt-2">+{missing.length - 8} serviços no período sem valor informado</p>}
                </div>
              )}
              {rows.length === 0 ? (
                missing.length === 0 && (
                  <div className="card text-sm text-steel-500">
                    {platformOnly
                      ? 'Nenhum serviço concluído no período. Quando um mecânico terminar, informe quanto você cobrou do cliente e o lucro aparece aqui.'
                      : 'Nenhum serviço feito pela plataforma ligado a OS no período. Quando a demanda sai de uma OS (Caixa, OS ou empilhados), o lucro de cada serviço aparece aqui.'}
                  </div>
                )
              ) : (
                <>
                  {hasOsRows && (
                    <EstimateBar estPct={estPct} onChange={changeEst} real={real}
                      costReal={tot.costReal} costEst={tot.costEst} noParts={tot.noParts} missingCost={tot.missingCost} />
                  )}
                  <ul className="grid lg:grid-cols-2 gap-3">
                    {(showAllRows ? rows : rows.slice(0, 10)).map(r => <ProfitCard key={r.key} r={r} onCharge={setCharge} />)}
                  </ul>
                  {rows.length > 10 && (
                    <button type="button" onClick={() => setShowAllRows(v => !v)}
                      className="mt-3 w-full h-11 rounded-xl border border-steel-200 bg-white text-sm font-semibold text-steel-700 hover:bg-steel-50">
                      {showAllRows ? 'Mostrar menos' : `Ver todos os ${rows.length} serviços`}
                    </button>
                  )}
                </>
              )}
            </section>

            {/* Gráfico */}
            <section className="card">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">Pago aos mecânicos por {series.byMonth ? 'mês' : 'dia'}</div>
              {series.rows.length <= 1 ? (
                <div className="text-sm text-steel-500 py-6 text-center">Escolha um período maior para ver o gráfico.</div>
              ) : (
                <div className="flex items-end gap-1 h-36">
                  {series.rows.map((s, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative min-w-0">
                      <div className="absolute -top-1 -translate-y-full hidden group-hover:block bg-steel-900 text-white text-[10px] rounded px-1.5 py-0.5 whitespace-nowrap z-10">
                        {s.label}: {fmtBRL(s.spent)} · {plural(s.count, 'demanda', 'demandas')}
                      </div>
                      <div className={`w-full rounded-t ${s.spent ? 'bg-brand-500' : 'bg-steel-100'}`}
                        style={{ height: `${Math.max(s.spent ? 4 : 2, (s.spent / maxBar) * 100)}%` }} />
                      {(series.rows.length <= 12 || i % Math.ceil(series.rows.length / 7) === 0) && (
                        <div className="text-[9px] text-steel-400 mt-1 truncate w-full text-center">{s.label}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Operação */}
            <section>
              <SectionTitle>Operação</SectionTitle>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="Publicadas" value={String(m.published)} note="demandas criadas no período" />
                <Kpi label="Concluídas" value={String(m.doneCount)}
                  note={m.completionRate == null ? 'sem demandas finalizadas' : `${Math.round(m.completionRate)}% das finalizadas · ${plural(m.cancelledCount, 'cancelada', 'canceladas')}`} />
                <Kpi label="Aceite em média" value={m.avgAcceptMin != null ? fmtDur(m.avgAcceptMin) : '—'} note="da publicação ao aceite" />
                <Kpi label="Chegada em média" value={m.avgArrivalMin != null ? fmtDur(m.avgArrivalMin) : '—'}
                  note={m.onTimeRate != null ? `${Math.round(m.onTimeRate)}% dentro do prazo (${m.onTimeBase})` : 'sem chegadas no período'} />
              </div>
            </section>

            {/* Capacidade e qualidade */}
            <section>
              <SectionTitle>Capacidade e qualidade</SectionTitle>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Kpi label="OS atendidas" value={String(m.osServed)} note="OS com serviço feito pela plataforma" />
                <Kpi label="Horas trabalhadas" value={m.hoursBase ? fmtH(m.actualHours) : '—'}
                  note={m.hoursBase ? `registradas em ${plural(m.hoursBase, 'demanda', 'demandas')}` : 'sem horas registradas'} />
                <Kpi label="Previsto × real" value={m.plannedHours > 0 ? `${fmtH(m.plannedHours)} / ${fmtH(m.plannedActual)}` : '—'}
                  note={m.plannedHours > 0 ? 'horas previstas × horas reais' : 'sem tempo previsto informado'} />
                <Kpi label="Nota média" value={m.avgRating != null ? `★ ${m.avgRating.toFixed(1)}` : '—'}
                  note={m.ratingsCount ? `${plural(m.ratingsCount, 'avaliação', 'avaliações')} da oficina` : m.pendingRating ? `${plural(m.pendingRating, 'demanda', 'demandas')} para avaliar` : 'sem avaliações'} />
              </div>
            </section>

            <div className="grid lg:grid-cols-2 gap-4">
              {/* Serviços mais pedidos */}
              <section className="card">
                <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">Serviços mais pedidos</div>
                {m.services.length === 0 ? (
                  <p className="text-sm text-steel-400">Nenhuma demanda concluída no período.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {m.services.slice(0, 6).map(s => (
                      <li key={s.label}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="font-semibold text-steel-800 truncate">{s.label}</span>
                          <span className="text-steel-500 tabular-nums shrink-0">{s.count} · {fmtBRL(s.spent)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-steel-100 mt-1 overflow-hidden">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${(s.count / maxService) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Mecânicos */}
              <section className="card">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Quem mais trabalhou com vocês</div>
                  <Link to="/oficina/dashboard" className="text-xs font-semibold text-brand-600 hover:underline shrink-0">Demandas →</Link>
                </div>
                {m.topMechanics.length === 0 ? (
                  <p className="text-sm text-steel-400">Nenhuma demanda concluída no período.</p>
                ) : (
                  <ul className="divide-y divide-steel-100">
                    {m.topMechanics.map((t, i) => (
                      <li key={t.name + i} className="flex items-center gap-3 py-2.5">
                        <span className="w-5 text-sm font-bold text-steel-400 tabular-nums">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-steel-900 truncate">{t.name}</div>
                          <div className="text-xs text-steel-500">
                            {plural(t.jobs, 'serviço', 'serviços')}{t.avgRating != null ? ` · ★ ${t.avgRating.toFixed(1)}` : ''}
                          </div>
                        </div>
                        <span className="text-sm font-semibold tabular-nums shrink-0">{fmtBRL(t.spent)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <p className="text-[11px] text-steel-400">
              Lucro = o que o cliente pagou pelos serviços feitos pela plataforma (mão de obra + peças usadas neles) − custo de compra dessas peças − valor pago ao mecânico.
              Na OS inteira feita pela plataforma, entra a OS toda. Demandas sem OS não entram nessa conta.
            </p>
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}

/** Um serviço feito pela plataforma: o que o cliente pagou, os custos e o lucro */
function ProfitCard({ r, onCharge }: { r: ProfitRow; onCharge: (jobId: string, n: number | null) => Promise<boolean> }) {
  const pct = r.charged > 0 ? Math.round((r.profit / r.charged) * 100) : null;
  const [editing, setEditing] = useState(false);
  if (r.manual) {
    return (
      <li className="card !p-4 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/oficina/job/${r.jobId}/tracking`} className="text-sm font-bold text-steel-900 hover:underline line-clamp-2">{r.services[0]}</Link>
            <div className="text-xs text-steel-500 truncate">
              {[r.mechanics.join(', '), new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })].join(' · ')}
            </div>
          </div>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-steel-600 bg-steel-100 rounded-full px-2 py-0.5">informado por você</span>
        </div>
        <dl className="mt-3 pt-3 border-t border-steel-100 space-y-1 text-sm tabular-nums">
          {editing ? (
            <div className="pb-1">
              <div className="text-xs text-steel-600 mb-1">Cobrado do cliente (vazio apaga)</div>
              <ChargeInput compact initial={r.charged} onSave={async n => { const ok = await onCharge(r.jobId!, n); if (ok) setEditing(false); return ok; }} />
            </div>
          ) : (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-steel-600">Cobrado do cliente <button type="button" onClick={() => setEditing(true)} className="ml-1 text-xs font-semibold text-brand-600">editar</button></dt>
              <dd className="font-semibold text-steel-900 shrink-0">{fmtBRL(r.charged)}</dd>
            </div>
          )}
          <Money label="Pago ao mecânico" value={-r.paid} />
          <div className="flex items-baseline justify-between gap-2 pt-1.5 border-t border-steel-100">
            <dt className="font-bold text-steel-900">Lucro</dt>
            <dd className={`font-bold font-display text-base ${r.profit >= 0 ? 'text-signal-600' : 'text-alert-600'}`}>
              {fmtBRL(r.profit)}{pct != null && <span className="text-xs font-semibold ml-1">({pct}%)</span>}
            </dd>
          </div>
        </dl>
      </li>
    );
  }
  return (
    <li>
      <Link to={`/oficina/os/${r.osId}`} className="card block !p-4 hover:ring-brand-200 transition min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm font-bold text-steel-900 truncate">
              OS {r.osNumber != null ? String(r.osNumber).padStart(4, '0') : '—'} · {r.car}
            </div>
            <div className="text-xs text-steel-500 truncate">
              {[r.customer, r.mechanics.join(', '), new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })].filter(Boolean).join(' · ')}
            </div>
          </div>
          {r.whole && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-brand-700 bg-brand-50 rounded-full px-2 py-0.5">OS inteira</span>}
        </div>
        <div className="text-[13px] text-steel-700 mt-1.5 line-clamp-2">{r.services.join(' + ')}</div>
        {r.noParts.length > 0 && (
          <div className="mt-2 text-[11px] font-semibold text-pending-800 bg-pending-50 rounded-lg px-2.5 py-1.5">
            ⚠️ {r.noParts.join(', ')}: leva peça, mas nenhuma peça foi lançada. Custo estimado; lance as peças com custo na OS.
          </div>
        )}

        <dl className="mt-3 pt-3 border-t border-steel-100 space-y-1 text-sm tabular-nums">
          <Money label="Cobrado do cliente" value={r.charged}
            sub={r.parts > 0 ? `mão de obra ${fmtBRL(r.labor)} + peças ${fmtBRL(r.parts)}` : undefined} />
          {(r.parts > 0 || r.noParts.length > 0) && (
            <Money label="Custo das peças" value={-r.partsCost} warn={r.costEst > 0}
              sub={r.costEst === 0 ? 'custo lançado'
                : r.costReal > 0 ? `${fmtBRL(r.costReal)} lançado + ${fmtBRL(r.costEst)} estimado`
                : 'estimado'} />
          )}
          <Money label="Pago ao mecânico" value={-r.paid} />
          <div className="flex items-baseline justify-between gap-2 pt-1.5 border-t border-steel-100">
            <dt className="font-bold text-steel-900">Lucro</dt>
            <dd className={`font-bold font-display text-base ${r.profit >= 0 ? 'text-signal-600' : 'text-alert-600'}`}>
              {fmtBRL(r.profit)}{pct != null && <span className="text-xs font-semibold ml-1">({pct}%)</span>}
            </dd>
          </div>
        </dl>
      </Link>
    </li>
  );
}

/** % estimado do custo das peças (editável) + quanto do custo é real e quanto é estimativa */
function EstimateBar({ estPct, onChange, real, costReal, costEst, noParts, missingCost }: {
  estPct: number; onChange: (n: number) => void; real: { pct: number; count: number } | null;
  costReal: number; costEst: number; noParts: number; missingCost: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(estPct));
  useEffect(() => { setDraft(String(estPct)); }, [estPct]);
  const total = costReal + costEst;
  const realShare = total > 0 ? Math.round((costReal / total) * 100) : null;
  const save = () => { const n = Number(draft); if (n > 0 && n <= 100) onChange(n); setEditing(false); };

  return (
    <div className="card !p-3.5 mb-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex-1 min-w-[180px] text-sm text-steel-700">
          Peça sem custo lançado entra como <strong>{estPct}% do preço</strong>
          {estPct === DEFAULT_EST_PCT && <span className="text-steel-400"> (padrão)</span>}
        </div>
        {editing ? (
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <input type="number" inputMode="numeric" min={1} max={100} value={draft} autoFocus
                onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }}
                className="input !w-24 !h-11 !pr-7 text-right" />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-steel-400 text-sm">%</span>
            </div>
            <button type="button" onClick={save} className="h-11 px-4 rounded-xl bg-steel-900 text-white text-sm font-bold">Salvar</button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)}
            className="h-11 px-4 rounded-xl border border-steel-200 bg-white text-sm font-semibold text-steel-700 hover:bg-steel-50">
            Editar %
          </button>
        )}
      </div>

      {real && real.pct !== estPct && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-steel-600 bg-signal-50 rounded-lg px-3 py-2">
          <span className="flex-1 min-w-[180px]">
            Nas {real.count} peças com custo lançado, o custo médio é <strong>{real.pct}% do preço</strong>.
          </span>
          <button type="button" onClick={() => onChange(real.pct)} className="h-9 px-3 rounded-lg bg-signal-600 text-white text-xs font-bold">
            Usar {real.pct}%
          </button>
        </div>
      )}

      {total > 0 && (
        <div>
          <div className="flex justify-between text-[11px] text-steel-500 mb-1">
            <span>Custo das peças: {fmtBRL(costReal)} lançado</span>
            <span>{fmtBRL(costEst)} estimado</span>
          </div>
          <div className="h-2 rounded-full bg-pending-200 overflow-hidden">
            <div className="h-full bg-signal-500" style={{ width: `${realShare ?? 0}%` }} />
          </div>
          <p className="text-[11px] text-steel-400 mt-1">
            {realShare === 100 ? 'Todo o custo vem das peças lançadas: lucro real.'
              : `${realShare}% do custo é real. ${noParts > 0 ? `${plural(noParts, 'serviço leva peça', 'serviços levam peça')} sem peça lançada. ` : ''}${missingCost ? 'Tem peça sem custo. ' : ''}Lance as peças com custo na OS (“+ detalhar peça”) e o estimado vai sumindo.`}
          </p>
        </div>
      )}
    </div>
  );
}

function Money({ label, value, sub, warn = false }: { label: string; value: number; sub?: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-steel-600 min-w-0">
        {label}
        {sub && <span className={`block text-[11px] ${warn ? 'text-pending-700' : 'text-steel-400'}`}>{sub}</span>}
      </dt>
      <dd className="font-semibold text-steel-900 shrink-0">{value < 0 ? `− ${fmtBRL(-value)}` : fmtBRL(value)}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[11px] font-bold text-steel-500 uppercase tracking-widest mb-2">{children}</h2>;
}

function Kpi({ label, value, note, highlight = false, tone }: {
  label: string; value: string; note?: string; highlight?: boolean; tone?: 'good' | 'bad';
}) {
  return (
    <div className={`card min-w-0 ${highlight ? '!bg-steel-900 text-white' : ''}`}>
      <div className={`text-[10px] font-bold uppercase tracking-widest ${highlight ? 'text-steel-400' : 'text-steel-500'}`}>{label}</div>
      <div className={`text-xl lg:text-2xl font-bold font-display mt-1 tabular-nums break-words ${
        tone === 'good' ? 'text-signal-600' : tone === 'bad' ? 'text-alert-600' : ''}`}>{value}</div>
      {note && <div className={`text-[11px] mt-1 leading-snug ${highlight ? 'text-steel-400' : 'text-steel-400'}`}>{note}</div>}
    </div>
  );
}

function Now({ n, label, warn = false }: { n: number; label: string; warn?: boolean }) {
  return (
    <div className="px-1 min-w-0">
      <div className={`text-xl font-bold font-display tabular-nums ${warn ? 'text-brand-600' : n ? 'text-steel-900' : 'text-steel-300'}`}>{n}</div>
      <div className="text-[10px] text-steel-500 leading-tight">{label}</div>
    </div>
  );
}
