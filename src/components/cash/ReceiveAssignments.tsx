import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { brl } from '@/lib/cash';
import { toast } from '@/components/ui/Toast';
import { PLATFORM, ResponsiblePicker, responsibleOf, saveResponsible } from '@/components/cash/ResponsiblePicker';
import { OsCommission, useOsCommission } from '@/components/cash/OsCommission';
import type { ServiceOrderItem, WorkshopMechanic } from '@/types/database';

/**
 * Responsáveis da OS no caixa — é daqui que saem comissão, desempenho e KPIs.
 *
 * Os responsáveis vêm da própria OS (definidos no orçamento): cada serviço é de alguém da equipe
 * ou do mecânico da plataforma. O caixa só confere e troca se mudou de última hora.
 * - Peça pertence ao serviço logo acima dela na OS (automático): "Serviço" + peças → 4% sobre a soma;
 *   "Mão de obra" (sem peça) → 10%, para quem fez.
 * - O responsável geral da OS fica com quem mais fez serviço da equipe (referência dos indicadores).
 * OS antiga sem itens (valores digitados) continua com um responsável só.
 */

type Item = Pick<ServiceOrderItem, 'id' | 'kind' | 'description' | 'quantity' | 'unit_price' | 'executor' | 'workshop_mechanic_id' | 'used_in_item_id' | 'service_type' | 'commission_amount'>;
type Team = Pick<WorkshopMechanic, 'id' | 'name'>[];
export type ReceiveOs = { id: string; executor: 'workshop' | 'platform' | null; workshop_mechanic_id: string | null };

const amount = (i: Item) => Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100;

export function useReceiveAssignments(os: ReceiveOs, team: Team) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [who, setWho] = useState<Record<string, string>>({});   // serviço → mecânico | PLATFORM | ''
  const [legacy, setLegacy] = useState(() => responsibleOf(os)); // OS sem itens

  useEffect(() => {
    let alive = true;
    supabase.from('service_order_items').select('id, kind, description, quantity, unit_price, executor, workshop_mechanic_id, used_in_item_id, service_type, commission_amount')
      .eq('service_order_id', os.id).order('position')
      .then(({ data }) => {
        if (!alive) return;
        const list = (data as Item[]) ?? [];
        const osWho = os.executor === 'platform' ? PLATFORM : os.workshop_mechanic_id ?? '';
        const labor = list.filter(x => x.kind === 'labor');
        const w: Record<string, string> = {};
        for (const i of labor) w[i.id] = i.executor === 'platform' ? PLATFORM : i.workshop_mechanic_id ?? osWho;
        setItems(list); setWho(w);
      });
    return () => { alive = false; };
  }, [os.id, os.executor, os.workshop_mechanic_id]);

  const labor = useMemo(() => (items ?? []).filter(i => i.kind === 'labor'), [items]);
  const parts = useMemo(() => (items ?? []).filter(i => i.kind === 'part'), [items]);
  const noItems = items !== null && items.length === 0;
  const missing = labor.filter(i => !who[i.id]);
  // Peça pertence ao serviço logo acima dela na OS (ordem dos itens) — automático, não precisa escolher
  const partsOf = useMemo(() => {
    const m = new Map<string, Item[]>();
    // Peças antes do primeiro serviço pertencem a ele
    let cur: Item | null = (items ?? []).find(i => i.kind === 'labor') ?? null;
    if (cur) m.set(cur.id, []);
    for (const i of items ?? []) {
      if (i.kind === 'labor') { cur = i; if (!m.has(i.id)) m.set(i.id, []); } else if (cur) m.get(cur.id)!.push(i);
    }
    return m;
  }, [items]);
  const valid = items !== null && (noItems ? !!legacy : missing.length === 0);

  async function save(): Promise<{ error: { message: string } | null }> {
    if (noItems) return legacy !== responsibleOf(os) ? saveResponsible(os.id, legacy) : { error: null };
    for (const i of labor) {
      const v = who[i.id];
      const cur = i.executor === 'platform' ? PLATFORM : i.workshop_mechanic_id ?? '';
      if (v === cur && i.executor) continue;
      const patch = v === PLATFORM ? { executor: 'platform', workshop_mechanic_id: null } : { executor: 'workshop', workshop_mechanic_id: v };
      const { error } = await supabase.from('service_order_items').update(patch).eq('id', i.id);
      if (error) return { error };
    }
    const allPlatform = labor.length > 0 && labor.every(i => who[i.id] === PLATFORM);
    const { error } = await supabase.from('service_orders').update({
      workshop_mechanic_id: allPlatform ? null : topMechanic(labor, who),
      executor: allPlatform ? 'platform' : 'workshop',
    }).eq('id', os.id);
    return { error };
  }

  const callPlatform = labor.some(i => who[i.id] === PLATFORM && i.executor !== 'platform')
    || (noItems && legacy === PLATFORM && os.executor !== 'platform');

  return { items, labor, parts, partsOf, noItems, who, setWho, legacy, setLegacy, missing, valid, save, callPlatform };
}

/** Quem da equipe tem mais mão de obra na OS */
function topMechanic(labor: Item[], who: Record<string, string>): string | null {
  const sum = new Map<string, number>();
  for (const i of labor) {
    const w = who[i.id];
    if (!w || w === PLATFORM) continue;
    sum.set(w, (sum.get(w) ?? 0) + amount(i));
  }
  return [...sum.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function ReceiveAssignments({ a, team }: { a: ReturnType<typeof useReceiveAssignments>; team: Team }) {
  if (a.items === null) return <div className="h-16 bg-steel-100 rounded-xl animate-pulse mt-4" />;
  if (a.noItems) return <div className="mt-4"><ResponsiblePicker team={team} value={a.legacy} onChange={a.setLegacy} /></div>;
  const name = new Map(team.map(m => [m.id, m.name]));
  const whoName = (id: string) => a.who[id] === PLATFORM ? '🌐 plataforma' : name.get(a.who[id]) ?? 'a definir';

  return (
    <div className="mt-4">
      <div className="label">Responsáveis pelos serviços <span className="text-alert-600">*</span></div>
      <p className="text-[11px] text-steel-500 -mt-1 mb-2">Vêm da OS. Troque só se o mecânico mudou de última hora.</p>
      {a.labor.length === 0 && <p className="text-xs text-steel-500">Esta OS só tem peças.</p>}
      <div className="space-y-2">
        {a.labor.map(i => (
          <div key={i.id} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{i.description}</div>
              <div className="text-[11px] text-steel-400 truncate">
                {(a.partsOf.get(i.id)?.length ?? 0) > 0 || i.service_type === 'servico' ? 'Serviço + peças' : 'Mão de obra'} · {brl(amount(i))}
                {(a.partsOf.get(i.id) ?? []).map(p => ` + ${p.description} ${brl(amount(p))}`).join('')}
              </div>
            </div>
            <select className={`input !py-1.5 text-sm !w-48 shrink-0 ${a.who[i.id] ? '' : '!border-pending-400'}`}
              value={a.who[i.id] ?? ''} onChange={e => a.setWho(w => ({ ...w, [i.id]: e.target.value }))}>
              <option value="">Selecione…</option>
              {team.length > 0 && (
                <optgroup label="Mecânico da loja">
                  {team.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </optgroup>
              )}
              <optgroup label="Mecânico de fora">
                <option value={PLATFORM}>🌐 Mecânico da plataforma</option>
              </optgroup>
            </select>
          </div>
        ))}
      </div>

      {a.missing.length > 0 && (
        <p className="text-xs text-pending-800 mt-2">Falta o responsável de {a.missing.length === 1 ? '1 serviço' : `${a.missing.length} serviços`} — é daqui que sai a comissão.</p>
      )}
    </div>
  );
}

/** OS já recebida: conferir/trocar os responsáveis (ex.: mecânico mudou de última hora) */
export function AssignmentsModal({ os, team, title, wid, sid, onClose, onSaved }: {
  os: ReceiveOs; team: Team; title: string; wid?: string; sid?: string | null; onClose: () => void; onSaved: (callPlatform: boolean) => void;
}) {
  const a = useReceiveAssignments(os, team);
  const comm = useOsCommission(os.id, a, team);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!a.valid) return toast.error('Complete os responsáveis antes de salvar');
    if (wid && !comm.valid) return toast.error('Escolha quem recebe cada comissão');
    setBusy(true);
    const { error } = await a.save();
    if (error) { setBusy(false); return toast.error(error.message); }
    if (wid) {
      const { error: cErr } = await comm.save(wid, sid ?? null);
      if (cErr) { setBusy(false); return toast.error('Não consegui salvar as comissões: ' + cErr.message); }
    }
    setBusy(false);
    toast.success('Responsáveis salvos ✓');
    onSaved(a.callPlatform);
  }
  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold">Responsáveis · {title}</h2>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>
        <ReceiveAssignments a={a} team={team} />
        {wid && <OsCommission c={comm} team={team} />}
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={busy || !a.valid} className="btn-primary flex-[2]">{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
