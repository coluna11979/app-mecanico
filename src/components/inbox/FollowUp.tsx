import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { useOperator } from '@/lib/operators';
import { followUpDue, followUpLabel, type WaChat } from '@/lib/inbox';

/* ── "Lembrar de retornar": no dia marcado a conversa aparece em "Retornar" com o motivo ── */

const QUICK: { label: string; days: number }[] = [
  { label: 'Amanhã', days: 1 },
  { label: '3 dias', days: 3 },
  { label: '1 semana', days: 7 },
  { label: '15 dias', days: 15 },
];
const REASONS = ['Ver se aprovou o orçamento', 'Confirmar o agendamento', 'Perguntar se ficou tudo certo com o carro', 'Avisar que a peça chegou'];

/** Dia escolhido às 9h (horário em que a conversa "acorda") */
function at9(day: Date) { const d = new Date(day); d.setHours(9, 0, 0, 0); return d; }
const inputDate = (d: Date) => d.toLocaleDateString('en-CA');

export default function FollowUp({ chat }: { chat: WaChat }) {
  const { profile } = useAuth();
  const op = useOperator();
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setEditing(false); }, [chat.id]);

  function startEdit() {
    const base = chat.follow_up_at ? new Date(chat.follow_up_at) : new Date(Date.now() + 86400000);
    setDate(inputDate(base));
    setNote(chat.follow_up_note ?? '');
    setEditing(true);
  }

  async function save(when: Date | null, why: string | null) {
    setSaving(true);
    const who = (op.balcao ? op.session?.name : null) ?? profile?.full_name ?? null;
    const { error } = await supabase.from('whatsapp_chats').update({
      follow_up_at: when ? when.toISOString() : null,
      follow_up_note: when ? (why?.trim() || null) : null,
      follow_up_by: when ? who : null,
    }).eq('id', chat.id);
    setSaving(false);
    if (error) { toast.error('Não salvou: ' + error.message); return; }
    setEditing(false);
    toast.success(when ? `Retorno marcado para ${when.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} 🔔` : 'Retorno concluído ✓');
  }

  // Retorno marcado
  if (chat.follow_up_at && !editing) {
    const due = followUpDue(chat);
    return (
      <div className={`rounded-2xl border p-3 ${due ? 'border-pending-300 bg-pending-500/10' : 'border-sky-200 bg-sky-50'}`}>
        <p className={`text-sm font-bold ${due ? 'text-pending-700' : 'text-sky-700'}`}>
          🔔 Retornar {followUpLabel(chat.follow_up_at)}
          <span className="font-normal text-steel-500"> · {new Date(chat.follow_up_at).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
        </p>
        {chat.follow_up_note && <p className="text-sm text-steel-800 mt-1">{chat.follow_up_note}</p>}
        {chat.follow_up_by && <p className="text-[11px] text-steel-500 mt-1">Marcado por {chat.follow_up_by}</p>}
        <div className="flex gap-2 mt-3">
          <button type="button" disabled={saving} onClick={() => save(null, null)}
            className="flex-1 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold">✓ Já retornei</button>
          <button type="button" onClick={startEdit} className="px-3 py-1.5 rounded-lg border border-steel-200 bg-white text-xs font-semibold text-steel-600">Mudar</button>
        </div>
      </div>
    );
  }

  // Marcar (ou mudar) o retorno
  if (!editing) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-steel-600">Precisa falar com esse cliente depois? Marque o dia e a conversa volta para o topo, em <b>Retornar</b>.</p>
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK.map(q => (
            <button key={q.days} type="button" onClick={() => { setDate(inputDate(new Date(Date.now() + q.days * 86400000))); setNote(''); setEditing(true); }}
              className="py-2 rounded-xl border border-steel-200 text-sm font-semibold text-steel-700 hover:border-brand-300 hover:bg-brand-50">
              {q.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={startEdit} className="text-xs font-semibold text-brand-600 hover:underline">Escolher outra data</button>
      </div>
    );
  }

  return (
    <form className="space-y-2.5" onSubmit={e => { e.preventDefault(); if (date) save(at9(new Date(`${date}T00:00`)), note); }}>
      <div>
        <label className="label">Retornar em</label>
        <input type="date" className="input text-sm" value={date} min={inputDate(new Date())} onChange={e => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="label">Motivo</label>
        <input className="input text-sm" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: ver se aprovou o orçamento" autoFocus />
        <div className="flex flex-wrap gap-1 mt-1.5">
          {REASONS.map(r => (
            <button key={r} type="button" onClick={() => setNote(r)}
              className={`text-[11px] px-2 py-0.5 rounded-full border ${note === r ? 'bg-steel-900 text-white border-steel-900' : 'border-steel-200 text-steel-600 hover:bg-steel-50'}`}>{r}</button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost !py-1.5 text-sm" onClick={() => setEditing(false)}>Cancelar</button>
        <button type="submit" className="btn-primary !py-1.5 text-sm" disabled={saving || !date}>{saving ? '…' : '🔔 Marcar retorno'}</button>
      </div>
    </form>
  );
}
