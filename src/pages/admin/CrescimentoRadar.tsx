import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { CrescimentoTabs } from '@/components/admin/CrescimentoTabs';

interface RadarRow {
  cidade_key: string;
  cidade:     string;
  estado:     string;
  n_mecanicos: number;
  n_oficinas:  number;
  mec_aprovados: number;
  ofi_aprovadas: number;
  razao_mec_ofi: number | null;
  status: 'sem_oficina' | 'sem_mecanico' | 'excesso_mecanico' | 'excesso_oficina' | 'equilibrado';
  oportunidade: number;
}

interface Resumo {
  total_mec: number;
  total_ofi: number;
  mec_sem_cidade: number;
  ofi_sem_cidade: number;
  cidades_cobertas: number;
  cidades_sem_mecanico: number;
  cidades_sem_oficina:  number;
  razao_global: number | null;
}

const STATUS_META: Record<RadarRow['status'], { label: string; emoji: string; cls: string; action: string }> = {
  sem_oficina:      { label: 'Sem oficina',       emoji: '🏭', cls: 'bg-alert-50 border-alert-200 text-alert-700',   action: 'Captar oficinas aqui' },
  sem_mecanico:     { label: 'Sem mecânico',      emoji: '🔧', cls: 'bg-alert-50 border-alert-200 text-alert-700',   action: 'Captar mecânicos aqui' },
  excesso_mecanico: { label: 'Mec > Ofi (3×)',    emoji: '⚠️', cls: 'bg-pending-50 border-pending-300 text-pending-700', action: 'Captar oficinas' },
  excesso_oficina:  { label: 'Ofi > Mec (3×)',    emoji: '⚠️', cls: 'bg-pending-50 border-pending-300 text-pending-700', action: 'Captar mecânicos' },
  equilibrado:      { label: 'Equilibrado',       emoji: '✓',  cls: 'bg-signal-500/10 border-signal-200 text-signal-700', action: '—' },
};

type FiltroStatus = 'all' | RadarRow['status'];

export default function CrescimentoRadar() {
  const [rows, setRows]     = useState<RadarRow[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroStatus>('all');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr(null);
    const [a, b] = await Promise.all([
      supabase.rpc('admin_radar_cidades'),
      supabase.rpc('admin_radar_resumo'),
    ]);
    if (a.error) { setErr(a.error.message); setLoading(false); return; }
    if (b.error) { setErr(b.error.message); setLoading(false); return; }
    setRows((a.data ?? []) as RadarRow[]);
    const r = Array.isArray(b.data) ? b.data[0] : b.data;
    setResumo((r ?? null) as Resumo | null);
    setLoading(false);
  }

  const filtered = filtro === 'all' ? rows : rows.filter(r => r.status === filtro);
  const oportunidades = rows.filter(r => r.status === 'sem_oficina' || r.status === 'sem_mecanico').slice(0, 5);

  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="admin-h1">Crescimento</h1>
        <p className="text-steel-500 text-sm mt-0.5">Radar, metas e funis — a central de comando pra captar e conectar.</p>
      </div>
      <CrescimentoTabs />

      {/* KPIs do Radar */}
      {loading ? (
        <div className="admin-card p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : err ? (
        <div className="bg-alert-50 border border-alert-200 rounded-xl p-4 text-sm text-alert-700">{err}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <KpiMini label="Mecânicos"       value={resumo?.total_mec ?? 0} />
            <KpiMini label="Oficinas"        value={resumo?.total_ofi ?? 0} />
            <KpiMini label="Razão M/O"       value={resumo?.razao_global != null ? resumo.razao_global.toFixed(2) : '—'}
                     hint={razaoHint(resumo?.razao_global)} />
            <KpiMini label="Cidades cobertas" value={resumo?.cidades_cobertas ?? 0} />
            <KpiMini label="Desequilíbrios"
                     value={(resumo?.cidades_sem_mecanico ?? 0) + (resumo?.cidades_sem_oficina ?? 0)}
                     hint="cidades que precisam de ação" tone="alert" />
          </div>

          {/* Alertas de dados faltando */}
          {((resumo?.mec_sem_cidade ?? 0) > 0 || (resumo?.ofi_sem_cidade ?? 0) > 0) && (
            <div className="bg-pending-50 border border-pending-200 rounded-xl p-3 mb-4 flex items-start gap-3 text-sm">
              <span className="text-pending-700 text-base">⚠️</span>
              <div className="flex-1">
                <div className="font-semibold text-pending-800">Dados faltando</div>
                <div className="text-pending-700 text-xs mt-0.5">
                  {resumo?.mec_sem_cidade ? <><b>{resumo.mec_sem_cidade}</b> mecânico{resumo.mec_sem_cidade > 1 ? 's' : ''} sem cidade cadastrada. </> : null}
                  {resumo?.ofi_sem_cidade ? <><b>{resumo.ofi_sem_cidade}</b> oficina{resumo.ofi_sem_cidade > 1 ? 's' : ''} sem cidade. </> : null}
                  Esses registros ficam fora do radar — abra o cadastro em{' '}
                  <Link to="/admin/mecanicos" className="underline">Mecânicos</Link> /{' '}
                  <Link to="/admin/oficinas" className="underline">Oficinas</Link> e peça a localização.
                </div>
              </div>
            </div>
          )}

          {/* Oportunidades priorizadas */}
          {oportunidades.length > 0 && (
            <div className="admin-card p-4 mb-4">
              <h2 className="admin-h2 mb-3">🎯 Oportunidades de captação — top 5</h2>
              <div className="space-y-2">
                {oportunidades.map(r => (
                  <OpportunityRow key={r.cidade_key} row={r} />
                ))}
              </div>
            </div>
          )}

          {/* Tabela completa */}
          <div className="admin-card">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-steel-200 flex-wrap">
              <h2 className="admin-h2">Mapa de cidades</h2>
              <div className="flex items-center gap-1 text-xs">
                <FilterChip active={filtro === 'all'} onClick={() => setFiltro('all')}>
                  Todas ({rows.length})
                </FilterChip>
                <FilterChip active={filtro === 'sem_oficina'} onClick={() => setFiltro('sem_oficina')} tone="alert">
                  Sem oficina ({rows.filter(r => r.status === 'sem_oficina').length})
                </FilterChip>
                <FilterChip active={filtro === 'sem_mecanico'} onClick={() => setFiltro('sem_mecanico')} tone="alert">
                  Sem mecânico ({rows.filter(r => r.status === 'sem_mecanico').length})
                </FilterChip>
                <FilterChip active={filtro === 'excesso_mecanico'} onClick={() => setFiltro('excesso_mecanico')} tone="warn">
                  Mec &gt; Ofi ({rows.filter(r => r.status === 'excesso_mecanico').length})
                </FilterChip>
                <FilterChip active={filtro === 'excesso_oficina'} onClick={() => setFiltro('excesso_oficina')} tone="warn">
                  Ofi &gt; Mec ({rows.filter(r => r.status === 'excesso_oficina').length})
                </FilterChip>
                <FilterChip active={filtro === 'equilibrado'} onClick={() => setFiltro('equilibrado')} tone="success">
                  Equilibrado ({rows.filter(r => r.status === 'equilibrado').length})
                </FilterChip>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="p-10 text-center text-steel-400 text-sm italic">Nenhuma cidade no filtro.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-steel-500 bg-steel-50/50 border-b border-steel-200">
                    <tr>
                      <th className="text-left px-4 py-2">Cidade</th>
                      <th className="text-right px-3 py-2">🔧 Mec</th>
                      <th className="text-right px-3 py-2">🏭 Ofi</th>
                      <th className="text-right px-3 py-2">Razão</th>
                      <th className="text-left px-3 py-2">Status</th>
                      <th className="text-left px-3 py-2 w-[200px]">Ação sugerida</th>
                      <th className="text-right px-3 py-2">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-steel-100">
                    {filtered.map(r => (
                      <tr key={r.cidade_key} className="hover:bg-steel-50">
                        <td className="px-4 py-2.5 font-semibold text-steel-800">
                          {r.cidade}{r.estado && <span className="text-steel-400 font-normal ml-1">/{r.estado}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right admin-num text-steel-700">
                          {r.n_mecanicos}
                          {r.mec_aprovados < r.n_mecanicos && (
                            <span className="text-[10px] text-steel-400 ml-1">({r.mec_aprovados} aprov.)</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right admin-num text-steel-700">
                          {r.n_oficinas}
                          {r.ofi_aprovadas < r.n_oficinas && (
                            <span className="text-[10px] text-steel-400 ml-1">({r.ofi_aprovadas} aprov.)</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right admin-num text-steel-500">
                          {r.razao_mec_ofi ?? '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold rounded px-1.5 py-0.5 border ${STATUS_META[r.status].cls}`}>
                            {STATUS_META[r.status].emoji} {STATUS_META[r.status].label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-steel-600">
                          {r.status === 'equilibrado' ? (
                            <span className="text-steel-400">—</span>
                          ) : (
                            <ActionLink status={r.status} cidade={r.cidade} />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <ScoreBar score={r.oportunidade} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
}

function KpiMini({ label, value, hint, tone }: { label: string; value: string | number; hint?: string; tone?: 'alert' }) {
  return (
    <div className="admin-card p-3">
      <div className="admin-label mb-1">{label}</div>
      <div className={`admin-num text-2xl font-bold ${tone === 'alert' ? 'text-alert-700' : 'text-steel-900'}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-steel-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function razaoHint(razao: number | null | undefined): string {
  if (razao == null) return 'sem oficinas';
  if (razao > 2)   return `${razao.toFixed(1)} mec. p/ ofi — captar oficinas`;
  if (razao < 0.5) return `${razao.toFixed(1)} mec. p/ ofi — captar mecânicos`;
  return 'equilibrado';
}

function FilterChip({ active, onClick, tone, children }: {
  active: boolean; onClick: () => void; tone?: 'alert' | 'warn' | 'success'; children: React.ReactNode;
}) {
  const toneCls = tone === 'alert' ? 'text-alert-700' : tone === 'warn' ? 'text-pending-700' : tone === 'success' ? 'text-signal-700' : 'text-steel-700';
  return (
    <button onClick={onClick}
      className={`px-2 py-1 rounded-md font-semibold transition ${
        active
          ? 'bg-steel-100 text-steel-900'
          : `${toneCls} hover:bg-steel-50`
      }`}>
      {children}
    </button>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const cls = pct >= 80 ? 'bg-alert-500' : pct >= 60 ? 'bg-pending-500' : pct >= 30 ? 'bg-brand-500' : 'bg-steel-300';
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-steel-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="admin-num text-[11px] text-steel-500 w-6 text-right">{pct}</span>
    </div>
  );
}

function OpportunityRow({ row }: { row: RadarRow }) {
  const falta = row.status === 'sem_oficina' ? 'oficinas' : row.status === 'sem_mecanico' ? 'mecânicos' : null;
  if (!falta) return null;
  const texto = row.status === 'sem_oficina'
    ? `${row.cidade} tem ${row.n_mecanicos} mecânico${row.n_mecanicos > 1 ? 's' : ''} esperando job — mas 0 oficina na plataforma.`
    : `${row.cidade} tem ${row.n_oficinas} oficina${row.n_oficinas > 1 ? 's' : ''} ativa${row.n_oficinas > 1 ? 's' : ''} — mas 0 mecânico cadastrado.`;
  return (
    <div className="flex items-start gap-3 p-2.5 bg-alert-50/40 border border-alert-100 rounded-lg">
      <span className="text-alert-600 shrink-0">●</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-steel-800">{texto}</div>
        <div className="text-xs text-steel-500 mt-0.5">
          Ação: <Link to={`/admin/leads/importar?cidade=${encodeURIComponent(row.cidade)}`}
            className="font-semibold text-brand-600 hover:underline">
            captar {falta} em {row.cidade} →
          </Link>
        </div>
      </div>
    </div>
  );
}

function ActionLink({ status, cidade }: { status: RadarRow['status']; cidade: string }) {
  const label = STATUS_META[status].action;
  return (
    <Link to={`/admin/leads/importar?cidade=${encodeURIComponent(cidade)}`}
      className="text-brand-700 hover:underline font-semibold">
      {label} →
    </Link>
  );
}
