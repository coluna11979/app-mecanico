import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtCnpj, onlyDigits, type Supplier } from '@/lib/purchasing';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Busca de fornecedor / autopeças: digita nome, CNPJ ou telefone e escolhe.
 * Se não existir, cadastra na hora só com o nome (dá para completar depois em Fornecedores).
 */
export default function SupplierPicker({ wid, value, onChange, placeholder = 'Buscar fornecedor / autopeças…' }: {
  wid: string; value: string | null; onChange: (s: Supplier | null) => void; placeholder?: string;
}) {
  const [list, setList] = useState<Supplier[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.from('suppliers').select('*').eq('workshop_id', wid).eq('active', true).order('name')
      .then(({ data }) => setList((data as Supplier[]) ?? []));
  }, [wid]);

  // Fecha ao clicar fora
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selected = list.find(s => s.id === value) ?? null;

  const matches = useMemo(() => {
    const t = norm(q.trim());
    const d = onlyDigits(q);
    if (!t) return list.slice(0, 8);
    return list.filter(s => norm(s.name).includes(t) || norm(s.contact ?? '').includes(t)
      || (d.length >= 3 && (onlyDigits(s.cnpj ?? '').includes(d) || onlyDigits(s.phone ?? '').includes(d)))).slice(0, 8);
  }, [list, q]);

  const exact = list.some(s => norm(s.name) === norm(q.trim()));

  async function create() {
    const name = q.trim();
    if (!name) return;
    setCreating(true);
    const { data, error } = await supabase.from('suppliers').insert({ workshop_id: wid, name }).select().single();
    setCreating(false);
    if (error) return toast.error('Não foi possível cadastrar o fornecedor: ' + error.message);
    const s = data as Supplier;
    setList(xs => [...xs, s].sort((a, b) => a.name.localeCompare(b.name)));
    onChange(s); setQ(''); setOpen(false);
    toast.success(`Fornecedor "${s.name}" cadastrado ✓`);
  }

  if (selected) {
    return (
      <div className="input flex items-center justify-between gap-2 !py-2">
        <span className="min-w-0 truncate text-sm">
          🚚 <strong>{selected.name}</strong>
          {selected.cnpj && <span className="text-steel-400 text-xs"> · {fmtCnpj(selected.cnpj)}</span>}
        </span>
        <button type="button" className="text-xs font-semibold text-steel-500 hover:text-alert-600 shrink-0" onClick={() => onChange(null)}>Trocar</button>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <input className="input" placeholder={placeholder} value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); if (matches.length === 1) { onChange(matches[0]); setOpen(false); } else if (q.trim() && !exact && !matches.length) create(); }
          if (e.key === 'Escape') setOpen(false);
        }} />
      {open && (matches.length > 0 || q.trim()) && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-steel-200 rounded-xl shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {matches.map(s => (
            <button key={s.id} type="button" onClick={() => { onChange(s); setQ(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-steel-50 text-sm">
              <div className="font-semibold truncate">{s.name}</div>
              <div className="text-xs text-steel-500 truncate">{[s.cnpj && fmtCnpj(s.cnpj), s.contact, s.phone].filter(Boolean).join(' · ') || (s.payment_days ? `prazo ${s.payment_days} dias` : 'à vista')}</div>
            </button>
          ))}
          {q.trim() && !exact && (
            <button type="button" onClick={create} disabled={creating}
              className="w-full text-left px-3 py-2.5 bg-brand-50 hover:bg-brand-100 text-sm font-semibold text-brand-700 border-t border-steel-100">
              {creating ? 'Cadastrando…' : `+ Cadastrar “${q.trim()}” como fornecedor`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
