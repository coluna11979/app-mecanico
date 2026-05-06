import { FormEvent, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Message } from '@/types/database';

interface Props {
  jobId: string;
  otherName: string;
  dark?: boolean;
  /** Messages from the parent's useMessages() hook — subscription lives at
   *  parent level so it survives tab switches / panel toggles. */
  messages: Message[];
}

export function ChatBox({ jobId, otherName, dark = false, messages }: Props) {
  const { user } = useAuth();
  const [text, setText]       = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !user) return;
    setSending(true);
    await supabase.from('messages').insert({
      job_id: jobId,
      sender_id: user.id,
      content: text.trim(),
    });
    setText('');
    setSending(false);
  }

  const border   = dark ? 'border-steel-700' : 'border-steel-200';
  const emptyTxt = dark ? 'text-steel-500'   : 'text-steel-400';
  const inputBg  = dark
    ? '!bg-steel-700 !border-steel-600 !text-steel-100 placeholder:!text-steel-400'
    : '';

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className={`text-center text-sm py-6 ${emptyTxt}`}>
            Nenhuma mensagem ainda.<br />Diga olá para {otherName}!
          </div>
        )}
        {messages.map(m => {
          const isMe = m.sender_id === user?.id;
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                isMe
                  ? 'bg-brand-500 text-white rounded-br-none'
                  : dark
                    ? 'bg-steel-700 text-steel-100 rounded-bl-none'
                    : 'bg-steel-100 text-steel-800 rounded-bl-none'
              }`}>
                <div>{m.content}</div>
                <div className={`text-[10px] mt-0.5 ${
                  isMe ? 'text-white/60' : dark ? 'text-steel-400' : 'text-steel-400'
                }`}>
                  {new Date(m.created_at).toLocaleTimeString('pt-BR', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={send} className={`flex gap-2 p-3 border-t ${border}`}>
        <input
          className={`input flex-1 !py-2 text-sm ${inputBg}`}
          placeholder="Mensagem…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(e as never);
            }
          }}
          disabled={sending}
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn-primary !py-2 !px-4 text-lg"
          disabled={sending || !text.trim()}
        >
          {sending ? '…' : '↑'}
        </button>
      </form>
    </div>
  );
}
