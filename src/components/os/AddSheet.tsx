import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_SUBS, PART_CATEGORIES, fmtQty, inCategory, subOf } from '@/lib/parts';
import { fmtBRL } from './osHelpers';
import type { Suggestion } from './OsItemsEditor';
import { codeHit, matchesAll, searchHay, searchWords } from '@/lib/partSearch';

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const words = (q: string) => searchWords(q);
const hayCache = new WeakMap<Suggestion, string>();
const hay = (s: Suggestion) => { let h = hayCache.get(s); if (h == null) { h = searchHay(s.description, s.code, s.search, s.category); hayCache.set(s, h); } return h; };
const fits = (s: Suggestion, ws: string[]) => matchesAll(hay(s), ws);

/** Kit pronto para o carro da OS: serviço da Tabela + as peças dele */
export type CarKit = { svc: Suggestion; parts: string[]; model: string | null };

/** Para onde vai o que for escolhido: itens da OS · peças de um serviço · venda de balcão (só peças) */
export type SheetMode = { kind: 'top' } | { kind: 'part'; key: string; name: string; sells: boolean } | { kind: 'sale' };

/** Ordena: código exato › nome começa com a busca › com estoque */
function rank(list: Suggestion[], ws: string[]) {
  if (!ws.length) return list;
  const score = (s: Suggestion) => {
    const n = norm(s.description);
    return (codeHit(s.code, ws) ? 4 : 0) + (n.startsWith(ws[0]) ? 2 : n.split(/[^a-z0-9]+/).some(t => t.startsWith(ws[0])) ? 1 : 0) + ((s.stock ?? 0) > 0 ? 1 : 0);
  };
  return list.map((s, i) => ({ s, i, k: score(s) })).sort((a, b) => b.k - a.k || a.i - b.i).map(x => x.s);
}

/**
 * Janela única de "Adicionar" da OS. Uma busca para tudo (kit, serviço, peça, código), com os kits do carro
 * e os mais usados na frente. Dentro de um serviço, abre só com as peças daquele serviço.
 */
export default function AddSheet({ mode, suggestions, categories, topServices, loadKits, kitOf, partFits, wantsParts, priceFor, vehicleLabel, showCost,
  onService, onKit, onPart, onFreeItem, onFreePart, onNewPart, onCombo, onClose }: {
  mode: SheetMode;
  suggestions: Suggestion[];
  /** Categorias de serviço da oficina (na ordem dela) */
  categories: string[];
  /** Serviços mais lançados pela oficina */
  topServices: string[];
  loadKits: () => Promise<CarKit[]>;
  /** Kit do serviço (modo peça) */
  kitOf: (name: string) => Promise<Suggestion[]>;
  /** Peça serve no carro (e, com itemKey, no tipo do serviço) */
  /** anyCar: só o tipo do serviço, de qualquer carro */
  partFits: (s: Suggestion, itemKey?: string, anyCar?: boolean) => boolean;
  /** Serviço que costuma levar peça (abre as peças logo depois de escolher) */
  wantsParts: (name: string) => boolean;
  priceFor: (s: Suggestion) => number | null;
  vehicleLabel: string;
  showCost: boolean;
  /** Devolve a key do item criado */
  onService: (s: Suggestion) => string | undefined;
  onKit: (s: Suggestion) => void;
  onPart: (s: Suggestion, target: string) => void;
  onFreeItem: (name: string) => void;
  onFreePart: (name: string, target: string) => void;
  onNewPart?: (name: string, target: string) => void;
  /** Peça + serviço: item de mão de obra com as peças dentro (comissão de 4% sobre o item). Devolve a key do item */
  onCombo?: () => string | undefined;
  onClose: () => void;
}) {
  const [cur, setCur] = useState<SheetMode>(mode);
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<string | null>(null);
  /** Tipo dentro de Óleos e filtros (filtro de ar, de óleo...) */
  const [sub, setSub] = useState<string | null>(null);
  useEffect(() => setSub(null), [chip]);
  /** 'item' = só peças do tipo do serviço · 'car' = todas do carro · 'all' = todo o cadastro */
  /** item = tipo do serviço + carro · family = tipo do serviço, qualquer carro · car = tudo do carro · all = todo o cadastro */
  const [scope, setScope] = useState<'item' | 'family' | 'car' | 'all'>('item');
  const [kits, setKits] = useState<CarKit[] | null>(null);
  const [svcKit, setSvcKit] = useState<Suggestion[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const partMode = cur.kind !== 'top';
  const target = cur.kind === 'part' ? cur.key : '';

  useEffect(() => { loadKits().then(setKits).catch(() => setKits([])); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setQ(''); setChip(null); setScope(cur.kind === 'part' ? 'item' : 'car'); setAdded([]); setSvcKit([]);
    if (cur.kind === 'part') kitOf(cur.name).then(setSvcKit).catch(() => setSvcKit([]));
    setTimeout(() => input.current?.focus(), 50);
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const ws = words(q);
  const labor = useMemo(() => suggestions.filter(s => s.kind === 'labor'), [suggestions]);
  const partsBase = useMemo(() => suggestions.filter(s => s.kind === 'part'
    && (scope === 'all' || (scope === 'car' ? partFits(s) : scope === 'family' ? partFits(s, target, true) : partFits(s, target)))), [suggestions, scope, partFits, target]);
  // O serviço tem um tipo de peça (óleo, freio...)? Sem tipo, ampliar já é ver tudo
  const hasFamily = useMemo(() => !!target && suggestions.some(s => s.kind === 'part' && partFits(s, target, true)), [suggestions, partFits, target]);

  // Categorias de serviço que aparecem nos chips: as da oficina e as que os serviços usam
  const svcCats = useMemo(() => {
    const out = [...categories];
    for (const s of labor) if (s.fromTable && s.category && !out.some(c => norm(c) === norm(s.category!))) out.push(s.category);
    // Só categorias com serviço na Tabela; Check-up tem fluxo próprio (não se lança por aqui)
    const used = new Set(labor.filter(s => s.fromTable && s.category).map(s => norm(s.category!)));
    return out.filter(c => used.has(norm(c)) && !/^(check.?up|revisao geral)$/.test(norm(c)));
  }, [categories, labor]);
  const partCats = useMemo(() => PART_CATEGORIES.filter(c => partsBase.some(p => (p.pcat ?? 'outros') === c.value)), [partsBase]);
  // Óleos e filtros em vista: mostra os tipos (óleo, filtro de ar, de óleo...) quando houver mais de um
  // Categoria em vista que se divide em tipos (Óleos e filtros, Pneus)
  const subCat = partMode ? (chip ?? (partCats.length === 1 ? partCats[0].value : null)) : null;
  const pcatOf = (s: Suggestion) => ({ category: s.pcat ?? 'outros', name: s.description, subcategory: s.psub ?? null });
  const oilSubs = useMemo(() => {
    const list = subCat ? CATEGORY_SUBS[subCat as keyof typeof CATEGORY_SUBS] : undefined;
    if (!subCat || !list) return [];
    const has = new Set(partsBase.map(p => subOf(subCat, pcatOf(p))).filter(Boolean));
    return has.size > 1 ? list.filter(o => has.has(o.value)) : [];
  }, [partsBase, subCat]); // eslint-disable-line react-hooks/exhaustive-deps

  const svcHits = useMemo(() => rank(labor.filter(s => (!chip || norm(s.category ?? '') === norm(chip)) && fits(s, ws)), ws),
    [labor, chip, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const kitHits = useMemo(() => (kits ?? []).filter(k => (!chip || norm(k.svc.category ?? '') === norm(chip))
    && matchesAll(searchHay(k.svc.description, ...k.parts), ws)), [kits, chip, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const partHits = useMemo(() => {
    if (!partMode && !ws.length) return [];
    return rank(partsBase.filter(s => (!partMode || !chip || inCategory(chip, pcatOf(s)))
      && (!partMode || !sub || !subCat || subOf(subCat, pcatOf(s)) === sub) && fits(s, ws)), ws);
  }, [partsBase, chip, sub, subCat, q, partMode]); // eslint-disable-line react-hooks/exhaustive-deps
  // Digitou e a peça não é do carro/tipo do serviço: mostra logo abaixo as de outros carros e sem carro
  // Dentro de um serviço com tipo (óleo, freio...): primeiro as do mesmo tipo de outros carros; as de outro tipo
  // só aparecem se nada do tipo bater com a busca
  const otherFamily = useMemo(() => !!target && hasFamily && scope !== 'all', [target, hasFamily, scope]);
  const otherHits = useMemo(() => {
    if (!ws.length || scope === 'all') return [];
    const seen = new Set(partHits);
    const all = suggestions.filter(s => s.kind === 'part' && !seen.has(s) && fits(s, ws));
    if (!otherFamily) return rank(all, ws);
    const fam = all.filter(s => partFits(s, target, true));
    return rank(fam.length || partHits.length ? fam : all, ws);
  }, [suggestions, q, scope, partHits, otherFamily, partFits, target]); // eslint-disable-line react-hooks/exhaustive-deps
  const otherIsFamily = otherFamily && otherHits.length > 0 && otherHits.every(s => partFits(s, target, true));

  const top = useMemo(() => topServices.map(n => labor.find(s => norm(s.description) === norm(n))).filter(Boolean).slice(0, 8) as Suggestion[], [topServices, labor]);

  function flash(name: string) {
    setJustAdded(name);
    setTimeout(() => setJustAdded(j => (j === name ? null : j)), 1100);
  }
  function pickService(s: Suggestion) {
    const key = onService(s);
    if (key && wantsParts(s.description)) setCur({ kind: 'part', key, name: s.description, sells: false });
    else onClose();
  }
  function pickPart(s: Suggestion) {
    onPart(s, target);
    setAdded(a => [...a, s.description]);
    flash(s.description);
    if (cur.kind === 'top') onClose();
  }
  function freeItem() { const n = q.trim(); if (n.length < 2) return; onFreeItem(n); onClose(); }
  function freePart() { const n = q.trim(); if (n.length < 2) return; onFreePart(n, target); setAdded(a => [...a, n]); flash(n); setQ(''); }

  const title = cur.kind === 'top' ? 'Adicionar na OS' : cur.kind === 'sale' ? 'Adicionar peça' : cur.sells ? `Peças vendidas em: ${cur.name}` : `Peças de: ${cur.name}`;
  const asCost = cur.kind === 'part' && !cur.sells;
  const partPrice = (p: Suggestion) => (asCost ? (showCost && p.cost ? `custo ${fmtBRL(p.cost)}` : '') : p.unit_price > 0 ? fmtBRL(p.unit_price) : '');

  const chipCls = (on: boolean) => `shrink-0 h-9 px-3.5 rounded-full text-sm font-semibold border transition ${on ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-700 border-steel-200 hover:border-steel-400'}`;
  const Group = ({ label }: { label: string }) => <div className="px-4 pt-5 pb-2 text-[13px] font-semibold text-steel-500">{label}</div>;

  const Line = ({ name, sub, price, tag, onClick, done }: { name: string; sub?: string; price?: string; tag?: { text: string; cls: string }; onClick: () => void; done?: boolean }) => (
    <li>
      <button type="button" onClick={onClick}
        className="w-full min-h-[60px] px-4 py-2.5 flex items-center gap-3 text-left hover:bg-steel-50 active:bg-brand-50 border-b border-steel-100">
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-steel-900 leading-snug line-clamp-2">{name}</span>
          {sub && <span className="block text-xs text-steel-500 mt-0.5 line-clamp-1">{sub}</span>}
        </span>
        <span className="shrink-0 text-right">
          {price && <span className="block text-sm font-bold text-steel-900">{price}</span>}
          {tag && <span className="block mt-0.5 text-[11px] text-steel-400">{tag.text}</span>}
        </span>
        <span className={`h-11 w-11 shrink-0 rounded-xl grid place-items-center text-xl font-bold transition ${done ? 'bg-signal-500 text-white' : 'bg-brand-50 text-brand-700'}`}>{done ? '✓' : '+'}</span>
      </button>
    </li>
  );
  const svcSub = (s: Suggestion) => [s.category, (s.unit_price > 0 || priceFor(s) != null) ? null : 'preço na OS'].filter(Boolean).join(' · ');
  const svcPrice = (s: Suggestion) => { const p = priceFor(s) ?? s.unit_price; return p > 0 ? fmtBRL(p) : ''; };
  const partSub = (p: Suggestion) => [p.code ? `cód. ${p.code}` : null, p.part_id ? `${fmtQty(p.stock ?? 0)} ${p.unit ?? 'un'} em estoque` : null].filter(Boolean).join(' · ');

  const nothing = cur.kind === 'top'
    ? ws.length > 0 && !svcHits.length && !kitHits.length && !partHits.length && !otherHits.length
    : partHits.length === 0 && otherHits.length === 0;

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/50 flex items-end md:items-center justify-center md:p-6" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full md:max-w-2xl h-[94vh] md:h-[84vh] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Cabeçalho: título, carro, busca e filtros */}
        <div className="px-4 pt-4 pb-3 border-b border-steel-100">
          <div className="flex items-center gap-3">
            {cur.kind === 'part' && mode.kind === 'top' && (
              <button type="button" onClick={() => setCur({ kind: 'top' })} className="h-11 w-11 -ml-2 rounded-xl grid place-items-center text-steel-600 hover:bg-steel-100" aria-label="Voltar">←</button>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg text-steel-900 truncate">{title}</h3>
              <div className="text-xs text-steel-500">{vehicleLabel || 'Sem veículo na OS'}</div>
            </div>
            <button type="button" onClick={onClose} className="h-11 w-11 rounded-xl grid place-items-center text-steel-500 hover:bg-steel-100 text-lg" aria-label="Fechar">✕</button>
          </div>
          <div className="relative mt-3">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-steel-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input ref={input} className="input !h-12 !pl-10 text-base" value={q} onChange={e => setQ(e.target.value)}
              placeholder={partMode ? 'Buscar peça pelo nome ou código' : 'Buscar serviço, kit, peça ou código'}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (nothing) (partMode ? freePart() : freeItem()); } }} />
          </div>
          {!partMode && svcCats.length > 0 && (chip || ws.length > 0) && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button type="button" className={chipCls(chip === null)} onClick={() => setChip(null)}>{chip ? '← Todas' : 'Tudo'}</button>
              {svcCats.map(c => <button key={c} type="button" className={chipCls(chip === c)} onClick={() => setChip(chip === c ? null : c)}>{c}</button>)}
            </div>
          )}
          {partMode && partCats.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button type="button" className={chipCls(chip === null)} onClick={() => setChip(null)}>Todas</button>
              {partCats.map(c => <button key={c.value} type="button" className={chipCls(chip === c.value)} onClick={() => setChip(chip === c.value ? null : c.value)}>{c.icon} {c.label}</button>)}
            </div>
          )}
          {oilSubs.length > 0 && (
            <div className="mt-2 overflow-x-auto -mx-1 px-1">
              <div role="tablist" aria-label="Tipo de peça" className="inline-flex items-center gap-0.5 rounded-xl bg-steel-100 p-1">
                {[{ value: null as string | null, label: 'Todos' }, ...oilSubs.map(o => ({ value: o.value as string | null, label: o.label }))].map(o => {
                  const on = sub === o.value;
                  return (
                    <button key={o.value ?? 'all'} type="button" role="tab" aria-selected={on} onClick={() => setSub(o.value)}
                      className={`whitespace-nowrap min-h-[36px] px-3 rounded-lg text-sm font-semibold transition ${on ? 'bg-white text-steel-900 shadow-sm' : 'text-steel-500'}`}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <ul className="flex-1 overflow-y-auto">
          {/* Peça + serviço: a mão de obra digitada na OS e as peças dentro (4% sobre o item) */}
          {cur.kind === 'top' && onCombo && !ws.length && !chip && (
            <li className="px-4 pt-4">
              <button type="button" onClick={() => { const key = onCombo(); if (key) setCur({ kind: 'part', key, name: 'Peça + serviço', sells: false }); else onClose(); }}
                className="w-full min-h-[64px] px-4 py-3 rounded-2xl border-2 border-brand-300 bg-brand-50 text-left hover:bg-brand-100 flex items-center gap-3">
                <span className="h-11 w-11 shrink-0 rounded-xl bg-brand-500 text-white grid place-items-center text-xl font-bold">＋</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold text-brand-900">Peça + serviço</span>
                  <span className="block text-xs text-steel-600">Mão de obra com as peças dentro · você digita o valor na OS · comissão 4% sobre o item</span>
                </span>
              </button>
            </li>
          )}

          {/* Categoria escolhida: dá para lançar ela mesma como item (ex.: Escapamento, Mão de obra) */}
          {!partMode && chip && !ws.length && (
            <li>
              <button type="button" onClick={() => { onFreeItem(chip); onClose(); }}
                className="w-full min-h-[56px] px-4 py-3 text-left bg-brand-50 border-b border-brand-100 hover:bg-brand-100">
                <span className="block text-[15px] font-bold text-brand-800">＋ Lançar “{chip}” como item</span>
                <span className="block text-xs text-steel-600">O valor você digita na OS e depois inclui as peças</span>
              </button>
            </li>
          )}

          {/* Modo peça: kit do serviço primeiro */}
          {cur.kind === 'part' && svcKit.length > 0 && !ws.length && (
            <>
              <li className="flex items-center justify-between px-4 pt-4 pb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-steel-500">Kit deste serviço</span>
                <button type="button" className="text-sm font-bold text-brand-700 hover:underline"
                  onClick={() => svcKit.filter(p => !added.includes(p.description)).forEach(pickPart)}>Adicionar todas</button>
              </li>
              {svcKit.map(p => <Line key={'k' + p.description} name={p.description} sub={`${fmtQty(p.qty ?? 1)} ${p.unit ?? 'un'}${p.part_id ? '' : ' · peça avulsa'}`}
                price={partPrice(p)} onClick={() => pickPart(p)} done={added.includes(p.description)} />)}
            </>
          )}

          {/* Itens da OS: kits do carro, mais usados e serviços */}
          {!partMode && kitHits.length > 0 && (
            <>
              <Group label={`Kits ${vehicleLabel ? 'deste carro' : ''}`.trim()} />
              {kitHits.slice(0, ws.length || chip ? 20 : 6).map(k => (
                <Line key={'kit' + k.svc.description} name={k.svc.description} sub={k.parts.join(' · ')} price={svcPrice(k.svc)}
                  tag={{ text: k.model ? 'kit do carro' : 'kit', cls: 'bg-signal-100 text-signal-800' }} onClick={() => { onKit(k.svc); onClose(); }} />
              ))}
            </>
          )}
          {/* Tela inicial: categorias em cartões */}
          {!partMode && !ws.length && !chip && svcCats.length > 0 && (
            <>
              <Group label="Categorias" />
              <li className="px-4 pb-1 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {svcCats.map(c => {
                  const n = labor.filter(s => s.fromTable && norm(s.category ?? '') === norm(c)).length;
                  return (
                    <button key={c} type="button" onClick={() => setChip(c)}
                      className="min-h-[64px] px-4 py-3 rounded-xl border border-steel-200 bg-white hover:border-steel-400 active:bg-steel-50 text-left transition">
                      <span className="block text-sm font-semibold text-steel-900 leading-tight line-clamp-2">{c}</span>
                      <span className="block text-xs text-steel-500 mt-1">{n} serviço{n === 1 ? '' : 's'}</span>
                    </button>
                  );
                })}
              </li>
            </>
          )}
          {/* Serviços só aparecem depois de escolher a categoria ou digitar (a tela inicial fica limpa) */}
          {!partMode && (ws.length > 0 || !!chip) && svcHits.length > 0 && (
            <>
              <Group label={chip ? `Serviços · ${chip}` : 'Serviços'} />
              {svcHits.slice(0, 120).map(s => (
                <Line key={'s' + s.description} name={s.description} sub={svcSub(s)} price={svcPrice(s)}
                  tag={{ text: 'serviço', cls: 'bg-steel-100 text-steel-600' }} onClick={() => pickService(s)} />
              ))}
            </>
          )}

          {/* Peças */}
          {partHits.length > 0 && (
            <>
              <Group label={partMode ? (scope === 'item' ? 'Peças para este serviço' : scope === 'family' ? 'Peças deste tipo (todos os carros)' : scope === 'car' ? 'Peças deste carro' : 'Todas as peças') : 'Peças (entram com preço)'} />
              {partHits.slice(0, 80).map(p => (
                <Line key={'p' + (p.part_id ?? '') + p.description} name={p.description} sub={partSub(p)} price={partPrice(p)}
                  tag={!partMode ? { text: 'peça', cls: 'bg-brand-50 text-brand-700' } : undefined}
                  onClick={() => pickPart(p)} done={justAdded === p.description || (partMode && added.includes(p.description))} />
              ))}
              {partHits.length > 80 && <li className="px-4 py-3 text-xs text-center text-steel-500">Mostrando 80 de {partHits.length}. Digite mais (medida, marca ou código).</li>}
            </>
          )}

          {otherHits.length > 0 && (
            <>
              <Group label={otherIsFamily ? 'Deste tipo, de outros carros ou sem carro' : vehicleLabel ? 'Outras peças do cadastro (outros carros ou sem carro)' : 'Outras peças do cadastro'} />
              {otherHits.slice(0, 60).map(p => (
                <Line key={'o' + (p.part_id ?? '') + p.description} name={p.description} sub={partSub(p)} price={partPrice(p)}
                  tag={!partMode ? { text: 'peça', cls: 'bg-brand-50 text-brand-700' } : undefined}
                  onClick={() => pickPart(p)} done={justAdded === p.description || (partMode && added.includes(p.description))} />
              ))}
              {otherHits.length > 60 && <li className="px-4 py-3 text-xs text-center text-steel-500">Mostrando 60 de {otherHits.length}. Digite mais (medida, marca ou código).</li>}
            </>
          )}

          {/* Digitou dentro de um serviço com tipo: procurar também nos outros tipos */}
          {partMode && ws.length > 0 && otherFamily && (
            <li className="px-4 pt-3">
              <button type="button" onClick={() => setScope('all')}
                className="w-full min-h-[48px] px-4 rounded-xl border border-steel-200 text-sm font-semibold text-steel-700 text-left hover:bg-steel-50">
                👁 Procurar “{q.trim()}” em todas as peças do cadastro
              </button>
            </li>
          )}

          {/* Ampliar a busca de peças (sem nada digitado) */}
          {partMode && !ws.length && scope !== 'all' && (
            <li className="px-4 pt-3">
              <button type="button" onClick={() => setScope(scope === 'item' && hasFamily ? 'family' : 'all')}
                className="w-full min-h-[48px] px-4 rounded-xl border border-steel-200 text-sm font-semibold text-steel-700 text-left hover:bg-steel-50">
                {scope === 'item' && hasFamily ? '👁 Ver mais peças deste tipo (de outros carros)' : '👁 Ver todas as peças do cadastro'}
              </button>
            </li>
          )}

          {/* Nada encontrado: lançar o que foi digitado */}
          {ws.length > 0 && (
            <li className="px-4 py-3 space-y-2">
              {nothing && <div className="text-sm text-steel-600">Nada encontrado com “{q.trim()}”.</div>}
              {partMode ? (
                <button type="button" onClick={freePart} className="w-full min-h-[48px] px-4 rounded-xl bg-brand-50 text-left text-sm font-bold text-brand-800 hover:bg-brand-100">
                  ＋ Adicionar “{q.trim()}” como peça <span className="block text-xs font-normal text-steel-500">Peça sem cadastro: o valor você preenche na OS</span>
                </button>
              ) : (
                <button type="button" onClick={freeItem} className="w-full min-h-[48px] px-4 rounded-xl bg-brand-50 text-left text-sm font-bold text-brand-800 hover:bg-brand-100">
                  ＋ Lançar “{q.trim()}” como item <span className="block text-xs font-normal text-steel-500">Serviço que não está na tabela: o valor você digita na OS</span>
                </button>
              )}
              {partMode && onNewPart && (
                <button type="button" onClick={() => onNewPart(q.trim(), target)} className="w-full min-h-[44px] px-4 rounded-xl border border-steel-200 text-left text-sm font-semibold text-steel-700 hover:bg-steel-50">
                  🔩 Cadastrar “{q.trim()}” no estoque
                </button>
              )}
            </li>
          )}
          {!partMode && !ws.length && !chip && !svcCats.length && (
            <li className="px-4 py-8 text-center text-sm text-steel-500">Digite o serviço ou a peça.</li>
          )}
          <li className="h-6" />
        </ul>

        {partMode && (
          <div className="px-4 py-3 border-t border-steel-100 bg-steel-50 flex items-center justify-between gap-3">
            <span className="text-sm text-steel-600">{added.length ? <><strong className="text-steel-900">{added.length}</strong> peça{added.length === 1 ? '' : 's'} adicionada{added.length === 1 ? '' : 's'}</> : 'Toque nas peças para incluir'}</span>
            <button type="button" onClick={onClose} className="btn-primary !h-11 !px-6 text-sm">{added.length || cur.kind === 'sale' ? 'Pronto' : 'Sem peças'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
