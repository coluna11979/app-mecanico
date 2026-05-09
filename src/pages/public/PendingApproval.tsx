import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import type { ApprovalMessage } from '@/types/database';

const STATUS_META = {
  pending: {
    emoji: '⏳',
    title: 'Aguardando aprovação',
    description: 'Recebemos seu cadastro. Nossa equipe está validando seus dados — você receberá um aviso assim que for aprovado.',
    color: 'text-pending-700 bg-pending-500/10 border-pending-300',
  },
  under_review: {
    emoji: '🔍',
    title: 'Cadastro em análise',
    description: 'Nossa equipe está analisando seu cadastro. Acompanhe abaixo as mensagens da nossa equipe e responda o que for solicitado.',
    color: 'text-pending-700 bg-pending-500/10 border-pending-300',
  },
  rejected: {
    emoji: '✋',
    title: 'Cadastro não aprovado',
    description: 'Seu cadastro foi recusado. Veja abaixo o motivo enviado pela nossa equipe.',
    color: 'text-alert-700 bg-alert-500/10 border-alert-300',
  },
  approved: {
    emoji: '✅',
    title: 'Cadastro aprovado',
    description: 'Tudo certo!',
    color: 'text-signal-700 bg-signal-500/10 border-signal-300',
  },
} as const;

export default function PendingApproval() {
  const { user, profile, signOut } = useAuth();
  const nav = useNavigate();
  const [messages, setMessages] = useState<ApprovalMessage[]>([]);
  const [reply, setReply]       = useState('');
  const [sending, setSending]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const status = (profile?.status ?? 'pending') as keyof typeof STATUS_META;
  const meta   = STATUS_META[status];

  // Redireciona quando aprovar
  useEffect(() => {
    if (profile?.status === 'approved') {
      if (profile.role === 'mechanic') nav('/mecanico/dashboard', { replace: true });
      else if (profile.role === 'workshop') nav('/oficina/dashboard', { replace: true });
    }
  }, [profile?.status]);

  // Carrega mensagens + realtime
  useEffect(() => {
    if (!user) return;
    loadMessages();
    const ch = supabase.channel(`pending:msgs:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'approval_messages',
        filter: `profile_id=eq.${user.id}`,
      }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function loadMessages() {
    if (!user) return;
    const { data } = await supabase
      .from('approval_messages')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: true });
    setMessages((data as ApprovalMessage[]) ?? []);
  }

  async function sendReply() {
    if (!user || !reply.trim()) return;
    setSending(true);
    await supabase.from('approval_messages').insert({
      profile_id: user.id,
      sender_id:  user.id,
      sender_role: 'user',
      kind: 'reply',
      content: reply.trim(),
    });
    setReply('');
    setSending(false);
  }

  // Mecânico/oficina pode responder se tá em análise (provavelmente respondendo solicitação de docs)
  const canReply = status === 'under_review';

  const msgIcon = {
    request_documents: '📋',
    reply: '💬',
    note: '📝',
    status_change: '🔄',
  } as const;

  return (
    <div className="min-h-screen bg-steel-50 px-4 py-6 sm:py-10">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="card">
          <div className="flex justify-center mb-4"><Logo /></div>
          <div className={`rounded-2xl border-2 px-5 py-6 text-center ${meta.color}`}>
            <div className="text-5xl mb-2">{meta.emoji}</div>
            <h1 className="text-2xl font-bold">{meta.title}</h1>
            <p className="text-sm mt-2 opacity-90 max-w-md mx-auto">{meta.description}</p>
          </div>
        </div>

        {/* Histórico de mensagens da equipe */}
        {messages.length > 0 && (
          <div className="card space-y-3">
            <h2 className="text-sm font-bold text-steel-700 uppercase tracking-wider">
              💬 Mensagens
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {messages.map(m => {
                const isAdmin = m.sender_role === 'admin';
                return (
                  <div
                    key={m.id}
                    className={`rounded-2xl p-4 ${
                      isAdmin
                        ? 'bg-brand-50 border border-brand-200'
                        : 'bg-steel-100 border border-steel-200 ml-8'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-[11px] text-steel-500 mb-1.5 font-semibold uppercase tracking-wider">
                      <span>{msgIcon[m.kind]}</span>
                      <span>{isAdmin ? 'Equipe Mecânico App' : 'Você'}</span>
                      <span>·</span>
                      <span className="font-normal normal-case tracking-normal">
                        {new Date(m.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-steel-800 text-sm whitespace-pre-wrap leading-relaxed">{m.content}</p>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Composer (só ativo se em análise) */}
            {canReply && (
              <div className="border-t border-steel-100 pt-3 space-y-2">
                <label className="text-xs font-semibold text-steel-500 uppercase tracking-wider">
                  Responder à equipe
                </label>
                <textarea
                  className="input text-sm resize-none"
                  rows={3}
                  placeholder="Escreva sua resposta…"
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  disabled={sending}
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  className="btn-primary w-full disabled:opacity-50 text-sm"
                >
                  {sending ? 'Enviando…' : 'Enviar resposta'}
                </button>
                <p className="text-[11px] text-steel-400 text-center">
                  Para anexar documentos, descreva no texto e envie por WhatsApp pra equipe.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Sem mensagens ainda — mostra info útil */}
        {messages.length === 0 && status === 'pending' && (
          <div className="card text-center py-8">
            <p className="text-sm text-steel-500">
              Nenhuma mensagem da nossa equipe ainda. Volte aqui regularmente — assim que houver atualização, aparecerá nesta tela.
            </p>
          </div>
        )}

        {/* Ações */}
        <div className="card flex flex-col gap-2">
          <Link to="/" className="btn-secondary">Voltar ao início</Link>
          <button
            onClick={async () => { await signOut(); nav('/login', { replace: true }); }}
            className="btn-ghost"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
