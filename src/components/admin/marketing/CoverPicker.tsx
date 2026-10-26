import { useState } from 'react';
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
    </div>
  );
}
