/**
 * Acesso equipe — login/senha do colaborador.
 *
 * O colaborador só digita um LOGIN (usuário) + senha. Por baixo, cada login vira
 * um e-mail sintético determinístico (nunca recebe mensagem) usado no
 * supabase.auth. O saneamento e o domínio aqui PRECISAM bater com os da função
 * de borda operator-set-login (supabase/functions/operator-set-login/index.ts).
 */

const EMAIL_DOMAIN = 'equipe.mecanicoapp.app';

/** minúsculas, sem espaço, só [a-z0-9._-]; usado pra gerar o e-mail e pra exibir o login salvo */
export function sanitizeLogin(raw: string): string {
  return String(raw).trim().toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '');
}

export const deriveTeamEmail = (login: string) => `${sanitizeLogin(login)}@${EMAIL_DOMAIN}`;
