import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { PERGUNTAS, type Respostas, labelResposta, notaPerfil } from '@/lib/embaixadorPesquisa';

type Row = {
  mechanic_id: string;
  profile_id: string;
  full_name: string;
  phone: string | null;
  codigo_indicacao: string | null;
  embaixador_desde: string | null;
  embaixador_ate: string | null;
  ativo: boolean;
  total_indicados: number;
  comissao_acumulada: number;
  comissao_pendente: number;
};

export default function AdminEmbaixadores() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.rpc('admin_listar_embaixadores');
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }

  async function pagarComissoes(r: Row) {
    if (r.comissao_pendente <= 0) return;
    if (!confirm(
      `Confirmar pagamento de R$ ${r.comissao_pendente.toFixed(2)} pra ${r.full_name} via PIX?\n\n` +
      `Depois de confirmar, tu paga no banco e as comissões ficam marcadas como pagas aqui no sistema.`
    )) return;
    setBusy(r.mechanic_id);
    const { error } = await supabase.rpc('admin_pagar_comissoes', {
      p_embaixador_id: r.mechanic_id,
      p_valor: r.comissao_pendente,
    });
    setBusy(null);
    if (error) { alert('Erro: ' + error.message); return; }
    load();
  }

  async function copiarLink(codigo: string) {
    const url = `${window.location.origin}/cadastro/mecanico?ref=${codigo}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(codigo);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      prompt('Copie o link:', url);
    }
  }

  const totalPendente = rows.reduce((s, r) => s + Number(r.comissao_pendente || 0), 0);
  const totalAcumulado = rows.reduce((s, r) => s + Number(r.comissao_acumulada || 0), 0);
  const totalIndicados = rows.reduce((s, r) => s + Number(r.total_indicados || 0), 0);

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight">🌟 Embaixadores</h1>
          <p className="text-steel-500 text-sm mt-1">
            Ganham <strong>20% da nossa comissão</strong> (não do bruto) sobre cada serviço dos indicados — enquanto ativos e dentro do programa de 12 meses.
          </p>
        </div>
      </div>

      <PedidosEmbaixador onDecided={load} />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Embaixadores"       value={rows.length.toString()} />
        <Kpi label="Total indicados"    value={totalIndicados.toString()} />
        <Kpi label="Comissão acumulada" value={`R$ ${totalAcumulado.toFixed(2).replace('.', ',')}`} />
        <Kpi label="A pagar (PIX)"      value={`R$ ${totalPendente.toFixed(2).replace('.', ',')}`} highlight={totalPendente > 0} />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2].map(i => <div key={i} className="card h-24 animate-pulse bg-steel-100" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-16 text-steel-500">
          <div className="text-4xl mb-3">🌟</div>
          <div className="font-semibold mb-2">Nenhum embaixador ainda</div>
          <p className="text-sm max-w-md mx-auto">
            Abra a página de um mecânico em <Link className="text-brand-500 hover:underline" to="/admin/mecanicos">Mecânicos</Link> e
            use o botão <strong>"Tornar embaixador"</strong> pra começar.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.mechanic_id} className="card">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Link to={`/admin/usuario/${r.profile_id}`} className="font-bold text-steel-900 hover:text-brand-500 truncate">
                      {r.full_name}
                    </Link>
                    <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                      r.ativo ? 'bg-signal-500/10 text-signal-700' : 'bg-alert-500/10 text-alert-700'
                    }`}>
                      {r.ativo ? '● ATIVO' : '○ INATIVO'}
                    </span>
                  </div>
                  <div className="text-xs text-steel-500 flex flex-wrap gap-x-3 gap-y-0.5">
                    {r.phone && <span>📱 {r.phone}</span>}
                    {r.embaixador_desde && (
                      <span>
                        Desde {new Date(r.embaixador_desde).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {r.embaixador_ate && (
                      <span>
                        Programa até {new Date(r.embaixador_ate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex gap-2 items-center">
                    <span className="font-mono text-xs bg-brand-50 text-brand-700 border border-brand-200 rounded px-2 py-1">
                      {r.codigo_indicacao}
                    </span>
                    <button
                      onClick={() => r.codigo_indicacao && copiarLink(r.codigo_indicacao)}
                      className="text-xs text-brand-600 hover:text-brand-700 font-semibold"
                    >
                      {copied === r.codigo_indicacao ? '✓ link copiado' : 'Copiar link →'}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 md:min-w-[420px]">
                  <StatMini label="Indicados"  value={r.total_indicados.toString()} />
                  <StatMini label="Acumulado"  value={`R$ ${Number(r.comissao_acumulada).toFixed(0)}`} />
                  <StatMini
                    label="A pagar"
                    value={`R$ ${Number(r.comissao_pendente).toFixed(2).replace('.', ',')}`}
                    highlight={r.comissao_pendente > 0}
                  />
                </div>
              </div>

              {r.comissao_pendente > 0 && (
                <div className="mt-3 pt-3 border-t border-steel-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <p className="text-xs text-steel-600">
                    Tem <strong className="text-signal-700">R$ {Number(r.comissao_pendente).toFixed(2).replace('.', ',')}</strong> pendentes.
                    Pague via PIX e marque como pago abaixo.
                  </p>
                  <button
                    onClick={() => pagarComissoes(r)}
                    disabled={busy === r.mechanic_id}
                    className="btn-primary text-xs !py-2 !px-4 disabled:opacity-50"
                  >
                    {busy === r.mechanic_id ? 'Marcando…' : '✓ Marcar como pago'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

function Kpi({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? 'border-2 border-signal-500/40 bg-signal-500/5' : ''}`}>
      <div className="text-[11px] uppercase tracking-widest text-steel-500 font-bold mb-1">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? 'text-signal-700' : 'text-steel-900'}`}>{value}</div>
    </div>
  );
}

function StatMini({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-2 text-center ${highlight ? 'bg-signal-500/10' : 'bg-steel-50'}`}>
      <div className="text-[9px] uppercase tracking-wider text-steel-500 font-bold">{label}</div>
      <div className={`font-bold text-sm mt-0.5 ${highlight ? 'text-signal-700' : 'text-steel-900'}`}>{value}</div>
    </div>
  );
}

type Pedido = {
  id: string; mechanic_id: string; profile_id: string; full_name: string; phone: string | null;
  city: string | null; state: string | null; rating: number | null; total_jobs: number | null;
  motivo: string | null; respostas: Respostas | null; created_at: string;
};

const NIVEL = {
  forte: { label: 'Perfil forte', cls: 'bg-signal-500/15 text-signal-700' },
  medio: { label: 'Perfil médio', cls: 'bg-pending-500/15 text-pending-800' },
  fraco: { label: 'Perfil fraco', cls: 'bg-alert-500/10 text-alert-700' },
};

/** Pedidos feitos pelo app (botão "Quero ser embaixador"): aprovar gera o código na hora. */
function PedidosEmbaixador({ onDecided }: { onDecided: () => void }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.rpc('admin_listar_pedidos_embaixador');
    setPedidos((data as Pedido[]) ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function decidir(p: Pedido, aprovar: boolean) {
    if (!aprovar && !confirm(`Recusar o pedido de ${p.full_name}? Ele poderá pedir de novo depois.`)) return;
    setBusy(p.id);
    const { error } = await supabase.rpc('admin_decidir_pedido_embaixador', { p_id: p.id, p_aprovar: aprovar });
    setBusy(null);
    if (error) { alert('Erro: ' + error.message); return; }
    await load();
    if (aprovar) onDecided();
  }

  if (!pedidos.length) return null;
  return (
    <div className="card border-2 border-pending-500/40 bg-pending-500/5 mb-6">
      <div className="font-bold text-steel-900 mb-3">⏳ Pedidos para ser embaixador ({pedidos.length})</div>
      <div className="divide-y divide-steel-100">
        {pedidos.map(p => {
          const n = notaPerfil(p.respostas, p);
          return (
          <div key={p.id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Link to={`/admin/usuario/${p.profile_id}`} className="font-semibold text-steel-900 hover:text-brand-500">{p.full_name}</Link>
                <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${NIVEL[n.nivel].cls}`}>{NIVEL[n.nivel].label} · {n.pontos}/{n.max}</span>
              </div>
              <div className="text-xs text-steel-500 flex flex-wrap gap-x-3">
                {p.city && <span>📍 {p.city}{p.state ? `/${p.state}` : ''}</span>}
                <span>🔧 {p.total_jobs ?? 0} serviços</span>
                {p.rating != null && <span>⭐ {Number(p.rating).toFixed(1)}</span>}
                {p.phone && <span>📱 {p.phone}</span>}
                <span>Pediu em {new Date(p.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
              <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {PERGUNTAS.map(q => (
                  <div key={q.id}>
                    <dt className="text-steel-500">{q.texto}</dt>
                    <dd className="font-semibold text-steel-800">{labelResposta(q, p.respostas?.[q.id])}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-steel-500 mt-1">Na plataforma: {n.motivos.join(' · ')}</p>
              {p.motivo && <p className="text-sm text-steel-700 mt-1">“{p.motivo}”</p>}
            </div>
            <div className="flex gap-2 shrink-0">
              <button className="btn-primary text-sm min-h-[40px]" disabled={busy === p.id} onClick={() => decidir(p, true)}>
                {busy === p.id ? '…' : '✓ Aprovar'}
              </button>
              <button className="btn-ghost text-sm min-h-[40px] text-steel-500" disabled={busy === p.id} onClick={() => decidir(p, false)}>Recusar</button>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
