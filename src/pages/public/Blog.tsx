import ArticleCover from '@/components/paraVoce/ArticleCover';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { type Article, articleCategory, readMinutes, renderArticleBody } from '@/lib/paraVoce';

/** Blog público (sem login): atrai visitantes do Google e das redes e leva ao cadastro. */

const signup = (path: string, slug: string) => `${path}?utm_source=blog&utm_medium=artigo&utm_campaign=${encodeURIComponent(slug)}`;

function useSeo(title: string, description?: string | null) {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = meta?.content;
    if (description) {
      if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
      meta.content = description;
    }
    return () => { document.title = prev; if (meta && prevDesc !== undefined) meta.content = prevDesc; };
  }, [title, description]);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-steel-50 flex flex-col">
      <header className="bg-white border-b border-steel-200">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/" aria-label="Início"><Logo /></Link>
          <nav className="flex items-center gap-1 sm:gap-3 text-sm font-semibold">
            <Link to="/blog" className="px-2 min-h-[44px] grid place-items-center text-steel-600 hover:text-brand-600">Blog</Link>
            <Link to={signup('/cadastro/mecanico', 'menu')} className="hidden sm:grid px-2 min-h-[44px] place-items-center text-steel-600 hover:text-brand-600">Sou mecânico</Link>
            <Link to={signup('/cadastro/oficina', 'menu')} className="px-3 min-h-[40px] grid place-items-center rounded-lg bg-brand-500 text-white hover:bg-brand-600">Cadastrar</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-10">{children}</main>
      <footer className="border-t border-steel-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-6 text-sm text-steel-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>© MecânicoApp</span>
          <Link to="/termos" className="hover:text-brand-600">Termos</Link>
          <Link to="/privacidade" className="hover:text-brand-600">Privacidade</Link>
        </div>
      </footer>
    </div>
  );
}

export default function Blog() {
  const [list, setList] = useState<Article[] | null>(null);
  useSeo('Blog do MecânicoApp: dicas para mecânicos e oficinas', 'Dicas práticas para mecânicos ganharem mais e para oficinas organizarem a mão de obra.');

  useEffect(() => {
    supabase.from('panel_articles')
      .select('id, slug, title, summary, category, cover_url, body, published_at, audience, featured')
      .eq('public', true).eq('active', true)
      .order('featured', { ascending: false }).order('published_at', { ascending: false })
      .then(({ data }) => setList((data ?? []) as Article[]));
  }, []);

  return (
    <Shell>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-steel-900">Blog do MecânicoApp</h1>
      <p className="text-steel-600 mt-2 max-w-2xl">Dicas práticas para mecânicos ganharem mais e para oficinas darem conta da demanda.</p>

      {list === null ? (
        <div className="py-16 text-center text-steel-400">Carregando…</div>
      ) : list.length === 0 ? (
        <div className="py-16 text-center text-steel-500">Os primeiros artigos chegam em breve.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {list.map(a => (
            <Link key={a.id} to={`/blog/${a.slug}`} className="group bg-white border border-steel-200 rounded-2xl overflow-hidden hover:border-brand-300 transition flex flex-col">
              <div className="h-44"><ArticleCover a={a} /></div>
              <div className="p-4 flex flex-col flex-1">
                <h2 className="font-bold text-lg text-steel-900 leading-snug group-hover:text-brand-700">{a.title}</h2>
                {a.summary && <p className="text-sm text-steel-600 mt-1.5 line-clamp-3">{a.summary}</p>}
                <div className="text-xs text-steel-400 mt-auto pt-3">
                  {new Date(a.published_at).toLocaleDateString('pt-BR')} · {readMinutes(a.body)} min
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Shell>
  );
}

export function BlogPost() {
  const { slug = '' } = useParams();
  const [a, setA] = useState<Article | null | undefined>(undefined);
  useSeo(a ? `${a.title} | Blog MecânicoApp` : 'Blog MecânicoApp', a?.summary);

  useEffect(() => {
    supabase.from('panel_articles').select('*').eq('slug', slug).eq('public', true).eq('active', true).maybeSingle()
      .then(({ data }) => {
        setA((data as Article) ?? null);
        if (data) {
          const key = `blog_lido_${slug}`;
          try { if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); void supabase.rpc('blog_article_read', { p_slug: slug }); } }
          catch { void supabase.rpc('blog_article_read', { p_slug: slug }); }
        }
      });
  }, [slug]);

  return (
    <Shell>
      <div className="max-w-2xl mx-auto">
        <Link to="/blog" className="text-sm font-semibold text-steel-500 hover:text-brand-600">← Todos os artigos</Link>
        {a === undefined ? <div className="py-16 text-center text-steel-400">Carregando…</div>
          : a === null ? <div className="py-16 text-center text-steel-500">Esse artigo não está disponível.</div> : (
          <article className="mt-4">
            {a.cover_url ? (
              <>
                <img src={a.cover_url} alt="" className="w-full rounded-2xl mb-5 max-h-96 object-cover" />
                <div className="text-xs font-bold uppercase tracking-wide text-brand-600">{articleCategory(a.category)}</div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-steel-900 mt-1 leading-tight">{a.title}</h1>
              </>
            ) : (
              <div className="h-72 sm:h-80 rounded-2xl overflow-hidden"><ArticleCover a={a} variant="hero" /></div>
            )}
            <div className="text-sm text-steel-400 mt-2">
              {new Date(a.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} · {readMinutes(a.body)} min de leitura
            </div>
            {a.summary && <p className="text-lg text-steel-600 mt-5 leading-relaxed">{a.summary}</p>}
            <div className="mt-3 text-[17px]">{renderArticleBody(a.body)}</div>

            {/* Chamada para o cadastro, conforme o público do artigo */}
            <div className="mt-10 rounded-2xl p-6 text-white" style={{ background: 'radial-gradient(120% 140% at 100% 0%, rgba(255,92,10,.35) 0%, rgba(255,92,10,0) 55%), #0B1117' }}>
              <div className="font-bold text-xl">
                {a.audience === 'workshop' ? 'Precisa de reforço na oficina?' : a.audience === 'mechanic' ? 'Quer ganhar mais com o que você já sabe?' : 'Conheça o MecânicoApp'}
              </div>
              <p className="text-steel-300 text-sm mt-1">
                {a.audience === 'workshop' ? 'Chame mecânicos verificados da sua região só quando precisar.'
                  : a.audience === 'mechanic' ? 'Receba serviços de oficinas da sua região e escolha o que aceita.'
                  : 'Mecânicos verificados para oficinas, e serviços para mecânicos, na sua região.'}
              </p>
              <div className="flex gap-2 flex-wrap mt-4">
                {a.audience !== 'workshop' && <Link to={signup('/cadastro/mecanico', a.slug)} className="min-h-[44px] px-4 rounded-xl bg-brand-500 hover:bg-brand-600 font-bold grid place-items-center">Sou mecânico →</Link>}
                {a.audience !== 'mechanic' && <Link to={signup('/cadastro/oficina', a.slug)} className={`min-h-[44px] px-4 rounded-xl font-bold grid place-items-center ${a.audience === 'workshop' ? 'bg-brand-500 hover:bg-brand-600' : 'bg-white text-steel-900'}`}>Sou oficina →</Link>}
              </div>
            </div>
          </article>
        )}
      </div>
    </Shell>
  );
}
