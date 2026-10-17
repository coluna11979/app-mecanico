import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import type { Lead, LeadIntent, LeadOrigem, LeadStatus } from '@/types/database';
import { buildInviteUrl, buildInviteWhatsapp } from '@/lib/leadInvite';
import { calcTemperatura, TEMPERATURA_META } from '@/lib/leadTemperatura';
import { LeadTagsInput, LeadTagsPills } from '@/components/admin/LeadTagsInput';
import { MergeLeadsModal } from '@/components/admin/MergeLeadsModal';
import { LeadsTabs } from '@/components/admin/LeadsTabs';

const STATUS_META: Record<LeadStatus, { label: string; emoji: string; cls: string }> = {
  lead_novo:         { label: 'Novo',               emoji: '🆕', cls: 'bg-brand-50 text-brand-700 border-brand-200' },
  contato_feito:     { label: 'Contato feito',      emoji: '📞', cls: 'bg-pending-500/10 text-pending-700 border-pending-300' },
  interessado:       { label: 'Interessado',        emoji: '🔥', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  cadastro_iniciado: { label: 'Cadastro iniciado',  emoji: '📝', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  convertido:        { label: 'Convertido',         emoji: '✅', cls: 'bg-signal-500/10 text-signal-700 border-signal-300' },
  perdido:           { label: 'Perdido',            emoji: '🚫', cls: 'bg-steel-100 text-steel-600 border-steel-200' },
};

const STATUS_ORDER: LeadStatus[] = [
  'lead_novo', 'contato_feito', 'interessado', 'cadastro_iniciado', 'convertido', 'perdido',
];

const ORIGEM_META: Record<LeadOrigem, string> = {
  formulario_site: 'Formulário no site',
  indicacao:       'Indicação',
  instagram:       'Instagram',
  facebook:        'Facebook',
  google_ads:      'Google Ads',
  google_maps:     'Google Maps',
  whatsapp:        'WhatsApp',
  importado_csv:   'Importado (CSV)',
  link_convite:    'Link de convite',
  evento:          'Evento',
  outro:           'Outro',
};

const INTENT_META: Record<LeadIntent, { label: string; emoji: string }> = {
  mechanic: { label: 'Mecânico', emoji: '🔧' },
  workshop: { label: 'Oficina',  emoji: '🏭' },
};

type Filtros = {
  status: LeadStatus | 'all';
  intent: LeadIntent | 'all';
  origem: LeadOrigem | 'all';
  busca: string;
};

export default function AdminLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Lead | 'new' | null>(null);
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');
  const [filtros, setFiltros] = useState<Filtros>({ status: 'all', intent: 'all', origem: 'all', busca: '' });
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);

  function toggleSel(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function selAll(ids: string[]) {
    setSelectedIds(prev => ids.every(id => prev.has(id)) ? new Set() : new Set(ids));
  }
  function clearSel() { setSelectedIds(new Set()); }

  const allTags = useMemo(() => {
    const set = new Set<string>();
    leads.forEach(l => (l.tags ?? []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [leads]);

  async function moverStatus(leadId: string, novoStatus: LeadStatus) {
    const atual = leads.find(l => l.id === leadId);
    if (!atual || atual.status === novoStatus) return;
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: novoStatus } : l));
    const { error } = await supabase.from('leads').update({ status: novoStatus }).eq('id', leadId);
    if (error) {
      console.error('[leads] mover falhou', error);
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: atual.status } : l));
    }
  }

  async function bulkStatus(novoStatus: LeadStatus) {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const { error } = await supabase.from('leads').update({ status: novoStatus }).in('id', ids);
    if (error) { alert('Falhou: ' + error.message); return; }
    load(); clearSel();
  }
  async function bulkAddTag(tag: string) {
    const t = tag.trim().toLowerCase().replace(/\s+/g, '_');
    if (!t) return;
    const ids = Array.from(selectedIds);
    const alvos = leads.filter(l => ids.includes(l.id));
    await Promise.all(alvos.map(l => {
      const next = Array.from(new Set([...(l.tags ?? []), t]));
      return supabase.from('leads').update({ tags: next }).eq('id', l.id);
    }));
    load(); clearSel();
  }
  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!confirm(`Excluir ${ids.length} leads? Essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from('leads').delete().in('id', ids);
    if (error) { alert('Falhou: ' + error.message); return; }
    load(); clearSel();
  }

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error) console.error('[leads] load', error);
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return leads.filter(l => {
      if (filtros.status !== 'all' && l.status !== filtros.status) return false;
      if (filtros.intent !== 'all' && l.intent !== filtros.intent) return false;
      if (filtros.origem !== 'all' && l.origem !== filtros.origem) return false;
      if (filtros.busca.trim()) {
        const q = filtros.busca.toLowerCase();
        const hay = [l.name, l.phone, l.email, l.cidade].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, filtros]);

  const stats = useMemo(() => {
    const counts: Record<LeadStatus, number> = {
      lead_novo: 0, contato_feito: 0, interessado: 0, cadastro_iniciado: 0, convertido: 0, perdido: 0,
    };
    leads.forEach(l => { counts[l.status]++; });
    const ativos = leads.length - counts.convertido - counts.perdido;
    const conversao = leads.length ? Math.round((counts.convertido / leads.length) * 100) : 0;
    return { counts, ativos, convertidos: counts.convertido, conversao };
  }, [leads]);

  return (
    <AdminLayout>
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h1 className="admin-h1">Leads</h1>
          <p className="text-steel-500 text-sm mt-0.5">Pipeline, importação e métricas de captação.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex bg-steel-100 rounded-lg p-0.5 text-xs">
            <button onClick={() => setView('kanban')}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${view === 'kanban' ? 'bg-white shadow-sm text-steel-900' : 'text-steel-500 hover:text-steel-700'}`}>Kanban</button>
            <button onClick={() => setView('lista')}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${view === 'lista' ? 'bg-white shadow-sm text-steel-900' : 'text-steel-500 hover:text-steel-700'}`}>Lista</button>
          </div>
          <button
            onClick={() => { setBulkMode(v => !v); clearSel(); }}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border ${bulkMode ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-700 border-steel-200 hover:bg-steel-50'}`}
          >
            {bulkMode ? '✓ Selecionando' : 'Selecionar'}
          </button>
          <AddDropdown onNewLead={() => setModal('new')} />
        </div>
      </div>

      <LeadsTabs />

      {/* Stats line + filters — tudo em 1 bloco compacto */}
      <div className="flex flex-col gap-2 mb-3">
        {/* Linha fininha de métricas (quem quer análise, vai pra aba Métricas) */}
        <div className="flex items-center gap-3 text-xs text-steel-500 flex-wrap">
          <span><span className="admin-num font-bold text-steel-800">{leads.length}</span> leads</span>
          <span className="text-steel-300">·</span>
          <span><span className="admin-num font-bold text-steel-800">{stats.ativos}</span> em pipeline</span>
          <span className="text-steel-300">·</span>
          <span><span className="admin-num font-bold text-signal-700">{stats.convertidos}</span> convertido{stats.convertidos === 1 ? '' : 's'}</span>
          <span className="text-steel-300">·</span>
          <span>
            <span className={`admin-num font-bold ${conversaoCls(stats.conversao)}`}>{stats.conversao}%</span>
            <span className="text-steel-400 ml-1">conversão</span>
          </span>
          <span className="ml-auto text-steel-400">
            {filtered.length === leads.length ? `${leads.length} itens` : `${filtered.length} de ${leads.length}`}
          </span>
        </div>

        {/* Barra de filtros compacta: 1 linha, inputs pequenos */}
        <div className="flex items-center gap-2 bg-white border border-steel-200 rounded-lg px-2 py-1.5 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-steel-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input
              value={filtros.busca}
              onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
              placeholder="Buscar nome, telefone, cidade…"
              className="w-full pl-7 pr-2 py-1 text-sm bg-transparent outline-none"
            />
          </div>
          <span className="w-px h-5 bg-steel-200" />
          <select
            value={filtros.status}
            onChange={e => setFiltros(f => ({ ...f, status: e.target.value as LeadStatus | 'all' }))}
            className="text-xs font-medium bg-transparent border-0 outline-none cursor-pointer hover:text-brand-600 py-1"
          >
            <option value="all">Status: todos</option>
            {STATUS_ORDER.map(s => <option key={s} value={s}>Status: {STATUS_META[s].label}</option>)}
          </select>
          <span className="w-px h-5 bg-steel-200" />
          <select
            value={filtros.intent}
            onChange={e => setFiltros(f => ({ ...f, intent: e.target.value as LeadIntent | 'all' }))}
            className="text-xs font-medium bg-transparent border-0 outline-none cursor-pointer hover:text-brand-600 py-1"
          >
            <option value="all">Tipo: todos</option>
            <option value="mechanic">Tipo: mecânico</option>
            <option value="workshop">Tipo: oficina</option>
          </select>
          <span className="w-px h-5 bg-steel-200" />
          <select
            value={filtros.origem}
            onChange={e => setFiltros(f => ({ ...f, origem: e.target.value as LeadOrigem | 'all' }))}
            className="text-xs font-medium bg-transparent border-0 outline-none cursor-pointer hover:text-brand-600 py-1"
          >
            <option value="all">Origem: todas</option>
            {(Object.keys(ORIGEM_META) as LeadOrigem[]).map(o => <option key={o} value={o}>Origem: {ORIGEM_META[o]}</option>)}
          </select>
          {(filtros.busca || filtros.status !== 'all' || filtros.intent !== 'all' || filtros.origem !== 'all') && (
            <button onClick={() => setFiltros({ status: 'all', intent: 'all', origem: 'all', busca: '' })}
              className="text-xs text-steel-500 hover:text-alert-600 ml-auto px-1.5 py-0.5">
              × limpar
            </button>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="bg-white border border-steel-200 rounded-2xl p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-steel-200 rounded-2xl p-10 text-center">
          <div className="text-5xl mb-2">📭</div>
          <p className="text-steel-700 font-semibold">Nenhum lead encontrado</p>
          <p className="text-steel-500 text-sm mt-1">Clique em "Novo lead" ou ajuste os filtros.</p>
        </div>
      ) : view === 'kanban' ? (
        <KanbanBoard
          leads={filtered}
          onOpen={l => setModal(l)}
          onMove={moverStatus}
          bulkMode={bulkMode}
          selectedIds={selectedIds}
          onToggleSel={toggleSel}
        />
      ) : (
        <ListaView
          leads={filtered}
          onOpen={l => setModal(l)}
          bulkMode={bulkMode}
          selectedIds={selectedIds}
          onToggleSel={toggleSel}
          onSelAll={() => selAll(filtered.map(l => l.id))}
        />
      )}

      {bulkMode && selectedIds.size > 0 && (
        <BulkToolbar
          count={selectedIds.size}
          onClear={clearSel}
          onMerge={() => setMergeOpen(true)}
          onDelete={bulkDelete}
          onStatus={bulkStatus}
          onAddTag={bulkAddTag}
        />
      )}

      {mergeOpen && (
        <MergeLeadsModal
          leads={leads.filter(l => selectedIds.has(l.id))}
          onClose={() => setMergeOpen(false)}
          onMerged={() => { setMergeOpen(false); clearSel(); load(); }}
        />
      )}

      {modal && (
        <LeadModal
          lead={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
          tagSuggestions={allTags}
        />
      )}
    </AdminLayout>
  );
}

function AddDropdown({ onNewLead }: { onNewLead: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1.5">
        + Adicionar <span className="text-xs opacity-70">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-steel-200 rounded-xl shadow-lg z-40 py-1 text-sm">
            <button onClick={() => { setOpen(false); onNewLead(); }}
              className="w-full text-left px-3 py-2 hover:bg-steel-50 flex items-center gap-2.5">
              <span className="text-base">➕</span> Novo lead (manual)
            </button>
            <Link to="/admin/leads/importar-csv" onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2 hover:bg-steel-50 flex items-center gap-2.5">
              <span className="text-base">📥</span> Importar CSV
            </Link>
            <Link to="/admin/leads/importar" onClick={() => setOpen(false)}
              className="w-full text-left px-3 py-2 hover:bg-steel-50 flex items-center gap-2.5">
              <span className="text-base">🔎</span> Importar do Google
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────── Bulk toolbar ───────────────
function BulkToolbar({
  count, onClear, onMerge, onDelete, onStatus, onAddTag,
}: {
  count: number;
  onClear: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onStatus: (s: LeadStatus) => void;
  onAddTag: (t: string) => void;
}) {
  const [tagOpen, setTagOpen] = useState(false);
  const [tag, setTag] = useState('');
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-steel-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3 flex-wrap z-40 max-w-[95vw]">
      <span className="font-bold text-sm">{count} selecionado{count === 1 ? '' : 's'}</span>
      <div className="h-6 w-px bg-steel-700" />
      <select
        onChange={e => { if (e.target.value) { onStatus(e.target.value as LeadStatus); e.target.value = ''; } }}
        defaultValue=""
        className="bg-steel-800 border border-steel-700 text-xs rounded-lg px-2 py-1.5 cursor-pointer">
        <option value="">Mudar status…</option>
        {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</option>)}
      </select>
      <div className="relative">
        <button onClick={() => setTagOpen(v => !v)} className="bg-steel-800 border border-steel-700 text-xs rounded-lg px-3 py-1.5 hover:bg-steel-700">
          🏷️ Adicionar tag
        </button>
        {tagOpen && (
          <div className="absolute bottom-full mb-2 right-0 bg-white text-steel-800 rounded-xl shadow-xl p-3 w-56 border border-steel-200">
            <input autoFocus value={tag} onChange={e => setTag(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && tag.trim()) { onAddTag(tag); setTag(''); setTagOpen(false); } }}
              placeholder="nome_da_tag"
              className="w-full px-2 py-1.5 border border-steel-200 rounded-lg text-sm" />
            <p className="text-[10px] text-steel-400 mt-1">Enter aplica a todos</p>
          </div>
        )}
      </div>
      {count >= 2 && (
        <button onClick={onMerge} className="bg-brand-500 hover:bg-brand-600 text-xs font-bold rounded-lg px-3 py-1.5">
          🔗 Mesclar {count}
        </button>
      )}
      <button onClick={onDelete} className="bg-alert-600 hover:bg-alert-700 text-xs font-bold rounded-lg px-3 py-1.5">
        🗑️ Excluir
      </button>
      <div className="h-6 w-px bg-steel-700" />
      <button onClick={onClear} className="text-xs text-steel-400 hover:text-white">Limpar</button>
    </div>
  );
}

// ─────────────── Kanban ───────────────
function KanbanBoard({
  leads, onOpen, onMove,
  bulkMode, selectedIds, onToggleSel,
}: {
  leads: Lead[];
  onOpen: (l: Lead) => void;
  onMove: (leadId: string, status: LeadStatus) => void;
  bulkMode: boolean;
  selectedIds: Set<string>;
  onToggleSel: (id: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);

  const grouped = useMemo(() => {
    const g: Record<LeadStatus, Lead[]> = {
      lead_novo: [], contato_feito: [], interessado: [], cadastro_iniciado: [], convertido: [], perdido: [],
    };
    leads.forEach(l => { g[l.status].push(l); });
    return g;
  }, [leads]);

  function handleDrop(status: LeadStatus) {
    if (dragId) onMove(dragId, status);
    setDragId(null); setDragOver(null);
  }

  // Mini-stats por coluna: contagem de "esquecidos há 7+ dias"
  const esquecidos = useMemo(() => {
    const out: Record<LeadStatus, number> = {
      lead_novo: 0, contato_feito: 0, interessado: 0, cadastro_iniciado: 0, convertido: 0, perdido: 0,
    };
    const limite = Date.now() - 7 * 24 * 60 * 60 * 1000;
    leads.forEach(l => {
      if (l.status === 'convertido' || l.status === 'perdido') return;
      const ts = new Date(l.last_contact_at ?? l.created_at).getTime();
      if (ts < limite) out[l.status]++;
    });
    return out;
  }, [leads]);

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-4">
      {STATUS_ORDER.map(status => {
        const meta = STATUS_META[status];
        const cards = grouped[status];
        const isOver = dragOver === status;
        const stale = esquecidos[status];
        return (
          <div
            key={status}
            onDragOver={(e: DragEvent) => { e.preventDefault(); setDragOver(status); }}
            onDragLeave={() => setDragOver(d => d === status ? null : d)}
            onDrop={() => handleDrop(status)}
            className={`flex-shrink-0 w-64 bg-steel-100/60 rounded-xl p-2 transition ${isOver ? 'ring-2 ring-brand-400 bg-brand-50' : ''}`}
          >
            <div className="flex items-center justify-between mb-2 px-1 gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`admin-dot ${meta.cls.includes('brand') ? 'bg-brand-500' : meta.cls.includes('signal') ? 'bg-signal-500' : meta.cls.includes('pending') ? 'bg-pending-500' : meta.cls.includes('orange') ? 'bg-orange-500' : meta.cls.includes('blue') ? 'bg-blue-500' : 'bg-steel-400'}`} />
                <span className="text-xs font-semibold text-steel-700 truncate">{meta.label}</span>
                <span className="admin-num text-xs font-bold text-steel-500">{cards.length}</span>
              </div>
              {stale > 0 && (
                <span className="admin-num text-[10px] font-bold text-alert-600 bg-alert-50 border border-alert-200 rounded-full px-1.5" title={`${stale} esquecidos há 7+ dias`}>
                  ⏱ {stale}
                </span>
              )}
            </div>
            <div className="space-y-1.5 min-h-[60px]">
              {cards.map(l => {
                const temp = calcTemperatura(l);
                const tMeta = TEMPERATURA_META[temp];
                const isSel = selectedIds.has(l.id);
                return (
                  <div
                    key={l.id}
                    draggable={!bulkMode}
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    onClick={() => bulkMode ? onToggleSel(l.id) : onOpen(l)}
                    className={`bg-white rounded-md px-2 py-1 border transition leading-tight
                      ${bulkMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing hover:border-brand-300'}
                      ${isSel ? 'border-brand-500 ring-1 ring-brand-300' : 'border-steel-200'}
                      ${dragId === l.id ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {bulkMode && (
                        <input type="checkbox" checked={isSel} onChange={() => onToggleSel(l.id)}
                          onClick={e => e.stopPropagation()}
                          className="h-3 w-3 accent-brand-500 shrink-0" />
                      )}
                      <span className={`admin-dot shrink-0 ${tMeta.dotCls}`} title={tMeta.label} />
                      <span className="text-xs font-semibold text-steel-800 truncate flex-1">{l.name}</span>
                      <span className={`text-[9px] font-bold rounded px-1 shrink-0 ${l.intent === 'mechanic' ? 'bg-brand-50 text-brand-700' : 'bg-steel-100 text-steel-600'}`}
                        title={INTENT_META[l.intent].label}>
                        {l.intent === 'mechanic' ? 'MEC' : 'OFI'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-steel-500 min-w-0">
                      {l.phone && l.phone !== '—' && (
                        <span className="admin-num truncate">{l.phone}</span>
                      )}
                      {l.cidade && (
                        <span className="truncate text-steel-400">· {l.cidade}{l.estado ? `/${l.estado}` : ''}</span>
                      )}
                    </div>
                    {(l.proxima_acao || (l.tags && l.tags.length > 0)) && (
                      <div className="flex items-center gap-1.5 mt-0.5 pt-0.5 border-t border-steel-100">
                        {l.proxima_acao && (
                          <span className="text-[10px] text-brand-700 truncate flex-1 font-medium">
                            {l.data_proxima_acao && <span className="admin-num">{fmtData(l.data_proxima_acao)} </span>}
                            {l.proxima_acao}
                          </span>
                        )}
                        {l.tags && l.tags.length > 0 && <LeadTagsPills tags={l.tags} max={2} />}
                      </div>
                    )}
                  </div>
                );
              })}
              {cards.length === 0 && (
                <div className="text-[11px] text-steel-400 text-center py-4 italic">—</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────── Lista ───────────────
function ListaView({
  leads, onOpen, bulkMode, selectedIds, onToggleSel, onSelAll,
}: {
  leads: Lead[];
  onOpen: (l: Lead) => void;
  bulkMode: boolean;
  selectedIds: Set<string>;
  onToggleSel: (id: string) => void;
  onSelAll: () => void;
}) {
  const allChecked = leads.length > 0 && leads.every(l => selectedIds.has(l.id));
  return (
    <div className="bg-white border border-steel-200 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-steel-50 text-steel-600 text-xs uppercase tracking-wider">
            <tr>
              {bulkMode && (
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={allChecked} onChange={onSelAll} className="h-4 w-4 accent-brand-500" />
                </th>
              )}
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">🌡️</th>
              <th className="text-left px-4 py-3">Tipo</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Origem</th>
              <th className="text-left px-4 py-3">Cidade</th>
              <th className="text-left px-4 py-3">Telefone</th>
              <th className="text-left px-4 py-3">Tags</th>
              <th className="text-left px-4 py-3">Próxima ação</th>
              <th className="text-left px-4 py-3">Criado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {leads.map(l => {
              const temp = calcTemperatura(l);
              const tMeta = TEMPERATURA_META[temp];
              const isSel = selectedIds.has(l.id);
              return (
                <tr key={l.id}
                  onClick={() => bulkMode ? onToggleSel(l.id) : onOpen(l)}
                  className={`hover:bg-steel-50 cursor-pointer ${isSel ? 'bg-brand-50/40' : ''}`}>
                  {bulkMode && (
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSel} onChange={() => onToggleSel(l.id)} className="h-4 w-4 accent-brand-500" />
                    </td>
                  )}
                  <td className="px-4 py-3 font-semibold text-steel-800">{l.name}</td>
                  <td className="px-4 py-3" title={tMeta.label}>
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${tMeta.dotCls}`} />
                  </td>
                  <td className="px-4 py-3">{INTENT_META[l.intent].emoji} {INTENT_META[l.intent].label}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold rounded-full px-2.5 py-0.5 border ${STATUS_META[l.status].cls}`}>
                      {STATUS_META[l.status].emoji} {STATUS_META[l.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-steel-600">{ORIGEM_META[l.origem]}</td>
                  <td className="px-4 py-3 text-steel-600">{l.cidade ?? '—'}</td>
                  <td className="px-4 py-3 text-steel-600">{l.phone ?? '—'}</td>
                  <td className="px-4 py-3"><LeadTagsPills tags={l.tags ?? []} max={2} /></td>
                  <td className="px-4 py-3 text-steel-600 max-w-[200px] truncate">
                    {l.proxima_acao
                      ? <span>{l.data_proxima_acao ? <b className="text-brand-600">{fmtData(l.data_proxima_acao)}</b> : null} {l.proxima_acao}</span>
                      : <span className="text-steel-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-steel-500 text-xs">{fmtDataHora(l.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function conversaoCls(pct: number): string {
  if (pct >= 20) return 'text-signal-700';
  if (pct >= 10) return 'text-pending-700';
  return 'text-alert-700';
}

function fmtData(iso: string) {
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }
  catch { return iso; }
}
function fmtDataHora(iso: string) {
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
  catch { return iso; }
}

// ─────────────── Modal ───────────────
type FormState = {
  name: string;
  email: string;
  phone: string;
  intent: LeadIntent;
  cidade: string;
  estado: string;
  status: LeadStatus;
  origem: LeadOrigem;
  proxima_acao: string;
  data_proxima_acao: string | null;
  notas: string;
  tags: string[];
};

function emptyForm(): FormState {
  return {
    name: '', email: '', phone: '',
    intent: 'mechanic',
    cidade: '', estado: '',
    status: 'lead_novo', origem: 'outro',
    proxima_acao: '', data_proxima_acao: null, notas: '',
    tags: [],
  };
}

function fromLead(l: Lead): FormState {
  return {
    name: l.name,
    email: l.email,
    phone: l.phone,
    intent: l.intent,
    cidade: l.cidade ?? '',
    estado: l.estado ?? '',
    status: l.status,
    origem: l.origem,
    proxima_acao: l.proxima_acao ?? '',
    data_proxima_acao: l.data_proxima_acao,
    notas: l.notas ?? '',
    tags: l.tags ?? [],
  };
}

function LeadModal({ lead, onClose, onSaved, tagSuggestions }: { lead: Lead | null; onClose: () => void; onSaved: () => void; tagSuggestions: string[] }) {
  const isNew = lead === null;
  const [f, setF] = useState<FormState>(lead ? fromLead(lead) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function copiarLink() {
    if (!lead) return;
    const url = buildInviteUrl(lead);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copie o link:', url);
    }
  }

  function abrirWhatsapp() {
    if (!lead) return;
    const url = buildInviteUrl(lead);
    window.open(buildInviteWhatsapp(lead, url), '_blank');
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) { setErr('Nome é obrigatório.'); return; }
    if (isNew && !f.email.trim() && !f.phone.trim()) {
      setErr('Informe pelo menos e-mail ou telefone.'); return;
    }
    setSaving(true); setErr(null);

    const payload = {
      name: f.name.trim(),
      email: (f.email.trim() || `sem-email-${Date.now()}@mecanicoapp.lead`),
      phone: f.phone.trim() || '—',
      intent: f.intent,
      cidade: f.cidade.trim() || null,
      estado: f.estado.trim() || null,
      status: f.status,
      origem: f.origem,
      proxima_acao: f.proxima_acao.trim() || null,
      data_proxima_acao: f.data_proxima_acao || null,
      notas: f.notas.trim() || null,
      tags: f.tags,
    };

    const resp = isNew
      ? await supabase.from('leads').insert({ ...payload, consent: true })
      : await supabase.from('leads').update(payload).eq('id', (lead as Lead).id);

    if (resp.error) { setErr(resp.error.message); setSaving(false); return; }
    onSaved();
  }

  async function excluir() {
    if (!lead || !confirm(`Excluir o lead "${lead.name}"? Essa ação não pode ser desfeita.`)) return;
    setSaving(true);
    const { error } = await supabase.from('leads').delete().eq('id', lead.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <form onSubmit={salvar} className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold">{isNew ? 'Novo lead' : 'Editar lead'}</h2>
            <button type="button" onClick={onClose} className="text-steel-500 hover:text-steel-800 text-2xl leading-none">×</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome *" cols={2}>
              <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm" required />
            </Field>
            <Field label="Telefone / WhatsApp">
              <input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm" />
            </Field>
            <Field label="E-mail">
              <input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm" />
            </Field>
            <Field label="Cidade">
              <input value={f.cidade} onChange={e => setF({ ...f, cidade: e.target.value })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm" />
            </Field>
            <Field label="UF">
              <input value={f.estado} maxLength={2}
                onChange={e => setF({ ...f, estado: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm uppercase" />
            </Field>
            <Field label="Tipo *">
              <select value={f.intent} onChange={e => setF({ ...f, intent: e.target.value as LeadIntent })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white">
                <option value="mechanic">🔧 Mecânico</option>
                <option value="workshop">🏭 Oficina</option>
              </select>
            </Field>
            <Field label="Origem">
              <select value={f.origem} onChange={e => setF({ ...f, origem: e.target.value as LeadOrigem })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white">
                {(Object.keys(ORIGEM_META) as LeadOrigem[]).map(o => <option key={o} value={o}>{ORIGEM_META[o]}</option>)}
              </select>
            </Field>
            <Field label="Status" cols={2}>
              <select value={f.status} onChange={e => setF({ ...f, status: e.target.value as LeadStatus })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white">
                {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_META[s].emoji} {STATUS_META[s].label}</option>)}
              </select>
            </Field>
            <Field label="Próxima ação">
              <input value={f.proxima_acao} onChange={e => setF({ ...f, proxima_acao: e.target.value })}
                placeholder="Ex: Ligar amanhã, enviar proposta…"
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm" />
            </Field>
            <Field label="Quando">
              <input type="date" value={f.data_proxima_acao ?? ''}
                onChange={e => setF({ ...f, data_proxima_acao: e.target.value || null })}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm" />
            </Field>
            <Field label="Tags" cols={2}>
              <LeadTagsInput value={f.tags} onChange={ts => setF({ ...f, tags: ts })} suggestions={tagSuggestions} />
            </Field>
            <Field label="Notas internas" cols={2}>
              <textarea value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })}
                rows={4} className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm resize-none" />
            </Field>
          </div>

          {!isNew && lead && (() => {
            const temp = calcTemperatura(lead);
            const tMeta = TEMPERATURA_META[temp];
            return (
              <div className={`mt-4 inline-flex items-center gap-2 text-xs font-bold rounded-full px-3 py-1 border ${tMeta.badgeCls}`}>
                {tMeta.emoji} Temperatura: {tMeta.label}
              </div>
            );
          })()}

          {err && <p className="mt-3 text-sm text-alert-700 bg-alert-50 border border-alert-200 rounded-lg px-3 py-2">{err}</p>}

          {!isNew && lead && lead.status !== 'convertido' && (
            <div className="mt-5 p-3 bg-brand-50 border border-brand-200 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-700">🔗 Link de convite</span>
              </div>
              <p className="text-xs text-steel-600 mb-2.5">
                Gera um link com os dados do lead já preenchidos. Quando ele terminar o cadastro, o status vira "Convertido" automaticamente.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={copiarLink}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-white border border-brand-300 text-brand-700 hover:bg-brand-100">
                  {copied ? '✓ Copiado!' : '📋 Copiar link'}
                </button>
                <button type="button" onClick={abrirWhatsapp}
                  className="flex-1 px-3 py-2 rounded-lg text-xs font-bold bg-signal-500 hover:bg-signal-600 text-white">
                  💬 Enviar WhatsApp
                </button>
              </div>
            </div>
          )}

          {!isNew && lead?.converted_profile_id && (
            <div className="mt-5 p-3 bg-signal-500/10 border border-signal-300 rounded-xl text-sm">
              <span className="font-bold text-signal-700">✅ Lead convertido</span>
              {lead.converted_at && <span className="text-steel-600 ml-2">em {fmtDataHora(lead.converted_at)}</span>}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 mt-5">
            {!isNew && (
              <button type="button" onClick={excluir} disabled={saving}
                className="text-sm font-semibold text-alert-600 hover:text-alert-700 disabled:opacity-50">
                Excluir
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-steel-700 hover:bg-steel-100">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-bold bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50">
                {saving ? 'Salvando…' : (isNew ? 'Criar lead' : 'Salvar')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, cols = 1, children }: { label: string; cols?: 1 | 2; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${cols === 2 ? 'col-span-2' : ''}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-steel-500">{label}</span>
      {children}
    </label>
  );
}
