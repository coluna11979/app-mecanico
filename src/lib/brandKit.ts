import QRCode from 'qrcode';

/**
 * Kit da marca para a gráfica: gera no navegador os arquivos de logo, ícone,
 * QR codes, paleta e panfletos (SVG vetorial + PNG em alta), sem depender de
 * arquivo hospedado. Tudo parte do mesmo desenho do <Logo />.
 */

export const PUBLIC_URL = 'https://mecanicoapp.com.br';
export const DISPLAY_DOMAIN = 'mecanicoapp.com.br';

export type Audience = 'oficina' | 'mecanico';

export const SIGNUP_PATH: Record<Audience, string> = {
  oficina: '/cadastro/oficina',
  mecanico: '/cadastro/mecanico',
};

export const LANDING_PATH: Record<Audience, string> = {
  oficina: '/oficina',
  mecanico: '/mecanico',
};

/**
 * Link de cadastro. Com rastreio, quem se cadastrar pelo impresso aparece no
 * Painel de Marketing como origem "impresso" (sem depender de campanha no banco,
 * então o QR impresso nunca quebra).
 */
export function signupUrl(a: Audience, tracked: boolean) {
  const base = `${PUBLIC_URL}${SIGNUP_PATH[a]}`;
  return tracked ? `${base}?utm_source=impresso&utm_medium=qrcode&utm_campaign=${a}` : base;
}

// ── Cores ────────────────────────────────────────────────────────────────────

export interface BrandColor { name: string; hex: string; use: string }

export const COLORS: { group: string; colors: BrandColor[] }[] = [
  { group: 'Principais', colors: [
    { name: 'Laranja MecânicoApp', hex: '#FF5C0A', use: 'Cor da marca: destaques, botões, chamadas' },
    { name: 'Grafite',             hex: '#0B1117', use: 'Fundo escuro e textos principais' },
    { name: 'Branco',              hex: '#FFFFFF', use: 'Fundos claros e texto sobre escuro' },
  ]},
  { group: 'Apoio', colors: [
    { name: 'Laranja claro',  hex: '#FF7A38', use: 'Início do degradê do ícone' },
    { name: 'Laranja escuro', hex: '#E64500', use: 'Fim do degradê, laranja sobre fundo claro' },
    { name: 'Aço',            hex: '#222C37', use: 'Blocos escuros secundários' },
    { name: 'Cinza texto',    hex: '#475567', use: 'Textos de apoio' },
    { name: 'Cinza claro',    hex: '#F5F7FA', use: 'Fundos de seção' },
    { name: 'Verde sinal',    hex: '#16C784', use: 'Só para "confirmado / disponível"' },
  ]},
];

export function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Conversão simples RGB → CMYK. É aproximada: a gráfica deve tirar prova de cor. */
export function hexToCmyk(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const f = (x: number) => Math.round(((1 - x - k) / (1 - k)) * 100);
  return { c: f(rr), m: f(gg), y: f(bb), k: Math.round(k * 100) };
}

export const rgbText = (hex: string) => { const { r, g, b } = hexToRgb(hex); return `RGB ${r}, ${g}, ${b}`; };
export const cmykText = (hex: string) => { const { c, m, y, k } = hexToCmyk(hex); return `CMYK ${c}, ${m}, ${y}, ${k}`; };

// ── Tipografia e textos ─────────────────────────────────────────────────────

export const FONTS = [
  { name: 'Space Grotesk', weight: 'Bold (700)', use: 'Títulos, logotipo e chamadas', url: 'https://fonts.google.com/specimen/Space+Grotesk' },
  { name: 'Inter',         weight: 'Regular a Bold (400–700)', use: 'Textos corridos, listas, rodapés', url: 'https://fonts.google.com/specimen/Inter' },
];

export const PHRASES: { text: string; use: string }[] = [
  { text: 'Não somos um aplicativo. Somos a infraestrutura da nova mecânica brasileira.', use: 'Institucional: bio, apresentação, imprensa' },
  { text: 'Você não precisa investir em ferramenta. Só no seu talento.', use: 'Mecânico: anúncio e chamada de cadastro' },
  { text: 'O mecânico repara um motor de R$ 80 mil por um salário que não paga as contas.', use: 'Mecânico: abertura de vídeo ou post' },
  { text: 'O problema nunca foi falta de demanda. Foi falta de organização.', use: 'Oficina: post educativo, conversa com dono' },
  { text: 'Quem dominar a mão de obra dominará o setor.', use: 'Oficina: apresentação para donos' },
  { text: 'O mundo mudou. Mas muitas oficinas ainda operam como em 1995.', use: 'Topo de funil: post provocativo' },
];

// ── Ícone e logotipo (SVG) ──────────────────────────────────────────────────

export type IconVariant = 'app' | 'laranja' | 'branco' | 'preto';

const SHAPE = 'M32 10c-7.2 0-13 5.8-13 13 0 4.6 2.4 8.6 6 10.9V50a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V33.9c3.6-2.3 6-6.3 6-10.9 0-7.2-5.8-13-13-13Zm0 6.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Z';

/** Conteúdo do ícone num quadro 64×64, com ids únicos (vários ícones no mesmo SVG). */
function iconInner(v: IconVariant, uid: string) {
  const grad = `<linearGradient id="g${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FF7A38"/><stop offset="100%" stop-color="#E64500"/></linearGradient>`;
  // O pontinho do centro é um furo: máscara, pra funcionar também sem fundo
  const mask = `<mask id="m${uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="#fff"/><circle cx="32" cy="23" r="3" fill="#000"/></mask>`;
  const fill = v === 'app' || v === 'laranja' ? `url(#g${uid})` : v === 'branco' ? '#FFFFFF' : '#0B1117';
  const bg = v === 'app' ? '<rect width="64" height="64" rx="14" fill="#0B1117"/>' : '';
  return `<defs>${grad}${mask}</defs>${bg}<path fill="${fill}" mask="url(#m${uid})" d="${SHAPE}"/>`;
}

export function iconSvg(v: IconVariant) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="1024" height="1024">${iconInner(v, v)}</svg>`;
}

export type LogoVariant = 'claro' | 'escuro' | 'preto' | 'branco';

export const LOGO_VARIANTS: { v: LogoVariant; label: string; bg: string; hint: string }[] = [
  { v: 'claro',  label: 'Para fundo claro',          bg: '#FFFFFF', hint: 'Versão principal' },
  { v: 'escuro', label: 'Para fundo escuro',         bg: '#0B1117', hint: 'Sobre grafite ou fotos escuras' },
  { v: 'preto',  label: 'Uma cor: preto',            bg: '#FFFFFF', hint: 'Carimbo, xerox, impressão 1 cor' },
  { v: 'branco', label: 'Uma cor: branco',           bg: '#FF5C0A', hint: 'Sobre o laranja ou fundos coloridos' },
];

const LOGO_FONT_PX = 40;

/** Mede o texto com a fonte real carregada na página (pra o SVG ter a largura certa). */
async function measureWordmark() {
  await ensureFonts();
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.font = `700 ${LOGO_FONT_PX}px "Space Grotesk"`;
  const w1 = ctx.measureText('Mecânico').width;
  const w2 = ctx.measureText('App').width;
  return { w1, w2 };
}

export async function ensureFonts() {
  try {
    await Promise.all([
      document.fonts.load('700 40px "Space Grotesk"'),
      document.fonts.load('400 40px "Inter"'),
      document.fonts.load('600 40px "Inter"'),
      document.fonts.load('700 40px "Inter"'),
    ]);
  } catch { /* usa a fonte de reserva */ }
}

function logoColors(v: LogoVariant) {
  return {
    icon: (v === 'claro' || v === 'escuro' ? 'app' : v) as IconVariant,
    text1: v === 'claro' || v === 'preto' ? '#0B1117' : '#FFFFFF',
    text2: v === 'claro' || v === 'escuro' ? '#FF5C0A' : v === 'preto' ? '#0B1117' : '#FFFFFF',
  };
}

export async function logoSvg(v: LogoVariant) {
  const { w1, w2 } = await measureWordmark();
  const c = logoColors(v);
  const gap = 16;
  const width = Math.ceil(64 + gap + w1 + w2 + 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 64" width="${width * 8}" height="${64 * 8}">
  <style>@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&amp;display=swap');</style>
  <g>${iconInner(c.icon, `logo-${v}`)}</g>
  <text x="${64 + gap}" y="45" font-family="'Space Grotesk', Arial, sans-serif" font-weight="700" font-size="${LOGO_FONT_PX}" letter-spacing="-0.4"><tspan fill="${c.text1}">Mecânico</tspan><tspan fill="${c.text2}">App</tspan></text>
</svg>`;
}

// ── Raster (PNG) ────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function canvasToBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('PNG falhou'))), 'image/png'));
}

/** Desenha o ícone (SVG sem texto) num canvas. */
export async function drawIcon(ctx: CanvasRenderingContext2D, v: IconVariant, x: number, y: number, size: number) {
  const img = await loadImage(svgDataUrl(iconSvg(v)));
  ctx.drawImage(img, x, y, size, size);
}

export async function iconPng(v: IconVariant, size = 2048) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  await drawIcon(c.getContext('2d')!, v, 0, 0, size);
  return canvasToBlob(c);
}

/** Logotipo em PNG transparente: o texto é desenhado no canvas com a fonte da página. */
export async function logoPng(v: LogoVariant, height = 512) {
  const { w1, w2 } = await measureWordmark();
  const s = height / 64;
  const c = document.createElement('canvas');
  c.width = Math.ceil((64 + 16 + w1 + w2 + 2) * s);
  c.height = height;
  const ctx = c.getContext('2d')!;
  const col = logoColors(v);
  await drawIcon(ctx, col.icon, 0, 0, height);
  ctx.font = `700 ${LOGO_FONT_PX * s}px "Space Grotesk"`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = col.text1;
  ctx.fillText('Mecânico', (64 + 16) * s, 45 * s);
  ctx.fillStyle = col.text2;
  ctx.fillText('App', (64 + 16 + w1) * s, 45 * s);
  return canvasToBlob(c);
}

// ── QR codes ────────────────────────────────────────────────────────────────

/** QR vetorial com o ícone no centro (correção H aguenta o miolo coberto). */
export async function qrSvg(url: string) {
  const raw = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'H', margin: 2, color: { dark: '#0B1117', light: '#FFFFFF' } });
  const n = Number(/viewBox="0 0 (\d+) \d+"/.exec(raw)?.[1] ?? 0);
  if (!n) return raw;
  const box = n * 0.22;
  const x = (n - box) / 2;
  const pad = box * 0.12;
  const logo = `<rect x="${x - pad}" y="${x - pad}" width="${box + pad * 2}" height="${box + pad * 2}" rx="${box * 0.25}" fill="#FFFFFF"/>`
    + `<svg x="${x}" y="${x}" width="${box}" height="${box}" viewBox="0 0 64 64">${iconInner('app', 'qr')}</svg>`;
  return raw.replace('</svg>', `${logo}</svg>`);
}

export async function qrCanvas(url: string, size: number) {
  const c = document.createElement('canvas');
  await QRCode.toCanvas(c, url, { errorCorrectionLevel: 'H', margin: 2, width: size, color: { dark: '#0B1117', light: '#FFFFFF' } });
  const ctx = c.getContext('2d')!;
  const box = size * 0.2;
  const x = (size - box) / 2;
  const pad = box * 0.12;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, x - pad, x - pad, box + pad * 2, box + pad * 2, box * 0.25);
  ctx.fill();
  await drawIcon(ctx, 'app', x, x, box);
  return c;
}

export async function qrPng(url: string, size = 2048) {
  return canvasToBlob(await qrCanvas(url, size));
}

// ── Paleta (imagem) ─────────────────────────────────────────────────────────

export async function palettePng() {
  await ensureFonts();
  const all = COLORS.flatMap(g => g.colors);
  const W = 2400, row = 220, H = 160 + all.length * row;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#0B1117'; ctx.font = '700 64px "Space Grotesk"';
  ctx.fillText('MecânicoApp · Paleta de cores', 80, 100);
  all.forEach((col, i) => {
    const y = 160 + i * row;
    ctx.fillStyle = col.hex; roundRect(ctx, 80, y, 360, 180, 24); ctx.fill();
    if (col.hex === '#FFFFFF' || col.hex === '#F5F7FA') { ctx.strokeStyle = '#CBD3DD'; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.fillStyle = '#0B1117'; ctx.font = '700 48px "Inter"'; ctx.fillText(col.name, 500, y + 60);
    ctx.fillStyle = '#475567'; ctx.font = '400 36px "Inter"';
    ctx.fillText(`HEX ${col.hex}   ·   ${rgbText(col.hex)}   ·   ${cmykText(col.hex)}`, 500, y + 115);
    ctx.fillStyle = '#6B7889'; ctx.font = '400 32px "Inter"'; ctx.fillText(col.use, 500, y + 162);
  });
  return canvasToBlob(c);
}

// ── Utilitários ─────────────────────────────────────────────────────────────

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function download(name: string, data: Blob | string, type = 'image/svg+xml') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── Pacote completo (.zip) ──────────────────────────────────────────────────

function readme(tracked: boolean) {
  const cores = COLORS.flatMap(g => g.colors)
    .map(c => `  ${c.name.padEnd(22)} ${c.hex}   ${rgbText(c.hex).padEnd(20)} ${cmykText(c.hex)}   (${c.use})`).join('\n');
  return `MECÂNICOAPP · KIT DA MARCA PARA A GRÁFICA
==========================================

LINKS DE CADASTRO (os QR codes levam para cá)
  Oficinas:  ${signupUrl('oficina', tracked)}
  Mecânicos: ${signupUrl('mecanico', tracked)}
  Texto para imprimir embaixo do QR: ${DISPLAY_DOMAIN}/cadastro/oficina  |  ${DISPLAY_DOMAIN}/cadastro/mecanico

PASTAS
  01-qrcodes     QR de cadastro em SVG (vetor, use este) e PNG 2048 px. Tamanho mínimo impresso: 2,5 x 2,5 cm.
  02-logotipo    Logo horizontal: fundo claro, fundo escuro, 1 cor preto, 1 cor branco (SVG + PNG transparente).
  03-icone       Só o símbolo: app (fundo grafite), laranja, branco, preto (SVG + PNG 2048 px).
  04-cores       Paleta em imagem + este resumo.
  05-panfletos   Panfletos A5 prontos (oficina e mecânico, todos os temas), PNG 300 dpi com 3 mm de sangria (154 x 216 mm).
                 Mais mensagens e formatos de rede social: painel admin > Kit da marca > Panfletos e posts.
  06-textos      Frases da marca e textos dos panfletos.

CORES
${cores}
  Degradê do símbolo: #FF7A38 -> #E64500 (diagonal, de cima/esquerda para baixo/direita)
  Os valores CMYK são aproximados (conversão automática). Peçam prova de cor antes de rodar a tiragem.

FONTES (gratuitas, Google Fonts)
  Space Grotesk Bold (700): títulos e logotipo  https://fonts.google.com/specimen/Space+Grotesk
  Inter 400 a 700: textos                       https://fonts.google.com/specimen/Inter
  Os SVGs do logotipo usam texto: instale a Space Grotesk antes de abrir (ou converta o texto em curvas).

REGRAS RÁPIDAS
  - Não distorcer, girar nem trocar as cores do logo. Use a versão certa para o fundo.
  - Deixe um espaço livre em volta do logo de pelo menos a altura do pontinho do símbolo x 4.
  - O QR code precisa de fundo branco e margem branca em volta. Teste com o celular antes de imprimir.
  - Laranja sobre branco: para textos pequenos, use o Laranja escuro (#E64500), que lê melhor.
${tracked ? `
RASTREIO
  Os QR codes têm marcação de origem "impresso". Quem se cadastrar por eles aparece no Painel de Marketing.
` : ''}`;
}

export async function buildKitZip(tracked: boolean, onProgress?: (step: string) => void) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const step = (s: string) => onProgress?.(s);

  step('QR codes');
  const q = zip.folder('01-qrcodes')!;
  for (const a of ['oficina', 'mecanico'] as Audience[]) {
    const url = signupUrl(a, tracked);
    q.file(`qr-cadastro-${a}.svg`, await qrSvg(url));
    q.file(`qr-cadastro-${a}.png`, await qrPng(url));
  }
  q.file('links.txt', `Cadastro de oficinas: ${signupUrl('oficina', tracked)}\nCadastro de mecânicos: ${signupUrl('mecanico', tracked)}\n\nPágina para oficinas: ${PUBLIC_URL}${LANDING_PATH.oficina}\nPágina para mecânicos: ${PUBLIC_URL}${LANDING_PATH.mecanico}\nSite: ${PUBLIC_URL}\n`);

  step('logotipo');
  const l = zip.folder('02-logotipo')!;
  for (const { v } of LOGO_VARIANTS) {
    l.file(`logo-${v}.svg`, await logoSvg(v));
    l.file(`logo-${v}.png`, await logoPng(v));
  }

  step('ícones');
  const i = zip.folder('03-icone')!;
  for (const v of ['app', 'laranja', 'branco', 'preto'] as IconVariant[]) {
    i.file(`icone-${v}.svg`, iconSvg(v));
    i.file(`icone-${v}.png`, await iconPng(v));
  }

  step('cores');
  const co = zip.folder('04-cores')!;
  co.file('paleta.png', await palettePng());
  co.file('cores.txt', COLORS.flatMap(g => g.colors).map(c => `${c.name}: ${c.hex} | ${rgbText(c.hex)} | ${cmykText(c.hex)}`).join('\n'));

  step('panfletos');
  const { MESSAGES, THEMES, renderPiecePng, pieceFileName } = await import('./brandPieces');
  const p = zip.folder('05-panfletos')!;
  for (const id of ['ofi-mao-de-obra', 'mec-experiencia']) {
    const message = MESSAGES.find(m => m.id === id)!;
    for (const theme of Object.keys(THEMES) as (keyof typeof THEMES)[]) {
      p.file(pieceFileName({ message, theme, format: 'a5' }), await renderPiecePng({ message, theme, format: 'a5', tracked }));
    }
  }

  step('textos');
  const msgText = (m: (typeof MESSAGES)[number]) => [
    `[${m.audience === 'oficina' ? 'OFICINA' : 'MECÂNICO'}] ${m.name}`,
    `  ${m.kicker}`,
    `  ${m.title} ${m.highlight}`,
    ...m.bullets.map(b => `  • ${b}`),
    `  QR: ${m.cta}`,
    '',
    '  Legenda:',
    ...m.caption.split('\n').map(l => `  ${l}`),
  ].join('\n');
  zip.folder('06-textos')!.file('frases-e-textos.txt', [
    'FRASES DA MARCA', '',
    PHRASES.map(f => `"${f.text}"\n  Uso: ${f.use}`).join('\n\n'), '',
    'MENSAGENS DAS PEÇAS (panfletos e posts)', '',
    MESSAGES.map(msgText).join('\n\n'),
  ].join('\n'));

  zip.file('LEIA-ME.txt', readme(tracked));

  step('compactando');
  return zip.generateAsync({ type: 'blob' });
}
