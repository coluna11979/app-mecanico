import ArticleCover from '@/components/paraVoce/ArticleCover';
import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { type Article, ARTICLE_CATEGORIES, articleCategory, readMinutes, renderArticleBody } from '@/lib/paraVoce';

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

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const AUDIENCE_FILTER = [
  { v: '', label: 'Todos' },
  { v: 'oficinas', label: '🏭 Oficinas', match: 'workshop' },
  { v: 'mecanicos', label: '🔧 Mecânicos', match: 'mechanic' },
] as const;

/** Cartão de artigo do blog público. */
function BlogCard({ a }: { a: Article }) {
  return (
    <Link to={`/blog/${a.slug}`} className="group bg-white border border-steel-200 rounded-2xl overflow-hidden hover:border-brand-300 transition flex flex-col">
      <div className="h-44"><ArticleCover a={a} /></div>
      <div className="p-4 flex flex-col flex-1">
        <h2 className="font-bold text-lg text-steel-900 leading-snug group-hover:text-brand-700">{a.title}</h2>
        {a.summary && <p className="text-sm text-steel-600 mt-1.5 line-clamp-3">{a.summary}</p>}
        <div className="text-xs text-steel-400 mt-auto pt-3">
          {new Date(a.published_at).toLocaleDateString('pt-BR')} · {readMinutes(a.body)} min
        </div>
      </div>
    </Link>
  );
}

export default function Blog() {
  const [list, setList] = useState<Article[] | null>(null);
  const [params, setParams] = useSearchParams();
  const cat = params.get('categoria') ?? '';
  const para = params.get('para') ?? '';
  const q = params.get('busca') ?? '';
  const catInfo = ARTICLE_CATEGORIES.find(c => c.v === cat);

  useSeo(
    catInfo ? `${catInfo.label} | Blog MecânicoApp` : 'Blog do MecânicoApp: dicas para mecânicos e oficinas',
    catInfo ? catInfo.desc : 'Dicas práticas para mecânicos ganharem mais e para oficinas organizarem a mão de obra.',
  );

  useEffect(() => {
    supabase.from('panel_articles')
      .select('id, slug, title, summary, category, cover_url, body, published_at, audience, featured')
      .eq('public', true).eq('active', true)
      .order('featured', { ascending: false }).order('published_at', { ascending: false })
      .then(({ data }) => setList((data ?? []) as Article[]));
  }, []);

  /** Atualiza o filtro na URL (dá pra compartilhar o link já filtrado). */
  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }

  const audienceMatch = AUDIENCE_FILTER.find(x => x.v === para);
  const byAudience = (list ?? []).filter(a => !audienceMatch || !('match' in audienceMatch) || a.audience === audienceMatch.match || a.audience === 'all');
  const counts = Object.fromEntries(ARTICLE_CATEGORIES.map(c => [c.v, byAudience.filter(a => a.category === c.v).length]));
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const shown = byAudience
    .filter(a => !cat || a.category === cat)
    .filter(a => !terms.length || terms.every(t => norm(`${a.title} ${a.summary ?? ''} ${a.body}`).includes(t)));

  return (
    <Shell>
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-steel-900">{catInfo ? `${catInfo.emoji} ${catInfo.label}` : 'Blog do MecânicoApp'}</h1>
      <p className="text-steel-600 mt-2 max-w-2xl">{catInfo ? catInfo.desc : 'Dicas práticas para mecânicos ganharem mais e para oficinas darem conta da demanda.'}</p>

      {/* Busca + para quem */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg viewBox="0 0 24 24" className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-steel-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input type="search" value={q} onChange={e => set('busca', e.target.value)} placeholder="Buscar artigos (ex: orçamento, agenda, renda extra)"
            className="w-full min-h-[48px] pl-10 pr-3 rounded-xl border border-steel-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div className="flex w-full sm:w-auto bg-steel-100 rounded-xl p-1 shrink-0">
          {AUDIENCE_FILTER.map(x => (
            <button key={x.v} onClick={() => set('para', x.v)}
              className={`flex-1 sm:flex-none px-3 min-h-[40px] rounded-lg text-sm font-semibold whitespace-nowrap ${para === x.v ? 'bg-white shadow text-steel-900' : 'text-steel-500'}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {/* Categorias (só as que têm artigo) */}
      <div className="flex gap-2 overflow-x-auto pb-1 mt-3 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
        <button onClick={() => set('categoria', '')}
          className={`shrink-0 px-3 min-h-[40px] rounded-full text-sm font-semibold border ${!cat ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
          Todas
        </button>
        {ARTICLE_CATEGORIES.filter(c => counts[c.v] > 0 || c.v === cat).map(c => (
          <button key={c.v} onClick={() => set('categoria', cat === c.v ? '' : c.v)}
            className={`shrink-0 px-3 min-h-[40px] rounded-full text-sm font-semibold border ${cat === c.v ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-brand-300'}`}>
            {c.emoji} {c.label} <span className="opacity-60">{counts[c.v]}</span>
          </button>
        ))}
      </div>

      {list === null ? (
        <div className="py-16 text-center text-steel-400">Carregando…</div>
      ) : list.length === 0 ? (
        <div className="py-16 text-center text-steel-500">Os primeiros artigos chegam em breve.</div>
      ) : shown.length === 0 ? (
        <div className="py-16 text-center text-steel-500">
          Nenhum artigo encontrado{q ? ` para “${q}”` : ''}.{' '}
          <button className="text-brand-600 font-semibold underline" onClick={() => setParams({}, { replace: true })}>Ver todos</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {shown.map(a => <BlogCard key={a.id} a={a} />)}
        </div>
      )}
    </Shell>
  );
}

export function BlogPost() {
  const { slug = '' } = useParams();
  const [a, setA] = useState<Article | null | undefined>(undefined);
  const [related, setRelated] = useState<Article[]>([]);
  useSeo(a ? `${a.title} | Blog MecânicoApp` : 'Blog MecânicoApp', a?.summary);

  // "Leia também": primeiro da mesma categoria, depois os mais recentes
  useEffect(() => {
    if (!a) return;
    supabase.from('panel_articles')
      .select('id, slug, title, summary, category, cover_url, body, published_at, audience')
      .eq('public', true).eq('active', true).neq('id', a.id)
      .order('published_at', { ascending: false }).limit(12)
      .then(({ data }) => {
        const rows = (data ?? []) as Article[];
        setRelated([...rows.filter(r => r.category === a.category), ...rows.filter(r => r.category !== a.category)].slice(0, 3));
      });
  }, [a]);

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
            <div className="rounded-2xl overflow-hidden"><ArticleCover a={a} variant="hero" /></div>
            <div className="text-sm text-steel-400 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link to={`/blog?categoria=${a.category}`} className="font-semibold text-brand-600 hover:underline">{articleCategory(a.category)}</Link>
              <span>·</span>
              <span>{new Date(a.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} · {readMinutes(a.body)} min de leitura</span>
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

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-bold text-steel-900 mb-4">Leia também</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {related.map(r => <BlogCard key={r.id} a={r} />)}
          </div>
        </section>
      )}
    </Shell>
  );
}
