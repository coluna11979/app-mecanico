import { useCallback, useEffect, useRef, useState } from 'react';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOperator } from '@/lib/operators';
import { AGENT_TEMPLATES, AGENT_TOOLS, type Agent, type AgentMessage, type AgentQuestion } from '@/lib/agents';

const COLS = 'id, workshop_id, template, name, system_prompt, tools, enabled, questions_seeded';

export default function Agentes() {
  const { currentWorkshop } = useAuth();
  const balcao = useOperator((s) => s.balcao);
  const wid = currentWorkshop?.id;
  const tpl = AGENT_TEMPLATES.socio;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [draft, setDraft] = useState<Pick<Agent, 'name' | 'system_prompt' | 'tools'>>({ name: '', system_prompt: '', tools: [] });
  const [saving, setSaving] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [questions, setQuestions] = useState<AgentQuestion[]>([]);
  const [showQuestions, setShowQuestions] = useState(true);
  const [editQ, setEditQ] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);   // categoria em que está digitando
  const [newQ, setNewQ] = useState('');
  const [newCat, setNewCat] = useState('');
  // Consultas novas do template que o agente ainda não tem (o dono libera ou dispensa)
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    if (!agent) return;
    try { setDismissed(JSON.parse(localStorage.getItem(`agent-dismissed:${agent.id}`) ?? '[]')); } catch { setDismissed([]); }
  }, [agent?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const newTools = agent ? tpl.tools.filter((k) => !agent.tools.includes(k) && !dismissed.includes(k)) : [];

  /** Perguntas salvas; na primeira abertura entram as do template (e não voltam se o dono apagar) */
  async function loadQuestions(a: Agent) {
    let { data } = await supabase.from('ai_agent_questions').select('id, category, question, position')
      .eq('agent_id', a.id).order('position').order('created_at');
    if (!a.questions_seeded) {
      const rows = Object.entries(tpl.questions).flatMap(([category, qs]) => qs.map((question, i) => ({
        agent_id: a.id, workshop_id: a.workshop_id, category, question, position: i,
      })));
      if (!data?.length) await supabase.from('ai_agent_questions').insert(rows);
      await supabase.from('ai_agents').update({ questions_seeded: true }).eq('id', a.id);
      setAgent((cur) => (cur ? { ...cur, questions_seeded: true } : cur));
      ({ data } = await supabase.from('ai_agent_questions').select('id, category, question, position')
        .eq('agent_id', a.id).order('position').order('created_at'));
    }
    setQuestions((data ?? []) as AgentQuestion[]);
  }

  async function addQuestion(category: string) {
    const q = newQ.trim(); const c = category.trim();
    if (!agent || !q || !c) return toast.error('Escreva a pergunta e a categoria');
    const pos = questions.filter((x) => x.category === c).length;
    const { data, error } = await supabase.from('ai_agent_questions')
      .insert({ agent_id: agent.id, workshop_id: agent.workshop_id, category: c, question: q, position: pos })
      .select('id, category, question, position').single();
    if (error) return toast.error(error.message);
    setQuestions((l) => [...l, data as AgentQuestion]);
    setNewQ(''); setNewCat(''); setAdding(null);
  }

  /** Coloca a pergunta no campo para o dono ajustar antes de enviar */
  function pickQuestion(question: string) {
    setText(question);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(question.length, question.length);
    });
  }

  async function removeQuestion(id: string) {
    const { error } = await supabase.from('ai_agent_questions').delete().eq('id', id);
    if (error) return toast.error(error.message);
    setQuestions((l) => l.filter((x) => x.id !== id));
  }

  const load = useCallback(async () => {
    if (!wid) return;
    setLoading(true);
    const { data } = await supabase.from('ai_agents').select(COLS).eq('workshop_id', wid).eq('template', 'socio').maybeSingle();
    const a = data as Agent | null;
    setAgent(a);
    if (a) {
      setDraft({ name: a.name, system_prompt: a.system_prompt, tools: a.tools });
      const { data: msgs } = await supabase.from('ai_agent_messages').select('id, role, content, created_at')
        .eq('agent_id', a.id).order('created_at', { ascending: false }).limit(50);
      setMessages(((msgs ?? []) as AgentMessage[]).reverse());
      await loadQuestions(a);
    }
    setLoading(false);
  }, [wid]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  async function createAgent() {
    if (!wid) return;
    const { data, error } = await supabase.from('ai_agents')
      .insert({ workshop_id: wid, template: 'socio', name: tpl.name, system_prompt: tpl.prompt, tools: tpl.tools })
      .select(COLS).single();
    if (error) return toast.error(error.message);
    setAgent(data as Agent);
    setDraft({ name: tpl.name, system_prompt: tpl.prompt, tools: tpl.tools });
    await loadQuestions(data as Agent);
  }

  async function saveConfig() {
    if (!agent) return;
    if (!draft.name.trim() || !draft.system_prompt.trim()) return toast.error('Nome e instruções são obrigatórios');
    setSaving(true);
    const { error } = await supabase.from('ai_agents').update({
      name: draft.name.trim(), system_prompt: draft.system_prompt.trim(), tools: draft.tools,
    }).eq('id', agent.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    setAgent({ ...agent, ...draft });
    setShowConfig(false);
    toast.success('Agente atualizado ✓');
  }

  async function acceptNewTools() {
    if (!agent) return;
    const tools = [...agent.tools, ...newTools];
    const { error } = await supabase.from('ai_agents').update({ tools }).eq('id', agent.id);
    if (error) return toast.error(error.message);
    setAgent({ ...agent, tools });
    setDraft((d) => ({ ...d, tools }));
    toast.success('Novas consultas liberadas ✓');
  }

  function dismissNewTools() {
    if (!agent) return;
    const next = [...dismissed, ...newTools];
    setDismissed(next);
    try { localStorage.setItem(`agent-dismissed:${agent.id}`, JSON.stringify(next)); } catch { /* ignora */ }
  }

  async function toggleEnabled() {
    if (!agent) return;
    const enabled = !agent.enabled;
    const { error } = await supabase.from('ai_agents').update({ enabled }).eq('id', agent.id);
    if (error) return toast.error(error.message);
    setAgent({ ...agent, enabled });
  }

  async function clearHistory() {
    if (!agent || !window.confirm('Apagar toda a conversa com o agente?')) return;
    const { error } = await supabase.from('ai_agent_messages').delete().eq('agent_id', agent.id);
    if (error) return toast.error(error.message);
    setMessages([]);
  }

  async function send(question?: string) {
    const q = (question ?? text).trim();
    if (!agent || !q || sending) return;
    setText('');
    setSending(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: q, created_at: new Date().toISOString() }]);
    const { data, error } = await supabase.functions.invoke('agent-chat', { body: { agent_id: agent.id, message: q } });
    setSending(false);
    if (error || !data?.ok) {
      // O corpo do erro da edge function vem em error.context (Response)
      let msg = data?.error as string | undefined;
      try { msg ??= (await (error as { context?: Response })?.context?.json())?.error; } catch { /* sem corpo */ }
      setMessages((m) => m.slice(0, -1));
      setText(q);
      return toast.error(msg ?? 'Não consegui falar com o agente agora');
    }
    setMessages((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: data.answer as string, created_at: new Date().toISOString() }]);
  }

  if (balcao) {
    return (
      <WorkshopLayout>
        <div className="card max-w-xl text-sm text-steel-500">🔒 Os agentes de IA são só para o dono da oficina. Saia do modo balcão para abrir.</div>
      </WorkshopLayout>
    );
  }

  return (
    <WorkshopLayout>
      <div className="max-w-3xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold">🤖 Agentes de IA</h1>
          <p className="text-sm text-steel-500 mt-1">
            Converse com a IA sobre os números da {currentWorkshop?.business_name ?? 'oficina'}. Ela só consulta os dados, não altera nada.
          </p>
        </div>

        {loading ? (
          <div className="card text-sm text-steel-500">Carregando…</div>
        ) : !agent ? (
          <div className="card flex items-start gap-4">
            <div className="text-3xl">{tpl.icon}</div>
            <div className="flex-1">
              <div className="font-semibold">{tpl.name}</div>
              <p className="text-sm text-steel-500 mt-0.5">{tpl.desc}</p>
              <button className="btn-primary mt-3" onClick={createAgent}>Criar agente</button>
            </div>
          </div>
        ) : (
          <>
            <div className="card flex items-center gap-3">
              <div className="text-3xl">{tpl.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{agent.name}</div>
                <div className="text-xs text-steel-500">{agent.tools.length} consultas liberadas</div>
              </div>
              <button className="btn-ghost text-sm" onClick={() => setShowConfig((v) => !v)}>⚙️ Configurar</button>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={agent.enabled} onChange={toggleEnabled} />
                {agent.enabled ? 'Ligado' : 'Desligado'}
              </label>
            </div>

            {newTools.length > 0 && (
              <div className="card border-brand-300 bg-brand-50 dark:bg-steel-800 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px] text-sm">
                  <div className="font-semibold">✨ Novas consultas disponíveis para o {agent.name}</div>
                  <div className="text-steel-500 mt-0.5">{newTools.map((k) => AGENT_TOOLS[k]?.label ?? k).join(', ')}</div>
                </div>
                <button className="btn-ghost text-sm" onClick={dismissNewTools}>Agora não</button>
                <button className="btn-primary text-sm" onClick={acceptNewTools}>Liberar</button>
              </div>
            )}

            {showConfig && (
              <div className="card space-y-4">
                <div>
                  <label className="label">Nome</label>
                  <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div>
                  <label className="label">Instruções do agente</label>
                  <textarea className="input min-h-[180px]" value={draft.system_prompt}
                    onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value })} />
                  <button className="text-xs text-brand-600 mt-1" onClick={() => setDraft({ ...draft, system_prompt: tpl.prompt })}>
                    Restaurar instruções originais
                  </button>
                </div>
                <div>
                  <label className="label">O que ele pode consultar</label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {Object.entries(AGENT_TOOLS).map(([key, t]) => (
                      <label key={key} className="flex items-start gap-2 text-sm cursor-pointer rounded-xl border border-steel-200 dark:border-steel-700 p-3">
                        <input type="checkbox" className="mt-0.5" checked={draft.tools.includes(key)}
                          onChange={(e) => setDraft({ ...draft, tools: e.target.checked ? [...draft.tools, key] : draft.tools.filter((k) => k !== key) })} />
                        <span><span className="font-medium">{t.label}</span><br /><span className="text-xs text-steel-500">{t.desc}</span></span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button className="btn-ghost" onClick={() => setShowConfig(false)}>Cancelar</button>
                  <button className="btn-primary" disabled={saving} onClick={saveConfig}>{saving ? 'Salvando…' : 'Salvar'}</button>
                </div>
              </div>
            )}

            <div className="card p-0 overflow-hidden">
              <div className="h-[55vh] overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <p className="text-sm text-steel-500">Pergunte qualquer coisa sobre a oficina, ou escolha uma pergunta salva logo abaixo. 👇</p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === 'user' ? 'bg-brand-500 text-white' : 'bg-steel-100 dark:bg-steel-700'}`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {sending && <div className="text-sm text-steel-500">{agent.name} está consultando os dados…</div>}
                <div ref={bottom} />
              </div>
              <div className="border-t border-steel-200 dark:border-steel-700 px-3 py-2">
                <div className="flex items-center gap-3">
                  <button className="text-sm font-medium" onClick={() => setShowQuestions((v) => !v)}>
                    💡 Perguntas salvas {showQuestions ? '▾' : '▸'}
                  </button>
                  {showQuestions && (
                    <button className="text-xs text-steel-500 hover:text-brand-600" onClick={() => setEditQ((v) => !v)}>
                      {editQ ? 'Concluir' : '✏️ Editar'}
                    </button>
                  )}
                </div>
                {showQuestions && (
                  <div className="mt-2 max-h-56 overflow-y-auto space-y-3 pr-1">
                    {[...new Set(questions.map((q) => q.category))].map((cat) => (
                      <div key={cat}>
                        <div className="text-xs font-semibold text-steel-500 uppercase tracking-wide mb-1">{cat}</div>
                        <div className="flex flex-wrap gap-2">
                          {questions.filter((q) => q.category === cat).map((q) => (
                            <span key={q.id} className="inline-flex items-center rounded-full border border-steel-200 dark:border-steel-700 text-xs">
                              <button className="px-3 py-1.5 text-left hover:text-brand-600 disabled:opacity-50"
                                disabled={!agent.enabled || sending} onClick={() => pickQuestion(q.question)}>{q.question}</button>
                              {editQ && (
                                <button className="pr-2 text-steel-400 hover:text-alert-600" title="Remover" onClick={() => removeQuestion(q.id)}>✕</button>
                              )}
                            </span>
                          ))}
                          {editQ && adding !== cat && (
                            <button className="px-3 py-1.5 text-xs text-brand-600" onClick={() => { setAdding(cat); setNewQ(''); }}>+ nova</button>
                          )}
                        </div>
                        {adding === cat && (
                          <div className="flex gap-2 mt-2">
                            <input className="input !py-2" autoFocus placeholder="Nova pergunta nesta categoria" value={newQ} maxLength={2000}
                              onChange={(e) => setNewQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addQuestion(cat); }} />
                            <button className="btn-primary !py-2 text-xs" onClick={() => addQuestion(cat)}>Salvar</button>
                            <button className="btn-ghost !py-2 text-xs" onClick={() => setAdding(null)}>Cancelar</button>
                          </div>
                        )}
                      </div>
                    ))}
                    {editQ && (
                      <div className="rounded-xl border border-dashed border-steel-300 dark:border-steel-600 p-3 space-y-2">
                        <div className="text-xs font-semibold text-steel-500">Nova categoria</div>
                        <input className="input !py-2" placeholder="Nome da categoria (ex.: Fornecedores)" value={newCat} maxLength={60}
                          onChange={(e) => setNewCat(e.target.value)} />
                        <div className="flex gap-2">
                          <input className="input !py-2" placeholder="Primeira pergunta" value={adding === '__new__' ? newQ : ''} maxLength={2000}
                            onFocus={() => setAdding('__new__')} onChange={(e) => setNewQ(e.target.value)} />
                          <button className="btn-primary !py-2 text-xs" onClick={() => addQuestion(newCat)}>Criar</button>
                        </div>
                      </div>
                    )}
                    {questions.length === 0 && !editQ && <div className="text-xs text-steel-500">Nenhuma pergunta salva. Toque em Editar para criar.</div>}
                  </div>
                )}
              </div>
              <div className="border-t border-steel-200 dark:border-steel-700 p-3 flex gap-2">
                <input ref={inputRef} className="input" placeholder={agent.enabled ? 'Pergunte ao seu sócio…' : 'Agente desligado'}
                  value={text} disabled={!agent.enabled || sending} maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <button className="btn-primary" disabled={!agent.enabled || sending || !text.trim()} onClick={() => send()}>Enviar</button>
              </div>
            </div>
            {messages.length > 0 && (
              <button className="text-xs text-steel-500 hover:text-alert-600" onClick={clearHistory}>Limpar conversa</button>
            )}
          </>
        )}
      </div>
    </WorkshopLayout>
  );
}
