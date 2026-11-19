import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';

type Mem = { id: string; content: string; source: 'agente' | 'dono'; created_at: string };

/** Memória do agente: o que o dono já ensinou no chat. Dá para apagar e escrever regras na mão. */
export default function AgentMemory({ agentId, workshopId }: { agentId: string; workshopId: string | null }) {
  const [list, setList] = useState<Mem[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('ai_agent_memories').select('id, content, source, created_at')
      .eq('agent_id', agentId).order('created_at', { ascending: true });
    setList((data ?? []) as Mem[]);
    setLoading(false);
  }, [agentId]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const c = text.replace(/\s+/g, ' ').trim();
    if (c.length < 3) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('ai_agent_memories').insert({ agent_id: agentId, workshop_id: workshopId, content: c.slice(0, 500), source: 'dono', created_by: user?.id ?? null });
    setSaving(false);
    if (error) return toast.error(error.message);
    setText('');
    load();
  }

  async function remove(id: string) {
    const { error } = await supabase.from('ai_agent_memories').delete().eq('id', id);
    if (error) return toast.error(error.message);
    setList((l) => l.filter((m) => m.id !== id));
  }

  return (
    <div>
      <label className="label">🧠 Memória (o que ele já aprendeu com você)</label>
      <p className="text-xs text-steel-500 mb-2">
        Quando você ensina um jeito de fazer no chat (ex.: "pneu se lança um por um, com custo unitário"), ele anota aqui e segue nas próximas conversas. Apague o que estiver errado.
      </p>
      {loading ? <div className="text-xs text-steel-500">Carregando…</div> : list.length === 0 ? (
        <div className="text-xs text-steel-500 rounded-xl border border-dashed border-steel-300 p-3">Nada anotado ainda. Ensine no chat ou escreva uma regra abaixo.</div>
      ) : (
        <ul className="space-y-2">
          {list.map((m) => (
            <li key={m.id} className="flex items-start gap-2 rounded-xl border border-steel-200 p-3 text-sm">
              <span className="shrink-0" aria-hidden>{m.source === 'dono' ? '✍️' : '📌'}</span>
              <span className="flex-1 min-w-0">{m.content}
                <span className="block text-[11px] text-steel-400 mt-0.5">{m.source === 'dono' ? 'Escrita por você' : 'Anotada pelo agente'} · {new Date(m.created_at).toLocaleDateString('pt-BR')}</span>
              </span>
              <button className="shrink-0 min-h-[36px] px-2 text-steel-400 hover:text-alert-600" aria-label="Apagar memória" onClick={() => remove(m.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 mt-2">
        <input className="input min-h-[44px]" placeholder="Nova regra (ex.: alinhamento não tem comissão)" value={text} maxLength={500}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn-primary min-h-[44px] shrink-0" disabled={saving || text.trim().length < 3} onClick={add}>Anotar</button>
      </div>
    </div>
  );
}
