/**
 * Guia para criar as ilustrações da marca no ChatGPT: um texto de estilo fixo
 * (pra todas saírem com a mesma cara) + a lista de cenas com o nome e os temas
 * que cada uma recebe na Biblioteca de ilustrações.
 */

export const STYLE_PROMPT = `Crie uma ilustração editorial plana (flat), no estilo de app de tecnologia moderno.

ESTILO (mantenha igual em todas as imagens desta conversa):
- Formas simples e chapadas, sem contorno preto, sombras suaves em blocos de cor, leve textura granulada.
- Paleta limitada: laranja vivo #FF5C0A como cor de destaque, grafite #0B1117 e azul-petróleo escuro nas sombras, cinza-claro #F5F7FA e tons de pele quentes e variados.
- Pessoas brasileiras, diversas, proporções realistas, expressões naturais e simpáticas.
- Ambientes atuais: oficina mecânica moderna, limpa e organizada, carros recentes.
- Enquadramento com bastante respiro, composição de cinema, luz de fim de tarde.
- Formato horizontal 3:2 (1536 x 1024).

PROIBIDO: qualquer texto, letra, número, logotipo ou marca de carro visível; aparência 3D ou foto realista; estilo infantil ou cartoon exagerado.

CENA: `;

/**
 * Reforço curto que vai NO COMEÇO de cada cena: sem ele o ChatGPT tende a fazer
 * foto realista quando a cena descreve um ambiente real.
 */
export const SCENE_PREFIX = 'ILUSTRAÇÃO vetorial plana (flat illustration) estilo editorial de app, NÃO é foto e NÃO é 3D: formas chapadas, cores sólidas, sombras em blocos, sem detalhes realistas. Paleta: laranja #FF5C0A, grafite #0B1117, azul-petróleo escuro, cinza-claro e tons de pele quentes. Sem nenhum texto, letra, número, logo ou marca (carros sem emblema, roupas lisas). Formato horizontal 3:2. CENA: ';

export const sceneText = (scene: string) => SCENE_PREFIX + scene;

export interface Scene { slug: string; title: string; audience: 'workshop' | 'mechanic' | 'all'; tags: string[]; scene: string }

export const SCENES: Scene[] = [
  // Oficinas
  { slug: 'oficina-movimentada', title: 'Oficina movimentada', audience: 'workshop', tags: ['oficina', 'pico', 'agenda', 'gestao', 'equipe'],
    scene: 'Oficina moderna movimentada: dois mecânicos de macacão trabalhando em carros no elevador, e o dono da oficina de pé olhando um tablet.' },
  { slug: 'dono-agenda', title: 'Dono olhando a agenda', audience: 'workshop', tags: ['agenda', 'organizacao', 'gestao', 'sabado', 'pico'],
    scene: 'Dono de oficina no balcão de atendimento, olhando a agenda no tablet com expressão concentrada; ao fundo, pátio com vários carros esperando.' },
  { slug: 'orcamento-celular', title: 'Orçamento pelo celular', audience: 'workshop', tags: ['orcamento', 'atendimento', 'cliente', 'whatsapp'],
    scene: 'Mecânico mostrando no celular as fotos do problema do carro para uma cliente sorridente, os dois ao lado do carro com o capô aberto.' },
  { slug: 'recepcao-carro', title: 'Recepção do carro', audience: 'workshop', tags: ['recepcao', 'checklist', 'atendimento', 'cliente'],
    scene: 'Atendente da oficina fotografando a lateral de um carro na entrada, segurando uma prancheta, com o cliente observando.' },
  { slug: 'reforco-chegando', title: 'Reforço chegando', audience: 'workshop', tags: ['reforco', 'mao-de-obra', 'equipe', 'falta', 'contratacao'],
    scene: 'Mecânico chegando à oficina com uma caixa de ferramentas e sendo recebido pelo dono com um aperto de mão, carros no elevador ao fundo.' },
  { slug: 'cliente-retirando', title: 'Cliente satisfeito', audience: 'workshop', tags: ['cliente', 'atendimento', 'fidelizar', 'entrega'],
    scene: 'Cliente feliz recebendo a chave do carro pronto no balcão da oficina, o atendente sorrindo, carro limpo e brilhando atrás.' },
  { slug: 'fila-de-carros', title: 'Fila na porta', audience: 'workshop', tags: ['pico', 'sabado', 'fila', 'agenda'],
    scene: 'Vista da frente de uma oficina moderna com uma fila de carros esperando na porta, mecânicos trabalhando lá dentro, relógio grande na parede.' },
  { slug: 'dono-escritorio', title: 'Gestão no escritório', audience: 'workshop', tags: ['gestao', 'custos', 'financeiro', 'clt'],
    scene: 'Dono de oficina no pequeno escritório da oficina, com notebook mostrando gráficos simples sem números, café na mesa, janela de vidro para a oficina.' },
  // Mecânicos
  { slug: 'mecanico-notificacao', title: 'Novo chamado no celular', audience: 'mechanic', tags: ['chamado', 'app', 'renda', 'novidade'],
    scene: 'Mecânico de macacão olhando o celular e sorrindo ao receber uma notificação (tela sem texto), encostado na bancada de ferramentas.' },
  { slug: 'mecanico-motor', title: 'Mecânico no motor', audience: 'mechanic', tags: ['tecnica', 'servico', 'motor', 'diagnostico'],
    scene: 'Mecânico concentrado trabalhando no motor de um carro com uma lanterna de cabeça, luz quente iluminando o rosto.' },
  { slug: 'mecanico-a-caminho', title: 'A caminho do serviço', audience: 'mechanic', tags: ['renda', 'chamado', 'horario-livre', 'deslocamento'],
    scene: 'Mecânico caminhando com a caixa de ferramentas em uma rua de bairro ao fim da tarde, indo para uma oficina parceira.' },
  { slug: 'ferramentas-organizadas', title: 'Ferramentas organizadas', audience: 'mechanic', tags: ['ferramentas', 'organizacao', 'cuidado'],
    scene: 'Close de uma maleta de ferramentas aberta e muito organizada sobre a bancada, mãos de mecânico pegando uma chave.' },
  { slug: 'mecanico-scanner', title: 'Diagnóstico com scanner', audience: 'mechanic', tags: ['diagnostico', 'tecnica', 'scanner'],
    scene: 'Mecânico sentado ao lado do carro usando um scanner de diagnóstico conectado ao painel, tablet na mão (tela sem texto).' },
  { slug: 'fim-de-expediente', title: 'Renda extra', audience: 'mechanic', tags: ['renda', 'renda-extra', 'horario-livre', 'ganhar-mais'],
    scene: 'Mecânico no fim do dia limpando as mãos com um pano, satisfeito, olhando o celular; céu laranja de pôr do sol pela porta da oficina.' },
  { slug: 'avaliacao-estrelas', title: 'Bem avaliado', audience: 'mechanic', tags: ['avaliacao', 'reputacao', 'confianca'],
    scene: 'Dono de oficina segurando o celular com cinco estrelas grandes na tela (só as estrelas, sem texto), mecânico ao lado sorrindo.' },
  { slug: 'mecanica-pneu', title: 'Mecânica trocando pneu', audience: 'mechanic', tags: ['tecnica', 'servico', 'pneu', 'diversidade'],
    scene: 'Mecânica (mulher) trocando o pneu de um carro no elevador, com a parafusadeira na mão, postura confiante.' },
  // Gerais
  { slug: 'aperto-de-maos', title: 'Parceria', audience: 'all', tags: ['parceria', 'rede', 'confianca', 'cadastro'],
    scene: 'Dono de oficina e mecânico apertando as mãos em frente a uma oficina moderna, ambos sorrindo.' },
  { slug: 'mapa-regiao', title: 'Na sua região', audience: 'all', tags: ['regiao', 'mapa', 'perto', 'lancamento'],
    scene: 'Mapa estilizado de um bairro visto de cima, com vários pinos laranja marcando oficinas, um carro e uma pessoa com caixa de ferramentas nas ruas.' },
  { slug: 'seguranca-epi', title: 'Segurança no trabalho', audience: 'all', tags: ['seguranca', 'epi', 'tecnica'],
    scene: 'Mecânico de luvas, óculos de proteção e botina trabalhando embaixo de um carro no elevador, ambiente limpo e sinalizado (sem texto).' },
  { slug: 'troca-de-oleo', title: 'Troca de óleo', audience: 'all', tags: ['servico', 'revisao', 'oleo', 'dicas'],
    scene: 'Close de mecânico fazendo troca de óleo, funil e galão de óleo sem rótulo, carro no elevador.' },
  { slug: 'freios', title: 'Freios', audience: 'all', tags: ['freio', 'tecnica', 'seguranca', 'servico'],
    scene: 'Close de mãos de mecânico trocando a pastilha de freio de uma roda de carro moderno.' },
  { slug: 'app-lancamento', title: 'Lançamento do app', audience: 'all', tags: ['lancamento', 'novidade', 'app'],
    scene: 'Mão segurando um celular com uma tela laranja sem texto, confetes laranja e grafite voando ao redor, oficina desfocada ao fundo.' },
  { slug: 'autopecas-balcao', title: 'Autopeças parceira', audience: 'all', tags: ['parceiros', 'autopecas', 'desconto', 'beneficios'],
    scene: 'Balcão de uma loja de autopeças moderna, atendente entregando uma caixa de peça para um mecânico, prateleiras organizadas ao fundo (sem texto).' },
  { slug: 'equipe-reunida', title: 'Equipe da oficina', audience: 'workshop', tags: ['equipe', 'contratacao', 'treinamento', 'gestao'],
    scene: 'Equipe de quatro mecânicos diversos reunida em roda na oficina, o dono explicando algo com um tablet na mão, clima positivo.' },
];

export const GENERATION_TIPS = [
  'Crie um Projeto no ChatGPT ("Ilustrações MecânicoApp") e cole o texto de estilo nas instruções do projeto.',
  'Para cada cena, abra uma conversa dentro do projeto e cole o texto do botão Copiar (ele já começa reforçando que é ilustração, não foto).',
  'Uma cena por mensagem. Se vier foto, 3D, texto ou logo, peça: "Refaça como ilustração plana (flat), sem nenhum texto ou logo".',
  'Quando 2 ou 3 ficarem do jeito certo, adicione essas imagens aos arquivos do projeto como referência de estilo.',
  'Baixe cada imagem e suba aqui com o nome da cena (o nome do arquivo já preenche os temas).',
];
