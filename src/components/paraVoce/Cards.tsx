import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '@/components/ui/Toast';
import { type Article, type Partner, articleCategory, contentEvent, partnerCategory, readMinutes } from '@/lib/paraVoce';

/** Cartão de parceiro: benefício em destaque, cupom com copiar e link da oferta. */
export function PartnerCard({ p, preview = false }: { p: Partner; preview?: boolean }) {
  const cat = partnerCategory(p.category);
  const [copied, setCopied] = useState(false);
  const initials = p.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  async function copy() {
    if (!p.coupon_code) return;
    try { await navigator.clipboard.writeText(p.coupon_code); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { toast.error('Não deu pra copiar. Anote o código.'); }
    if (!preview) contentEvent('partner_click', p.id);
  }

  return (
    <div className="bg-white border border-steel-200 rounded-2xl p-4 flex flex-col h-full">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-steel-50 border border-steel-100 grid place-items-center overflow-hidden shrink-0">
          {p.logo_url ? <img src={p.logo_url} alt="" className="h-full w-full object-contain" />
            : <span className="font-bold text-steel-500">{initials}</span>}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-steel-900 truncate">{p.name}</div>
          <div className="text-xs text-steel-500">{cat.emoji} {cat.label}</div>
        </div>
      </div>
      <div className="mt-3 font-display font-bold text-brand-600 text-lg leading-snug">{p.benefit}</div>
      {p.description && <p className="text-sm text-steel-600 mt-1 line-clamp-3">{p.description}</p>}
      <div className="mt-auto pt-3 flex flex-wrap gap-2">
        {p.coupon_code && (
          <button type="button" onClick={copy}
            className="flex-1 min-w-[120px] min-h-[44px] rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 text-brand-700 font-mono font-bold text-sm px-3">
            {copied ? 'Copiado ✓' : p.coupon_code}
          </button>
        )}
        {p.link_url && (
          <a href={preview ? undefined : p.link_url} target="_blank" rel="noopener noreferrer"
            onClick={() => { if (!preview) contentEvent('partner_click', p.id); }}
            className="flex-1 min-w-[120px] min-h-[44px] rounded-xl bg-steel-900 text-white font-semibold text-sm grid place-items-center px-3">
            Ver oferta →
          </a>
        )}
      </div>
    </div>
  );
}

/** Cartão de artigo: capa, categoria, título e tempo de leitura. */
export function ArticleCard({ a, compact = false }: { a: Pick<Article, 'slug' | 'title' | 'summary' | 'category' | 'cover_url' | 'body'>; compact?: boolean }) {
  return (
    <Link to={`/para-voce/artigo/${a.slug}`}
      className="group bg-white border border-steel-200 rounded-2xl overflow-hidden flex flex-col h-full hover:border-brand-300 transition">
      <div className={`${compact ? 'h-28' : 'h-36'} bg-gradient-to-br from-steel-800 to-steel-900 relative overflow-hidden`}>
        {a.cover_url
          ? <img src={a.cover_url} alt="" className="h-full w-full object-cover" />
          : <div className="h-full w-full grid place-items-center text-4xl opacity-80">📰</div>}
        <span className="absolute top-2 left-2 text-[11px] font-bold uppercase tracking-wide bg-white/90 text-steel-800 rounded-full px-2 py-0.5">
          {articleCategory(a.category)}
        </span>
      </div>
      <div className="p-3 flex flex-col flex-1">
        <div className="font-bold text-steel-900 leading-snug line-clamp-2 group-hover:text-brand-700">{a.title}</div>
        {!compact && a.summary && <p className="text-sm text-steel-600 mt-1 line-clamp-2">{a.summary}</p>}
        <div className="text-xs text-steel-400 mt-auto pt-2">{readMinutes(a.body)} min de leitura</div>
      </div>
    </Link>
  );
}
