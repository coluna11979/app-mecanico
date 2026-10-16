import { FormEvent, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';

/* ── Respostas rápidas do Inbox: "/" na caixa de mensagem ou botão ⚡ ──────── */

export type QuickReply = { id: string; shortcut: string; title: string; body: string };

/** Sugestões para começar (a oficina edita ou apaga) */
const STARTERS: Omit<QuickReply, 'id'>[] = [
  { shortcut: 'oi', title: 'Saudação', body: 'Olá, {nome}! Aqui é da {oficina}. Como posso ajudar?' },
  { shortcut: 'pronto', title: 'Carro pronto', body: '{nome}, seu carro está pronto! Pode vir buscar quando quiser. 🚗✅' },
  { shortcut: 'endereco', title: 'Endereço', body: 'Estamos na Rua …, nº … – bairro. Horário: seg a sex 8h às 18h, sáb 8h às 12h.' },
  { shortcut: 'pix', title: 'Chave PIX', body: 'Segue nossa chave PIX: …\nAssim que pagar, manda o comprovante por aqui, por favor. 🙏' },
];

export function useQuickReplies(workshopId: string) {
  const [list, setList] = useState<QuickReply[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from('whatsapp_quick_replies').select('id, shortcut, title, body')
      .eq('workshop_id', workshopId).order('shortcut');
    setList((data ?? []) as QuickReply[]);
  }, [workshopId]);
  useEffect(() => { load(); }, [load]);
  return { list, reload: load };
}

/** Troca {nome} e {oficina} pelo cliente e pela loja */
export function fillReply(body: string, vars: { nome: string; oficina: string }) {
  return body.replace(/\{nome\}/g, vars.nome).replace(/\{oficina\}/g, vars.oficina);
}

/** Lista que aparece em cima da caixa quando a mensagem começa com "/" */
export function QuickReplySuggest({ list, query, active, onPick }: {
  list: QuickReply[]; query: string; active: number; onPick: (r: QuickReply) => void;
}) {
  const items = matchReplies(list, query);
  if (!items.length) {
    return (
      <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-steel-200 bg-white shadow-lg px-3 py-2 text-xs text-steel-500">
        Nenhuma resposta rápida “/{query}”. Crie no botão ⚡.
      </div>
    );
  }
  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-steel-200 bg-white shadow-lg overflow-hidden max-h-64 overflow-y-auto">
      {items.map((r, i) => (
        <button key={r.id} type="button" onMouseDown={e => { e.preventDefault(); onPick(r); }}
          className={`w-full text-left px-3 py-2 border-b border-steel-50 last:border-0 ${i === active ? 'bg-brand-50' : 'hover:bg-steel-50'}`}>
          <span className="text-xs font-bold text-brand-600">/{r.shortcut}</span>
          <span className="text-xs font-semibold text-steel-700 ml-2">{r.title}</span>
          <span className="block text-xs text-steel-500 truncate">{r.body}</span>
        </button>
      ))}
    </div>
  );
}

export const matchReplies = (list: QuickReply[], query: string) => {
  const q = query.toLowerCase();
  return list.filter(r => r.shortcut.startsWith(q) || r.title.toLowerCase().includes(q)).slice(0, 8);
};

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9_-]+/g, '').slice(0, 30);

/** Janela ⚡: escolher, criar, editar e apagar respostas rápidas */
export function QuickRepliesModal({ workshopId, list, reload, onPick, onClose }: {
  workshopId: string; list: QuickReply[]; reload: () => void;
  onPick: (r: QuickReply) => void; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<QuickReply> | null>(null);
  const [saving, setSaving] = useState(false);

  const shown = search.trim() ? matchReplies(list, search.trim().replace(/^\//, '')) : list;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const shortcut = slug(editing.shortcut ?? '');
    if (!shortcut || !editing.title?.trim() || !editing.body?.trim()) { toast.error('Preencha atalho, título e mensagem'); return; }
    setSaving(true);
    const row = { shortcut, title: editing.title.trim(), body: editing.body.trim() };
    const { error } = editing.id
      ? await supabase.from('whatsapp_quick_replies').update(row).eq('id', editing.id)
      : await supabase.from('whatsapp_quick_replies').insert({ ...row, workshop_id: workshopId });
    setSaving(false);
    if (error) { toast.error(error.code === '23505' ? `Já existe o atalho /${shortcut}` : 'Não salvou: ' + error.message); return; }
    setEditing(null);
    reload();
  }

  async function remove(r: QuickReply) {
    if (!confirm(`Apagar a resposta /${r.shortcut}?`)) return;
    const { error } = await supabase.from('whatsapp_quick_replies').delete().eq('id', r.id);
    if (error) { toast.error('Não apagou: ' + error.message); return; }
    reload();
  }

  async function addStarters() {
    const have = new Set(list.map(r => r.shortcut));
    const rows = STARTERS.filter(s => !have.has(s.shortcut)).map(s => ({ ...s, workshop_id: workshopId }));
    if (!rows.length) return;
    const { error } = await supabase.from('whatsapp_quick_replies').insert(rows);
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    toast.success('Exemplos criados — edite com os dados da oficina');
    reload();
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="card max-w-lg w-full max-h-[88vh] flex flex-col !p-0" onClick={e => e.stopPropagation()}>
        <div className="px-5 pt-4 pb-3 border-b border-steel-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">⚡ Respostas rápidas</h2>
          <button type="button" onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl">✕</button>
        </div>

        {editing ? (
          <form onSubmit={save} className="p-5 space-y-3 overflow-y-auto">
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <div>
                <label className="label">Atalho</label>
                <div className="flex items-center input !py-0 !pl-2">
                  <span className="text-steel-400">/</span>
                  <input className="flex-1 bg-transparent outline-none py-2.5 text-sm" value={editing.shortcut ?? ''} placeholder="pix"
                    onChange={e => setEditing(x => ({ ...x!, shortcut: slug(e.target.value) }))} autoFocus />
                </div>
              </div>
              <div>
                <label className="label">Título</label>
                <input className="input text-sm" value={editing.title ?? ''} placeholder="Chave PIX"
                  onChange={e => setEditing(x => ({ ...x!, title: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">Mensagem</label>
              <textarea className="input text-sm min-h-[140px]" value={editing.body ?? ''}
                onChange={e => setEditing(x => ({ ...x!, body: e.target.value }))} />
              <p className="text-[11px] text-steel-500 mt-1">
                Use <code className="bg-steel-100 px-1 rounded">{'{nome}'}</code> para o primeiro nome do cliente e{' '}
                <code className="bg-steel-100 px-1 rounded">{'{oficina}'}</code> para o nome da loja.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Voltar</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        ) : (
          <>
            <div className="px-5 py-3 flex gap-2">
              <input className="input !py-2 text-sm flex-1" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
              <button type="button" className="btn-primary !py-2 text-sm shrink-0" onClick={() => setEditing({})}>+ Nova</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
              {list.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-steel-600 font-semibold">Nenhuma resposta rápida ainda</p>
                  <p className="text-xs text-steel-500 mt-1">Ex.: endereço, horário, chave PIX, “seu carro está pronto”.</p>
                  <button type="button" className="btn-secondary text-sm mt-3" onClick={addStarters}>Criar exemplos para editar</button>
                </div>
              )}
              {shown.map(r => (
                <div key={r.id} className="rounded-xl border border-steel-200 hover:border-brand-300 transition">
                  <button type="button" className="w-full text-left px-3 pt-2 pb-1" onClick={() => onPick(r)}>
                    <span className="text-xs font-bold text-brand-600">/{r.shortcut}</span>
                    <span className="text-sm font-semibold text-steel-800 ml-2">{r.title}</span>
                    <span className="block text-xs text-steel-500 whitespace-pre-wrap line-clamp-3 mt-0.5">{r.body}</span>
                  </button>
                  <div className="flex justify-end gap-3 px-3 pb-2">
                    <button type="button" className="text-[11px] font-semibold text-steel-500 hover:text-steel-800" onClick={() => setEditing(r)}>Editar</button>
                    <button type="button" className="text-[11px] font-semibold text-steel-400 hover:text-alert-600" onClick={() => remove(r)}>Apagar</button>
                  </div>
                </div>
              ))}
              {list.length > 0 && shown.length === 0 && <p className="text-sm text-steel-500 text-center py-4">Nada encontrado.</p>}
            </div>
            <p className="px-5 py-2.5 border-t border-steel-100 text-[11px] text-steel-500">
              Dica: na caixa de mensagem, digite <b>/</b> e o atalho (ex.: <b>/pix</b>) e aperte Enter.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
