import { ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import MechanicLayout from '@/components/layout/MechanicLayout';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import AdminLayout from '@/components/layout/AdminLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ArticleCard, PartnerCard } from '@/components/paraVoce/Cards';
import {
  type Article, type Partner, PARTNER_CATEGORIES, articleCategory, contentEvent,
  loadArticles, loadPartners, readMinutes, renderArticleBody,
} from '@/lib/paraVoce';

/** Usa o layout de quem está logado (mecânico, oficina ou admin pré-visualizando). */
function RoleLayout({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  if (profile?.role === 'mechanic') return <MechanicLayout><div className="px-4 pt-4">{children}</div></MechanicLayout>;
  if (profile?.role === 'admin') return <AdminLayout>{children}</AdminLayout>;
  return <WorkshopLayout><div className="max-w-5xl mx-auto">{children}</div></WorkshopLayout>;
}

/** "Para você": todos os benefícios de parceiros e os artigos, com filtro. */
export default function ParaVoce() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('aba') === 'conteudo' ? 'conteudo' : 'beneficios';
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [cat, setCat] = useState('');

  useEffect(() => {
    loadPartners().then(setPartners);
    loadArticles().then(setArticles);
  }, []);

  const cats = PARTNER_CATEGORIES.filter(c => partners?.some(p => p.category === c.v));
  const shown = (partners ?? []).filter(p => !cat || p.category === cat);

  return (
    <RoleLayout>
      <h1 className="text-2xl font-bold tracking-tight text-steel-900">Para você</h1>
      <p className="text-sm text-steel-500 mt-1">Benefícios de parceiros e conteúdo para você trabalhar melhor.</p>

      <div className="flex gap-1 border-b border-steel-200 mt-4 mb-4">
        {([['beneficios', '🎁 Benefícios'], ['conteudo', '📰 Conteúdo']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setParams(v === 'beneficios' ? {} : { aba: v }, { replace: true })}
            className={`px-4 min-h-[44px] text-sm font-semibold border-b-2 -mb-px ${tab === v ? 'border-brand-500 text-brand-600' : 'border-transparent text-steel-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'beneficios' && (
        partners === null ? <Loading /> : partners.length === 0 ? <Nothing text="Ainda não há benefícios de parceiros. Em breve!" /> : (
          <>
            {cats.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 mb-2">
                <Chip on={!cat} onClick={() => setCat('')}>Todos</Chip>
                {cats.map(c => <Chip key={c.v} on={cat === c.v} onClick={() => setCat(c.v)}>{c.emoji} {c.label}</Chip>)}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-6">
              {shown.map(p => <PartnerCard key={p.id} p={p} />)}
            </div>
          </>
        )
      )}

      {tab === 'conteudo' && (
        articles === null ? <Loading /> : articles.length === 0 ? <Nothing text="Ainda não há artigos publicados. Em breve!" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pb-6">
            {articles.map(a => <ArticleCard key={a.id} a={a} />)}
          </div>
        )
      )}
    </RoleLayout>
  );
}

/** Leitura de um artigo dentro do app. */
export function ParaVoceArtigo() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const [a, setA] = useState<Article | null | undefined>(undefined);

  useEffect(() => {
    supabase.from('panel_articles').select('*').eq('slug', slug).maybeSingle()
      .then(({ data }) => {
        setA((data as Article) ?? null);
        if (data) contentEvent('article_read', (data as Article).id);
      });
  }, [slug]);

  return (
    <RoleLayout>
      <div className="max-w-2xl mx-auto pb-10">
        <button onClick={() => (history.length > 1 ? nav(-1) : nav('/para-voce?aba=conteudo'))}
          className="text-sm font-semibold text-steel-500 hover:text-brand-600 min-h-[44px]">← Voltar</button>
        {a === undefined ? <Loading /> : a === null ? <Nothing text="Esse artigo não está disponível." /> : (
          <article>
            {a.cover_url && <img src={a.cover_url} alt="" className="w-full rounded-2xl mb-4 max-h-80 object-cover" />}
            <div className="text-xs font-bold uppercase tracking-wide text-brand-600">{articleCategory(a.category)}</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-steel-900 mt-1 leading-tight">{a.title}</h1>
            <div className="text-sm text-steel-400 mt-2">
              {new Date(a.published_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} · {readMinutes(a.body)} min de leitura
            </div>
            {a.summary && <p className="text-lg text-steel-600 mt-4 leading-relaxed">{a.summary}</p>}
            <div className="mt-2 text-base">{renderArticleBody(a.body)}</div>
            <div className="mt-8 border-t border-steel-200 pt-4">
              <Link to="/para-voce?aba=conteudo" className="text-sm font-semibold text-brand-600">Ver outros conteúdos →</Link>
            </div>
          </article>
        )}
      </div>
    </RoleLayout>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick}
      className={`shrink-0 px-3 min-h-[40px] rounded-full text-sm font-semibold border ${on ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
      {children}
    </button>
  );
}
const Loading = () => <div className="py-10 text-center text-steel-400 text-sm">Carregando…</div>;
const Nothing = ({ text }: { text: string }) => <div className="py-10 text-center text-steel-500 text-sm bg-white border border-dashed border-steel-300 rounded-2xl">{text}</div>;
