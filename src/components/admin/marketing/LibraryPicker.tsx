import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface LibraryItem { id: string; url: string; title: string; tags: string[]; uses: number; audience: string }

let cache: LibraryItem[] | null = null;

/** Ilustrações ativas da biblioteca (com cache na sessão). */
export function useLibrary() {
  const [items, setItems] = useState<LibraryItem[] | null>(cache);
  useEffect(() => {
    if (cache) return;
    supabase.from('brand_illustrations').select('id, url, title, tags, uses, audience').eq('active', true)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => { cache = error ? [] : (data ?? []) as LibraryItem[]; setItems(cache); });
  }, []);
  return items;
}

/** Conta o uso (só pra estatística da biblioteca). */
export function countUse(i: LibraryItem) {
  void supabase.from('brand_illustrations').update({ uses: (i.uses ?? 0) + 1 }).eq('id', i.id);
}

/** Grade da biblioteca com filtro por tema. `selected` é a URL escolhida. */
export default function LibraryPicker({ selected, onPick, allowNone = true, audience }: {
  selected: string | null;
  onPick: (item: LibraryItem | null) => void;
  allowNone?: boolean;
  audience?: string;
}) {
  const items = useLibrary();
  const [filter, setFilter] = useState('');

  if (items === null) return <p className="text-sm text-steel-400">Carregando ilustrações…</p>;
  if (!items.length) {
    return <p className="text-sm text-steel-500">Ainda não há ilustrações. Crie no ChatGPT e suba em Marketing → Ilustrações.</p>;
  }

  const f = filter.trim().toLowerCase();
  const shown = items
    .filter(i => !f || `${i.title} ${i.tags.join(' ')}`.toLowerCase().includes(f))
    // As do mesmo público primeiro
    .sort((a, b) => Number(b.audience === audience) - Number(a.audience === audience));

  return (
    <div className="space-y-2">
      <input className="input text-sm" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filtrar por tema (ex: agenda, orçamento, renda)" />
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-auto">
        {allowNone && (
          <button type="button" onClick={() => onPick(null)}
            className={`aspect-[3/2] rounded-lg border-2 text-xs font-semibold text-steel-500 grid place-items-center ${!selected ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-dashed border-steel-300'}`}>
            Sem ilustração
          </button>
        )}
        {shown.map(i => (
          <button key={i.id} type="button" onClick={() => onPick(i)} title={i.title}
            className={`relative aspect-[3/2] rounded-lg overflow-hidden bg-steel-100 ring-2 ${selected === i.url ? 'ring-brand-500' : 'ring-transparent hover:ring-brand-300'}`}>
            <img src={i.url} alt={i.title} className="w-full h-full object-cover" loading="lazy" />
            <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] px-1.5 py-0.5 truncate">{i.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
