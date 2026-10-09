import { useEffect, useRef, useState } from 'react';

/* ── Emojis da caixa de mensagem (leve, sem biblioteca) ────────────────────── */

const GROUPS: { key: string; icon: string; label: string; list: string }[] = [
  { key: 'rostos', icon: '😊', label: 'Rostos',
    list: '😀😃😄😁😆😅😂🤣😊🙂😉😍🥰😘😋😎🤩🥳🤗🤔🤨😐😑😶🙄😏😴😌😔😕🙁😟😢😭😤😠😡🤯😳😱😨😰😓🤝🙏' },
  { key: 'gestos', icon: '👍', label: 'Gestos',
    list: '👍👎👌✌️🤞🤟🤙👋👏🙌💪👊✊🫡👀👉👈👆👇☝️✋🖐️🤚💯✅❌⚠️❗❓' },
  { key: 'oficina', icon: '🔧', label: 'Carro e oficina',
    list: '🚗🚙🚕🛻🚐🏎️🏍️🛵🚚🔧🔩🛠️⚙️🪛🔨🛞⛽🔋🔌🧰🧯🛢️🚦📍🗺️🧾💰💵💳📅⏰⏱️📸📄📋🔍🏁' },
  { key: 'simbolos', icon: '❤️', label: 'Símbolos',
    list: '❤️🧡💛💚💙💜🖤🤍⭐🌟✨🔥💥🎉🎁🏆🥇☀️🌧️❄️⚡💡📢🔔🆗🆕🔝⬆️⬇️➡️⬅️🔄' },
];

const LS_RECENT = 'inbox_emoji_recent';
const split = (s: string) => Array.from(new Intl.Segmenter('pt', { granularity: 'grapheme' }).segment(s), x => x.segment);

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_RECENT) ?? '[]') as string[]; } catch { return []; }
}

export default function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [group, setGroup] = useState(recent.length ? 'recentes' : 'rostos');
  const box = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  function pick(e: string) {
    const next = [e, ...recent.filter(x => x !== e)].slice(0, 24);
    setRecent(next);
    try { localStorage.setItem(LS_RECENT, JSON.stringify(next)); } catch { /* sem localStorage */ }
    onPick(e);
  }

  const tabs = [...(recent.length ? [{ key: 'recentes', icon: '🕘', label: 'Mais usados' }] : []), ...GROUPS];
  const list = group === 'recentes' ? recent : split(GROUPS.find(g => g.key === group)?.list ?? '');

  return (
    <div ref={box} className="absolute bottom-full left-0 mb-2 w-[300px] rounded-2xl border border-steel-200 bg-white shadow-xl z-20 overflow-hidden">
      <div className="flex border-b border-steel-100">
        {tabs.map(t => (
          <button key={t.key} type="button" title={t.label} onClick={() => setGroup(t.key)}
            className={`flex-1 py-2 text-lg ${group === t.key ? 'bg-steel-100' : 'hover:bg-steel-50'}`}>{t.icon}</button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-0.5 p-2 max-h-52 overflow-y-auto">
        {list.map(e => (
          <button key={e} type="button" onMouseDown={ev => ev.preventDefault()} onClick={() => pick(e)}
            className="h-8 w-8 grid place-items-center rounded-lg text-xl hover:bg-steel-100">{e}</button>
        ))}
      </div>
    </div>
  );
}
