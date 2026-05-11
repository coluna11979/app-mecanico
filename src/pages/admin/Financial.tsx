import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

interface Summary {
  grossTotal: number;
  grossMes: number;
  grossHoje: number;
  receitaTotal: number;
  receitaMes: number;
  repasseTotal: number;
  retido: number;
  feePercent: number;
}

interface MonthRow {
  month: string;
  jobs: number;
  gross: number;
  receita: number;
  repasse: number;
}

interface RecentTx {
  id: string;
  job_id: string;
  amount: number;
  platform_fee: number;
  mechanic_amount: number;
  status: string;
  paid_at: string | null;
}

export default function AdminFinancial() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [recent, setRecent] = useState<RecentTx[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [useJobsFallback, setUseJobsFallback] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [{ data: feeRow }, { data: txAll }, { data: txHeld }] = await Promise.all([
      supabase.from('app_settings').select('value').eq('key', 'platform_fee_percent').single(),
      supabase.from('transactions').select('*').order('paid_at', { ascending: false }).limit(50),
      supabase.from('transactions').select('amount').eq('status', 'held'),
    ]);

    const feePercent = parseFloat((feeRow as any)?.value ?? '15') / 100;
    const hasTx = (txAll?.length ?? 0) > 0;

    if (!hasTx) {
      // Fallback: use jobs table
      setUseJobsFallback(true);
      const { data: jobs } = await supabase
        .from('jobs')
        .select('price,completed_at')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });

      const allJobs = jobs ?? [];
      const grossTotal = allJobs.reduce((a, j) => a + ((j as any).price ?? 0), 0);
      const grossMes = allJobs
        .filter(j => (j as any).completed_at >= monthStart)
        .reduce((a, j) => a + ((j as any).price ?? 0), 0);
      const grossHoje = allJobs
        .filter(j => (j as any).completed_at >= todayStart)
        .reduce((a, j) => a + ((j as any).price ?? 0), 0);

      setSummary({
        grossTotal, grossMes, grossHoje,
        receitaTotal: grossTotal * feePercent,
        receitaMes: grossMes * feePercent,
        repasseTotal: grossTotal * (1 - feePercent),
        retido: 0,
        feePercent,
      });

      // Build monthly rows from jobs
      const byMonth: Record<string, { jobs: number; gross: number }> = {};
      allJobs.forEach(j => {
        if (!(j as any).completed_at) return;
        const d = new Date((j as any).completed_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonth[key]) byMonth[key] = { jobs: 0, gross: 0 };
        byMonth[key].jobs++;
        byMonth[key].gross += (j as any).price ?? 0;
      });
      const monthRows = Object.entries(byMonth)
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 12)
        .map(([key, v]) => ({
          month: formatMonth(key),
          jobs: v.jobs,
          gross: v.gross,
          receita: v.gross * feePercent,
          repasse: v.gross * (1 - feePercent),
        }));
      setMonths(monthRows);
      setRecent([]);
    } else {
      setUseJobsFallback(false);
      const all = txAll ?? [];
      const retido = (txHeld ?? []).reduce((a, t) => a + ((t as any).amount ?? 0), 0);
      const grossTotal = all.reduce((a, t) => a + ((t as any).amount ?? 0), 0);
      const grossMes = all
        .filter(t => (t as any).paid_at >= monthStart)
        .reduce((a, t) => a + ((t as any).amount ?? 0), 0);
      const grossHoje = all
        .filter(t => (t as any).paid_at >= todayStart)
        .reduce((a, t) => a + ((t as any).amount ?? 0), 0);
      const receitaTotal = all.reduce((a, t) => a + ((t as any).platform_fee ?? 0), 0);
      const receitaMes = all
        .filter(t => (t as any).paid_at >= monthStart)
        .reduce((a, t) => a + ((t as any).platform_fee ?? 0), 0);
      const repasseTotal = all.reduce((a, t) => a + ((t as any).mechanic_amount ?? 0), 0);

      setSummary({ grossTotal, grossMes, grossHoje, receitaTotal, receitaMes, repasseTotal, retido, feePercent });

      // Build monthly rows from transactions
      const byMonth: Record<string, { jobs: number; gross: number; receita: number; repasse: number }> = {};
      all.forEach(t => {
        const dateStr = (t as any).paid_at;
        if (!dateStr) return;
        const d = new Date(dateStr);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!byMonth[key]) byMonth[key] = { jobs: 0, gross: 0, receita: 0, repasse: 0 };
        byMonth[key].jobs++;
        byMonth[key].gross += (t as any).amount ?? 0;
        byMonth[key].receita += (t as any).platform_fee ?? 0;
        byMonth[key].repasse += (t as any).mechanic_amount ?? 0;
      });
      setMonths(
        Object.entries(byMonth)
          .sort(([a], [b]) => b.localeCompare(a))
          .slice(0, 12)
          .map(([key, v]) => ({ month: formatMonth(key), ...v }))
      );
      setRecent(all.slice(0, 50) as unknown as RecentTx[]);
    }

    setLoading(false);
  }

  const filteredRecent = recent.filter(t =>
    !search || t.job_id?.toLowerCase().includes(search.toLowerCase())
  );

  const feePercent = summary?.feePercent ?? 0.15;
  const feeDisplay = (feePercent * 100).toFixed(0);

  return (
    <AdminLayout>
      <h1 className="text-3xl font-bold tracking-tight mb-1">Financeiro</h1>
      <p className="text-steel-500 mb-6">
        Visão macro de receitas e repasses
        {useJobsFallback && (
          <span className="ml-2 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
            baseado em jobs (transações não registradas)
          </span>
        )}
      </p>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-steel-400">Carregando...</div>
      ) : (
        <>
          {/* Summary Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <SummaryCard label="Volume hoje" value={fmt(summary?.grossHoje)} accent />
            <SummaryCard label="Volume mês" value={fmt(summary?.grossMes)} />
            <SummaryCard label="Receita mês" value={fmt(summary?.receitaMes)} sub={`taxa de ${feeDisplay}%`} accent />
            <SummaryCard label="Receita total" value={fmt(summary?.receitaTotal)} sub="acumulada" />
            <SummaryCard label="GMV total" value={fmt(summary?.grossTotal)} sub="volume processado" />
            <SummaryCard label="Repasses totais" value={fmt(summary?.repasseTotal)} sub="a mecânicos" />
            {!useJobsFallback && (
              <SummaryCard label="Saldo retido" value={fmt(summary?.retido)} sub="aguardando liberação" />
            )}
          </div>

          {/* Fee Simulator */}
          <div className="card mb-8">
            <div className="text-sm font-semibold text-steel-700 mb-4">
              Simulador de taxa — impacto sobre o volume do mês (R$ {fmt(summary?.grossMes)})
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {[-2, -1, 0, 1, 2].map(delta => {
                const rate = Math.max(0, feePercent + delta / 100);
                const receita = (summary?.grossMes ?? 0) * rate;
                const isBase = delta === 0;
                return (
                  <div
                    key={delta}
                    className={`text-center p-3 rounded-xl border ${isBase ? 'bg-brand-50 border-brand-300' : 'bg-steel-50 border-steel-200'}`}
                  >
                    <div className={`text-lg font-bold ${isBase ? 'text-brand-600' : ''}`}>
                      {(rate * 100).toFixed(0)}%
                    </div>
                    <div className="text-[11px] text-steel-500 mt-0.5">
                      {isBase ? 'atual' : delta > 0 ? `+${delta}%` : `${delta}%`}
                    </div>
                    <div className="text-sm font-semibold mt-1">R$ {fmt(receita)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Monthly Table */}
          {months.length > 0 && (
            <div className="card mb-8 overflow-x-auto">
              <div className="text-sm font-semibold text-steel-700 mb-4">Resumo mensal (últimos 12 meses)</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-steel-500 border-b border-steel-100">
                    <th className="text-left py-2 pr-4">Mês</th>
                    <th className="text-right py-2 pr-4">Jobs</th>
                    <th className="text-right py-2 pr-4">Volume bruto</th>
                    <th className="text-right py-2 pr-4">Receita plataforma</th>
                    <th className="text-right py-2">Repasses mecânicos</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((row, i) => (
                    <tr key={i} className="border-b border-steel-50 hover:bg-steel-50 transition">
                      <td className="py-2.5 pr-4 font-medium">{row.month}</td>
                      <td className="text-right pr-4 text-steel-600">{row.jobs}</td>
                      <td className="text-right pr-4 font-semibold">R$ {fmt(row.gross)}</td>
                      <td className="text-right pr-4 text-signal-600 font-semibold">R$ {fmt(row.receita)}</td>
                      <td className="text-right text-steel-600">R$ {fmt(row.repasse)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-steel-200 font-bold">
                    <td className="py-2.5 pr-4 text-xs uppercase tracking-wider text-steel-500">Total</td>
                    <td className="text-right pr-4">{months.reduce((a, r) => a + r.jobs, 0)}</td>
                    <td className="text-right pr-4">R$ {fmt(months.reduce((a, r) => a + r.gross, 0))}</td>
                    <td className="text-right pr-4 text-signal-600">R$ {fmt(months.reduce((a, r) => a + r.receita, 0))}</td>
                    <td className="text-right">R$ {fmt(months.reduce((a, r) => a + r.repasse, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Recent Transactions */}
          {recent.length > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm font-semibold text-steel-700">Transações recentes</div>
                <input
                  type="text"
                  placeholder="Buscar por job ID..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="input text-sm w-48"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-steel-500 border-b border-steel-100">
                      <th className="text-left py-2 pr-4">Job ID</th>
                      <th className="text-right py-2 pr-4">Valor</th>
                      <th className="text-right py-2 pr-4">Plataforma</th>
                      <th className="text-right py-2 pr-4">Mecânico</th>
                      <th className="text-left py-2 pr-4">Status</th>
                      <th className="text-left py-2">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecent.map(t => (
                      <tr key={t.id} className="border-b border-steel-50 hover:bg-steel-50 transition">
                        <td className="py-2 pr-4 font-mono text-[11px] text-steel-500">{t.job_id?.slice(0, 8)}…</td>
                        <td className="text-right pr-4 font-semibold">R$ {fmt(t.amount)}</td>
                        <td className="text-right pr-4 text-signal-600">R$ {fmt(t.platform_fee)}</td>
                        <td className="text-right pr-4 text-steel-600">R$ {fmt(t.mechanic_amount)}</td>
                        <td className="pr-4">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="text-steel-500 text-xs">
                          {t.paid_at ? new Date(t.paid_at).toLocaleDateString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {months.length === 0 && recent.length === 0 && (
            <div className="card text-center py-16 text-steel-400">
              <div className="text-4xl mb-3">📊</div>
              <div className="font-semibold">Nenhum dado financeiro ainda</div>
              <div className="text-sm mt-1">Os dados aparecerão conforme os jobs forem concluídos</div>
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
}

function fmt(v?: number) {
  return (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMonth(key: string) {
  const [year, month] = key.split('-');
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${months[parseInt(month) - 1]}/${year}`;
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-steel-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold font-display leading-none ${accent ? 'text-brand-500' : ''}`}>
        R$ {value}
      </div>
      {sub && <div className="text-[11px] text-steel-400 mt-1.5">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    held: 'bg-amber-50 text-amber-700 border-amber-200',
    released: 'bg-green-50 text-green-700 border-green-200',
    refunded: 'bg-red-50 text-red-700 border-red-200',
  };
  const labels: Record<string, string> = { held: 'retido', released: 'liberado', refunded: 'estornado' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${map[status] ?? 'bg-steel-100 text-steel-600 border-steel-200'}`}>
      {labels[status] ?? status}
    </span>
  );
}
