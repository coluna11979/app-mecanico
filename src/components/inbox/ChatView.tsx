import { FormEvent, KeyboardEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { fmtPhone } from '@/components/os/osHelpers';
import {
  chatTitle, fmtDay, fmtWait, inboxCall, isAwaiting, minutesSince, useMediaUrl, URGENT_MIN,
  type WaChat, type WaMessage,
} from '@/lib/inbox';
import { useAuth } from '@/contexts/AuthContext';
import ChatAvatar from './ChatAvatar';
import VoiceRecorder from './VoiceRecorder';
import EmojiPicker from './EmojiPicker';
import MiniAgenda from './MiniAgenda';
import MaterialsLibrary, { type Material } from './MaterialsLibrary';
import { QuickRepliesModal, QuickReplySuggest, fillReply, matchReplies, useQuickReplies, type QuickReply } from './QuickReplies';

const PAGE = 60;

/** Conversa aberta: mensagens em tempo real + caixa de resposta */
export default function ChatView({ chat, workshopId, connected, onBack, onToggleClient, onResolve, onConnect }: {
  chat: WaChat; workshopId: string; connected: boolean;
  onBack: () => void; onToggleClient: () => void;
  onResolve: (resolved: boolean) => void; onConnect: () => void;
}) {
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  // Carrega as últimas mensagens e escuta as novas
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessages([]);
    stickToBottom.current = true;
    supabase.from('whatsapp_messages').select('*').eq('chat_id', chat.id)
      .order('sent_at', { ascending: false }).limit(PAGE)
      .then(({ data }) => {
        if (!alive) return;
        setMessages(((data ?? []) as WaMessage[]).reverse());
        setHasMore((data?.length ?? 0) === PAGE);
        setLoading(false);
      });

    const ch = supabase.channel(`wa-msgs-${chat.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_messages', filter: `chat_id=eq.${chat.id}` }, p => {
        const row = p.new as WaMessage;
        if (!row?.id) return;
        setMessages(prev => {
          const i = prev.findIndex(m => m.id === row.id);
          if (i >= 0) { const next = [...prev]; next[i] = row; return next; }
          return [...prev, row].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
        });
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [chat.id]);

  // Abriu a conversa → zera não lidas
  useEffect(() => {
    if (chat.unread_count > 0) supabase.from('whatsapp_chats').update({ unread_count: 0 }).eq('id', chat.id).then();
  }, [chat.id, chat.unread_count]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    const el = scroller.current;
    const prevHeight = el?.scrollHeight ?? 0;
    stickToBottom.current = false;
    const { data } = await supabase.from('whatsapp_messages').select('*').eq('chat_id', chat.id)
      .lt('sent_at', first.sent_at).order('sent_at', { ascending: false }).limit(PAGE);
    const older = ((data ?? []) as WaMessage[]).reverse();
    setHasMore(older.length === PAGE);
    setMessages(prev => [...older, ...prev]);
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight; });
  }

  const waitMin = isAwaiting(chat) ? minutesSince(chat.awaiting_since) : 0;

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-steel-100 bg-white shrink-0">
        <button type="button" onClick={onBack} className="lg:hidden h-8 w-8 rounded-lg bg-steel-100 grid place-items-center text-steel-600 shrink-0" aria-label="Voltar">←</button>
        <ChatAvatar chat={chat} size={40} />
        <button type="button" onClick={onToggleClient} className="flex-1 min-w-0 text-left">
          <p className="font-bold text-steel-900 truncate">{chatTitle(chat)}</p>
          <p className="text-xs text-steel-500 truncate">
            {fmtPhone(chat.phone)}
            {chat.customer ? ' · cliente cadastrado' : ' · não cadastrado'}
          </p>
        </button>
        {waitMin > 0 && (
          <span className={`hidden sm:inline-flex text-[11px] font-bold px-2 py-1 rounded-lg shrink-0 ${waitMin >= URGENT_MIN ? 'bg-alert-500/10 text-alert-600' : 'bg-pending-500/10 text-pending-700'}`}>
            ⏱ Aguardando {fmtWait(waitMin)}
          </span>
        )}
        {chat.status === 'open' ? (
          <button type="button" onClick={() => onResolve(true)} className="btn-secondary !py-1.5 !px-3 text-xs shrink-0">✓ Concluir</button>
        ) : (
          <button type="button" onClick={() => onResolve(false)} className="btn-ghost !py-1.5 !px-3 text-xs shrink-0">↺ Reabrir</button>
        )}
        <button type="button" onClick={onToggleClient} className="xl:hidden btn-ghost !py-1.5 !px-2.5 text-xs shrink-0" title="Dados do cliente">👤</button>
      </div>

      {/* Mensagens */}
      <div
        ref={scroller}
        onScroll={e => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 bg-[#efeae2]"
      >
        {hasMore && (
          <div className="text-center mb-3">
            <button type="button" onClick={loadOlder} className="text-xs font-semibold text-steel-600 bg-white/80 rounded-full px-3 py-1 shadow-sm hover:bg-white">
              Carregar mensagens anteriores
            </button>
          </div>
        )}
        {loading ? (
          <p className="text-center text-sm text-steel-500 py-10">Carregando…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-steel-500 py-10">Nenhuma mensagem ainda. Mande a primeira!</p>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || new Date(prev.sent_at).toDateString() !== new Date(m.sent_at).toDateString();
            const sameSide = prev && !newDay && prev.from_me === m.from_me;
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="flex justify-center my-3">
                    <span className="text-[11px] font-semibold text-steel-600 bg-white/90 rounded-lg px-2.5 py-1 shadow-sm">{fmtDay(m.sent_at)}</span>
                  </div>
                )}
                <Bubble m={m} tight={!!sameSide} />
              </div>
            );
          })
        )}
      </div>

      {connected ? (
        <Composer chat={chat} workshopId={workshopId} onSent={() => { stickToBottom.current = true; }} />
      ) : (
        <div className="p-3 border-t border-steel-100 bg-alert-500/5 flex items-center gap-3 shrink-0">
          <p className="text-sm text-alert-600 font-semibold flex-1">WhatsApp desconectado — não dá para enviar nem receber mensagens.</p>
          <button type="button" className="btn-primary text-sm shrink-0" onClick={onConnect}>Conectar</button>
        </div>
      )}
    </div>
  );
}

const TICKS: Record<WaMessage['status'], { icon: string; cls: string; title: string }> = {
  pending:   { icon: '🕓', cls: 'text-steel-400', title: 'Enviando' },
  sent:      { icon: '✓',  cls: 'text-steel-400', title: 'Enviada' },
  delivered: { icon: '✓✓', cls: 'text-steel-400', title: 'Entregue' },
  read:      { icon: '✓✓', cls: 'text-sky-500',   title: 'Lida' },
  failed:    { icon: '⚠',  cls: 'text-alert-600', title: 'Falhou' },
};

function Bubble({ m, tight }: { m: WaMessage; tight: boolean }) {
  const time = new Date(m.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const tick = TICKS[m.status];
  return (
    <div className={`flex ${m.from_me ? 'justify-end' : 'justify-start'} ${tight ? 'mt-0.5' : 'mt-2'}`}>
      <div className={`max-w-[85%] sm:max-w-[70%] rounded-xl px-2.5 py-1.5 shadow-sm ${m.from_me ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
        {m.from_me && m.sent_by_name && !tight && (
          <p className="text-[11px] font-bold text-emerald-700 mb-0.5">{m.sent_by_name}</p>
        )}
        {m.is_deleted ? (
          <p className="text-sm italic text-steel-500">🚫 Mensagem apagada</p>
        ) : (
          <>
            {m.media_path && <Media m={m} />}
            {!m.media_path && m.message_type !== 'text' && !m.content && (
              <p className="text-sm italic text-steel-500">{MEDIA_LABEL[m.message_type] ?? 'Mensagem'} (não foi possível baixar)</p>
            )}
            {m.content && <p className="text-sm text-steel-900 whitespace-pre-wrap break-words">{waFormat(m.content)}</p>}
          </>
        )}
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[10px] text-steel-500">{time}</span>
          {m.from_me && <span className={`text-[10px] font-bold ${tick.cls}`} title={tick.title}>{tick.icon}</span>}
        </div>
      </div>
    </div>
  );
}

/** Formatação do WhatsApp: *negrito*, _itálico_, ~riscado~ e links clicáveis */
function waFormat(text: string): ReactNode[] {
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|https?:\/\/[^\s]+)/g;
  return text.split(re).map((part, i) => {
    if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noreferrer" className="text-sky-700 underline break-all">{part}</a>;
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <strong key={i}>{part.slice(1, -1)}</strong>;
    if (part.length > 2 && part.startsWith('_') && part.endsWith('_')) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.length > 2 && part.startsWith('~') && part.endsWith('~')) return <s key={i}>{part.slice(1, -1)}</s>;
    return part;
  });
}

const MEDIA_LABEL: Record<string, string> = {
  image: '📷 Foto', video: '🎥 Vídeo', audio: '🎤 Áudio', document: '📄 Documento', sticker: '🏷️ Figurinha', other: 'Mensagem',
};

function Media({ m }: { m: WaMessage }) {
  const url = useMediaUrl(m.media_path);
  if (!url) return <div className="h-24 w-48 rounded-lg bg-steel-100 animate-pulse mb-1" />;
  if (m.message_type === 'image' || m.message_type === 'sticker') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block mb-1">
        <img src={url} alt={m.file_name ?? 'Foto'} className={`rounded-lg ${m.message_type === 'sticker' ? 'max-h-32' : 'max-h-72 w-full object-cover'}`} />
      </a>
    );
  }
  if (m.message_type === 'video') return <video src={url} controls className="rounded-lg max-h-72 w-full mb-1" />;
  if (m.message_type === 'audio') return <audio src={url} controls className="w-64 max-w-full mb-1" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-steel-50 border border-steel-200 px-3 py-2 mb-1 hover:bg-steel-100">
      <span className="text-xl">📄</span>
      <span className="text-sm font-semibold text-steel-800 truncate">{m.file_name || 'Documento'}</span>
    </a>
  );
}

const MAX_MB = 16;

function Composer({ chat, workshopId, onSent }: { chat: WaChat; workshopId: string; onSent: () => void }) {
  const chatId = chat.id;
  const { currentWorkshop } = useAuth();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [popover, setPopover] = useState<null | 'emoji' | 'agenda'>(null);
  const [suggestIdx, setSuggestIdx] = useState(0);
  const replies = useQuickReplies(workshopId);
  const fileInput = useRef<HTMLInputElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  // Rascunho some ao trocar de conversa
  useEffect(() => { setText(''); setFile(null); setRecording(false); }, [chatId]);

  // Caixa cresce até 5 linhas
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);

  // "/atalho" no começo da mensagem → sugestões de resposta rápida
  const slash = /^\/(\S*)$/.exec(text);
  const slashQuery = slash ? slash[1] : null;
  const suggestions = slashQuery != null ? matchReplies(replies.list, slashQuery) : [];
  useEffect(() => { setSuggestIdx(0); }, [slashQuery]);

  function applyReply(r: QuickReply) {
    const first = chatTitle(chat).trim().split(/\s+/)[0];
    const nome = /\p{L}/u.test(first) ? first : '';
    const filled = fillReply(r.body, { nome, oficina: currentWorkshop?.business_name ?? 'a oficina' });
    // Contato sem nome: "Olá, !" vira "Olá!"
    setText(filled.replace(/,\s*([!,.])/g, '$1').replace(/^\s*,\s*/, ''));
    setRepliesOpen(false);
    requestAnimationFrame(() => area.current?.focus());
  }

  async function uploadOut(f: File, prefix = 'out') {
    const safe = f.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `${workshopId}/${chatId}/${prefix}-${Date.now()}-${safe}`;
    const { error } = await supabase.storage.from('whatsapp-media')
      .upload(path, f, { contentType: f.type || 'application/octet-stream' });
    if (error) throw new Error('Não subiu o arquivo: ' + error.message);
    return { media_path: path, media_mime: f.type || 'application/octet-stream', file_name: f.name };
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    try {
      const media = file ? await uploadOut(file) : null;
      await inboxCall('whatsapp-send', { workshop_id: workshopId, chat_id: chatId, text: body, ...media });
      setText('');
      setFile(null);
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível enviar');
    } finally {
      setSending(false);
      area.current?.focus();
    }
  }

  async function sendVoice(f: File) {
    setRecording(false);
    setSending(true);
    try {
      const media = await uploadOut(f, 'voz');
      await inboxCall('whatsapp-send', { workshop_id: workshopId, chat_id: chatId, ...media, as_voice: true });
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível enviar o áudio');
    } finally {
      setSending(false);
    }
  }

  /** Materiais da biblioteca: um envio por arquivo (já estão no storage, não sobem de novo) */
  async function sendMaterials(items: Material[]) {
    let ok = 0;
    for (const m of items) {
      try {
        await inboxCall('whatsapp-send', {
          workshop_id: workshopId, chat_id: chatId,
          media_path: m.media_path, media_mime: m.media_mime, file_name: m.file_name ?? m.title,
        });
        ok++;
      } catch (err) {
        toast.error(`${m.title}: ${err instanceof Error ? err.message : 'não enviou'}`);
      }
    }
    if (ok) { toast.success(ok > 1 ? `${ok} materiais enviados ✓` : 'Material enviado ✓'); onSent(); }
  }

  /** Coloca o texto onde está o cursor (emoji) ou no fim (proposta de horário) */
  function insert(piece: string, atCursor = true) {
    const el = area.current;
    if (!atCursor || !el) {
      setText(t => (t.trim() ? `${t.trimEnd()}\n${piece}` : piece));
    } else {
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;
      setText(text.slice(0, start) + piece + text.slice(end));
      requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + piece.length, start + piece.length); });
      return;
    }
    requestAnimationFrame(() => area.current?.focus());
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIdx(i => (i + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIdx(i => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applyReply(suggestions[Math.min(suggestIdx, suggestions.length - 1)]); return; }
      if (e.key === 'Escape') { setText(''); return; }
    }
    // Enter envia, Shift+Enter quebra linha (no celular o Enter quebra linha)
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send(); }
  }

  function pick(f: File | undefined) {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) { toast.error(`Arquivo maior que ${MAX_MB} MB`); return; }
    setFile(f);
  }

  const toolBtn = 'h-10 w-9 shrink-0 rounded-xl text-lg text-steel-500 hover:bg-steel-100 grid place-items-center';

  return (
    <form onSubmit={send} className="relative border-t border-steel-100 bg-white p-2.5 shrink-0">
      {popover === 'emoji' && <EmojiPicker onPick={e => insert(e)} onClose={() => setPopover(null)} />}
      {popover === 'agenda' && (
        <MiniAgenda workshopId={workshopId} onClose={() => setPopover(null)}
          onPropose={t => { insert(t, false); setPopover(null); }} />
      )}
      {file && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-steel-50 border border-steel-200 text-sm">
          <span>{file.type.startsWith('image/') ? '📷' : file.type.startsWith('audio/') ? '🎤' : file.type.startsWith('video/') ? '🎥' : '📄'}</span>
          <span className="flex-1 truncate font-semibold text-steel-700">{file.name}</span>
          <button type="button" onClick={() => setFile(null)} className="text-steel-400 hover:text-steel-700">✕</button>
        </div>
      )}
      {recording ? (
        <VoiceRecorder onDone={sendVoice} onCancel={() => setRecording(false)} />
      ) : (
        <div className="flex items-end gap-1">
          <input ref={fileInput} type="file" className="hidden" onChange={e => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <button type="button" onClick={() => setRepliesOpen(true)} className={toolBtn} title="Respostas rápidas (ou digite /)">⚡</button>
          <button type="button" onClick={() => setMaterialsOpen(true)} className={toolBtn} title="Biblioteca de materiais">📁</button>
          <button type="button" onClick={() => fileInput.current?.click()} className={toolBtn} title="Anexar foto ou arquivo">📎</button>
          <button type="button" onMouseDown={e => e.stopPropagation()} onClick={() => setPopover(p => (p === 'agenda' ? null : 'agenda'))}
            className={`${toolBtn} ${popover === 'agenda' ? 'bg-steel-100' : ''}`} title="Horários livres da agenda">📅</button>
          {/* No celular o teclado já tem emojis */}
          <button type="button" onMouseDown={e => e.stopPropagation()} onClick={() => setPopover(p => (p === 'emoji' ? null : 'emoji'))}
            className={`${toolBtn} !hidden sm:!grid ${popover === 'emoji' ? 'bg-steel-100' : ''}`} title="Emojis">😊</button>
          <div className="relative flex-1 ml-1">
            {slashQuery != null && <QuickReplySuggest list={replies.list} query={slashQuery} active={suggestIdx} onPick={applyReply} />}
            <textarea
              ref={area}
              rows={1}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={onKey}
              onPaste={e => { const f = e.clipboardData.files?.[0]; if (f) { e.preventDefault(); pick(f); } }}
              placeholder={file ? 'Legenda (opcional)…' : 'Digite uma mensagem ou / para respostas rápidas…'}
              className="input w-full !py-2.5 text-sm resize-none leading-5"
            />
          </div>
          {!text.trim() && !file ? (
            <button type="button" onClick={() => setRecording(true)} disabled={sending}
              className="btn-primary h-10 !px-3.5 shrink-0 ml-1 disabled:opacity-40" title="Gravar áudio">{sending ? '…' : '🎤'}</button>
          ) : (
            <button type="submit" disabled={sending} className="btn-primary h-10 !px-4 shrink-0 ml-1 disabled:opacity-40" title="Enviar">
              {sending ? '…' : '➤'}
            </button>
          )}
        </div>
      )}
      {repliesOpen && (
        <QuickRepliesModal workshopId={workshopId} list={replies.list} reload={replies.reload}
          onPick={applyReply} onClose={() => setRepliesOpen(false)} />
      )}
      {materialsOpen && (
        <MaterialsLibrary workshopId={workshopId} onSend={sendMaterials} onClose={() => setMaterialsOpen(false)} />
      )}
    </form>
  );
}
