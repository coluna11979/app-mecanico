import { supabase } from '@/lib/supabase';
import type { Job } from '@/types/database';

/**
 * Convite direto (0121): a oficina escolhe um mecânico específico e ele precisa ACEITAR.
 * O convite é uma demanda aberta endereçada a ele:
 *   status 'open' · audience 'invite' · invited_mechanic_id = convidado · mechanic_id null
 * No aceite vira 'assigned' com mechanic_id (mesmo caminho da demanda aberta) e o prazo
 * de chegada conta a partir dali. Enquanto não aceita, cancelar não tem multa.
 */

/** Depois disso sem resposta, a oficina é avisada de que pode chamar outro mecânico. */
export const INVITE_NO_REPLY_MS = 15 * 60 * 1000;

type InviteFields = Pick<Job, 'status' | 'audience' | 'mechanic_id'>;

/** Convite ainda esperando o mecânico aceitar ou recusar. */
export function isPendingInvite(j: InviteFields): boolean {
  return j.status === 'open' && j.audience === 'invite' && !j.mechanic_id;
}

/** Campos do insert de um convite direto para `mechanicId`. */
export function inviteFields(mechanicId: string) {
  return { status: 'open' as const, audience: 'invite' as const, invited_mechanic_id: mechanicId, mechanic_id: null };
}

/** Convite sem resposta há mais de INVITE_NO_REPLY_MS. */
export function inviteWaitingTooLong(j: InviteFields & Pick<Job, 'created_at'>, now = Date.now()): boolean {
  return isPendingInvite(j) && now - new Date(j.created_at).getTime() > INVITE_NO_REPLY_MS;
}

/** Mecânico recusa o convite (cancela sem multa e avisa a oficina). */
export async function declineInvite(jobId: string, reason?: string) {
  return supabase.rpc('decline_job_invite', { p_job_id: jobId, p_reason: reason?.trim() || null });
}
