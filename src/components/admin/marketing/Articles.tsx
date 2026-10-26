import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { ArticleCard } from '@/components/paraVoce/Cards';
import { type Article, type Audience, ARTICLE_CATEGORIES, AUDIENCE_LABEL, articleCategory, renderArticleBody, slugify } from '@/lib/paraVoce';
import { uploadImage } from './Partners';
import { Empty, Modal } from './ui';

type Draft = Omit<Article, 'id' | 'reads' | 'created_at' | 'updated_at'> & { id?: string };

const EMPTY: Draft = {
  audience: 'all', slug: '', title: '', summary: '', category: 'dicas', cover_url: null,
  body: '', published_at: new Date().toISOString(), active: true, featured: false,
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

  const status = (a: Article) => !a.active ? 'rascunho' : new Date(a.published_at) > new Date() ? 'agendado' : 'publicado';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-steel-500 max-w-xl">
          Artigos aparecem em “Dicas e conteúdo” no painel e abrem dentro do app. Bons temas: como ganhar mais, gestão da oficina, novidades do app.
        </p>
        <button className="btn-primary min-h-[44px]" onClick={() => setEditing({ ...EMPTY, published_at: new Date().toISOString() })}>+ Novo artigo</button>
      </div>

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
                <div className="text-xs text-steel-500">
                  {status(a)} · {AUDIENCE_LABEL[a.audience]} · {articleCategory(a.category)} · {new Date(a.published_at).toLocaleDateString('pt-BR')} · <b>{a.reads}</b> leituras
                </div>
              </div>
              <div className="flex gap-2">
                <a className="btn-ghost text-sm" href={`/para-voce/artigo/${a.slug}`} target="_blank" rel="noreferrer">Ver</a>
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
  const isNew = !initial.id;
  const up = <K extends keyof Draft>(k: K, v: Draft[K]) => setF(p => ({ ...p, [k]: v }));

  async function onCover(file?: File) {
    if (!file) return;
    setUploading(true);
    try { up('cover_url', await uploadImage(file, 'artigos')); } catch (e) { toast.error((e as Error).message); }
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
      cover_url: f.cover_url, body: f.body.trim(), published_at: f.published_at, active: publish, featured: f.featured,
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
      <form onSubmit={e => save(e, true)} className="space-y-4">
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
              {f.cover_url && <img src={f.cover_url} alt="" className="w-full rounded-xl mb-3 max-h-56 object-cover" />}
              <h1 className="text-2xl font-bold text-steel-900">{f.title || 'Título do artigo'}</h1>
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
            <div className="flex items-center gap-2 flex-wrap">
              <label className="btn-secondary text-sm cursor-pointer min-h-[40px] inline-flex items-center">
                {uploading ? 'Enviando…' : f.cover_url ? 'Trocar capa' : 'Enviar imagem de capa'}
                <input type="file" accept="image/*" className="hidden" onChange={e => { void onCover(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {f.cover_url && <button type="button" className="text-sm text-steel-600" onClick={() => up('cover_url', null)}>Tirar capa</button>}
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
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary min-h-[44px]" disabled={saving || uploading} onClick={e => save(e, false)}>Salvar rascunho</button>
          <button className="btn-primary min-h-[44px]" disabled={saving || uploading}>{saving ? 'Salvando…' : 'Publicar'}</button>
        </div>
      </form>
    </Modal>
  );
}
