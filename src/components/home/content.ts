/**
 * Conteúdo editável da home. Números e depoimentos ficam aqui de propósito:
 * nada inventado vai pro ar. Enquanto um valor for `null`, a home mostra os
 * fatos verificáveis no lugar (e, só em dev, um placeholder sinalizado).
 */

export interface Metric {
  /** Valor real, já formatado (ex.: "1.240"). `null` = ainda não temos o dado. */
  value: string | null;
  label: string;
}

/** TODO(dados reais): preencher com números do banco antes de publicar. */
export const METRICS: Metric[] = [
  { value: null, label: 'oficinas cadastradas' },
  { value: null, label: 'profissionais verificados' },
  { value: null, label: 'serviços realizados' },
  { value: null, label: 'avaliação média' },
];

/** Fatos verdadeiros hoje — aparecem enquanto METRICS não tiver dados. */
export const FACTS: { title: string; desc: string }[] = [
  { title: 'Cadastro gratuito', desc: 'Sem mensalidade para oficina nem para mecânico.' },
  { title: 'Análise de cada cadastro', desc: 'Nossa equipe revisa todo perfil antes de liberar.' },
  { title: 'Avaliação a cada serviço', desc: 'Reputação construída trabalho a trabalho.' },
  { title: 'Sem disputa por vaga', desc: 'Sem leilão de preço entre profissionais.' },
];

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  side: 'oficina' | 'mecanico';
}

/**
 * TODO(depoimentos reais): só entram com autorização por escrito de quem falou.
 * Vazio = a home mostra o convite "primeiras oficinas" no lugar.
 */
export const TESTIMONIALS: Testimonial[] = [];

/** Estrutura de exemplo — renderizada SÓ em dev, com selo de placeholder. */
export const TESTIMONIAL_PLACEHOLDERS: Testimonial[] = [
  { side: 'oficina', name: 'Nome do responsável', role: 'Oficina · Cidade/UF',
    quote: 'Depoimento real sobre um dia em que faltou mão de obra e o serviço foi entregue mesmo assim.' },
  { side: 'mecanico', name: 'Nome do mecânico', role: 'Especialidade · Cidade/UF',
    quote: 'Depoimento real sobre usar a plataforma nas folgas e voltar a trabalhar com a mesma oficina.' },
  { side: 'oficina', name: 'Nome do responsável', role: 'Centro automotivo · Cidade/UF',
    quote: 'Depoimento real sobre montar a própria lista de profissionais preferidos.' },
];

export const FAQ: { q: string; a: string }[] = [
  { q: 'O MecânicoApp substitui a minha equipe?',
    a: 'Não. Sua equipe continua sendo a base da oficina. O MecânicoApp entra quando você precisa de reforço: alguém faltou, o pátio encheu ou chegou um serviço fora da especialidade do time.' },
  { q: 'Como sei quem vai entrar na minha oficina?',
    a: 'Antes de confirmar, você vê o perfil do profissional: especialidades, histórico na plataforma e avaliações de outras oficinas. Cada cadastro passa por análise da nossa equipe antes de ser liberado.' },
  { q: 'Os mecânicos disputam o serviço entre si?',
    a: 'Não. A oficina publica a demanda, o profissional disponível aceita e a oficina confirma. Ou a oficina chama direto um profissional que já está nos preferidos. Não existe leilão de preço.' },
  { q: 'Quanto custa?',
    a: 'O cadastro é gratuito e não tem mensalidade. A plataforma só cobra quando um serviço é realizado, e os valores aparecem antes de qualquer confirmação.' },
  { q: 'Como funciona o pagamento?',
    a: 'O pagamento do serviço é feito pela plataforma. O mecânico recebe depois que a oficina confirma a conclusão, e tudo fica registrado no histórico dos dois lados.' },
  { q: 'Posso ser mecânico na plataforma tendo carteira assinada?',
    a: 'Pode. Muitos profissionais usam nas folgas, aos sábados ou no contraturno. Vale só conferir se o seu contrato tem cláusula de exclusividade.' },
  { q: 'Preciso ter ferramenta ou espaço próprio?',
    a: 'Não. O serviço é feito na oficina, com a estrutura dela. O mecânico entra com a mão de obra e o conhecimento.' },
  { q: 'O sistema de gestão é obrigatório?',
    a: 'Não. Você pode começar só chamando profissionais e adotar ordens de serviço, clientes, veículos e agenda no seu ritmo.' },
];
