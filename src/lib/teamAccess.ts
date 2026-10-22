/**
 * Quem pode ver o quê na área Equipe.
 *
 * - Dono fora do modo balcão: tudo.
 * - Gestor (modo balcão): tudo, menos editar acessos (só o dono edita, na tela de Acessos).
 * - Demais: depende das permissões extras:
 *     equipe          → Painel, Colaboradores e Desempenho (sem dados pessoais/salário/banco/documentos)
 *     folha           → Comissões e Folha (e os alertas de valores a pagar)
 *     ver_financeiro  → faturamento no Desempenho
 */
import { canDo, sessionAllows, useOperator } from '@/lib/operators';
import { moduleAllows, useWorkshopModules } from '@/lib/modules';

export function useTeamAccess() {
  const { balcao, session } = useOperator();
  const mods = useWorkshopModules();
  const isGestor = !balcao || session?.role === 'gestor';
  const can = (p: Parameters<typeof canDo>[2]) => canDo(session, balcao, p);
  const route = (to: string) => moduleAllows(mods.disabled, to) && (!balcao || (!!session && sessionAllows(session, to)));
  return {
    /** Fora do balcão (dono logado) ou gestor no balcão */
    isGestor,
    /** CPF, RG, nascimento, endereço, contatos, salário, banco, documentos */
    canSensitive: isGestor,
    /** Faturamento gerado por colaborador */
    canRevenue: can('ver_financeiro'),
    /** Comissões, folha e valores a pagar */
    canPay: can('folha') && route('/oficina/comissoes'),
    /** Problemas de acesso/permissão (só quem administra acessos) */
    canAccessAlerts: isGestor && route('/oficina/acessos'),
    route,
  };
}
