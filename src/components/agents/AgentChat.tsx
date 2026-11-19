import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import AgentMemory from '@/components/agents/AgentMemory';
import MicButton from '@/components/agents/MicButton';
import AgentHeader from '@/components/agents/AgentHeader';
import { AGENT_TEMPLATES, TOOL_CATALOG, type Agent, type AgentDraft, type AgentMessage, type AgentQuestion, type AgentTemplate, type AgentVersion } from '@/lib/agents';

const COLS = 'id, workshop_id, template, name, system_prompt, tools, enabled, questions_seeded, draft, version';

/** Compara configurações ignorando a ordem das consultas */
const norm = (d: AgentDraft) => JSON.stringify({ n: d.name.trim(), p: d.system_prompt.trim(), t: [...d.tools].sort() });
/** Negrito (**texto**), títulos (### ) e listas (- / 1.) das respostas da IA, sem HTML cru */
function inline(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}
function RichText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 whitespace-normal">
      {text.split('\n').map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        const h = line.match(/^#{1,4}\s+(.*)$/);
        if (h) return <div key={i} className="font-semibold text-steel-900 pt-1">{inline(h[1])}</div>;
        const li = line.match(/^\s*(?:[-•*]|(\d+)[.)])\s+(.*)$/);
        if (li) return (
          <div key={i} className="flex gap-2 pl-1">
            <span className="shrink-0 text-steel-400 tabular-nums">{li[1] ? `${li[1]}.` : '•'}</span>
            <span className="min-w-0">{inline(li[2])}</span>
          </div>
        );
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Chat de um agente interno (Sócio: só consulta · Orçamentista: abre OS e lança itens). Um card por tipo. */
export default function AgentChat({ workshopId, template }: { workshopId: string | null; template: AgentTemplate }) {
  const wid = workshopId;
  /** Agente da plataforma (admin): não pertence a nenhuma oficina */
  const platform = template === 'admin_cadastros';
  const tpl = AGENT_TEMPLATES[template];
  const toolCatalog = TOOL_CATALOG[template];
  /** Ex.: "só conversa, não mexe em nada no sistema" → "Só conversa, não mexe em nada no sistema" */
  const sectionTag = (() => { const t = tpl.section.split(' · ')[1]?.trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : undefined; })();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  /** Conteúdo do editor: começa no rascunho salvo (ou na versão publicada, se não houver rascunho) */
  const [draft, setDraft] = useState<AgentDraft>({ name: '', system_prompt: '', tools: [] });
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [note, setNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  /** Conversa real (salva) ou Playground (testa o rascunho, nada é salvo) */
  const [mode, setMode] = useState<'chat' | 'playground'>('chat');
  const [pgMessages, setPgMessages] = useState<AgentMessage[]>([]);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Campo cresce com o texto (Enter pula linha)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 192)}px`;
  }, [text]);
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
  const published: AgentDraft | null = agent ? { name: agent.name, system_prompt: agent.system_prompt, tools: agent.tools } : null;
  const baseline = agent?.draft ?? published;
  /** Há edição no editor que ainda não foi salva como rascunho? */
  const dirty = !!baseline && norm(draft) !== norm(baseline);
  /** O editor é diferente da versão publicada? (só então há o que publicar) */
  const differs = !!published && norm(draft) !== norm(published);

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
    if (!wid && !platform) return;
    setLoading(true);
    const base = supabase.from('ai_agents').select(COLS).eq('template', template);
    const { data } = await (platform ? base.is('workshop_id', null) : base.eq('workshop_id', wid!)).maybeSingle();
    const a = data as Agent | null;
    setAgent(a);
    if (a) {
      setDraft(a.draft ?? { name: a.name, system_prompt: a.system_prompt, tools: a.tools });
      loadPublishedAt(a.id, a.version);
      const { data: msgs } = await supabase.from('ai_agent_messages').select('id, role, content, created_at')
        .eq('agent_id', a.id).order('created_at', { ascending: false }).limit(50);
      setMessages(((msgs ?? []) as AgentMessage[]).reverse());
      await loadQuestions(a);
    }
    setLoading(false);
  }, [wid, platform]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  async function createAgent() {
    if (!wid && !platform) return;
    const { data, error } = await supabase.from('ai_agents')
      .insert({ workshop_id: platform ? null : wid, template, name: tpl.name, system_prompt: tpl.prompt, tools: tpl.tools })
      .select(COLS).single();
    if (error) return toast.error(error.message);
    setAgent(data as Agent);
    setDraft({ name: tpl.name, system_prompt: tpl.prompt, tools: tpl.tools });
    await loadQuestions(data as Agent);
  }

  /** Grava o editor como rascunho (sem mexer no que está publicado). Igual ao publicado → sem rascunho. */
  async function saveDraft(silent = false): Promise<boolean> {
    if (!agent || !published) return false;
    const clean: AgentDraft = { name: draft.name.trim(), system_prompt: draft.system_prompt.trim(), tools: draft.tools };
    if (!clean.name || !clean.system_prompt) { toast.error('Nome e instruções são obrigatórios'); return false; }
    const same = norm(clean) === norm(published);
    const value = same ? null : clean;
    if (norm(clean) === norm(baseline!)) return true;   // nada mudou desde o último salvamento
    setSaving(true);
    const { error } = await supabase.from('ai_agents').update({ draft: value }).eq('id', agent.id);
    setSaving(false);
    if (error) { toast.error(error.message); return false; }
    setAgent((a) => (a ? { ...a, draft: value } : a));
    setDraft(clean);
    if (!silent) toast.success(same ? 'Igual à versão publicada, sem rascunho' : 'Rascunho salvo ✓ (o agente continua usando a versão publicada)');
    return true;
  }

  /** Publica: o rascunho vira a versão ativa do agente e entra no histórico */
  async function publish() {
    if (!agent || !differs) return toast.error('Não há alterações para publicar');
    setPublishing(true);
    if (!(await saveDraft(true))) { setPublishing(false); return; }
    const { data, error } = await supabase.rpc('ai_agent_publish', { p_agent: agent.id, p_note: note.trim() || null });
    if (error) { setPublishing(false); return toast.error(error.message); }
    const { data: fresh } = await supabase.from('ai_agents').select(COLS).eq('id', agent.id).single();
    setPublishing(false);
    if (fresh) { setAgent(fresh as Agent); setDraft({ name: fresh.name, system_prompt: fresh.system_prompt, tools: fresh.tools }); }
    setNote('');
    toast.success(`Versão ${data} publicada ✓`);
    if (showHistory) loadVersions();
    loadPublishedAt(agent.id, Number(data));
  }

  /** Joga fora as edições e volta ao que está publicado */
  async function discardDraft() {
    if (!agent || !published) return;
    if ((dirty || agent.draft) && !window.confirm('Descartar as alterações não publicadas?')) return;
    if (agent.draft) {
      const { error } = await supabase.from('ai_agents').update({ draft: null }).eq('id', agent.id);
      if (error) return toast.error(error.message);
      setAgent({ ...agent, draft: null });
    }
    setDraft(published);
  }

  async function loadPublishedAt(agentId: string, version: number) {
    const { data } = await supabase.from('ai_agent_versions').select('created_at').eq('agent_id', agentId).eq('version', version).maybeSingle();
    setPublishedAt((data as { created_at: string } | null)?.created_at ?? null);
  }

  /** Abre o editor já no histórico de versões */
  function openVersions() {
    setShowConfig(true);
    if (!showHistory) { setShowHistory(true); loadVersions(); }
  }

  async function loadVersions() {
    if (!agent) return;
    const { data } = await supabase.from('ai_agent_versions')
      .select('id, version, name, system_prompt, tools, note, created_at').eq('agent_id', agent.id).order('version', { ascending: false });
    setVersions((data ?? []) as AgentVersion[]);
  }

  function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next) loadVersions();
  }

  /** Traz uma versão antiga para o editor; vira rascunho quando salvar e só vale depois de publicar */
  function restoreVersion(v: AgentVersion) {
    setDraft({ name: v.name, system_prompt: v.system_prompt, tools: v.tools });
    toast.success(`Versão ${v.version} carregada no editor. Revise e publique para valer.`);
  }

  async function acceptNewTools() {
    if (!agent) return;
    const tools = [...agent.tools, ...newTools];
    const nextDraft = agent.draft ? { ...agent.draft, tools: [...new Set([...agent.draft.tools, ...newTools])] } : null;
    const { error } = await supabase.from('ai_agents').update({ tools, ...(nextDraft ? { draft: nextDraft } : {}) }).eq('id', agent.id);
    if (error) return toast.error(error.message);
    setAgent({ ...agent, tools, draft: nextDraft });
    setDraft((d) => ({ ...d, tools: [...new Set([...d.tools, ...newTools])] }));
    toast.success('Liberado ✓');
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
    if (mode === 'playground') { setPgMessages([]); return; }
    if (!agent || !window.confirm('Apagar toda a conversa com o agente?')) return;
    const { error } = await supabase.from('ai_agent_messages').delete().eq('agent_id', agent.id);
    if (error) return toast.error(error.message);
    setMessages([]);
  }

  async function send(question?: string) {
    const q = (question ?? text).trim();
    if (!agent || !q || sending) return;
    const pg = mode === 'playground';
    // Playground testa o rascunho salvo: grava o que está no editor antes de perguntar
    if (pg && !(await saveDraft(true))) return;
    const setList = pg ? setPgMessages : setMessages;
    const history = pg ? pgMessages.map(({ role, content }) => ({ role, content })) : undefined;
    setText('');
    setSending(true);
    setList((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: q, created_at: new Date().toISOString() }]);
    const { data, error } = await supabase.functions.invoke('agent-chat', {
      body: { agent_id: agent.id, message: q, ...(pg ? { playground: true, history } : {}) },
    });
    setSending(false);
    if (error || !data?.ok) {
      // O corpo do erro da edge function vem em error.context (Response)
      let msg = data?.error as string | undefined;
      try { msg ??= (await (error as { context?: Response })?.context?.json())?.error; } catch { /* sem corpo */ }
      setList((m) => m.slice(0, -1));
      setText(q);
      return toast.error(msg ?? 'Não consegui falar com o agente agora');
    }
    setList((m) => [...m, { id: `a-${Date.now()}`, role: 'assistant', content: data.answer as string, created_at: new Date().toISOString() }]);
  }

  const shown = mode === 'playground' ? pgMessages : messages;

  return (
    <div className="space-y-4">
        {loading ? (
          <div className="card text-sm text-steel-500">Carregando…</div>
        ) : !agent ? (
          <div className="card p-4 flex items-start gap-3">
            <div className="h-12 w-12 rounded-2xl bg-brand-50 grid place-items-center text-2xl shrink-0" aria-hidden>{tpl.icon}</div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-[15px] text-steel-900">{tpl.name}</h3>
              <p className="text-xs text-steel-500 mt-1 leading-snug">{tpl.desc}</p>
              {sectionTag && <span className="inline-block mt-2 rounded-full bg-steel-100 px-2 py-0.5 text-[11px] font-medium text-steel-600">{sectionTag}</span>}
              <button className="btn-primary mt-3 w-full sm:w-auto min-h-[44px]" onClick={createAgent}>Criar {tpl.name}</button>
            </div>
          </div>
        ) : (
          <>
            <AgentHeader icon={tpl.icon} name={agent.name} desc={tpl.desc} tag={sectionTag}
              badge={(agent.draft || dirty) ? <span className="text-[11px] rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">Rascunho não publicado</span> : null}
              meta={<span>
                v{agent.version}{publishedAt ? ` · publicada em ${fmtDate(publishedAt)}` : ''}
                {Object.keys(toolCatalog).length > 0 ? ` · ${agent.tools.length} ${tpl.toolsWord}` : ''}
              </span>}
              enabled={agent.enabled} onToggle={toggleEnabled}
              actions={[
                { key: 'versoes', icon: '🕘', label: 'Versões', onClick: openVersions, active: showHistory && showConfig },
                { key: 'config', icon: '⚙️', label: 'Configurar', onClick: () => setShowConfig((v) => !v), active: showConfig },
              ]} />

            {newTools.length > 0 && (
              <div className="card border-brand-300 bg-brand-50 dark:bg-steel-800 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px] text-sm">
                  <div className="font-semibold">✨ Novas {tpl.toolsWord} disponíveis para o {agent.name}</div>
                  <div className="text-steel-500 mt-0.5">{newTools.map((k) => toolCatalog[k]?.label ?? k).join(', ')}</div>
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
                {Object.keys(toolCatalog).length > 0 && <div>
                  <label className="label">O que ele pode consultar</label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {Object.entries(toolCatalog).map(([key, t]) => (
                      <label key={key} className="flex items-start gap-2 text-sm cursor-pointer rounded-xl border border-steel-200 dark:border-steel-700 p-3">
                        <input type="checkbox" className="mt-0.5" checked={draft.tools.includes(key)}
                          onChange={(e) => setDraft({ ...draft, tools: e.target.checked ? [...draft.tools, key] : draft.tools.filter((k) => k !== key) })} />
                        <span><span className="font-medium">{t.label}</span><br /><span className="text-xs text-steel-500">{t.desc}</span></span>
                      </label>
                    ))}
                  </div>
                </div>}
                <AgentMemory agentId={agent.id} workshopId={agent.workshop_id} />
                <div className="rounded-xl bg-steel-50 dark:bg-steel-900 p-3 text-xs text-steel-500">
                  O agente só usa o que está <strong>publicado</strong> (v{agent.version}). Edite à vontade{tpl.playground ? ', teste no 🧪 Playground' : ''}
                  e publique quando estiver bom. Cada publicação fica guardada no histórico.
                </div>
                {differs && (
                  <input className="input" maxLength={200} placeholder="O que mudou nesta versão? (opcional)"
                    value={note} onChange={(e) => setNote(e.target.value)} />
                )}
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <button className="btn-ghost text-sm" onClick={toggleHistory}>🕘 Histórico de versões {showHistory ? '▾' : '▸'}</button>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button className="btn-ghost text-sm" onClick={() => setShowConfig(false)}>Fechar</button>
                    <button className="btn-ghost text-sm" disabled={!agent.draft && !dirty} onClick={discardDraft}>Descartar alterações</button>
                    <button className="btn-secondary text-sm" disabled={saving || !dirty} onClick={() => saveDraft()}>{saving ? 'Salvando…' : 'Salvar rascunho'}</button>
                    <button className="btn-primary text-sm" disabled={publishing || !differs} onClick={publish}>{publishing ? 'Publicando…' : 'Publicar versão'}</button>
                  </div>
                </div>

                {showHistory && (
                  <div className="space-y-2 border-t border-steel-200 dark:border-steel-700 pt-3">
                    {versions.length === 0 && <div className="text-xs text-steel-500">Carregando…</div>}
                    {versions.map((v) => (
                      <div key={v.id} className="flex items-center gap-3 rounded-xl border border-steel-200 dark:border-steel-700 px-3 py-2 text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">
                            v{v.version} {v.version === agent.version && <span className="text-xs text-green-600">· publicada agora</span>}
                          </div>
                          <div className="text-xs text-steel-500 truncate">{fmtDate(v.created_at)}{v.note ? ` · ${v.note}` : ''}</div>
                        </div>
                        {v.version !== agent.version && (
                          <button className="btn-ghost text-xs !py-1.5" onClick={() => restoreVersion(v)}>Restaurar no editor</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="card p-0 overflow-hidden">
              {tpl.playground && (
              <div className="flex items-center gap-1 border-b border-steel-200 dark:border-steel-700 px-3 pt-2">
                {([['chat', '💬 Conversa'], ['playground', '🧪 Teste']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setMode(k)}
                    className={`flex-1 sm:flex-none min-h-[44px] px-3 py-2 text-sm font-medium border-b-2 -mb-px ${mode === k ? 'border-brand-500 text-brand-600' : 'border-transparent text-steel-500'}`}>
                    {label}
                  </button>
                ))}
              </div>
              )}
              {mode === 'playground' && (
                <div className="bg-amber-50 text-amber-900 text-xs px-4 py-2">
                  🧪 {agent.draft || dirty
                    ? 'Testando o seu RASCUNHO. Nada aqui é salvo no histórico da conversa nem muda o agente publicado.'
                    : 'Sem rascunho: testando a versão publicada. Edite em ⚙️ Configurar para testar mudanças antes de publicar.'}
                </div>
              )}
              <div className="h-[60vh] sm:h-[55vh] overflow-y-auto p-4 space-y-3 bg-steel-50/40">
                {shown.length === 0 && (
                  <div className="h-full grid place-items-center text-center px-6">
                    <div>
                      <div className="text-4xl mb-2" aria-hidden>{tpl.icon}</div>
                      <p className="text-sm text-steel-500 max-w-xs mx-auto">{tpl.emptyHint}</p>
                    </div>
                  </div>
                )}
                {shown.map((m) => (
                  <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                      m.role === 'user' ? 'bg-brand-500 text-white rounded-br-md' : 'bg-white ring-1 ring-steel-200 text-steel-800 rounded-bl-md'}`}>
                      {m.role === 'assistant' ? <RichText text={m.content} /> : m.content}
                    </div>
                  </div>
                ))}
                {sending && <div className="inline-flex items-center gap-2 rounded-2xl bg-white ring-1 ring-steel-200 px-4 py-2.5 text-sm text-steel-500"><span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />{agent.name} {tpl.working}</div>}
                <div ref={bottom} />
              </div>
              <div className="border-t border-steel-200 dark:border-steel-700 px-3 py-2">
                <div className="flex items-center gap-3">
                  <button className="text-sm font-medium min-h-[40px]" onClick={() => setShowQuestions((v) => !v)}>
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
              <div className="border-t border-steel-200 dark:border-steel-700 p-3 flex items-end gap-2">
                {/* Enter pula linha; Ctrl+Enter (ou o botão) envia. Cresce até ~8 linhas e depois rola. */}
                <textarea ref={inputRef} rows={1} className="input min-h-[44px] max-h-48 resize-none leading-snug overflow-y-auto"
                  placeholder={agent.enabled ? (mode === 'playground' ? 'Teste o rascunho…' : tpl.placeholder) : 'Agente desligado'}
                  value={text} disabled={!agent.enabled || sending} maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
                <MicButton disabled={!agent.enabled || sending} onText={(t) => { setText((cur) => (cur.trim() ? `${cur.trim()} ${t}` : t)); inputRef.current?.focus(); }} />
                <button className="btn-primary min-h-[44px] shrink-0" disabled={!agent.enabled || sending || !text.trim()} onClick={() => send()}>Enviar</button>
              </div>
            </div>
            {shown.length > 0 && (
              <button className="text-xs text-steel-500 hover:text-alert-600" onClick={clearHistory}>
                {mode === 'playground' ? 'Limpar teste' : 'Limpar conversa'}
              </button>
            )}
          </>
        )}
    </div>
  );
}
