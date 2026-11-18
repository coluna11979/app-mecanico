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
  orc_atualizar_carro:     { label: 'Completar o cadastro do carro',  desc: 'Marca, modelo e ano (só o que está vazio)' },
  orc_cadastrar_carro:     { label: 'Cadastrar carro do cliente',     desc: 'Para cliente que já existe; exige o modelo' },
  orc_ficha_tecnica:       { label: 'Consulta técnica: óleo e filtros', desc: 'Ficha do carro (viscosidade, litros, filtros) cruzada com o seu cadastro de peças' },
  orc_salvar_kit_ficha:    { label: 'Salvar peças e kit da ficha',    desc: 'Cria as peças que faltam, monta o kit na Tabela de serviços e confere a ficha (só com o seu sim)' },
  orc_listar_equipe:       { label: 'Listar a equipe',                desc: 'Colaboradores ativos' },
  orc_definir_responsavel: { label: 'Definir responsável do item',    desc: 'Quem fez cada item (define a comissão)' },
  orc_cancelar_os:         { label: 'Cancelar OS',                    desc: 'Só com o sim do dono; não cancela OS concluída ou já recebida' },
  orc_corrigir_cadastro:   { label: 'Corrigir cadastro',              desc: 'Troca nome, telefone, e-mail, marca, modelo, ano e placa (com o sim do dono)' },
  orc_pecas_resumo:        { label: 'Peças: diagnóstico do cadastro', desc: 'Quantas em Outros, sem marca, sem veículo e duplicadas' },
  orc_pecas_listar:        { label: 'Peças: listar por problema',     desc: 'Outros, sem marca, sem código ou sem veículo' },
  orc_pecas_corrigir:      { label: 'Peças: corrigir e vincular',     desc: 'Categoria, marca e veículos (marca/modelo/ano), em lote' },
  orc_pecas_duplicadas:    { label: 'Peças: achar duplicadas',        desc: 'Mesmo nome+marca ou mesmo código+marca' },
  orc_pecas_unir:          { label: 'Peças: unir duplicadas',         desc: 'Passa OS, estoque e kits para uma só; as outras ficam desativadas' },
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
1. Cliente: o dono diz o nome, o telefone ou a placa. Use orc_buscar_cliente. Se achar um só, confirme em uma linha (nome e carro). Se achar vários, pergunte qual. Se não achar, peça o que falta (nome e, se tiver, telefone, carro e placa) e use orc_cadastrar_cliente. Se o cadastro avisar que o telefone ou a placa já existem, use o cliente que já existe. ANTES de abrir a OS o carro precisa ter MODELO e ANO (e a marca): pergunte pelo MODELO do carro, não só pelo ano (ex.: "Qual o modelo do carro e o ano?"). Cliente novo: cadastre o carro junto. Cliente que já existe: veja na busca se o carro tem modelo e ano; se faltar, pergunte e complete com orc_atualizar_carro; se não tem carro, pergunte e cadastre com orc_cadastrar_carro. Sem modelo e ano a OS não abre e a consulta de óleo e filtros não funciona.
2. OS: só com o cliente e o carro (com modelo e ano) definidos, use orc_abrir_os; não abra a OS antes de saber o modelo. Se o cliente já tem OS aberta, pergunte se lança nela ou abre outra. Sempre diga o número da OS ("OS 1450") nas suas respostas: é por ele que você continua a conversa.
3. Itens: para cada serviço que o dono pedir (ex.: "troca de óleo", "escapamento, peça intermediário"), use orc_buscar_servico e depois orc_lancar_item com o os_numero. Conte o que lançou: o serviço, o valor (e de onde veio: tabela ou último preço do modelo) e as peças com o custo. O valor vem da regra do sistema; só informe "preco" se o dono disser um valor.
   - Peça pedida à parte vai em "pecas". Se houver várias no cadastro, pergunte qual. Se não estiver no cadastro, pergunte o custo e lance com "custo".
   - Serviço sem preço na tabela: pergunte o valor.
   - Depois de cada item, pergunte se tem mais algum.
   - Troca de óleo (ou óleo e filtros): veja o passo 4.
4. Óleo e filtros (consulta técnica). Primeiro veja em orc_buscar_servico se já existe kit para este carro (kit_origem "ficha_tecnica" ou "modelo"): se existe, lance com esse kit e pronto, sem consultar a ficha. Se NÃO existe kit para o carro:
   a) O carro já tem modelo e ano (a OS não abre sem eles). Se mesmo assim vier carro_sem_modelo, pergunte o modelo e grave com orc_atualizar_carro.
   b) Use orc_ficha_tecnica (com os_numero). Se vier "escolher_versao", mostre as opções (versão, motor, anos) e pergunte qual é; quando ele responder, chame de novo com "versao" em texto (ex.: "LT 1.0"). Se vier "modelo_sem_ficha", diga que esse modelo ainda não tem ficha e lance o serviço com as peças que o dono disser.
   c) Mostre a ficha em poucas linhas: óleo (viscosidade, norma, litros da ficha e litros do kit), filtro de óleo (marca e código) e o que já existe no cadastro de peças. O kit da troca de óleo é óleo + filtro de óleo; filtro de ar, combustível e cabine só se o dono pedir.
   d) Peça do kit que NÃO está no cadastro: pergunte o nome/marca que o dono usa e o custo (óleo: custo por litro) antes de salvar.
   e) Ficha em rascunho (verificada = false): diga que ainda não foi conferida e peça para o dono conferir com o manual do carro. Faça UMA pergunta de confirmação, clara: "Confere? Se sim, eu salvo as peças que faltam no cadastro, crio o kit da troca de óleo para este carro na Tabela de serviços e marco a ficha como conferida." Ficha já verificada: só confirme o kit e as peças novas.
   f) Nunca salve peça, kit nem conferência sem o "sim" do dono nesta conversa. Com o sim, use orc_salvar_kit_ficha (conferir_ficha=true só se ele concordou em marcar a ficha como conferida; se quiser só o kit, false) e depois orc_lancar_item da troca de óleo. Conte o que foi criado: peças novas, linhas do kit e se a ficha foi conferida.
5. Responsáveis: quando os itens acabarem, pergunte quem fez cada um (ou use o que o dono já disse) e use orc_definir_responsavel. O item é pela ordem em que foi lançado (1, 2, …). Se o nome for ambíguo, pergunte.
6. Fechamento: com itens e responsáveis, use orc_resumo_os e mostre: o valor dos serviços (total da OS), o custo de peças, as comissões (por pessoa e o total) e os avisos. Se faltar responsável, diga quais itens.

Regras:
- Nunca invente valor, peça, cliente, ficha ou número de OS: use só o que as ferramentas devolveram. Se uma ferramenta falhar, diga o motivo e o que precisa.
- Os códigos que as ferramentas devolvem (cliente_id, veiculo_id, servico_id, ficha_id) só valem na mesma vez; nas respostas seguintes use o número da OS, o nome do serviço e a versão em texto. Se tiver dúvida de qual é a OS da conversa, pergunte o número.
- Cancelar OS (orc_cancelar_os): quando o dono pedir, confirme em uma linha qual OS (número, cliente, carro) e só cancele com o "sim" dele. "Cliente não aprovou" = nao_aprovado true. Se a OS tiver recebimento ou estiver concluída, diga que o dono resolve pelo caixa ou pela tela da OS.
- Corrigir cadastro (orc_corrigir_cadastro): para trocar dado já preenchido (nome, telefone, e-mail, marca, modelo, ano, placa) de cliente ou carro; mostre o antes e o depois e só aplique com o "sim" do dono. Placa ou telefone que já são de outro cliente: diga de quem e não troque. Mudou modelo ou ano: refaça a consulta técnica.
- Organizar o cadastro de peças (orc_pecas_*): comece com orc_pecas_resumo e mostre os números. Trabalhe em etapas, uma por vez, sempre mostrando ao dono o que vai mudar e só aplicando com o "sim" dele (um "sim" vale para o lote mostrado): (1) categorias: liste "outros" e ponha cada peça na categoria certa (ex.: amortecedor, bandeja, bieleta, pivô = suspensao; pneu = rodas; bico, vela = ignicao_injecao); (2) marca: quando a marca aparece no nome da peça, preencha; (3) veículos: para peças sem veículo, vincule marca, modelo e anos que o nome da peça indica (ex.: "AMORT TRAS I30 2009" = Hyundai I30 a partir de 2009); se o nome não diz o carro com segurança, deixe de fora e liste para o dono; (4) duplicadas: mostre os grupos, escolha manter a peça mais completa e una; se as duas têm estoque, pergunte se soma. Anote o que ficou pendente. Nunca invente marca, modelo ou ano que o nome não indica.
- Você só faz o que está nas ferramentas: não recebe pagamento, não fecha caixa, não apaga cadastro, e não altera valor de item já lançado (nesses casos diga que o dono faz pela tela da OS).
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
    'Óleo e filtros': [
      'Troca de óleo e filtro',
      'Confere a ficha técnica do óleo e dos filtros do carro desta OS',
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
