import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';

interface Result { id: number; thumb: string; user: string; page: string; tags: string }

async function call<T>(body: object): Promise<T> {
  const { data, error } = await supabase.functions.invoke('blog-cover', { body });
  let msg = data?.error as string | undefined;
  if (error && !msg) {
    const ctx = (error as { context?: Response }).context;
    msg = (ctx ? await ctx.json().then(j => j.error).catch(() => null) : null) || error.message;
  }
  if (msg) throw new Error(msg);
  return data as T;
}

/**
 * Escolher a foto da capa no Pixabay: busca (já vem com a sugestão da IA), 12 opções,
 * um clique baixa a foto para o nosso armazenamento e devolve a URL.
 */
export default function CoverPicker({ articleId, initialQuery, onPicked }: {
  articleId?: string;
  initialQuery: string;
  onPicked: (r: { url: string; credit: string; query: string }) => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<Result[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<number | null>(null);
  const [source, setSource] = useState<'ilustracoes' | 'fotos'>('ilustracoes');
  const [library, setLibrary] = useState<{ id: string; url: string; title: string; tags: string[]; uses: number }[] | null>(null);
  const [filter, setFilter] = useState('');

  // Biblioteca de ilustrações da marca (se ainda não existir, abre direto nas fotos)
  useEffect(() => {
    supabase.from('brand_illustrations').select('id, url, title, tags, uses').eq('active', true).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        const rows = error ? [] : (data ?? []);
        setLibrary(rows as NonNullable<typeof library>);
        if (!rows.length) setSource('fotos');
      });
  }, []);

  async function pickIllustration(i: { id: string; url: string; uses: number }) {
    await supabase.from('brand_illustrations').update({ uses: (i.uses ?? 0) + 1 }).eq('id', i.id);
    onPicked({ url: i.url, credit: '', query: '' });
    toast.success('Capa trocada ✓');
  }

  async function search() {
    if (!q.trim()) return;
    setLoading(true);
    try { setResults((await call<{ results: Result[] }>({ action: 'search', query: q.trim() })).results); }
    catch (err) { toast.error((err as Error).message); }
    setLoading(false);
  }

  async function pick(r: Result) {
    setPicking(r.id);
    try {
      const out = await call<{ url: string; credit: string }>({ action: 'pick', pixabay_id: r.id, article_id: articleId, query: q.trim() });
      onPicked({ ...out, query: q.trim() });
      toast.success('Capa trocada ✓');
    } catch (err) { toast.error((err as Error).message); }
    setPicking(null);
  }

  return (
    <div className="border border-steel-200 rounded-xl p-3 space-y-3">
      <div className="flex gap-1 bg-steel-100 rounded-lg p-1">
        {([['ilustracoes', `🎨 Ilustrações da marca${library ? ` (${library.length})` : ''}`], ['fotos', '📷 Fotos (Pixabay)']] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setSource(v)}
            className={`flex-1 min-h-[36px] rounded-md text-sm font-semibold ${source === v ? 'bg-white shadow text-steel-900' : 'text-steel-500'}`}>{l}</button>
        ))}
      </div>

      {source === 'ilustracoes' && (
        !library?.length ? (
          <p className="text-sm text-steel-500">Ainda não há ilustrações. Crie no ChatGPT e suba em Marketing → Ilustrações.</p>
        ) : (
          <>
            <input className="input text-sm" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrar por tema (ex: agenda, orçamento, renda)" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-80 overflow-auto">
              {library.filter(i => !filter.trim() || `${i.title} ${i.tags.join(' ')}`.toLowerCase().includes(filter.trim().toLowerCase())).map(i => (
                <button key={i.id} type="button" onClick={() => void pickIllustration(i)} title={i.title}
                  className="relative aspect-[3/2] rounded-lg overflow-hidden bg-steel-100 ring-2 ring-transparent hover:ring-brand-500">
                  <img src={i.url} alt={i.title} className="w-full h-full object-cover" loading="lazy" />
                  <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] px-1.5 py-0.5 truncate">{i.title}</span>
                </button>
              ))}
            </div>
          </>
        )
      )}

      {source === 'fotos' && (<>
      {/* Sem <form>: este seletor fica dentro do formulário do artigo, e formulário dentro de formulário
          faz o navegador enviar o de fora (recarregava a página) */}
      <div className="flex gap-2">
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Ex: mechanic repairing car engine"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void search(); } }} />
        <button type="button" onClick={() => void search()} className="btn-secondary shrink-0 min-h-[44px]" disabled={loading}>{loading ? '…' : 'Buscar fotos'}</button>
      </div>
      <p className="text-xs text-steel-500">Dica: em inglês aparecem mais fotos (mechanic, car repair, garage, workshop…). Fotos do Pixabay, gratuitas para uso comercial.</p>
      {results && results.length === 0 && <p className="text-sm text-steel-500">Nenhuma foto para essa busca. Tente outras palavras.</p>}
      {results && results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {results.map(r => (
            <button key={r.id} type="button" onClick={() => pick(r)} disabled={picking !== null}
              className="relative aspect-[16/10] rounded-lg overflow-hidden bg-steel-100 ring-2 ring-transparent hover:ring-brand-500 disabled:opacity-60" title={r.tags}>
              <img src={r.thumb} alt={r.tags} className="w-full h-full object-cover" loading="lazy" />
              {picking === r.id && <span className="absolute inset-0 grid place-items-center bg-black/50 text-white text-sm font-semibold">Salvando…</span>}
            </button>
          ))}
        </div>
      )}
      </>)}
    </div>
  );
}
