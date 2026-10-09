import { useState } from 'react';
import { chatTitle, type WaChat } from '@/lib/inbox';

/** Foto do WhatsApp do contato (ou as iniciais) */
export default function ChatAvatar({ chat, size = 44 }: { chat: WaChat; size?: number }) {
  const [broken, setBroken] = useState(false);
  const name = chatTitle(chat);
  const initials = /\p{L}/u.test(name)
    ? name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '#';
  const style = { width: size, height: size };
  if (chat.avatar_url && !broken) {
    return <img src={chat.avatar_url} alt="" style={style} onError={() => setBroken(true)} className="rounded-full object-cover shrink-0 bg-steel-100" />;
  }
  return (
    <div style={style} className="rounded-full shrink-0 grid place-items-center bg-emerald-100 text-emerald-700 font-bold text-sm">
      {initials}
    </div>
  );
}
