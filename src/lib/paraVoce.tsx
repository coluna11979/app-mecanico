import { Fragment, type ReactNode } from 'react';
import { supabase } from './supabase';

/** "Para você": parceiros (benefícios) e artigos (conteúdo) dos painéis. */

export type Audience = 'workshop' | 'mechanic' | 'all';

export interface Partner {
  id: string;
  audience: Audience;
  name: string;
  category: string;
  logo_url: string | null;
  benefit: string;
  description: string | null;
  coupon_code: string | null;
  link_url: string | null;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  priority: number;
  views: number;
  clicks: number;
  created_at: string;
}

export interface Article {
  id: string;
  audience: Audience;
  slug: string;
  title: string;
  summary: string | null;
  category: string;
  cover_url: string | null;
  body: string;
  published_at: string;
  active: boolean;
  featured: boolean;
  reads: number;
  created_at: string;
  updated_at: string;
  public?: boolean;                 // aparece no blog público (/blog)
  origin?: 'manual' | 'ia';
  review_status?: 'aguardando_revisao' | 'revisado' | null;
  social_caption?: string | null;
  cover_query?: string | null;     // busca de foto sugerida pela IA
  cover_credit?: string | null;    // "Foto: Fulano / Pixabay"
}

export const AUDIENCE_LABEL: Record<Audience, string> = {
  mechanic: '🔧 Mecânicos', workshop: '🏭 Oficinas', all: '👥 Todos',
};

export const PARTNER_CATEGORIES: { v: string; label: string; emoji: string }[] = [
  { v: 'autopecas',   label: 'Autopeças',    emoji: '🔩' },
  { v: 'ferramentas', label: 'Ferramentas',  emoji: '🧰' },
  { v: 'cursos',      label: 'Cursos',       emoji: '🎓' },
  { v: 'uniformes',   label: 'Uniformes e EPI', emoji: '🦺' },
  { v: 'combustivel', label: 'Combustível',  emoji: '⛽' },
  { v: 'servicos',    label: 'Serviços',     emoji: '🤝' },
  { v: 'outros',      label: 'Outros',       emoji: '🎁' },
];

export const ARTICLE_CATEGORIES: { v: string; label: string; emoji: string; desc: string }[] = [
  { v: 'gestao',      label: 'Gestão da oficina',      emoji: '📊', desc: 'Agenda, organização, custos e rotina da oficina.' },
  { v: 'atendimento', label: 'Atendimento ao cliente', emoji: '🤝', desc: 'Orçamento, comunicação e como fazer o cliente voltar.' },
  { v: 'equipe',      label: 'Equipe e mão de obra',   emoji: '👥', desc: 'Contratar, montar a equipe e chamar reforço na hora certa.' },
  { v: 'renda',       label: 'Ganhar mais',            emoji: '💰', desc: 'Renda extra e carreira para mecânicos.' },
  { v: 'tecnica',     label: 'Técnica',                emoji: '🔧', desc: 'Boas práticas de serviço, diagnóstico e segurança.' },
  { v: 'dicas',       label: 'Dicas rápidas',          emoji: '💡', desc: 'Dicas curtas para o dia a dia.' },
  { v: 'novidades',   label: 'Novidades do app',       emoji: '🚀', desc: 'O que há de novo no MecânicoApp.' },
];

export const partnerCategory = (v: string) => PARTNER_CATEGORIES.find(c => c.v === v) ?? PARTNER_CATEGORIES[PARTNER_CATEGORIES.length - 1];
export const articleCategory = (v: string) => ARTICLE_CATEGORIES.find(c => c.v === v)?.label ?? v;

export function contentEvent(kind: 'partner_view' | 'partner_click' | 'article_read', id: string) {
  // Conta uma vez por sessão do navegador
  const key = `pv_${kind}_${id}`;
  try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* conta mesmo assim */ }
  void supabase.rpc('panel_content_event', { p_kind: kind, p_id: id });
}

export async function loadPartners() {
  const { data } = await supabase.from('panel_partners').select('*')
    .order('priority', { ascending: false }).order('created_at', { ascending: false });
  return (data ?? []) as Partner[];
}

export async function loadArticles() {
  const { data } = await supabase.from('panel_articles')
    .select('id, audience, slug, title, summary, category, cover_url, published_at, featured, reads, active, created_at, updated_at, body')
    .order('featured', { ascending: false }).order('published_at', { ascending: false });
  return (data ?? []) as Article[];
}

export const readMinutes = (body: string) => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200));

export function slugify(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// ── Texto do artigo ─────────────────────────────────────────────────────────
// Formato simples, sem HTML: parágrafos separados por linha em branco,
// "## Subtítulo", "- item de lista", **negrito**, [texto](https://link) e links soltos.

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https:\/\/[^\s)]+|\/[^\s)]*)\)|(https:\/\/[^\s]+)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={`${key}-${i++}`} className="font-semibold text-steel-900">{m[1]}</strong>);
    else {
      const href = m[3] ?? m[4];
      const label = m[2] ?? m[4];
      out.push(<a key={`${key}-${i++}`} href={href} target={href.startsWith('/') ? undefined : '_blank'} rel="noreferrer"
        className="text-brand-600 font-semibold underline underline-offset-2 break-words">{label}</a>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderArticleBody(body: string): ReactNode {
  const blocks = body.replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  return blocks.map((b, bi) => {
    const lines = b.split('\n');
    if (b.startsWith('## ')) {
      return <h2 key={bi} className="text-xl font-bold text-steel-900 mt-6 mb-2">{inline(b.slice(3), `h${bi}`)}</h2>;
    }
    if (lines.every(l => l.trim().startsWith('- '))) {
      return (
        <ul key={bi} className="list-disc pl-5 space-y-1.5 my-3 text-steel-700">
          {lines.map((l, li) => <li key={li}>{inline(l.trim().slice(2), `l${bi}-${li}`)}</li>)}
        </ul>
      );
    }
    return (
      <p key={bi} className="text-steel-700 leading-relaxed my-3">
        {lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l, `p${bi}-${li}`)}</Fragment>)}
      </p>
    );
  });
}
