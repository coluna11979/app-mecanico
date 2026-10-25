import { canvasToBlob, ensureFonts } from './brandKit';
import { type ThemeId, THEMES } from './brandPieces';

/**
 * Capas de destaque do Instagram (1080×1920). O Instagram corta um círculo
 * no centro, então o ícone fica no meio e nada importante vai pras bordas.
 */

export interface Highlight {
  id: string;
  name: string;            // nome sugerido do destaque no Instagram
  hint: string;            // o que guardar dentro
  paths: string[];         // ícone em traço, viewBox 24×24
}

export const HIGHLIGHTS: Highlight[] = [
  { id: 'cadastro', name: 'Cadastro', hint: 'Passo a passo do cadastro, com o link no sticker',
    paths: ['M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2z', 'M11 18h2', 'M12 7v6', 'M9 10h6'] },
  { id: 'mecanico', name: 'Mecânico', hint: 'Como funciona para o mecânico, renda extra',
    paths: ['M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z'] },
  { id: 'oficina', name: 'Oficina', hint: 'Como chamar reforço, oficinas fundadoras',
    paths: ['M3 21V9l9-6 9 6v12', 'M7 21v-7h10v7', 'M7 17.5h10'] },
  { id: 'como-funciona', name: 'Como funciona', hint: 'Os carrosséis "Como funciona"',
    paths: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M10 8.5l5.5 3.5-5.5 3.5z'] },
  { id: 'duvidas', name: 'Dúvidas', hint: 'Perguntas frequentes, uma por story',
    paths: ['M12 3a9 9 0 100 18 9 9 0 000-18z', 'M9.2 9.3a2.9 2.9 0 015.6 1c0 1.9-2.8 2.6-2.8 4', 'M12 17.6h.01'] },
  { id: 'avaliacoes', name: 'Avaliações', hint: 'Prints de oficinas e mecânicos satisfeitos',
    paths: ['M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z'] },
  { id: 'novidades', name: 'Novidades', hint: 'Lançamentos e funções novas do app',
    paths: ['M12 2.5c.6 4.6 2.9 6.9 7.5 7.5-4.6.6-6.9 2.9-7.5 7.5-.6-4.6-2.9-6.9-7.5-7.5 4.6-.6 6.9-2.9 7.5-7.5z', 'M19 16.5c.25 1.9 1.1 2.75 3 3-1.9.25-2.75 1.1-3 3-.25-1.9-1.1-2.75-3-3 1.9-.25 2.75-1.1 3-3z'] },
  { id: 'parceiros', name: 'Parceiros', hint: 'Oficinas com o selo "Oficina parceira"',
    paths: ['M12 2.5l7.5 3v6c0 4.6-3.2 8.4-7.5 10-4.3-1.6-7.5-5.4-7.5-10v-6z', 'M8.5 12l2.4 2.4 4.6-4.8'] },
  { id: 'contato', name: 'Contato', hint: 'WhatsApp e e-mail de suporte',
    paths: ['M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-5 4V6a1 1 0 011-1z', 'M8 10h8', 'M8 13h5'] },
];

const W = 1080, H = 1920;

export async function renderHighlight(h: Highlight, theme: ThemeId, withLabel: boolean, scale = 1) {
  await ensureFonts();
  const th = THEMES[theme];
  const c = document.createElement('canvas');
  c.width = Math.round(W * scale); c.height = Math.round(H * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);
  th.paint(ctx, W, H);

  const cx = W / 2, cy = H / 2;
  // Disco central: dá contraste e mostra onde o Instagram vai cortar
  ctx.fillStyle = theme === 'claro' ? '#FFF4ED' : theme === 'laranja' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.arc(cx, cy, 450, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = th.highlight; ctx.globalAlpha = 0.5; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.arc(cx, cy, 450, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;

  // Ícone em traço, centralizado (sobe um pouco quando tem nome embaixo)
  const size = withLabel ? 400 : 540;
  const iy = withLabel ? cy - 80 : cy;
  ctx.save();
  ctx.translate(cx - size / 2, iy - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = theme === 'laranja' ? '#FFFFFF' : th.highlight;
  ctx.lineWidth = 1.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const d of h.paths) ctx.stroke(new Path2D(d));
  ctx.restore();

  if (withLabel) {
    ctx.fillStyle = th.text;
    ctx.font = '700 72px "Space Grotesk"';
    ctx.textAlign = 'center';
    ctx.fillText(h.name.toUpperCase(), cx, cy + 270, 620);
    ctx.textAlign = 'left';
  }
  return c;
}

export async function renderHighlightPng(h: Highlight, theme: ThemeId, withLabel: boolean) {
  return canvasToBlob(await renderHighlight(h, theme, withLabel));
}

export async function buildHighlightsZip(theme: ThemeId, withLabel: boolean) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const [i, h] of HIGHLIGHTS.entries()) {
    zip.file(`${String(i + 1).padStart(2, '0')}-destaque-${h.id}.png`, await renderHighlightPng(h, theme, withLabel));
  }
  zip.file('LEIA-ME.txt', [
    'CAPAS DE DESTAQUE DO INSTAGRAM',
    '',
    'Como usar: no perfil, toque em "Novo" nos destaques (ou segure um destaque > Editar destaque > Editar capa)',
    'e escolha a imagem. O Instagram corta o círculo do meio, que já está marcado na imagem.',
    '',
    ...HIGHLIGHTS.map(h => `${h.name.padEnd(15)} ${h.hint}`),
  ].join('\n'));
  return zip.generateAsync({ type: 'blob' });
}
