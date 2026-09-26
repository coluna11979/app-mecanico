import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { supabase } from '@/lib/supabase';

type Resumo = {
  codigo_indicacao: string;
  embaixador_desde: string;
  embaixador_ate: string;
  total_indicados: number;
  ativos_30d: number;
  comissao_acumulada: number;
  comissao_paga: number;
  comissao_pendente: number;
};

type Indicado = {
  mechanic_id: string;
  full_name: string;
  cidade: string | null;
  aprovado: boolean;
  entrou_em: string;
  servicos_total: number;
  servicos_30d: number;
  comissao_acumulada: number;
};

export default function MecanicoEmbaixador() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [indicados, setIndicados] = useState<Indicado[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [share, setShare] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: r }, { data: i }] = await Promise.all([
      supabase.rpc('embaixador_resumo'),
      supabase.rpc('embaixador_indicados'),
    ]);
    const row = Array.isArray(r) ? r[0] : r;
    setResumo(row as Resumo);
    setIndicados((i as Indicado[]) ?? []);
    setLoading(false);
  }

  const link = resumo?.codigo_indicacao
    ? `${window.location.origin}/cadastro/mecanico?ref=${resumo.codigo_indicacao}`
    : '';

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      prompt('Copie o link:', link);
    }
  }

  async function compartilhar() {
    if (!link) return;
    const texto = `Trabalho como mecânico e uso essa plataforma pra pegar serviço de oficina. Quer entrar também? ${link}`;
    if (navigator.share) {
      try { await navigator.share({ text: texto, url: link }); return; } catch { /* usuário cancelou */ }
    }
    // Fallback: WhatsApp
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }

  // Se não é embaixador, tela informativa
  if (!loading && !resumo?.codigo_indicacao) {
    return (
      <MechanicLayout>
        <div className="p-4">
          <div className="card !bg-steel-800 border border-steel-700 text-center py-12">
            <div className="text-5xl mb-3">🌟</div>
            <h1 className="text-xl font-bold text-white">Você ainda não é embaixador</h1>
            <p className="text-steel-400 text-sm mt-2 max-w-sm mx-auto">
              O programa de embaixador é liberado pela equipe pra mecânicos selecionados.
              Se acha que se encaixa, fala com a gente pelo suporte.
            </p>
          </div>
        </div>
      </MechanicLayout>
    );
  }

  return (
    <MechanicLayout>
      <div className="p-4 space-y-4">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">🌟 Minhas Indicações</h1>
          <p className="text-sm text-steel-400 mt-1">
            Você ganha <strong className="text-brand-400">20% da comissão da plataforma</strong> sobre cada serviço dos mecânicos que você trouxer.
          </p>
        </div>

        {/* Card de destaque: link + código */}
        <div className="card !bg-gradient-to-br from-brand-600 to-brand-800 border border-brand-500/40 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-10 translate-x-10 pointer-events-none" />
          <div className="relative">
            <div className="text-xs font-bold uppercase tracking-widest text-brand-200 mb-1">Seu código</div>
            <div className="font-mono text-3xl font-bold text-white">{resumo?.codigo_indicacao}</div>
            <div className="mt-4 space-y-2">
              <div className="text-[10px] uppercase tracking-widest text-brand-200 font-bold">Seu link</div>
              <input
                readOnly
                value={link}
                onFocus={e => e.currentTarget.select()}
                className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-3 py-2 text-xs font-mono"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={copiar}
                  className="bg-white text-brand-700 font-bold rounded-xl py-2.5 text-sm active:scale-95 transition"
                >
                  {copied ? '✓ Copiado' : '📋 Copiar link'}
                </button>
                <button
                  onClick={compartilhar}
                  className="bg-white/15 hover:bg-white/25 text-white font-bold rounded-xl py-2.5 text-sm active:scale-95 transition border border-white/20"
                >
                  📱 Compartilhar
                </button>
              </div>
            </div>
            <button
              onClick={() => setShare(v => !v)}
              className="text-[11px] text-brand-200 hover:text-white mt-3 underline underline-offset-2"
            >
              {share ? '× Fechar' : 'Como funciona?'}
            </button>
            {share && (
              <div className="mt-3 text-xs text-brand-100 leading-relaxed space-y-2 bg-black/20 rounded-xl p-3 border border-white/10">
                <p>✓ Manda esse link no WhatsApp pra mecânicos que confia.</p>
                <p>✓ Cada serviço que ele fizer, a plataforma fica com <strong className="text-white">18%</strong>. Você recebe <strong className="text-white">20% dessa parte</strong>.</p>
                <div className="bg-white/10 rounded-lg p-2.5 border border-white/10 font-mono text-[11px] leading-snug">
                  <div className="text-[9px] uppercase tracking-wider text-brand-200 font-sans font-bold mb-0.5">Exemplo</div>
                  Serviço R$ 500 → plataforma R$ 90 → <strong className="text-white">você R$ 18</strong>
                </div>
                <p>✓ Enquanto ele trabalhar pela plataforma, você continua ganhando.</p>
                <p>✓ Você precisa fazer <strong>pelo menos 1 serviço a cada 30 dias</strong> pra continuar ativo.</p>
                <p className="text-[10px] text-brand-200 italic pt-1 border-t border-white/10">
                  O mecânico indicado não sabe que existe comissão.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Indicados"        value={String(resumo?.total_indicados ?? 0)} />
          <StatCard label="Ativos (30d)"     value={String(resumo?.ativos_30d ?? 0)} />
          <StatCard label="Ganho acumulado"  value={`R$ ${Number(resumo?.comissao_acumulada ?? 0).toFixed(0)}`} accent="signal" />
          <StatCard label="A receber"        value={`R$ ${Number(resumo?.comissao_pendente ?? 0).toFixed(2).replace('.', ',')}`} accent="brand" />
        </div>

        {/* Lista de indicados */}
        <section>
          <h2 className="text-sm font-bold text-steel-400 uppercase tracking-wider mb-2">
            {indicados.length === 0 ? 'Nenhuma indicação ainda' : `${indicados.length} ${indicados.length === 1 ? 'indicado' : 'indicados'}`}
          </h2>
          {loading ? (
            <div className="space-y-2">
              {[1,2].map(i => <div key={i} className="card !bg-steel-800 h-20 animate-pulse-soft" />)}
            </div>
          ) : indicados.length === 0 ? (
            <div className="card !bg-steel-800 border border-dashed border-steel-700 text-center py-10">
              <div className="text-4xl mb-2">📤</div>
              <p className="text-steel-400 text-sm max-w-xs mx-auto">
                Copie seu link ali em cima e mande no WhatsApp pra 2-3 mecânicos que você confia.
                Quando eles pegarem serviço, aparecem aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {indicados.map(ind => (
                <div key={ind.mechanic_id} className="card !bg-steel-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white truncate">{ind.full_name}</div>
                      <div className="text-xs text-steel-400 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {ind.cidade && <span>📍 {ind.cidade}</span>}
                        <span>Entrou {new Date(ind.entrou_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</span>
                      </div>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                          ind.aprovado ? 'bg-signal-500/20 text-signal-300' : 'bg-pending-500/20 text-pending-300'
                        }`}>
                          {ind.aprovado ? '✓ Aprovado' : '⏳ Em análise'}
                        </span>
                        {ind.servicos_30d > 0 && (
                          <span className="text-[10px] font-bold rounded-full px-2 py-0.5 bg-signal-500/20 text-signal-300">
                            🟢 Ativo — {ind.servicos_30d} serviço{ind.servicos_30d > 1 ? 's' : ''}/30d
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-steel-500 uppercase tracking-wider">Você ganhou</div>
                      <div className="text-signal-400 font-bold font-display text-lg">
                        R$ {Number(ind.comissao_acumulada).toFixed(0)}
                      </div>
                      <div className="text-[10px] text-steel-500 mt-0.5">
                        {ind.servicos_total} {ind.servicos_total === 1 ? 'serviço' : 'serviços'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Rodapé — validade e status */}
        {resumo?.embaixador_ate && (
          <div className="text-center text-[11px] text-steel-500 pt-4">
            Programa vigente até {new Date(resumo.embaixador_ate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
            {' · '}<Link to="/mecanico/perfil" className="text-brand-400 hover:text-brand-300 underline underline-offset-2">Ver perfil</Link>
          </div>
        )}
      </div>
    </MechanicLayout>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: 'brand' | 'signal' }) {
  const color = accent === 'signal' ? 'text-signal-400'
              : accent === 'brand'  ? 'text-brand-400'
              : 'text-white';
  return (
    <div className="card !bg-steel-800 border border-steel-700">
      <div className="text-[10px] uppercase tracking-widest text-steel-400 font-bold">{label}</div>
      <div className={`text-2xl font-bold font-display mt-1 ${color}`}>{value}</div>
    </div>
  );
}
