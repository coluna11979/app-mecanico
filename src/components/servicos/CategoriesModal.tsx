import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { seedCategories, type ServiceCategory } from '@/lib/serviceCategories';

/**
 * Categorias de serviço do dono (valem para todas as lojas dele): renomear, criar, apagar e reordenar.
 * Renomear leva junto os serviços e as OS que usavam o nome antigo.
 */
export default function CategoriesModal({ ownerId, custom, cats, onClose, onChanged }: {
  ownerId: string; custom: boolean; cats: ServiceCategory[]; onClose: () => void; onChanged: () => void;
}) {
  const [list, setList] = useState<ServiceCategory[]>(cats);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  // Primeira vez: grava a lista padrão para o dono poder editar
  useEffect(() => {
    if (custom) return;
    (async () => {
      const err = await seedCategories(ownerId);
      if (err) { setError(err.includes('service_categories') || err.includes('schema cache') ? 'Este recurso ainda não está ativo no banco.' : 'Só o dono da oficina altera as categorias.'); return; }
      onChanged();
      const { data } = await supabase.from('service_categories').select('id, name, sells_parts').eq('owner_id', ownerId).order('position');
      if (data) setList((data as { id: string; name: string; sells_parts: boolean }[]).map(r => ({ id: r.id, name: r.name, sellsParts: r.sells_parts })));
    })();
  }, [custom, ownerId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) {
    setBusy(true); setError('');
    const { error: e } = await fn();
    setBusy(false);
    if (e) { setError(e.message); return false; }
    if (ok) toast.success(ok);
    onChanged();
    return true;
  }

  async function rename(c: ServiceCategory, original: string, value: string) {
    const name = value.trim();
    const back = () => setList(l => l.map(x => x.id === c.id ? { ...x, name: original } : x));
    if (!name || name === original) { back(); return; }
    const used = list.some(x => x.id !== c.id && x.name.toLowerCase() === name.toLowerCase());
    if (used && !confirm(`Já existe "${name}". Juntar as duas? Os serviços de "${original}" passam para "${name}".`)) { back(); return; }
    const ok = await run(() => supabase.rpc('rename_service_category', { p_owner: ownerId, p_old: original, p_new: name }), 'Categoria renomeada — serviços e OS atualizados');
    if (!ok) { back(); return; }
    setList(l => used ? l.filter(x => x.id !== c.id) : l.map(x => x.id === c.id ? { ...x, name } : x));
  }

  async function toggleSells(c: ServiceCategory) {
    const v = !c.sellsParts;
    setList(l => l.map(x => x.id === c.id ? { ...x, sellsParts: v } : x));
    const ok = await run(() => supabase.from('service_categories').update({ sells_parts: v }).eq('id', c.id!));
    if (!ok) setList(l => l.map(x => x.id === c.id ? { ...x, sellsParts: !v } : x));
  }

  async function remove(c: ServiceCategory) {
    if (!confirm(`Apagar a categoria "${c.name}" da lista? Os serviços que já estão nela continuam como estão.`)) return;
    if (await run(() => supabase.from('service_categories').delete().eq('id', c.id!))) setList(l => l.filter(x => x.id !== c.id));
  }

  async function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    await run(async () => {
      const rs = await Promise.all(next.map((c, p) => supabase.from('service_categories').update({ position: p }).eq('id', c.id!)));
      return { error: rs.find(r => r.error)?.error ?? null };
    });
  }

  async function add() {
    const name = newName.trim();
    if (!name) return;
    if (list.some(x => x.name.toLowerCase() === name.toLowerCase())) { setError('Essa categoria já existe.'); return; }
    setBusy(true); setError('');
    const { data, error: e } = await supabase.from('service_categories')
      .insert({ owner_id: ownerId, name, position: list.length, sells_parts: false }).select('id, name, sells_parts').single();
    setBusy(false);
    if (e) { setError(e.message); return; }
    setList(l => [...l, { id: data.id as string, name: data.name as string, sellsParts: !!data.sells_parts }]);
    setNewName('');
    onChanged();
  }

  const ready = list.every(c => c.id);

  return (
    <div className="fixed inset-0 z-[70] bg-steel-900/70 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && onClose()}>
      <div onClick={e => e.stopPropagation()} className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-steel-100">
          <h2 className="text-lg font-bold text-steel-900">Categorias de serviço</h2>
          <p className="text-xs text-steel-500 mt-0.5">Valem para todas as suas lojas. Ao renomear, os serviços e as OS que usavam o nome antigo passam para o novo.</p>
        </div>

        <div className="px-5 py-3 overflow-y-auto space-y-2">
          {!ready && !error && <div className="text-sm text-steel-500 py-6 text-center">Preparando a lista…</div>}
          {ready && list.map((c, i) => (
            <CategoryRow key={c.id} c={c} first={i === 0} last={i === list.length - 1} busy={busy}
              onUp={() => move(i, -1)} onDown={() => move(i, 1)} onRemove={() => remove(c)}
              onSells={() => toggleSells(c)} onRename={(orig, v) => rename(c, orig, v)} />
          ))}
          {error && <p className="text-xs font-semibold text-alert-700">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-steel-100 space-y-3">
          <div className="flex gap-2">
            <input className="input !py-2 text-sm flex-1 min-w-0" placeholder="Nova categoria (ex.: Lataria)" value={newName} disabled={busy || !ready}
              onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
            <button type="button" onClick={add} disabled={busy || !ready || !newName.trim()} className="btn-primary text-sm !px-4 disabled:opacity-40">Criar</button>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} disabled={busy} className="min-h-[44px] px-5 rounded-xl bg-steel-900 text-white text-sm font-bold">Pronto</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Uma categoria: o nome é editado aqui e só vale ao sair do campo (o nome de antes fica guardado para saber o que renomear) */
function CategoryRow({ c, first, last, busy, onUp, onDown, onRemove, onSells, onRename }: {
  c: ServiceCategory; first: boolean; last: boolean; busy: boolean;
  onUp: () => void; onDown: () => void; onRemove: () => void; onSells: () => void; onRename: (original: string, value: string) => void;
}) {
  const [text, setText] = useState(c.name);
  useEffect(() => { setText(c.name); }, [c.name]);
  return (
    <div className="rounded-xl border border-steel-200 p-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <button type="button" disabled={busy || first} onClick={onUp} className="h-5 w-7 text-xs text-steel-500 disabled:opacity-30" aria-label="Subir">▲</button>
          <button type="button" disabled={busy || last} onClick={onDown} className="h-5 w-7 text-xs text-steel-500 disabled:opacity-30" aria-label="Descer">▼</button>
        </div>
        <input className="input !py-2 text-sm flex-1 min-w-0" value={text} disabled={busy} aria-label="Nome da categoria"
          onChange={e => setText(e.target.value)} onBlur={() => onRename(c.name, text)}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <button type="button" disabled={busy} onClick={onRemove} className="h-10 w-10 shrink-0 rounded-lg text-steel-400 hover:text-alert-600 hover:bg-steel-50" aria-label="Apagar categoria">✕</button>
      </div>
      <label className="mt-1.5 ml-9 flex items-center gap-2 text-xs text-steel-600 cursor-pointer">
        <input type="checkbox" checked={c.sellsParts} disabled={busy} onChange={onSells} />
        A peça é o que se vende <span className="text-steel-400">(ex.: pneu — entra na OS com preço)</span>
      </label>
    </div>
  );
}
