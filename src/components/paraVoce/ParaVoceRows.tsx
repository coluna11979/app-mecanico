import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { type Article, type Partner, contentEvent, loadArticles, loadPartners } from '@/lib/paraVoce';
import { ArticleCard, PartnerCard } from './Cards';

/**
 * Fileiras "Benefícios para você" e "Dicas e conteúdo" no painel.
 * Some sozinha quando não há nada publicado para o público de quem está logado.
 */
export default function ParaVoceRows({ className = '' }: { className?: string }) {
  const { session } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);

  useEffect(() => {
    if (!session?.user?.id) return;
    let alive = true;
    Promise.all([loadPartners(), loadArticles()]).then(([p, a]) => {
      if (!alive) return;
      setPartners(p);
      setArticles(a);
      p.slice(0, 6).forEach(x => contentEvent('partner_view', x.id));
    });
    return () => { alive = false; };
  }, [session?.user?.id]);

  if (!partners.length && !articles.length) return null;

  return (
    <div className={`space-y-5 ${className}`}>
      {partners.length > 0 && (
        <Row title="🎁 Benefícios para você" more="/para-voce?aba=beneficios" count={partners.length}>
          {partners.slice(0, 8).map(p => (
            <div key={p.id} className="w-[260px] shrink-0 snap-start"><PartnerCard p={p} /></div>
          ))}
        </Row>
      )}
      {articles.length > 0 && (
        <Row title="📰 Dicas e conteúdo" more="/para-voce?aba=conteudo" count={articles.length}>
          {articles.slice(0, 8).map(a => (
            <div key={a.id} className="w-[230px] shrink-0 snap-start"><ArticleCard a={a} compact /></div>
          ))}
        </Row>
      )}
    </div>
  );
}

function Row({ title, more, count, children }: { title: string; more: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-bold text-steel-900">{title}</h2>
        {count > 2 && <Link to={more} className="text-sm font-semibold text-brand-600 min-h-[36px] grid place-items-center">Ver todos →</Link>}
      </div>
      <div className="flex gap-3 overflow-x-auto snap-x pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}
