/* =====================================================================
   Dados das duas lojas — tudo que é editável fica aqui.
   As mensagens do WhatsApp começam com "Vim pelo site": o Inbox usa isso
   para marcar a origem "Site" no CRM. Não remover.
   ===================================================================== */

export type Loja = {
  id: 'jotacar' | 'jcpneus';
  nome: string;
  apelido: string;
  numero: string;
  endereco: string;
  bairro: string;
  cep: string;
  whatsapp: string; // país + DDD + número, só dígitos
  telefone: string;
  foco: string;
  /** Linhas de horário; vazio = "Consulte pelo WhatsApp" */
  horarios: { dias: string; horas: string }[];
  google: { nota: string; avaliacoes: number; link: string };
  rota: string;
  mapa: string;
  foto?: string;
  /** true = imagem tratada/gerada, não foto real da loja */
  fotoIlustrativa?: boolean;
};

export const LOJAS: Loja[] = [
  {
    id: 'jotacar',
    nome: 'Jota Car Serviços Automotivo',
    apelido: 'Jota Car',
    numero: '9000',
    endereco: "Estrada do M'Boi Mirim, 9000",
    bairro: 'Parque Universitário Espírita',
    cep: '04945-046',
    whatsapp: '5511934182002',
    telefone: '(11) 93418-2002',
    foco: 'Mecânica geral, injeção eletrônica, troca de óleo, alinhamento e cambagem',
    horarios: [
      { dias: 'Segunda a sexta', horas: '8h às 18h' },
      { dias: 'Sábado', horas: '8h às 14h' },
    ],
    google: { nota: '5,0', avaliacoes: 9, link: 'https://www.google.com/maps/search/?api=1&query=Jota+Car+Servi%C3%A7os+Automotivo+Estrada+do+M%27Boi+Mirim+9000' },
    rota: 'https://www.google.com/maps/dir/?api=1&destination=Jota+Car+Servi%C3%A7os+Automotivo%2C+Estrada+do+M%27Boi+Mirim%2C+9000%2C+S%C3%A3o+Paulo+-+SP',
    mapa: 'https://www.google.com/maps?q=Jota+Car+Servi%C3%A7os+Automotivo,+Estrada+do+M%27Boi+Mirim,+9000,+S%C3%A3o+Paulo&output=embed',
    foto: '/sites/jc/fotos/jotacar-fachada.webp',
  },
  {
    id: 'jcpneus',
    nome: 'JC Pneus Centro Automotivo',
    apelido: 'JC Pneus',
    numero: '10003',
    endereco: "Estrada do M'Boi Mirim, 10003",
    bairro: 'Parque Universitário Espírita',
    cep: '04945-043',
    whatsapp: '5511971972132', // (11) 97197-2132 do Google — CONFIRMAR que é WhatsApp
    telefone: '(11) 97197-2132',
    foco: 'Pneus, suspensão, freios, bateria, elétrica e diagnóstico de motor',
    horarios: [
      { dias: 'Segunda a sexta', horas: '8h às 18h' },
      { dias: 'Sábado', horas: '8h às 14h' },
    ],
    google: { nota: '4,0', avaliacoes: 49, link: 'https://www.google.com/maps/search/?api=1&query=JC+Pneus+Estrada+do+M%27Boi+Mirim+10003' },
    rota: 'https://www.google.com/maps/dir/?api=1&destination=JC+Pneus%2C+Estrada+do+M%27Boi+Mirim%2C+10003%2C+S%C3%A3o+Paulo+-+SP',
    mapa: 'https://www.google.com/maps?q=JC+Pneus,+Estrada+do+M%27Boi+Mirim,+10003,+S%C3%A3o+Paulo&output=embed',
    // nº da placa (16.003) e WhatsApp da placa (97195-2189) desfocados: não batem com os dados reais
    foto: '/sites/jc/fotos/jcpneus-fachada.webp',
    fotoIlustrativa: true,
  },
];

export const GRUPO = {
  anos: 25, // JC Pneus no mercado
  razaoSocial: 'Jairo Costa Pneus LTDA',
  cnpj: '50.726.597/0001-24',
  instagram: 'https://www.instagram.com/jotacar9000/',
};

export const SERVICOS = [
  { id: 'revisao', titulo: 'Revisão completa', texto: 'Check-up dos itens de segurança e desgaste para rodar tranquilo no dia a dia e na estrada.', icon: 'clip' },
  { id: 'oleo', titulo: 'Troca de óleo e filtros', texto: 'Óleo e filtros no prazo certo para proteger o motor e evitar gasto maior lá na frente.', icon: 'oil' },
  { id: 'freios', titulo: 'Freios', texto: 'Pastilhas, discos, lonas e fluido. Freio em dia é segurança para quem vai dentro do carro.', icon: 'brake' },
  { id: 'suspensao', titulo: 'Suspensão e direção', texto: 'Amortecedores, bandejas, buchas, pivôs e terminais para estabilidade nas curvas.', icon: 'susp' },
  { id: 'pneus', titulo: 'Pneus, alinhamento e balanceamento', texto: 'Montagem, alinhamento, balanceamento e cambagem para os pneus durarem mais.', icon: 'tire' },
  { id: 'injecao', titulo: 'Injeção e diagnóstico', texto: 'Scanner para ler as falhas da central, limpeza de bicos e bomba de combustível.', icon: 'chip' },
  { id: 'bateria', titulo: 'Bateria e elétrica', texto: 'Teste de bateria e alternador e reparo da parte elétrica.', icon: 'battery' },
  { id: 'escapamento', titulo: 'Escapamento', texto: 'Troca e reparo de escapamento e silenciosos.', icon: 'exhaust' },
] as const;

/* Pacotes de revisão (sem preço: orçamento pelo WhatsApp, varia com o óleo e as peças do carro) */
export const PACOTES = [
  {
    id: 'leves',
    selo: 'Mais pedido',
    titulo: 'Revisão Completa',
    publico: 'Veículos leves',
    exemplos: 'Hatches e sedans: Onix, HB20, Gol, Polo, Argo, Ka, Cronos, Prisma, Voyage, Corolla, Civic…',
    itens: [
      'Troca de óleo do motor',
      'Filtro de óleo novo',
      'Filtro de combustível',
      'Filtro de ar do motor',
      'Filtro do ar-condicionado (cabine)',
      'Alinhamento e balanceamento',
      'Revisão dos itens de segurança',
    ],
  },
  {
    id: 'suv',
    selo: 'Maior porte',
    titulo: 'Revisão SUVs e Picapes',
    publico: 'SUVs, utilitários e picapes',
    exemplos: 'Compass, Renegade, Tracker, Creta, Kicks, Duster, T-Cross, HR-V, Hilux, Ranger, S10, Toro…',
    itens: [
      'Troca de óleo do motor (quantidade para SUV/picape)',
      'Filtro de óleo novo',
      'Filtro de combustível',
      'Filtro de ar do motor',
      'Filtro do ar-condicionado (cabine)',
      'Alinhamento e balanceamento',
      'Revisão dos itens de segurança',
    ],
  },
] as const;

export const SERVICOS_FORM = [
  'Pacote Revisão Completa (veículos leves)', 'Pacote Revisão SUVs e Picapes',
  'Revisão completa', 'Troca de óleo e filtros', 'Alinhamento e balanceamento', 'Pneus',
  'Freios', 'Suspensão e direção', 'Diagnóstico de barulho', 'Luz acesa no painel',
  'Bateria e elétrica', 'Escapamento', 'Outro / não sei',
];

/** Link do WhatsApp com a mensagem pronta */
export const wa = (numero: string, msg: string) => `https://wa.me/${numero}?text=${encodeURIComponent(msg)}`;
export const msgLoja = (l: Loja, extra = 'quero agendar um atendimento') => `Olá, ${l.apelido}! Vim pelo site e ${extra}.`;

/** Cliques (dataLayer). Mensagem enviada e agendamento são medidos no Inbox/CRM. */
declare global { interface Window { dataLayer?: Record<string, unknown>[] } }
export function track(id: string, href = '') {
  const event = href.includes('wa.me') ? 'whatsapp_click' : href.startsWith('tel:') ? 'phone_click' : /maps|waze/.test(href) ? 'route_click' : 'cta_click';
  (window.dataLayer = window.dataLayer || []).push({ event, cta_id: id });
}
