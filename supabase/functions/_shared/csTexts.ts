// Textos padrão do agente de CS e o preenchimento das variáveis.
// ATENÇÃO: os mesmos textos padrão existem em src/lib/agents.ts (CS_DEFAULTS) para a tela de edição.
export const CS_DEFAULTS = {
  welcome_text: 'Olá, {nome}! 👋 Aqui é da {oficina}.\nRecebemos o seu {carro} (OS {os}) e já estamos cuidando dele. Qualquer novidade avisamos por aqui. Obrigado pela confiança! 🔧',
  post_text: 'Olá, {nome}! Aqui é da {oficina}. Já faz um tempinho que entregamos o seu {carro}, e esperamos que esteja tudo certo! 🙏\nSe puder, conte como foi a sua experiência. Leva menos de 1 minuto e ajuda muito a gente: {link_avaliacao}',
  post_text_sem_link: 'Olá, {nome}! Aqui é da {oficina}. Já faz um tempinho que entregamos o seu {carro}, e esperamos que esteja tudo certo! 🙏\nSe tiver qualquer dúvida ou ajuste, é só responder por aqui.',
  oil_text: 'Como você fez a troca de óleo, quando estiver chegando a hora da próxima a gente te lembra por aqui. 😉',
};

const firstName = (full: string | null | undefined) => {
  const n = (full ?? '').trim().split(/\s+/)[0] ?? '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : 'tudo bem';
};

export function renderCs(
  tpl: string,
  v: { cust: string | null | undefined; carro: string; os: number | string | null | undefined; oficina: string | null | undefined; link: string | null },
) {
  return tpl
    .replaceAll('{nome}', firstName(v.cust))
    .replaceAll('{carro}', v.carro)
    .replaceAll('{os}', v.os != null ? String(v.os) : '')
    .replaceAll('{oficina}', (v.oficina ?? 'nossa oficina').trim())
    .replaceAll('{link_avaliacao}', v.link ?? '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
