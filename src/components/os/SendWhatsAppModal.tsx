import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtPhone, waNumber } from '@/components/os/osHelpers';
import { toast } from '@/components/ui/Toast';
import { useInboxSender } from '@/lib/inbox';

export type WaMessage = { key: string; label: string; text: string };

/**
 * Enviar orçamento / resumo / comprovante pelo WhatsApp: escolhe o tipo, confere o telefone
 * (cliente sem cadastro: digita na hora) e ajusta o texto antes de enviar.
 * Oficina com o Inbox ligado e conectado: sai pelo número da oficina e fica gravado na conversa;
 * senão abre o WhatsApp do aparelho (wa.me).
 */
export default function SendWhatsAppModal({ phone, messages, onClose, onSent, customerId, customerName, title }: {
  phone: string | null | undefined; messages: WaMessage[]; onClose: () => void; onSent?: (key: string) => void;
  /** Liga a conversa do Inbox ao cliente (sem isso a ligação é pelo telefone) */
  customerId?: string | null; customerName?: string | null;
  title?: string;
}) {
  const nav = useNavigate();
  const inbox = useInboxSender();
  const [sending, setSending] = useState(false);
  const [kind, setKind] = useState(messages[0]?.key ?? '');
  const [tel, setTel] = useState(phone ? fmtPhone(phone) : '');
  const [text, setText] = useState(messages[0]?.text ?? '');

  function pick(k: string) {
    setKind(k);
    setText(messages.find(m => m.key === k)?.text ?? '');
  }

  function send() {
    const wa = waNumber(tel);
    if (!wa) return toast.error('Informe um telefone com DDD (ex.: 11 99999-9999)');
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    onSent?.(kind);
    onClose();
  }

  async function sendInbox() {
    const wa = waNumber(tel);
    if (!wa) return toast.error('Informe um telefone com DDD (ex.: 11 99999-9999)');
    if (!text.trim()) return toast.error('Escreva a mensagem');
    setSending(true);
    try {
      const chatId = await inbox.send({ phone: wa, text, customerId, name: customerName });
      toast.success('Enviado pelo WhatsApp da oficina ✓');
      onSent?.(kind);
      onClose();
      return chatId;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar');
    } finally {
      setSending(false);
    }
  }

  async function sendAndOpen() {
    const chatId = await sendInbox();
    if (chatId) nav(`/oficina/inbox?conversa=${chatId}`);
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <h2 className="text-lg font-bold">📲 {title ?? 'Enviar pelo WhatsApp'}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100" aria-label="Fechar">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          {messages.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {messages.map(m => (
                <button key={m.key} type="button" onClick={() => pick(m.key)}
                  className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${kind === m.key ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          )}
          <div>
            <label className="label">Telefone do cliente</label>
            <input className="input" inputMode="tel" placeholder="(11) 99999-9999" value={tel} autoFocus={!phone}
              onChange={e => setTel(e.target.value)} onBlur={() => setTel(fmtPhone(tel))} />
          </div>
          <div>
            <label className="label">Mensagem</label>
            <textarea className="input font-mono text-xs leading-relaxed" rows={12} value={text} onChange={e => setText(e.target.value)} />
            {inbox.ready ? (
              <p className="text-[11px] text-emerald-700 mt-1">
                Sai pelo número da oficina e fica guardado na conversa do cliente (menu WhatsApp).
              </p>
            ) : (
              <p className="text-[11px] text-steel-400 mt-1">
                O WhatsApp não aceita anexar o PDF por link. Se precisar do arquivo, use <strong>Imprimir / PDF</strong>, salve e anexe na conversa.
              </p>
            )}
          </div>
        </div>
        {inbox.ready ? (
          <div className="px-6 py-4 border-t border-steel-100 flex flex-wrap items-center justify-end gap-2">
            <button className="text-xs text-steel-500 hover:text-steel-800 underline mr-auto" onClick={send} disabled={sending}>
              Abrir no meu WhatsApp
            </button>
            <button className="btn-ghost" onClick={sendAndOpen} disabled={sending}>Enviar e abrir conversa</button>
            <button className="btn-primary !bg-signal-500 hover:!bg-signal-600" onClick={sendInbox} disabled={sending}>
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        ) : (
          <div className="px-6 py-4 border-t border-steel-100 flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn-primary !bg-signal-500 hover:!bg-signal-600" onClick={send}>Abrir WhatsApp</button>
          </div>
        )}
      </div>
    </div>
  );
}
