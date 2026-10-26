import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { type Audience, AUDIENCE_LABEL } from '@/lib/paraVoce';
import { GENERATION_TIPS, SCENES, STYLE_PROMPT } from '@/lib/illustrationGuide';
import { uploadImage } from './Partners';

export interface Illustration {
  id: string; url: string; title: string; slug: string | null;
  audience: Audience; tags: string[]; active: boolean; uses: number; created_at: string;
}

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what} ✓`); }
  catch { toast.error('Não deu pra copiar. Selecione e copie.'); }
}

/**
 * Biblioteca de ilustrações da marca: guia pra gerar no ChatGPT (estilo fixo + cenas)
 * e upload. O nome do arquivo igual ao da cena já preenche título, público e temas.
 */
export default function Illustrations() {
  const [list, setList] = useState<Illustration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);

  async function load() {
    const { data, error: err } = await supabase.from('brand_illustrations').select('*').order('created_at', { ascending: false });
    setError(err?.message ?? null);
    setList((data ?? []) as Illustration[]);
  }
  useEffect(() => { void load(); }, []);

  const done = useMemo(() => new Set((list ?? []).map(i => i.slug).filter(Boolean)), [list]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    let ok = 0;
    for (const [n, file] of [...files].entries()) {
      setUploading(`${n + 1}/${files.length}`);
      try {
        const url = await uploadImage(file, 'ilustracoes');
        // Nome do arquivo = cena do guia? Então já vem com título, público e temas
        const base = file.name.toLowerCase().replace(/\.[a-z0-9]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const scene = SCENES.find(s => base.includes(s.slug));
        const { error: err } = await supabase.from('brand_illustrations').insert({
          url, slug: scene?.slug ?? null, title: scene?.title ?? base.replace(/-/g, ' '),
          audience: scene?.audience ?? 'all', tags: scene?.tags ?? [],
        });
        if (err) throw err;
        ok++;
      } catch (e) { toast.error(`${file.name}: ${(e as Error).message}`); }
    }
    setUploading(null);
    if (ok) toast.success(`${ok} ilustração(ões) na biblioteca ✓`);
    void load();
  }

  async function update(i: Illustration, patch: Partial<Illustration>) {
    const { error: err } = await supabase.from('brand_illustrations').update(patch).eq('id', i.id);
    if (err) return toast.error(err.message);
    setList(l => (l ?? []).map(x => (x.id === i.id ? { ...x, ...patch } : x)));
  }

  async function remove(i: Illustration) {
    if (!confirm(`Tirar "${i.title}" da biblioteca? Artigos que já usam continuam com a imagem.`)) return;
    const { error: err } = await supabase.from('brand_illustrations').delete().eq('id', i.id);
    if (err) return toast.error(err.message);
    setList(l => (l ?? []).filter(x => x.id !== i.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-steel-500 max-w-2xl">
          Ilustrações no mesmo estilo deixam o app e o blog com cara de marca grande. Gere no ChatGPT com o texto de estilo abaixo e suba aqui:
          a IA do blog escolhe a ilustração certa para cada artigo, e você também pode escolher na capa.
        </p>
        <label className="btn-primary min-h-[44px] cursor-pointer inline-flex items-center">
          {uploading ? `Enviando ${uploading}…` : '⬆ Subir ilustrações'}
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" disabled={!!uploading}
            onChange={e => { void upload(e.target.files); e.target.value = ''; }} />
        </label>
      </div>

      {error && (
        <div className="bg-pending-500/10 border border-pending-500/30 text-pending-800 rounded-2xl p-4 text-sm">
          A biblioteca ainda não foi criada no banco ({error}). O guia abaixo já pode ser usado para gerar as imagens.
        </div>
      )}

      {/* Guia do ChatGPT */}
      <div className="bg-white border border-steel-200 rounded-2xl p-4">
        <button onClick={() => setGuide(g => !g)} className="w-full flex items-center justify-between gap-2 min-h-[44px] text-left">
          <span className="font-bold text-steel-900">🎨 Como criar no ChatGPT ({done.size}/{SCENES.length} cenas feitas)</span>
          <span className="text-sm text-brand-600 font-semibold">{guide ? 'Fechar' : 'Abrir guia'}</span>
        </button>
        {guide && (
          <div className="mt-3 space-y-4">
            <ol className="list-decimal pl-5 text-sm text-steel-700 space-y-1">
              {GENERATION_TIPS.map(t => <li key={t}>{t}</li>)}
            </ol>
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="label !mb-0">Texto de estilo (primeira imagem)</div>
                <button className="text-sm font-semibold text-brand-600 min-h-[36px]" onClick={() => copy(STYLE_PROMPT, 'Texto de estilo copiado')}>Copiar</button>
              </div>
              <pre className="text-xs bg-steel-50 border border-steel-200 rounded-xl p-3 whitespace-pre-wrap font-sans text-steel-700 max-h-48 overflow-auto">{STYLE_PROMPT}…</pre>
            </div>
            <div>
              <div className="label">Cenas ({SCENES.length}) · salve o arquivo com o nome em laranja</div>
              <ul className="divide-y divide-steel-100 border border-steel-200 rounded-xl">
                {SCENES.map((s, i) => (
                  <li key={s.slug} className="p-3 flex items-start gap-3">
                    <span className={`mt-0.5 h-6 w-6 shrink-0 grid place-items-center rounded-full text-xs font-bold ${done.has(s.slug) ? 'bg-signal-500 text-white' : 'bg-steel-100 text-steel-500'}`}>
                      {done.has(s.slug) ? '✓' : i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-steel-900">{s.title} <code className="text-brand-600 text-xs font-mono">{s.slug}.png</code></div>
                      <div className="text-xs text-steel-500">{AUDIENCE_LABEL[s.audience]} · {s.scene}</div>
                    </div>
                    <button className="text-xs font-semibold text-brand-600 shrink-0 min-h-[36px]"
                      onClick={() => copy(i === 0 ? STYLE_PROMPT + s.scene : `Mesmo estilo exato das imagens anteriores. CENA: ${s.scene}`, 'Cena copiada')}>
                      Copiar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Biblioteca */}
      {list && list.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map(i => (
            <div key={i.id} className={`bg-white border border-steel-200 rounded-2xl overflow-hidden ${i.active ? '' : 'opacity-50'}`}>
              <img src={i.url} alt={i.title} className="w-full aspect-[3/2] object-cover bg-steel-100" loading="lazy" />
              <div className="p-3 space-y-2">
                <input className="input text-sm font-semibold" defaultValue={i.title}
                  onBlur={e => e.target.value.trim() !== i.title && update(i, { title: e.target.value.trim() })} />
                <input className="input text-xs" defaultValue={i.tags.join(', ')} placeholder="temas separados por vírgula"
                  onBlur={e => update(i, { tags: e.target.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) })} />
                <div className="flex items-center justify-between gap-2">
                  <select className="input !w-auto text-xs" value={i.audience} onChange={e => update(i, { audience: e.target.value as Audience })}>
                    {(['all', 'workshop', 'mechanic'] as Audience[]).map(a => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
                  </select>
                  <span className="text-xs text-steel-400">usada {i.uses}x</span>
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost text-xs" onClick={() => update(i, { active: !i.active })}>{i.active ? 'Pausar' : 'Reativar'}</button>
                  <button className="btn-ghost text-xs text-steel-500 hover:text-alert-600" onClick={() => remove(i)}>Tirar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {list && list.length === 0 && !error && (
        <div className="bg-white border border-dashed border-steel-300 rounded-2xl p-8 text-center text-sm text-steel-500">
          Nenhuma ilustração ainda. Abra o guia, gere as cenas no ChatGPT e suba os arquivos.
        </div>
      )}
    </div>
  );
}
