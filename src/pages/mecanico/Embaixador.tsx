import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import { formatMoney } from '@/lib/payment';
import { supabase } from '@/lib/supabase';
import { PERGUNTAS, type Respostas, pesquisaCompleta } from '@/lib/embaixadorPesquisa';

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

  // Ainda não é embaixador: explica o programa e deixa pedir (o admin aprova)
  if (!loading && !resumo?.codigo_indicacao) {
    return (
      <MechanicLayout>
        <PedirEmbaixador />
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
                <p>✓ Cada serviço que ele fizer, a plataforma fica com <strong className="text-white">20%</strong>. Você recebe <strong className="text-white">20% dessa parte</strong>.</p>
                <div className="bg-white/10 rounded-lg p-2.5 border border-white/10 font-mono text-[11px] leading-snug">
                  <div className="text-[9px] uppercase tracking-wider text-brand-200 font-sans font-bold mb-0.5">Exemplo</div>
                  Serviço R$ 500 → plataforma R$ 100 → <strong className="text-white">você R$ 20</strong>
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
          <StatCard label="Ganho acumulado"  value={`R$ ${formatMoney(Number(resumo?.comissao_acumulada ?? 0))}`} accent="signal" />
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
                        R$ {formatMoney(Number(ind.comissao_acumulada))}
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

type Pedido = { status: 'pendente' | 'aprovado' | 'recusado'; created_at: string; decided_at: string | null };

function PedirEmbaixador() {
  const [pedido, setPedido] = useState<Pedido | null | undefined>(undefined);
  const [motivo, setMotivo] = useState('');
  const [resp, setResp] = useState<Respostas>({});
  const [sending, setSending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('meu_pedido_embaixador').then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setPedido((row as Pedido) ?? null);
    });
  }, []);

  async function pedir() {
    if (!pesquisaCompleta(resp)) { setErro('Responda todas as perguntas para enviar.'); return; }
    setSending(true); setErro(null);
    const { error } = await supabase.rpc('pedir_embaixador', { p_motivo: motivo, p_respostas: resp });
    setSending(false);
    if (error) { setErro('Não deu pra enviar agora. Tente de novo em instantes.'); return; }
    setPedido({ status: 'pendente', created_at: new Date().toISOString(), decided_at: null });
  }

  const pendente = pedido?.status === 'pendente';
  const recusado = pedido?.status === 'recusado';

  return (
    <div className="p-4 space-y-4">
      <div className="card !bg-steel-800 border border-steel-700">
        <div className="text-4xl mb-2">🌟</div>
        <h1 className="text-xl font-bold text-white">Programa de embaixadores</h1>
        <p className="text-steel-400 text-sm mt-1">
          Indique mecânicos para o MecânicoApp e ganhe uma parte da nossa comissão em cada serviço que eles fizerem.
        </p>
        <ul className="mt-4 space-y-2.5 text-sm text-steel-200">
          <li className="flex gap-2"><span>🔗</span><span>Você ganha um <b className="text-white">link e um código</b> só seus para indicar.</span></li>
          <li className="flex gap-2"><span>💸</span><span>Recebe <b className="text-white">20% da comissão da plataforma</b> nos serviços de quem entrou pelo seu link. Não sai nada do ganho deles.</span></li>
          <li className="flex gap-2"><span>📊</span><span>Acompanha aqui quem entrou, quantos serviços fizeram e quanto você tem a receber.</span></li>
        </ul>
        <div className="mt-4 rounded-xl bg-steel-900/60 border border-steel-700 p-3 text-xs text-steel-400">
          Exemplo: serviço de R$ 500 → nossa comissão R$ 100 → <b className="text-brand-400">você recebe R$ 20</b>.
        </div>
      </div>

      {pedido === undefined ? null : pendente ? (
        <div className="card !bg-steel-800 border border-pending-500/40">
          <div className="font-bold text-white">⏳ Pedido enviado</div>
          <p className="text-steel-400 text-sm mt-1">
            Recebemos seu pedido em {new Date(pedido!.created_at).toLocaleDateString('pt-BR')}. A equipe analisa e, quando aprovar,
            seu link de indicação aparece aqui nesta tela.
          </p>
        </div>
      ) : (
        <div className="card !bg-steel-800 border border-steel-700 space-y-3">
          {recusado && (
            <p className="text-sm text-steel-400">
              Seu último pedido não foi aprovado. Continue fazendo serviços bem avaliados e peça de novo quando quiser.
            </p>
          )}
          <div>
            <div className="font-bold text-white">Conte um pouco sobre você</div>
            <p className="text-xs text-steel-400">Leva menos de 1 minuto. A equipe usa para analisar o pedido.</p>
          </div>
          {PERGUNTAS.map(q => {
            const atual = resp[q.id];
            const marcado = (v: string) => (Array.isArray(atual) ? atual.includes(v) : atual === v);
            function toggle(v: string) {
              setErro(null);
              setResp(r => {
                if (!q.multipla) return { ...r, [q.id]: v };
                const lista = Array.isArray(r[q.id]) ? (r[q.id] as string[]) : [];
                return { ...r, [q.id]: lista.includes(v) ? lista.filter(x => x !== v) : [...lista, v] };
              });
            }
            return (
              <fieldset key={q.id}>
                <legend className="text-sm font-semibold text-white mb-1.5">
                  {q.texto} {q.multipla && <span className="font-normal text-steel-400">(pode marcar mais de um)</span>}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {q.opcoes.map(o => (
                    <button key={o.v} type="button" onClick={() => toggle(o.v)}
                      className={`min-h-[44px] px-3.5 rounded-xl border text-sm font-semibold transition ${marcado(o.v)
                        ? 'bg-brand-500 border-brand-500 text-white' : 'border-steel-600 text-steel-200'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            );
          })}
          <label className="block">
            <span className="text-sm font-semibold text-white">Quer contar mais alguma coisa? (opcional)</span>
            <textarea className="input mt-1 text-sm" rows={3} maxLength={300} value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: conheço vários mecânicos do meu bairro e de um grupo de WhatsApp de autônomos." />
          </label>
          {erro && <p className="text-sm text-alert-400">{erro}</p>}
          <button className="btn-primary w-full min-h-[48px]" disabled={sending} onClick={pedir}>
            {sending ? 'Enviando…' : 'Quero ser embaixador'}
          </button>
        </div>
      )}
    </div>
  );
}
