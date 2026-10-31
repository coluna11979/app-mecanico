/* =====================================================================
   Dados da Jota Car — tudo que é editável fica aqui.
   As mensagens do WhatsApp começam com "Vim pelo site": o Inbox usa isso
   para marcar a origem "Site" no CRM. Não remover.
   ===================================================================== */

export const CONFIG = {
  nome: 'Jota Car',
  whatsapp: '5511934182002', // país + DDD + número, só dígitos
  telefone: '(11) 93418-2002',
  tel: '+5511934182002',
  endereco: "Estrada do M'Boi Mirim, 9000",
  cidade: 'São Paulo – SP',
  regiao: 'Zona Sul de São Paulo',
  razaoSocial: 'Jairo Costa Pneus LTDA',
  cnpj: '50.726.597/0001-24',
  instagram: 'https://www.instagram.com/jotacar9000/',
  googleAvaliacoes: 'https://www.google.com/maps/search/?api=1&query=Jota+Car+Servi%C3%A7os+Automotivo+Estrada+do+M%27Boi+Mirim+9000',
  rota: 'https://www.google.com/maps/dir/?api=1&destination=Jota+Car+Servi%C3%A7os+Automotivo%2C+Estrada+do+M%27Boi+Mirim%2C+9000%2C+S%C3%A3o+Paulo+-+SP',
  waze: "https://waze.com/ul?q=Estrada%20do%20M'Boi%20Mirim%2C%209000%2C%20S%C3%A3o%20Paulo&navigate=yes",
  mapaEmbed: 'https://www.google.com/maps?q=Jota+Car+Servi%C3%A7os+Automotivo,+Estrada+do+M%27Boi+Mirim,+9000,+S%C3%A3o+Paulo&output=embed',
  // Foto REAL da fachada (enviada pelo dono)
  fotoFachada: '/sites/jotacar/fotos/fachada.webp',
  // [abre, fecha] em horas; null = fechado. Índice 0 = domingo.
  horarios: [
    { dias: 'Segunda a sexta', horas: '8h às 18h', semana: [1, 2, 3, 4, 5] },
    { dias: 'Sábado', horas: '8h às 14h', semana: [6] },
    { dias: 'Domingo', horas: 'Fechado', semana: [0] },
  ],
  mensagens: {
    geral: 'Olá, Jota Car! Vim pelo site e quero falar sobre o meu carro.',
    agendar: 'Olá, Jota Car! Vim pelo site e quero agendar um atendimento.',
    triagemBase: 'Olá, Jota Car! Vim pelo site.',
    triagemFim: 'Quero agendar uma avaliação.',
  },
} as const;

/** Link do WhatsApp com a mensagem pronta */
export const wa = (msg: string) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`;

/** Registra cliques (dataLayer). Mensagem enviada e agendamento são medidos no Inbox/CRM. */
declare global {
  interface Window { dataLayer?: Record<string, unknown>[] }
}
export function track(id: string, href = '') {
  const event = href.includes('wa.me') ? 'whatsapp_click' : href.startsWith('tel:') ? 'phone_click' : /maps|waze/.test(href) ? 'route_click' : 'cta_click';
  (window.dataLayer = window.dataLayer || []).push({ event, cta_id: id });
}

/** Dia da semana em São Paulo (0 = domingo) */
export function diaSP(): number {
  try {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date());
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
  } catch {
    return new Date().getDay();
  }
}
