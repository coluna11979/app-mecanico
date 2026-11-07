// /blog e /blog/:slug chegam aqui (rewrite no vercel.json). Devolve o index.html do app com
// título, metas, JSON-LD e o texto do artigo já no HTML: robô lê sem JavaScript; o React monta por cima.
import { SITE, CATEGORIES, listPublic, getPublic, bodyToHtml, extractFaq, inject, esc, STATIC_CSS } from './_lib/blog.js';

export async function renderBlog(shell, slug) {
  if (!slug) {
    const posts = await listPublic(100);
    const content = `${STATIC_CSS}<main class="seo-blog"><h1>Blog MecânicoApp</h1>
<p>Gestão de oficina, atendimento, equipe e renda para quem vive de mecânica.</p>
<nav>${posts.map(p => `<a href="/blog/${esc(p.slug)}">${esc(p.title)}</a>`).join('\n')}</nav></main>`;
    return {
      status: 200,
      html: inject(shell, {
        title: 'Blog MecânicoApp — gestão de oficina e carreira de mecânico',
        description: 'Artigos práticos para donos de oficina e mecânicos: orçamento, atendimento, equipe, gestão e renda.',
        url: `${SITE}/blog`,
        jsonLd: [{
          '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog MecânicoApp', url: `${SITE}/blog`,
          blogPost: posts.slice(0, 20).map(p => ({ '@type': 'BlogPosting', headline: p.title, url: `${SITE}/blog/${p.slug}`, datePublished: p.published_at })),
        }],
        content,
      }),
    };
  }

  const a = await getPublic(slug);
  if (!a) return { status: 404, html: inject(shell, { title: 'Artigo não encontrado | Blog MecânicoApp', description: 'Esse artigo não está disponível.', url: `${SITE}/blog`, content: '' }) };

  const url = `${SITE}/blog/${a.slug}`;
  const description = a.summary || String(a.body).slice(0, 155);
  const faq = extractFaq(a.body);
  const jsonLd = [{
    '@context': 'https://schema.org', '@type': 'BlogPosting',
    headline: a.title, description, url, mainEntityOfPage: url,
    image: a.cover_url || undefined,
    datePublished: a.published_at, dateModified: a.updated_at || a.published_at,
    articleSection: CATEGORIES[a.category] || a.category, inLanguage: 'pt-BR',
    author: { '@type': 'Organization', name: 'MecânicoApp', url: SITE },
    publisher: { '@type': 'Organization', name: 'MecânicoApp', url: SITE, logo: { '@type': 'ImageObject', url: `${SITE}/pwa-512.svg` } },
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Blog', item: `${SITE}/blog` },
      { '@type': 'ListItem', position: 2, name: a.title, item: url },
    ],
  }];
  if (faq.length) jsonLd.push({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  });

  const cta = a.audience === 'workshop'
    ? `<p><a href="/cadastro/oficina?utm_source=blog&amp;utm_medium=artigo&amp;utm_campaign=${esc(a.slug)}">Precisa de reforço na oficina? Cadastre sua oficina</a></p>`
    : a.audience === 'mechanic'
      ? `<p><a href="/cadastro/mecanico?utm_source=blog&amp;utm_medium=artigo&amp;utm_campaign=${esc(a.slug)}">Quer receber serviços de oficinas da sua região? Cadastre-se</a></p>`
      : `<p><a href="/cadastro/oficina">Sou oficina</a> · <a href="/cadastro/mecanico">Sou mecânico</a></p>`;

  const content = `${STATIC_CSS}<main class="seo-blog"><article>
<p><a href="/blog">Blog</a> · ${esc(CATEGORIES[a.category] || a.category)}</p>
<h1>${esc(a.title)}</h1>
${a.cover_url ? `<img src="${esc(a.cover_url)}" alt="${esc(a.title)}">` : ''}
${a.summary ? `<p><strong>${esc(a.summary)}</strong></p>` : ''}
${bodyToHtml(a.body)}
${cta}
</article></main>`;

  return {
    status: 200,
    html: inject(shell, {
      title: `${a.title} | Blog MecânicoApp`, description, url, image: a.cover_url, type: 'article', jsonLd, content,
      boot: { slug: a.slug, article: a },
    }),
  };
}

export async function GET(request) {
  const u = new URL(request.url);
  const slug = (u.searchParams.get('slug') || '').replace(/[^a-z0-9-]/gi, '').slice(0, 200);
  const shellRes = await fetch(new URL('/index.html', u.origin));
  const shell = await shellRes.text();
  try {
    const { status, html } = await renderBlog(shell, slug);
    return new Response(html, {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=600, stale-while-revalidate=86400',
      },
    });
  } catch {
    // Supabase fora: entrega o app normal, o React busca o artigo sozinho
    return new Response(shell, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}
