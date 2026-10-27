import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { type Article, type Partner, contentEvent, loadArticles, loadPartners } from '@/lib/paraVoce';
import { ArticleCard, PartnerCard } from './Cards';

/**
 * Fileiras "Benefícios para você" e "Dicas e conteúdo" no painel. Cada uma
 * some sozinha quando não há nada publicado para o público de quem está logado,
 * e pode ir para uma posição diferente (ver PanelSlot).
 */

// Uma busca por sessão de tela, mesmo com as duas fileiras em lugares diferentes
let partnersReq: Promise<Partner[]> | null = null;
let articlesReq: Promise<Article[]> | null = null;

export function PartnersRow({ className = '' }: { className?: string }) {
  const { session } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  useEffect(() => {
    if (!session?.user?.id) return;
    let alive = true;
    (partnersReq ??= loadPartners()).then(p => {
      if (!alive) return;
      setPartners(p);
      p.slice(0, 6).forEach(x => contentEvent('partner_view', x.id));
    }).finally(() => { setTimeout(() => { partnersReq = null; }, 30_000); });
    return () => { alive = false; };
  }, [session?.user?.id]);

  if (!partners.length) return null;
  return (
    <Row className={className} title="🎁 Benefícios para você" more="/para-voce?aba=beneficios" count={partners.length}>
      {partners.slice(0, 8).map(p => (
        <div key={p.id} className="w-[260px] shrink-0 snap-start"><PartnerCard p={p} /></div>
      ))}
    </Row>
  );
}

export function ArticlesRow({ className = '' }: { className?: string }) {
  const { session, profile } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  useEffect(() => {
    if (!session?.user?.id) return;
    let alive = true;
    (articlesReq ??= loadArticles(profile?.role)).then(a => { if (alive) setArticles(a); })
      .finally(() => { setTimeout(() => { articlesReq = null; }, 30_000); });
    return () => { alive = false; };
  }, [session?.user?.id, profile?.role]);

  if (!articles.length) return null;
  return (
    <Row className={className} title="📰 Dicas e conteúdo" more="/para-voce?aba=conteudo" count={articles.length}>
      {articles.slice(0, 8).map(a => (
        <div key={a.id} className="w-[230px] shrink-0 snap-start"><ArticleCard a={a} compact /></div>
      ))}
    </Row>
  );
}

/** As duas fileiras juntas (benefícios e depois conteúdo). */
export default function ParaVoceRows({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-5 ${className}`}>
      <PartnersRow />
      <ArticlesRow />
    </div>
  );
}

function Row({ title, more, count, children, className = '' }: { title: string; more: string; count: number; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-steel-900">{title}</h2>
        {count > 2 && <Link to={more} className="text-sm font-semibold text-brand-600 min-h-[36px] grid place-items-center">Ver todos →</Link>}
      </div>
      <div className="flex gap-3 overflow-x-auto snap-x scroll-px-4 pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 lg:scroll-px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}
