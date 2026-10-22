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
}

const TAGS_MEC = '#mecanico #mecanicoautomotivo #rendaextra #mecanicoapp';
const TAGS_OFI = '#oficinamecanica #oficina #donodeoficina #mecanicoapp';

export const MESSAGES: Message[] = [
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

export type ThemeId = 'grafite' | 'claro' | 'laranja' | 'impacto';

interface Theme {
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
};

// ── Formatos ────────────────────────────────────────────────────────────────

export type FormatId = 'a5' | 'post' | 'feed' | 'story';

const mmPx = (v: number) => Math.round((v / 25.4) * 300);

export const FORMATS: Record<FormatId, { label: string; hint: string; w: number; h: number; print: boolean; bleed: number; safeTop: number; safeBottom: number }> = {
  a5:    { label: 'Panfleto A5', hint: '148×210 mm + 3 mm de sangria, 300 dpi', w: mmPx(154), h: mmPx(216), print: true, bleed: mmPx(3), safeTop: 0, safeBottom: 0 },
  post:  { label: 'Post quadrado', hint: '1080×1080 (Instagram / Facebook)', w: 1080, h: 1080, print: false, bleed: 0, safeTop: 0, safeBottom: 0 },
  feed:  { label: 'Feed retrato', hint: '1080×1350 (melhor alcance no feed)', w: 1080, h: 1350, print: false, bleed: 0, safeTop: 0, safeBottom: 0 },
  story: { label: 'Story / Status', hint: '1080×1920 (Stories, Reels, WhatsApp)', w: 1080, h: 1920, print: false, bleed: 0, safeTop: 0.1, safeBottom: 0.1 },
};

// ── Render ──────────────────────────────────────────────────────────────────

export interface PieceOptions {
  message: Message;
  theme: ThemeId;
  format: FormatId;
  tracked: boolean;
  scale?: number;          // < 1 para pré-visualização rápida
}

type Token = { text: string; color: string };

/** Quebra palavras coloridas em linhas que cabem em maxW. */
function layoutTokens(ctx: CanvasRenderingContext2D, tokens: Token[], maxW: number) {
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
  const tight = o.format === 'post';                 // quadrado: menos altura, espaços menores
  const k = o.format === 'story' ? 1.2 : 1;          // story: textos de apoio maiores
  const top = B + Math.max(u * (tight ? 6.5 : 8), H * f.safeTop);
  const bottom = H - B - Math.max(u * (tight ? 6 : 7), H * f.safeBottom);
  const innerW = W - 2 * M;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  th.paint(ctx, W, H);

  // Logo
  const logoH = u * (tight ? 7 : 8);
  await drawIcon(ctx, th.logo.icon, M, top, logoH);
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${u * 4.6}px "Space Grotesk"`;
  ctx.fillStyle = th.logo.t1;
  const lx = M + logoH + u * 2.2, ly = top + logoH / 2;
  ctx.fillText('Mecânico', lx, ly);
  ctx.fillStyle = th.logo.t2;
  ctx.fillText('App', lx + ctx.measureText('Mecânico').width, ly);
  ctx.textBaseline = 'alphabetic';

  // Bloco de baixo (fixo no rodapé): QR no impresso, botão nas redes
  const blockH = f.print ? u * 40 : u * (tight ? 17 : 22) * k;
  const blockY = bottom - blockH;

  // Bullets: altura reservada logo acima do bloco
  const bulletFont = u * (tight ? 3.3 : 3.8) * k;
  const bulletGap = bulletFont * (tight ? 1.7 : 1.9);
  const bullets = m.bullets.filter(b => b.trim());
  const bulletsH = bullets.length * bulletGap;
  const bulletsY = blockY - u * (tight ? 4 : 6) - bulletsH;

  // Kicker + título ocupam o espaço entre o logo e os bullets
  const kickerY = top + logoH + u * (tight ? 6.5 : 9);
  ctx.font = `700 ${u * 2.9 * k}px "Inter"`;
  ctx.fillStyle = th.kicker;
  if (m.kicker.trim()) ctx.fillText(m.kicker.toUpperCase(), M, kickerY);

  const titleTop = kickerY + u * 2.5;
  const titleMaxH = bulletsY - u * (tight ? 3.5 : 5) - titleTop;
  const tokens: Token[] = [
    ...m.title.split(/\s+/).filter(Boolean).map(t => ({ text: t, color: th.text })),
    ...m.highlight.split(/\s+/).filter(Boolean).map(t => ({ text: t, color: th.highlight })),
  ];
  let size = u * (o.format === 'post' ? 11 : 13);
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

  if (f.print) {
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
export async function buildPiecesZip(opts: { audience: Audience | 'all'; format: FormatId; themes: ThemeId[]; tracked: boolean },
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
        await renderPiecePng({ message: m, theme: t, format: opts.format, tracked: opts.tracked }));
      onProgress?.(++done, total);
    }
    if (!FORMATS[opts.format].print) folder.file(`legenda-${m.id}.txt`, m.caption);
  }
  return zip.generateAsync({ type: 'blob' });
}
