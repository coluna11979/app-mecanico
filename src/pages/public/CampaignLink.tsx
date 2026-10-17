import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { trackCampaignClick } from '@/lib/marketingAttribution';

/** Link curto de campanha (/c/<slug>): conta o clique e manda pro destino. */
export default function CampaignLink() {
  const { slug = '' } = useParams();
  const nav = useNavigate();

  useEffect(() => {
    let done = false;
    // Se o banco demorar, não prende a pessoa numa tela de carregamento
    const fallback = setTimeout(() => { if (!done) nav('/', { replace: true }); }, 4000);
    trackCampaignClick(slug)
      .then(dest => { done = true; nav(dest, { replace: true }); })
      .catch(() => { done = true; nav('/', { replace: true }); })
      .finally(() => clearTimeout(fallback));
    return () => clearTimeout(fallback);
  }, [slug, nav]);

  return (
    <div className="min-h-screen grid place-items-center bg-steel-50">
      <div className="flex items-center gap-3 text-steel-500">
        <div className="h-3 w-3 rounded-full bg-brand-500 animate-pulse-soft" />
        <span className="font-medium">Carregando…</span>
      </div>
    </div>
  );
}
