import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { PAUSE_REASONS, fmtDur } from './osHelpers';
import type { ServiceOrderItem } from '@/types/database';
import { COMMON_SERVICES, guessServiceMinutes } from '@/lib/services';

type WorkLog = {
  id: string; executor: 'workshop' | 'platform'; workshop_mechanic_id: string | null;
  started_at: string; ended_at: string | null; pause_reason: string | null; finished: boolean;
  service_order_item_id: string | null;
};
/** itemId = relógio de um serviço; sem itemId = relógio do responsável (OS antiga, com trechos sem serviço) */
type Group = { key: string; name: string; platform: boolean; mechanicId: string | null; services: string[]; itemId?: string };

const PLATFORM = 'platform';
const keyOf = (l: Pick<WorkLog, 'executor' | 'workshop_mechanic_id'>) => (l.executor === 'platform' ? PLATFORM : l.workshop_mechanic_id!);
const minutes = (l: WorkLog) => Math.max(0, Math.round(((l.ended_at ? new Date(l.ended_at).getTime() : Date.now()) - new Date(l.started_at).getTime()) / 60000));
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * ⏱ Relógio por serviço: cada serviço da OS tem o seu Iniciar / Pausar / Terminou, com o responsável dele
 * (mecânico da loja ou da plataforma). OS que já tinha relógio por responsável continua assim.
 * O primeiro a iniciar coloca a OS "Em andamento"; quando tudo termina, sugere concluir a OS.
 */
export default function ResponsibleTimers({ osId, workshopId, status, items, team, osMechanicId, osExecutor, readOnly, onlyMechanicId, onStartOs, onAllDone, onItemsChanged }: {
  osId: string; status: string;
  /** Para buscar a média real e a tabela de serviços da oficina */
  workshopId?: string;
  items: Pick<ServiceOrderItem, 'id' | 'kind' | 'description' | 'executor' | 'workshop_mechanic_id' | 'estimated_minutes'>[];
  team: { id: string; name: string }[];
  osMechanicId: string | null; osExecutor: 'workshop' | 'platform' | null | undefined;
  readOnly?: boolean;
  /** Painel do mecânico: mostra só o relógio dele (sem os dos colegas nem o "Concluir OS") */
  onlyMechanicId?: string | null;
  onStartOs: () => Promise<void> | void;
  onAllDone: () => void;
  /** Depois de ajustar o tempo de um serviço */
  onItemsChanged?: () => void;
}) {
  const [logs, setLogs] = useState<WorkLog[] | null>(null);
  const [pausing, setPausing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  /* ── Tempo médio de cada serviço ──
     1) ajustado nesta OS · 2) média real da oficina (serviços já terminados, 2 ou mais) ·
     3) tempo da tabela de serviços · 4) padrão do sistema. */
  const [table, setTable] = useState<Map<string, number>>(new Map());
  const [real, setReal] = useState<Map<string, { avg: number; n: number }>>(new Map());
  const [mine, setMine] = useState<Record<string, number>>({});   // ajustes feitos agora (aparecem na hora)
  const [editEst, setEditEst] = useState<{ id: string; value: string } | null>(null);
  const norm = (t: string) => t.trim().toLowerCase();

  useEffect(() => {
    if (!workshopId) return;
    let alive = true;
    (async () => {
      const [svc, hist] = await Promise.all([
        supabase.from('workshop_services').select('name, estimated_minutes').eq('workshop_id', workshopId).not('estimated_minutes', 'is', null),
        supabase.from('service_order_work_logs')
          .select('service_order_item_id, started_at, ended_at, finished, item:service_order_items!service_order_item_id(description)')
          .eq('workshop_id', workshopId).not('service_order_item_id', 'is', null).not('ended_at', 'is', null).limit(2000),
      ]);
      if (!alive) return;
      setTable(new Map(((svc.data ?? []) as { name: string; estimated_minutes: number }[]).map(x => [x.name.trim().toLowerCase(), x.estimated_minutes])));
      // soma o tempo por serviço (de todos os trechos) e tira a média por descrição, só dos terminados
      const perItem = new Map<string, { desc: string; min: number; done: boolean }>();
      for (const l of (hist.data ?? []) as unknown as { service_order_item_id: string; started_at: string; ended_at: string; finished: boolean; item: { description: string } | { description: string }[] | null }[]) {
        const it = Array.isArray(l.item) ? l.item[0] : l.item;
        if (!it) continue;
        const cur = perItem.get(l.service_order_item_id) ?? { desc: it.description, min: 0, done: false };
        cur.min += Math.max(0, (new Date(l.ended_at).getTime() - new Date(l.started_at).getTime()) / 60000);
        cur.done = cur.done || l.finished;
        perItem.set(l.service_order_item_id, cur);
      }
      const byDesc = new Map<string, number[]>();
      for (const v of perItem.values()) if (v.done && v.min > 0) byDesc.set(v.desc.trim().toLowerCase(), [...(byDesc.get(v.desc.trim().toLowerCase()) ?? []), v.min]);
      setReal(new Map([...byDesc.entries()].filter(([, a]) => a.length >= 2).map(([k, a]) => [k, { avg: a.reduce((x, y) => x + y, 0) / a.length, n: a.length }])));
    })();
    return () => { alive = false; };
  }, [workshopId]);

  /** Tempo estimado do serviço e de onde veio */
  const estimateOf = (itemId: string, description: string): { minutes: number; from: string } | null => {
    const own = mine[itemId] ?? items.find(i => i.id === itemId)?.estimated_minutes ?? null;
    if (own) return { minutes: own, from: 'ajustado nesta OS' };
    const r = real.get(norm(description));
    if (r) return { minutes: Math.max(1, Math.round(r.avg)), from: `média real de ${r.n} serviços` };
    const t = table.get(norm(description));
    if (t) return { minutes: t, from: 'da tabela de serviços' };
    const c = COMMON_SERVICES.find(x => norm(x.name) === norm(description));
    if (c) return { minutes: c.minutes, from: 'tempo padrão' };
    const g = guessServiceMinutes(description);
    return g ? { minutes: g, from: 'tempo típico estimado pelo nome do serviço' } : null;
  };

  async function saveEstimate(itemId: string, raw: string) {
    const m = Math.round(Number(raw.replace(',', '.')));
    setEditEst(null);
    if (!raw.trim()) return;
    if (!Number.isFinite(m) || m <= 0) return toast.error('Informe os minutos (maior que zero)');
    const { error } = await supabase.from('service_order_items').update({ estimated_minutes: m }).eq('id', itemId);
    if (error) return toast.error('Não foi possível salvar o tempo: ' + error.message);
    setMine(x => ({ ...x, [itemId]: m }));
    toast.success('Tempo do serviço atualizado ✓');
    onItemsChanged?.();
  }

  const load = useCallback(async () => {
    const { data } = await supabase.from('service_order_work_logs')
      .select('id, executor, workshop_mechanic_id, started_at, ended_at, pause_reason, finished, service_order_item_id')
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

  // OS com trechos antigos (sem serviço) segue por responsável; as demais, por serviço
  const legacy = (logs ?? []).some(l => !l.service_order_item_id);
  // Responsáveis = quem fez os serviços (sem responsável → fora daqui, aparece o aviso)
  const name = useMemo(() => new Map(team.map(m => [m.id, m.name])), [team]);
  const { groups, unassigned } = useMemo(() => {
    const map = new Map<string, Group>();
    let unassigned = 0;
    for (const i of items.filter(x => x.kind === 'labor')) {
      const k = i.executor === 'platform' ? PLATFORM
        : i.workshop_mechanic_id ?? osMechanicId ?? (osExecutor === 'platform' ? PLATFORM : null);
      if (!k) { unassigned += 1; continue; }
      if (!legacy) {
        map.set(i.id, {
          key: i.id, itemId: i.id, platform: k === PLATFORM, mechanicId: k === PLATFORM ? null : k,
          name: k === PLATFORM ? 'Mecânico da plataforma' : name.get(k) ?? 'Colaborador', services: [i.description],
        });
        continue;
      }
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
  }, [items, osMechanicId, osExecutor, name, onlyMechanicId, legacy]);

  const logsOf = (g: Group) => (logs ?? []).filter(l => (g.itemId ? l.service_order_item_id === g.itemId : keyOf(l) === g.key));
  const stateOf = (g: Group) => {
    const mine = logsOf(g);
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
    // O mesmo mecânico não trabalha em dois serviços ao mesmo tempo: o que estava aberto é pausado
    if (g.itemId && g.mechanicId) {
      const other = (logs ?? []).find(l => !l.ended_at && l.workshop_mechanic_id === g.mechanicId && l.service_order_item_id !== g.itemId);
      if (other) await supabase.from('service_order_work_logs').update({ ended_at: new Date().toISOString(), pause_reason: 'Foi para outro serviço' }).eq('id', other.id);
    }
    const { error } = await supabase.from('service_order_work_logs').insert({
      service_order_id: osId, executor: g.platform ? 'platform' : 'workshop', workshop_mechanic_id: g.mechanicId,
      ...(g.itemId ? { service_order_item_id: g.itemId } : {}),
    });
    if (!error && status !== 'in_progress' && status !== 'completed') await onStartOs();
    setBusy(false);
    if (error) return toast.error('Não foi possível iniciar: ' + error.message);
    toast.success(g.itemId ? `${g.services[0]}: começou ▶` : `${g.name.split(' ')[0]} começou ▶`);
    load();
  }

  async function close(g: Group, patch: { pause_reason?: string; finished?: boolean }) {
    const s = stateOf(g);
    setBusy(true);
    const { error } = s.open
      ? await supabase.from('service_order_work_logs').update({ ended_at: new Date().toISOString(), ...patch }).eq('id', s.open.id)
      // já estava pausado e terminou: marca o último trecho como final
      : await supabase.from('service_order_work_logs').update({ finished: true })
          .eq('id', logsOf(g).at(-1)!.id);
    setBusy(false);
    setPausing(null);
    if (error) return toast.error(error.message);
    toast.success(patch.finished ? (g.itemId ? `${g.services[0]}: terminou ✓` : `${g.name.split(' ')[0]} terminou ✓`) : `Pausado — ${patch.pause_reason?.toLowerCase()} ⏸`);
    await load();
  }

  if (logs === null || (!groups.length && !unassigned)) return null;
  const allDone = !onlyMechanicId && groups.length > 0 && !unassigned && groups.every(g => stateOf(g).finished);

  return (
    <div className="mt-4 rounded-xl border border-steel-200 divide-y divide-steel-100">
      <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-steel-500">⏱ {legacy ? 'Tempo por responsável' : 'Tempo por serviço'}</div>
      {groups.map(g => {
        const s = stateOf(g);
        const tone = s.open ? 'text-brand-700' : s.finished ? 'text-signal-700' : s.pausedReason ? 'text-pending-800' : 'text-steel-400';
        return (
          <div key={g.key} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex-1 min-w-[180px]">
              {g.itemId ? (
                <>
                  <div className="font-semibold text-sm truncate">{g.services[0]}</div>
                  <div className="text-xs text-steel-500 truncate">{g.platform ? '🌐' : '🔧'} {g.name}</div>
                </>
              ) : (
                <>
                  <div className="font-semibold text-sm">{g.platform ? '🌐' : '🔧'} {g.name}</div>
                  <div className="text-xs text-steel-500 truncate">{g.services.join(' · ')}</div>
                </>
              )}
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold font-display leading-none ${tone}`}>
                {s.open && <span className="animate-pulse">● </span>}{fmtDur(s.worked)}
              </div>
              <div className="text-[11px] text-steel-500 mt-0.5">
                {s.open ? `trabalhando desde ${hhmm(s.open.started_at)}`
                  : s.finished ? 'terminou' : s.pausedReason ? `⏸ ${s.pausedReason.toLowerCase()}` : 'não começou'}
              </div>
              {g.itemId && (() => {
                const est = estimateOf(g.itemId, g.services[0]);
                const editing = editEst?.id === g.itemId;
                const over = !!est && s.worked > est.minutes;
                return (
                  <div className="text-[11px] mt-0.5 flex items-center justify-end gap-1.5">
                    {editing ? (
                      <>
                        <span className="text-steel-500">médio</span>
                        <input autoFocus inputMode="numeric" className="input !py-1 !px-2 !w-16 text-xs text-right" defaultValue={est?.minutes ?? ''}
                          onKeyDown={e => { if (e.key === 'Enter') saveEstimate(g.itemId!, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditEst(null); }}
                          onChange={e => setEditEst({ id: g.itemId!, value: e.target.value })} />
                        <span className="text-steel-500">min</span>
                        <button type="button" onClick={() => saveEstimate(g.itemId!, editEst?.value ?? String(est?.minutes ?? ''))} className="font-semibold text-signal-700">OK</button>
                      </>
                    ) : (
                      <>
                        <span className={over ? 'text-alert-600 font-semibold' : 'text-steel-500'} title={est?.from}>
                          {est ? `médio ${fmtDur(est.minutes)}` : 'sem tempo médio'}{over ? ' · passou' : ''}
                        </span>
                        {!readOnly && !onlyMechanicId && (
                          <button type="button" onClick={() => setEditEst({ id: g.itemId!, value: String(est?.minutes ?? '') })}
                            className="text-brand-600 hover:underline" aria-label="Editar tempo médio">✏️ {est ? 'editar' : 'definir'}</button>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
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
