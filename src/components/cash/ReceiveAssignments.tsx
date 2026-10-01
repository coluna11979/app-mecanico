import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { brl } from '@/lib/cash';
import { toast } from '@/components/ui/Toast';
import { PLATFORM, ResponsiblePicker, responsibleOf, saveResponsible } from '@/components/cash/ResponsiblePicker';
import type { ServiceOrderItem, WorkshopMechanic } from '@/types/database';

/**
 * Responsáveis da OS no caixa — é daqui que saem comissão, desempenho e KPIs.
 *
 * Os responsáveis vêm da própria OS (definidos no orçamento): cada serviço é de alguém da equipe
 * ou do mecânico da plataforma. O caixa só confere e troca se mudou de última hora.
 * - Peça segue o serviço em que foi usada ("Usada em"). Com mais de um serviço na OS, toda peça precisa
 *   dizer onde foi usada (ou "avulsa"): define quem leva a comissão da peça e se o serviço é "só serviço"
 *   (% própria, ex.: 10%) ou serviço com peça da loja (% de serviços + % de peças).
 * - O responsável geral da OS fica com quem mais fez serviço da equipe (referência dos indicadores).
 * OS antiga sem itens (valores digitados) continua com um responsável só.
 */

type Item = Pick<ServiceOrderItem, 'id' | 'kind' | 'description' | 'quantity' | 'unit_price' | 'executor' | 'workshop_mechanic_id' | 'used_in_item_id'>;
type Team = Pick<WorkshopMechanic, 'id' | 'name'>[];
export type ReceiveOs = { id: string; executor: 'workshop' | 'platform' | null; workshop_mechanic_id: string | null };

/** Peça avulsa: vendida sem ser usada em nenhum serviço desta OS */
const NONE = 'none';

const amount = (i: Item) => Math.round(Number(i.quantity) * Number(i.unit_price) * 100) / 100;

export function useReceiveAssignments(os: ReceiveOs, team: Team) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [who, setWho] = useState<Record<string, string>>({});   // serviço → mecânico | PLATFORM | ''
  const [use, setUse] = useState<Record<string, string>>({});   // peça → serviço em que foi usada | NONE (avulsa) | ''
  const [legacy, setLegacy] = useState(() => responsibleOf(os)); // OS sem itens

  useEffect(() => {
    let alive = true;
    supabase.from('service_order_items').select('id, kind, description, quantity, unit_price, executor, workshop_mechanic_id, used_in_item_id')
      .eq('service_order_id', os.id).order('position')
      .then(({ data }) => {
        if (!alive) return;
        const list = (data as Item[]) ?? [];
        const osWho = os.executor === 'platform' ? PLATFORM : os.workshop_mechanic_id ?? '';
        const labor = list.filter(x => x.kind === 'labor');
        const w: Record<string, string> = {};
        for (const i of labor) w[i.id] = i.executor === 'platform' ? PLATFORM : i.workshop_mechanic_id ?? osWho;
        const u: Record<string, string> = {};
        for (const p of list.filter(x => x.kind === 'part')) {
          u[p.id] = p.used_in_item_id && labor.some(l => l.id === p.used_in_item_id) ? p.used_in_item_id
            : labor.length === 1 ? labor[0].id : '';
        }
        setItems(list); setWho(w); setUse(u);
      });
    return () => { alive = false; };
  }, [os.id, os.executor, os.workshop_mechanic_id]);

  const labor = useMemo(() => (items ?? []).filter(i => i.kind === 'labor'), [items]);
  const parts = useMemo(() => (items ?? []).filter(i => i.kind === 'part'), [items]);
  const noItems = items !== null && items.length === 0;
  const missing = labor.filter(i => !who[i.id]);
  // Mais de um serviço: cada peça precisa dizer onde foi usada (comissão da peça e "só serviço" dependem disso)
  const mustLink = labor.length > 1;
  const partsMissing = mustLink ? parts.filter(p => !use[p.id]) : [];
  const valid = items !== null && (noItems ? !!legacy : missing.length === 0 && partsMissing.length === 0);

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
    for (const p of parts) {
      const v = use[p.id] && use[p.id] !== NONE ? use[p.id] : null;
      if (v === (p.used_in_item_id ?? null)) continue;
      const { error } = await supabase.from('service_order_items').update({ used_in_item_id: v }).eq('id', p.id);
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

  return { items, labor, parts, noItems, who, setWho, use, setUse, legacy, setLegacy, missing, partsMissing, mustLink, valid, save, callPlatform };
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
              <div className="text-[11px] text-steel-400">{brl(amount(i))}</div>
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

      {a.parts.length > 0 && a.labor.length > 0 && (
        <div className="mt-3 pt-3 border-t border-steel-100 space-y-2">
          <div className="text-[11px] font-semibold text-steel-500 uppercase tracking-wide">Peças — a comissão segue o serviço</div>
          {a.parts.map(p => (
            <div key={p.id} className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{p.description}</div>
                <div className="text-[11px] text-steel-400">{brl(amount(p))}</div>
              </div>
              <select className={`input !py-1.5 text-sm !w-48 shrink-0 ${a.use[p.id] || !a.mustLink ? '' : '!border-pending-400'}`}
                value={a.use[p.id] ?? ''} onChange={e => a.setUse(u => ({ ...u, [p.id]: e.target.value }))}>
                <option value="">{a.mustLink ? 'Usada em qual serviço?' : 'Nenhum serviço específico'}</option>
                {a.labor.map(l => <option key={l.id} value={l.id}>{l.description} · {whoName(l.id)}</option>)}
                <option value={NONE}>Peça avulsa (sem serviço)</option>
              </select>
            </div>
          ))}
        </div>
      )}

      {(a.missing.length > 0 || a.partsMissing.length > 0) && (
        <p className="text-xs text-pending-800 mt-2">
          {a.missing.length > 0 && `Falta o responsável de ${a.missing.length === 1 ? '1 serviço' : `${a.missing.length} serviços`}. `}
          {a.partsMissing.length > 0 && `Diga em qual serviço ${a.partsMissing.length === 1 ? 'a peça foi usada' : 'as peças foram usadas'} — define a comissão da peça e do serviço.`}
        </p>
      )}
    </div>
  );
}

/** OS já recebida: conferir/trocar os responsáveis (ex.: mecânico mudou de última hora) */
export function AssignmentsModal({ os, team, title, onClose, onSaved }: {
  os: ReceiveOs; team: Team; title: string; onClose: () => void; onSaved: (callPlatform: boolean) => void;
}) {
  const a = useReceiveAssignments(os, team);
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!a.valid) return toast.error('Complete os responsáveis antes de salvar');
    setBusy(true);
    const { error } = await a.save();
    setBusy(false);
    if (error) return toast.error(error.message);
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
        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={busy || !a.valid} className="btn-primary flex-[2]">{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
