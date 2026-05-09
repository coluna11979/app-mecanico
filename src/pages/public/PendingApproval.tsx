import { Link, useNavigate } from 'react-router-dom';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { ApprovalMessageItem } from '@/components/ApprovalMessageItem';
import { attachAutoUnlock, playChatAlert } from '@/lib/alertSound';
import {
  fileIcon, fmtFileSize, uploadApprovalAttachment,
} from '@/lib/approvalAttachments';
import type { ApprovalMessage } from '@/types/database';

const STATUS_META = {
  pending: {
    emoji: '⏳',
    title: 'Aguardando análise',
    description: 'Recebemos seu cadastro. Nossa equipe vai analisar e em breve te avisamos. Volte aqui regularmente — quando tivermos novidade, aparecerá nesta tela.',
    color: 'text-pending-700 bg-pending-500/10 border-pending-300',
  },
  under_review: {
    emoji: '🔍',
    title: 'Cadastro em análise',
    description: 'Estamos validando seu cadastro. Veja abaixo as solicitações da nossa equipe e responda enviando documentos ou texto.',
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

const ACCEPTED_MIMES = 'image/jpeg,image/png,image/webp,image/heic,application/pdf';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export default function PendingApproval() {
  const { user, profile, signOut } = useAuth();
  const nav = useNavigate();
  const [messages, setMessages] = useState<ApprovalMessage[]>([]);
  const [reply, setReply]       = useState('');
  const [file, setFile]         = useState<File | null>(null);
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [toast, setToast]       = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  /* Destrava áudio na primeira interação */
  useEffect(() => { attachAutoUnlock(); }, []);

  const status = (profile?.status ?? 'pending') as keyof typeof STATUS_META;
  const meta   = STATUS_META[status];

  /* Redireciona quando aprovar */
  useEffect(() => {
    if (profile?.status === 'approved') {
      if (profile.role === 'mechanic') nav('/mecanico/dashboard', { replace: true });
      else if (profile.role === 'workshop') nav('/oficina/dashboard', { replace: true });
    }
  }, [profile?.status]);

  /* Carrega mensagens + realtime */
  useEffect(() => {
    if (!user) return;
    loadMessages();
    const ch = supabase.channel(`pending:msgs:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'approval_messages',
        filter: `profile_id=eq.${user.id}`,
      }, (payload) => {
        const msg = payload.new as ApprovalMessage;
        // Toca som + toast só pra mensagens da equipe (não pra própria resposta do usuário)
        if (msg.sender_role === 'admin' && !seenIdsRef.current.has(msg.id)) {
          seenIdsRef.current.add(msg.id);
          playChatAlert();
          const t = msg.kind === 'request_documents'
            ? '📋 A equipe pediu novos documentos'
            : msg.kind === 'status_change'
              ? '🔄 Houve atualização no seu cadastro'
              : '💬 Nova mensagem da equipe';
          setToast(t);
          setTimeout(() => setToast(null), 6000);
        }
        loadMessages();
      })
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
    const list = (data as ApprovalMessage[]) ?? [];
    // Marca mensagens existentes como vistas (pra não tocar som retroativo no primeiro load)
    list.forEach(m => seenIdsRef.current.add(m.id));
    setMessages(list);
  }

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    if (f.size > MAX_SIZE) {
      setError(`Arquivo muito grande (máx ${fmtFileSize(MAX_SIZE)}).`);
      return;
    }
    if (!ACCEPTED_MIMES.split(',').includes(f.type)) {
      setError('Formato não aceito. Use JPG, PNG, WEBP ou PDF.');
      return;
    }
    setFile(f);
  }

  async function sendReply() {
    if (!user) return;
    if (!reply.trim() && !file) {
      setError('Digite uma mensagem ou anexe um documento.');
      return;
    }
    setSending(true);
    setError(null);

    let attachment: { path: string; name: string; size: number; mime: string } | null = null;
    if (file) {
      try {
        attachment = await uploadApprovalAttachment(file, user.id);
      } catch (err: any) {
        setError('Erro ao enviar arquivo: ' + (err?.message ?? 'tente novamente'));
        setSending(false);
        return;
      }
    }

    const { error: insertErr } = await supabase.from('approval_messages').insert({
      profile_id:  user.id,
      sender_id:   user.id,
      sender_role: 'user',
      kind:        'reply',
      content:     reply.trim() || (file ? `📎 Documento enviado: ${file.name}` : ''),
      attachment_path: attachment?.path ?? null,
      attachment_name: attachment?.name ?? null,
      attachment_size: attachment?.size ?? null,
      attachment_mime: attachment?.mime ?? null,
    });

    if (insertErr) setError(insertErr.message);
    setReply('');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    setSending(false);
  }

  /* Calcula quais request_documents foram resolvidas (responde uma req se há reply do user posterior) */
  const requestStates = computeRequestStates(messages);

  /* Tem solicitação pendente? — aparece como destaque no topo */
  const hasPendingRequest = Object.values(requestStates).some(s => !s);
  const canReply = status === 'under_review';

  return (
    <div className="min-h-screen bg-steel-50 px-4 py-6 sm:py-10">
      {/* Toast de notificação de mensagem nova */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-brand-500 text-white text-sm font-bold px-5 py-3 rounded-2xl shadow-2xl max-w-xs text-center animate-slide-down">
          {toast}
        </div>
      )}

      <div className="max-w-2xl mx-auto space-y-4">

        {/* Header */}
        <div className="card">
          <div className="flex justify-center mb-4"><Logo /></div>
          <div className={`rounded-2xl border-2 px-5 py-6 text-center ${meta.color}`}>
            <div className="text-5xl mb-2">{meta.emoji}</div>
            <h1 className="text-2xl font-bold">{meta.title}</h1>
            <p className="text-sm mt-2 opacity-90 max-w-md mx-auto leading-relaxed">{meta.description}</p>
          </div>
        </div>

        {/* Banner de ação requerida */}
        {hasPendingRequest && (
          <div className="card border-2 border-brand-500 bg-brand-50">
            <div className="flex items-start gap-3">
              <div className="text-3xl shrink-0">📋</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-brand-700">Você tem documentos pendentes</h3>
                <p className="text-sm text-steel-600 mt-1">
                  Nossa equipe pediu informações ou documentos. Responda abaixo (pode anexar fotos do RG, CPF, comprovante, etc) pra continuar o processo.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Histórico de mensagens */}
        {messages.length > 0 && (
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-steel-700 uppercase tracking-wider">
                💬 Mensagens ({messages.length})
              </h2>
              {canReply && (
                <span className="text-[10px] text-pending-700 font-bold uppercase tracking-wider bg-pending-500/15 rounded-full px-2 py-0.5 border border-pending-300">
                  Resposta liberada
                </span>
              )}
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {messages.map(m => (
                <ApprovalMessageItem
                  key={m.id}
                  message={m}
                  resolved={m.kind === 'request_documents' ? requestStates[m.id] : undefined}
                  dark
                />
              ))}
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
                  placeholder="Escreva uma resposta…"
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  disabled={sending}
                />

                {/* Preview do arquivo selecionado */}
                {file && (
                  <div className="bg-brand-50 border border-brand-200 rounded-xl px-3 py-2 flex items-center gap-3">
                    <span className="text-2xl shrink-0">{fileIcon(file.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-steel-800 truncate">{file.name}</div>
                      <div className="text-xs text-steel-500">{fmtFileSize(file.size)}</div>
                    </div>
                    <button
                      onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                      className="text-steel-400 hover:text-alert-600 text-lg shrink-0"
                      aria-label="Remover anexo"
                    >✕</button>
                  </div>
                )}

                {error && (
                  <div className="text-sm text-alert-600 bg-alert-50 rounded-lg px-3 py-2">⚠️ {error}</div>
                )}

                <div className="flex gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPTED_MIMES}
                    onChange={pickFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="btn-ghost text-sm border border-steel-300"
                    disabled={sending}
                  >
                    📎 Anexar
                  </button>
                  <button
                    onClick={sendReply}
                    disabled={sending || (!reply.trim() && !file)}
                    className="btn-primary flex-1 disabled:opacity-50 text-sm"
                  >
                    {sending ? 'Enviando…' : 'Enviar resposta'}
                  </button>
                </div>

                <p className="text-[11px] text-steel-400 text-center">
                  Aceitamos JPG, PNG, WEBP, HEIC ou PDF até 10 MB. Pode tirar foto do documento direto pelo celular.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Sem mensagens ainda */}
        {messages.length === 0 && status === 'pending' && (
          <div className="card text-center py-8">
            <p className="text-sm text-steel-500">
              Nenhuma mensagem da nossa equipe ainda. Volte aqui regularmente — quando houver novidade, você verá nesta tela.
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

/**
 * Pra cada request_documents, calcula se ela já foi "respondida".
 * Regra: tem resposta = existe ao menos uma mensagem 'reply' do USUÁRIO
 * com timestamp posterior à solicitação.
 */
function computeRequestStates(msgs: ApprovalMessage[]): Record<string, boolean> {
  const states: Record<string, boolean> = {};
  for (const m of msgs) {
    if (m.kind !== 'request_documents') continue;
    const reqTime = new Date(m.created_at).getTime();
    const hasReply = msgs.some(r =>
      r.kind === 'reply' &&
      r.sender_role === 'user' &&
      new Date(r.created_at).getTime() > reqTime
    );
    states[m.id] = hasReply;
  }
  return states;
}
