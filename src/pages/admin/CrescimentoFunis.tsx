import { useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { CrescimentoTabs } from '@/components/admin/CrescimentoTabs';

interface Funil {
  leads_total: number;
  contato_feito: number;
  interessado: number;
  cadastro_iniciado: number;
  convertido: number;
  perdido: number;
  profiles_total: number;
  aprovados: number;
  com_atividade: number;
}

export default function CrescimentoFunis() {
  const [mec, setMec] = useState<Funil | null>(null);
  const [ofi, setOfi] = useState<Funil | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr(null);
    const [a, b] = await Promise.all([
      supabase.rpc('admin_funil_por_tipo', { p_tipo: 'mechanic' }),
      supabase.rpc('admin_funil_por_tipo', { p_tipo: 'workshop' }),
    ]);
    if (a.error) { setErr(a.error.message); setLoading(false); return; }
    if (b.error) { setErr(b.error.message); setLoading(false); return; }
    const am = Array.isArray(a.data) ? a.data[0] : a.data;
    const bm = Array.isArray(b.data) ? b.data[0] : b.data;
    setMec(am as Funil);
    setOfi(bm as Funil);
    setLoading(false);
  }

  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="admin-h1">Crescimento</h1>
        <p className="text-steel-500 text-sm mt-0.5">Radar, metas e funis — a central de comando pra captar e conectar.</p>
      </div>
      <CrescimentoTabs />

      {loading ? (
        <div className="admin-card p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : err ? (
        <div className="bg-alert-50 border border-alert-200 rounded-xl p-4 text-sm text-alert-700">{err}</div>
      ) : (
        <>
          <div className="mb-3">
            <h2 className="admin-h2">Funil completo até ativação</h2>
            <p className="text-xs text-steel-500 mt-0.5">
              Lead → Cadastro → Aprovado → <b>Ativado</b> (primeira atividade real). "Perdeu" na última etapa é o pior tipo — gastou aquisição e aprovação, mas nunca gerou retorno.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FunilCard title="🔧 Mecânicos" data={mec} />
            <FunilCard title="🏭 Oficinas"  data={ofi} />
          </div>

          <div className="admin-card p-4 mt-4">
            <h3 className="admin-h2 mb-2">Comparativo</h3>
            <ComparativoTable mec={mec} ofi={ofi} />
          </div>
        </>
      )}
    </AdminLayout>
  );
}

interface Etapa { key: string; label: string; value: number; }

function FunilCard({ title, data }: { title: string; data: Funil | null }) {
  if (!data) return <div className="admin-card p-10 text-center text-steel-400 italic">Sem dados</div>;

  // Monta a cadeia completa (lead → cadastro → aprovado → ativado)
  const etapas: Etapa[] = [
    { key: 'leads',    label: 'Leads total',             value: data.leads_total + data.profiles_total /* cadastros diretos não vieram de lead */ },
    { key: 'cadastro', label: 'Cadastro completo',       value: data.profiles_total },
    { key: 'aprovado', label: 'Aprovado',                value: data.aprovados },
    { key: 'ativado',  label: 'Ativado (primeira ação)', value: data.com_atividade },
  ];
  // Fallback: se leads_total for 0 (não tem lead no pipeline), base é cadastros
  if (data.leads_total === 0) etapas[0].value = data.profiles_total;

  const max = Math.max(1, ...etapas.map(e => e.value));
  const colors = ['bg-steel-400', 'bg-brand-500', 'bg-pending-500', 'bg-signal-500'];

  return (
    <div className="admin-card p-4">
      <h3 className="admin-h2 mb-3">{title}</h3>
      <div className="space-y-2.5">
        {etapas.map((e, i) => {
          const pct = (e.value / max) * 100;
          const taxaPrev = i > 0 && etapas[i - 1].value > 0 ? (e.value / etapas[i - 1].value) * 100 : null;
          return (
            <div key={e.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-steel-700">{e.label}</span>
                <span className="text-steel-500">
                  <b className="admin-num text-steel-900">{e.value}</b>
                  {taxaPrev !== null && (
                    <span className={`ml-2 admin-num font-bold ${taxaPrev >= 50 ? 'text-signal-700' : taxaPrev >= 25 ? 'text-pending-700' : 'text-alert-700'}`}>
                      {taxaPrev.toFixed(0)}%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-6 bg-steel-100 rounded-md overflow-hidden">
                <div className={`h-full ${colors[i]} rounded-md flex items-center justify-end px-2 text-white text-[10px] font-bold transition-all`}
                     style={{ width: `${Math.max(pct, 2)}%` }}>
                  {pct > 15 ? `${pct.toFixed(0)}%` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Taxas-chave */}
      <div className="mt-3 pt-3 border-t border-steel-100 grid grid-cols-2 gap-2 text-xs">
        <TaxaKey label="Lead → Cadastro"  pct={pct(data.profiles_total, Math.max(data.leads_total, 1))} />
        <TaxaKey label="Cadastro → Aprovado" pct={pct(data.aprovados, data.profiles_total)} />
        <TaxaKey label="Aprovado → Ativado"  pct={pct(data.com_atividade, data.aprovados)} />
        <TaxaKey label="Lead → Ativado (full)" pct={pct(data.com_atividade, data.leads_total || data.profiles_total)} highlight />
      </div>

      {/* Alerta de ativação baixa */}
      {data.aprovados > 0 && pct(data.com_atividade, data.aprovados) < 50 && (
        <div className="mt-3 bg-alert-50 border border-alert-200 rounded-lg p-2.5 text-xs text-alert-700">
          <b>⚠️ Ativação baixa:</b> dos {data.aprovados} aprovados, só {data.com_atividade} ({pct(data.com_atividade, data.aprovados).toFixed(0)}%) teve atividade. Investigar: onboarding? primeiro job?
        </div>
      )}
    </div>
  );
}

function TaxaKey({ label, pct, highlight }: { label: string; pct: number; highlight?: boolean }) {
  const cls = pct >= 50 ? 'text-signal-700' : pct >= 25 ? 'text-pending-700' : 'text-alert-700';
  return (
    <div className={highlight ? 'col-span-2 bg-steel-50 border border-steel-200 rounded p-2' : ''}>
      <div className="text-[10px] uppercase tracking-wider text-steel-500 font-semibold">{label}</div>
      <div className={`admin-num text-lg font-bold ${cls}`}>{pct.toFixed(0)}%</div>
    </div>
  );
}

function ComparativoTable({ mec, ofi }: { mec: Funil | null; ofi: Funil | null }) {
  if (!mec || !ofi) return null;
  const rows: { k: string; m: number; o: number; isPct?: boolean }[] = [
    { k: 'Leads total',       m: mec.leads_total,       o: ofi.leads_total },
    { k: 'Cadastros',         m: mec.profiles_total,    o: ofi.profiles_total },
    { k: 'Aprovados',         m: mec.aprovados,         o: ofi.aprovados },
    { k: 'Ativados',          m: mec.com_atividade,     o: ofi.com_atividade },
    { k: 'Taxa aprovação',    m: pct(mec.aprovados, mec.profiles_total),   o: pct(ofi.aprovados, ofi.profiles_total), isPct: true },
    { k: 'Taxa ativação',     m: pct(mec.com_atividade, mec.aprovados),    o: pct(ofi.com_atividade, ofi.aprovados), isPct: true },
  ];
  return (
    <table className="w-full text-sm">
      <thead className="text-xs uppercase tracking-wider text-steel-500 border-b border-steel-200">
        <tr>
          <th className="text-left py-2">Métrica</th>
          <th className="text-right py-2 px-3">🔧 Mecânicos</th>
          <th className="text-right py-2 px-3">🏭 Oficinas</th>
          <th className="text-right py-2 px-3">Vencedor</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const winner = r.m > r.o ? 'mec' : r.o > r.m ? 'ofi' : 'tie';
          return (
            <tr key={r.k} className="border-b border-steel-100">
              <td className="py-2 font-medium text-steel-700">{r.k}</td>
              <td className={`py-2 px-3 text-right admin-num ${winner === 'mec' ? 'font-bold text-signal-700' : 'text-steel-600'}`}>
                {r.isPct ? `${r.m.toFixed(0)}%` : r.m.toLocaleString('pt-BR')}
              </td>
              <td className={`py-2 px-3 text-right admin-num ${winner === 'ofi' ? 'font-bold text-signal-700' : 'text-steel-600'}`}>
                {r.isPct ? `${r.o.toFixed(0)}%` : r.o.toLocaleString('pt-BR')}
              </td>
              <td className="py-2 px-3 text-right text-xs">
                {winner === 'mec' ? '🔧' : winner === 'ofi' ? '🏭' : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function pct(a: number, b: number): number {
  if (!b) return 0;
  return (a / b) * 100;
}
