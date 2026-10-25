import { type Audience, DISPLAY_DOMAIN, SIGNUP_PATH, canvasToBlob, ensureFonts, roundRect } from './brandKit';
import { type Badge, type ThemeId, type Token, THEMES, drawBadge, drawLogoLockup, layoutTokens } from './brandPieces';

/**
 * Carrosséis para Instagram (1080×1350): sequência de slides com capa,
 * passos/listas e chamada final. Mesmo visual dos posts (temas e selo).
 */

type Slide =
  | { kind: 'cover'; kicker: string; title: string; highlight: string }
  | { kind: 'step'; n: number; title: string; text: string }
  | { kind: 'list'; title: string; highlight?: string; items: string[] }
  | { kind: 'cta'; title: string; highlight: string; button: string };

export interface Carousel {
  id: string;
  audience: Audience;
  name: string;
  badge?: Badge;
  slides: Slide[];
  caption: string;
}

const TAGS_MEC = '#mecanico #mecanicoautomotivo #rendaextra #mecanicoapp';
const TAGS_OFI = '#oficinamecanica #oficina #donodeoficina #mecanicoapp';

export const CAROUSELS: Carousel[] = [
  {
    id: 'mec-como-funciona', audience: 'mecanico', name: 'Como funciona (mecânico)',
    slides: [
      { kind: 'cover', kicker: 'COMO FUNCIONA', title: 'Renda extra de mecânico', highlight: 'em 4 passos.' },
      { kind: 'step', n: 1, title: 'Faça seu cadastro', text: 'Leva poucos minutos e é gratuito. A gente confere seus dados para manter a rede confiável.' },
      { kind: 'step', n: 2, title: 'Receba chamados da sua região', text: 'Oficinas publicam o serviço e você recebe o aviso no celular.' },
      { kind: 'step', n: 3, title: 'Veja o valor antes de aceitar', text: 'Você sabe quanto vai receber e aceita só o que couber na sua agenda.' },
      { kind: 'step', n: 4, title: 'Faça o serviço e seja avaliado', text: 'O trabalho é na oficina parceira, e cada avaliação boa valoriza o seu nome.' },
      { kind: 'cta', title: 'Bora começar?', highlight: 'O cadastro é gratuito.', button: 'Link na bio' },
    ],
    caption: `Renda extra de mecânico em 4 passos 🔧👇\n\n1️⃣ Faça seu cadastro gratuito\n2️⃣ Receba chamados de oficinas da sua região\n3️⃣ Veja o valor antes de aceitar\n4️⃣ Faça o serviço e seja avaliado\n\nCadastre-se pelo link na bio.\n\n${TAGS_MEC}`,
  },
  {
    id: 'mec-lancamento', audience: 'mecanico', name: 'Lançamento (mecânico)', badge: 'lancamento',
    slides: [
      { kind: 'cover', kicker: 'CHEGOU O MECÂNICOAPP', title: 'Mecânico, tem novidade', highlight: 'pra você.' },
      { kind: 'list', title: 'O que muda', highlight: 'na sua rotina:', items: ['Serviço chegando pelo celular', 'Você escolhe o que aceita', 'Valor combinado antes', 'Trabalha nos horários livres'] },
      { kind: 'step', n: 1, title: 'Quem entra primeiro sai na frente', text: 'As primeiras avaliações fazem as oficinas lembrarem de você quando surgir o próximo serviço.' },
      { kind: 'list', title: 'É pra você', highlight: 'que:', items: ['Já trabalha e quer renda extra', 'Está como autônomo', 'Quer conhecer novas oficinas'] },
      { kind: 'cta', title: 'Garanta seu lugar.', highlight: 'Cadastro gratuito.', button: 'Link na bio' },
    ],
    caption: `🚀 LANÇAMENTO: chegou o MecânicoApp!\n\nServiço chegando pelo celular, valor combinado antes e você escolhe o que aceita. Quem entra primeiro começa a montar a reputação antes de todo mundo.\n\nCadastro gratuito pelo link na bio.\n\n${TAGS_MEC} #lancamento`,
  },
  {
    id: 'ofi-como-funciona', audience: 'oficina', name: 'Como funciona (oficina)',
    slides: [
      { kind: 'cover', kicker: 'COMO FUNCIONA', title: 'Mecânico na sua oficina', highlight: 'em 4 passos.' },
      { kind: 'step', n: 1, title: 'Cadastre a oficina', text: 'Cadastro gratuito. Depois da aprovação, você já pode chamar profissionais.' },
      { kind: 'step', n: 2, title: 'Publique o serviço', text: 'Diga o que precisa, o dia e o valor. Leva poucos minutos.' },
      { kind: 'step', n: 3, title: 'Mecânicos verificados aceitam', text: 'Profissionais da sua região recebem o chamado, e você acompanha tudo pelo app.' },
      { kind: 'step', n: 4, title: 'Avalie e monte sua rede', text: 'Favorite quem trabalhou bem e chame primeiro na próxima vez.' },
      { kind: 'cta', title: 'Sua oficina sem parar.', highlight: 'Cadastre-se grátis.', button: 'Link na bio' },
    ],
    caption: `Mecânico na sua oficina em 4 passos 🏭👇\n\n1️⃣ Cadastre a oficina (gratuito)\n2️⃣ Publique o serviço\n3️⃣ Mecânicos verificados da região aceitam\n4️⃣ Avalie e monte sua rede de confiança\n\nCadastre sua oficina pelo link na bio.\n\n${TAGS_OFI}`,
  },
  {
    id: 'ofi-quando-usar', audience: 'oficina', name: 'Quando chamar reforço (oficina)', badge: 'novidade',
    slides: [
      { kind: 'cover', kicker: 'NOVIDADE PARA OFICINAS', title: 'Pátio cheio, mecânico faltou?', highlight: 'Chame reforço.' },
      { kind: 'list', title: 'Quando o MecânicoApp', highlight: 'resolve:', items: ['Dia de pico de serviço', 'Falta, atestado ou férias', 'Serviço fora da especialidade da equipe', 'Sábado com agenda cheia'] },
      { kind: 'step', n: 1, title: 'Sem aumentar a folha fixa', text: 'Você chama o profissional só para o serviço do dia, sem contratar para o mês inteiro.' },
      { kind: 'step', n: 2, title: 'Profissionais verificados', text: 'A plataforma confere os dados de cada mecânico antes de liberar o cadastro.' },
      { kind: 'cta', title: 'Seja uma oficina fundadora.', highlight: 'Cadastro gratuito.', button: 'Link na bio' },
    ],
    caption: `✨ NOVIDADE: reforço de mão de obra sob demanda para oficinas.\n\nDia de pico, falta, férias ou serviço fora da especialidade da equipe: chame um mecânico verificado só quando precisar, sem aumentar a folha fixa.\n\nCadastre sua oficina pelo link na bio.\n\n${TAGS_OFI} #novidade`,
  },
];

const W = 1080, H = 1350;

function fit(ctx: CanvasRenderingContext2D, tokens: Token[], maxW: number, maxH: number, start: number, min: number, weight = 700, family = 'Space Grotesk', lh = 1.12) {
  let size = start;
  let lines: Token[][] = [];
  for (; size > min; size *= 0.95) {
    ctx.font = `${weight} ${size}px "${family}"`;
    lines = layoutTokens(ctx, tokens, maxW);
    if (lines.length * size * lh <= maxH) break;
  }
  ctx.font = `${weight} ${size}px "${family}"`;
  return { size, lines, height: lines.length * size * lh };
}

function draw(ctx: CanvasRenderingContext2D, lines: Token[][], x: number, y: number, size: number, lh = 1.12) {
  const space = ctx.measureText(' ').width;
  lines.forEach((line, i) => {
    let xx = x;
    for (const t of line) {
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, xx, y + size * (1 + i * lh));
      xx += ctx.measureText(t.text).width + space;
    }
  });
}

const tok = (text: string, color: string): Token[] => text.split(/\s+/).filter(Boolean).map(t => ({ text: t, color }));

export async function renderSlide(c: Carousel, index: number, theme: ThemeId, scale = 1) {
  await ensureFonts();
  const th = THEMES[theme];
  const slide = c.slides[index];
  const total = c.slides.length;
  const cw = Math.round(W * scale), ch = Math.round(H * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  th.paint(ctx, W, H);

  const M = 88;
  const innerW = W - 2 * M;

  // Topo: logo + contador
  await drawLogoLockup(ctx, th, M, 80, 64);
  ctx.font = '600 30px "Inter"';
  ctx.fillStyle = th.muted;
  ctx.textAlign = 'right';
  ctx.fillText(`${index + 1}/${total}`, W - M, 124);
  ctx.textAlign = 'left';

  // Rodapé: bolinhas de progresso + "arraste"
  const dotY = H - 92;
  const onBand = theme === 'impacto';           // rodapé fica sobre a faixa laranja
  for (let i = 0; i < total; i++) {
    ctx.fillStyle = onBand ? '#0B1117' : i === index ? th.dot : th.muted;
    ctx.globalAlpha = i === index ? 1 : onBand ? 0.4 : 0.35;
    ctx.beginPath(); ctx.arc(M + 8 + i * 30, dotY, i === index ? 9 : 7, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (index < total - 1) {
    ctx.font = '700 30px "Inter"';
    ctx.fillStyle = onBand ? '#0B1117' : th.kicker;
    ctx.textAlign = 'right';
    ctx.fillText('Arraste  →', W - M, dotY + 10);
    ctx.textAlign = 'left';
  }

  const top = 230, bottom = H - 170;

  if (slide.kind === 'cover') {
    if (c.badge) drawBadge(ctx, c.badge, W - M, 200, 110, theme === 'claro');
    ctx.font = '700 34px "Inter"';
    ctx.fillStyle = th.kicker;
    ctx.fillText(slide.kicker, M, top + 230);
    const t = fit(ctx, [...tok(slide.title, th.text), ...tok(slide.highlight, th.highlight)], innerW, bottom - top - 300, 150, 60);
    draw(ctx, t.lines, M, top + 260, t.size);
  }

  if (slide.kind === 'step') {
    // Mede antes de desenhar pra centralizar o bloco na altura
    const t = fit(ctx, tok(slide.title, th.text), innerW, 300, 96, 48);
    const body = fit(ctx, tok(slide.text, th.body), innerW, 320, 50, 30, 500, 'Inter', 1.35);
    const blockH = 300 + 60 + t.height + 40 + body.height;
    const y0 = top + Math.max(0, (bottom - top - blockH) / 2);
    ctx.font = '700 300px "Space Grotesk"';
    ctx.fillStyle = th.highlight;
    ctx.fillText(String(slide.n).padStart(2, '0'), M - 12, y0 + 260);
    ctx.font = `700 ${t.size}px "Space Grotesk"`;
    draw(ctx, t.lines, M, y0 + 300, t.size);
    ctx.font = `500 ${body.size}px "Inter"`;
    draw(ctx, body.lines, M, y0 + 360 + t.height, body.size, 1.35);
  }

  if (slide.kind === 'list') {
    const t = fit(ctx, [...tok(slide.title, th.text), ...tok(slide.highlight ?? '', th.highlight)], innerW, 280, 100, 52);
    draw(ctx, t.lines, M, top + 40, t.size);
    let y = top + 120 + t.height;
    const gap = Math.min(150, (bottom - y) / slide.items.length);
    ctx.font = '600 46px "Inter"';
    for (const item of slide.items) {
      // Check em círculo
      ctx.fillStyle = th.dot;
      ctx.beginPath(); ctx.arc(M + 26, y + 26, 26, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = theme === 'laranja' ? '#FFFFFF' : '#FFFFFF';
      ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(M + 14, y + 27); ctx.lineTo(M + 23, y + 36); ctx.lineTo(M + 39, y + 17); ctx.stroke();
      ctx.fillStyle = th.body;
      ctx.font = '600 46px "Inter"';
      ctx.fillText(item, M + 80, y + 42, innerW - 80);
      y += gap;
    }
  }

  if (slide.kind === 'cta') {
    const t = fit(ctx, [...tok(slide.title, th.text), ...tok(slide.highlight, th.highlight)], innerW, 420, 130, 60);
    const y0 = top + Math.max(0, (bottom - top - (t.height + 80 + 110 + 110)) / 2);
    draw(ctx, t.lines, M, y0, t.size);
    const by = y0 + 80 + t.height;
    ctx.font = '700 48px "Space Grotesk"';
    const bw = ctx.measureText(slide.button).width + 140;
    ctx.fillStyle = th.ctaBg;
    roundRect(ctx, M, by, bw, 110, 55); ctx.fill();
    ctx.fillStyle = th.ctaText;
    ctx.textBaseline = 'middle';
    ctx.fillText(`${slide.button}  →`, M + 56, by + 57);
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 34px "Inter"';
    ctx.fillStyle = th.muted;
    ctx.fillText(`${DISPLAY_DOMAIN}${SIGNUP_PATH[c.audience]}`, M, by + 190, innerW);
  }

  return canvas;
}

export async function renderSlidePng(c: Carousel, index: number, theme: ThemeId) {
  return canvasToBlob(await renderSlide(c, index, theme));
}

/** ZIP com os slides numerados (na ordem de postagem) e a legenda. */
export async function buildCarouselZip(c: Carousel, theme: ThemeId) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (let i = 0; i < c.slides.length; i++) {
    zip.file(`${String(i + 1).padStart(2, '0')}-${c.id}.png`, await renderSlidePng(c, i, theme));
  }
  zip.file('legenda.txt', c.caption);
  return zip.generateAsync({ type: 'blob' });
}
