import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import type { ServiceOrderItem } from '@/types/database';
import { saveResponsible } from '@/components/cash/ResponsiblePicker';
import { whoPatch } from './OsItemsEditor';
import { fmtBRL } from './osHelpers';

type Member = { id: string; name: string };

/**
 * Quem vai fazer a OS: escolhe um ou mais mecânicos da equipe e, com mais de um,
 * diz qual serviço fica com cada um. Cada um passa a ver só os serviços dele.
 * O 1º escolhido é o responsável da OS (fica com o que não for dividido).
 */
export default function ResponsiblesModal({ osId, osNumber, items, team, osMechanicId, onPlatform, onClose, onSaved }: {
  osId: string; osNumber: number | null;
  items: ServiceOrderItem[];
  team: Member[];
  osMechanicId: string | null;
  /** Para mecânico de fora, segue o fluxo da plataforma (demanda, pagamento) */
  onPlatform: () => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Serviços da equipe (os da plataforma não mudam aqui)
  const services = items.filter(i => i.kind === 'labor');
  const mine = services.filter(i => i.executor !== 'platform');
  const initial = [...new Set([osMechanicId, ...mine.map(i => i.workshop_mechanic_id)].filter((x): x is string => !!x && team.some(m => m.id === x)))];

  const [chosen, setChosen] = useState<string[]>(initial);
  const [assign, setAssign] = useState<Record<string, string>>(() =>
    Object.fromEntries(mine.map(i => [i.id, i.workshop_mechanic_id ?? osMechanicId ?? initial[0] ?? ''])));
  const [busy, setBusy] = useState(false);
  const nameOf = (id: string) => team.find(m => m.id === id)?.name ?? 'Colaborador';

  function toggle(id: string) {
    setChosen(cs => {
      if (!cs.includes(id)) {
        // quem entra primeiro numa OS sem divisão leva todos os serviços
        if (cs.length === 0) setAssign(a => Object.fromEntries(Object.keys(a).map(k => [k, id])));
        return [...cs, id];
      }
      const rest = cs.filter(x => x !== id);
      // os serviços de quem saiu passam para o primeiro que ficou
      setAssign(a => Object.fromEntries(Object.entries(a).map(([k, v]) => [k, v === id ? rest[0] ?? '' : v])));
      return rest;
    });
  }

  const unassigned = mine.filter(i => !assign[i.id]).length;

  async function save() {
    if (!chosen.length) return toast.error('Escolha pelo menos um mecânico');
    setBusy(true);
    try {
      const main = chosen[0];
      const r = await saveResponsible(osId, main);
      if (r.error) throw r.error;
      for (const i of mine) {
        const who = assign[i.id] || main;
        const { error } = await supabase.from('service_order_items').update(whoPatch(who === main ? '' : who)).eq('id', i.id);
        if (error) throw error;
      }
      toast.success(chosen.length > 1 ? 'Serviços divididos ✓' : 'Responsável salvo ✓');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error('Não foi possível salvar: ' + (e?.message ?? 'erro'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-xl font-bold">Quem vai fazer · OS nº {osNumber != null ? String(osNumber).padStart(4, '0') : osId.slice(0, 8)}</h2>
          <button onClick={onClose} className="h-10 w-10 -mt-2 -mr-2 text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>
        <p className="text-sm text-steel-500 mb-4">Escolha um ou mais mecânicos. Com mais de um, diga o serviço de cada um.</p>

        <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500 mb-2">Mecânicos</div>
        <div className="flex flex-wrap gap-2 mb-5">
          {team.length === 0 && <span className="text-sm text-steel-500">Nenhum colaborador cadastrado na equipe.</span>}
          {team.map(m => {
            const on = chosen.includes(m.id);
            return (
              <button key={m.id} type="button" onClick={() => toggle(m.id)} aria-pressed={on}
                className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold border transition ${on ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-steel-700 border-steel-200 hover:bg-steel-50'}`}>
                {on ? '✓ ' : ''}{m.name}
              </button>
            );
          })}
        </div>

        {mine.length === 0 && (
          <p className="text-sm text-pending-800 bg-pending-50 border border-pending-200 rounded-xl px-3 py-2 mb-4">
            A OS ainda não tem serviços salvos. O responsável vale para a OS toda; depois de lançar os itens, volte aqui para dividir.
          </p>
        )}

        {mine.length > 0 && chosen.length > 0 && (
          <div className="mb-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500 mb-2">
              {chosen.length > 1 ? 'Quem faz cada serviço' : 'Serviços'}
            </div>
            <ul className="rounded-xl border border-steel-200 divide-y divide-steel-100">
              {mine.map(i => (
                <li key={i.id} className="px-3 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-steel-800 truncate">{i.description}</div>
                    <div className="text-xs text-steel-500">{fmtBRL(Number(i.quantity) * Number(i.unit_price))}</div>
                  </div>
                  {chosen.length > 1 ? (
                    <select className="input !py-2 !px-2 !w-auto text-sm" value={assign[i.id] || chosen[0]}
                      onChange={e => setAssign(a => ({ ...a, [i.id]: e.target.value }))}>
                      {chosen.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}
                    </select>
                  ) : (
                    <span className="text-sm font-semibold text-steel-700 shrink-0">{nameOf(chosen[0])}</span>
                  )}
                </li>
              ))}
            </ul>
            {chosen.length > 1 && (
              <div className="mt-2 text-xs text-steel-500">
                {chosen.map(id => {
                  const n = mine.filter(i => (assign[i.id] || chosen[0]) === id).length;
                  return `${nameOf(id).split(' ')[0]}: ${n} ${n === 1 ? 'serviço' : 'serviços'}`;
                }).join(' · ')}
                {unassigned > 0 && ' · há serviço sem dono'}
              </div>
            )}
          </div>
        )}

        <button onClick={save} disabled={busy || !chosen.length} className="btn-primary w-full">
          {busy ? 'Salvando…' : chosen.length > 1 ? 'Salvar divisão' : 'Salvar'}
        </button>
        <button type="button" onClick={() => { onClose(); onPlatform(); }} className="w-full mt-3 text-sm text-steel-500 hover:text-brand-700 hover:underline">
          🌐 Prefere um mecânico da plataforma?
        </button>
      </div>
    </div>
  );
}
