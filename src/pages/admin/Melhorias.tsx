import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';

type Status = 'ideia' | 'planejado' | 'fazendo' | 'feito';
type Prioridade = 'alta' | 'media' | 'baixa';

interface Melhoria {
  id: string;
  titulo: string;
  descricao: string | null;
  status: Status;
  prioridade: Prioridade;
  area: string | null;
  data_alvo: string | null;
  posicao: number;
  criado_em: string;
  feito_em: string | null;
}

const COLUNAS: { key: Status; label: string; dot: string; hint: string }[] = [
  { key: 'ideia',     label: 'Ideias',    dot: 'bg-steel-400',   hint: 'Anotou pra não esquecer' },
  { key: 'planejado', label: 'Planejado', dot: 'bg-blue-500',    hint: 'Vai fazer, com data' },
  { key: 'fazendo',   label: 'Fazendo',   dot: 'bg-pending-500', hint: 'Em andamento agora' },
  { key: 'feito',     label: 'Feito',     dot: 'bg-signal-500',  hint: 'Entregue' },
];

const PRIORIDADE: Record<Prioridade, { label: string; cls: string }> = {
  alta:  { label: 'Alta',  cls: 'bg-alert-50 text-alert-700 border-alert-200' },
  media: { label: 'Média', cls: 'bg-pending-50 text-pending-700 border-pending-200' },
  baixa: { label: 'Baixa', cls: 'bg-steel-50 text-steel-600 border-steel-200' },
};

const AREAS = ['Mecânico', 'Oficina', 'Admin', 'Pagamentos', 'Marketing', 'Site/Blog', 'Agentes IA', 'Outro'];

export default function AdminMelhorias() {
  const [itens, setItens] = useState<Melhoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Melhoria | { status: Status } | null>(null);
  const [busca, setBusca] = useState('');
  const [area, setArea] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Status | null>(null);
  const [feitosTodos, setFeitosTodos] = useState(false);

  async function load() {
    const { data, error } = await supabase.from('admin_melhorias')
      .select('id, titulo, descricao, status, prioridade, area, data_alvo, posicao, criado_em, feito_em')
      .order('posicao', { ascending: true });
    if (error) setErr(error.message);
    setItens((data ?? []) as Melhoria[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter(i =>
      (!area || i.area === area) &&
      (!q || i.titulo.toLowerCase().includes(q) || (i.descricao ?? '').toLowerCase().includes(q)));
  }, [itens, busca, area]);

  const porColuna = useMemo(() => {
    const ordemPrio: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 };
    const g: Record<Status, Melhoria[]> = { ideia: [], planejado: [], fazendo: [], feito: [] };
    filtrados.forEach(i => g[i.status].push(i));
    (['ideia', 'planejado', 'fazendo'] as Status[]).forEach(s =>
      g[s].sort((a, b) => ordemPrio[a.prioridade] - ordemPrio[b.prioridade] || a.posicao - b.posicao));
    g.feito.sort((a, b) => (b.feito_em ?? '').localeCompare(a.feito_em ?? ''));
    return g;
  }, [filtrados]);

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

  const abertas = itens.filter(i => i.status !== 'feito').length;
  const altas = itens.filter(i => i.status !== 'feito' && i.prioridade === 'alta').length;
  const feitasMes = itens.filter(i => i.feito_em && new Date(i.feito_em).getMonth() === new Date().getMonth()
    && new Date(i.feito_em).getFullYear() === new Date().getFullYear()).length;

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="admin-h1">Quadro de melhorias</h1>
          <p className="text-steel-500 text-sm mt-0.5">Anote cada ideia na hora e arraste o cartão conforme avança.</p>
        </div>
        <button onClick={() => setEditing({ status: 'ideia' })}
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm px-3 py-2 rounded-lg">
          + Nova melhoria
        </button>
      </div>

      <div className="flex items-center gap-3 text-xs text-steel-500 flex-wrap mb-3">
        <span><b className="admin-num text-steel-800">{abertas}</b> em aberto</span>
        <span className="text-steel-300">·</span>
        <span><b className="admin-num text-alert-700">{altas}</b> de prioridade alta</span>
        <span className="text-steel-300">·</span>
        <span><b className="admin-num text-signal-700">{feitasMes}</b> feitas este mês</span>
      </div>

      <div className="flex items-center gap-2 bg-white border border-steel-200 rounded-lg px-2 py-1.5 mb-4 flex-wrap">
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar melhoria…"
          className="flex-1 min-w-[180px] px-2 py-1 text-sm bg-transparent outline-none" />
        <span className="w-px h-5 bg-steel-200" />
        <select value={area} onChange={e => setArea(e.target.value)}
          className="text-xs font-medium bg-transparent outline-none cursor-pointer py-1">
          <option value="">Área: todas</option>
          {AREAS.map(a => <option key={a} value={a}>Área: {a}</option>)}
        </select>
      </div>

      {err && <div className="bg-alert-50 border border-alert-200 rounded-xl p-3 text-sm text-alert-700 mb-4">{err}</div>}

      {loading ? (
        <div className="admin-card p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {COLUNAS.map(col => {
            const cards = porColuna[col.key];
            const visiveis = col.key === 'feito' && !feitosTodos ? cards.slice(0, 10) : cards;
            return (
              <div key={col.key}
                onDragOver={(e: DragEvent) => { e.preventDefault(); setDragOver(col.key); }}
                onDragLeave={() => setDragOver(d => d === col.key ? null : d)}
                onDrop={() => onDrop(col.key)}
                className={`bg-steel-100/60 rounded-xl p-2 min-h-[200px] transition ${dragOver === col.key ? 'ring-2 ring-brand-400 bg-brand-50' : ''}`}>
                <div className="flex items-center justify-between px-1 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`admin-dot ${col.dot}`} />
                    <span className="text-xs font-semibold text-steel-700">{col.label}</span>
                    <span className="admin-num text-xs font-bold text-steel-500">{cards.length}</span>
                  </div>
                  {col.key !== 'feito' && (
                    <button onClick={() => setEditing({ status: col.key })}
                      className="text-steel-400 hover:text-brand-600 text-lg leading-none px-1" title={`Adicionar em ${col.label}`}>+</button>
                  )}
                </div>
                <div className="space-y-1.5">
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
                  {col.key === 'feito' && cards.length > 10 && (
                    <button onClick={() => setFeitosTodos(v => !v)}
                      className="w-full text-xs text-steel-500 hover:text-steel-800 py-1">
                      {feitosTodos ? 'mostrar menos' : `ver todas (${cards.length})`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <MelhoriaModal
          item={'id' in editing ? editing : null}
          statusInicial={editing.status}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
    </AdminLayout>
  );
}

function Cartao({ m, dragging, onDragStart, onDragEnd, onOpen, onConcluir }: {
  m: Melhoria; dragging: boolean;
  onDragStart: () => void; onDragEnd: () => void; onOpen: () => void; onConcluir: () => void;
}) {
  const atrasado = m.data_alvo && m.status !== 'feito' && m.data_alvo < new Date().toISOString().slice(0, 10);
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onOpen}
      className={`group bg-white rounded-lg px-2.5 py-2 border border-steel-200 cursor-grab active:cursor-grabbing hover:border-brand-300 transition ${dragging ? 'opacity-40' : ''}`}>
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
            {m.area && <span className="text-[10px] font-semibold rounded px-1.5 py-px bg-steel-100 text-steel-600">{m.area}</span>}
            {m.data_alvo && m.status !== 'feito' && (
              <span className={`text-[10px] admin-num font-semibold ${atrasado ? 'text-alert-600' : 'text-steel-500'}`}>
                {atrasado ? '⚠ ' : ''}{fmtData(m.data_alvo)}
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

function MelhoriaModal({ item, statusInicial, onClose, onSaved }: {
  item: Melhoria | null; statusInicial: Status; onClose: () => void; onSaved: () => void;
}) {
  const isNew = item === null;
  const [f, setF] = useState({
    titulo: item?.titulo ?? '',
    descricao: item?.descricao ?? '',
    status: (item?.status ?? statusInicial) as Status,
    prioridade: (item?.prioridade ?? 'media') as Prioridade,
    area: item?.area ?? '',
    data_alvo: item?.data_alvo ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f.titulo.trim()) { setErr('Escreva o título.'); return; }
    setSaving(true); setErr(null);
    const payload = {
      titulo: f.titulo.trim(),
      descricao: f.descricao.trim() || null,
      status: f.status,
      prioridade: f.prioridade,
      area: f.area || null,
      data_alvo: f.data_alvo || null,
    };
    const resp = isNew
      ? await supabase.from('admin_melhorias').insert({ ...payload, feito_em: f.status === 'feito' ? new Date().toISOString() : null })
      : await supabase.from('admin_melhorias').update(payload).eq('id', item!.id);
    if (resp.error) { setErr(resp.error.message); setSaving(false); return; }
    onSaved();
  }

  async function excluir() {
    if (!item || !confirm(`Excluir "${item.titulo}"?`)) return;
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
          <textarea value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} rows={4}
            placeholder="Detalhes, onde apareceu, ideia de solução… (opcional)"
            className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm resize-none" />

          <div className="grid grid-cols-2 gap-3">
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
            <Campo label="Área">
              <select value={f.area} onChange={e => setF({ ...f, area: e.target.value })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white">
                <option value="">—</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
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
                className="text-sm font-semibold text-alert-600 hover:text-alert-700 disabled:opacity-50">Excluir</button>
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

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="admin-label">{label}</span>
      {children}
    </label>
  );
}

function fmtData(iso: string) {
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
