import { useMemo, useState } from 'react';
import { fmtQty } from '@/lib/parts';
import { fmtBRL, parseMoney } from './osHelpers';
import type { Suggestion } from './OsItemsEditor';

const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
type Tab = 'servico' | 'peca';

/** Serviço que acabou de entrar na OS: aqui escolhe/descreve as peças dele (opcional) */
type Step = { key: string; name: string; kit: Suggestion[] };

/**
 * 🧭 Escolher serviço e peças — painel lateral (desktop) / gaveta (celular) para montar a OS clicando.
 * Passo 1: veículo (o da OS; se a OS abriu sem veículo, dá para escolher um modelo só para sugerir preço).
 * Passo 2: categoria de serviço (as da Tabela de serviços) → serviço, já com o preço cobrado nesse veículo.
 * Passo 3: peças do serviço — opcional: kit cadastrado, estoque ou descrição livre (o cliente costuma pedir a peça descrita).
 * Fica aberto para adicionar vários itens seguidos.
 */
export default function CatalogPanel({ suggestions, services, itemCount, total, partsAsCost, showCost, onPick, kitFor, vehicleModel, osHasVehicle, onVehicle, loadModels, priceFor, onClose }: {
  suggestions: Suggestion[];
  /** Serviços já na OS (destino das peças): key + nome */
  services: { key: string; name: string }[];
  itemCount: number;
  total: number;
  /** Peças entram dentro de um item: mostra o custo (e não o preço de venda) */
  partsAsCost?: boolean;
  showCost?: boolean;
  /** targetKey = serviço que recebe a peça ('' = peça avulsa/sem destino) */
  onPick: (s: Suggestion, targetKey: string) => string | void;
  /** Peças do kit do serviço (cadastradas na Tabela de serviços); vazio = sem kit */
  kitFor?: (s: Suggestion) => Promise<Suggestion[]>;
  /** Modelo do veículo usado para sugerir preço ('' = nenhum) */
  vehicleModel: string;
  /** A OS já tem veículo cadastrado (então não dá para trocar aqui) */
  osHasVehicle: boolean;
  onVehicle: (model: string) => void;
  loadModels: () => Promise<{ label: string; n: number }[]>;
  /** Preço já cobrado neste modelo para o serviço (null = sem histórico) */
  priceFor: (s: Suggestion) => { price: number; count: number } | null;
  onClose: () => void;
}) {
  const partLabel = (p: Suggestion) => (partsAsCost
    ? (showCost ? (p.cost ? `custo ${fmtBRL(p.cost)}` : 'sem custo') : '')
    : (p.unit_price > 0 ? fmtBRL(p.unit_price) : 'a definir'));
  const [tab, setTab] = useState<Tab>('servico');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [target, setTarget] = useState(services.at(-1)?.key ?? '');
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  /** Nomes das peças já adicionadas neste passo (kit, estoque ou texto livre) */
  const [added, setAdded] = useState<string[]>([]);
  const [pq, setPq] = useState('');
  const [free, setFree] = useState({ name: '', qty: '1' });
  // Escolha de veículo (só quando a OS não tem)
  const [vehOpen, setVehOpen] = useState(false);
  const [models, setModels] = useState<{ label: string; n: number }[] | null>(null);
  const [vq, setVq] = useState('');

  const isLabor = (s: Suggestion) => s.kind === 'labor';
  const catOf = (s: Suggestion) => (s.fromTable ? s.category || 'Sem categoria' : 'Já usados antes');

  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of suggestions) if (isLabor(s)) m.set(catOf(s), (m.get(catOf(s)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => Number(a[0] === 'Já usados antes') - Number(b[0] === 'Já usados antes') || b[1] - a[1]);
  }, [suggestions]);

  const list = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return suggestions
      .filter(s => (tab === 'peca' ? s.kind === 'part' : isLabor(s) && (!cat || catOf(s) === cat)))
      .filter(s => { const n = norm(`${s.description} ${s.code ?? ''}`); return words.every(w => n.includes(w)); })
      .slice(0, 80);
  }, [suggestions, tab, q, cat]);

  // O destino pode sumir (serviço removido) — cai para o último
  const validTarget = services.some(s => s.key === target) ? target : services.at(-1)?.key ?? '';

  const modelHits = useMemo(() => {
    const words = norm(vq).split(/\s+/).filter(Boolean);
    return (models ?? []).filter(m => words.every(w => norm(m.label).includes(w))).slice(0, 8);
  }, [models, vq]);

  const partHits = useMemo(() => {
    const words = norm(pq).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return suggestions.filter(s => s.kind === 'part' && words.every(w => norm(`${s.description} ${s.code ?? ''}`).includes(w))).slice(0, 6);
  }, [suggestions, pq]);

  function openVehicle() {
    setVehOpen(true);
    if (!models) loadModels().then(setModels).catch(() => setModels([]));
  }

  function flash(name: string) {
    setJustAdded(name);
    setTimeout(() => setJustAdded(j => (j === name ? null : j)), 1200);
  }

  function pick(s: Suggestion) {
    const key = onPick(s, s.kind === 'part' ? validTarget : '');
    flash(s.description);
    if (isLabor(s) && key) {
      // Depois do serviço vem o passo das peças (opcional)
      setStep({ key, name: s.description, kit: [] });
      setAdded([]); setPq(''); setFree({ name: '', qty: '1' });
      if (kitFor) kitFor(s).then(kit => setStep(st => (st && st.key === key ? { ...st, kit } : st))).catch(() => { /* sem kit */ });
    }
  }

  function addPart(p: Suggestion) {
    if (!step || added.includes(p.description)) return;
    onPick(p, step.key);
    setAdded(a => [...a, p.description]);
  }
  function addFree() {
    const name = free.name.trim();
    if (!step || name.length < 2) return;
    const qty = parseMoney(free.qty);
    onPick({ description: name, kind: 'part', unit_price: 0, qty: Number.isFinite(qty) && qty > 0 ? qty : 1 }, step.key);
    setAdded(a => [...a, name]);
    setFree({ name: '', qty: '1' });
  }

  const leaveStep = () => setStep(null);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end md:pointer-events-none" role="dialog" aria-label="Escolher serviço e peças">
      {/* No celular escurece o fundo; no computador deixa a OS visível para ver os itens entrando */}
      <div className="absolute inset-0 bg-steel-900/40 md:hidden" onClick={onClose} />
      <div className="relative bg-white w-full md:w-[440px] max-h-[88vh] md:max-h-none md:h-full rounded-t-2xl md:rounded-none shadow-2xl md:border-l md:border-steel-200 flex flex-col md:pointer-events-auto">
        <div className="px-4 pt-4 pb-3 border-b border-steel-100">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h3 className="font-bold text-lg text-steel-900">Escolher serviço e peças</h3>
            <button type="button" onClick={onClose} className="h-10 w-10 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100" aria-label="Fechar">✕</button>
          </div>

          {/* 1 · Veículo */}
          <div className="rounded-xl bg-steel-50 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span aria-hidden>🚗</span>
              {vehicleModel ? (
                <>
                  <span className="font-semibold text-steel-900 truncate">{vehicleModel}</span>
                  <span className="text-[11px] text-steel-500">{osHasVehicle ? 'veículo da OS' : 'só para sugerir preço'}</span>
                  {!osHasVehicle && <button type="button" onClick={() => { onVehicle(''); setVehOpen(false); }} className="ml-auto text-xs text-steel-500 hover:text-alert-600">limpar</button>}
                </>
              ) : (
                <>
                  <span className="text-steel-500">Sem veículo na OS</span>
                  <button type="button" onClick={openVehicle} className="ml-auto text-xs font-semibold text-brand-700 hover:underline">Escolher veículo</button>
                </>
              )}
            </div>
            {vehOpen && !vehicleModel && (
              <div className="mt-2">
                <input autoFocus className="input !py-2 text-sm" placeholder="Modelo do veículo (ex.: Gol, Corsa, Civic)" value={vq} onChange={e => setVq(e.target.value)} />
                <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-steel-200 bg-white divide-y divide-steel-100">
                  {models === null ? <div className="px-3 py-2 text-xs text-steel-400">Carregando…</div>
                    : modelHits.length === 0 ? <div className="px-3 py-2 text-xs text-steel-400">Nenhum modelo encontrado.</div>
                    : modelHits.map(m => (
                      <button key={m.label} type="button" onClick={() => { onVehicle(m.label); setVehOpen(false); setVq(''); }}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-brand-50">
                        <span className="truncate">{m.label}</span><span className="text-[11px] text-steel-400">{m.n} veículo{m.n === 1 ? '' : 's'}</span>
                      </button>
                    ))}
                </div>
                <p className="mt-1.5 text-[11px] text-steel-400">Não muda o veículo da OS: só traz o preço que a oficina já cobrou nesse modelo.</p>
              </div>
            )}
          </div>

          {!step && (
            <>
              <input className="input text-sm mt-3" placeholder={tab === 'servico' ? 'Buscar serviço…' : 'Buscar peça…'} value={q} onChange={e => setQ(e.target.value)} />
              <div className="flex gap-1.5 mt-3">
                {([['servico', 'Serviços'], ['peca', 'Peças']] as [Tab, string][]).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setTab(k)}
                    className={`flex-1 h-11 rounded-xl text-sm font-semibold transition ${tab === k ? 'bg-brand-500 text-white' : 'bg-steel-100 text-steel-700'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {/* 2 · Categoria de serviço */}
              {tab === 'servico' && cats.length > 1 && (
                <div className="flex gap-1.5 mt-3 overflow-x-auto pb-1 -mx-1 px-1">
                  <button type="button" onClick={() => setCat(null)}
                    className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition ${cat === null ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>Todas</button>
                  {cats.map(([c, n]) => (
                    <button key={c} type="button" onClick={() => setCat(cat === c ? null : c)}
                      className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition ${cat === c ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
                      {c} <span className="opacity-60">({n})</span>
                    </button>
                  ))}
                </div>
              )}
              {tab === 'peca' && services.length > 0 && (
                <label className="mt-3 flex items-center gap-2 text-xs text-steel-500">
                  <span className="shrink-0">Peças entram no item:</span>
                  <select className="input !py-1.5 !px-2 text-xs flex-1 min-w-0" value={validTarget} onChange={e => setTarget(e.target.value)}>
                    {services.map(s => <option key={s.key} value={s.key}>{s.name || 'sem nome'}</option>)}
                  </select>
                </label>
              )}
            </>
          )}
        </div>

        {step ? (
          /* 3 · Peças do serviço (opcional) */
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-3 bg-signal-50 border-b border-steel-100 text-sm text-steel-700">
              ✓ <strong>{step.name}</strong> entrou na OS. <span className="text-steel-500">Peças deste serviço (opcional):</span>
            </div>

            {step.kit.length > 0 && (
              <div>
                <div className="px-4 pt-3 text-[11px] font-bold uppercase tracking-wider text-steel-500">Kit do serviço</div>
                <ul className="divide-y divide-steel-100">
                  {step.kit.map(p => {
                    const done = added.includes(p.description);
                    const out = p.part_id != null && (p.stock ?? 0) <= 0;
                    return (
                      <li key={p.description}>
                        <button type="button" onClick={() => addPart(p)} disabled={done}
                          className="w-full min-h-[52px] px-4 py-2 flex items-center gap-3 text-left hover:bg-steel-50 active:bg-brand-50 disabled:opacity-60">
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-steel-800 truncate">{p.description}</span>
                            <span className="block text-xs text-steel-500">
                              {fmtQty(p.qty ?? 1)} {p.unit ?? 'un'}
                              {p.part_id ? <> · <span className={out ? 'text-alert-600 font-semibold' : ''}>{fmtQty(p.stock)} em estoque</span></> : ' · peça avulsa'}
                            </span>
                          </span>
                          <span className="text-sm font-bold text-steel-900 shrink-0">{partLabel(p)}</span>
                          <span className={`h-10 w-10 shrink-0 rounded-xl grid place-items-center text-lg font-bold ${done ? 'bg-signal-500 text-white' : 'bg-brand-50 text-brand-700'}`}>{done ? '✓' : '+'}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <div className="px-4 pt-2">
                  <button type="button" className="text-xs font-semibold text-brand-700 hover:underline disabled:opacity-40" disabled={step.kit.every(p => added.includes(p.description))}
                    onClick={() => step.kit.filter(p => !added.includes(p.description)).forEach(addPart)}>
                    Adicionar todas as peças do kit
                  </button>
                </div>
              </div>
            )}

            <div className="px-4 pt-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-steel-500 mb-1.5">Peça do estoque</div>
              <input className="input !py-2 text-sm" placeholder="Buscar peça no estoque…" value={pq} onChange={e => setPq(e.target.value)} />
              {partHits.length > 0 && (
                <ul className="mt-1.5 rounded-lg border border-steel-200 divide-y divide-steel-100 overflow-hidden">
                  {partHits.map(p => (
                    <li key={p.description + (p.part_id ?? '')}>
                      <button type="button" onClick={() => addPart(p)} disabled={added.includes(p.description)}
                        className="w-full px-3 py-2 flex items-center gap-3 text-left text-sm hover:bg-brand-50 disabled:opacity-60">
                        <span className="flex-1 min-w-0 truncate">{p.description}{p.code && <span className="text-steel-400"> · {p.code}</span>}</span>
                        <span className="text-[11px] text-steel-500 shrink-0">{fmtQty(p.stock)} {p.unit} em estoque</span>
                        <strong className="shrink-0">{partLabel(p)}</strong>
                        <span className="shrink-0 text-brand-700 font-bold">{added.includes(p.description) ? '✓' : '+'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="px-4 pt-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-steel-500 mb-1.5">Descrever a peça</div>
              <div className="flex gap-2">
                <input className="input !py-2 text-sm flex-1 min-w-0" placeholder="Ex.: Óleo 5W30 sintético, filtro Tecfil" value={free.name}
                  onChange={e => setFree(f => ({ ...f, name: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFree(); } }} />
                <input className="input !py-2 text-sm w-16 text-right" inputMode="decimal" aria-label="Quantidade" value={free.qty} onChange={e => setFree(f => ({ ...f, qty: e.target.value }))} />
                <button type="button" onClick={addFree} disabled={free.name.trim().length < 2} className="btn-primary text-sm !px-4 disabled:opacity-40">+</button>
              </div>
              <p className="mt-1 text-[11px] text-steel-400">Entra na OS como peça do serviço; o valor você preenche na linha, se quiser.</p>
            </div>

            {added.length > 0 && (
              <div className="px-4 pt-4 text-xs text-steel-600">
                <span className="font-semibold text-signal-700">✓ Adicionadas:</span> {added.join(' · ')}
              </div>
            )}

            <div className="p-4 flex flex-col gap-2">
              <button type="button" className="btn-primary text-sm" onClick={leaveStep}>{added.length ? 'Concluir serviço' : 'Seguir sem peças'}</button>
            </div>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto divide-y divide-steel-100">
            {list.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-steel-500">
                {suggestions.some(s => (tab === 'peca' ? s.kind === 'part' : isLabor(s)))
                  ? 'Nada encontrado com essa busca.'
                  : tab === 'peca' ? 'Nenhuma peça cadastrada ainda.' : 'Nenhum serviço cadastrado ainda.'}
              </li>
            )}
            {list.map(s => {
              const out = s.part_id != null && (s.stock ?? 0) <= 0;
              const vp = isLabor(s) ? priceFor(s) : null;
              return (
                <li key={s.description + (s.part_id ?? '')}>
                  <button type="button" onClick={() => pick(s)}
                    className="w-full min-h-[56px] px-4 py-2 flex items-center gap-3 text-left hover:bg-steel-50 active:bg-brand-50">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-steel-800 truncate">{s.description}{s.code && <span className="text-steel-400 font-normal"> · cód. {s.code}</span>}</span>
                      <span className="block text-xs text-steel-500">
                        {s.part_id ? <span className={out ? 'text-alert-600 font-semibold' : ''}>{fmtQty(s.stock)} {s.unit} em estoque</span>
                          : vp ? <span className="text-signal-700">já cobrado {vp.count}× neste {vehicleModel}</span>
                          : s.fromTable ? (s.category || 'Tabela de serviços') : 'Já usado antes'}
                      </span>
                    </span>
                    <span className="text-sm font-bold text-steel-900 shrink-0">
                      {vp ? fmtBRL(vp.price) : s.unit_price > 0 ? fmtBRL(s.unit_price) : 'a definir'}
                    </span>
                    <span className={`h-11 w-11 shrink-0 rounded-xl grid place-items-center text-lg font-bold transition ${justAdded === s.description ? 'bg-signal-500 text-white' : 'bg-brand-50 text-brand-700'}`}>
                      {justAdded === s.description ? '✓' : '+'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="px-4 py-3 border-t border-steel-100 flex items-center justify-between gap-3 bg-steel-50 md:rounded-none">
          <div className="text-sm text-steel-600">
            <strong className="text-steel-900">{itemCount}</strong> {itemCount === 1 ? 'item' : 'itens'} · <strong className="text-steel-900">{fmtBRL(total)}</strong>
          </div>
          <button type="button" onClick={onClose} className="btn-primary text-sm !py-2.5 !px-5">Pronto</button>
        </div>
      </div>
    </div>
  );
}
