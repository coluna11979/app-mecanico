import {
  type Audience, DISPLAY_DOMAIN, SIGNUP_PATH, canvasToBlob, ensureFonts, qrCanvas, roundRect, signupUrl,
} from './brandKit';
import {
  type FormatId, type Message, type ThemeId, type Token, FORMATS, MESSAGES, THEMES,
  drawLogoLockup, layoutTokens, renderPiece,
} from './brandPieces';

/**
 * Catálogo de material gráfico para captação: cada item sabe a sua medida,
 * desenha as páginas (frente/verso) e descreve o pedido para a gráfica.
 */

export type MaterialId =
  | 'cartao' | 'a6' | 'a5'
  | 'display' | 'adesivo' | 'a3' | 'selo'
  | 'rollup' | 'faixa';

export interface MaterialOptions {
  audience: Audience;
  messageId: string;
  theme: ThemeId;
  tracked: boolean;
  personName?: string;
  personPhone?: string;
  scale?: number;
}

export interface Material {
  id: MaterialId;
  group: 'rua' | 'balcao' | 'evento';
  name: string;
  emoji: string;
  use: string;
  size: string;                       // medida final, em texto
  mm: { w: number; h: number; bleed: number; dpi: number };
  pages: string[];                    // nomes das páginas (frente, verso)
  colors: string;                     // 4x0, 4x4
  paper: string;
  finish: string;
  qty: string;
  options: { audience: boolean; message: boolean; theme: boolean; person?: boolean };
  render: (o: MaterialOptions) => Promise<HTMLCanvasElement[]>;
}

export const GROUPS: { id: Material['group']; label: string; hint: string }[] = [
  { id: 'rua',    label: 'Para levar na rua',      hint: 'Entregar na mão em oficinas, autopeças e pontos de mecânicos' },
  { id: 'balcao', label: 'Para deixar no balcão',  hint: 'Fica exposto em oficinas parceiras, autopeças e distribuidores' },
  { id: 'evento', label: 'Para eventos e fachada', hint: 'Feiras, encontros automotivos, frente de loja' },
];

const px = (mm: number, dpi: number) => Math.round((mm / 25.4) * dpi);

function canvasFor(m: Material['mm'], scale = 1) {
  const c = document.createElement('canvas');
  c.width = Math.round(px(m.w + 2 * m.bleed, m.dpi) * scale);
  c.height = Math.round(px(m.h + 2 * m.bleed, m.dpi) * scale);
  return c;
}

const msgFor = (o: MaterialOptions) =>
  MESSAGES.find(m => m.id === o.messageId && m.audience === o.audience) ?? MESSAGES.find(m => m.audience === o.audience)!;

const pieceFrom = (format: FormatId) => async (o: MaterialOptions) =>
  [await renderPiece({ message: msgFor(o), theme: o.theme, format, tracked: o.tracked, scale: o.scale })];

const short = (a: Audience) => `${DISPLAY_DOMAIN}${SIGNUP_PATH[a]}`;

function fitText(ctx: CanvasRenderingContext2D, tokens: Token[], maxW: number, maxH: number, start: number, min: number, weight = 700, family = 'Space Grotesk', lh = 1.12) {
  let size = start;
  let lines: Token[][] = [];
  for (; size > min; size *= 0.95) {
    ctx.font = `${weight} ${size}px "${family}"`;
    lines = layoutTokens(ctx, tokens, maxW);
    if (lines.length * size * lh <= maxH && lines.every(l => ctx.measureText(l.map(t => t.text).join(' ')).width <= maxW)) break;
  }
  ctx.font = `${weight} ${size}px "${family}"`;
  return { size, lines };
}

function drawLines(ctx: CanvasRenderingContext2D, lines: Token[][], x: number, y: number, size: number, lh = 1.12, align: 'left' | 'center' = 'left', boxW = 0) {
  const space = ctx.measureText(' ').width;
  lines.forEach((line, i) => {
    const lineW = line.reduce((w, t, j) => w + ctx.measureText(t.text).width + (j ? space : 0), 0);
    let xx = align === 'center' ? x + (boxW - lineW) / 2 : x;
    for (const t of line) {
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, xx, y + size * (1 + i * lh));
      xx += ctx.measureText(t.text).width + space;
    }
  });
  return y + size * (1 + (lines.length - 1) * lh) + size * 0.3;
}

const tok = (text: string, color: string): Token[] => text.split(/\s+/).filter(Boolean).map(t => ({ text: t, color }));

// ── Cartão de visita ────────────────────────────────────────────────────────

async function renderCartao(o: MaterialOptions, m: Material['mm']) {
  await ensureFonts();
  const s = o.scale ?? 1;
  const th = THEMES[o.theme];

  // Frente: logo, frase e (opcional) contato de quem entrega
  const front = canvasFor(m, s);
  const W = front.width, H = front.height, B = px(m.bleed, m.dpi) * s, u = W / 100;
  const f = front.getContext('2d')!;
  th.paint(f, W, H);
  const M = B + u * 7;
  await drawLogoLockup(f, th, M, B + u * 7, u * 10);
  f.fillStyle = th.text;
  const hasPerson = !!(o.personName?.trim() || o.personPhone?.trim());
  const tagline = fitText(f, [...tok('Mão de obra automotiva', th.text), ...tok('sob demanda.', th.highlight)],
    W - 2 * M, hasPerson ? u * 11 : u * 18, u * (hasPerson ? 5.4 : 7), u * 3);
  drawLines(f, tagline.lines, M, B + u * 19, tagline.size);
  const name = o.personName?.trim(), phone = o.personPhone?.trim();
  f.font = `600 ${u * 3.6}px "Inter"`;
  f.fillStyle = th.body;
  if (name || phone) {
    f.font = `700 ${u * 4.2}px "Inter"`; f.fillStyle = th.text;
    if (name) f.fillText(name, M, H - B - u * 14, W - 2 * M);
    f.font = `500 ${u * 3.4}px "Inter"`; f.fillStyle = th.body;
    if (phone) f.fillText(`WhatsApp ${phone}`, M, H - B - u * 9, W - 2 * M);
  }
  f.font = `600 ${u * 3.4}px "Inter"`; f.fillStyle = th.muted;
  f.fillText(DISPLAY_DOMAIN, M, H - B - u * 4.5);

  // Verso: dois QR, um pra cada público
  const back = canvasFor(m, s);
  const b = back.getContext('2d')!;
  b.fillStyle = '#FFFFFF'; b.fillRect(0, 0, W, H);
  b.fillStyle = '#FF5C0A'; b.fillRect(0, H - B - u * 2.2, W, u * 2.2 + B);
  b.textBaseline = 'alphabetic';
  b.font = `700 ${u * 4.2}px "Space Grotesk"`;
  b.fillStyle = '#0B1117';
  b.textAlign = 'center';
  b.fillText('Cadastre-se pelo celular', W / 2, B + u * 10);
  b.textAlign = 'left';
  const qr = Math.round(u * 28);
  const cols: [Audience, string][] = [['oficina', 'Sou oficina'], ['mecanico', 'Sou mecânico']];
  for (let i = 0; i < 2; i++) {
    const [a, label] = cols[i];
    const gap = u * 16;
    const x = (W - (2 * qr + gap)) / 2 + i * (qr + gap);
    b.drawImage(await qrCanvas(signupUrl(a, o.tracked), qr), x, B + u * 14, qr, qr);
    b.font = `700 ${u * 3.8}px "Inter"`; b.fillStyle = '#0B1117';
    b.textAlign = 'center';
    b.fillText(label, x + qr / 2, B + u * 14 + qr + u * 5);
    b.textAlign = 'left';
  }
  return [front, back];
}

// ── Adesivo QR (quadrado) ───────────────────────────────────────────────────

async function renderAdesivo(o: MaterialOptions, m: Material['mm']) {
  await ensureFonts();
  const th = THEMES[o.theme];
  const c = canvasFor(m, o.scale ?? 1);
  const W = c.width, H = c.height, B = px(m.bleed, m.dpi) * (o.scale ?? 1), u = W / 100;
  const ctx = c.getContext('2d')!;
  th.paint(ctx, W, H);
  const M = B + u * 7;
  await drawLogoLockup(ctx, th, M, B + u * 6, u * 8);
  const t = fitText(ctx, o.audience === 'oficina'
    ? [...tok('Oficina?', th.text), ...tok('Cadastre-se aqui.', th.highlight)]
    : [...tok('Mecânico?', th.text), ...tok('Ganhe renda extra.', th.highlight)], W - 2 * M, u * 16, u * 8, u * 4);
  drawLines(ctx, t.lines, M, B + u * 17, t.size);
  const card = u * 52;
  const cx = (W - card) / 2, cy = H - B - u * 7 - card;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, cx, cy, card, card, u * 4); ctx.fill();
  const q = Math.round(card - u * 6);
  ctx.drawImage(await qrCanvas(signupUrl(o.audience, o.tracked), q), cx + u * 3, cy + u * 3, q, q);
  ctx.font = `600 ${u * 2.6}px "Inter"`;
  ctx.fillStyle = th.muted;
  ctx.textAlign = 'center';
  ctx.fillText(short(o.audience), W / 2, H - B - u * 3);
  ctx.textAlign = 'left';
  return [c];
}

// ── Selo "Oficina parceira" (redondo) ───────────────────────────────────────

async function renderSelo(o: MaterialOptions, m: Material['mm']) {
  await ensureFonts();
  const s = o.scale ?? 1;
  const c = canvasFor(m, s);
  const W = c.width, H = c.height, u = W / 100;
  const ctx = c.getContext('2d')!;
  const r = W / 2;
  // Fundo (o corte é redondo; a sangria fica fora do círculo)
  ctx.fillStyle = '#FF5C0A'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0B1117';
  ctx.beginPath(); ctx.arc(r, r, r - px(m.bleed, m.dpi) * s - u * 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FF7A38';
  ctx.font = `700 ${u * 4.6}px "Inter"`;
  ctx.fillText('OFICINA PARCEIRA', r, u * 22);
  // Logo centralizado
  const lh = u * 8;
  ctx.font = `700 ${lh * 0.575}px "Space Grotesk"`;
  const lw = lh * 1.275 + ctx.measureText('MecânicoApp').width;
  ctx.textAlign = 'left';
  await drawLogoLockup(ctx, THEMES.grafite, r - lw / 2, u * 25, lh);
  // QR para mecânicos
  const q = Math.round(u * 34);
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, r - q / 2 - u * 2, u * 37, q + u * 4, q + u * 4, u * 3); ctx.fill();
  ctx.drawImage(await qrCanvas(signupUrl('mecanico', o.tracked), q), r - q / 2, u * 39, q, q);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `700 ${u * 4.4}px "Space Grotesk"`;
  ctx.fillText('Mecânico? Escaneie', r, u * 82);
  ctx.fillText('e trabalhe com a gente', r, u * 87.5);
  ctx.textAlign = 'left';
  return [c];
}

// ── Faixa horizontal ────────────────────────────────────────────────────────

async function renderFaixa(o: MaterialOptions, m: Material['mm']) {
  await ensureFonts();
  const th = THEMES[o.theme];
  const msg = msgFor(o);
  const c = canvasFor(m, o.scale ?? 1);
  const W = c.width, H = c.height, v = H / 100;          // aqui a unidade é 1% da ALTURA
  const ctx = c.getContext('2d')!;
  th.paint(ctx, W, H);
  const M = v * 10;
  await drawLogoLockup(ctx, th, M, v * 10, v * 13);
  const card = v * 76;
  const textW = W - M * 3 - card;
  const t = fitText(ctx, [...tok(msg.title, th.text), ...tok(msg.highlight, th.highlight)], textW, v * 42, v * 18, v * 6);
  const after = drawLines(ctx, t.lines, M, v * 28, t.size);
  ctx.font = `500 ${v * 5.6}px "Inter"`;
  msg.bullets.filter(Boolean).slice(0, 3).forEach((b, i) => {
    const y = after + v * 6 + i * v * 9;
    ctx.fillStyle = th.dot; ctx.beginPath(); ctx.arc(M + v * 2, y - v * 2, v * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = th.body; ctx.fillText(b, M + v * 6, y, textW - v * 6);
  });
  const cx = W - M - card, cy = (H - card) / 2 - v * 3;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, cx, cy, card, card, v * 5); ctx.fill();
  const q = Math.round(card - v * 8);
  ctx.drawImage(await qrCanvas(signupUrl(o.audience, o.tracked), q), cx + v * 4, cy + v * 4, q, q);
  ctx.textAlign = 'center';
  ctx.font = `700 ${v * 5}px "Inter"`;
  ctx.fillStyle = o.theme === 'claro' ? '#0B1117' : '#FFFFFF';
  if (o.theme === 'impacto') ctx.fillStyle = '#0B1117';
  ctx.fillText(short(o.audience), cx + card / 2, cy + card + v * 7);
  ctx.textAlign = 'left';
  return [c];
}

// ── Catálogo ────────────────────────────────────────────────────────────────

const fromFormat = (id: FormatId) => FORMATS[id].mm!;

function item(m: Omit<Material, 'render'> & { render?: Material['render'] }, render: (o: MaterialOptions, mm: Material['mm']) => Promise<HTMLCanvasElement[]>): Material {
  return { ...m, render: o => render(o, m.mm) };
}

export const MATERIALS: Material[] = [
  item({
    id: 'cartao', group: 'rua', name: 'Cartão de visita', emoji: '🪪',
    use: 'Para quem vai a campo: frente com a marca (e seu nome, se quiser), verso com os dois QR de cadastro.',
    size: '9 × 5 cm', mm: { w: 90, h: 50, bleed: 3, dpi: 300 }, pages: ['frente', 'verso'],
    colors: '4x4 (colorido frente e verso)', paper: 'Couché 300 g', finish: 'Laminação fosca frente e verso', qty: '500 a 1.000 por pessoa',
    options: { audience: false, message: false, theme: true, person: true },
  }, renderCartao),
  item({
    id: 'a6', group: 'rua', name: 'Flyer de bolso (A6)', emoji: '📄',
    use: 'Barato para distribuir em quantidade: entregar na mão, deixar no para-brisa, colocar em sacolas de autopeças.',
    size: '10,5 × 14,8 cm', mm: fromFormat('a6'), pages: ['frente'],
    colors: '4x0 (colorido só na frente)', paper: 'Couché brilho 90 g', finish: 'Sem acabamento', qty: '2.500 a 10.000',
    options: { audience: true, message: true, theme: true },
  }, pieceFrom('a6')),
  item({
    id: 'a5', group: 'rua', name: 'Panfleto (A5)', emoji: '📰',
    use: 'Mais espaço para a mensagem. Bom para visitas a oficinas, explicando como funciona.',
    size: '14,8 × 21 cm', mm: fromFormat('a5'), pages: ['frente'],
    colors: '4x0', paper: 'Couché brilho 115 g', finish: 'Sem acabamento', qty: '1.000 a 5.000',
    options: { audience: true, message: true, theme: true },
  }, pieceFrom('a5')),
  item({
    id: 'display', group: 'balcao', name: 'Display de balcão', emoji: '🪧',
    use: 'Fica em pé no balcão de autopeças e oficinas parceiras, com o QR à vista de quem passa.',
    size: '10 × 15 cm', mm: fromFormat('display'), pages: ['frente'],
    colors: '4x0', paper: 'Papel 300 g', finish: 'Laminação fosca + suporte acrílico de mesa (10×15)', qty: '50 a 100',
    options: { audience: true, message: true, theme: true },
  }, pieceFrom('display')),
  item({
    id: 'adesivo', group: 'balcao', name: 'Adesivo QR', emoji: '🔲',
    use: 'Colar em balcão, vitrine, máquina de café ou mural de autopeças. Pequeno e sempre à vista.',
    size: '10 × 10 cm', mm: { w: 100, h: 100, bleed: 2, dpi: 300 }, pages: ['frente'],
    colors: '4x0', paper: 'Vinil adesivo branco', finish: 'Laminação brilho, corte reto', qty: '100 a 500',
    options: { audience: true, message: false, theme: true },
  }, renderAdesivo),
  item({
    id: 'a3', group: 'balcao', name: 'Cartaz (A3)', emoji: '🖼️',
    use: 'Para mural e parede de oficinas, autopeças, escolas técnicas (SENAI) e pontos de encontro de mecânicos.',
    size: '29,7 × 42 cm', mm: fromFormat('a3'), pages: ['frente'],
    colors: '4x0', paper: 'Couché 150 g', finish: 'Sem acabamento', qty: '50 a 200',
    options: { audience: true, message: true, theme: true },
  }, pieceFrom('a3')),
  item({
    id: 'selo', group: 'balcao', name: 'Selo "Oficina parceira"', emoji: '🏅',
    use: 'Para a oficina cadastrada colar na vitrine: mostra que ela é parceira e chama mecânicos com o QR.',
    size: 'Ø 12 cm (redondo)', mm: { w: 120, h: 120, bleed: 2, dpi: 300 }, pages: ['frente'],
    colors: '4x0', paper: 'Vinil adesivo branco', finish: 'Laminação + corte especial redondo (faca)', qty: '50 a 200',
    options: { audience: false, message: false, theme: false },
  }, renderSelo),
  item({
    id: 'rollup', group: 'evento', name: 'Banner roll-up', emoji: '🎌',
    use: 'Para feiras, eventos e encontros automotivos. Monta em 1 minuto e leva na mala do carro.',
    size: '80 × 200 cm', mm: fromFormat('rollup'), pages: ['frente'],
    colors: '4x0', paper: 'Lona/banner 440 g', finish: 'Com estrutura roll-up de alumínio e bolsa', qty: '1 a 3',
    options: { audience: true, message: true, theme: true },
  }, pieceFrom('rollup')),
  item({
    id: 'faixa', group: 'evento', name: 'Faixa de lona', emoji: '🏁',
    use: 'Para fachada, grade ou estande. Lê de longe e tem QR grande.',
    size: '300 × 100 cm', mm: { w: 3000, h: 1000, bleed: 0, dpi: 50 }, pages: ['frente'],
    colors: '4x0', paper: 'Lona 440 g', finish: 'Bainha e ilhós nos cantos', qty: '1 a 5',
    options: { audience: true, message: true, theme: true },
  }, renderFaixa),
];

export const materialById = (id: MaterialId) => MATERIALS.find(m => m.id === id)!;

// ── Pedido e PDF ────────────────────────────────────────────────────────────

export function orderText(m: Material) {
  const sided = m.pages.length > 1 ? ' (2 páginas: frente e verso)' : '';
  return [
    `Olá! Gostaria de um orçamento para imprimir:`,
    ``,
    `*${m.name}*`,
    `• Tamanho final: ${m.size}`,
    `• Arquivo: PDF${sided}${m.mm.bleed ? ` com ${m.mm.bleed} mm de sangria` : ''}, em anexo`,
    `• Cores: ${m.colors}`,
    `• Material: ${m.paper}`,
    `• Acabamento: ${m.finish}`,
    `• Quantidade: ${m.qty}`,
    ``,
    `Podem me mandar uma prova antes de imprimir? Obrigado!`,
  ].join('\n');
}

export async function materialPdf(m: Material, o: MaterialOptions) {
  const { jsPDF } = await import('jspdf');
  const pages = await m.render({ ...o, scale: 1 });
  const w = m.mm.w + 2 * m.mm.bleed, h = m.mm.h + 2 * m.mm.bleed;
  const doc = new jsPDF({ unit: 'mm', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
  pages.forEach((c, i) => {
    if (i > 0) doc.addPage([w, h], w > h ? 'landscape' : 'portrait');
    // Peça grande vai em JPEG de alta qualidade pra o arquivo não ficar enorme
    const big = c.width * c.height > 6_000_000;
    doc.addImage(c.toDataURL(big ? 'image/jpeg' : 'image/png', 0.93), big ? 'JPEG' : 'PNG', 0, 0, w, h, undefined, 'FAST');
  });
  doc.setProperties({ title: `MecânicoApp — ${m.name}`, creator: 'MecânicoApp' });
  return doc.output('blob');
}

export async function materialPngs(m: Material, o: MaterialOptions) {
  const pages = await m.render({ ...o, scale: 1 });
  return Promise.all(pages.map(canvasToBlob));
}

export const materialFileBase = (m: Material, o: MaterialOptions) =>
  `${m.id}${m.options.audience ? `-${o.audience}` : ''}${m.options.message ? `-${o.messageId.replace(/^(ofi|mec)-/, '')}` : ''}${m.options.theme ? `-${o.theme}` : ''}`;

export function defaultOptions(audience: Audience = 'oficina', tracked = true): MaterialOptions {
  return { audience, messageId: audience === 'oficina' ? 'ofi-mao-de-obra' : 'mec-experiencia', theme: 'grafite', tracked };
}

/** Arsenal completo: PDF de cada item (nos dois públicos quando faz sentido) + pedidos. */
export async function buildArsenalZip(tracked: boolean, theme: ThemeId, onProgress?: (done: number, total: number) => void) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const jobs: { m: Material; o: MaterialOptions; folder: string }[] = [];
  MATERIALS.forEach((m, i) => {
    const folder = `${String(i + 1).padStart(2, '0')}-${m.id}`;
    const auds: Audience[] = m.options.audience ? ['oficina', 'mecanico'] : ['oficina'];
    for (const a of auds) jobs.push({ m, o: { ...defaultOptions(a, tracked), theme }, folder });
  });
  let done = 0;
  for (const j of jobs) {
    const f = zip.folder(j.folder)!;
    f.file(`${materialFileBase(j.m, j.o)}.pdf`, await materialPdf(j.m, j.o));
    f.file('pedido-para-grafica.txt', orderText(j.m));
    onProgress?.(++done, jobs.length);
  }
  zip.file('LEIA-ME.txt', [
    'MECÂNICOAPP · ARSENAL DE MATERIAL GRÁFICO', '',
    'Cada pasta tem o PDF pronto para a gráfica (com sangria) e o texto do pedido.',
    'Para outras mensagens, temas ou para colocar o nome no cartão: painel admin > Material gráfico.', '',
    ...MATERIALS.map(m => `${m.name.padEnd(28)} ${m.size.padEnd(20)} ${m.paper}`),
  ].join('\n'));
  return zip.generateAsync({ type: 'blob' });
}

export type { Message };
