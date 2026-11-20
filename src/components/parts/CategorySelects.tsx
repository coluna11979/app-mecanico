import { CATEGORY_SUBS, PART_CATEGORIES, subOf, type PartCategory } from '@/lib/parts';

/**
 * Categoria + tipo (subcategoria) da peça, lado a lado. O tipo vem do nome da peça;
 * escolher um tipo na lista fixa a escolha (vazio = continua pelo nome).
 */
export default function CategorySelects({ name, category, onCategory, sub, onSub, autoOption, hint }: {
  name: string;
  category: string;
  onCategory: (c: PartCategory | '') => void;
  sub: string;
  onSub: (s: string) => void;
  /** Texto da opção vazia de categoria (ex.: "Automática (pelo nome)"); sem ele, a opção vazia é "Escolha…" */
  autoOption?: string;
  hint?: string;
}) {
  const subs = category ? CATEGORY_SUBS[category as PartCategory] : undefined;
  const guess = category && subs ? subOf(category, { category, name }) : null;
  const guessLabel = subs?.find(o => o.value === guess)?.label;

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="part-cat">Categoria</label>
          <select id="part-cat" className="input" value={category}
            onChange={e => { onCategory(e.target.value as PartCategory | ''); onSub(''); }}>
            <option value="">{autoOption ?? 'Escolha a categoria…'}</option>
            {PART_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="part-sub">Tipo</label>
          <select id="part-sub" className="input disabled:bg-steel-50 disabled:text-steel-400" value={sub}
            disabled={!subs} onChange={e => onSub(e.target.value)}>
            {!subs
              ? <option value="">{category ? 'Sem tipos nesta categoria' : 'Escolha a categoria antes'}</option>
              : <>
                  <option value="">{guessLabel && guess !== 'outros' ? `${guessLabel} (pelo nome)` : 'Pelo nome da peça'}</option>
                  {subs.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </>}
          </select>
        </div>
      </div>
      {hint && <p className="text-[11px] text-steel-500 mt-1">{hint}</p>}
    </div>
  );
}
