import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import CallMechanicModal, { type CallMechanicOs } from '@/components/cash/CallMechanicModal';
import type { WorkshopMechanic } from '@/types/database';

/** '' = não informado · 'platform' = mecânico da plataforma · senão id do mecânico da equipe */
export type Responsible = string;
export const PLATFORM = 'platform';

export function responsibleOf(os: { executor?: string | null; workshop_mechanic_id?: string | null }): Responsible {
  if (os.executor === 'platform') return PLATFORM;
  return os.workshop_mechanic_id ?? '';
}

export async function saveResponsible(osId: string, r: Responsible) {
  const patch = r === PLATFORM
    ? { executor: 'platform', workshop_mechanic_id: null }
    : { executor: 'workshop', workshop_mechanic_id: r };
  return supabase.from('service_orders').update(patch).eq('id', osId);
}

/** Quem fez o serviço da OS: mecânico da loja ou da plataforma */
export function ResponsiblePicker({ team, value, onChange }: {
  team: Pick<WorkshopMechanic, 'id' | 'name'>[]; value: Responsible; onChange: (r: Responsible) => void;
}) {
  return (
    <div>
      <label className="label">Quem fez o serviço? <span className="text-alert-600">*</span></label>
      <select className={`input ${value ? '' : '!border-pending-400'}`} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Selecione o responsável…</option>
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
  );
}

/** OS já recebida: define/corrige o responsável e, se for da plataforma, chama o mecânico */
export function ResponsibleModal({ wid, os, team, current, onClose, onSaved, allowCall = true }: {
  wid: string; os: CallMechanicOs; team: Pick<WorkshopMechanic, 'id' | 'name'>[]; current: Responsible;
  onClose: () => void; onSaved: () => void;
  /** false = só registra "plataforma", sem oferecer publicar demanda (ex.: OS já concluída) */
  allowCall?: boolean;
}) {
  const [value, setValue] = useState<Responsible>(current);
  const [busy, setBusy] = useState(false);
  const [calling, setCalling] = useState(false);

  async function save(thenCall: boolean) {
    if (!value) return toast.error('Selecione quem fez o serviço');
    setBusy(true);
    const { error } = await saveResponsible(os.id, value);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Responsável salvo');
    onSaved();
    if (thenCall) setCalling(true); else onClose();
  }

  if (calling) return <CallMechanicModal wid={wid} os={os} onClose={onClose} />;

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold">Responsável · OS nº {os.number != null ? String(os.number).padStart(4, '0') : os.id.slice(0, 8)}</h2>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>
        <ResponsiblePicker team={team} value={value} onChange={setValue} />
        {value === PLATFORM && allowCall ? (
          // Mecânico da plataforma sempre passa por uma demanda (pagamento, taxa e histórico no app)
          <button onClick={() => save(true)} disabled={busy} className="btn-primary w-full mt-5">🔧 Salvar e chamar mecânico da plataforma</button>
        ) : (
          <button onClick={() => save(false)} disabled={busy || !value} className="btn-primary w-full mt-5">Salvar</button>
        )}
      </div>
    </div>
  );
}
