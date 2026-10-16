import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { PAUSE_REASONS, fmtDur } from './osHelpers';
import type { ServiceOrderItem } from '@/types/database';

type WorkLog = {
  id: string; executor: 'workshop' | 'platform'; workshop_mechanic_id: string | null;
  started_at: string; ended_at: string | null; pause_reason: string | null; finished: boolean;
};
type Group = { key: string; name: string; platform: boolean; mechanicId: string | null; services: string[] };

const PLATFORM = 'platform';
const keyOf = (l: Pick<WorkLog, 'executor' | 'workshop_mechanic_id'>) => (l.executor === 'platform' ? PLATFORM : l.workshop_mechanic_id!);
const minutes = (l: WorkLog) => Math.max(0, Math.round(((l.ended_at ? new Date(l.ended_at).getTime() : Date.now()) - new Date(l.started_at).getTime()) / 60000));
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * ⏱ Relógio por responsável: cada um (mecânico da loja ou da plataforma) inicia, pausa e termina
 * a sua parte da OS. Os responsáveis vêm dos serviços da OS ("Quem fez").
 * O primeiro a iniciar coloca a OS "Em andamento"; quando todos terminam, sugere concluir a OS.
 */
export default function ResponsibleTimers({ osId, status, items, team, osMechanicId, osExecutor, readOnly, onlyMechanicId, onStartOs, onAllDone }: {
  osId: string; status: string;
  items: Pick<ServiceOrderItem, 'kind' | 'description' | 'executor' | 'workshop_mechanic_id'>[];
  team: { id: string; name: string }[];
  osMechanicId: string | null; osExecutor: 'workshop' | 'platform' | null | undefined;
  readOnly?: boolean;
  /** Painel do mecânico: mostra só o relógio dele (sem os dos colegas nem o "Concluir OS") */
  onlyMechanicId?: string | null;
  onStartOs: () => Promise<void> | void;
  onAllDone: () => void;
}) {
  const [logs, setLogs] = useState<WorkLog[] | null>(null);
  const [pausing, setPausing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const { data } = await supabase.from('service_order_work_logs')
      .select('id, executor, workshop_mechanic_id, started_at, ended_at, pause_reason, finished')
      .eq('service_order_id', osId).order('started_at');
    setLogs((data as WorkLog[]) ?? []);
  }, [osId]);
  useEffect(() => { load(); }, [load]);

  const running = (logs ?? []).some(l => !l.ended_at);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, [running]);

  // Responsáveis = quem fez os serviços (sem responsável → fora daqui, aparece o aviso)
  const name = useMemo(() => new Map(team.map(m => [m.id, m.name])), [team]);
  const { groups, unassigned } = useMemo(() => {
    const map = new Map<string, Group>();
    let unassigned = 0;
    for (const i of items.filter(x => x.kind === 'labor')) {
      const k = i.executor === 'platform' ? PLATFORM
        : i.workshop_mechanic_id ?? osMechanicId ?? (osExecutor === 'platform' ? PLATFORM : null);
      if (!k) { unassigned += 1; continue; }
      const g = map.get(k) ?? {
        key: k, platform: k === PLATFORM, mechanicId: k === PLATFORM ? null : k,
        name: k === PLATFORM ? 'Mecânico da plataforma' : name.get(k) ?? 'Colaborador', services: [],
      };
      g.services.push(i.description);
      map.set(k, g);
    }
    const all = [...map.values()];
    return onlyMechanicId
      ? { groups: all.filter(g => g.mechanicId === onlyMechanicId), unassigned: 0 }
      : { groups: all, unassigned };
  }, [items, osMechanicId, osExecutor, name, onlyMechanicId]);

  const stateOf = (g: Group) => {
    const mine = (logs ?? []).filter(l => keyOf(l) === g.key);
    const open = mine.find(l => !l.ended_at) ?? null;
    const last = mine[mine.length - 1] ?? null;
    return {
      worked: mine.reduce((a, l) => a + minutes(l), 0),
      open, started: mine.length > 0,
      finished: !open && !!last?.finished,
      pausedReason: !open && last && !last.finished ? last.pause_reason : null,
      first: mine[0]?.started_at ?? null,
    };
  };

  async function start(g: Group) {
    setBusy(true);
    const { error } = await supabase.from('service_order_work_logs').insert({
      service_order_id: osId, executor: g.platform ? 'platform' : 'workshop', workshop_mechanic_id: g.mechanicId,
    });
    if (!error && status !== 'in_progress' && status !== 'completed') await onStartOs();
    setBusy(false);
    if (error) return toast.error('Não foi possível iniciar: ' + error.message);
    toast.success(`${g.name.split(' ')[0]} começou ▶`);
    load();
  }

  async function close(g: Group, patch: { pause_reason?: string; finished?: boolean }) {
    const s = stateOf(g);
    setBusy(true);
    const { error } = s.open
      ? await supabase.from('service_order_work_logs').update({ ended_at: new Date().toISOString(), ...patch }).eq('id', s.open.id)
      // já estava pausado e terminou: marca o último trecho como final
      : await supabase.from('service_order_work_logs').update({ finished: true })
          .eq('id', (logs ?? []).filter(l => keyOf(l) === g.key).at(-1)!.id);
    setBusy(false);
    setPausing(null);
    if (error) return toast.error(error.message);
    toast.success(patch.finished ? `${g.name.split(' ')[0]} terminou ✓` : `Pausado — ${patch.pause_reason?.toLowerCase()} ⏸`);
    await load();
  }

  if (logs === null || (!groups.length && !unassigned)) return null;
  const allDone = !onlyMechanicId && groups.length > 0 && !unassigned && groups.every(g => stateOf(g).finished);

  return (
    <div className="mt-4 rounded-xl border border-steel-200 divide-y divide-steel-100">
      <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-steel-500">⏱ Tempo por responsável</div>
      {groups.map(g => {
        const s = stateOf(g);
        const tone = s.open ? 'text-brand-700' : s.finished ? 'text-signal-700' : s.pausedReason ? 'text-pending-800' : 'text-steel-400';
        return (
          <div key={g.key} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex-1 min-w-[180px]">
              <div className="font-semibold text-sm">{g.platform ? '🌐' : '🔧'} {g.name}</div>
              <div className="text-xs text-steel-500 truncate">{g.services.join(' · ')}</div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold font-display leading-none ${tone}`}>
                {s.open && <span className="animate-pulse">● </span>}{fmtDur(s.worked)}
              </div>
              <div className="text-[11px] text-steel-500 mt-0.5">
                {s.open ? `trabalhando desde ${hhmm(s.open.started_at)}`
                  : s.finished ? 'terminou' : s.pausedReason ? `⏸ ${s.pausedReason.toLowerCase()}` : 'não começou'}
              </div>
            </div>
            {!readOnly && (
              <div className="flex gap-1.5 shrink-0">
                {!s.open && !s.finished && (
                  <button onClick={() => start(g)} disabled={busy} className="btn-primary text-xs !py-1.5 !px-3">
                    ▶ {s.started ? 'Retomar' : 'Iniciar'}
                  </button>
                )}
                {s.open && (
                  <button onClick={() => setPausing(p => (p === g.key ? null : g.key))} disabled={busy} className="btn-secondary text-xs !py-1.5 !px-3">⏸ Pausar</button>
                )}
                {s.started && !s.finished && (
                  <button onClick={() => close(g, { finished: true })} disabled={busy} className="btn-secondary text-xs !py-1.5 !px-3 !text-signal-700">✓ Terminou</button>
                )}
                {s.finished && status !== 'completed' && (
                  <button onClick={() => start(g)} disabled={busy} className="text-xs text-steel-500 underline">reabrir</button>
                )}
              </div>
            )}
            {pausing === g.key && (
              <div className="w-full flex flex-wrap gap-1.5">
                {PAUSE_REASONS.map(r => (
                  <button key={r} onClick={() => close(g, { pause_reason: r })} disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-full border border-pending-200 bg-pending-50 text-pending-800">{r}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {unassigned > 0 && (
        <div className="px-4 py-2.5 text-xs text-pending-800 bg-pending-50">
          {unassigned === 1 ? '1 serviço está' : `${unassigned} serviços estão`} sem responsável — escolha em “Quem vai fazer” para ter o relógio dele.
        </div>
      )}
      {allDone && status !== 'completed' && !readOnly && (
        <div className="px-4 py-3 flex items-center justify-between gap-3 bg-signal-50">
          <span className="text-sm text-signal-800">✓ Todos terminaram a sua parte.</span>
          <button onClick={onAllDone} className="btn-primary text-xs !py-1.5 !bg-signal-600">Concluir OS</button>
        </div>
      )}
    </div>
  );
}
