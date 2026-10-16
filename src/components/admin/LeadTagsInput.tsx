import { KeyboardEvent, useState } from 'react';

export function LeadTagsInput({
  value,
  onChange,
  suggestions = [],
  placeholder = 'Adicionar tag…',
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  function add(tag: string) {
    const t = tag.trim().toLowerCase().replace(/\s+/g, '_');
    if (!t) return;
    if (value.includes(t)) { setDraft(''); return; }
    onChange([...value, t]);
    setDraft('');
  }

  function remove(tag: string) {
    onChange(value.filter(t => t !== tag));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const filtered = suggestions
    .filter(s => !value.includes(s) && (!draft || s.includes(draft.toLowerCase())))
    .slice(0, 6);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 px-2 py-2 border border-steel-200 rounded-lg bg-white min-h-[42px] focus-within:border-brand-500">
        {value.map(t => (
          <span key={t} className="inline-flex items-center gap-1 bg-brand-50 border border-brand-200 text-brand-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            {t}
            <button type="button" onClick={() => remove(t)}
              className="text-brand-500 hover:text-brand-700 leading-none text-sm" aria-label={`Remover ${t}`}>×</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft && add(draft)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
        />
      </div>
      {filtered.length > 0 && draft && (
        <div className="mt-1 flex flex-wrap gap-1">
          {filtered.map(s => (
            <button key={s} type="button" onClick={() => add(s)}
              className="text-xs text-steel-600 bg-steel-100 hover:bg-steel-200 px-2 py-0.5 rounded-full">
              + {s}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] text-steel-400 mt-1">Enter ou vírgula para adicionar</p>
    </div>
  );
}

export function LeadTagsPills({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags?.length) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map(t => (
        <span key={t} className="text-[10px] font-semibold bg-steel-100 text-steel-600 border border-steel-200 rounded-full px-1.5 py-0.5">
          {t}
        </span>
      ))}
      {rest > 0 && <span className="text-[10px] font-semibold text-steel-400">+{rest}</span>}
    </div>
  );
}
