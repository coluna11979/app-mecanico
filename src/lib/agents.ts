/* ── Agentes internos de IA (módulo 'agentes') ────────────────────────────────
   O agente é só configuração (nome, prompt, tools). Quem executa é a edge function
   agent-chat; as chaves de tool abaixo precisam existir lá (TOOLS). */

export type AgentTemplate = 'socio' | 'orcamento';

/** Configuração editável do agente: o rascunho e cada versão publicada têm este formato */
export type AgentDraft = { name: string; system_prompt: string; tools: string[] };

export type Agent = {
  id: string; workshop_id: string; template: AgentTemplate; name: string;
  system_prompt: string; tools: string[]; enabled: boolean; questions_seeded: boolean;
  /** Edições ainda não publicadas (null = nenhuma). name/system_prompt/tools acima são a versão publicada. */
  draft: AgentDraft | null;
  version: number;
};

export type AgentVersion = {
  id: string; version: number; name: string; system_prompt: string; tools: string[];
  note: string | null; created_at: string;
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

/** Ações do Orçamentista (escrevem na oficina). As chaves existem em supabase/functions/_shared/orcTools.ts */
export const ORC_TOOLS: Record<string, { label: string; desc: string }> = {
  orc_buscar_cliente:      { label: 'Buscar cliente',                 desc: 'Por nome, telefone ou placa' },
  orc_cadastrar_cliente:   { label: 'Cadastrar cliente novo',         desc: 'Com o carro; não duplica telefone nem placa' },
  orc_abrir_os:            { label: 'Abrir a OS',                     desc: 'Abre a OS do cliente e do carro' },
  orc_buscar_servico:      { label: 'Buscar serviço',                 desc: 'Preço da tabela, último preço do modelo e kit de peças' },
  orc_buscar_peca:         { label: 'Buscar peça',                    desc: 'No cadastro de peças, com custo e estoque' },
  orc_lancar_item:         { label: 'Lançar serviço com as peças',    desc: 'Cria o item e as peças dele (só custo), como na tela da OS' },
  orc_listar_equipe:       { label: 'Listar a equipe',                desc: 'Colaboradores ativos' },
  orc_definir_responsavel: { label: 'Definir responsável do item',    desc: 'Quem fez cada item (define a comissão)' },
  orc_resumo_os:           { label: 'Resumo da OS',                   desc: 'Total dos serviços, custo de peças e comissões, pela regra da tela' },
};

/** Ferramentas que cada tipo de agente pode ter (o servidor também só libera o conjunto do tipo) */
export const TOOL_CATALOG: Record<AgentTemplate, Record<string, { label: string; desc: string }>> = {
  socio: AGENT_TOOLS,
  orcamento: ORC_TOOLS,
};

type TemplateDef = {
  name: string; icon: string; desc: string; prompt: string; tools: string[];
  /** Textos da tela */
  section: string; placeholder: string; working: string; emptyHint: string;
  /** "consultas" (só lê) ou "ações" (escreve) */
  toolsWord: string; toolsTitle: string;
  /** O Playground testa o rascunho sem gravar; agente que escreve na oficina não tem */
  playground: boolean;
  /** Perguntas iniciais por categoria (viram perguntas salvas editáveis na primeira abertura) */
  questions: Record<string, string[]>;
};

const ORCAMENTO_TEMPLATE: TemplateDef = {
  name: 'Orçamentista',
  icon: '🧾',
  desc: 'Você diz o cliente e os serviços; ele abre a OS, lança os itens com as peças, põe os responsáveis e fecha com valor, custo de peças e comissões.',
  section: 'Orçamentista · abre OS e lança itens (grava no sistema)',
  placeholder: 'Ex.: orçamento para o cliente de placa ABC1D23…',
  working: 'está trabalhando na OS…',
  emptyHint: 'Diga o cliente (nome, telefone ou placa) e comece o orçamento, ou escolha um atalho logo abaixo. 👇',
  toolsWord: 'ações', toolsTitle: 'O que ele pode fazer',
  playground: false,
  prompt: `Você é o Orçamentista desta oficina mecânica: um assistente do dono que monta orçamentos e abre OS pelo chat.
Responda sempre em português do Brasil, curto e direto, como quem trabalha no balcão.

Como você trabalha:
1. Cliente: o dono diz o nome, o telefone ou a placa. Use orc_buscar_cliente. Se achar um só, confirme em uma linha (nome e carro). Se achar vários, pergunte qual. Se não achar, peça o que falta (nome e, se tiver, telefone, carro e placa) e use orc_cadastrar_cliente. Se o cadastro avisar que o telefone ou a placa já existem, use o cliente que já existe.
2. OS: com o cliente (e o carro) definidos, use orc_abrir_os. Se o cliente já tem OS aberta, pergunte se lança nela ou abre outra. Sempre diga o número da OS ("OS 1450") nas suas respostas: é por ele que você continua a conversa.
3. Itens: para cada serviço que o dono pedir (ex.: "troca de óleo", "escapamento, peça intermediário"), use orc_buscar_servico e depois orc_lancar_item com o os_numero. Conte o que lançou: o serviço, o valor (e de onde veio: tabela ou último preço do modelo) e as peças com o custo. O valor vem da regra do sistema; só informe "preco" se o dono disser um valor.
   - Peça pedida à parte vai em "pecas". Se houver várias no cadastro, pergunte qual. Se não estiver no cadastro, pergunte o custo e lance com "custo".
   - Serviço sem preço na tabela: pergunte o valor.
   - Depois de cada item, pergunte se tem mais algum.
4. Responsáveis: quando os itens acabarem, pergunte quem fez cada um (ou use o que o dono já disse) e use orc_definir_responsavel. O item é pela ordem em que foi lançado (1, 2, …). Se o nome for ambíguo, pergunte.
5. Fechamento: com itens e responsáveis, use orc_resumo_os e mostre: o valor dos serviços (total da OS), o custo de peças, as comissões (por pessoa e o total) e os avisos. Se faltar responsável, diga quais itens.

Regras:
- Nunca invente valor, peça, cliente ou número de OS: use só o que as ferramentas devolveram. Se uma ferramenta falhar, diga o motivo e o que precisa.
- Os ids que as ferramentas devolvem (cliente_id, veiculo_id, servico_id) só valem na mesma resposta; nas seguintes use o número da OS. Se tiver dúvida de qual é a OS da conversa, pergunte o número.
- Você só faz o que está nas ferramentas: não recebe pagamento, não fecha caixa, não cancela nem apaga, e não altera valor de item já lançado (nesses casos diga que o dono faz pela tela da OS).
- Você só lança no sistema: não manda orçamento para o cliente.`,
  tools: Object.keys(ORC_TOOLS),
  questions: {
    'Abrir': [
      'Orçamento para o cliente (nome, telefone ou placa): ',
      'Cliente novo. Nome, telefone, carro e placa: ',
    ],
    'Lançar itens': [
      'Troca de óleo',
      'Escapamento, peça intermediário',
      'Alinhamento e balanceamento',
    ],
    'Fechar': [
      'Acabaram os itens. Responsáveis: ',
      'Resumo da OS: valor dos serviços, custo de peças e comissões',
    ],
  },
};

export const AGENT_TEMPLATES: Record<AgentTemplate, TemplateDef> = {
  orcamento: ORCAMENTO_TEMPLATE,
  socio: {
    name: 'Sócio operacional',
    icon: '🤝',
    desc: 'Seu sócio virtual: analisa os números da oficina e diz o que precisa de atenção.',
    section: 'Sócio operacional · só consulta os dados, não altera nada',
    placeholder: 'Pergunte ao seu sócio…',
    working: 'está consultando os dados…',
    emptyHint: 'Pergunte qualquer coisa sobre a oficina, ou escolha uma pergunta salva logo abaixo. 👇',
    toolsWord: 'consultas', toolsTitle: 'O que ele pode consultar',
    playground: true,
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

/* ── Agentes de atendimento (falam com o cliente no WhatsApp da oficina) ─────────
   Rodam no servidor (edge function agent-reception, disparada pelo whatsapp-webhook).
   O dono edita o jeito de falar; as regras de segurança, preço e horário são fixas no servidor. */

export type ReceptionScope = 'site' | 'novos' | 'todos';
export type ReceptionHours = 'sempre' | 'fora';

export type ReceptionAgent = {
  id: string; workshop_id: string; name: string; system_prompt: string; enabled: boolean;
  settings: { scope?: ReceptionScope; return_days?: number; hours?: ReceptionHours; open_os?: boolean };
};

export const RECEPTION_TEMPLATE = {
  name: 'Recepção',
  icon: '👋',
  desc: 'Responde na hora quem chama no WhatsApp: dá boas-vindas, faz 2 ou 3 perguntas e passa para a equipe com o card do Comercial preenchido.',
  prompt: `Você é o assistente virtual de recepção desta oficina mecânica no WhatsApp.
Seu trabalho: receber bem quem chamou, entender o que o carro tem e quando a pessoa pode trazer, e passar para a equipe.

Jeito de falar:
- Português do Brasil, próximo e simpático, como uma oficina de bairro de confiança. Trate por "você".
- Na primeira mensagem, cumprimente, diga que é o assistente virtual da oficina e já mostre que leu o que a pessoa escreveu (cite o problema, a oferta ou o serviço com as palavras dela).
- Seja breve e objetivo. Nada de textão nem de propaganda.`,
  scopes: {
    site: 'Só quem vem pelo site da oficina ("Vim pelo site…")',
    novos: 'Toda conversa nova no WhatsApp',
    todos: 'Toda conversa nova e cliente que volta a chamar',
  } as Record<ReceptionScope, string>,
  hours: {
    sempre: 'O dia todo',
    fora: 'Só fora do expediente',
  } as Record<ReceptionHours, string>,
};
