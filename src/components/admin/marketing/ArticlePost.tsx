import { useEffect, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { canvasToBlob, download } from '@/lib/brandKit';
import { type ThemeId, THEMES } from '@/lib/brandPieces';
import {
  type ArticlePostFormat, ARTICLE_POST_FORMATS, ARTICLE_POST_THEMES,
  articleCaption, articlePostFileName, articleUrl, renderArticlePost, renderArticlePostPng,
} from '@/lib/articlePost';
import type { Article } from '@/lib/paraVoce';
import { Modal } from './ui';

/** Post de feed e story feitos a partir do artigo, com legenda e link prontos. */
export default function ArticlePost({ article, onClose }: { article: Article; onClose: () => void }) {
  const [format, setFormat] = useState<ArticlePostFormat>('feed');
  const [theme, setTheme] = useState<ThemeId>('grafite');
  const [caption, setCaption] = useState(() => articleCaption(article));
  const [busy, setBusy] = useState(false);
  const link = articleUrl(article.slug);

  async function copy(text: string, ok: string) {
    try { await navigator.clipboard.writeText(text); toast.success(ok); }
    catch { toast.error('Não deu pra copiar. Selecione o texto e copie.'); }
  }

  async function save(fmt: ArticlePostFormat) {
    setBusy(true);
    try { download(articlePostFileName(article.slug, theme, fmt), await renderArticlePostPng(article, theme, fmt)); }
    catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  return (
    <Modal title="📱 Post para redes" onClose={onClose}>
      <div className="space-y-4">
        <div className="inline-flex bg-steel-100 rounded-xl p-1 w-full">
          {(Object.keys(ARTICLE_POST_FORMATS) as ArticlePostFormat[]).map(id => (
            <button key={id} type="button" onClick={() => setFormat(id)}
              className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold ${format === id ? 'bg-white shadow text-steel-900' : 'text-steel-500'}`}>
              {ARTICLE_POST_FORMATS[id].label} <span className="font-normal text-steel-400">· {ARTICLE_POST_FORMATS[id].hint}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {ARTICLE_POST_THEMES.map(t => (
            <Preview key={t} article={article} theme={t} format={format} selected={t === theme} onSelect={() => setTheme(t)} />
          ))}
        </div>
        <Preview article={article} theme={theme} format={format} big />

        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary min-h-[44px]" disabled={busy} onClick={() => save(format)}>
            ⬇ Baixar {ARTICLE_POST_FORMATS[format].label.toLowerCase()} ({THEMES[theme].label.toLowerCase()})
          </button>
          <button className="btn-secondary min-h-[44px]" disabled={busy} onClick={() => save(format === 'feed' ? 'story' : 'feed')}>
            ⬇ Baixar {format === 'feed' ? 'story' : 'feed'} também
          </button>
        </div>

        {!article.public && (
          <div className="rounded-xl bg-pending-500/10 border border-pending-500/30 text-pending-800 text-sm p-3">
            Este artigo não está marcado para o <b>blog público</b>: quem vier pela rede social não vai conseguir ler.
            Abra em <b>Editar</b> e marque “Mostrar também no blog público”.
          </div>
        )}

        <div>
          <div className="flex items-center justify-between">
            <span className="label">Legenda</span>
            <button type="button" className="text-sm font-semibold text-brand-600 min-h-[36px]" onClick={() => copy(caption, 'Legenda copiada ✓')}>Copiar legenda</button>
          </div>
          <textarea className="input text-sm" rows={6} value={caption} onChange={e => setCaption(e.target.value)} />
        </div>

        <div>
          <div className="label">Link do artigo (bio ou adesivo de link no story)</div>
          <div className="flex gap-2">
            <input className="input text-sm" readOnly value={link} onFocus={e => e.target.select()} />
            <button type="button" className="btn-secondary min-h-[44px] shrink-0" onClick={() => copy(link, 'Link copiado ✓')}>Copiar</button>
          </div>
          {format === 'story' && (
            <p className="text-xs text-steel-500 mt-1">No story, cole este link no adesivo “Link” do Instagram e posicione em cima do botão laranja.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Preview({ article, theme, format, selected, big, onSelect }: {
  article: Article; theme: ThemeId; format: ArticlePostFormat; selected?: boolean; big?: boolean; onSelect?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const f = ARTICLE_POST_FORMATS[format];

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    renderArticlePost(article, theme, format, (big ? 600 : 220) / f.w)
      .then(canvasToBlob)
      .then(b => { url = URL.createObjectURL(b); if (alive) setSrc(url); else URL.revokeObjectURL(url); })
      .catch(() => { /* capa sem permissão de leitura: a prévia fica vazia */ });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [article, theme, format, big, f.w]);

  const img = (
    <div className={`rounded-xl overflow-hidden bg-steel-100 ${big ? 'mx-auto max-w-[320px]' : ''}`} style={{ aspectRatio: `${f.w} / ${f.h}` }}>
      {src && <img src={src} alt={`Post no tema ${THEMES[theme].label}`} className="w-full h-full object-contain" />}
    </div>
  );
  if (big) return img;
  return (
    <button type="button" onClick={onSelect} aria-label={`Tema ${THEMES[theme].label}`}
      className={`rounded-xl border-2 p-1 text-center ${selected ? 'border-brand-500 bg-brand-50' : 'border-transparent'}`}>
      {img}
      <span className={`block text-xs font-semibold mt-1 ${selected ? 'text-brand-700' : 'text-steel-600'}`}>{THEMES[theme].label}</span>
    </button>
  );
}
