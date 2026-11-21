import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import StockTabs, { useStockAccess } from '@/components/stock/StockTabs';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { fmtQty, partCategory, type PartCategory } from '@/lib/parts';
import { SETTLEMENTS, Sheet, type Settlement } from '@/components/stock/StockModals';

type PartRef = { name: string; code: string | null; unit: string; category: PartCategory } | null;
type Row = {
  id: string; from_workshop_id: string; to_workshop_id: string; qty: number; unit_price: number; total: number;
  settlement: Settlement; due_date: string | null; note: string | null; settled_at: string | null; settled_how: string | null; created_at: string;
  from_part: PartRef; to_part: PartRef;
  from_w: { business_name: string } | null; to_w: { business_name: string } | null;
};

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const PRESETS = [{ l: 'Hoje', d: 0 }, { l: '7 dias', d: 7 }, { l: '30 dias', d: 30 }, { l: '90 dias', d: 90 }, { l: '1 ano', d: 365 }];
const HOWS = ['PIX', 'Transferência bancária', 'Dinheiro do caixa', 'Peça devolvida', 'Outro'];
const fmtD = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');

type Sum = { items: number; units: number; value: number };
function SumCard({ title, tone, s, hint }: { title: string; tone: string; s: Sum; hint?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-steel-500">{title}</div>
      <div className="text-2xl font-bold mt-1">{fmtBRL(s.value)}</div>
      <div className="text-xs text-steel-500 mt-0.5">{hint ?? `${fmtQty(s.units)} unidade(s) · ${s.items} peça(s) diferentes`}</div>
    </div>
  );
}

/** Edita forma de acerto, preço, vencimento e observação de uma transferência (estoque e quantidade não mudam) */
function EditTransferModal({ row, partName, unit, storeName, isOut, onClose, onSaved }: {
  row: Row; partName: string; unit: string; storeName: string; isOut: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [how, setHow] = useState<Settlement>(row.settlement);
  const [price, setPrice] = useState(moneyInput(Number(row.unit_price)));
  const [due, setDue] = useState(row.due_date ?? iso(new Date(Date.now() + 30 * 86400000)));
  const [note, setNote] = useState(row.note ?? '');
  const [saving, setSaving] = useState(false);
  const locked = row.settlement === 'conta_a_pagar' && !!row.settled_at;
  const unitPrice = parseMoney(price || '0');
  const total = Math.round((Number.isFinite(unitPrice) ? unitPrice : 0) * Number(row.qty) * 100) / 100;
  const valid = Number.isFinite(unitPrice) && unitPrice >= 0 && (how !== 'conta_a_pagar' || !!due);
  const cfg = SETTLEMENTS.find(x => x.value === how)!;

  async function save() {
    if (!valid) return toast.error('Confira o preço e o vencimento');
    setSaving(true);
    const { error } = await supabase.rpc('stock_transfer_update', {
      p_id: row.id, p_settlement: how, p_unit_price: unitPrice, p_due: how === 'conta_a_pagar' ? due : null, p_note: note,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Transferência atualizada ✓');
    onSaved();
  }

  return (
    <Sheet title="Editar transferência" onClose={onClose}
      footer={<>
        <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving || !valid || locked}>{saving ? 'Salvando…' : 'Salvar'}</button>
      </>}>
      <div>
        <div className="text-sm font-semibold">{partName}</div>
        <div className="text-xs text-steel-500">{fmtQty(row.qty)} {unit} {isOut ? 'enviada(s) para' : 'recebida(s) de'} {storeName} · {fmtD(row.created_at)}</div>
      </div>
      {locked && (
        <div className="rounded-xl bg-pending-50 border border-pending-100 px-3 py-2 text-xs text-pending-800">
          Esta transferência já foi paga em Contas a pagar. Desfaça o pagamento lá para poder editar.
        </div>
      )}
      <fieldset disabled={locked} className="space-y-4 disabled:opacity-60">
        <div>
          <label className="label">Como a outra loja paga?</label>
          <div className="grid grid-cols-2 gap-2">
            {SETTLEMENTS.map(x => (
              <button key={x.value} type="button" onClick={() => setHow(x.value)}
                className={`text-left rounded-xl border px-3 py-2 transition ${how === x.value ? 'border-steel-900 bg-steel-50 ring-1 ring-steel-900' : 'border-steel-200 bg-white'}`}>
                <div className="text-sm font-semibold">{x.icon} {x.label}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-steel-500 mt-1.5">{cfg.hint}</p>
        </div>
        {how !== 'sem_cobranca' && (
          <div>
            <label className="label">Preço do repasse (por {unit})</label>
            <input className="input text-right" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
            <div className="rounded-xl bg-steel-50 border border-steel-100 px-3 py-2 text-sm flex justify-between mt-2">
              <span className="text-steel-600">{fmtQty(row.qty)} × {fmtBRL(Number.isFinite(unitPrice) ? unitPrice : 0)}</span><strong>{fmtBRL(total)}</strong>
            </div>
          </div>
        )}
        {how === 'conta_a_pagar' && (
          <div>
            <label className="label">Vencimento</label>
            <input type="date" className="input !w-auto" value={due} onChange={e => setDue(e.target.value)} />
          </div>
        )}
        <div>
          <label className="label">Observação</label>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: pedido do balcão da outra loja" />
        </div>
      </fieldset>
      <p className="text-[11px] text-steel-400">Aqui só muda a parte financeira. O estoque e a quantidade não mudam: para corrigir a quantidade, faça uma transferência de volta.</p>
    </Sheet>
  );
}

/** Relatório das transferências de peças entre as lojas: enviadas, recebidas, o que está em aberto e o acerto */
export default function TransferenciasEstoque() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const access = useStockAccess();
  const [from, setFrom] = useState(() => iso(new Date(Date.now() - 30 * 86400000)));
  const [to, setTo] = useState(() => iso(new Date()));
  const [dir, setDir] = useState<'todas' | 'out' | 'in'>('todas');
  const [state, setState] = useState<'todas' | 'abertas' | 'acertadas'>('todas');
  const [store, setStore] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [how, setHow] = useState(HOWS[0]);
  const [howDate, setHowDate] = useState(() => iso(new Date()));
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const load = useCallback(() => {
    if (!wid) return;
    setRows(null);
    supabase.from('stock_transfers')
      .select(`id, from_workshop_id, to_workshop_id, qty, unit_price, total, settlement, due_date, note, settled_at, settled_how, created_at,
        from_part:workshop_parts!stock_transfers_from_part_id_fkey(name, code, unit, category),
        to_part:workshop_parts!stock_transfers_to_part_id_fkey(name, code, unit, category),
        from_w:workshops!stock_transfers_from_workshop_id_fkey(business_name),
        to_w:workshops!stock_transfers_to_workshop_id_fkey(business_name)`)
      .or(`from_workshop_id.eq.${wid},to_workshop_id.eq.${wid}`)
      .gte('created_at', new Date(`${from}T00:00:00`).toISOString()).lte('created_at', new Date(`${to}T23:59:59`).toISOString())
      .order('created_at', { ascending: false }).limit(2000)
      .then(({ data, error }) => { if (error) toast.error('Não foi possível carregar: ' + error.message); setRows((data as never) ?? []); setPicked(new Set()); });
  }, [wid, from, to]);
  useEffect(load, [load]);

  const isOut = (r: Row) => r.from_workshop_id === wid;
  const otherName = (r: Row) => (isOut(r) ? r.to_w?.business_name : r.from_w?.business_name) ?? 'Outra loja';
  const partOf = (r: Row) => (isOut(r) ? r.from_part : r.to_part) ?? r.from_part ?? r.to_part;
  const isOpen = (r: Row) => !r.settled_at && r.settlement !== 'sem_cobranca';
  const priced = (r: Row) => r.settlement !== 'sem_cobranca';
  const howLabel = (r: Row) => SETTLEMENTS.find(s => s.value === r.settlement)!;

  const stores = useMemo(() => [...new Set((rows ?? []).map(otherName))].sort(), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(r => (dir === 'todas' || (dir === 'out') === isOut(r)) && (!store || otherName(r) === store)
      && (state === 'todas' || (state === 'abertas') === isOpen(r))
      && (!t || partOf(r)?.name.toLowerCase().includes(t) || partOf(r)?.code?.toLowerCase().includes(t)));
  }, [rows, dir, store, q, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const sum = (l: Row[], valueOf: (r: Row) => number): Sum => ({
    items: new Set(l.map(r => partOf(r)?.name)).size, units: l.reduce((a, r) => a + Number(r.qty), 0), value: l.reduce((a, r) => a + valueOf(r), 0),
  });
  const sent = sum(list.filter(isOut), r => Number(r.total)), got = sum(list.filter(r => !isOut(r)), r => Number(r.total));
  const toReceive = sum(list.filter(r => isOut(r) && isOpen(r)), r => Number(r.total));
  const toPay = sum(list.filter(r => !isOut(r) && isOpen(r)), r => Number(r.total));

  const byStore = useMemo(() => {
    const m = new Map<string, { sent: number; got: number; recv: number; pay: number }>();
    for (const r of list) {
      const c = m.get(otherName(r)) ?? { sent: 0, got: 0, recv: 0, pay: 0 };
      const v = Number(r.total);
      if (isOut(r)) { c.sent += v; if (isOpen(r)) c.recv += v; } else { c.got += v; if (isOpen(r)) c.pay += v; }
      m.set(otherName(r), c);
    }
    return [...m.entries()];
  }, [list]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickable = (r: Row) => isOpen(r) && (r.settlement === 'conta_corrente' || r.settlement === 'troca');
  const pickedRows = list.filter(r => picked.has(r.id));
  const pickedNet = pickedRows.reduce((a, r) => a + (isOut(r) ? 1 : -1) * Number(r.total), 0);
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function settle() {
    setBusy(true);
    const { error } = await supabase.rpc('stock_transfer_settle', { p_ids: [...picked], p_how: how, p_date: howDate });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Acerto registrado ✓');
    load();
  }
  async function unsettle(id: string) {
    if (!confirm('Desfazer este acerto? A transferência volta para “em aberto”.')) return;
    const { error } = await supabase.rpc('stock_transfer_unsettle', { p_ids: [id] });
    if (error) return toast.error(error.message);
    load();
  }

  function status(r: Row) {
    if (r.settlement === 'sem_cobranca') return { text: 'Sem cobrança', cls: 'bg-steel-100 text-steel-600' };
    if (r.settled_at) return { text: r.settlement === 'conta_a_pagar' ? 'Paga' : r.settlement === 'troca' ? 'Devolvida' : 'Acertada', cls: 'bg-signal-50 text-signal-700' };
    if (r.settlement === 'conta_a_pagar' && r.due_date) {
      const late = r.due_date < iso(new Date());
      return { text: `${late ? 'Venceu' : 'Vence'} ${fmtD(r.due_date)}`, cls: late ? 'bg-alert-50 text-alert-700' : 'bg-pending-50 text-pending-800' };
    }
    return { text: r.settlement === 'troca' ? 'Aguardando peça' : 'Em aberto', cls: 'bg-pending-50 text-pending-800' };
  }

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const num = (n: number) => Number(n).toFixed(2).replace('.', ',');
    const head = ['Data', 'Hora', 'Movimento', 'Loja', 'Código', 'Peça', 'Categoria', 'Quantidade', 'Preço unitário', 'Valor', 'Forma de acerto', 'Situação', 'Acertada em', 'Como', 'Observação'];
    const lines = list.map(r => {
      const d = new Date(r.created_at), p = partOf(r);
      return [d.toLocaleDateString('pt-BR'), d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        isOut(r) ? 'Enviada' : 'Recebida', otherName(r), p?.code ?? '', p?.name ?? '', p ? partCategory(p.category).label : '',
        String(r.qty).replace('.', ','), num(r.unit_price), num(r.total), howLabel(r).label, status(r).text,
        r.settled_at ? fmtD(r.settled_at) : '', r.settled_how ?? '', r.note ?? ''].map(esc).join(';');
    });
    const blob = new Blob(['﻿' + [head.map(esc).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `transferencias-${from}-a-${to}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  }

  const preset = (d: number) => { setFrom(iso(new Date(Date.now() - d * 86400000))); setTo(iso(new Date())); };
  const activePreset = PRESETS.find(p => to === iso(new Date()) && from === iso(new Date(Date.now() - p.d * 86400000)))?.d;

  if (!access.pecas) return <WorkshopLayout><div className="max-w-md mx-auto card text-center py-12 text-sm text-steel-500">Pede a permissão “Peças e estoque”.</div></WorkshopLayout>;

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-4 pb-24">
        <StockTabs title="Transferências entre lojas" subtitle={`O que ${currentWorkshop?.business_name ?? 'esta loja'} enviou e recebeu das outras lojas, e o que falta acertar.`}
          actions={<>
            <Link to="/oficina/pecas" className="btn-ghost border border-steel-200 text-sm !py-2">← Peças</Link>
            <button className="btn-primary text-sm !py-2" onClick={exportCsv} disabled={!list.length}>⬇ Baixar planilha</button>
          </>} />

        {/* Período e filtros */}
        <div className="card space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map(p => (
              <button key={p.d} onClick={() => preset(p.d)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${activePreset === p.d ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>{p.l}</button>
            ))}
            <span className="flex items-center gap-1.5 text-xs text-steel-500 sm:ml-auto">
              de <input type="date" className="input !py-1.5 !w-auto text-sm" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} />
              até <input type="date" className="input !py-1.5 !w-auto text-sm" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} />
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input className="input flex-1" placeholder="🔍 Buscar peça ou código" value={q} onChange={e => setQ(e.target.value)} />
            <select className="input !py-2 sm:!w-auto text-sm" value={dir} onChange={e => setDir(e.target.value as typeof dir)}>
              <option value="todas">Enviadas e recebidas</option>
              <option value="out">Só enviadas</option>
              <option value="in">Só recebidas</option>
            </select>
            <select className="input !py-2 sm:!w-auto text-sm" value={state} onChange={e => setState(e.target.value as typeof state)}>
              <option value="todas">Todas as situações</option>
              <option value="abertas">Só em aberto</option>
              <option value="acertadas">Só acertadas</option>
            </select>
            {stores.length > 1 && (
              <select className="input !py-2 sm:!w-auto text-sm" value={store} onChange={e => setStore(e.target.value)}>
                <option value="">Todas as lojas</option>
                {stores.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </div>
        </div>

        {rows === null ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <SumCard title="Enviadas" tone="bg-white border-steel-200" s={sent} />
              <SumCard title="Recebidas" tone="bg-white border-steel-200" s={got} />
              <SumCard title="A receber" tone="bg-signal-50/60 border-signal-100" s={toReceive} hint={`${toReceive.items} peça(s) enviadas ainda sem acerto`} />
              <SumCard title="A pagar" tone="bg-alert-50/60 border-alert-100" s={toPay} hint={`${toPay.items} peça(s) recebidas ainda sem acerto`} />
            </div>

            {byStore.length > 0 && (
              <div className="card !p-0 overflow-hidden">
                <div className="px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">Por loja</div>
                <ul className="divide-y divide-steel-100 text-sm">
                  {byStore.map(([name, v]) => {
                    const net = v.recv - v.pay;
                    return (
                      <li key={name} className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <strong>{name}</strong>
                        <span className="text-steel-600 text-xs sm:text-sm">enviou {fmtBRL(v.sent)} · recebeu {fmtBRL(v.got)}</span>
                        <span className={`font-semibold ${net > 0 ? 'text-signal-700' : net < 0 ? 'text-alert-600' : 'text-steel-400'}`}>
                          {net > 0 ? `${name} deve ${fmtBRL(net)}` : net < 0 ? `Deve ${fmtBRL(-net)} para ${name}` : 'Nada em aberto'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {list.length === 0 ? (
              <div className="card text-center py-10 text-sm text-steel-500">Nenhuma transferência neste período.</div>
            ) : (
              <div className="card !p-0 overflow-hidden">
                <div className="hidden md:grid grid-cols-[28px_100px_minmax(0,1fr)_100px_130px_80px_100px_150px] gap-3 px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">
                  <div /><div>Data</div><div>Peça</div><div>Movimento</div><div>Loja</div><div className="text-right">Qtd.</div><div className="text-right">Valor</div><div>Acerto</div>
                </div>
                <ul className="divide-y divide-steel-100">
                  {list.map(r => {
                    const out = isOut(r), d = new Date(r.created_at), p = partOf(r), st = status(r), hw = howLabel(r);
                    return (
                      <li key={r.id} className={`grid grid-cols-[28px_1fr] md:grid-cols-[28px_100px_minmax(0,1fr)_100px_130px_80px_100px_150px] gap-x-3 gap-y-1 px-5 py-2.5 items-center text-sm ${picked.has(r.id) ? 'bg-signal-50/40' : ''}`}>
                        <div>{pickable(r) && <input type="checkbox" className="h-4 w-4" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label="Selecionar para o acerto" />}</div>
                        <div className="text-xs text-steel-500">{d.toLocaleDateString('pt-BR')}<span className="text-steel-400"> {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></div>
                        <div className="col-start-2 md:col-start-auto min-w-0">
                          <div className="font-semibold truncate">{p?.name ?? 'Peça removida'}</div>
                          <div className="text-[11px] text-steel-500 truncate">{[p?.code, p && partCategory(p.category).label, r.note].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div className="col-start-2 md:col-start-auto"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${out ? 'bg-alert-50 text-alert-700' : 'bg-signal-50 text-signal-700'}`}>{out ? '↑ Enviada' : '↓ Recebida'}</span></div>
                        <div className="col-start-2 md:col-start-auto text-steel-600 truncate">{out ? 'para ' : 'de '}{otherName(r)}</div>
                        <div className={`col-start-2 md:col-start-auto md:text-right font-semibold ${out ? 'text-alert-600' : 'text-signal-700'}`}>{out ? '−' : '+'}{fmtQty(r.qty)} {p?.unit}</div>
                        <div className="col-start-2 md:col-start-auto md:text-right text-steel-700">{priced(r) ? fmtBRL(Number(r.total)) : <span className="text-steel-300">—</span>}</div>
                        <div className="col-start-2 md:col-start-auto min-w-0">
                          <div className="text-xs text-steel-500">{hw.icon} {hw.label}</div>
                          <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.text}</span>
                          <button onClick={() => setEditing(r)} className="ml-1.5 text-[11px] font-semibold text-brand-700 hover:underline">✏️ editar</button>
                          {r.settled_at && (r.settlement === 'conta_corrente' || r.settlement === 'troca') && (
                            <button onClick={() => unsettle(r.id)} className="ml-1.5 text-[11px] text-steel-400 hover:text-alert-600 underline">desfazer</button>
                          )}
                          {r.settled_at && r.settlement !== 'sem_cobranca' && <div className="text-[11px] text-steel-400 truncate">{fmtD(r.settled_at)}{r.settled_how ? ` · ${r.settled_how}` : ''}</div>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {editing && (
        <EditTransferModal row={editing} partName={partOf(editing)?.name ?? 'Peça'} unit={partOf(editing)?.unit ?? 'un'}
          storeName={otherName(editing)} isOut={isOut(editing)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}

      {/* Acerto (aparece ao marcar transferências em aberto) */}
      {picked.size > 0 && (
        <div className="fixed bottom-[60px] lg:bottom-0 inset-x-0 lg:left-64 z-30 border-t border-steel-200 bg-white/95 backdrop-blur px-4 py-3">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <strong>{picked.size}</strong> selecionada{picked.size === 1 ? '' : 's'} ·{' '}
              {Math.abs(pickedNet) < 0.005 ? <strong>troca equilibrada</strong>
                : pickedNet > 0 ? <>a loja da frente deve <strong className="text-signal-700">{fmtBRL(pickedNet)}</strong></> : <>você deve <strong className="text-alert-600">{fmtBRL(-pickedNet)}</strong></>}
              <span className="block text-[11px] text-steel-400">Enviadas e recebidas se compensam: só a diferença precisa ser paga.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input !py-2 !w-auto text-sm" value={how} onChange={e => setHow(e.target.value)}>{HOWS.map(h => <option key={h}>{h}</option>)}</select>
              <input type="date" className="input !py-2 !w-auto text-sm" value={howDate} onChange={e => e.target.value && setHowDate(e.target.value)} />
              <button className="btn-ghost text-sm" onClick={() => setPicked(new Set())} disabled={busy}>Limpar</button>
              <button className="btn-primary" onClick={settle} disabled={busy}>{busy ? 'Salvando…' : 'Registrar acerto'}</button>
            </div>
          </div>
        </div>
      )}
    </WorkshopLayout>
  );
}
