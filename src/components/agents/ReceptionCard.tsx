import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import AgentHeader from '@/components/agents/AgentHeader';
import { RECEPTION_TEMPLATE, type ReceptionAgent, type ReceptionScope, type ReceptionHours } from '@/lib/agents';

const COLS = 'id, workshop_id, name, system_prompt, enabled, settings';
const tpl = RECEPTION_TEMPLATE;

/** Recepção: agente que responde o lead no WhatsApp (liga/desliga, para quem vale e jeito de falar) */
export default function ReceptionCard({ workshopId }: { workshopId: string }) {
  const [agent, setAgent] = useState<ReceptionAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', system_prompt: '' });
  const [saving, setSaving] = useState(false);
  const [stats, setStats] = useState<{ total: number; done: number; off: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('ai_agents').select(COLS)
      .eq('workshop_id', workshopId).eq('template', 'recepcao').maybeSingle();
    const a = data as ReceptionAgent | null;
    setAgent(a);
    if (a) setDraft({ name: a.name, system_prompt: a.system_prompt });
    // Últimos 30 dias: conversas que a Recepção atendeu
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data: chats } = await supabase.from('whatsapp_chats').select('agent_state')
      .eq('workshop_id', workshopId).eq('agent_template', 'recepcao').gte('agent_started_at', since);
    const rows = (chats ?? []) as { agent_state: string | null }[];
    setStats({ total: rows.length, done: rows.filter((r) => r.agent_state === 'done').length, off: rows.filter((r) => r.agent_state === 'off').length });
    setLoading(false);
  }, [workshopId]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    const { data, error } = await supabase.from('ai_agents').insert({
      workshop_id: workshopId, template: 'recepcao', name: tpl.name, system_prompt: tpl.prompt,
      tools: [], enabled: false, settings: { scope: 'site' },
    }).select(COLS).single();
    if (error) return toast.error(error.message);
    const a = data as ReceptionAgent;
    setAgent(a);
    setDraft({ name: a.name, system_prompt: a.system_prompt });
    toast.success('Recepção criada. Confira e ligue quando quiser ✓');
  }

  async function patch(p: Partial<Pick<ReceptionAgent, 'enabled' | 'settings' | 'name' | 'system_prompt'>>) {
    if (!agent) return false;
    const { error } = await supabase.from('ai_agents').update(p).eq('id', agent.id);
    if (error) { toast.error(error.message); return false; }
    setAgent({ ...agent, ...p });
    return true;
  }

  async function toggle() {
    if (!agent) return;
    if (!agent.enabled && !window.confirm('Ligar a Recepção? Ela vai responder sozinha os clientes no WhatsApp da oficina até alguém da equipe entrar na conversa.')) return;
    if (await patch({ enabled: !agent.enabled })) toast.success(agent.enabled ? 'Recepção desligada' : 'Recepção ligada ✓');
  }

  async function save() {
    if (!draft.name.trim() || !draft.system_prompt.trim()) return toast.error('Nome e instruções são obrigatórios');
    setSaving(true);
    const ok = await patch({ name: draft.name.trim(), system_prompt: draft.system_prompt.trim() });
    setSaving(false);
    if (ok) { setOpen(false); toast.success('Recepção atualizada ✓'); }
  }

  if (loading) return <div className="card text-sm text-steel-500">Carregando…</div>;

  if (!agent) {
    return (
      <div className="card p-4 flex items-start gap-3">
        <div className="h-12 w-12 rounded-2xl bg-brand-50 grid place-items-center text-2xl shrink-0" aria-hidden>{tpl.icon}</div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[15px] text-steel-900">{tpl.name}</h3>
          <p className="text-xs text-steel-500 mt-1 leading-snug">{tpl.desc}</p>
          <button className="btn-primary mt-3 w-full sm:w-auto min-h-[44px]" onClick={create}>Criar Recepção</button>
        </div>
      </div>
    );
  }

  const scope: ReceptionScope = agent.settings?.scope ?? 'site';
  const hours: ReceptionHours = agent.settings?.hours ?? 'sempre';
  const returnDays = agent.settings?.return_days ?? 7;
  const openOs = agent.settings?.open_os === true;
  async function toggleOpenOs() {
    if (!openOs && !window.confirm('Ligar a abertura de OS? A Recepção vai criar a OS (sem valor e sem horário) quando o cliente passar o problema e o carro. Você confere depois.')) return;
    if (await patch({ settings: { ...agent!.settings, open_os: !openOs } })) toast.success(openOs ? 'Abertura de OS desligada' : 'Abertura de OS ligada ✓');
  }
  return (
    <div className="space-y-3">
      <AgentHeader icon={tpl.icon} name={agent.name} desc={tpl.desc} tag="Responde no WhatsApp"
        meta={<span>{agent.enabled ? '🟢 Respondendo no WhatsApp' : 'Desligada'}
          {stats && stats.total > 0 && ` · ${stats.total} conversa${stats.total > 1 ? 's' : ''} em 30 dias, ${stats.done} passada${stats.done === 1 ? '' : 's'} para a equipe`}</span>}
        enabled={agent.enabled} onToggle={toggle}
        actions={[{ key: 'config', icon: '⚙️', label: 'Configurar instruções', onClick: () => setOpen((v) => !v), active: open }]} />

      <div className="card space-y-4">
      <div>
        <label className="label">Quem ela atende</label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(tpl.scopes) as ReceptionScope[]).map((s) => (
            <button key={s} type="button" onClick={() => patch({ settings: { ...agent.settings, scope: s } })}
              className={`rounded-xl border px-3 py-2 text-sm text-left ${scope === s ? 'border-brand-500 bg-brand-50 dark:bg-steel-800 font-medium' : 'border-steel-200 dark:border-steel-700'}`}>
              {tpl.scopes[s]}
            </button>
          ))}
        </div>
        {scope === 'todos' && (
          <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
            <span>Cliente que volta a chamar depois de</span>
            <select className="input !w-auto !py-1.5" value={returnDays}
              onChange={(e) => patch({ settings: { ...agent.settings, return_days: Number(e.target.value) } })}>
              {[3, 7, 15, 30].map((d) => <option key={d} value={d}>{d} dias</option>)}
            </select>
            <span>sem conversa</span>
          </div>
        )}
        <p className="text-xs text-steel-500 mt-2">
          Ela só entra no começo de um atendimento e sai assim que alguém da equipe responder (pelo sistema ou pelo celular).
          Cliente cadastrado é recebido pelo nome. Não passa preço, não confirma horário e, em caso de risco, manda parar o carro e marca urgente.
        </p>
      </div>

      <div>
        <label className="label">Quando ela atende</label>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(tpl.hours) as ReceptionHours[]).map((h) => (
            <button key={h} type="button" onClick={() => patch({ settings: { ...agent.settings, hours: h } })}
              className={`rounded-xl border px-3 py-2 text-sm text-left ${hours === h ? 'border-brand-500 bg-brand-50 dark:bg-steel-800 font-medium' : 'border-steel-200 dark:border-steel-700'}`}>
              {tpl.hours[h]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Abrir a OS do cliente</label>
        <label className="flex items-start gap-2 text-sm cursor-pointer rounded-xl border border-steel-200 dark:border-steel-700 p-3">
          <input type="checkbox" className="mt-0.5" checked={openOs} onChange={toggleOpenOs} />
          <span>
            Abrir a OS quando o cliente passar o problema e o carro
            <span className="block text-xs text-steel-500 mt-0.5">
              A OS nasce como pré-registro 🤖, sem valor e sem horário, no nome do cliente (cadastra se for novo). Uma por atendimento, no máximo 15 por dia.
              A equipe confere e confirma horário e valor.
            </span>
          </span>
        </label>
      </div>

      {open && (
        <div className="space-y-4 border-t border-steel-200 dark:border-steel-700 pt-4">
          <div>
            <label className="label">Nome</label>
            <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Jeito de falar</label>
            <textarea className="input min-h-[180px]" value={draft.system_prompt}
              onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })} />
            <button className="text-xs text-brand-600 mt-1" onClick={() => setDraft({ ...draft, system_prompt: tpl.prompt })}>
              Restaurar instruções originais
            </button>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
            <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
