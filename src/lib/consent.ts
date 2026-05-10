import { supabase } from './supabase';
import { TERMS_VERSION } from '@/data/legal/termsContent';

type DocumentType = 'general' | 'mechanic' | 'workshop' | 'privacy';

/**
 * Registra consentimento do usuário aos termos.
 * Salva uma linha por documento aceito (general + role específico + privacy).
 *
 * Tenta capturar IP via API pública gratuita. Se falhar, salva sem IP
 * (a obrigação legal é o registro do aceite, não necessariamente o IP).
 */
export async function recordConsent(userId: string, role: 'mechanic' | 'workshop'): Promise<void> {
  let ip: string | null = null;
  try {
    const r = await fetch('https://api.ipify.org?format=json');
    const j = await r.json();
    ip = j?.ip ?? null;
  } catch { /* sem IP, sem problema */ }

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;

  const docs: DocumentType[] = ['general', role, 'privacy'];

  await supabase.from('consent_logs').insert(
    docs.map(d => ({
      user_id:       userId,
      terms_version: TERMS_VERSION,
      document_type: d,
      ip_address:    ip,
      user_agent:    userAgent,
    }))
  );
}
