import { useState } from 'react';
import { brl, moneyStr, parseMoney } from '@/lib/cash';
import { toast } from '@/components/ui/Toast';
import {
  SHOP, goalProgress, mechanicAchieved, monthLabel, saveGoal, shopAchieved, useMonthGoals, type Goal,
} from '@/lib/goals';

const BAR: Record<string, string> = { done: 'bg-signal-500', ontrack: 'bg-signal-500', close: 'bg-pending-500', behind: 'bg-alert-500' };
const BADGE: Record<string, string> = {
  done: 'bg-signal-100 text-signal-700', ontrack: 'bg-signal-100 text-signal-700',
  close: 'bg-pending-100 text-pending-800', behind: 'bg-alert-100 text-alert-700',
};
const BADGE_TEXT: Record<string, string> = { done: '🎉 Meta batida', ontrack: 'No ritmo', close: 'Atenção', behind: 'Abaixo do ritmo' };

/** Barra de progresso da meta com projeção pelo ritmo do mês */
export function GoalBar({ achieved, target, compact }: { achieved: number; target: number; compact?: boolean }) {
  const p = goalProgress(achieved, target);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <div className="text-sm"><strong className="font-display text-lg">{brl(achieved)}</strong> <span className="text-steel-500">de {brl(target)} · {Math.round(p.rawPct)}%</span></div>
        <span className={`badge ${BADGE[p.status]}`}>{BADGE_TEXT[p.status]}</span>
      </div>
      <div className="h-2.5 rounded-full bg-steel-100 mt-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${BAR[p.status]}`} style={{ width: `${p.pct}%` }} />
      </div>
      {!compact && (
        <p className="text-xs text-steel-500 mt-1.5">
          {p.status === 'done'
            ? `Passou ${brl(achieved - target)} da meta.`
            : p.status === 'ontrack'
              ? `Nesse ritmo o mês fecha em ${brl(p.projection)}. Faltam ${brl(p.missing)} em ${p.remaining} dia${p.remaining === 1 ? '' : 's'} útil${p.remaining === 1 ? '' : 'eis'}.`
              : `Nesse ritmo o mês fecha em ${brl(p.projection)}. Faltam ${brl(p.missing)}${p.remaining > 0 ? `: ${brl(p.perDay)} por dia útil nos ${p.remaining} que restam` : ''}.`}
        </p>
      )}
    </div>
  );
}

/** Campo para definir/alterar a meta (valor do mês; vazio ou 0 remove) */
function GoalEditor({ current, onSave, onCancel, busy }: { current: Goal | undefined; onSave: (v: number) => void; onCancel: () => void; busy: boolean }) {
  const [v, setV] = useState(current ? moneyStr(current.target) : '');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-steel-500">R$</span>
      <input className="input !py-1.5 !w-40 text-right" inputMode="decimal" placeholder="0,00" autoFocus value={v}
        onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') onSave(parseMoney(v)); }} />
      <button className="btn-primary text-sm !py-1.5" disabled={busy} onClick={() => onSave(parseMoney(v))}>{busy ? 'Salvando…' : 'Salvar'}</button>
      <button className="btn-ghost text-sm !py-1.5" onClick={onCancel}>Cancelar</button>
    </div>
  );
}

/** Meta de faturamento da loja no mês */
export function ShopGoalCard({ wid, canEdit }: { wid: string; canEdit: boolean }) {
  const { key, goals, sales, reload } = useMonthGoals(wid);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!goals) return <div className="h-24 bg-white rounded-2xl animate-pulse" />;
  const goal = goals.get(SHOP);
  if (!goal && !canEdit) return null;

  async function save(v: number) {
    setBusy(true);
    const { error } = await saveGoal(wid, null, key, v);
    setBusy(false);
    if (error) return toast.error('Não salvou a meta: ' + error.message);
    toast.success(v > 0 ? 'Meta da loja salva' : 'Meta da loja removida');
    setEditing(false); reload();
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="font-bold text-sm">🎯 Meta de faturamento · <span className="capitalize">{monthLabel(key)}</span></div>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-700 hover:underline">{goal ? 'Alterar meta' : '+ Definir meta'}</button>
        )}
      </div>
      {editing ? (
        <GoalEditor current={goal} busy={busy} onSave={save} onCancel={() => setEditing(false)} />
      ) : goal ? (
        <>
          <GoalBar achieved={shopAchieved(sales)} target={goal.target} />
          {goal.inherited && <p className="text-[11px] text-steel-400 mt-1">Meta repetida do mês anterior. Altere se quiser outro valor para este mês.</p>}
        </>
      ) : (
        <p className="text-sm text-steel-500">Defina quanto a loja quer faturar no mês para acompanhar o ritmo e a projeção aqui.</p>
      )}
    </div>
  );
}

/** Metas de cada colaborador no mês (gestor define; mostra o andamento de todos) */
export function TeamGoals({ wid, team, canEdit }: { wid: string; team: { id: string; name: string }[]; canEdit: boolean }) {
  const { key, goals, sales, reload } = useMonthGoals(wid);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!goals) return <div className="h-24 bg-white rounded-2xl animate-pulse" />;
  if (team.length === 0) return null;

  async function save(id: string, v: number) {
    setBusy(true);
    const { error } = await saveGoal(wid, id, key, v);
    setBusy(false);
    if (error) return toast.error('Não salvou a meta: ' + error.message);
    toast.success(v > 0 ? 'Meta salva' : 'Meta removida');
    setEditing(null); reload();
  }

  const rows = team.map(t => ({ ...t, goal: goals.get(t.id), achieved: mechanicAchieved(sales, t.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="card">
      <div className="font-bold text-sm">🎯 Metas do mês · <span className="capitalize">{monthLabel(key)}</span></div>
      <p className="text-[11px] text-steel-500 mb-3">Valor das OS concluídas em que a pessoa é a responsável (retornos por garantia não contam).</p>
      <ul className="divide-y divide-steel-100">
        {rows.map(r => (
          <li key={r.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <span className="font-semibold text-sm">{r.name}</span>
              {canEdit && editing !== r.id && (
                <button onClick={() => setEditing(r.id)} className="text-xs font-semibold text-brand-700 hover:underline">{r.goal ? 'Alterar meta' : '+ Definir meta'}</button>
              )}
            </div>
            {editing === r.id ? (
              <GoalEditor current={r.goal} busy={busy} onSave={v => save(r.id, v)} onCancel={() => setEditing(null)} />
            ) : r.goal ? (
              <GoalBar achieved={r.achieved} target={r.goal.target} />
            ) : (
              <p className="text-xs text-steel-400">Sem meta definida · fez {brl(r.achieved)} no mês</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A própria meta do colaborador (modo balcão): só leitura, só a dele */
export function MyGoalCard({ wid, mechanicId }: { wid: string; mechanicId: string }) {
  const { key, goals, sales } = useMonthGoals(wid);
  const goal = goals?.get(mechanicId);
  if (!goal) return null;
  return (
    <div className="card mb-4">
      <div className="font-bold text-sm mb-2">🎯 Sua meta · <span className="capitalize">{monthLabel(key)}</span></div>
      <GoalBar achieved={mechanicAchieved(sales, mechanicId)} target={goal.target} />
    </div>
  );
}
