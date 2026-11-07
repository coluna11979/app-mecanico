// Blog lido por robôs (Google, Bing, ChatGPT, Perplexity) e por prévias de link no WhatsApp.
// O app é SPA: sem isto, quem não roda JavaScript recebe uma página vazia.
// Arquivo em api/_lib: o "_" faz a Vercel não tratar como rota.

export const SITE = 'https://www.mecanicoapp.com.br';

// Chave pública (a mesma que vai no bundle do app); a leitura respeita o RLS (só artigos públicos e ativos).
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://qpwdwjzbgasjsnzpgcyo.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwd2R3anpiZ2FzanNuenBnY3lvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4OTgwMTgsImV4cCI6MjA5MjQ3NDAxOH0.79rVw6DmctEdjUVSmVEoLoHhrAvmosMh--dgFK9j2Zw';

export const CATEGORIES = {
  gestao: 'Gestão', atendimento: 'Atendimento', equipe: 'Equipe', renda: 'Renda',
  tecnica: 'Técnica', dicas: 'Dicas', novidades: 'Novidades',
};

export async function sb(query) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  if (!r.ok) throw new Error(`supabase ${r.status}`);
  return r.json();
}

// Agendados (published_at no futuro) ficam de fora até a data chegar
const live = () => `public=eq.true&active=eq.true&published_at=lte.${encodeURIComponent(new Date().toISOString())}`;

export const listPublic = (limit = 500) =>
  sb(`panel_articles?select=slug,title,summary,category,cover_url,published_at,updated_at,audience&${live()}&order=published_at.desc&limit=${limit}`);

export async function getPublic(slug) {
  const rows = await sb(`panel_articles?select=*&${live()}&slug=eq.${encodeURIComponent(slug)}&limit=1`);
  return rows[0] ?? null;
}

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const plain = (s) => String(s ?? '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

// Mesmo formato do renderArticleBody (src/lib/paraVoce.tsx): ## subtítulo, "- " lista, **negrito**, [texto](link)
function inline(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2">$1</a>');
}

export function bodyToHtml(body) {
  const blocks = String(body ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  return blocks.map(b => {
    const lines = b.split('\n');
    if (b.startsWith('## ')) return `<h2>${inline(b.slice(3))}</h2>`;
    if (lines.every(l => l.trim().startsWith('- '))) return `<ul>${lines.map(l => `<li>${inline(l.trim().slice(2))}</li>`).join('')}</ul>`;
    return `<p>${lines.map(inline).join('<br>')}</p>`;
  }).join('\n');
}

/** Perguntas da seção "## Perguntas frequentes": cada bloco começa com "**Pergunta?**" e a resposta vem embaixo. */
export function extractFaq(body) {
  const blocks = String(body ?? '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  const start = blocks.findIndex(b => /^##\s+perguntas frequentes/i.test(b));
  if (start < 0) return [];
  const faq = [];
  for (const b of blocks.slice(start + 1)) {
    if (b.startsWith('## ')) break;
    const m = b.match(/^\*\*(.+?)\*\*\s*\n?([\s\S]*)$/);
    if (m && m[2].trim()) faq.push({ q: plain(m[1]), a: plain(m[2].replace(/\n/g, ' ')) });
  }
  return faq;
}

const metaRe = (attr, name) => new RegExp(`<meta\\s+${attr}="${name}"[^>]*>\\s*`, 'gi');

/** Troca título/metas do index.html do app e coloca o conteúdo dentro do #root (o React substitui ao montar). */
export function inject(shell, { title, description, url, image, type = 'website', jsonLd = [], content, boot }) {
  let html = shell
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(metaRe('name', 'description'), '')
    .replace(metaRe('property', 'og:type'), '')
    .replace(metaRe('property', 'og:title'), '')
    .replace(metaRe('property', 'og:description'), '');

  const head = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    image ? `<meta property="og:image" content="${esc(image)}" />` : '',
    ...jsonLd.map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`),
    boot ? `<script>window.__BLOG__=${JSON.stringify(boot).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n    ');

  html = html.replace('</head>', `    ${head}\n  </head>`);
  return html.replace(/<div id="root">\s*<\/div>/, `<div id="root">${content}</div>`);
}

export const STATIC_CSS = `<style>
.seo-blog{max-width:42rem;margin:0 auto;padding:2rem 1rem;font-family:Inter,system-ui,sans-serif;color:#334155;line-height:1.7}
.seo-blog h1{font-size:1.9rem;line-height:1.2;color:#0f172a;margin:.5rem 0 1rem}
.seo-blog h2{font-size:1.25rem;color:#0f172a;margin:1.6rem 0 .4rem}
.seo-blog a{color:#ea580c}
.seo-blog img{width:100%;border-radius:1rem}
.seo-blog nav a{display:block;margin:.4rem 0}
</style>`;
