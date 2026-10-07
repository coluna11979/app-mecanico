import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import TeamTabs from '@/components/team/TeamTabs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fmtBRL, fmtDur } from '@/components/os/osHelpers';
import { fetchAll } from '@/lib/fetchAll';
import { useTeamAccess } from '@/lib/teamAccess';
import { MIN_SAMPLE, teamPerformance, type MechanicPerf, type PerfMechanic, type PerfOs } from '@/lib/teamPerformance';

type Period = '30d' | '90d' | '6m' | '12m';
const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: '30d', label: '30 dias', days: 30 },
  { key: '90d', label: '90 dias', days: 90 },
  { key: '6m',  label: '6 meses', days: 182 },
  { key: '12m', label: '12 meses', days: 365 },
];

type Os = PerfOs & { price: number | null };

/**
 * Desempenho simples, sem ranking: o que cada um concluiu no período.
 * Tempo médio e retornos só aparecem quando há dado suficiente; faturamento só para quem pode ver.
 */
export default function Desempenho() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { canRevenue } = useTeamAccess();
  const [period, setPeriod] = useState<Period>(() => {
    try { return (localStorage.getItem('desempenho-periodo') as Period) || '30d'; } catch { return '30d'; }
  });
  const [os, setOs] = useState<Os[]>([]);
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
          .select('id, number, title, status, quote_status, category, price, labor_cost, created_at, started_at, completed_at, estimated_hours, workshop_mechanic_id, rework_of_id, rework_cause, rework_mechanic_id, vehicle:vehicles(plate), pauses:service_order_pauses(started_at, ended_at, reason)')
          .eq('workshop_id', wid).order('created_at', { ascending: false }).order('id').range(a, b)),
        supabase.from('workshop_mechanics').select('id, name, photo_url, status, active').eq('workshop_id', wid).order('name'),
      ]);
      if (!alive) return;
      setOs((o.data as unknown as Os[]) ?? []);
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

  // Faturamento das OS concluídas em que a pessoa foi a responsável (retornos não contam)
  const revenue = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of os) {
      if (o.status !== 'completed' || o.quote_status || o.rework_of_id || !o.workshop_mechanic_id || !o.completed_at) continue;
      const t = new Date(o.completed_at);
      if (t < range.from || t >= range.to) continue;
      map.set(o.workshop_mechanic_id, (map.get(o.workshop_mechanic_id) ?? 0) + Number(o.price ?? 0));
    }
    return map;
  }, [os, range]);

  // Só mostra o que tem dado de verdade
  const rows = r.rows.filter(x => !x.inactive || x.services > 0);
  const showTime = rows.some(x => x.timed >= MIN_SAMPLE);
  const showReturns = r.shop.returnsInPeriod > 0;
  const total = rows.reduce((a, x) => a + x.services, 0);

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">🏆 Desempenho</h1>
            <p className="text-sm text-steel-500 mt-1">O que cada colaborador concluiu no período, pelas OS.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
                  period === p.key ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <TeamTabs />

        {loading ? (
          <div className="h-60 bg-white rounded-2xl animate-pulse" />
        ) : mechs.length === 0 ? (
          <div className="card text-center py-14">
            <div className="text-4xl mb-2">👷</div>
            <h2 className="text-lg font-bold">Cadastre sua equipe primeiro</h2>
            <Link to="/oficina/equipe/novo" className="btn-primary mt-5 inline-block">+ Novo colaborador</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {r.shop.unassigned > 0 && (
              <div className="card !py-3 border-l-4 border-l-pending-500 text-sm text-steel-700">
                {r.shop.unassigned} OS concluída{r.shop.unassigned > 1 ? 's' : ''} no período sem responsável não entra{r.shop.unassigned > 1 ? 'm' : ''} na conta de ninguém. Defina quem executou na OS.
              </div>
            )}

            {/* Desktop: tabela simples */}
            <div className="card !p-0 overflow-hidden hidden md:block">
              <table className="w-full text-sm">
                <thead className="bg-steel-50 border-b border-steel-100">
                  <tr>
                    <Th left>Colaborador</Th>
                    <Th>OS concluídas</Th>
                    {canRevenue && <Th>Faturamento</Th>}
                    {showTime && <Th>Tempo médio</Th>}
                    {showReturns && <Th>Retornos por falha</Th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {rows.map(x => (
                    <tr key={x.id}>
                      <td className="px-4 py-3"><Name m={x} /></td>
                      <Td>{x.services || '—'}</Td>
                      {canRevenue && <Td>{revenue.get(x.id) ? fmtBRL(revenue.get(x.id)!) : '—'}</Td>}
                      {showTime && <Td>{x.timed >= MIN_SAMPLE && x.avgMin != null ? fmtDur(x.avgMin) : <span className="text-steel-400">poucos dados</span>}</Td>}
                      {showReturns && <Td>{x.returnsCounted || '—'}</Td>}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-steel-50 border-t border-steel-100 text-steel-600">
                  <tr>
                    <td className="px-4 py-2.5 text-xs font-semibold">Oficina</td>
                    <Td>{total}</Td>
                    {canRevenue && <Td>{fmtBRL([...revenue.values()].reduce((a, v) => a + v, 0))}</Td>}
                    {showTime && <Td />}
                    {showReturns && <Td>{r.shop.returnsInPeriod}</Td>}
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Celular: cards */}
            <div className="md:hidden space-y-2">
              {rows.map(x => (
                <div key={x.id} className="card !p-4">
                  <Name m={x} />
                  <div className="grid grid-cols-2 gap-2 mt-3 text-center">
                    <Stat label="OS concluídas" value={String(x.services || '—')} />
                    {canRevenue && <Stat label="Faturamento" value={revenue.get(x.id) ? fmtBRL(revenue.get(x.id)!) : '—'} />}
                    {showTime && <Stat label="Tempo médio" value={x.timed >= MIN_SAMPLE && x.avgMin != null ? fmtDur(x.avgMin) : 'poucos dados'} />}
                    {showReturns && <Stat label="Retornos por falha" value={String(x.returnsCounted || '—')} />}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-steel-400 leading-relaxed">
              OS concluída no período em que a pessoa foi a responsável (retornos não contam como serviço).
              {canRevenue && ' Faturamento = valor dessas OS.'}
              {!showTime && ' Tempo médio aparece quando houver pelo menos ' + MIN_SAMPLE + ' OS cronometradas (▶ Iniciar e ✓ Concluir na OS) por pessoa.'}
              {showReturns && ' Retorno só conta quando a causa é falha na execução ou diagnóstico errado.'}
            </p>
          </div>
        )}
      </div>
    </WorkshopLayout>
  );
}

function Name({ m }: { m: MechanicPerf }) {
  return (
    <Link to={`/oficina/equipe/${m.id}`} className="flex items-center gap-2.5 min-w-0 hover:text-brand-600">
      <div className="h-8 w-8 rounded-full bg-brand-500/10 grid place-items-center text-brand-600 font-bold text-sm shrink-0">{m.name.charAt(0).toUpperCase()}</div>
      <span className="min-w-0">
        <span className="block font-semibold truncate">{m.name}</span>
        {m.inactive && <span className="block text-[10px] text-steel-400">inativo</span>}
      </span>
    </Link>
  );
}

function Th({ children, left = false }: { children: React.ReactNode; left?: boolean }) {
  return <th className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-steel-500 whitespace-nowrap ${left ? 'text-left' : 'text-right'}`}>{children}</th>;
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3 text-right whitespace-nowrap">{children}</td>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-steel-50 py-2">
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[10px] text-steel-500">{label}</div>
    </div>
  );
}
