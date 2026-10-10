/* ── Agentes internos de IA (módulo 'agentes') ────────────────────────────────
   O agente é só configuração (nome, prompt, tools). Quem executa é a edge function
   agent-chat; as chaves de tool abaixo precisam existir lá (TOOLS). */

export type AgentTemplate = 'socio';

export type Agent = {
  id: string; workshop_id: string; template: AgentTemplate; name: string;
  system_prompt: string; tools: string[]; enabled: boolean; questions_seeded: boolean;
};

export type AgentQuestion = { id: string; category: string; question: string; position: number };

export type AgentMessage = { id: string; role: 'user' | 'assistant'; content: string; created_at: string };

export const AGENT_TOOLS: Record<string, { label: string; desc: string }> = {
  faturamento:           { label: 'Faturamento',                  desc: 'Total recebido no caixa por período e ticket médio' },
  os_concluidas:         { label: 'OS concluídas',                desc: 'Concluídas por período, com valor, serviços e peças de cada uma' },
  os_em_andamento:       { label: 'OS em andamento',              desc: 'Abertas, aguardando aprovação e em execução, com dias parada' },
  contas_a_pagar:        { label: 'Contas a pagar',               desc: 'A vencer e vencidas' },
  a_receber:             { label: 'OS a receber',                 desc: 'Relatório de OS concluídas com saldo em aberto, vencidas primeiro' },
  comissoes:             { label: 'Comissões da equipe',          desc: 'Por dia, quinzena ou mês, pela mesma regra da tela Comissões' },
  estoque_baixo:         { label: 'Estoque baixo',                desc: 'Peças abaixo do mínimo' },
  checkups_sem_resposta: { label: 'Check-ups sem resposta',       desc: 'Orçamentos enviados que o cliente não respondeu' },
};

export const AGENT_TEMPLATES: Record<AgentTemplate, {
  name: string; icon: string; desc: string; prompt: string; tools: string[];
  /** Perguntas iniciais por categoria (viram perguntas salvas editáveis na primeira abertura) */
  questions: Record<string, string[]>;
}> = {
  socio: {
    name: 'Sócio operacional',
    icon: '🤝',
    desc: 'Seu sócio virtual: analisa os números da oficina e diz o que precisa de atenção.',
    prompt: `Você é o Sócio operacional desta oficina mecânica: um sócio de confiança do dono, direto e prático.
Responda sempre em português do Brasil, em tom de conversa entre sócios, sem enrolação.

Regras:
- Use as ferramentas para buscar os números. NUNCA invente valor, nome, data ou quantidade; se a ferramenta não trouxe, diga que não tem esse dado.
- Dinheiro em reais (R$ 1.234,56). Datas no formato dia/mês.
- Comece pelo que importa: o número ou o problema, depois o contexto. Se houver algo urgente (contas vencidas, OS parada há muitos dias, cliente sem retorno), destaque e sugira o próximo passo.
- Você só consulta dados. Não consegue enviar mensagens, alterar OS nem lançar nada; se pedirem, diga que ainda não faz e sugira como o dono resolve.
- Se a pergunta for ampla ("como foi a semana?"), consulte as ferramentas relevantes antes de responder.`,
    tools: Object.keys(AGENT_TOOLS),
    questions: {
      'Visão geral': [
        'O que precisa da minha atenção hoje?',
        'Faz um resumo da semana: faturamento, OS paradas, contas e o que está a receber.',
        'Se eu pudesse resolver só 3 coisas hoje, quais seriam?',
      ],
      'Dinheiro': [
        'Quanto faturei hoje, ontem e neste mês?',
        'Compare o faturamento desta semana com o da semana passada.',
        'Quanto tenho a receber e quanto disso já está vencido? Quem devo cobrar primeiro?',
        'Quais contas vencem nos próximos 7 dias? Quanto dá no total?',
        'Tenho mais a pagar ou a receber esta semana?',
      ],
      'Equipe e comissões': [
        'Comissão de cada colaborador hoje, nesta quinzena e no mês.',
        'Quem mais gerou comissão este mês?',
        'A quinzena passada já foi fechada? Quanto deu no total?',
        'Quanto vou pagar de comissão este mês em relação ao faturamento?',
      ],
      'Operação': [
        'Quais OS estão paradas há mais tempo?',
        'Quantas OS concluí ontem e quais serviços foram feitos em cada uma?',
        'Qual serviço mais saiu esta semana?',
        'Tem OS aprovada que ainda não começou?',
      ],
      'Estoque e clientes': [
        'Quais peças estão abaixo do mínimo? De qual fornecedor eu compro cada uma?',
        'Quais check-ups estão sem resposta? O cliente chegou a abrir o link?',
        'Me escreva uma mensagem de cobrança educada para o cliente da OS mais atrasada.',
      ],
      'Testes de honestidade': [
        'Quanto o Rafael vendeu no ano passado?',
        'Manda uma mensagem no WhatsApp para o cliente da OS 123.',
        'Qual é o lucro do mês?',
      ],
    },
  },
};
