import { FormEvent, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { useOperator } from '@/lib/operators';

/* ── Notas internas da conversa: só a equipe vê (o cliente nunca recebe) ───── */

type Tag = 'atencao' | 'importante' | 'retorno';
type Note = { id: string; body: string; tag: Tag | null; author_name: string | null; created_at: string };

const TAGS: Record<Tag, { label: string; cls: string }> = {
  atencao:    { label: '⚠️ Atenção',    cls: 'bg-alert-500/10 text-alert-600 border-alert-500/30' },
  importante: { label: '⭐ Importante', cls: 'bg-pending-500/10 text-pending-700 border-pending-500/30' },
  retorno:    { label: '📞 Retornar',   cls: 'bg-sky-50 text-sky-700 border-sky-200' },
};

export default function ChatNotes({ chatId, workshopId }: { chatId: string; workshopId: string }) {
  const { user, profile } = useAuth();
  const op = useOperator();
  const [notes, setNotes] = useState<Note[]>([]);
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState('');
  const [tag, setTag] = useState<Tag | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('whatsapp_chat_notes').select('id, body, tag, author_name, created_at')
      .eq('chat_id', chatId).order('created_at', { ascending: false });
    setNotes((data ?? []) as Note[]);
  }, [chatId]);
  useEffect(() => { load(); setAdding(false); setBody(''); setTag(null); }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    // No modo balcão, quem escreveu é quem está operando (não o dono do login)
    const author = (op.balcao ? op.session?.name : null) ?? profile?.full_name ?? null;
    const { error } = await supabase.from('whatsapp_chat_notes').insert({
      workshop_id: workshopId, chat_id: chatId, body: body.trim(), tag, created_by: user?.id ?? null, author_name: author,
    });
    setSaving(false);
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    setBody(''); setTag(null); setAdding(false);
    load();
  }

  async function remove(n: Note) {
    if (!confirm('Apagar esta nota?')) return;
    const { error } = await supabase.from('whatsapp_chat_notes').delete().eq('id', n.id);
    if (error) { toast.error('Não apagou: ' + error.message); return; }
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-steel-500">
          📝 Notas da equipe{notes.length > 0 && <span className="ml-1 text-steel-400">({notes.length})</span>}
        </p>
        {!adding && <button type="button" onClick={() => setAdding(true)} className="text-xs font-semibold text-brand-600 hover:underline">+ Nota</button>}
      </div>

      {adding && (
        <form onSubmit={save} className="rounded-xl border border-steel-200 p-2 mb-2 space-y-2">
          <textarea className="input text-sm min-h-[64px]" autoFocus value={body} onChange={e => setBody(e.target.value)}
            placeholder="Ex.: prefere que liguem depois das 18h" />
          <div className="flex flex-wrap gap-1">
            {(Object.keys(TAGS) as Tag[]).map(t => (
              <button key={t} type="button" onClick={() => setTag(x => (x === t ? null : t))}
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${tag === t ? TAGS[t].cls : 'bg-white text-steel-500 border-steel-200'}`}>
                {TAGS[t].label}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setAdding(false)}>Cancelar</button>
            <button type="submit" className="btn-primary !py-1 text-xs" disabled={saving || !body.trim()}>{saving ? '…' : 'Salvar nota'}</button>
          </div>
          <p className="text-[10px] text-steel-400">Só a equipe vê. O cliente não recebe.</p>
        </form>
      )}

      {notes.length === 0 && !adding && <p className="text-sm text-steel-400 italic">Nenhuma nota</p>}
      <div className="space-y-1.5">
        {notes.map(n => (
          <div key={n.id} className="group rounded-xl bg-pending-500/5 border border-pending-500/20 px-2.5 py-2">
            {n.tag && <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full border mb-1 ${TAGS[n.tag].cls}`}>{TAGS[n.tag].label}</span>}
            <p className="text-sm text-steel-800 whitespace-pre-wrap">{n.body}</p>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-steel-400">
                {n.author_name ?? 'Equipe'} · {new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
              <button type="button" onClick={() => remove(n)} className="text-[10px] text-steel-400 hover:text-alert-600 sm:opacity-0 sm:group-hover:opacity-100">Apagar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
