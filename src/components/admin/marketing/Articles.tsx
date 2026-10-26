import CoverPicker from './CoverPicker';
import ArticleCover from '@/components/paraVoce/ArticleCover';
import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { ArticleCard } from '@/components/paraVoce/Cards';
import { type Article, type Audience, ARTICLE_CATEGORIES, AUDIENCE_LABEL, articleCategory, renderArticleBody, slugify } from '@/lib/paraVoce';
import { uploadImage } from './Partners';
import { Empty, Modal } from './ui';
import BlogAI from './BlogAI';

type Draft = Omit<Article, 'id' | 'reads' | 'created_at' | 'updated_at'> & { id?: string };

const EMPTY: Draft = {
  audience: 'all', slug: '', title: '', summary: '', category: 'dicas', cover_url: null,
  body: '', published_at: new Date().toISOString(), active: true, featured: false,
  public: true, origin: 'manual', review_status: null, social_caption: '',
};

const BODY_HELP = 'Linha em branco separa parágrafos · ## Subtítulo · - item de lista · **negrito** · [texto do link](https://site.com)';

/** Artigos escritos aqui e lidos dentro do app (Para você → Conteúdo). */
export default function Articles() {
  const [list, setList] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Draft | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('panel_articles').select('*')
      .order('published_at', { ascending: false });
    if (error) toast.error(error.message);
    setList((data ?? []) as Article[]);
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(a: Article) {
    const { error } = await supabase.from('panel_articles').update({ active: !a.active }).eq('id', a.id);
    if (error) return toast.error(error.message);
    setList(l => l.map(x => (x.id === a.id ? { ...x, active: !a.active } : x)));
  }
  async function remove(a: Article) {
    if (!confirm(`Apagar o artigo "${a.title}"?`)) return;
    const { error } = await supabase.from('panel_articles').delete().eq('id', a.id);
    if (error) return toast.error(error.message);
    setList(l => l.filter(x => x.id !== a.id));
  }

  const status = (a: Article) =>
    a.review_status === 'aguardando_revisao' && !a.active ? '🤖 aguardando revisão'
      : !a.active ? 'rascunho' : new Date(a.published_at) > new Date() ? 'agendado' : 'publicado';
  const waiting = list.filter(a => a.review_status === 'aguardando_revisao' && !a.active).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-steel-500 max-w-xl">
          Artigos aparecem em “Dicas e conteúdo” no painel e abrem dentro do app. Bons temas: como ganhar mais, gestão da oficina, novidades do app.
        </p>
        <button className="btn-primary min-h-[44px]" onClick={() => setEditing({ ...EMPTY, published_at: new Date().toISOString() })}>+ Novo artigo</button>
      </div>

      <BlogAI onGenerated={load} />

      {waiting > 0 && (
        <div className="bg-pending-500/10 border border-pending-500/30 text-pending-800 rounded-2xl px-4 py-3 text-sm">
          🤖 <b>{waiting}</b> rascunho(s) da IA aguardando sua revisão. Abra em <b>Editar</b>, corrija o que quiser e publique.
        </div>
      )}

      {loading ? (
        <div className="bg-white border border-steel-200 rounded-2xl p-10 text-center text-steel-500 text-sm">Carregando…</div>
      ) : list.length === 0 ? (
        <Empty emoji="📰" title="Nenhum artigo ainda" text="Escreva o primeiro: por exemplo, “5 jeitos de conseguir mais chamados no MecânicoApp”." />
      ) : (
        <div className="bg-white border border-steel-200 rounded-2xl divide-y divide-steel-100">
          {list.map(a => (
            <div key={a.id} className="p-3 sm:p-4 flex items-center gap-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-steel-900 truncate">{a.featured && '⭐ '}{a.title}</div>
                <div className="flex gap-1.5 mt-0.5 flex-wrap">
                  {a.review_status === 'aguardando_revisao' && !a.active && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-pending-500/15 text-pending-800">aguardando revisão</span>}
                  {a.origin === 'ia' && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-steel-100 text-steel-600">escrito pela IA</span>}
                  {a.public && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-blue-50 text-blue-700">🌐 blog público</span>}
                </div>
                <div className="text-xs text-steel-500">
                  {status(a)} · {AUDIENCE_LABEL[a.audience]} · {articleCategory(a.category)} · {new Date(a.published_at).toLocaleDateString('pt-BR')} · <b>{a.reads}</b> leituras
                </div>
              </div>
              <div className="flex gap-2">
                <a className="btn-ghost text-sm" href={a.public ? `/blog/${a.slug}` : `/para-voce/artigo/${a.slug}`} target="_blank" rel="noreferrer">Ver</a>
                <button className="btn-ghost text-sm" onClick={() => setEditing({ ...a })}>Editar</button>
                <button className="btn-ghost text-sm" onClick={() => toggle(a)}>{a.active ? 'Despublicar' : 'Publicar'}</button>
                <button className="btn-ghost text-sm text-steel-500 hover:text-alert-600" onClick={() => remove(a)}>Apagar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <ArticleForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}
    </div>
  );
}

function ArticleForm({ initial, onClose, onSaved }: { initial: Draft; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Draft>(initial);
  const [slugTouched, setSlugTouched] = useState(!!initial.id);
  const [tab, setTab] = useState<'escrever' | 'previa'>('escrever');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [picker, setPicker] = useState(false);
  const isNew = !initial.id;
  const up = <K extends keyof Draft>(k: K, v: Draft[K]) => setF(p => ({ ...p, [k]: v }));

  async function onCover(file?: File) {
    if (!file) return;
    setUploading(true);
    try { up('cover_url', await uploadImage(file, 'artigos')); up('cover_credit', null); } catch (e) { toast.error((e as Error).message); }
    setUploading(false);
  }

  async function save(e: FormEvent, publish: boolean) {
    e.preventDefault();
    const slug = slugify(f.slug || f.title);
    if (f.title.trim().length < 5) return toast.error('Escreva o título.');
    if (slug.length < 3) return toast.error('O endereço do artigo precisa de pelo menos 3 letras.');
    if (f.body.trim().length < 20) return toast.error('Escreva o texto do artigo.');
    setSaving(true);
    const row = {
      audience: f.audience, slug, title: f.title.trim(), summary: f.summary?.trim() || null, category: f.category,
      cover_url: f.cover_url, cover_credit: f.cover_url ? f.cover_credit ?? null : null, cover_query: f.cover_query ?? null, body: f.body.trim(), published_at: f.published_at, active: publish, featured: f.featured,
      public: !!f.public, social_caption: f.social_caption?.trim() || null,
      review_status: f.origin === 'ia' ? (publish ? 'revisado' : f.review_status ?? 'aguardando_revisao') : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = isNew
      ? await supabase.from('panel_articles').insert(row)
      : await supabase.from('panel_articles').update(row).eq('id', initial.id!);
    setSaving(false);
    if (error) return toast.error(/duplicate|unique/i.test(error.message) ? 'Já existe um artigo com esse endereço. Mude o título ou o endereço.' : error.message);
    toast.success(publish ? 'Artigo publicado ✓' : 'Rascunho salvo ✓');
    onSaved();
  }

  return (
    <Modal title={isNew ? 'Novo artigo' : 'Editar artigo'} onClose={onClose}>
      {/* Enter num campo não publica: só o botão Publicar */}
      <form onSubmit={e => e.preventDefault()} className="space-y-4">
        <div className="flex gap-1 bg-steel-100 rounded-xl p-1">
          {(['escrever', 'previa'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`flex-1 min-h-[40px] rounded-lg text-sm font-semibold ${tab === t ? 'bg-white shadow text-steel-900' : 'text-steel-500'}`}>
              {t === 'escrever' ? '✏️ Escrever' : '👁️ Prévia'}
            </button>
          ))}
        </div>

        {tab === 'previa' ? (
          <div className="space-y-4">
            <div className="max-w-[240px]"><ArticleCard a={{ ...f, title: f.title || 'Título do artigo' }} compact /></div>
            <article className="border border-steel-200 rounded-xl p-4">
              <div className="rounded-xl overflow-hidden mb-2"><ArticleCover a={{ ...f, title: f.title || 'Título do artigo' }} variant="hero" /></div>
              {f.summary && <p className="text-steel-600 mt-2">{f.summary}</p>}
              <div className="mt-2">{renderArticleBody(f.body || 'O texto aparece aqui.')}</div>
            </article>
          </div>
        ) : (
          <>
            <div>
              <div className="label">Quem vê</div>
              <div className="grid grid-cols-3 gap-2">
                {(['mechanic', 'workshop', 'all'] as Audience[]).map(a => (
                  <button key={a} type="button" onClick={() => up('audience', a)}
                    className={`min-h-[44px] rounded-lg border-2 text-sm font-semibold ${f.audience === a ? 'border-brand-500 text-brand-700 bg-brand-50' : 'border-steel-200 text-steel-600'}`}>
                    {AUDIENCE_LABEL[a]}
                  </button>
                ))}
              </div>
            </div>
            <div><label className="label">Título</label>
              <input className="input" value={f.title} maxLength={110}
                onChange={e => { up('title', e.target.value); if (!slugTouched) up('slug', slugify(e.target.value)); }} /></div>
            <div><label className="label">Resumo (aparece no cartão)</label>
              <input className="input" value={f.summary ?? ''} maxLength={160} onChange={e => up('summary', e.target.value)} /></div>
            <div>
              <label className="label">Texto</label>
              <textarea className="input font-[inherit]" rows={12} value={f.body} onChange={e => up('body', e.target.value)}
                placeholder={'Escreva o artigo aqui.\n\n## Um subtítulo\n\n- um item\n- outro item'} />
              <p className="text-xs text-steel-500 mt-1">{BODY_HELP}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="label">Categoria</label>
                <select className="input" value={f.category} onChange={e => up('category', e.target.value)}>
                  {ARTICLE_CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.label}</option>)}
                </select></div>
              <div><label className="label">Endereço</label>
                <div className="flex items-center input !p-0 overflow-hidden">
                  <span className="pl-3 text-steel-400 text-xs whitespace-nowrap">/artigo/</span>
                  <input className="flex-1 px-1 py-2.5 outline-none bg-transparent text-sm" value={f.slug}
                    onChange={e => { setSlugTouched(true); up('slug', slugify(e.target.value)); }} />
                </div></div>
            </div>
            <div>
              <div className="label">Capa</div>
              <div className="h-40 rounded-xl overflow-hidden mb-2"><ArticleCover a={{ ...f, title: f.title || 'Título do artigo' }} /></div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <button type="button" className="btn-secondary text-sm min-h-[40px]" onClick={() => setPicker(v => !v)}>
                  🖼️ {f.cover_url ? 'Trocar foto' : 'Escolher foto'}
                </button>
                <label className="btn-ghost text-sm cursor-pointer min-h-[40px] inline-flex items-center">
                  {uploading ? 'Enviando…' : 'Subir foto própria'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => { void onCover(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {f.cover_url && <button type="button" className="text-sm text-steel-600" onClick={() => { up('cover_url', null); up('cover_credit', null); }}>Usar capa sem foto</button>}
              </div>
              {picker && (
                <CoverPicker articleId={initial.id} initialQuery={f.cover_query || ''}
                  onPicked={r => { up('cover_url', r.url); up('cover_credit', r.credit); up('cover_query', r.query); setPicker(false); }} />
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="label">Data de publicação</label>
                <input className="input" type="date" value={f.published_at.slice(0, 10)}
                  onChange={e => up('published_at', e.target.value ? new Date(e.target.value + 'T08:00:00').toISOString() : new Date().toISOString())} /></div>
              <label className="flex items-center gap-2 text-sm text-steel-700 min-h-[44px] cursor-pointer sm:mt-6">
                <input type="checkbox" className="h-5 w-5 rounded border-steel-300 text-brand-500" checked={f.featured} onChange={e => up('featured', e.target.checked)} />
                Destaque (aparece primeiro)
              </label>
            </div>
            <label className="flex items-start gap-2 text-sm text-steel-700 cursor-pointer bg-blue-50/60 border border-blue-100 rounded-xl p-3">
              <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-steel-300 text-brand-500" checked={!!f.public} onChange={e => up('public', e.target.checked)} />
              <span><b>Mostrar também no blog público</b> (mecanicoapp.com.br/blog): qualquer pessoa lê, aparece no Google e dá pra divulgar o link. Sem marcar, fica só dentro do app.</span>
            </label>
            <div>
              <div className="flex items-center justify-between">
                <label className="label">Legenda para divulgar (Instagram)</label>
                {f.social_caption && (
                  <button type="button" className="text-xs font-semibold text-brand-600 min-h-[32px]"
                    onClick={async () => { try { await navigator.clipboard.writeText(f.social_caption ?? ''); toast.success('Legenda copiada ✓'); } catch { toast.error('Não deu pra copiar.'); } }}>
                    Copiar
                  </button>
                )}
              </div>
              <textarea className="input text-sm" rows={4} value={f.social_caption ?? ''} onChange={e => up('social_caption', e.target.value)}
                placeholder="A IA preenche nos artigos dela. Use com o link do blog na bio." />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary min-h-[44px]" disabled={saving || uploading} onClick={e => save(e, false)}>Salvar rascunho</button>
          <button type="button" className="btn-primary min-h-[44px]" disabled={saving || uploading} onClick={e => save(e, true)}>{saving ? 'Salvando…' : 'Publicar'}</button>
        </div>
      </form>
    </Modal>
  );
}
