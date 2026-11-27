import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

type Status = 'ideia' | 'planejado' | 'fazendo' | 'feito';
type Prioridade = 'alta' | 'media' | 'baixa';

interface Melhoria {
  id: string;
  quadro_id: string | null;
  titulo: string;
  descricao: string | null;
  status: Status;
  prioridade: Prioridade;
  data_alvo: string | null;
  posicao: number;
  criado_em: string;
  feito_em: string | null;
}

interface Quadro {
  id: string;
  nome: string;
  emoji: string;
  cor: string;
  posicao: number;
}

const COLUNAS: { key: Status; label: string; dot: string; bar: string; hint: string }[] = [
  { key: 'ideia',     label: 'Ideias',    dot: 'bg-steel-400',   bar: 'bg-steel-300',   hint: 'Anotou pra não esquecer' },
  { key: 'planejado', label: 'Planejado', dot: 'bg-blue-500',    bar: 'bg-blue-400',    hint: 'Vai fazer, com data' },
  { key: 'fazendo',   label: 'Fazendo',   dot: 'bg-pending-500', bar: 'bg-pending-400', hint: 'Em andamento agora' },
  { key: 'feito',     label: 'Feito',     dot: 'bg-signal-500',  bar: 'bg-signal-500',  hint: 'Entregue' },
];

const PRIORIDADE: Record<Prioridade, { label: string; cls: string }> = {
  alta:  { label: 'Alta',  cls: 'bg-alert-50 text-alert-700 border-alert-200' },
  media: { label: 'Média', cls: 'bg-pending-50 text-pending-700 border-pending-200' },
  baixa: { label: 'Baixa', cls: 'bg-steel-50 text-steel-600 border-steel-200' },
};

// Classes escritas por extenso para o Tailwind gerar
const CORES: Record<string, { faixa: string; fundo: string; texto: string; anel: string }> = {
  brand:   { faixa: 'bg-brand-500',   fundo: 'bg-brand-50',   texto: 'text-brand-700',   anel: 'ring-brand-300' },
  blue:    { faixa: 'bg-blue-500',    fundo: 'bg-blue-50',    texto: 'text-blue-700',    anel: 'ring-blue-300' },
  violet:  { faixa: 'bg-violet-500',  fundo: 'bg-violet-50',  texto: 'text-violet-700',  anel: 'ring-violet-300' },
  emerald: { faixa: 'bg-emerald-500', fundo: 'bg-emerald-50', texto: 'text-emerald-700', anel: 'ring-emerald-300' },
  rose:    { faixa: 'bg-rose-500',    fundo: 'bg-rose-50',    texto: 'text-rose-700',    anel: 'ring-rose-300' },
  cyan:    { faixa: 'bg-cyan-500',    fundo: 'bg-cyan-50',    texto: 'text-cyan-700',    anel: 'ring-cyan-300' },
  amber:   { faixa: 'bg-amber-500',   fundo: 'bg-amber-50',   texto: 'text-amber-700',   anel: 'ring-amber-300' },
  steel:   { faixa: 'bg-steel-500',   fundo: 'bg-steel-100',  texto: 'text-steel-700',   anel: 'ring-steel-300' },
};
const cor = (c: string) => CORES[c] ?? CORES.steel;

const EMOJIS = ['📌', '🔧', '🏪', '🛠️', '💳', '📣', '🌐', '🤖', '🚀', '💡', '📱', '📊', '🧾', '👥', '🔒', '⚡', '🎯', '🐞'];

const hoje = () => new Date().toISOString().slice(0, 10);

export default function AdminMelhorias() {
  const [params, setParams] = useSearchParams();
  const quadroId = params.get('quadro');

  const [quadros, setQuadros] = useState<Quadro[]>([]);
  const [itens, setItens] = useState<Melhoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Melhoria | { status: Status; quadro_id: string | null } | null>(null);
  const [editQuadro, setEditQuadro] = useState<Quadro | 'novo' | null>(null);
  const [busca, setBusca] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const [feitosTodos, setFeitosTodos] = useState(false);

  async function load() {
    const [q, m] = await Promise.all([
      supabase.from('admin_melhorias_quadros').select('id, nome, emoji, cor, posicao').order('posicao'),
      supabase.from('admin_melhorias')
        .select('id, quadro_id, titulo, descricao, status, prioridade, data_alvo, posicao, criado_em, feito_em')
        .order('posicao', { ascending: true }),
    ]);
    if (q.error || m.error) setErr((q.error ?? m.error)!.message);
    setQuadros((q.data ?? []) as Quadro[]);
    setItens((m.data ?? []) as Melhoria[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const quadro = quadros.find(q => q.id === quadroId) ?? null;
  const abrirQuadro = (id: string | null) => {
    setBusca(''); setFeitosTodos(false);
    setParams(id ? { quadro: id } : {});
  };

  const stats = useMemo(() => {
    const porQuadro: Record<string, { ideia: number; planejado: number; fazendo: number; feito: number; alta: number; atrasadas: number }> = {};
    quadros.forEach(q => { porQuadro[q.id] = { ideia: 0, planejado: 0, fazendo: 0, feito: 0, alta: 0, atrasadas: 0 }; });
    itens.forEach(i => {
      const s = i.quadro_id && porQuadro[i.quadro_id];
      if (!s) return;
      s[i.status]++;
      if (i.status !== 'feito' && i.prioridade === 'alta') s.alta++;
      if (i.status !== 'feito' && i.data_alvo && i.data_alvo < hoje()) s.atrasadas++;
    });
    return porQuadro;
  }, [quadros, itens]);

  const escopo = quadro ? itens.filter(i => i.quadro_id === quadro.id) : itens;
  const abertas = escopo.filter(i => i.status !== 'feito').length;
  const altas = escopo.filter(i => i.status !== 'feito' && i.prioridade === 'alta').length;
  const atrasadas = escopo.filter(i => i.status !== 'feito' && i.data_alvo && i.data_alvo < hoje()).length;
  const agora = new Date();
  const feitasMes = escopo.filter(i => i.feito_em && new Date(i.feito_em).getMonth() === agora.getMonth()
    && new Date(i.feito_em).getFullYear() === agora.getFullYear()).length;

  const resultadosBusca = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q || quadro) return [];
    return itens.filter(i => i.titulo.toLowerCase().includes(q) || (i.descricao ?? '').toLowerCase().includes(q));
  }, [busca, itens, quadro]);

  const porColuna = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const ordemPrio: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };
    const g: Record<Status, Melhoria[]> = { ideia: [], planejado: [], fazendo: [], feito: [] };
    if (!quadro) return g;
    itens
      .filter(i => i.quadro_id === quadro.id)
      .filter(i => !q || i.titulo.toLowerCase().includes(q) || (i.descricao ?? '').toLowerCase().includes(q))
      .forEach(i => g[i.status].push(i));
    (['ideia', 'planejado', 'fazendo'] as Status[]).forEach(s =>
      g[s].sort((a, b) => ordemPrio[a.prioridade] - ordemPrio[b.prioridade] || a.posicao - b.posicao));
    g.feito.sort((a, b) => (b.feito_em ?? '').localeCompare(a.feito_em ?? ''));
    return g;
  }, [itens, quadro, busca]);

  async function mover(id: string, status: Status) {
    const atual = itens.find(i => i.id === id);
    if (!atual || atual.status === status) return;
    setItens(prev => prev.map(i => i.id === id
      ? { ...i, status, feito_em: status === 'feito' ? new Date().toISOString() : null } : i));
    const { error } = await supabase.from('admin_melhorias').update({ status, posicao: Date.now() / 1000 }).eq('id', id);
    if (error) { setErr(error.message); load(); }
  }

  function onDrop(status: Status) {
    if (dragId) mover(dragId, status);
    setDragId(null); setDragOver(null);
  }

  const Resumo = (
    <div className="flex items-center gap-3 text-xs text-steel-500 flex-wrap">
      <span><b className="admin-num text-steel-800">{abertas}</b> em aberto</span>
      <span className="text-steel-300">·</span>
      <span><b className="admin-num text-alert-700">{altas}</b> prioridade alta</span>
      {atrasadas > 0 && (<>
        <span className="text-steel-300">·</span>
        <span className="text-alert-700 font-semibold">⚠ <b className="admin-num">{atrasadas}</b> atrasada{atrasadas > 1 ? 's' : ''}</span>
      </>)}
      <span className="text-steel-300">·</span>
      <span><b className="admin-num text-signal-700">{feitasMes}</b> feitas este mês</span>
    </div>
  );

  return (
    <AdminLayout>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div className="min-w-0">
          {quadro ? (
            <>
              <button onClick={() => abrirQuadro(null)} className="text-xs font-semibold text-steel-500 hover:text-brand-600 mb-1">
                ← Todos os quadros
              </button>
              <div className="flex items-center gap-2">
                <span className="text-2xl leading-none">{quadro.emoji}</span>
                <h1 className="admin-h1 truncate">{quadro.nome}</h1>
                <button onClick={() => setEditQuadro(quadro)} title="Editar quadro"
                  className="text-steel-400 hover:text-steel-700 text-sm px-1.5 py-0.5 rounded hover:bg-steel-100">✎</button>
              </div>
            </>
          ) : (
            <>
              <h1 className="admin-h1">Quadros de melhorias</h1>
              <p className="text-steel-500 text-sm mt-0.5">Um quadro para cada área. Anote a ideia na hora e arraste o cartão conforme avança.</p>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {!quadro && (
            <button onClick={() => setEditQuadro('novo')}
              className="border border-steel-200 bg-white hover:bg-steel-50 text-steel-700 font-semibold text-sm px-3 py-2 rounded-lg">
              + Novo quadro
            </button>
          )}
          <button onClick={() => setEditing({ status: 'ideia', quadro_id: quadro?.id ?? null })}
            className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm px-3 py-2 rounded-lg">
            + Nova melhoria
          </button>
        </div>
      </div>

      {/* Abas dos quadros */}
      {!loading && quadros.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1">
          <Aba ativo={!quadro} onClick={() => abrirQuadro(null)}>▦ Visão geral</Aba>
          {quadros.map(q => {
            const s = stats[q.id];
            const n = s ? s.ideia + s.planejado + s.fazendo : 0;
            return (
              <Aba key={q.id} ativo={quadro?.id === q.id} onClick={() => abrirQuadro(q.id)}>
                <span>{q.emoji}</span> {q.nome}
                {n > 0 && <span className="admin-num text-[10px] font-bold bg-steel-200/70 text-steel-600 rounded px-1">{n}</span>}
              </Aba>
            );
          })}
          <button onClick={() => setEditQuadro('novo')} title="Criar quadro"
            className="shrink-0 h-8 w-8 rounded-lg border border-dashed border-steel-300 text-steel-400 hover:text-brand-600 hover:border-brand-400">+</button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap mb-3">
        {Resumo}
      </div>

      <div className="flex items-center gap-2 bg-white border border-steel-200 rounded-lg px-2 py-1.5 mb-4">
        <span className="text-steel-400 text-sm pl-1">⌕</span>
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder={quadro ? `Buscar em ${quadro.nome}…` : 'Buscar em todos os quadros…'}
          className="flex-1 min-w-0 px-1 py-1 text-sm bg-transparent outline-none" />
        {busca && <button onClick={() => setBusca('')} className="text-steel-400 hover:text-steel-700 text-lg leading-none px-1">×</button>}
      </div>

      {err && <div className="bg-alert-50 border border-alert-200 rounded-xl p-3 text-sm text-alert-700 mb-4">{err}</div>}

      {loading ? (
        <div className="admin-card p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : !quadro ? (
        busca.trim() ? (
          /* Resultado da busca geral */
          <div className="admin-card divide-y divide-steel-100">
            {resultadosBusca.length === 0 && <div className="p-6 text-center text-sm text-steel-400">Nada encontrado.</div>}
            {resultadosBusca.map(i => {
              const q = quadros.find(x => x.id === i.quadro_id);
              const col = COLUNAS.find(c => c.key === i.status)!;
              return (
                <button key={i.id} onClick={() => setEditing(i)}
                  className="w-full text-left px-3 py-2.5 hover:bg-steel-50 flex items-center gap-3">
                  <span className={`admin-dot ${col.dot}`} />
                  <span className={`text-sm font-semibold flex-1 min-w-0 truncate ${i.status === 'feito' ? 'line-through text-steel-400' : 'text-steel-800'}`}>{i.titulo}</span>
                  {q && <span className="text-[11px] text-steel-500 shrink-0">{q.emoji} {q.nome}</span>}
                  <span className="text-[11px] text-steel-400 shrink-0 w-16 text-right">{col.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          /* Visão geral: um cartão por quadro */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {quadros.map(q => (
              <CartaoQuadro key={q.id} q={q} s={stats[q.id]}
                proximos={itens.filter(i => i.quadro_id === q.id && i.status !== 'feito')
                  .sort((a, b) => ({ fazendo: 0, planejado: 1, ideia: 2, feito: 3 }[a.status] - { fazendo: 0, planejado: 1, ideia: 2, feito: 3 }[b.status])
                    || ({ alta: 0, media: 1, baixa: 2 }[a.prioridade] - { alta: 0, media: 1, baixa: 2 }[b.prioridade]))
                  .slice(0, 3)}
                onOpen={() => abrirQuadro(q.id)} />
            ))}
            <button onClick={() => setEditQuadro('novo')}
              className="rounded-xl border-2 border-dashed border-steel-200 hover:border-brand-400 hover:bg-brand-50/40 text-steel-400 hover:text-brand-600 min-h-[170px] grid place-items-center text-sm font-semibold transition">
              <span><span className="text-2xl block text-center leading-none mb-1">+</span>Criar quadro</span>
            </button>
          </div>
        )
      ) : (
        /* Quadro inteiro */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {COLUNAS.map(col => {
            const cards = porColuna[col.key];
            const visiveis = col.key === 'feito' && !feitosTodos ? cards.slice(0, 12) : cards;
            return (
              <div key={col.key}
                onDragOver={(e: DragEvent) => { e.preventDefault(); setDragOver(col.key); }}
                onDragLeave={() => setDragOver(d => d === col.key ? null : d)}
                onDrop={() => onDrop(col.key)}
                className={`bg-steel-100/60 rounded-xl p-2 flex flex-col md:min-h-[calc(100vh-320px)] min-h-[160px] transition ${dragOver === col.key ? 'ring-2 ring-brand-400 bg-brand-50' : ''}`}>
                <div className="flex items-center justify-between px-1 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`admin-dot ${col.dot}`} />
                    <span className="text-xs font-semibold text-steel-700">{col.label}</span>
                    <span className="admin-num text-xs font-bold text-steel-500">{cards.length}</span>
                  </div>
                  {col.key !== 'feito' && (
                    <button onClick={() => setEditing({ status: col.key, quadro_id: quadro.id })}
                      className="text-steel-400 hover:text-brand-600 text-lg leading-none px-1" title={`Adicionar em ${col.label}`}>+</button>
                  )}
                </div>
                <div className="space-y-1.5 flex-1">
                  {visiveis.map(i => (
                    <Cartao key={i.id} m={i}
                      dragging={dragId === i.id}
                      onDragStart={() => setDragId(i.id)}
                      onDragEnd={() => { setDragId(null); setDragOver(null); }}
                      onOpen={() => setEditing(i)}
                      onConcluir={() => mover(i.id, 'feito')} />
                  ))}
                  {cards.length === 0 && (
                    <div className="text-[11px] text-steel-400 text-center py-6 italic">{col.hint}</div>
                  )}
                  {col.key === 'feito' && cards.length > 12 && (
                    <button onClick={() => setFeitosTodos(v => !v)}
                      className="w-full text-xs text-steel-500 hover:text-steel-800 py-1">
                      {feitosTodos ? 'mostrar menos' : `ver todas (${cards.length})`}
                    </button>
                  )}
                </div>
                {col.key !== 'feito' && (
                  <button onClick={() => setEditing({ status: col.key, quadro_id: quadro.id })}
                    className="mt-1.5 w-full text-left text-xs text-steel-400 hover:text-brand-600 hover:bg-white rounded-lg px-2 py-1.5">
                    + Adicionar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <MelhoriaModal
          item={'id' in editing ? editing : null}
          statusInicial={editing.status}
          quadroInicial={editing.quadro_id ?? quadros[0]?.id ?? null}
          quadros={quadros}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}

      {editQuadro && (
        <QuadroModal
          quadro={editQuadro === 'novo' ? null : editQuadro}
          cartoes={editQuadro === 'novo' ? 0 : itens.filter(i => i.quadro_id === editQuadro.id).length}
          onClose={() => setEditQuadro(null)}
          onSaved={(id) => { setEditQuadro(null); load(); if (id) abrirQuadro(id); }}
          onDeleted={() => { setEditQuadro(null); abrirQuadro(null); load(); }} />
      )}
    </AdminLayout>
  );
}

function Aba({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 h-8 inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
        ativo ? 'bg-steel-900 text-white' : 'bg-white border border-steel-200 text-steel-600 hover:border-steel-300 hover:text-steel-800'}`}>
      {children}
    </button>
  );
}

function CartaoQuadro({ q, s, proximos, onOpen }: {
  q: Quadro;
  s?: { ideia: number; planejado: number; fazendo: number; feito: number; alta: number; atrasadas: number };
  proximos: Melhoria[];
  onOpen: () => void;
}) {
  const c = cor(q.cor);
  const total = s ? s.ideia + s.planejado + s.fazendo + s.feito : 0;
  const abertas = s ? s.ideia + s.planejado + s.fazendo : 0;
  return (
    <button onClick={onOpen}
      className="text-left bg-white rounded-xl border border-steel-200 hover:border-steel-300 hover:shadow-sm transition overflow-hidden flex flex-col min-h-[170px]">
      <div className={`h-1 ${c.faixa}`} />
      <div className="p-3 flex-1 flex flex-col">
        <div className="flex items-center gap-2">
          <span className={`h-8 w-8 rounded-lg grid place-items-center text-base ${c.fundo}`}>{q.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-steel-800 truncate">{q.nome}</div>
            <div className="text-[11px] text-steel-500">
              <b className="admin-num text-steel-700">{abertas}</b> em aberto
              {s && s.alta > 0 && <> · <span className="text-alert-700 font-semibold">{s.alta} alta</span></>}
              {s && s.atrasadas > 0 && <> · <span className="text-alert-700 font-semibold">⚠ {s.atrasadas}</span></>}
            </div>
          </div>
        </div>

        {/* Barra de progresso por coluna */}
        <div className="flex h-1.5 rounded-full overflow-hidden bg-steel-100 mt-3">
          {total > 0 && COLUNAS.map(col => {
            const n = s ? s[col.key] : 0;
            return n > 0 ? <div key={col.key} className={col.bar} style={{ width: `${(n / total) * 100}%` }} /> : null;
          })}
        </div>
        <div className="flex justify-between text-[10px] text-steel-400 mt-1 admin-num">
          {COLUNAS.map(col => <span key={col.key}>{col.label.slice(0, 5)} {s ? s[col.key] : 0}</span>)}
        </div>

        <div className="mt-2.5 space-y-1 flex-1">
          {proximos.length === 0 ? (
            <div className="text-[11px] text-steel-400 italic">Nada em aberto.</div>
          ) : proximos.map(p => (
            <div key={p.id} className="flex items-center gap-1.5 text-[11px] text-steel-600 min-w-0">
              <span className={`admin-dot shrink-0 ${COLUNAS.find(x => x.key === p.status)!.dot}`} />
              <span className="truncate">{p.titulo}</span>
            </div>
          ))}
        </div>
      </div>
    </button>
  );
}

function Cartao({ m, dragging, onDragStart, onDragEnd, onOpen, onConcluir }: {
  m: Melhoria; dragging: boolean;
  onDragStart: () => void; onDragEnd: () => void; onOpen: () => void; onConcluir: () => void;
}) {
  const atrasado = m.data_alvo && m.status !== 'feito' && m.data_alvo < hoje();
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}
      className={`group bg-white rounded-lg px-2.5 py-2 border border-steel-200 cursor-grab active:cursor-grabbing hover:border-brand-300 hover:shadow-sm transition ${dragging ? 'opacity-40' : ''}`}>
      <div className="flex items-start gap-2">
        {m.status !== 'feito' ? (
          <button onClick={e => { e.stopPropagation(); onConcluir(); }} title="Marcar como feito"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border border-steel-300 hover:border-signal-500 hover:bg-signal-50" />
        ) : (
          <span className="mt-0.5 h-4 w-4 shrink-0 rounded bg-signal-500 text-white text-[10px] grid place-items-center">✓</span>
        )}
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold leading-snug ${m.status === 'feito' ? 'text-steel-400 line-through' : 'text-steel-800'}`}>
            {m.titulo}
          </div>
          {m.descricao && m.status !== 'feito' && (
            <div className="text-[11px] text-steel-500 mt-0.5 line-clamp-2">{m.descricao}</div>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {m.status !== 'feito' && (
              <span className={`text-[10px] font-bold rounded px-1.5 py-px border ${PRIORIDADE[m.prioridade].cls}`}>
                {PRIORIDADE[m.prioridade].label}
              </span>
            )}
            {m.data_alvo && m.status !== 'feito' && (
              <span className={`text-[10px] admin-num font-semibold ${atrasado ? 'text-alert-600' : 'text-steel-500'}`}>
                {atrasado ? '⚠ ' : '📅 '}{fmtData(m.data_alvo)}
              </span>
            )}
            {m.status === 'feito' && m.feito_em && (
              <span className="text-[10px] admin-num text-steel-400">feito {fmtData(m.feito_em)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MelhoriaModal({ item, statusInicial, quadroInicial, quadros, onClose, onSaved }: {
  item: Melhoria | null; statusInicial: Status; quadroInicial: string | null; quadros: Quadro[];
  onClose: () => void; onSaved: () => void;
}) {
  const isNew = item === null;
  const [f, setF] = useState({
    titulo: item?.titulo ?? '',
    descricao: item?.descricao ?? '',
    status: (item?.status ?? statusInicial) as Status,
    prioridade: (item?.prioridade ?? 'media') as Prioridade,
    quadro_id: item?.quadro_id ?? quadroInicial ?? '',
    data_alvo: item?.data_alvo ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f.titulo.trim()) { setErr('Escreva o título.'); return; }
    if (!f.quadro_id) { setErr('Escolha o quadro.'); return; }
    setSaving(true); setErr(null);
    const payload = {
      titulo: f.titulo.trim(),
      descricao: f.descricao.trim() || null,
      status: f.status,
      prioridade: f.prioridade,
      quadro_id: f.quadro_id,
      data_alvo: f.data_alvo || null,
    };
    const resp = isNew
      ? await supabase.from('admin_melhorias').insert({ ...payload, feito_em: f.status === 'feito' ? new Date().toISOString() : null })
      : await supabase.from('admin_melhorias').update(payload).eq('id', item!.id);
    if (resp.error) { setErr(resp.error.message); setSaving(false); return; }
    onSaved();
  }

  async function excluir() {
    if (!item) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    setSaving(true);
    const { error } = await supabase.from('admin_melhorias').delete().eq('id', item.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 grid place-items-center p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <form onSubmit={salvar} className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="admin-h2">{isNew ? 'Nova melhoria' : 'Editar melhoria'}</h2>
            <button type="button" onClick={onClose} className="text-steel-500 hover:text-steel-800 text-2xl leading-none">×</button>
          </div>

          <input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} autoFocus
            placeholder="O que precisa melhorar?"
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm font-semibold" />
          <textarea value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} rows={5}
            placeholder="Detalhes, onde apareceu, ideia de solução… (opcional)"
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm resize-y" />

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Quadro">
              <select value={f.quadro_id} onChange={e => setF({ ...f, quadro_id: e.target.value })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white">
                {quadros.map(q => <option key={q.id} value={q.id}>{q.emoji} {q.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Coluna">
              <select value={f.status} onChange={e => setF({ ...f, status: e.target.value as Status })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white">
                {COLUNAS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </Campo>
            <Campo label="Prioridade">
              <select value={f.prioridade} onChange={e => setF({ ...f, prioridade: e.target.value as Prioridade })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white">
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </Campo>
            <Campo label="Para quando">
              <input type="date" value={f.data_alvo} onChange={e => setF({ ...f, data_alvo: e.target.value })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm" />
            </Campo>
          </div>

          {err && <p className="text-sm text-alert-700 bg-alert-50 border border-alert-200 rounded-lg px-3 py-2">{err}</p>}

          <div className="flex items-center justify-between gap-3 pt-2">
            {!isNew && (
              <button type="button" onClick={excluir} disabled={saving}
                className="text-sm font-semibold text-alert-600 hover:text-alert-700 disabled:opacity-50">
                {confirmDel ? 'Confirmar exclusão' : 'Excluir'}
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-steel-700 hover:bg-steel-100">Cancelar</button>
              <button type="submit" disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50">
                {saving ? 'Salvando…' : isNew ? 'Adicionar' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuadroModal({ quadro, cartoes, onClose, onSaved, onDeleted }: {
  quadro: Quadro | null; cartoes: number;
  onClose: () => void; onSaved: (novoId: string | null) => void; onDeleted: () => void;
}) {
  const isNew = quadro === null;
  const [nome, setNome] = useState(quadro?.nome ?? '');
  const [emoji, setEmoji] = useState(quadro?.emoji ?? '📌');
  const [corSel, setCorSel] = useState(quadro?.cor ?? 'brand');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { setErr('Dê um nome ao quadro.'); return; }
    setSaving(true); setErr(null);
    if (isNew) {
      const { data, error } = await supabase.from('admin_melhorias_quadros')
        .insert({ nome: nome.trim(), emoji, cor: corSel }).select('id').single();
      if (error) { setErr(error.message); setSaving(false); return; }
      onSaved(data.id);
    } else {
      const { error } = await supabase.from('admin_melhorias_quadros')
        .update({ nome: nome.trim(), emoji, cor: corSel }).eq('id', quadro!.id);
      if (error) { setErr(error.message); setSaving(false); return; }
      onSaved(null);
    }
  }

  async function excluir() {
    if (!quadro) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    setSaving(true);
    const { error } = await supabase.from('admin_melhorias_quadros').delete().eq('id', quadro.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onDeleted();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 grid place-items-center p-4" onClick={() => !saving && onClose()}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <form onSubmit={salvar} className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="admin-h2">{isNew ? 'Novo quadro' : 'Editar quadro'}</h2>
            <button type="button" onClick={onClose} className="text-steel-500 hover:text-steel-800 text-2xl leading-none">×</button>
          </div>

          <div className="flex items-center gap-2">
            <span className={`h-10 w-10 rounded-lg grid place-items-center text-xl shrink-0 ${cor(corSel).fundo}`}>{emoji}</span>
            <input value={nome} onChange={e => setNome(e.target.value)} autoFocus
              placeholder="Ex.: App do cliente, Financeiro, Lançamento dezembro…"
              className="flex-1 min-w-0 px-3 py-2 border border-steel-200 rounded-lg text-sm font-semibold" />
          </div>

          <Grupo label="Ícone">
            <div className="flex flex-wrap gap-1">
              {EMOJIS.map(e => (
                <button type="button" key={e} onClick={() => setEmoji(e)}
                  className={`h-9 w-9 rounded-lg text-lg grid place-items-center ${emoji === e ? 'bg-steel-900/10 ring-2 ring-steel-400' : 'hover:bg-steel-100'}`}>{e}</button>
              ))}
            </div>
          </Grupo>

          <Grupo label="Cor">
            <div className="flex flex-wrap gap-2">
              {Object.entries(CORES).map(([k, v]) => (
                <button type="button" key={k} onClick={() => setCorSel(k)} title={k}
                  className={`h-7 w-7 rounded-full ${v.faixa} ${corSel === k ? `ring-2 ring-offset-2 ${v.anel}` : ''}`} />
              ))}
            </div>
          </Grupo>

          {err && <p className="text-sm text-alert-700 bg-alert-50 border border-alert-200 rounded-lg px-3 py-2">{err}</p>}
          {confirmDel && (
            <p className="text-sm text-alert-700 bg-alert-50 border border-alert-200 rounded-lg px-3 py-2">
              {cartoes > 0
                ? <>Isso apaga o quadro <b>e os {cartoes} cartões</b> dele, sem como desfazer. Para guardar algum, mova antes para outro quadro.</>
                : <>Apagar o quadro vazio? Não tem como desfazer.</>}
            </p>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            {!isNew && (
              <button type="button" onClick={excluir} disabled={saving}
                className="text-sm font-semibold text-alert-600 hover:text-alert-700 disabled:opacity-50">
                {confirmDel ? 'Confirmar exclusão' : 'Excluir quadro'}
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-steel-700 hover:bg-steel-100">Cancelar</button>
              <button type="submit" disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50">
                {saving ? 'Salvando…' : isNew ? 'Criar quadro' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="admin-label">{label}</span>
      {children}
    </label>
  );
}

function Grupo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="admin-label">{label}</span>
      {children}
    </div>
  );
}

function fmtData(iso: string) {
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
