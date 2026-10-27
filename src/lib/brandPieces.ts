import {
  type Audience, type IconVariant, DISPLAY_DOMAIN, SIGNUP_PATH,
  canvasToBlob, drawIcon, ensureFonts, qrCanvas, roundRect, signupUrl,
} from './brandKit';

/**
 * Gerador de peças (panfletos e posts): mensagem × tema × formato.
 * Tudo desenhado em canvas a partir de proporções da largura, então o mesmo
 * layout serve do A5 impresso ao story.
 */

// ── Mensagens ───────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  audience: Audience;
  name: string;            // nome curto pra escolher na lista
  kicker: string;
  title: string;           // parte normal do título
  highlight: string;       // parte em destaque (cor de acento)
  bullets: string[];
  cta: string;             // chamada do QR / botão
  caption: string;         // legenda pronta pra rede social
  badge?: Badge;           // selo de gatilho desenhado na peça
}

/** Gatilhos de campanha: o selo aparece no canto da peça. */
export type Badge = 'lancamento' | 'novidade';
export const BADGE_LABEL: Record<Badge, string> = { lancamento: 'LANÇAMENTO', novidade: 'NOVIDADE' };

/** Grupos da lista de mensagens (gatilho primeiro). */
export const MESSAGE_GROUPS: { label: string; match: (m: Message) => boolean }[] = [
  { label: '🚀 Lançamento', match: m => m.badge === 'lancamento' },
  { label: '✨ Novidade',   match: m => m.badge === 'novidade' },
  { label: 'Mensagens fixas', match: m => !m.badge },
];

const TAGS_MEC = '#mecanico #mecanicoautomotivo #rendaextra #mecanicoapp';
const TAGS_OFI = '#oficinamecanica #oficina #donodeoficina #mecanicoapp';

export const MESSAGES: Message[] = [
  // Lançamento / novidade — mecânicos
  { id: 'mec-lancamento', audience: 'mecanico', name: 'Chegou o MecânicoApp', badge: 'lancamento',
    kicker: 'CHEGOU O MECÂNICOAPP', title: 'O app que leva serviço', highlight: 'até o mecânico.',
    bullets: ['Oficinas da sua região chamando', 'Você escolhe o que aceita', 'Cadastro gratuito'],
    cta: 'Aponte a câmera e entre agora',
    caption: `🚀 LANÇAMENTO: chegou o MecânicoApp!\n\nO app que conecta mecânicos a oficinas que precisam de reforço. Você recebe os chamados da sua região e escolhe o que aceita.\n\nCadastro gratuito pelo link na bio.\n\n${TAGS_MEC} #lancamento #novidade` },
  { id: 'mec-novidade', audience: 'mecanico', name: 'Renda extra agora no celular', badge: 'novidade',
    kicker: 'NOVO JEITO DE TRABALHAR', title: 'Renda extra de mecânico', highlight: 'agora no celular.',
    bullets: ['Receba chamados pelo app', 'Veja o valor antes de aceitar', 'Trabalhe quando puder'],
    cta: 'Aponte a câmera e conheça',
    caption: `✨ NOVIDADE para mecânicos: a renda extra agora cabe no celular.\n\nNo MecânicoApp você recebe chamados de oficinas da região, vê o valor antes e aceita só o que quiser.\n\nConheça pelo link na bio.\n\n${TAGS_MEC} #novidade` },
  { id: 'mec-pioneiro', audience: 'mecanico', name: 'Seja dos primeiros', badge: 'lancamento',
    kicker: 'SEJA DOS PRIMEIROS', title: 'Quem entra primeiro', highlight: 'sai na frente.',
    bullets: ['Cadastro gratuito', 'Monte sua reputação desde o início', 'Seja lembrado pelas oficinas da região'],
    cta: 'Aponte a câmera e garanta seu lugar',
    caption: `⏳ O MecânicoApp acabou de chegar, e quem entra primeiro sai na frente.\n\nComece agora a montar sua reputação com as oficinas da sua região.\n\nCadastro gratuito pelo link na bio.\n\n${TAGS_MEC} #lancamento` },

  // Lançamento / novidade — oficinas
  { id: 'ofi-lancamento', audience: 'oficina', name: 'Chegou para oficinas', badge: 'lancamento',
    kicker: 'CHEGOU PARA OFICINAS', title: 'Chegou a mão de obra', highlight: 'sob demanda.',
    bullets: ['Mecânicos verificados', 'Chame só quando precisar', 'Cadastro gratuito'],
    cta: 'Aponte a câmera e cadastre sua oficina',
    caption: `🚀 LANÇAMENTO: chegou o MecânicoApp para oficinas!\n\nMão de obra sob demanda: você chama mecânicos verificados só quando precisa, sem aumentar a folha fixa.\n\nCadastre sua oficina pelo link na bio.\n\n${TAGS_OFI} #lancamento #novidade` },
  { id: 'ofi-novidade', audience: 'oficina', name: 'Chame mecânico como chama um carro', badge: 'novidade',
    kicker: 'NOVIDADE PARA OFICINAS', title: 'Agora você chama mecânico', highlight: 'como chama um carro de app.',
    bullets: ['Publique o serviço em minutos', 'Profissionais da sua região aceitam', 'Acompanhe tudo pelo celular'],
    cta: 'Aponte a câmera e conheça',
    caption: `✨ NOVIDADE: chamar mecânico ficou tão fácil quanto chamar um carro de app.\n\nPublique o serviço, profissionais verificados da sua região aceitam e você acompanha tudo pelo celular.\n\nConheça pelo link na bio.\n\n${TAGS_OFI} #novidade` },
  { id: 'ofi-fundadora', audience: 'oficina', name: 'Oficinas fundadoras', badge: 'lancamento',
    kicker: 'OFICINAS FUNDADORAS', title: 'Seja uma das primeiras', highlight: 'oficinas da rede.',
    bullets: ['Cadastro gratuito', 'Selo de oficina parceira', 'Monte sua rede de confiança desde o início'],
    cta: 'Aponte a câmera e garanta sua vaga',
    caption: `🏁 Estamos formando a rede de oficinas fundadoras do MecânicoApp.\n\nQuem entra agora ganha o selo de oficina parceira e monta a própria rede de mecânicos de confiança desde o começo.\n\nCadastro gratuito pelo link na bio.\n\n${TAGS_OFI} #lancamento` },

  // Mecânicos
  { id: 'mec-experiencia', audience: 'mecanico', name: 'Renda com a sua experiência',
    kicker: 'PARA MECÂNICOS', title: 'Ganhe mais usando a', highlight: 'experiência que você já tem.',
    bullets: ['Receba serviços de oficinas da sua região', 'Trabalhe nos horários que você tem livres', 'Você escolhe o que aceita'],
    cta: 'Aponte a câmera e faça seu cadastro',
    caption: `Você já sabe o serviço. Agora pode ganhar mais com ele. 🔧\n\nNo MecânicoApp, oficinas da sua região chamam mecânicos para serviços avulsos, e você escolhe o que aceita, no horário que tem livre.\n\nCadastre-se pelo link na bio.\n\n${TAGS_MEC}` },
  { id: 'mec-horario', audience: 'mecanico', name: 'Horário livre vale dinheiro',
    kicker: 'RENDA EXTRA', title: 'Seu horário livre', highlight: 'vale dinheiro.',
    bullets: ['Pegue serviços quando puder', 'Oficinas perto de você', 'Dá pra fazer mesmo já tendo emprego'],
    cta: 'Aponte a câmera e comece hoje',
    caption: `Folga, fim de semana, fim de tarde: seu tempo livre pode virar renda. ⏱️\n\nNo MecânicoApp você recebe chamados de oficinas da sua região e só aceita o que couber na sua agenda.\n\nLink na bio para se cadastrar.\n\n${TAGS_MEC}` },
  { id: 'mec-talento', audience: 'mecanico', name: 'Só o seu talento',
    kicker: 'PARA MECÂNICOS', title: 'Você não precisa investir em ferramenta.', highlight: 'Só no seu talento.',
    bullets: ['O serviço é na oficina parceira', 'Você leva o conhecimento', 'Sem precisar abrir sua própria oficina'],
    cta: 'Aponte a câmera e cadastre-se',
    caption: `Abrir oficina custa caro. Trabalhar com o que você sabe, não. 💪\n\nNo MecânicoApp o serviço acontece na oficina parceira, e você entra com o conhecimento.\n\nCadastro pelo link na bio.\n\n${TAGS_MEC}` },
  { id: 'mec-valor', audience: 'mecanico', name: 'Valor combinado antes',
    kicker: 'PARA MECÂNICOS', title: 'Mecânico bom', highlight: 'merece ser bem pago.',
    bullets: ['Você vê o valor antes de aceitar', 'Serviços de oficinas verificadas', 'Avaliação que valoriza o seu trabalho'],
    cta: 'Aponte a câmera e faça seu cadastro',
    caption: `Chega de trabalhar sem saber quanto vai receber. 💰\n\nNo MecânicoApp, o valor do serviço aparece antes de você aceitar.\n\nLink na bio.\n\n${TAGS_MEC}` },

  // Oficinas
  { id: 'ofi-mao-de-obra', audience: 'oficina', name: 'Mão de obra quando precisa',
    kicker: 'PARA OFICINAS', title: 'A mão de obra que sua oficina precisa,', highlight: 'quando precisa.',
    bullets: ['Reforço nos dias de pico e nas faltas', 'Mecânicos verificados na sua região', 'Monte sua rede de profissionais de confiança'],
    cta: 'Aponte a câmera e cadastre sua oficina',
    caption: `Serviço sobrando e mecânico faltando? 🏭\n\nNo MecânicoApp você chama mecânicos verificados da sua região para reforçar a equipe só quando precisa.\n\nCadastre sua oficina pelo link na bio.\n\n${TAGS_OFI}` },
  { id: 'ofi-pico', audience: 'oficina', name: 'Dia de pico',
    kicker: 'PARA OFICINAS', title: 'Pátio cheio?', highlight: 'Chame reforço.',
    bullets: ['Mecânico na sua oficina quando a agenda aperta', 'Profissionais verificados', 'Sem aumentar a folha fixa'],
    cta: 'Aponte a câmera e cadastre sua oficina',
    caption: `Dia de pico não precisa virar cliente esperando. 🚗🚗🚗\n\nCom o MecânicoApp você chama um mecânico verificado para o dia de movimento, sem aumentar a folha fixa.\n\nLink na bio.\n\n${TAGS_OFI}` },
  { id: 'ofi-falta', audience: 'oficina', name: 'Mecânico faltou',
    kicker: 'PARA OFICINAS', title: 'Mecânico faltou?', highlight: 'Sua agenda não para.',
    bullets: ['Peça um profissional em poucos toques', 'Mecânicos da sua região', 'Você acompanha tudo pelo app'],
    cta: 'Aponte a câmera e cadastre sua oficina',
    caption: `Falta, atestado, férias: a agenda da oficina não pode parar. 📅\n\nNo MecânicoApp você encontra mecânicos verificados da sua região para cobrir a equipe.\n\nCadastre sua oficina pelo link na bio.\n\n${TAGS_OFI}` },
  { id: 'ofi-rede', audience: 'oficina', name: 'Rede de confiança',
    kicker: 'PARA OFICINAS', title: 'Monte a sua rede de', highlight: 'mecânicos de confiança.',
    bullets: ['Favorite quem trabalhou bem', 'Chame primeiro quem você já conhece', 'Todos verificados pela plataforma'],
    cta: 'Aponte a câmera e cadastre sua oficina',
    caption: `Achou um mecânico bom? Guarde ele na sua rede. 🤝\n\nNo MecânicoApp você favorita os profissionais que trabalharam bem e chama eles primeiro na próxima vez.\n\nLink na bio.\n\n${TAGS_OFI}` },
  { id: 'ofi-organizacao', audience: 'oficina', name: 'Falta de organização',
    kicker: 'PARA DONOS DE OFICINA', title: 'O problema nunca foi falta de demanda.', highlight: 'Foi falta de organização.',
    bullets: ['Mão de obra sob demanda', 'Profissionais verificados', 'Tudo registrado no app'],
    cta: 'Aponte a câmera e cadastre sua oficina',
    caption: `Cliente sua oficina já tem. O que trava é a mão de obra na hora certa. 📈\n\nO MecânicoApp organiza isso: você chama mecânicos verificados quando a demanda aparece.\n\nCadastre-se pelo link na bio.\n\n${TAGS_OFI}` },
];

// ── Temas ───────────────────────────────────────────────────────────────────

export type ThemeId = 'grafite' | 'claro' | 'laranja' | 'impacto' | 'lancamento';

export interface Theme {
  label: string;
  text: string; highlight: string; kicker: string; body: string; dot: string; muted: string;
  logo: { icon: IconVariant; t1: string; t2: string };
  ctaBg: string; ctaText: string;
  card: string; cardText: string; cardUrl: string;
  paint: (ctx: CanvasRenderingContext2D, W: number, H: number) => void;
}

export const THEMES: Record<ThemeId, Theme> = {
  grafite: {
    label: 'Grafite',
    text: '#FFFFFF', highlight: '#FF5C0A', kicker: '#FF7A38', body: '#E8ECF1', dot: '#FF5C0A', muted: '#9AA6B6',
    logo: { icon: 'app', t1: '#FFFFFF', t2: '#FF5C0A' },
    ctaBg: '#FF5C0A', ctaText: '#FFFFFF', card: '#FFFFFF', cardText: '#0B1117', cardUrl: '#E64500',
    paint: (ctx, W, H) => {
      ctx.fillStyle = '#0B1117'; ctx.fillRect(0, 0, W, H);
      const g = ctx.createRadialGradient(W * 0.9, H * 0.06, 0, W * 0.9, H * 0.06, Math.max(W, H) * 0.75);
      g.addColorStop(0, 'rgba(255,92,10,0.38)'); g.addColorStop(1, 'rgba(255,92,10,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    },
  },
  claro: {
    label: 'Claro',
    text: '#0B1117', highlight: '#E64500', kicker: '#E64500', body: '#33414F', dot: '#FF5C0A', muted: '#6B7889',
    logo: { icon: 'app', t1: '#0B1117', t2: '#FF5C0A' },
    ctaBg: '#0B1117', ctaText: '#FFFFFF', card: '#F5F7FA', cardText: '#0B1117', cardUrl: '#E64500',
    paint: (ctx, W, H) => {
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
      // Faixa laranja diagonal no canto
      const g = ctx.createLinearGradient(W * 0.6, 0, W, H * 0.25);
      g.addColorStop(0, '#FF7A38'); g.addColorStop(1, '#E64500');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(W * 0.72, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H * 0.16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F5F7FA'; ctx.fillRect(0, H * 0.985, W, H * 0.015);
    },
  },
  laranja: {
    label: 'Laranja',
    text: '#FFFFFF', highlight: '#0B1117', kicker: '#FFE6D5', body: '#FFF4ED', dot: '#0B1117', muted: '#FFE6D5',
    logo: { icon: 'app', t1: '#FFFFFF', t2: '#0B1117' },
    ctaBg: '#0B1117', ctaText: '#FFFFFF', card: '#FFFFFF', cardText: '#0B1117', cardUrl: '#E64500',
    paint: (ctx, W, H) => {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#FF7A38'); g.addColorStop(1, '#E64500');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.beginPath(); ctx.arc(W * 0.95, H * 0.1, W * 0.45, 0, Math.PI * 2); ctx.fill();
    },
  },
  impacto: {
    label: 'Impacto',
    text: '#FFFFFF', highlight: '#FF7A38', kicker: '#FF7A38', body: '#CBD3DD', dot: '#FF5C0A', muted: '#9AA6B6',
    logo: { icon: 'app', t1: '#FFFFFF', t2: '#FF5C0A' },
    ctaBg: '#FFFFFF', ctaText: '#0B1117', card: '#FFFFFF', cardText: '#0B1117', cardUrl: '#E64500',
    paint: (ctx, W, H) => {
      ctx.fillStyle = '#151C24'; ctx.fillRect(0, 0, W, H);
      // Listras finas de fundo
      ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = W * 0.012;
      for (let x = -H; x < W; x += W * 0.06) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
      // Bloco laranja inclinado embaixo
      const g = ctx.createLinearGradient(0, H * 0.6, W, H);
      g.addColorStop(0, '#FF7A38'); g.addColorStop(1, '#E64500');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, H * 0.88); ctx.lineTo(W, H * 0.74); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    },
  },
  lancamento: {
    label: 'Lançamento',
    text: '#FFFFFF', highlight: '#FF7A38', kicker: '#FFC9A8', body: '#E8ECF1', dot: '#FF5C0A', muted: '#9AA6B6',
    logo: { icon: 'app', t1: '#FFFFFF', t2: '#FF5C0A' },
    ctaBg: '#FF5C0A', ctaText: '#FFFFFF', card: '#FFFFFF', cardText: '#0B1117', cardUrl: '#E64500',
    paint: (ctx, W, H) => {
      ctx.fillStyle = '#0B1117'; ctx.fillRect(0, 0, W, H);
      // Raios de explosão saindo do canto de cima
      const cx = W * 0.92, cy = H * 0.04, R = Math.hypot(W, H);
      for (let i = 0; i < 18; i++) {
        const a0 = Math.PI * 0.5 + (i / 18) * Math.PI * 0.75, a1 = a0 + Math.PI / 60;
        ctx.fillStyle = i % 2 ? 'rgba(255,92,10,0.10)' : 'rgba(255,122,56,0.05)';
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
        ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
        ctx.closePath(); ctx.fill();
      }
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
      g.addColorStop(0, 'rgba(255,92,10,0.45)'); g.addColorStop(1, 'rgba(255,92,10,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // Brilhos (posições fixas pra peça sair sempre igual)
      const sparks = [[0.12, 0.18, 1], [0.78, 0.32, 0.7], [0.55, 0.12, 0.6], [0.88, 0.5, 0.9], [0.2, 0.45, 0.5], [0.66, 0.6, 0.55]];
      for (const [sx, sy, sz] of sparks) drawSpark(ctx, sx * W, sy * H, W * 0.018 * sz, 'rgba(255,201,168,0.7)');
    },
  },
};

// ── Formatos ────────────────────────────────────────────────────────────────

export type FormatId = 'post' | 'feed' | 'story' | 'a6' | 'a5' | 'display' | 'a3' | 'rollup';

export interface Format {
  label: string; hint: string;
  w: number; h: number;              // pixels do arquivo (com sangria)
  print: boolean;
  bleed: number;                     // sangria em px
  mm?: { w: number; h: number; bleed: number; dpi: number }; // medida final pra gráfica
  safeTop: number; safeBottom: number;
  tight?: boolean;                   // pouca altura: espaços menores
  k?: number;                        // escala dos textos de apoio
  qrScale?: number;                  // cartão do QR maior
}

/** Formato impresso: medida final em mm + sangria, na resolução indicada. */
function printFmt(label: string, hint: string, wMm: number, hMm: number, bleedMm: number, dpi: number, extra: Partial<Format> = {}): Format {
  const px = (v: number) => Math.round((v / 25.4) * dpi);
  return {
    label, hint, print: true, safeTop: 0, safeBottom: 0,
    w: px(wMm + 2 * bleedMm), h: px(hMm + 2 * bleedMm), bleed: px(bleedMm),
    mm: { w: wMm, h: hMm, bleed: bleedMm, dpi }, ...extra,
  };
}

export const FORMATS: Record<FormatId, Format> = {
  post:    { label: 'Post quadrado', hint: '1080×1080 (Instagram / Facebook)', w: 1080, h: 1080, print: false, bleed: 0, safeTop: 0, safeBottom: 0, tight: true },
  feed:    { label: 'Feed retrato', hint: '1080×1350 (melhor alcance no feed)', w: 1080, h: 1350, print: false, bleed: 0, safeTop: 0, safeBottom: 0 },
  story:   { label: 'Story / Status', hint: '1080×1920 (Stories, Reels, WhatsApp)', w: 1080, h: 1920, print: false, bleed: 0, safeTop: 0.1, safeBottom: 0.1, k: 1.2 },
  a6:      printFmt('Flyer de bolso A6', '105×148 mm', 105, 148, 3, 300),
  a5:      printFmt('Panfleto A5', '148×210 mm', 148, 210, 3, 300),
  display: printFmt('Display de balcão', '100×150 mm', 100, 150, 3, 300),
  a3:      printFmt('Cartaz A3', '297×420 mm', 297, 420, 3, 300),
  rollup:  printFmt('Banner roll-up', '80×200 cm', 800, 2000, 5, 100, { k: 1.5, qrScale: 1.35 }),
};

export const SOCIAL_FORMATS: FormatId[] = ['post', 'feed', 'story'];

/** Estrela de 4 pontas (brilho). */
function drawSpark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const d = i % 2 ? r * 0.28 : r;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath(); ctx.fill();
}

/**
 * Selo do gatilho no canto superior direito. Lançamento: carimbo estrelado;
 * novidade: etiqueta inclinada. `size` é a altura de referência.
 */
export function drawBadge(ctx: CanvasRenderingContext2D, badge: Badge, right: number, top: number, size: number, onLight = false) {
  const label = BADGE_LABEL[badge];
  ctx.save();
  if (badge === 'lancamento') {
    const r = size * 1.25;
    ctx.translate(right - r, top + r); ctx.rotate(-0.2);
    ctx.fillStyle = '#FF5C0A';
    ctx.beginPath();
    const pts = 24;
    for (let i = 0; i < pts * 2; i++) {
      const a = (i / (pts * 2)) * Math.PI * 2;
      const d = i % 2 ? r * 0.86 : r;
      ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = r * 0.04;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${r * 0.27}px "Inter"`;
    ctx.fillText(label, 0, r * 0.02, r * 1.36);
    drawSpark(ctx, 0, -r * 0.42, r * 0.14, '#FFFFFF');
    drawSpark(ctx, 0, r * 0.42, r * 0.14, '#FFFFFF');
  } else {
    ctx.font = `800 ${size * 0.42}px "Inter"`;
    const w = ctx.measureText(label).width + size * 0.9;
    const h = size * 0.75;
    ctx.translate(right - w / 2, top + h);
    ctx.rotate(-0.12);
    ctx.fillStyle = onLight ? '#FF5C0A' : '#FFFFFF';
    roundRect(ctx, -w / 2, -h / 2, w, h, h / 2); ctx.fill();
    ctx.fillStyle = onLight ? '#FFFFFF' : '#E64500';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, size * 0.12, 0);
    drawSpark(ctx, -w / 2 + size * 0.34, 0, size * 0.18, onLight ? '#FFFFFF' : '#FF5C0A');
  }
  ctx.restore();
}

/** Ícone + "MecânicoApp" com a altura h; devolve a largura desenhada. */
export async function drawLogoLockup(ctx: CanvasRenderingContext2D, th: Theme, x: number, y: number, h: number) {
  await drawIcon(ctx, th.logo.icon, x, y, h);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${h * 0.575}px "Space Grotesk"`;
  const lx = x + h * 1.275, ly = y + h / 2;
  ctx.fillStyle = th.logo.t1;
  ctx.fillText('Mecânico', lx, ly);
  const w1 = ctx.measureText('Mecânico').width;
  ctx.fillStyle = th.logo.t2;
  ctx.fillText('App', lx + w1, ly);
  const w = h * 1.275 + w1 + ctx.measureText('App').width;
  ctx.restore();
  return w;
}

// ── Render ──────────────────────────────────────────────────────────────────

export interface PieceOptions {
  message: Message;
  theme: ThemeId;
  format: FormatId;
  tracked: boolean;
  scale?: number;          // < 1 para pré-visualização rápida
  illustration?: string | null;  // URL da ilustração da biblioteca (vai no topo da peça)
}

/** Cor de fundo onde a ilustração "derrete" em cada tema. */
const ILLUS_FADE: Record<ThemeId, string> = {
  grafite: '#0B1117', claro: '#FFFFFF', laranja: '#F2601B', impacto: '#151C24', lancamento: '#0B1117',
};

const imgCache = new Map<string, Promise<HTMLImageElement>>();
export function loadRemoteImage(url: string) {
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';           // sem isso o canvas não deixa exportar o PNG
      img.onload = () => res(img);
      img.onerror = () => { imgCache.delete(url); rej(new Error('Não deu pra carregar a ilustração.')); };
      img.src = url;
    }));
  }
  return imgCache.get(url)!;
}

export type Token = { text: string; color: string };

/** Quebra palavras coloridas em linhas que cabem em maxW. */
export function layoutTokens(ctx: CanvasRenderingContext2D, tokens: Token[], maxW: number) {
  const lines: Token[][] = [];
  let line: Token[] = [];
  let width = 0;
  const space = ctx.measureText(' ').width;
  for (const t of tokens) {
    const w = ctx.measureText(t.text).width;
    if (line.length && width + space + w > maxW) { lines.push(line); line = []; width = 0; }
    width += (line.length ? space : 0) + w;
    line.push(t);
  }
  if (line.length) lines.push(line);
  return lines;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  return layoutTokens(ctx, text.split(/\s+/).filter(Boolean).map(t => ({ text: t, color: '' })), maxW)
    .map(l => l.map(t => t.text).join(' '));
}

export async function renderPiece(o: PieceOptions) {
  await ensureFonts();
  const f = FORMATS[o.format];
  const th = THEMES[o.theme];
  const m = o.message;
  const s = o.scale ?? 1;
  const W = Math.round(f.w * s), H = Math.round(f.h * s);
  const u = W / 100;                                  // 1% da largura
  const B = f.bleed * s;
  const M = B + u * 8;                                // margem segura
  const tight = !!f.tight;
  const k = f.k ?? 1;
  const top = B + Math.max(u * (tight ? 6.5 : 8), H * f.safeTop);
  const bottom = H - B - Math.max(u * (tight ? 6 : 7), H * f.safeBottom);
  const innerW = W - 2 * M;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  th.paint(ctx, W, H);

  // Ilustração no topo, "derretendo" no fundo do tema
  let illusBottom = 0;
  if (o.illustration) {
    const img = await loadRemoteImage(o.illustration);
    const ratio = f.print && H / W > 2 ? 0.26 : o.format === 'story' ? 0.4 : o.format === 'post' ? 0.4 : f.print ? 0.28 : 0.38;
    const ih = H * ratio;
    const scaleImg = Math.max(W / img.width, ih / img.height);
    const dw = img.width * scaleImg, dh = img.height * scaleImg;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, ih); ctx.clip();
    // Corte puxado para cima: nas ilustrações o rosto fica no terço de cima
    ctx.filter = 'saturate(0.75)';   // ilustrações vêm muito saturadas; cansa a vista
    ctx.drawImage(img, (W - dw) / 2, (ih - dh) * 0.15, dw, dh);
    ctx.filter = 'none';
    ctx.restore();
    const fade = ctx.createLinearGradient(0, ih * 0.55, 0, ih);
    fade.addColorStop(0, ILLUS_FADE[o.theme] + '00');
    fade.addColorStop(1, ILLUS_FADE[o.theme]);
    ctx.fillStyle = fade;
    ctx.fillRect(0, ih * 0.55, W, ih * 0.45 + 1);
    illusBottom = ih;
  }

  // Logo: com ilustração, desce para a borda onde a imagem já "derreteu" no fundo,
  // para não cair em cima do rosto do personagem
  const logoH = u * (tight ? 7 : 8);
  const logoY = o.illustration ? illusBottom - logoH * 0.6 : top;
  await drawLogoLockup(ctx, th, M, logoY, logoH);
  if (m.badge) drawBadge(ctx, m.badge, W - M, top - u * 2, u * (tight ? 9 : 10), o.theme === 'claro');

  // Bloco de baixo (fixo no rodapé): QR no impresso, botão nas redes
  // Peça muito alta (roll-up): QR grande centralizado com o texto embaixo
  const tall = f.print && H / W > 2;
  const blockH = tall ? innerW * 0.62 + u * 26 : f.print ? u * 40 * (f.qrScale ?? 1) : u * (tight ? 17 : 22) * k;
  const blockY = bottom - blockH;

  // Bullets: altura reservada logo acima do bloco
  const bulletFont = u * (tight ? 3.3 : 3.8) * k;
  const bulletGap = bulletFont * (tight ? 1.7 : 1.9);
  const bullets = m.bullets.filter(b => b.trim());
  const bulletsH = bullets.length * bulletGap;
  const bulletsY = blockY - u * (tight ? 4 : 6) - bulletsH;

  // Kicker + título ocupam o espaço entre o logo e os bullets
  const kickerY = o.illustration ? logoY + logoH + u * (tight ? 5 : 6.5) : top + logoH + u * (tight ? 6.5 : 9);
  ctx.font = `700 ${u * 2.9 * k}px "Inter"`;
  ctx.fillStyle = th.kicker;
  if (m.kicker.trim()) ctx.fillText(m.kicker.toUpperCase(), M, kickerY);

  const titleTop = kickerY + u * 2.5;
  const titleMaxH = bulletsY - u * (tight ? 3.5 : 5) - titleTop;
  const tokens: Token[] = [
    ...m.title.split(/\s+/).filter(Boolean).map(t => ({ text: t, color: th.text })),
    ...m.highlight.split(/\s+/).filter(Boolean).map(t => ({ text: t, color: th.highlight })),
  ];
  let size = u * (tight ? 11 : 13);
  let lines: Token[][] = [];
  for (; size > u * 4; size -= u * 0.4) {
    ctx.font = `700 ${size}px "Space Grotesk"`;
    lines = layoutTokens(ctx, tokens, innerW);
    if (lines.length * size * 1.12 <= titleMaxH) break;
  }
  ctx.font = `700 ${size}px "Space Grotesk"`;
  const space = ctx.measureText(' ').width;
  lines.forEach((line, i) => {
    let x = M;
    const y = titleTop + size * (1 + i * 1.12);
    for (const t of line) {
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
      x += ctx.measureText(t.text).width + space;
    }
  });

  // Bullets
  ctx.font = `500 ${bulletFont}px "Inter"`;
  bullets.forEach((b, i) => {
    const y = bulletsY + bulletGap * (i + 0.7);
    ctx.fillStyle = th.dot;
    ctx.beginPath(); ctx.arc(M + bulletFont * 0.45, y - bulletFont * 0.35, bulletFont * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = th.body;
    ctx.fillText(b, M + bulletFont * 1.5, y, innerW - bulletFont * 1.5);
  });

  const url = `${DISPLAY_DOMAIN}${SIGNUP_PATH[m.audience]}`;

  if (tall) {
    ctx.fillStyle = th.card;
    roundRect(ctx, M, blockY, innerW, blockH, u * 4); ctx.fill();
    const qrSize = Math.round(innerW * 0.62);
    const qr = await qrCanvas(signupUrl(m.audience, o.tracked), qrSize);
    ctx.drawImage(qr, M + (innerW - qrSize) / 2, blockY + u * 5, qrSize, qrSize);
    ctx.textAlign = 'center';
    ctx.fillStyle = th.cardText;
    ctx.font = `700 ${u * 5.6}px "Space Grotesk"`;
    wrap(ctx, m.cta, innerW - u * 8).forEach((l, i) => ctx.fillText(l, W / 2, blockY + u * 11 + qrSize + i * u * 6.6));
    ctx.fillStyle = th.cardUrl;
    ctx.font = `600 ${u * 3.6}px "Inter"`;
    ctx.fillText(url, W / 2, blockY + blockH - u * 4, innerW - u * 8);
    ctx.textAlign = 'left';
  } else if (f.print) {
    // Cartão com QR
    ctx.fillStyle = th.card;
    roundRect(ctx, M, blockY, innerW, blockH, u * 3); ctx.fill();
    const pad = u * 3.5;
    const qrSize = Math.round(blockH - 2 * pad);
    const qr = await qrCanvas(signupUrl(m.audience, o.tracked), qrSize);
    ctx.drawImage(qr, M + pad, blockY + pad, qrSize, qrSize);
    const tx = M + pad + qrSize + pad;
    const tw = M + innerW - pad - tx;
    ctx.fillStyle = th.cardText;
    ctx.font = `700 ${u * 4.2}px "Space Grotesk"`;
    wrap(ctx, m.cta, tw).forEach((l, i) => ctx.fillText(l, tx, blockY + pad + u * 5 + i * u * 5));
    ctx.fillStyle = th.cardUrl;
    ctx.font = `600 ${u * 2.5}px "Inter"`;
    wrap(ctx, url.replace('/cadastro', ' /cadastro'), tw).forEach((l, i, arr) =>
      ctx.fillText(l.replace(' /cadastro', '/cadastro'), tx, blockY + blockH - pad - (arr.length - 1 - i) * u * 3.2));
  } else {
    // Botão + endereço
    const btnH = u * (tight ? 9.5 : 11) * k;
    ctx.font = `700 ${u * (tight ? 4 : 4.4) * k}px "Space Grotesk"`;
    const label = m.audience === 'oficina' ? 'Cadastre sua oficina' : 'Faça seu cadastro';
    const btnW = Math.min(innerW, ctx.measureText(label).width + u * 16);
    ctx.fillStyle = th.ctaBg;
    roundRect(ctx, M, blockY, btnW, btnH, btnH / 2); ctx.fill();
    ctx.fillStyle = th.ctaText;
    ctx.textBaseline = 'middle';
    ctx.fillText(`${label}  →`, M + u * 6, blockY + btnH / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = o.theme === 'impacto' ? '#0B1117' : th.muted;
    ctx.font = `600 ${u * (tight ? 2.8 : 3.1) * k}px "Inter"`;
    ctx.fillText(`Link na bio  ·  ${url}`, M, blockY + btnH + u * (tight ? 5.5 : 7) * k, innerW);
  }

  return c;
}

export async function renderPiecePng(o: PieceOptions) {
  return canvasToBlob(await renderPiece(o));
}

export const pieceFileName = (o: Pick<PieceOptions, 'message' | 'theme' | 'format'>) =>
  `${o.format}-${o.message.id}-${o.theme}.png`;

/** Todas as mensagens de um público num formato e tema, ou em todos os temas. */
export async function buildPiecesZip(opts: { audience: Audience | 'all'; format: FormatId; themes: ThemeId[]; tracked: boolean; illustration?: string | null },
  onProgress?: (done: number, total: number) => void) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const msgs = MESSAGES.filter(m => opts.audience === 'all' || m.audience === opts.audience);
  const total = msgs.length * opts.themes.length;
  let done = 0;
  for (const m of msgs) {
    const folder = zip.folder(m.audience === 'oficina' ? 'oficinas' : 'mecanicos')!;
    for (const t of opts.themes) {
      folder.file(pieceFileName({ message: m, theme: t, format: opts.format }),
        await renderPiecePng({ message: m, theme: t, format: opts.format, tracked: opts.tracked, illustration: opts.illustration }));
      onProgress?.(++done, total);
    }
    if (!FORMATS[opts.format].print) folder.file(`legenda-${m.id}.txt`, m.caption);
  }
  return zip.generateAsync({ type: 'blob' });
}
