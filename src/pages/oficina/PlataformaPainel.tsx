import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAll } from '@/lib/fetchAll';
import { fmtBRL, fmtDur } from '@/components/os/osHelpers';
import { arrivalDeadline } from '@/lib/arrivalDeadline';
import PeriodPicker, { usePeriod } from '@/components/PeriodPicker';
import { platformPanel, platformSeries, type PlatformItem, type PlatformJob } from '@/lib/platformPanel';

const JOB_COLS = 'id, title, status, price, created_at, accepted_at, en_route_at, arrived_at, completed_at, cancelled_at, cancelled_by, cancellation_fee, cancellation_fee_paid_at, workshop_confirmed_at, mechanic_rating, scheduled_at, mechanic_id, service_order_id, pricing, max_hours, estimated_hours, actual_hours, mechanic:mechanics(id, profile:profiles(full_name))';

const fmtH = (h: number) => `${String(Math.round(h * 10) / 10).replace('.', ',')} h`;
const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

/**
 * Painel da Plataforma: o que aconteceu com as demandas de mecânicos da plataforma no período.
 * Só fatos (valores, tempos, notas, quem trabalhou) — sem comparações com outras formas de contratar.
 */
export default function PlataformaPainel() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const period = usePeriod('plataforma-painel-periodo', 'month');
  const [jobs, setJobs] = useState<PlatformJob[]>([]);
  const [items, setItems] = useState<PlatformItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!wid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [j, it] = await Promise.all([
        fetchAll((a, b) => supabase.from('jobs').select(JOB_COLS).eq('workshop_id', wid).order('id').range(a, b)),
        // Serviços de OS feitos pela plataforma (para saber quanto o cliente pagou por eles)
        fetchAll((a, b) => supabase.from('service_order_items')
          .select('service_order_id, platform_job_id, quantity, unit_price')
          .eq('workshop_id', wid).eq('kind', 'labor')
          .or('platform_job_id.not.is.null,executor.eq.platform')
          .order('id').range(a, b)),
      ]);
      if (!alive) return;
      setJobs((j.data as unknown as PlatformJob[]) ?? []);
      setItems((it.data as unknown as PlatformItem[]) ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [wid]);

  const m = useMemo(() => platformPanel(jobs, items, period.range, j => arrivalDeadline(j)), [jobs, items, period.range]);
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
                <Kpi label="Cobrado do cliente" value={m.withOsCount ? fmtBRL(m.charged) : '—'}
                  note={m.withOsCount ? `nos serviços de ${plural(m.withOsCount, 'demanda ligada', 'demandas ligadas')} a OS` : 'nenhuma demanda ligada a OS'} />
                <Kpi label="Ficou com a oficina" value={m.withOsCount ? fmtBRL(m.margin) : '—'}
                  tone={m.withOsCount ? (m.margin >= 0 ? 'good' : 'bad') : undefined}
                  note={m.withOsCount ? `cobrado − pago${m.charged > 0 ? ` · ${Math.round((m.margin / m.charged) * 100)}% do cobrado` : ''}` : 'aparece quando a demanda sai de uma OS'} />
                <Kpi label="Multas de cancelamento" value={fmtBRL(m.feesPaid)}
                  note={m.pendingFees > 0 ? `${fmtBRL(m.pendingFees)} em aberto` : 'nada em aberto'} tone={m.pendingFees > 0 ? 'bad' : undefined} />
              </div>
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
              “Cobrado do cliente” soma os serviços da OS feitos pelo mecânico da plataforma; demandas abertas sem OS não entram nessa conta.
            </p>
          </>
        )}
      </div>
    </WorkshopLayout>
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
