import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useOperator, type OperatorRole } from '@/lib/operators';

/**
 * Quem está usando o Check-up e o que pode fazer.
 * - Fora do modo balcão (aparelho do dono) = gestor.
 * - Mecânico (PIN): fila dele + sem responsável; inspeciona; não vê preço, não envia, não exclui.
 * - Caixa/atendente/vendedor: como já era — criam e mandam ao mecânico, não preenchem a inspeção.
 * O filtro é de tela: o aparelho continua logado com a conta da oficina.
 */
export type CheckupAccess = {
  role: OperatorRole;
  isMechanic: boolean;
  /** workshop_mechanics.id ligado ao acesso do mecânico (null = acesso não ligado à Equipe) */
  mechanicId: string | null;
  mechanicName: string | null;
  /** false enquanto busca o mecânico ligado ao acesso */
  ready: boolean;
  /** Pode marcar os itens da inspeção */
  canInspect: boolean;
  /** Vê valores, orçamento, envio ao cliente e aprovação */
  canCommercial: boolean;
  canDelete: boolean;
};

export function useCheckupAccess(): CheckupAccess {
  const { balcao, session } = useOperator();
  const role: OperatorRole = balcao && session ? session.role : 'gestor';
  const isMechanic = role === 'mecanico';
  const operatorId = isMechanic ? session?.operator_id ?? null : null;
  const [mech, setMech] = useState<{ op: string; id: string | null; name: string | null } | null>(null);

  useEffect(() => {
    if (!operatorId) return;
    let alive = true;
    (async () => {
      const { data: op } = await supabase.from('workshop_operators').select('mechanic_id').eq('id', operatorId).maybeSingle();
      const id = (op as { mechanic_id: string | null } | null)?.mechanic_id ?? null;
      let name: string | null = null;
      if (id) {
        const { data: m } = await supabase.from('workshop_mechanics').select('name').eq('id', id).maybeSingle();
        name = (m as { name: string } | null)?.name ?? null;
      }
      if (alive) setMech({ op: operatorId, id, name });
    })();
    return () => { alive = false; };
  }, [operatorId]);

  const resolved = isMechanic && mech?.op === operatorId ? mech : null;
  return {
    role, isMechanic,
    mechanicId: resolved?.id ?? null,
    mechanicName: resolved?.name ?? session?.name ?? null,
    ready: !isMechanic || !!resolved,
    canInspect: role === 'gestor' || role === 'mecanico',
    canCommercial: !isMechanic,
    canDelete: !isMechanic,
  };
}
