import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { useOperator } from '@/lib/operators';
import { fmtBRL } from '@/components/os/osHelpers';
import { timeAgo } from '@/lib/customers';
import type { WaChat } from '@/lib/inbox';

/* ── Oportunidade: contato interessado antes de existir orçamento (vai para Comercial → Interessados) ── */

const parseMoney = (s: string) => {
  const n = Number(s.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export default function LeadBox({ chat }: { chat: WaChat }) {
  const { profile } = useAuth();
  const op = useOperator();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setEditing(false); }, [chat.id]);

  function start() {
    setNote(chat.lead_note ?? '');
    setValue(chat.lead_value ? String(chat.lead_value).replace('.', ',') : '');
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!note.trim()) { toast.error('Escreva o que o cliente quer'); return; }
    setSaving(true);
    const who = (op.balcao ? op.session?.name : null) ?? profile?.full_name ?? null;
    const { error } = await supabase.from('whatsapp_chats').update({
      lead_at: chat.lead_at ?? new Date().toISOString(), lead_note: note.trim(), lead_value: parseMoney(value), lead_by: who,
    }).eq('id', chat.id);
    setSaving(false);
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    setEditing(false);
    toast.success('Interessado no Comercial 💰');
  }

  async function discard() {
    if (!confirm('Tirar este contato dos interessados?')) return;
    const { error } = await supabase.from('whatsapp_chats')
      .update({ lead_at: null, lead_note: null, lead_value: null, lead_by: null }).eq('id', chat.id);
    if (error) toast.error('Não salvou: ' + error.message);
  }

  if (editing) {
    return (
      <form onSubmit={save} className="rounded-2xl border border-brand-200 bg-brand-50/40 p-3 space-y-2">
        <p className="text-xs font-bold text-brand-700">💰 Interessado</p>
        <input className="input text-sm" autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="O que ele quer? Ex.: embreagem do Gol" />
        <input className="input text-sm" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder="Valor estimado (opcional), ex.: 1.200" />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setEditing(false)}>Cancelar</button>
          <button type="submit" className="btn-primary !py-1 text-xs" disabled={saving}>{saving ? '…' : 'Salvar'}</button>
        </div>
        <p className="text-[10px] text-steel-500">Aparece em Comercial → Interessados até virar orçamento.</p>
      </form>
    );
  }

  if (!chat.lead_at) {
    return (
      <button type="button" onClick={start}
        className="w-full py-2 rounded-xl border border-dashed border-brand-300 text-sm font-semibold text-brand-700 hover:bg-brand-50">
        💰 Marcar como interessado
      </button>
    );
  }

  const newOs = chat.customer_id ? `/oficina/os?nova=1&cliente=${chat.customer_id}` : '/oficina/os?nova=1';
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-brand-700">💰 Interessado <span className="font-normal text-steel-500">· {timeAgo(chat.lead_at)}</span></p>
        <button type="button" onClick={start} className="text-[11px] font-semibold text-steel-500 hover:text-steel-800">Editar</button>
      </div>
      <p className="text-sm font-semibold text-steel-800 mt-0.5">{chat.lead_note}</p>
      {chat.lead_value != null && <p className="text-xs text-steel-600">~{fmtBRL(Number(chat.lead_value))}</p>}
      <div className="flex gap-2 mt-2">
        <Link to={newOs} className="flex-1 text-center py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold">Montar orçamento</Link>
        <button type="button" onClick={discard} className="px-3 py-1.5 rounded-lg border border-steel-200 bg-white text-xs font-semibold text-steel-500">Descartar</button>
      </div>
    </div>
  );
}
