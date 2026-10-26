import { DISPLAY_DOMAIN, PUBLIC_URL, canvasToBlob, ensureFonts, roundRect } from './brandKit';
import { type ThemeId, THEMES, drawLogoLockup, layoutTokens, loadRemoteImage } from './brandPieces';
import { type Article, articleCategory } from './paraVoce';

/**
 * Post de rede social a partir de um artigo do blog: capa em cima, categoria,
 * título e resumo embaixo, e a chamada "Leia no blog". Mesmos temas do Kit.
 */

export type ArticlePostFormat = 'feed' | 'story';
export const ARTICLE_POST_FORMATS: Record<ArticlePostFormat, { label: string; hint: string; w: number; h: number }> = {
  feed:  { label: 'Feed', hint: '1080×1350', w: 1080, h: 1350 },
  story: { label: 'Story', hint: '1080×1920', w: 1080, h: 1920 },
};
export const ARTICLE_POST_THEMES: ThemeId[] = ['grafite', 'claro', 'laranja', 'impacto'];

type PostArticle = Pick<Article, 'title' | 'summary' | 'category' | 'cover_url' | 'slug'>;

const FADE: Partial<Record<ThemeId, string>> = { grafite: '#0B1117', claro: '#FFFFFF', laranja: '#F2601B', impacto: '#151C24' };

export const articleUrl = (slug: string) => `${PUBLIC_URL}/blog/${slug}`;

/** Legenda: a que a IA escreveu, ou uma montada com título e resumo. */
export function articleCaption(a: PostArticle & { social_caption?: string | null }) {
  if (a.social_caption?.trim()) return a.social_caption.trim();
  return [a.title, a.summary, '📲 Leia o artigo completo no blog: link na bio.', '#oficinamecanica #mecanico #mecanicoapp']
    .filter(Boolean).join('\n\n');
}

function lines(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  return layoutTokens(ctx, text.split(/\s+/).filter(Boolean).map(t => ({ text: t, color: '' })), maxW)
    .map(l => l.map(t => t.text).join(' '));
}

/** Corta em `max` linhas, com reticências na última. */
function clamp(ctx: CanvasRenderingContext2D, text: string, maxW: number, max: number) {
  const all = lines(ctx, text, maxW);
  if (all.length <= max) return all;
  const out = all.slice(0, max);
  let last = out[max - 1];
  while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.replace(/\s*\S+$/, '');
  out[max - 1] = last + '…';
  return out;
}

export async function renderArticlePost(a: PostArticle, theme: ThemeId, format: ArticlePostFormat, scale = 1) {
  await ensureFonts();
  const th = THEMES[theme];
  const f = ARTICLE_POST_FORMATS[format];
  const W = Math.round(f.w * scale), H = Math.round(f.h * scale);
  const u = W / 100;
  const M = u * 8;
  const innerW = W - 2 * M;
  const story = format === 'story';
  // No story, o topo e a base ficam por baixo da interface do Instagram
  const top = story ? H * 0.1 : u * 7;
  const bottom = story ? H * 0.86 : H - u * 7;

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  th.paint(ctx, W, H);

  // Capa no alto, "derretendo" no fundo do tema
  let contentTop = top + u * 22;
  if (a.cover_url) {
    const img = await loadRemoteImage(a.cover_url);
    const ih = H * (story ? 0.46 : 0.42);
    const s = Math.max(W / img.width, ih / img.height);
    const dw = img.width * s, dh = img.height * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, ih); ctx.clip();
    ctx.drawImage(img, (W - dw) / 2, (ih - dh) / 2, dw, dh);
    ctx.restore();
    const fadeColor = FADE[theme] ?? '#0B1117';
    const g = ctx.createLinearGradient(0, ih * 0.6, 0, ih);
    g.addColorStop(0, fadeColor + '00'); g.addColorStop(1, fadeColor);
    ctx.fillStyle = g; ctx.fillRect(0, ih * 0.6, W, ih * 0.4 + 1);
    contentTop = ih + u * 1;
  }

  // Logo: com capa, fica na borda onde a imagem já "derreteu" no fundo (fora do rosto)
  const logoH = u * 7.5;
  const logoY = a.cover_url ? contentTop - u - logoH * 0.6 : top;
  await drawLogoLockup(ctx, th, M, logoY, logoH);
  if (a.cover_url) contentTop = logoY + logoH + u * 2;

  // Rodapé: botão + endereço
  const btnH = u * 11;
  const footY = bottom - btnH - u * 6;

  // Categoria
  ctx.font = `700 ${u * 3.1}px "Inter"`;
  ctx.fillStyle = th.kicker;
  const catY = contentTop + u * 3.5;
  ctx.fillText(`ARTIGO · ${articleCategory(a.category).toUpperCase()}`, M, catY, innerW);

  // Título o maior possível; o resumo perde linhas (até sumir) se faltar espaço
  const sumFont = u * 3.6;
  const sumLine = sumFont * 1.4;
  const titleTop = catY + u * 2.5;
  const minSize = u * 6;
  ctx.font = `500 ${sumFont}px "Inter"`;
  const fullSummary = a.summary?.trim() ? clamp(ctx, a.summary.trim(), innerW, story ? 4 : 3) : [];
  let summary: string[] = [];
  let size = minSize;
  let tl: string[] = [];
  for (let n = fullSummary.length; n >= 0; n--) {
    ctx.font = `500 ${sumFont}px "Inter"`;
    summary = n ? clamp(ctx, a.summary!.trim(), innerW, n) : [];
    const titleMaxH = footY - u * 5 - (n ? n * sumLine + u * 4 : 0) - titleTop;
    let fits = false;
    for (size = u * (story ? 10 : 9); size >= minSize; size -= u * 0.3) {
      ctx.font = `700 ${size}px "Space Grotesk"`;
      tl = lines(ctx, a.title, innerW);
      if (tl.length * size * 1.12 <= titleMaxH) { fits = true; break; }
    }
    if (fits) break;
    size = minSize;
  }
  ctx.font = `700 ${size}px "Space Grotesk"`;
  tl = lines(ctx, a.title, innerW);
  ctx.fillStyle = th.text;
  tl.forEach((l, i) => ctx.fillText(l, M, titleTop + size * (1 + i * 1.12)));

  // Resumo
  const sumTop = titleTop + tl.length * size * 1.12 + u * 4;
  ctx.font = `500 ${sumFont}px "Inter"`;
  ctx.fillStyle = th.body;
  summary.forEach((l, i) => ctx.fillText(l, M, sumTop + sumFont + i * sumLine));

  // Botão
  const label = story ? 'Toque no link e leia' : 'Leia no blog';
  ctx.font = `700 ${u * 4.4}px "Space Grotesk"`;
  const btnW = Math.min(innerW, ctx.measureText(label).width + u * 16);
  ctx.fillStyle = th.ctaBg;
  roundRect(ctx, M, footY, btnW, btnH, btnH / 2); ctx.fill();
  ctx.fillStyle = th.ctaText;
  ctx.textBaseline = 'middle';
  ctx.fillText(`${label}  →`, M + u * 6, footY + btnH / 2);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme === 'impacto' ? '#FFFFFF' : th.muted;
  ctx.font = `600 ${u * 3.1}px "Inter"`;
  ctx.fillText(story ? `${DISPLAY_DOMAIN}/blog` : `Link na bio  ·  ${DISPLAY_DOMAIN}/blog`, M, footY + btnH + u * 6.5, innerW);

  return c;
}

export async function renderArticlePostPng(a: PostArticle, theme: ThemeId, format: ArticlePostFormat) {
  return canvasToBlob(await renderArticlePost(a, theme, format));
}

export const articlePostFileName = (slug: string, theme: ThemeId, format: ArticlePostFormat) =>
  `mecanicoapp-artigo-${slug.slice(0, 40)}-${format}-${theme}.png`;
