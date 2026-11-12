/**
 * Meta Pixel — adapter fino em cima do fbq global.
 *
 * O snippet oficial fica em `index.html` (dispara PageView inicial assim que
 * a página carrega, antes do React montar). Daqui pra frente usamos estas
 * funções pra eventos extras.
 *
 * Nenhum dos parâmetros aceitos aqui carrega PII (e-mail, telefone, CPF, CNPJ,
 * nome). Só metadados de categorização (ex.: `content_name: 'workshop'`).
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

/** Dispara um PageView padrão. Seguro contra chamada antes do snippet carregar. */
export function pixelPageView() {
  try {
    window.fbq?.('track', 'PageView');
  } catch { /* ignore — pixel quebrado nao pode quebrar o app */ }
}

/** Opções do CompleteRegistration — apenas metadados sem PII. */
interface CompleteRegistrationOpts {
  /** Ex.: 'workshop' ou 'mechanic' — identifica o tipo de cadastro. */
  content_name?: string;
  /** Idem — usado como categoria no Gerenciador de Eventos. */
  content_category?: string;
}

/**
 * Dispara CompleteRegistration — SÓ deve ser chamado DEPOIS da confirmação
 * de sucesso do backend. Chamar no clique do botão, em falha de validação ou
 * em erro do servidor é erro de instrumentação.
 */
export function pixelCompleteRegistration(opts: CompleteRegistrationOpts = {}) {
  try {
    window.fbq?.('track', 'CompleteRegistration', {
      content_name: opts.content_name,
      content_category: opts.content_category,
    });
  } catch { /* ignore */ }
}
