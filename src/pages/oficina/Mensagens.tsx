import { useEffect, useState, useRef, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, Message } from '@/types/database';

type JobWithMechanic = Job & {
  mechanic_profile?: { full_name: string } | null;
  last_message?: Message | null;
  unread?: number;
};

export default function WorkshopMensagens() {
  const { user } = useAuth();
  const nav = useNavigate();

  const [shopId, setShopId]       = useState<string | null>(null);
  const [jobs, setJobs]           = useState<JobWithMechanic[]>([]);
  const [selected, setSelected]   = useState<JobWithMechanic | null>(null);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [text, setText]           = useState('');
  const [sending, setSending]     = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const bottomRef = useRef<HTMLDivElement>(null);

  /* ── Carrega oficina + jobs ativos ── */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: w } = await supabase
        .from('workshops').select('id').eq('profile_id', user.id).maybeSingle();
      if (!w) return;
      setShopId(w.id);
      loadJobs(w.id);
    })();
  }, [user]);

  async function loadJobs(wid: string) {
    const { data: rawJobs } = await supabase
      .from('jobs')
      .select('*')
      .eq('workshop_id', wid)
      .in('status', ['open', 'assigned', 'in_progress', 'completed'])
      .order('created_at', { ascending: false })
      .limit(30);

    if (!rawJobs?.length) { setJobs([]); return; }

    // Para cada job busca último mensagem e nome do mecânico
    const enriched: JobWithMechanic[] = await Promise.all(
      rawJobs.map(async (j) => {
        const [{ data: msgs }, { data: mechProfile }] = await Promise.all([
          supabase
            .from('messages')
            .select('*')
            .eq('job_id', j.id)
            .order('created_at', { ascending: false })
            .limit(1),
          j.mechanic_id
            ? supabase
                .from('mechanics')
                .select('profile:profiles(full_name)')
                .eq('id', j.mechanic_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        return {
          ...j,
          last_message: msgs?.[0] ?? null,
          mechanic_profile: (mechProfile as any)?.profile ?? null,
        };
      })
    );

    // Ordena: jobs com mensagem primeiro, depois por data
    enriched.sort((a, b) => {
      const aTime = a.last_message?.created_at ?? a.created_at;
      const bTime = b.last_message?.created_at ?? b.created_at;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

    setJobs(enriched);
  }

  /* ── Mensagens do job selecionado ── */
  useEffect(() => {
    if (!selected) return;
    setMessages([]);

    supabase
      .from('messages')
      .select('*')
      .eq('job_id', selected.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setMessages((data as Message[]) ?? []));

    const ch = supabase.channel(`oficina:chat:${selected.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `job_id=eq.${selected.id}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new as Message]);
        // Atualiza preview na lista
        setJobs(prev => prev.map(j =>
          j.id === selected.id ? { ...j, last_message: payload.new as Message } : j
        ));
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [selected?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user || !selected) return;
    setSending(true);
    await supabase.from('messages').insert({
      job_id: selected.id,
      sender_id: user.id,
      content: text.trim(),
    });
    setText('');
    setSending(false);
  }

  function selectJob(j: JobWithMechanic) {
    setSelected(j);
    setMobileView('chat');
  }

  const statusLabel: Record<string, string> = {
    open: 'Aguardando mecânico', assigned: 'Mecânico a caminho',
    in_progress: 'Em serviço', completed: 'Concluído', cancelled: 'Cancelado',
  };
  const statusColor: Record<string, string> = {
    open: 'text-pending-600', assigned: 'text-brand-500',
    in_progress: 'text-signal-600', completed: 'text-steel-400', cancelled: 'text-steel-400',
  };

  return (
    <WorkshopLayout>
      <div className="flex flex-col" style={{ height: 'calc(100dvh - 56px - 32px)' }}>
        <h1 className="text-2xl font-bold tracking-tight mb-4 lg:mb-0 shrink-0 lg:hidden">
          💬 Mensagens
        </h1>

        <div className="flex-1 min-h-0 flex rounded-2xl overflow-hidden border border-steel-200 bg-white shadow-card">

          {/* ── Lista de conversas ── */}
          <div className={`
            w-full lg:w-80 xl:w-96 shrink-0 border-r border-steel-100 flex flex-col
            ${mobileView === 'chat' ? 'hidden lg:flex' : 'flex'}
          `}>
            <div className="px-4 py-3 border-b border-steel-100 flex items-center justify-between">
              <span className="font-bold text-steel-800">Conversas</span>
              <span className="text-xs text-steel-400">{jobs.length} jobs</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-steel-50">
              {jobs.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                  <div className="text-4xl mb-3">💬</div>
                  <p className="font-semibold text-steel-700">Nenhuma conversa ainda</p>
                  <p className="text-sm text-steel-400 mt-1">
                    Quando um mecânico enviar mensagem, aparecerá aqui.
                  </p>
                  <button
                    onClick={() => nav('/oficina/dashboard')}
                    className="btn-primary mt-4 text-sm"
                  >
                    Publicar demanda
                  </button>
                </div>
              )}

              {jobs.map(j => {
                const isSelected = selected?.id === j.id;
                const hasMsg = !!j.last_message;
                const isMe = j.last_message?.sender_id === user?.id;
                return (
                  <button
                    key={j.id}
                    onClick={() => selectJob(j)}
                    className={`w-full text-left px-4 py-3.5 transition-colors ${
                      isSelected ? 'bg-brand-50' : 'hover:bg-steel-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="h-10 w-10 rounded-full bg-brand-500/10 grid place-items-center shrink-0 text-lg">
                        🔧
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-steel-900 truncate">{j.title}</span>
                          {j.last_message && (
                            <span className="text-[10px] text-steel-400 shrink-0">
                              {new Date(j.last_message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        <div className={`text-[11px] font-medium mt-0.5 ${statusColor[j.status] ?? 'text-steel-400'}`}>
                          {statusLabel[j.status] ?? j.status}
                          {j.mechanic_profile?.full_name && (
                            <span className="text-steel-400 font-normal"> · {j.mechanic_profile.full_name}</span>
                          )}
                        </div>
                        {hasMsg ? (
                          <p className="text-xs text-steel-500 mt-0.5 truncate">
                            {isMe ? 'Você: ' : ''}{j.last_message!.content}
                          </p>
                        ) : (
                          <p className="text-xs text-steel-300 mt-0.5 italic">Sem mensagens ainda</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Área de chat ── */}
          <div className={`
            flex-1 flex flex-col min-w-0
            ${mobileView === 'list' ? 'hidden lg:flex' : 'flex'}
          `}>
            {!selected ? (
              /* Estado vazio desktop */
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <div className="text-6xl mb-4">💬</div>
                <p className="text-xl font-bold text-steel-700">Selecione uma conversa</p>
                <p className="text-sm text-steel-400 mt-2">
                  Escolha um job ao lado para ver e responder as mensagens.
                </p>
              </div>
            ) : (
              <>
                {/* Header do chat */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-steel-100 bg-white shrink-0">
                  {/* Voltar (mobile) */}
                  <button
                    onClick={() => setMobileView('list')}
                    className="lg:hidden h-8 w-8 rounded-lg bg-steel-100 grid place-items-center text-steel-600 mr-1"
                  >
                    ←
                  </button>
                  <div className="h-10 w-10 rounded-full bg-brand-500/10 grid place-items-center text-lg shrink-0">
                    🔧
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-steel-900 truncate">{selected.title}</p>
                    <p className="text-xs text-steel-500">
                      {selected.mechanic_profile?.full_name
                        ? `Mecânico: ${selected.mechanic_profile.full_name}`
                        : 'Aguardando mecânico'}
                      {' · '}
                      <span className={statusColor[selected.status]}>
                        {statusLabel[selected.status]}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => nav(`/oficina/job/${selected.id}/tracking`)}
                    className="btn-secondary !py-1.5 !px-3 text-xs shrink-0"
                  >
                    Ver mapa →
                  </button>
                </div>

                {/* Mensagens */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-steel-50/40">
                  {messages.length === 0 && (
                    <div className="text-center text-sm text-steel-400 py-10">
                      Nenhuma mensagem ainda.<br />
                      <span className="text-xs">Diga olá para o mecânico!</span>
                    </div>
                  )}
                  {messages.map(m => {
                    const isMe = m.sender_id === user?.id;
                    return (
                      <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                          isMe
                            ? 'bg-brand-500 text-white rounded-br-none'
                            : 'bg-white text-steel-800 rounded-bl-none border border-steel-100'
                        }`}>
                          <p>{m.content}</p>
                          <p className={`text-[10px] mt-1 ${isMe ? 'text-white/60 text-right' : 'text-steel-400'}`}>
                            {new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Input */}
                <form onSubmit={send} className="flex gap-2 p-3 border-t border-steel-100 bg-white shrink-0">
                  <input
                    className="input flex-1 !py-2.5 text-sm"
                    placeholder="Digite uma mensagem…"
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as never); } }}
                    disabled={sending}
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={sending || !text.trim()}
                    className="btn-primary !py-2.5 !px-4 text-xl disabled:opacity-40"
                  >
                    {sending ? '…' : '↑'}
                  </button>
                </form>
              </>
            )}
          </div>

        </div>
      </div>
    </WorkshopLayout>
  );
}
