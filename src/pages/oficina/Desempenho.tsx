import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fmtBRL, fmtDur, osNumber, reworkCauseLabel } from '@/components/os/osHelpers';
import { fetchAll } from '@/lib/fetchAll';
import TeamCommissions from '@/components/team/TeamCommissions';
import { MIN_SAMPLE, teamPerformance, type MechanicPerf, type PerfMechanic, type PerfOs, type ServiceType } from '@/lib/teamPerformance';

type Period = '30d' | '90d' | '6m' | '12m';
const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
  { key: '6m',  label: '6 meses', days: 182 },
  { key: '12m', label: '12 meses', days: 365 },
];
type Tab = 'prod' | 'quality' | 'skills' | 'times' | 'money';

const pct = (v: number | null, digits = 0) => (v == null ? '—' : `${v.toFixed(digits).replace('.', ',')}%`);
const signed = (v: number | null) => (v == null ? '—' : v === 0 ? 'na média' : v > 0 ? `${v}% mais rápido` : `${Math.abs(v)}% mais lento`);

export default function Desempenho() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const [period, setPeriod] = useState<Period>(() => {
    try { return (localStorage.getItem('desempenho-periodo') as Period) || '90d'; } catch { return '90d'; }
  });
  // /oficina/desempenho?aba=comissoes abre direto nas comissões
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get('aba') === 'comissoes' ? 'money' : 'skills'));
  const [os, setOs] = useState<PerfOs[]>([]);
  const [mechs, setMechs] = useState<PerfMechanic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { try { localStorage.setItem('desempenho-periodo', period); } catch { /* ignore */ } }, [period]);

  useEffect(() => {
    if (!wid) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const [o, m] = await Promise.all([
        fetchAll((a, b) => supabase.from('service_orders')
          .select('id, number, title, status, quote_status, category, labor_cost, created_at, started_at, completed_at, estimated_hours, workshop_mechanic_id, rework_of_id, rework_cause, rework_mechanic_id, vehicle:vehicles(plate), pauses:service_order_pauses(started_at, ended_at, reason)')
          .eq('workshop_id', wid).order('created_at', { ascending: false }).order('id').range(a, b)),
        supabase.from('workshop_mechanics').select('id, name, photo_url, status, active').eq('workshop_id', wid).order('name'),
      ]);
      if (!alive) return;
      setOs((o.data as unknown as PerfOs[]) ?? []);
      setMechs((m.data as PerfMechanic[]) ?? []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [wid]);

  const range = useMemo(() => {
    const to = new Date(); to.setHours(0, 0, 0, 0); to.setDate(to.getDate() + 1);
    const from = new Date(to); from.setDate(from.getDate() - PERIODS.find(p => p.key === period)!.days);
    return { from, to };
  }, [period]);

  const r = useMemo(() => teamPerformance(os, mechs, range), [os, mechs, range]);
  const isMoney = tab === 'money';

  const tabs = (
    <div className="flex flex-wrap gap-1 bg-steel-100 rounded-xl p-1 w-fit">
      {([['skills', '🎯 Quem escalar'], ['times', '🕒 Tempo por serviço'], ['prod', '⏱ Produtividade'], ['quality', '✅ Qualidade'], ['money', '💵 Comissões e horas']] as [Tab, string][]).map(([k, l]) => (
        <button key={k} onClick={() => setTab(k)}
          className={`text-sm font-semibold px-3.5 py-1.5 rounded-lg transition ${tab === k ? 'bg-white shadow-sm text-steel-900' : 'text-steel-500 hover:text-steel-800'}`}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm text-steel-500">Equipe</div>
            <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">🏆 Desempenho e comissões</h1>
            <p className="text-xs text-steel-500 mt-0.5">Produtividade, qualidade e comissões de cada colaborador, medidas pelas OS — não por achismo.</p>
          </div>
          <div className={`flex flex-wrap gap-2 ${isMoney ? 'hidden' : ''}`}>
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${
                  period === p.key ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid sm:grid-cols-3 gap-4">{[1, 2, 3].map(i => <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : mechs.length === 0 ? (
          <div className="card text-center py-14">
            <div className="text-4xl mb-2">👷</div>
            <h2 className="text-lg font-bold">Cadastre sua equipe primeiro</h2>
            <p className="text-sm text-steel-500 mt-1">O relatório compara os colaboradores pelas OS que cada um executa.</p>
            <Link to="/oficina/equipe" className="btn-primary mt-5 inline-block">Ir para Equipe</Link>
          </div>
        ) : isMoney && wid ? (
          <>
            {tabs}
            <TeamCommissions workshopId={wid} />
          </>
        ) : (
          <>
            {/* Qualidade dos dados: sem isso o relatório mente */}
            {(r.shop.unassigned > 0 || r.shop.untimed > 0 || r.shop.pendingCause > 0 || r.shop.uncategorized > 0) && (
              <div className="bg-pending-50 border border-pending-200 rounded-xl px-4 py-3 text-sm text-pending-900 space-y-1">
                <div className="font-semibold">Para o relatório ficar preciso:</div>
                {r.shop.uncategorized > 0 && <div>• {r.shop.uncategorized} OS concluída{r.shop.uncategorized > 1 ? 's' : ''} sem tipo de serviço — escolha a categoria na OS para medir o tempo de cada serviço.</div>}
                {r.shop.unassigned > 0 && <div>• {r.shop.unassigned} OS concluída{r.shop.unassigned > 1 ? 's' : ''} sem responsável — defina quem executou.</div>}
                {r.shop.untimed > 0 && <div>• {r.shop.untimed} OS sem cronômetro — use <strong>▶ Iniciar</strong> e <strong>✓ Concluir</strong> na OS para medir o tempo.</div>}
                {r.shop.pendingCause > 0 && <div>• {r.shop.pendingCause} retorno{r.shop.pendingCause > 1 ? 's' : ''} sem causa definida — abra a OS de retorno e marque a causa.</div>}
              </div>
            )}

            {/* Visão geral + destaques */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="card">
                <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">Oficina no período</div>
                <div className="text-2xl font-bold font-display mt-1">{r.shop.services} serviços</div>
                <div className="text-xs text-steel-500 mt-0.5">
                  Taxa de retorno: <strong className={rateColor(r.shop.returnRate)}>{pct(r.shop.returnRate, 1)}</strong>
                  {' · '}{r.shop.returnsInPeriod} retorno{r.shop.returnsInPeriod === 1 ? '' : 's'} registrado{r.shop.returnsInPeriod === 1 ? '' : 's'}
                </div>
              </div>
              <Highlight icon="💰" title="Mais produtivo" m={r.highlights.productive}
                value={m => `${fmtBRL(m.laborPerHour)}/h`} hint="mão de obra por hora trabalhada" />
              <Highlight icon="⚡" title="Mais rápido" m={r.highlights.fastest}
                value={m => signed(m.speed)} hint="vs. média da oficina no mesmo tipo de serviço" />
              <Highlight icon="✅" title="Menos retornos" m={r.highlights.quality}
                value={m => `${pct(m.firstTimeRight)} feito certo de 1ª`} hint="serviços que não voltaram por falha" />
            </div>

            {/* Abas */}
            {tabs}

            {tab === 'times' && <ServiceTypes types={r.serviceTypes} />}
            {tab === 'prod' && <ProductivityTable rows={r.rows} />}
            {tab === 'quality' && <QualityTable rows={r.rows} />}
            {tab === 'skills' && (
              <>
                <SkillBoard types={r.serviceTypes} />
                <SkillsMatrix rows={r.rows} categories={r.categories} shopAvg={r.shopAvg} />
              </>
            )}

            {/* Leitura automática por colaborador */}
            <div>
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">Leitura de cada colaborador</div>
              <div className="grid md:grid-cols-2 gap-4">
                {r.rows.filter(x => x.services || x.returns.length).map(x => (
                  <MechanicCard key={x.id} m={x}
                    bestAt={r.serviceTypes.filter(t => t.best?.id === x.id).map(t => t.category)} />
                ))}
              </div>
            </div>

            <p className="text-[11px] text-steel-400">
              Como calculamos: serviço = OS concluída no período (retornos não contam como serviço). Tempo = do Iniciar ao Concluir, sem pausas.
              Velocidade compara com a média da oficina na mesma categoria (mín. 3 serviços). Retorno só conta contra o mecânico quando a causa é
              falha na execução ou diagnóstico errado. Com menos de {MIN_SAMPLE} serviços o colaborador não entra nos destaques.
            </p>
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}

const rateColor = (v: number | null) => (v == null ? '' : v <= 3 ? 'text-signal-700' : v <= 8 ? 'text-pending-700' : 'text-alert-600');

function Avatar({ m }: { m: { name: string; photo_url?: string | null } }) {
  return m.photo_url
    ? <img src={m.photo_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
    : <div className="h-8 w-8 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold text-sm shrink-0">{m.name.charAt(0).toUpperCase()}</div>;
}

function Name({ m }: { m: MechanicPerf }) {
  return (
    <Link to={`/oficina/equipe/${m.id}`} className="flex items-center gap-2 min-w-0 hover:text-brand-600">
      <Avatar m={m} />
      <span className="min-w-0">
        <span className="block font-semibold truncate">{m.name}</span>
        {(m.lowSample || m.inactive) && (
          <span className="block text-[10px] text-steel-400">{m.inactive ? 'inativo' : 'poucos dados'}</span>
        )}
      </span>
    </Link>
  );
}

function Highlight({ icon, title, m, value, hint }: {
  icon: string; title: string; m: MechanicPerf | null; value: (m: MechanicPerf) => string; hint: string;
}) {
  return (
    <div className="card">
      <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">{icon} {title}</div>
      {m ? (
        <>
          <div className="flex items-center gap-2 mt-2"><Avatar m={m} /><span className="font-bold truncate">{m.name}</span></div>
          <div className="text-sm font-semibold text-brand-700 mt-1">{value(m)}</div>
          <div className="text-[11px] text-steel-400">{hint}</div>
        </>
      ) : (
        <div className="text-xs text-steel-400 mt-2">Ainda sem dados suficientes (mín. {MIN_SAMPLE} serviços cronometrados por colaborador).</div>
      )}
    </div>
  );
}

function Th({ children, right = true }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-steel-500 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right = true, className = '' }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-3 py-2.5 whitespace-nowrap ${right ? 'text-right' : ''} ${className}`}>{children}</td>;
}

/** Tempo por tipo de serviço: referência de tempo, quem faz melhor e quanto pagar a um mecânico da plataforma */
function ServiceTypes({ types }: { types: ServiceType[] }) {
  const [rate, setRate] = useState<string>(() => {
    try { return localStorage.getItem('desempenho-valor-hora') ?? ''; } catch { return ''; }
  });
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem('desempenho-valor-hora', rate); } catch { /* ignore */ } }, [rate]);
  const hourly = Number(rate.replace(/\./g, '').replace(',', '.')) || 0;

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">🕒 Tempo médio de cada serviço</div>
          <p className="text-xs text-steel-400">Média de todos os serviços concluídos no período, independente de quem fez (já sem as pausas). Toque num serviço para ver cada colaborador.</p>
        </div>
        <label className="text-xs text-steel-600 flex items-center gap-2">
          <span>Valor da hora do mecânico da plataforma</span>
          <span className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-steel-400">R$</span>
            <input className="input !py-1.5 !pl-8 !w-28 text-sm" inputMode="decimal" placeholder="ex.: 60" value={rate}
              onChange={e => setRate(e.target.value.replace(/[^\d.,]/g, ''))} />
          </span>
        </label>
      </div>
      {types.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-steel-400">Nenhum serviço concluído no período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 border-y border-steel-100">
              <tr>
                <Th right={false}>Tipo de serviço</Th><Th>Feitos</Th><Th>Tempo médio</Th><Th>Mais rápido / mais lento</Th>
                <Th>Você cobra (m.o.)</Th><Th right={false}>Quem faz melhor</Th><Th>Pagar p/ mecânico da plataforma</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {types.map(t => {
                const cost = hourly && t.avgMin ? (t.avgMin / 60) * hourly : null;
                const isOpen = open === t.category;
                return (
                  <FragmentRow key={t.category}>
                    <tr className="cursor-pointer hover:bg-steel-50" onClick={() => setOpen(isOpen ? null : t.category)}>
                      <Td right={false}>
                        <span className="font-semibold">{isOpen ? '▾' : '▸'} {t.category}</span>
                        {t.returns > 0 && <span className="ml-1.5 text-[10px] text-alert-600">⚠ {t.returns} retorno{t.returns > 1 ? 's' : ''}</span>}
                      </Td>
                      <Td>{t.count}{t.timed < t.count && <span className="block text-[10px] text-steel-400">{t.timed} cronometrado{t.timed === 1 ? '' : 's'}</span>}</Td>
                      <Td><strong className="text-base">{t.avgMin != null ? fmtDur(t.avgMin) : '—'}</strong>
                        {t.medianMin != null && t.avgMin != null && Math.abs(t.avgMin - t.medianMin) >= 5 && (
                          <span className="block text-[10px] text-steel-400">normalmente {fmtDur(t.medianMin)}</span>
                        )}
                      </Td>
                      <Td className="text-steel-500">{t.minMin != null && t.maxMin != null && t.minMin !== t.maxMin ? `${fmtDur(t.minMin)} a ${fmtDur(t.maxMin)}` : '—'}</Td>
                      <Td>{t.avgLabor != null ? fmtBRL(t.avgLabor) : '—'}
                        {t.laborPerHour != null && <span className="block text-[10px] text-steel-400">{fmtBRL(t.laborPerHour)}/h</span>}
                      </Td>
                      <Td right={false}>
                        {t.best ? (
                          <span><strong>{t.best.name}</strong>
                            <span className="block text-[10px] text-signal-700">{t.best.avgMin != null ? fmtDur(t.best.avgMin) : ''}{t.best.vsShop ? ` · ${signed(t.best.vsShop)}` : ''}</span>
                          </span>
                        ) : <span className="text-steel-400 text-xs">{t.mechanics.length === 1 ? `só ${t.mechanics[0].name}` : 'poucos dados'}</span>}
                      </Td>
                      <Td>
                        {cost != null ? (
                          <span><strong>{fmtBRL(cost)}</strong>
                            {t.avgLabor != null && (
                              <span className={`block text-[10px] ${t.avgLabor - cost >= 0 ? 'text-signal-700' : 'text-alert-600'}`}>
                                sobra {fmtBRL(t.avgLabor - cost)} da m.o.
                              </span>
                            )}
                          </span>
                        ) : <span className="text-[11px] text-steel-400">{t.avgMin == null ? 'sem tempo medido' : 'informe o valor da hora'}</span>}
                      </Td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-steel-50/60">
                        <td colSpan={7} className="px-5 py-3">
                          {t.mechanics.length === 0 ? (
                            <span className="text-xs text-steel-500">Nenhuma OS deste tipo com responsável definido.</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {t.mechanics.map(mm => (
                                <Link key={mm.id} to={`/oficina/equipe/${mm.id}`}
                                  className={`rounded-lg border px-3 py-2 text-xs bg-white hover:shadow-sm ${mm.returns ? 'border-alert-200' : 'border-steel-200'}`}>
                                  <div className="font-semibold text-steel-900">{mm.name}</div>
                                  <div className="text-steel-600">{mm.count}× · {mm.avgMin != null ? fmtDur(mm.avgMin) : 'sem tempo'}</div>
                                  {mm.vsShop != null && (
                                    <div className={mm.vsShop >= 10 ? 'text-signal-700' : mm.vsShop <= -10 ? 'text-pending-700' : 'text-steel-500'}>{signed(mm.vsShop)}</div>
                                  )}
                                  {mm.returns > 0 && <div className="text-alert-600">⚠ {mm.returns} retorno{mm.returns > 1 ? 's' : ''}</div>}
                                </Link>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-steel-400 px-5 py-2 border-t border-steel-100">
        Tempo médio = soma do tempo trabalhado ÷ número de serviços cronometrados (do Iniciar ao Concluir, sem pausas). "Normalmente" aparece quando
        algum serviço fora da curva puxa a média. Pagar p/ mecânico da plataforma = tempo médio × valor da hora.
        Use esse valor ao <Link to="/oficina/dashboard?nova=1" className="text-brand-600 hover:underline">chamar um mecânico pelo app</Link>.
      </p>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function ProductivityTable({ rows }: { rows: MechanicPerf[] }) {
  return (
    <div className="card !p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-steel-50 border-b border-steel-100">
          <tr>
            <Th right={false}>Colaborador</Th><Th>Serviços</Th><Th>Horas trabalhadas</Th><Th>Tempo médio</Th>
            <Th>Mão de obra</Th><Th>R$ por hora</Th><Th>Velocidade vs. oficina</Th><Th>Dentro do estimado</Th><Th>Tempo parado</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-steel-100">
          {rows.map(m => (
            <FragmentRow key={m.id}>
            <tr className={m.inactive ? 'opacity-60' : ''}>
              <Td right={false}><Name m={m} /></Td>
              <Td><strong>{m.services}</strong>{m.reworkExecuted > 0 && <span className="block text-[10px] text-steel-400">+{m.reworkExecuted} retrabalho</span>}</Td>
              <Td>{m.workedMin ? fmtDur(m.workedMin) : '—'}{m.timed < m.services && <span className="block text-[10px] text-steel-400">{m.services - m.timed} sem cronômetro</span>}</Td>
              <Td>{m.avgMin != null ? fmtDur(m.avgMin) : '—'}</Td>
              <Td>{fmtBRL(m.labor)}</Td>
              <Td><strong>{m.laborPerHour != null ? fmtBRL(m.laborPerHour) : '—'}</strong></Td>
              <Td className={m.speed == null ? 'text-steel-400' : m.speed >= 10 ? 'text-signal-700 font-semibold' : m.speed <= -10 ? 'text-alert-600 font-semibold' : ''}>
                {signed(m.speed)}{m.speed != null && <span className="block text-[10px] text-steel-400">base: {m.speedBase} serviços</span>}
              </Td>
              <Td>{pct(m.onTimeRate)}{m.withEstimate > 0 && <span className="block text-[10px] text-steel-400">{m.withEstimate} com estimativa</span>}</Td>
              <Td className="text-steel-500">{m.pausedMin ? fmtDur(m.pausedMin) : '—'}</Td>
            </tr>
            {m.categories.length > 0 && (
              <tr className={`!border-t-0 ${m.inactive ? 'opacity-60' : ''}`}>
                <td colSpan={9} className="px-3 pb-3 pt-0">
                  <div className="flex flex-wrap gap-1.5 pl-10">
                    {m.categories.map(c => (
                      <span key={c.category} title={c.vsShop != null ? signed(c.vsShop) : 'sem comparação com a oficina ainda'}
                        className={`text-[11px] rounded-full px-2.5 py-0.5 border ${
                          c.returns > 0 ? 'bg-alert-50 border-alert-200 text-alert-800'
                          : c.vsShop != null && c.vsShop >= 10 ? 'bg-signal-50 border-signal-200 text-signal-800'
                          : c.vsShop != null && c.vsShop <= -10 ? 'bg-pending-50 border-pending-200 text-pending-800'
                          : 'bg-steel-50 border-steel-200 text-steel-700'}`}>
                        <strong>{c.category}</strong> {c.count}×{c.avgMin != null ? ` · ${fmtDur(c.avgMin)}` : ''}
                        {c.vsShop != null && c.vsShop !== 0 ? ` · ${c.vsShop > 0 ? '−' : '+'}${Math.abs(c.vsShop)}%` : ''}
                        {c.returns > 0 ? ` · ⚠${c.returns}` : ''}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            )}
            </FragmentRow>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-steel-400 px-3 py-2 border-t border-steel-100">
        R$ por hora = mão de obra ÷ horas cronometradas. Tempo parado (aguardando peça, fim do expediente…) é informativo e não conta contra o colaborador.
      </p>
    </div>
  );
}

function QualityTable({ rows }: { rows: MechanicPerf[] }) {
  return (
    <div className="card !p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-steel-50 border-b border-steel-100">
          <tr>
            <Th right={false}>Colaborador</Th><Th>Serviços</Th><Th>Voltaram por falha</Th><Th>Taxa de retorno</Th>
            <Th>Feito certo de 1ª</Th><Th>Voltou em média</Th><Th>Horas de retrabalho</Th><Th>Outros retornos</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-steel-100">
          {rows.map(m => (
            <tr key={m.id} className={m.inactive ? 'opacity-60' : ''}>
              <Td right={false}><Name m={m} /></Td>
              <Td>{m.services}</Td>
              <Td className={m.returnsCounted ? 'text-alert-600 font-semibold' : ''}>{m.returnsCounted}</Td>
              <Td className={`font-semibold ${rateColor(m.returnRate)}`}>{pct(m.returnRate, 1)}</Td>
              <Td>{pct(m.firstTimeRight)}</Td>
              <Td>{m.avgDaysToReturn != null ? `${m.avgDaysToReturn} dias` : '—'}</Td>
              <Td>{m.reworkMin ? fmtDur(m.reworkMin) : '—'}</Td>
              <Td className="text-steel-500">
                {m.returnsOther}{m.returnsPending > 0 && <span className="block text-[10px] text-pending-700">{m.returnsPending} sem causa</span>}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-steel-400 px-3 py-2 border-t border-steel-100">
        Taxa de retorno = serviços do período que voltaram por falha na execução ou diagnóstico errado. "Outros retornos" (peça com defeito, mau uso) não contam.
        Serviços recentes ainda podem voltar — compare períodos fechados (ex.: 90 dias ou mais).
      </p>
    </div>
  );
}

function SkillsMatrix({ rows, categories, shopAvg }: { rows: MechanicPerf[]; categories: string[]; shopAvg: Map<string, number> }) {
  const active = rows.filter(r => r.services > 0);
  if (!active.length) return <div className="card text-sm text-steel-500">Nenhum serviço concluído no período.</div>;
  return (
    <div className="card !p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-steel-50 border-b border-steel-100">
          <tr>
            <Th right={false}>Colaborador</Th>
            {categories.map(c => (
              <th key={c} className="px-3 py-2 text-center whitespace-nowrap">
                <div className="text-[10px] font-bold uppercase tracking-wider text-steel-500">{c}</div>
                <div className="text-[10px] text-steel-400 font-normal">média {shopAvg.get(c) ? fmtDur(Math.round(shopAvg.get(c)!)) : '—'}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-steel-100">
          {active.map(m => (
            <tr key={m.id}>
              <Td right={false}><Name m={m} /></Td>
              {categories.map(c => {
                const cell = m.categories.find(x => x.category === c);
                if (!cell) return <td key={c} className="px-3 py-2.5 text-center text-steel-300">·</td>;
                const tone = cell.returns > 0 ? 'bg-alert-50 text-alert-800'
                  : cell.vsShop == null ? 'bg-steel-50 text-steel-700'
                  : cell.vsShop >= 10 ? 'bg-signal-50 text-signal-800'
                  : cell.vsShop <= -10 ? 'bg-pending-50 text-pending-800' : 'bg-steel-50 text-steel-700';
                return (
                  <td key={c} className="px-2 py-2 text-center">
                    <div className={`rounded-lg px-2 py-1.5 ${tone}`}>
                      <div className="font-semibold">{cell.count}×{cell.avgMin != null ? ` · ${fmtDur(cell.avgMin)}` : ''}</div>
                      <div className="text-[10px]">
                        {cell.vsShop != null ? signed(cell.vsShop) : 'sem comparação'}
                        {cell.returns > 0 && ` · ⚠ ${cell.returns} retorno${cell.returns > 1 ? 's' : ''}`}
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-steel-400 px-3 py-2 border-t border-steel-100">
        🟩 mais rápido que a média · 🟨 mais lento · 🟥 teve retorno por falha. Use para decidir quem escalar em cada tipo de serviço e onde treinar.
      </p>
    </div>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];
const levelColor = (level: string) =>
  level === 'Especialista' ? 'bg-signal-100 text-signal-800'
  : level === 'Muito bom' ? 'bg-brand-100 text-brand-800'
  : level === 'Bom' ? 'bg-steel-100 text-steel-700' : 'bg-pending-100 text-pending-800';

/** 🎯 Quem escalar em cada tipo de serviço: ranking de habilidade + sugestão */
function SkillBoard({ types }: { types: ServiceType[] }) {
  const withTeam = types.filter(t => t.mechanics.length > 0);
  return (
    <div>
      <div className="mb-3">
        <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">🎯 Quem escalar em cada serviço</div>
        <p className="text-xs text-steel-400">
          Nota de habilidade de 0 a 100 = experiência (25%) + velocidade vs. oficina (35%) + qualidade sem retornos (40%).
          Para uma visão mais completa, use o período de 6 ou 12 meses.
        </p>
      </div>
      {withTeam.length === 0 ? (
        <div className="card text-sm text-steel-500">Nenhum serviço com responsável definido no período.</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {withTeam.map(t => {
            const top = t.mechanics[0];
            const toTrain = t.mechanics.filter(x => x.returns > 0 || (x.vsShop ?? 0) <= -15);
            return (
              <div key={t.category} className="card flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-steel-900">{t.category}</div>
                  <div className="text-right text-[11px] text-steel-500 shrink-0">
                    {t.count} feito{t.count === 1 ? '' : 's'}
                    {t.medianMin != null && <span className="block">leva ~{fmtDur(t.medianMin)}</span>}
                  </div>
                </div>

                {/* Sugestão */}
                {t.best ? (
                  <div className="mt-3 rounded-xl bg-signal-50 border border-signal-200 px-3 py-2 text-sm text-signal-900">
                    👉 Escale <strong>{t.best.name}</strong>
                    {t.best.confidence === 'baixa' && <span className="text-[11px] text-signal-700"> · sugestão provisória (poucos dados)</span>}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl bg-steel-50 px-3 py-2 text-xs text-steel-500">
                    {t.mechanics.length === 1 ? `Só ${top.name} fez este serviço — ainda não dá para comparar.` : 'Poucos dados para sugerir.'}
                  </div>
                )}

                {/* Ranking */}
                <ol className="mt-3 space-y-2.5 flex-1">
                  {t.mechanics.slice(0, 5).map((x, i) => (
                    <li key={x.id}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <Link to={`/oficina/equipe/${x.id}`} className="min-w-0 truncate hover:text-brand-600">
                          <span className="mr-1">{MEDALS[i] ?? `${i + 1}.`}</span><strong>{x.name}</strong>
                        </Link>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${levelColor(x.level)}`}>{x.level}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-steel-100 overflow-hidden">
                        <div className={`h-full rounded-full ${x.score >= 80 ? 'bg-signal-500' : x.score >= 65 ? 'bg-brand-500' : x.score >= 50 ? 'bg-steel-400' : 'bg-pending-400'}`}
                          style={{ width: `${x.score}%` }} />
                      </div>
                      <div className="text-[11px] text-steel-500 mt-0.5">
                        nota {x.score} · {x.count}× · {x.avgMin != null ? fmtDur(x.avgMin) : 'sem tempo'}
                        {x.vsShop != null && x.vsShop !== 0 && ` · ${signed(x.vsShop)}`}
                        {x.returns > 0 ? <span className="text-alert-600"> · ⚠ {x.returns} retorno{x.returns > 1 ? 's' : ''}</span> : ' · 0 retornos'}
                        {x.confidence !== 'alta' && <span className="text-steel-400"> · confiança {x.confidence}</span>}
                      </div>
                    </li>
                  ))}
                </ol>

                {toTrain.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-steel-100 text-[11px] text-pending-800">
                    📚 Oportunidade de treino: {toTrain.map(x => x.name).join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MechanicCard({ m, bestAt }: { m: MechanicPerf; bestAt: string[] }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <Name m={m} />
        <div className="text-right text-xs text-steel-500 shrink-0">
          {m.services} serviço{m.services === 1 ? '' : 's'}
          {m.returnRate != null && <> · <span className={rateColor(m.returnRate)}>{pct(m.returnRate, 1)} retorno</span></>}
        </div>
      </div>
      {m.lowSample && (
        <p className="text-[11px] text-steel-400 mt-2">Poucos serviços no período — leia com cautela.</p>
      )}
      <div className="mt-3 space-y-1.5 text-sm">
        {bestAt.length > 0 && <div className="text-signal-800">🎯 Melhor da equipe em: <strong>{bestAt.join(', ')}</strong></div>}
        {m.strengths.map(s => <div key={s} className="text-signal-800">💪 {s}</div>)}
        {m.attention.map(s => <div key={s} className="text-alert-700">⚠️ {s}</div>)}
        {!m.strengths.length && !m.attention.length && (
          <div className="text-steel-500 text-xs">Sem destaques ainda — com mais serviços cronometrados por categoria aparecem pontos fortes e de atenção.</div>
        )}
      </div>
      {m.returns.length > 0 && (
        <div className="mt-3 pt-3 border-t border-steel-100">
          <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500 mb-1.5">Retornos no período</div>
          <ul className="space-y-1 text-xs">
            {m.returns.slice(0, 5).map(x => (
              <li key={x.id} className="flex flex-wrap gap-x-1.5">
                <Link to={`/oficina/os/${x.id}`} className="font-semibold text-brand-600 hover:underline">OS nº {osNumber(x)}</Link>
                <span className="text-steel-400">← nº {osNumber({ id: x.originalId, number: x.originalNumber })}</span>
                <span className="text-steel-600">{x.category}</span>
                {x.days != null && <span className="text-steel-400">· {x.days} dias</span>}
                <span className={x.counts ? 'text-alert-600' : 'text-steel-500'}>· {reworkCauseLabel(x.cause)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
