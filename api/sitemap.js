// /sitemap.xml (rewrite no vercel.json): páginas públicas fixas + todos os artigos públicos do blog.
import { SITE, listPublic, esc } from './_lib/blog.js';

const FIXED = ['/', '/oficina', '/mecanico', '/blog', '/cadastro/oficina', '/cadastro/mecanico', '/termos', '/privacidade'];

export async function buildSitemap() {
  const posts = await listPublic(5000);
  const day = (d) => (d ? String(d).slice(0, 10) : undefined);
  const urls = [
    ...FIXED.map(p => ({ loc: `${SITE}${p === '/' ? '' : p}`, lastmod: p === '/blog' ? day(posts[0]?.published_at) : undefined })),
    ...posts.map(p => ({ loc: `${SITE}/blog/${p.slug}`, lastmod: day(p.updated_at || p.published_at) })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

export async function GET() {
  try {
    return new Response(await buildSitemap(), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=3600' },
    });
  } catch {
    return new Response('erro ao gerar o sitemap', { status: 503 });
  }
}
