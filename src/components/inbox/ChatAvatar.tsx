import { useState } from 'react';
import { chatTitle, useMediaUrl, type WaChat } from '@/lib/inbox';

/** Foto do WhatsApp do contato (ou as iniciais) */
export default function ChatAvatar({ chat, size = 44 }: { chat: WaChat; size?: number }) {
  const [broken, setBroken] = useState(false);
  // Foto salva no nosso storage (caminho) → link temporário
  const stored = chat.avatar_url && !/^https?:/.test(chat.avatar_url) ? chat.avatar_url : null;
  const signedUrl = useMediaUrl(stored);
  const src = stored ? signedUrl : chat.avatar_url;
  const name = chatTitle(chat);
  const initials = /\p{L}/u.test(name)
    ? name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : '#';
  const style = { width: size, height: size };
  if (src && !broken) {
    return <img src={src} alt="" style={style} onError={() => setBroken(true)} className="rounded-full object-cover shrink-0 bg-steel-100" />;
  }
  return (
    <div style={style} className="rounded-full shrink-0 grid place-items-center bg-emerald-100 text-emerald-700 font-bold text-sm">
      {initials}
    </div>
  );
}
