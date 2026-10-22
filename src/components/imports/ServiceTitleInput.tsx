import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Svc = { id: string; name: string; category: string | null };

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Campo "Serviço" com busca na Tabela de serviços da oficina, agrupada por categoria.
 * Escolher a categoria usa o nome dela ("Freios"); escolher um serviço usa o nome do serviço.
 * O texto continua livre: dá para digitar qualquer coisa.
 */
export default function ServiceTitleInput({ workshopId, value, onChange, className }: {
  workshopId: string; value: string; onChange: (v: string) => void; className?: string;
}) {
  const [list, setList] = useState<Svc[]>([]);
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('workshop_services').select('id, name, category').eq('workshop_id', workshopId).eq('active', true).order('name')
      .then(({ data }) => setList((data as Svc[]) ?? []));
  }, [workshopId]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of list) if (s.category) m.set(s.category, (m.get(s.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [list]);

  // Ao abrir pelo clique, mostra tudo; ao digitar, filtra pelo que foi digitado
  const [typed, setTyped] = useState(false);
  const q = typed ? norm(value) : '';
  const shownCats = categories.filter(([c]) => !q || norm(c).includes(q));
  const shown = list
    .filter(s => (!cat || s.category === cat) && (!q || norm(s.name).includes(q) || norm(s.category ?? '').includes(q)))
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, 30);

  const pick = (v: string) => { onChange(v); setOpen(false); setTyped(false); setCat(null); };

  return (
    <div ref={box} className="relative">
      <input className={className} placeholder="Serviço * (ex.: Troca de embreagem) — busque na tabela de serviços"
        value={value}
        onFocus={() => { setOpen(true); setTyped(false); }}
        onChange={e => { onChange(e.target.value); setTyped(true); setOpen(true); }} />
      {open && list.length > 0 && (shownCats.length > 0 || shown.length > 0) && (
        <div className="absolute z-30 left-0 right-0 mt-1 rounded-xl border border-steel-200 bg-white shadow-lg max-h-80 overflow-y-auto">
          {shownCats.length > 0 && (
            <div className="p-2 border-b border-steel-100">
              <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-steel-400">Categorias</div>
              <div className="flex flex-wrap gap-1.5">
                {shownCats.map(([c, n]) => (
                  <span key={c} className={`inline-flex rounded-full border text-xs font-semibold overflow-hidden ${cat === c ? 'border-steel-900' : 'border-steel-200'}`}>
                    <button type="button" onClick={() => pick(c)} title={`Usar “${c}” como serviço`}
                      className="px-2.5 py-1 hover:bg-steel-50">{c}</button>
                    <button type="button" onClick={() => setCat(cat === c ? null : c)} title="Ver os serviços desta categoria"
                      className={`px-2 py-1 border-l ${cat === c ? 'bg-steel-900 text-white border-steel-900' : 'border-steel-200 text-steel-400 hover:bg-steel-50'}`}>{n} ▾</button>
                  </span>
                ))}
              </div>
            </div>
          )}
          {shown.length > 0 && (
            <ul className="py-1">
              {cat && <li className="px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-steel-400">{cat}</li>}
              {shown.map(s => (
                <li key={s.id}>
                  <button type="button" onClick={() => pick(s.name)} className="w-full text-left px-3 py-1.5 text-sm hover:bg-steel-50 flex justify-between gap-3">
                    <span className="min-w-0 truncate">{s.name}</span>
                    {!cat && s.category && <span className="shrink-0 text-[11px] text-steel-400">{s.category}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
