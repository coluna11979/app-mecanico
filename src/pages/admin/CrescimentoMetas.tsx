import { FormEvent, useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import { supabase } from '@/lib/supabase';
import { CrescimentoTabs } from '@/components/admin/CrescimentoTabs';

type GoalType = 'cadastros_mecanico' | 'cadastros_oficina' | 'leads_convertidos' | 'jobs_concluidos' | 'receita_mes';

interface Goal {
  id: string;
  nome: string;
  tipo: GoalType;
  target_value: number;
  current_value: number;
  period_start: string;
  period_end:   string;
  notas: string | null;
  arquivada: boolean;
  criado_em: string;
}

const TIPO_META: Record<GoalType, { label: string; unit: string; emoji: string }> = {
  cadastros_mecanico: { label: 'Cadastros de mecânico',  unit: '',    emoji: '🔧' },
  cadastros_oficina:  { label: 'Cadastros de oficina',   unit: '',    emoji: '🏭' },
  leads_convertidos:  { label: 'Leads convertidos',       unit: '',    emoji: '🎯' },
  jobs_concluidos:    { label: 'Jobs concluídos',         unit: '',    emoji: '✓'  },
  receita_mes:        { label: 'Receita (R$)',            unit: 'R$',  emoji: '💰' },
};

export default function CrescimentoMetas() {
  const [goals, setGoals]   = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState<string | null>(null);
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const [showArquivadas, setShowArquivadas] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErr(null);
    const { data, error } = await supabase.rpc('admin_goals_with_progress');
    if (error) { setErr(error.message); setLoading(false); return; }
    setGoals((data ?? []) as Goal[]);
    setLoading(false);
  }

  const ativas = goals.filter(g => !g.arquivada);
  const arquivadas = goals.filter(g => g.arquivada);
  const list = showArquivadas ? arquivadas : ativas;

  return (
    <AdminLayout>
      <div className="mb-4">
        <h1 className="admin-h1">Crescimento</h1>
        <p className="text-steel-500 text-sm mt-0.5">Radar, metas e funis — a central de comando pra captar e conectar.</p>
      </div>
      <CrescimentoTabs />

      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="admin-h2">
            {showArquivadas ? 'Metas arquivadas' : 'Metas ativas'}
            <span className="admin-num text-steel-400 font-normal ml-2 text-sm">({list.length})</span>
          </h2>
          <button onClick={() => setShowArquivadas(v => !v)}
            className="text-xs text-steel-500 hover:text-steel-700 underline">
            {showArquivadas ? 'ver ativas' : `ver arquivadas (${arquivadas.length})`}
          </button>
        </div>
        <button onClick={() => setEditing('new')}
          className="bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm px-3 py-1.5 rounded-lg">
          + Nova meta
        </button>
      </div>

      {err && <div className="bg-alert-50 border border-alert-200 rounded-xl p-3 text-sm text-alert-700 mb-4">{err}</div>}

      {loading ? (
        <div className="admin-card p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : list.length === 0 ? (
        <div className="admin-card p-10 text-center">
          <div className="text-4xl mb-2">🎯</div>
          <p className="text-steel-700 font-semibold">Nenhuma meta {showArquivadas ? 'arquivada' : 'ativa'}</p>
          <p className="text-steel-500 text-sm mt-1">Crie sua primeira meta para começar a medir crescimento.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {list.map(g => <GoalCard key={g.id} g={g} onEdit={() => setEditing(g)} onReload={load} />)}
        </div>
      )}

      {editing && (
        <GoalModal goal={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
    </AdminLayout>
  );
}

function GoalCard({ g, onEdit, onReload }: { g: Goal; onEdit: () => void; onReload: () => void }) {
  const target = Number(g.target_value);
  const current = Number(g.current_value);
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const meta = TIPO_META[g.tipo];
  const now = new Date();
  const end = new Date(g.period_end);
  const start = new Date(g.period_start);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
  const daysPassed = Math.max(0, Math.round((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
  const daysLeft = Math.max(0, Math.round((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  const expectedPct = Math.min(100, (daysPassed / totalDays) * 100);
  const ritmoCls =
    pct >= 100 ? 'text-signal-700'
    : pct >= expectedPct ? 'text-signal-700'
    : pct >= expectedPct * 0.7 ? 'text-pending-700'
    : 'text-alert-700';
  const ritmoLabel =
    pct >= 100 ? '✓ Batida!'
    : pct >= expectedPct ? 'No ritmo'
    : pct >= expectedPct * 0.7 ? 'Atrasada'
    : 'Muito atrasada';
  const barCls =
    pct >= 100 ? 'bg-signal-500'
    : pct >= expectedPct ? 'bg-signal-500'
    : pct >= expectedPct * 0.7 ? 'bg-pending-500'
    : 'bg-alert-500';

  async function toggleArquivar() {
    await supabase.from('admin_goals').update({ arquivada: !g.arquivada }).eq('id', g.id);
    onReload();
  }

  return (
    <div className="admin-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-steel-500 mb-0.5">
            <span>{meta.emoji}</span>
            <span>{meta.label}</span>
          </div>
          <h3 className="font-bold text-steel-900 truncate">{g.nome}</h3>
          <div className="text-xs text-steel-500 mt-0.5">
            {fmtDate(g.period_start)} → {fmtDate(g.period_end)}
            {!g.arquivada && (daysLeft > 0
              ? <span className="admin-num ml-2 text-steel-600">({daysLeft}d restantes)</span>
              : <span className="ml-2 text-alert-600 font-semibold">(encerrada)</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="text-xs text-steel-500 hover:text-brand-600 px-2 py-1">editar</button>
          <button onClick={toggleArquivar} className="text-xs text-steel-500 hover:text-steel-700 px-2 py-1">
            {g.arquivada ? 'desarquivar' : 'arquivar'}
          </button>
        </div>
      </div>

      <div className="mb-2">
        <div className="flex items-end justify-between gap-2 mb-1">
          <div className="admin-num text-3xl font-bold text-steel-900">
            {fmtNum(current, g.tipo)}
            <span className="text-sm text-steel-400 font-normal ml-1">/ {fmtNum(target, g.tipo)}</span>
          </div>
          <div className={`admin-num text-sm font-bold ${ritmoCls}`}>{pct.toFixed(0)}%</div>
        </div>
        <div className="relative h-2 bg-steel-100 rounded-full overflow-hidden">
          <div className={`absolute top-0 left-0 h-full ${barCls} rounded-full transition-all`}
               style={{ width: `${pct}%` }} />
          {expectedPct < 100 && (
            <div className="absolute top-0 bottom-0 w-px bg-steel-500"
                 style={{ left: `${expectedPct}%` }}
                 title={`Esperado: ${expectedPct.toFixed(0)}% (ritmo linear)`} />
          )}
        </div>
      </div>

      <div className={`text-xs font-semibold ${ritmoCls}`}>
        {ritmoLabel}
        {pct < 100 && target > 0 && (
          <span className="text-steel-500 font-normal ml-1">
            · faltam <span className="admin-num font-bold text-steel-700">{fmtNum(target - current, g.tipo)}</span>
            {daysLeft > 0 && <span> em {daysLeft}d</span>}
          </span>
        )}
      </div>

      {g.notas && (
        <div className="text-xs text-steel-500 mt-2 pt-2 border-t border-steel-100">{g.notas}</div>
      )}
    </div>
  );
}

function GoalModal({ goal, onClose, onSaved }: { goal: Goal | null; onClose: () => void; onSaved: () => void }) {
  const isNew = goal === null;
  const today = new Date().toISOString().slice(0, 10);
  const in30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [f, setF] = useState({
    nome:  goal?.nome ?? '',
    tipo:  (goal?.tipo ?? 'cadastros_mecanico') as GoalType,
    target_value: goal ? Number(goal.target_value) : 100,
    period_start: goal?.period_start ?? today,
    period_end:   goal?.period_end   ?? in30d,
    notas: goal?.notas ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!f.nome.trim()) { setErr('Dê um nome para a meta.'); return; }
    if (f.target_value <= 0) { setErr('O valor-alvo deve ser maior que zero.'); return; }
    setSaving(true); setErr(null);
    const payload = {
      nome: f.nome.trim(),
      tipo: f.tipo,
      target_value: f.target_value,
      period_start: f.period_start,
      period_end:   f.period_end,
      notas: f.notas.trim() || null,
    };
    const resp = isNew
      ? await supabase.from('admin_goals').insert(payload)
      : await supabase.from('admin_goals').update(payload).eq('id', (goal as Goal).id);
    if (resp.error) { setErr(resp.error.message); setSaving(false); return; }
    onSaved();
  }

  async function excluir() {
    if (!goal || !confirm('Excluir essa meta?')) return;
    setSaving(true);
    const { error } = await supabase.from('admin_goals').delete().eq('id', goal.id);
    if (error) { setErr(error.message); setSaving(false); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <form onSubmit={salvar} className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="admin-h2">{isNew ? 'Nova meta' : 'Editar meta'}</h2>
            <button type="button" onClick={onClose} className="text-steel-500 hover:text-steel-800 text-2xl leading-none">×</button>
          </div>

          <div className="space-y-3">
            <Field label="Nome *">
              <input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })}
                placeholder="Ex: Captar 100 mecânicos em 30 dias"
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="O que medir *">
                <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value as GoalType })}
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm bg-white">
                  {(Object.keys(TIPO_META) as GoalType[]).map(t =>
                    <option key={t} value={t}>{TIPO_META[t].emoji} {TIPO_META[t].label}</option>)}
                </select>
              </Field>
              <Field label="Valor-alvo *">
                <input type="number" min={1} step={f.tipo === 'receita_mes' ? 100 : 1} value={f.target_value}
                  onChange={e => setF({ ...f, target_value: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm admin-num" />
              </Field>
              <Field label="Início">
                <input type="date" value={f.period_start}
                  onChange={e => setF({ ...f, period_start: e.target.value })}
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm" />
              </Field>
              <Field label="Fim">
                <input type="date" value={f.period_end}
                  onChange={e => setF({ ...f, period_end: e.target.value })}
                  className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm" />
              </Field>
            </div>
            <Field label="Notas (opcional)">
              <textarea value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-steel-200 rounded-lg text-sm resize-none" />
            </Field>
          </div>

          {err && <p className="mt-3 text-sm text-alert-700 bg-alert-50 border border-alert-200 rounded-lg px-3 py-2">{err}</p>}

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
                {saving ? 'Salvando…' : (isNew ? 'Criar meta' : 'Salvar')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="admin-label">{label}</span>
      {children}
    </label>
  );
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); }
  catch { return iso; }
}

function fmtNum(v: number, tipo: GoalType): string {
  if (tipo === 'receita_mes') {
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
