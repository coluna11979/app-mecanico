import { DragEvent, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, openPause, osNumber } from '@/components/os/osHelpers';
import type { OsRow } from '@/components/os/OsCard';
import type { OsStatus } from '@/types/database';

/* ── Quadro de OS em colunas (como o Comercial) — arrastar só nos passos que o card já permite ── */

const COLUMNS: { key: OsStatus; title: string; bar: string; empty: string }[] = [
  { key: 'open',              title: 'Abertas',              bar: 'bg-steel-400',   empty: 'Nenhuma OS aberta' },
  { key: 'awaiting_approval', title: 'Aguardando aprovação', bar: 'bg-pending-500', empty: 'Nenhum orçamento aguardando' },
  { key: 'approved',          title: 'Aprovadas',            bar: 'bg-blue-500',    empty: 'Nenhuma aprovada esperando' },
  { key: 'in_progress',       title: 'Em andamento',         bar: 'bg-brand-500',   empty: 'Nada no elevador agora' },
  { key: 'completed',         title: 'Concluídas',           bar: 'bg-signal-500',  empty: 'Nenhuma concluída' },
];

/** Concluídas são muitas: mostra as mais recentes e manda o resto para a lista */
const DONE_SHOWN = 20;

/** Para onde cada situação pode ir arrastando (mesmos botões do card) */
const MOVES: Partial<Record<OsStatus, OsStatus[]>> = {
  awaiting_approval: ['approved'],
  approved: ['in_progress'],
  in_progress: ['completed'],
};

const BLOCKED: Partial<Record<string, string>> = {
  'open>awaiting_approval': 'Envie o orçamento pela OS (botão “Enviar orçamento para aprovação”).',
};

const days = (iso: string | null | undefined) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null;

/** Desde quando está na situação atual */
function sinceOf(o: OsRow) {
  switch (o.status) {
    case 'awaiting_approval': return o.approval_requested_at ?? o.created_at;
    case 'approved': return o.approved_at ?? o.created_at;
    case 'in_progress': return o.started_at ?? o.created_at;
    case 'completed': return o.completed_at ?? o.created_at;
    default: return o.created_at;
  }
}

export default function OsBoard({ list, mechanicView, onOpen, onMove, onShowAllDone }: {
  list: OsRow[]; mechanicView?: boolean;
  onOpen: (os: OsRow) => void;
  onMove: (os: OsRow, to: OsStatus) => void;
  onShowAllDone: () => void;
}) {
  const [dragging, setDragging] = useState<OsRow | null>(null);
  const [over, setOver] = useState<OsStatus | null>(null);

  const canMove = (o: OsRow, to: OsStatus) => {
    if (!(MOVES[o.status] ?? []).includes(to)) return false;
    // Mecânico só inicia e conclui
    return !mechanicView || to === 'in_progress' || to === 'completed';
  };

  function drop(e: DragEvent, to: OsStatus) {
    e.preventDefault();
    setOver(null);
    const o = dragging;
    setDragging(null);
    if (!o || o.status === to) return;
    if (canMove(o, to)) { onMove(o, to); return; }
    toast.info(BLOCKED[`${o.status}>${to}`] ?? 'Esse passo é feito dentro da OS.');
  }

  return (
    <div className="grid grid-flow-col auto-cols-[minmax(232px,1fr)] gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
      {COLUMNS.map(c => {
        const all = list.filter(o => o.status === c.key)
          .sort((a, b) => c.key === 'completed'
            ? (sinceOf(b) ?? '').localeCompare(sinceOf(a) ?? '')
            : (sinceOf(a) ?? '').localeCompare(sinceOf(b) ?? ''));
        const shown = c.key === 'completed' ? all.slice(0, DONE_SHOWN) : all;
        const total = all.reduce((s, o) => s + Number(o.price ?? 0), 0);
        const target = dragging && dragging.status !== c.key;
        const allowed = !!dragging && canMove(dragging, c.key);
        return (
          <section key={c.key}
            onDragOver={e => { if (target) { e.preventDefault(); setOver(c.key); } }}
            onDragLeave={() => setOver(o => (o === c.key ? null : o))}
            onDrop={e => drop(e, c.key)}
            className={`flex flex-col rounded-2xl min-h-[460px] overflow-hidden transition ${
              over === c.key && allowed ? 'bg-signal-50 ring-2 ring-signal-400'
                : over === c.key ? 'bg-alert-500/5 ring-2 ring-alert-300'
                : allowed ? 'bg-steel-100/70 ring-2 ring-signal-300' : 'bg-steel-100/70'}`}>
            <div className={`h-1 ${c.bar}`} />
            <header className="px-3.5 pt-3 pb-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-[13px] font-bold text-steel-800 truncate">{c.title}</h3>
                <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-white text-[11px] font-bold text-steel-600 grid place-items-center shadow-sm">{all.length}</span>
              </div>
              {!mechanicView && <p className="text-base font-bold text-steel-900 tabular-nums mt-1">{fmtBRL(total)}</p>}
            </header>
            <div className="flex-1 px-2 pb-2 space-y-2 overflow-y-auto max-h-[66vh] [scrollbar-width:thin]">
              {all.length === 0 ? (
                <div className="h-full min-h-[120px] rounded-xl border-2 border-dashed border-steel-200 grid place-items-center px-4 text-center">
                  <span className="text-xs text-steel-400">{allowed ? 'Solte aqui' : c.empty}</span>
                </div>
              ) : (
                <>
                  {shown.map(o => (
                    <Card key={o.id} o={o} mechanicView={mechanicView}
                      draggable={!!(MOVES[o.status]?.length)}
                      onDragStart={() => setDragging(o)} onDragEnd={() => { setDragging(null); setOver(null); }}
                      onOpen={() => onOpen(o)} />
                  ))}
                  {all.length > shown.length && (
                    <button type="button" onClick={onShowAllDone}
                      className="w-full py-2 text-xs font-semibold text-steel-500 hover:text-steel-800">
                      + {all.length - shown.length} concluídas — ver na lista
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Card({ o, mechanicView, draggable, onDragStart, onDragEnd, onOpen }: {
  o: OsRow; mechanicView?: boolean; draggable: boolean;
  onDragStart: () => void; onDragEnd: () => void; onOpen: () => void;
}) {
  const d = days(sinceOf(o));
  const late = (o.status === 'awaiting_approval' && (d ?? 0) >= 3) || (o.status === 'open' && (d ?? 0) >= 7);
  const paused = o.status === 'in_progress' && !!openPause(o.pauses);
  const car = [o.vehicle?.make, o.vehicle?.model].filter(Boolean).join(' ');
  return (
    <div
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group rounded-xl bg-white border border-steel-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-steel-300 hover:shadow-md transition p-3 ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-steel-400">OS {osNumber(o)}</span>
        {o.scheduled_at && ['open', 'awaiting_approval', 'approved'].includes(o.status) && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-sky-50 text-sky-700">
            📅 {new Date(o.scheduled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
          </span>
        )}
        {d != null && (
          <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${late ? 'bg-alert-500/10 text-alert-600' : 'bg-steel-100 text-steel-500'}`}>
            {o.status === 'completed' ? new Date(sinceOf(o)!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : d === 0 ? 'hoje' : `${d}d`}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-steel-900 truncate mt-1">{o.title}</p>
      <p className="text-xs text-steel-500 truncate">
        {[!mechanicView ? o.customer?.full_name : null, car].filter(Boolean).join(' · ') || 'Sem cliente'}
      </p>
      <div className="flex items-center justify-between gap-2 mt-2">
        {!mechanicView
          ? <span className="text-[15px] font-bold text-steel-900 tabular-nums">{fmtBRL(o.price)}</span>
          : <span />}
        <span className="text-[10px] font-medium text-steel-400 truncate">{o.vehicle?.plate ?? ''}</span>
      </div>
      {(o.mechanic?.name || paused || (o.status === 'completed' && o.paid_at)) && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {o.mechanic?.name && <span className="text-[10px] text-steel-500 truncate">🔧 {o.mechanic.name.split(' ')[0]}</span>}
          {paused && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-pending-100 text-pending-800">⏸ pausada</span>}
          {o.status === 'completed' && o.paid_at && !mechanicView && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-signal-100 text-signal-700">✓ paga</span>}
        </div>
      )}
    </div>
  );
}
