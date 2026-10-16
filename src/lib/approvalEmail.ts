import { supabase } from '@/lib/supabase';
import type { ApprovalMessage } from '@/types/database';

/**
 * Dispara o email de notificação via Edge Function send-approval-email.
 * Falha silenciosamente — se Resend não estiver configurado ou der erro,
 * o app continua funcionando (a mensagem fica no histórico de qualquer forma).
 */
export async function sendApprovalEmail(
  profileId: string, content: string, kind: ApprovalMessage['kind'],
  template?: 'approved' | 'rejected',
) {
  try {
    const { error } = await supabase.functions.invoke('send-approval-email', {
      body: { profile_id: profileId, content, kind, template },
    });
    if (error) console.warn('[send-approval-email] falhou:', error);
  } catch (e) {
    console.warn('[send-approval-email] erro:', e);
  }
}
