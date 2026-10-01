import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { METHODS, RECEIVE_METHODS, brl, moneyStr, parseMoney, type PayMethod } from '@/lib/cash';
import { fmtQty, loadDefaultMargin, salePriceOf, type WorkshopPart } from '@/lib/parts';

/**
 * Venda de peças no balcão (óleo, palheta, lâmpada…), sem serviço.
 * Vira uma OS concluída só com peças, já recebida neste caixa: entra no faturamento
 * (base da % do gerente), baixa o estoque e não gera comissão de mecânico.
 */

type CatPart = Pick<WorkshopPart, 'id' | 'name' | 'code' | 'brand' | 'cost' | 'margin_percent' | 'sale_price' | 'stock_qty' | 'unit'>;
type Line = { key: number; part_id: string | null; description: string; quantity: string; price: string; stock: number | null };
type Pay = { method: PayMethod; amount: string; installments: number };
type NewPart = { name: string; code: string; cost: string; price: string; stock: string };

let seq = 0;
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function CounterSaleModal({ wid, sid, canDiscount, onClose, onDone }: {
  wid: string; sid: string | null; canDiscount: boolean; onClose: () => void; onDone: () => void;
}) {
  const [catalog, setCatalog] = useState<CatPart[] | null>(null);
  const [margin, setMargin]   = useState(100);
  const [q, setQ]             = useState('');
  const [lines, setLines]     = useState<Line[]>([]);
  const [discount, setDiscount] = useState('');
  const [pays, setPays]       = useState<Pay[]>([{ method: 'dinheiro', amount: '', installments: 1 }]);
  const [given, setGiven]     = useState('');
  const [busy, setBusy]       = useState(false);
  /** Cadastro rápido de peça, sem sair da venda */
  const [newPart, setNewPart] = useState<NewPart | null>(null);
  const [savingPart, setSavingPart] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, m] = await Promise.all([
        supabase.from('workshop_parts').select('id, name, code, brand, cost, margin_percent, sale_price, stock_qty, unit')
          .eq('workshop_id', wid).eq('active', true).order('name'),
        loadDefaultMargin(wid),
      ]);
      setCatalog((c.data as CatPart[]) ?? []);
      setMargin(m);
    })();
  }, [wid]);

  const found = useMemo(() => {
    const t = norm(q.trim());
    if (!t || !catalog) return [];
    return catalog.filter(p => norm(`${p.name} ${p.code ?? ''} ${p.brand ?? ''}`).includes(t)).slice(0, 8);
  }, [q, catalog]);

  function addPart(p: CatPart) {
    setLines(ls => {
      const i = ls.findIndex(l => l.part_id === p.id);
      if (i >= 0) return ls.map((l, j) => j === i ? { ...l, quantity: fmtQty(parseMoney(l.quantity) + 1) } : l);
      return [...ls, { key: ++seq, part_id: p.id, description: p.name, quantity: '1', price: moneyStr(salePriceOf(p, margin)), stock: Number(p.stock_qty) }];
    });
    setQ('');
  }
  function openNewPart() {
    setNewPart({ name: q.trim(), code: '', cost: '', price: '', stock: '' });
    setQ('');
  }

  async function saveNewPart() {
    if (!newPart) return;
    const name = newPart.name.trim();
    const cost = parseMoney(newPart.cost);
    const price = parseMoney(newPart.price);
    const stock = newPart.stock.trim() ? parseMoney(newPart.stock) : 0;
    if (!name) return toast.error('Informe o nome da peça');
    if (!(price > 0)) return toast.error('Informe o preço de venda');
    if (cost < 0) return toast.error('Custo inválido');
    if (stock < 0) return toast.error('Estoque inválido');
    if (cost > 0 && price < cost && !window.confirm(`O preço de venda (${brl(price)}) está abaixo do custo (${brl(cost)}). Salvar assim mesmo?`)) return;
    setSavingPart(true);
    const { data, error } = await supabase.from('workshop_parts')
      .insert({ workshop_id: wid, name, code: newPart.code.trim() || null, cost, sale_price: price, stock_qty: stock })
      .select('id, name, code, brand, cost, margin_percent, sale_price, stock_qty, unit').single();
    setSavingPart(false);
    if (error) return toast.error('Não foi possível cadastrar: ' + error.message);
    const part = data as CatPart;
    setCatalog(c => [...(c ?? []), part].sort((a, b) => a.name.localeCompare(b.name)));
    addPart(part);
    setNewPart(null);
    toast.success('Peça cadastrada ✓ — já está na venda');
  }

  function addFree() {
    setLines(ls => [...ls, { key: ++seq, part_id: null, description: q.trim(), quantity: '1', price: '', stock: null }]);
    setQ('');
  }
  const setLine = (key: number, patch: Partial<Line>) => setLines(ls => ls.map(l => l.key === key ? { ...l, ...patch } : l));

  const lineTotal = (l: Line) => {
    const v = parseMoney(l.quantity) * parseMoney(l.price || '0');
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
  };
  const subtotal = Math.round(lines.reduce((a, l) => a + lineTotal(l), 0) * 100) / 100;
  const disc = canDiscount && Number.isFinite(parseMoney(discount)) ? parseMoney(discount) : 0;
  const due = Math.max(0, Math.round((subtotal - disc) * 100) / 100);
  // Uma forma só e sem valor → é o total da venda
  const payRows = pays.length === 1 && !pays[0].amount ? [{ ...pays[0], amount: moneyStr(due) }] : pays;
  const total = Math.round(payRows.reduce((a, p) => a + (parseMoney(p.amount) || 0), 0) * 100) / 100;
  const missing = Math.round((due - total) * 100) / 100;
  const cashPart = payRows.filter(p => p.method === 'dinheiro').reduce((a, p) => a + (parseMoney(p.amount) || 0), 0);
  const givenN = parseMoney(given);
  const change = given ? Math.round((givenN - cashPart) * 100) / 100 : 0;

  const setPay = (i: number, patch: Partial<Pay>) => setPays(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  function addPay() {
    const used = new Set(pays.map(p => p.method));
    const next = RECEIVE_METHODS.find(m => !used.has(m)) ?? 'pix';
    setPays(ps => {
      const base = ps.length === 1 && !ps[0].amount ? [{ ...ps[0], amount: moneyStr(due) }] : ps;
      return [...base, { method: next, amount: missing > 0 ? moneyStr(missing) : '', installments: 1 }];
    });
  }

  async function confirm() {
    if (!lines.length) return toast.error('Adicione ao menos uma peça');
    for (const l of lines) {
      if (!l.description.trim()) return toast.error('Informe a descrição de cada peça');
      if (!(parseMoney(l.quantity) > 0)) return toast.error(`Quantidade inválida em ${l.description}`);
      if (!(parseMoney(l.price || '0') >= 0)) return toast.error(`Preço inválido em ${l.description}`);
    }
    if (disc > subtotal) return toast.error('Desconto maior que o total');
    if (due <= 0) return toast.error('Informe o preço das peças');
    if (Math.abs(missing) > 0.004) return toast.error(missing > 0 ? `Falta ${brl(missing)} no pagamento` : 'O pagamento passa do total');
    if (given && givenN < cashPart) return toast.error('O valor entregue é menor que a parte em dinheiro');
    const lowStock = lines.find(l => l.stock != null && parseMoney(l.quantity) > l.stock);
    if (lowStock && !window.confirm(`${lowStock.description}: o estoque marca ${fmtQty(lowStock.stock)}. Vender assim mesmo?`)) return;

    setBusy(true);
    const { error } = await supabase.rpc('cash_counter_sale', {
      p_workshop: wid, p_session: sid,
      p_items: lines.map(l => ({ part_id: l.part_id, description: l.description.trim(), quantity: parseMoney(l.quantity), unit_price: parseMoney(l.price || '0') })),
      p_parts: payRows.map(p => ({ method: p.method, amount: parseMoney(p.amount), installments: p.installments })),
      p_discount: disc, p_cash_given: given ? givenN : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(change > 0 ? `Venda registrada! Troco: ${brl(change)}` : 'Venda registrada ✓');
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 bg-steel-900/60 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[92vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">🛒 Venda de peças</h2>
            <div className="text-sm text-steel-500">Venda no balcão, sem serviço. Entra no faturamento e baixa o estoque.</div>
          </div>
          <button onClick={onClose} className="text-steel-400 hover:text-steel-700 text-xl leading-none" aria-label="Fechar">×</button>
        </div>

        {/* Busca no catálogo */}
        <div className="relative mt-4">
          <input className="input" placeholder={catalog === null ? 'Carregando peças…' : 'Buscar peça (nome, código, marca)…'} value={q}
            onChange={e => setQ(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (found[0]) addPart(found[0]); else if (q.trim()) openNewPart(); } }} />
          {q.trim() && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-steel-200 rounded-xl shadow-lg overflow-hidden">
              {found.map(p => (
                <button key={p.id} type="button" onClick={() => addPart(p)}
                  className="w-full text-left px-3 py-2 hover:bg-steel-50 flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{p.name}{p.code ? <span className="text-steel-400"> · {p.code}</span> : null}</span>
                  <span className="shrink-0 text-right">
                    <strong>{brl(salePriceOf(p, margin))}</strong>
                    <span className={`block text-[11px] ${Number(p.stock_qty) > 0 ? 'text-steel-400' : 'text-alert-600'}`}>estoque {fmtQty(p.stock_qty)} {p.unit}</span>
                  </span>
                </button>
              ))}
              <button type="button" onClick={openNewPart} className="w-full text-left px-3 py-2 hover:bg-steel-50 text-sm text-brand-700 font-semibold border-t border-steel-100">
                + Cadastrar “{q.trim()}” (custo e preço)
              </button>
              <button type="button" onClick={addFree} className="w-full text-left px-3 py-2 hover:bg-steel-50 text-xs text-steel-500 border-t border-steel-100">
                Vender “{q.trim()}” sem cadastrar
              </button>
            </div>
          )}
        </div>

        {newPart ? (
          <div className="mt-3 rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">🔩 Cadastrar peça</div>
              <button onClick={() => setNewPart(null)} className="text-steel-400 hover:text-steel-700 text-sm" aria-label="Fechar">✕</button>
            </div>
            <input className="input" placeholder="Nome da peça * (ex.: Óleo 5W30 1L)" value={newPart.name} autoFocus
              onChange={e => setNewPart(n => n && { ...n, name: e.target.value })} />
            <input className="input" placeholder="Código / referência (opcional)" value={newPart.code}
              onChange={e => setNewPart(n => n && { ...n, code: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-steel-500">Preço de custo
                <input className="input mt-0.5" inputMode="decimal" placeholder="0,00" value={newPart.cost}
                  onChange={e => setNewPart(n => n && { ...n, cost: e.target.value })} />
              </label>
              <label className="text-[11px] text-steel-500">Preço de venda *
                <input className="input mt-0.5" inputMode="decimal" placeholder="0,00" value={newPart.price}
                  onChange={e => setNewPart(n => n && { ...n, price: e.target.value })} />
              </label>
            </div>
            <label className="block text-[11px] text-steel-500">Quantas tem no estoque hoje? (opcional)
              <input className="input mt-0.5" inputMode="decimal" placeholder="0" value={newPart.stock}
                onChange={e => setNewPart(n => n && { ...n, stock: e.target.value })} />
            </label>
            {parseMoney(newPart.cost) > 0 && parseMoney(newPart.price) > 0 && (
              <div className="text-[11px] text-steel-500">
                Lucro por unidade: <strong>{brl(parseMoney(newPart.price) - parseMoney(newPart.cost))}</strong>
                {' '}({Math.round(((parseMoney(newPart.price) - parseMoney(newPart.cost)) / parseMoney(newPart.cost)) * 100)}% sobre o custo)
              </div>
            )}
            <button onClick={saveNewPart} disabled={savingPart} className="btn-primary w-full">
              {savingPart ? 'Salvando…' : 'Salvar e adicionar à venda'}
            </button>
          </div>
        ) : (
          <button type="button" onClick={openNewPart} className="mt-2 text-sm font-semibold text-brand-600">+ Cadastrar peça nova</button>
        )}

        {/* Itens */}
        <div className="mt-3 space-y-2">
          {lines.length === 0 && !newPart && (
            <p className="text-sm text-steel-400 text-center py-4">
              {catalog !== null && catalog.length === 0
                ? 'Nenhuma peça cadastrada ainda. Toque em “+ Cadastrar peça nova”.'
                : 'Busque e toque na peça para adicionar.'}
            </p>
          )}
          {lines.map(l => (
            <div key={l.key} className="rounded-xl border border-steel-200 p-2.5">
              <div className="flex gap-2 items-center">
                <input className="input !py-1.5 text-sm flex-1" value={l.description} disabled={!!l.part_id}
                  onChange={e => setLine(l.key, { description: e.target.value })} placeholder="Descrição" />
                <button onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))} className="text-steel-400 hover:text-alert-600 px-1" aria-label="Remover">✕</button>
              </div>
              <div className="flex gap-2 items-end mt-2">
                <label className="text-[10px] text-steel-400 uppercase w-20">Qtd
                  <input className="input !py-1.5 text-sm text-right mt-0.5" inputMode="decimal" value={l.quantity} onChange={e => setLine(l.key, { quantity: e.target.value })} />
                </label>
                <label className="text-[10px] text-steel-400 uppercase flex-1">Preço unit.
                  <input className="input !py-1.5 text-sm text-right mt-0.5" inputMode="decimal" placeholder="0,00" value={l.price} onChange={e => setLine(l.key, { price: e.target.value })} />
                </label>
                <div className="text-right flex-1 pb-1.5">
                  <div className="text-[10px] text-steel-400 uppercase">Total</div>
                  <div className="font-bold">{brl(lineTotal(l))}</div>
                </div>
              </div>
              {l.stock != null && parseMoney(l.quantity) > l.stock && (
                <div className="text-[11px] text-pending-800 mt-1">⚠️ Estoque marca {fmtQty(l.stock)}</div>
              )}
            </div>
          ))}
        </div>

        {lines.length > 0 && (
          <>
            <div className="rounded-2xl bg-steel-50 px-4 py-3 mt-4 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-steel-500">Peças</span><span className="font-semibold">{brl(subtotal)}</span></div>
              {disc > 0 && <div className="flex justify-between"><span className="text-steel-500">Desconto</span><span className="font-semibold">− {brl(disc)}</span></div>}
              <div className="flex justify-between pt-1 border-t border-steel-200 text-base">
                <span className="font-semibold">A receber</span><span className="font-bold">{brl(due)}</span>
              </div>
            </div>

            {canDiscount && (
              <div className="mt-3">
                <div className="label mb-1">Desconto (R$)</div>
                <input className="input" inputMode="decimal" placeholder="0,00" value={discount} onChange={e => setDiscount(e.target.value)} />
              </div>
            )}

            <div className="label mt-4 mb-2">Formas de pagamento</div>
            <div className="space-y-2">
              {payRows.map((p, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select className="input flex-[1.2]" value={p.method} onChange={e => setPay(i, { method: e.target.value as PayMethod, installments: 1 })}>
                    {RECEIVE_METHODS.map(m => <option key={m} value={m}>{METHODS[m].icon} {METHODS[m].label}</option>)}
                  </select>
                  {p.method === 'credito' && (
                    <select className="input w-20" value={p.installments} onChange={e => setPay(i, { installments: Number(e.target.value) })}>
                      {Array.from({ length: 12 }, (_, k) => k + 1).map(n => <option key={n} value={n}>{n}x</option>)}
                    </select>
                  )}
                  <input className="input flex-1" inputMode="decimal" placeholder="0,00" value={p.amount} onChange={e => setPay(i, { amount: e.target.value })} />
                  {pays.length > 1 && (
                    <button onClick={() => setPays(ps => ps.filter((_, j) => j !== i))} className="text-steel-400 hover:text-alert-600 px-1" aria-label="Remover">✕</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addPay} className="text-sm font-semibold text-brand-600 mt-2">+ Adicionar outra forma</button>
            <div className={`mt-2 text-sm font-semibold ${Math.abs(missing) < 0.005 ? 'text-signal-700' : missing > 0 ? 'text-pending-800' : 'text-alert-600'}`}>
              {Math.abs(missing) < 0.005 ? '✓ Valor fechado' : missing > 0 ? `Falta ${brl(missing)}` : `Passou ${brl(-missing)} do total`}
            </div>

            {cashPart > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 items-end">
                <div>
                  <div className="label mb-1">Cliente entregou (R$)</div>
                  <input className="input" inputMode="decimal" placeholder={moneyStr(cashPart)} value={given} onChange={e => setGiven(e.target.value)} />
                </div>
                <div className="rounded-xl bg-steel-50 px-3 py-2.5">
                  <div className="text-[11px] text-steel-500">Troco</div>
                  <div className={`text-lg font-bold ${change < 0 ? 'text-alert-600' : ''}`}>{brl(Math.max(0, change))}</div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={confirm} disabled={busy || !lines.length || due <= 0 || Math.abs(missing) > 0.004} className="btn-primary flex-[2] btn-lg">
            {busy ? 'Registrando…' : `Vender ${brl(due)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
