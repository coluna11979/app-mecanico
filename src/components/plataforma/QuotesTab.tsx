import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import { brl, moneyStr, parseMoney } from '@/lib/cash';
import { jobDraftKey, jobDraftOriginKey, markPlatformItems } from '@/lib/callMechanic';
import { catalogLabel, loadCatalog, type CatalogItem } from './CatalogTab';

/**
 * 🧾 Orçamentos (Meus cadastros do módulo Plataforma).
 * Um orçamento é uma OS em "aguardando aprovação" (o mesmo formato do módulo OS): ligar o módulo OS
 * depois mostra esses orçamentos lá. Parado ou aprovado não mexe em estoque, caixa nem comissão
 * (isso só acontece quando uma OS é concluída e paga). Aprovado → "Chamar mecânico" vira demanda.
 */
export type QuoteCustomer = {
  id: string; full_name: string; phone: string | null;
  vehicles: { id: string; make: string; model: string; year: number | null; plate: string; color: string | null }[];
};
type QuoteItem = {
  id: string; kind: 'labor' | 'part'; description: string; quantity: number; unit_price: number;
  stacked_at: string | null; platform_job_id: string | null;
};
type Quote = {
  id: string; number: number | null; title: string; status: string; quote_status: string | null; price: number; created_at: string;
  customer_id: string | null; vehicle_id: string | null; items: QuoteItem[];
};
/** Linha do orçamento sendo montado */
type Line = { key: string; kind: 'labor' | 'part'; description: string; qty: string; price: string; partId?: string; cost?: number };

const QUOTE_STATUSES = ['awaiting_approval', 'approved', 'cancelled'];
const num = (n: number | null, id: string) => (n != null ? String(n).padStart(4, '0') : id.slice(0, 6));
const onlyDigits = (s: string) => s.replace(/\D/g, '');
const carText = (v: QuoteCustomer['vehicles'][number]) => [[v.make, v.model, v.year].filter(Boolean).join(' '), v.plate].filter(Boolean).join(' · ');

function statusOf(q: Quote): { label: string; cls: string } {
  if (q.quote_status === 'declined') return { label: 'Não aprovado', cls: 'bg-steel-100 text-steel-600' };
  if (q.status === 'approved') return { label: 'Aprovado', cls: 'bg-signal-50 text-signal-700' };
  if (q.status === 'awaiting_approval') return { label: 'Aguardando cliente', cls: 'bg-pending-50 text-pending-700' };
  return { label: 'Encerrado', cls: 'bg-steel-100 text-steel-600' };
}

export default function QuotesTab({ wid, customers, startWith, onStarted }: {
  wid: string; customers: QuoteCustomer[];
  /** Veio da ficha do cliente: abre um orçamento novo já com ele (e o carro) */
  startWith: { customerId: string; vehicleId: string | null } | null;
  onStarted: () => void;
}) {
  const [list, setList] = useState<Quote[] | null>(null);
  const [editor, setEditor] = useState<{ customerId: string | null; vehicleId: string | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase.from('service_orders')
      .select('id, number, title, status, quote_status, price, created_at, customer_id, vehicle_id, items:service_order_items(id, kind, description, quantity, unit_price, stacked_at, platform_job_id)')
      .eq('workshop_id', wid).in('status', QUOTE_STATUSES).order('created_at', { ascending: false }).limit(200);
    if (error) { toast.error('Não foi possível carregar os orçamentos: ' + error.message); return; }
    // "cancelled" só conta como orçamento quando foi recusado pelo cliente
    setList(((data ?? []) as Quote[]).filter(q => q.status !== 'cancelled' || q.quote_status === 'declined'));
  }
  useEffect(() => { load(); }, [wid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!startWith) return;
    setEditor(startWith);
    onStarted();
  }, [startWith]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);
  const current = list?.find(q => q.id === openId) ?? null;

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setEditor({ customerId: null, vehicleId: null })}
        className="w-full h-12 rounded-xl bg-brand-500 text-white text-sm font-bold active:scale-[0.99]">＋ Novo orçamento</button>

      {list != null && list.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-steel-200/70 text-center px-5 py-8">
          <div className="text-3xl" aria-hidden>🧾</div>
          <div className="font-semibold text-steel-900 mt-2">Nenhum orçamento ainda</div>
          <p className="text-sm text-steel-600 mt-1">Monte com os serviços e peças salvos, mande pelo WhatsApp e, aprovado, chame o mecânico num toque.</p>
        </div>
      ) : (
        <ul className="rounded-2xl bg-white ring-1 ring-steel-200/70 divide-y divide-steel-100 overflow-hidden">
          {(list ?? []).map(q => {
            const c = q.customer_id ? byId.get(q.customer_id) : null;
            const v = c?.vehicles.find(x => x.id === q.vehicle_id);
            const st = statusOf(q);
            return (
              <li key={q.id}>
                <button type="button" onClick={() => setOpenId(q.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-steel-50 min-h-[60px]">
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-steel-900 truncate">{c?.full_name ?? 'Sem cliente'}{v ? ` · ${v.model}` : ''}</span>
                    <span className="block text-xs text-steel-600 truncate">nº {num(q.number, q.id)} · {new Date(q.created_at).toLocaleDateString('pt-BR')} · {q.title}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-bold text-steel-900">{brl(Number(q.price))}</span>
                    <span className={`inline-block mt-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    {q.items.some(i => i.kind === 'labor' && i.stacked_at && !i.platform_job_id) && (
                      <span className="block text-[11px] font-semibold text-brand-700 mt-0.5">📚 Empilhado</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editor && (
        <QuoteEditor wid={wid} customers={customers} initial={editor}
          onClose={() => setEditor(null)} onSaved={id => { setEditor(null); load().then(() => setOpenId(id)); }} />
      )}
      {current && !editor && (
        <QuoteSheet wid={wid} q={current} customer={current.customer_id ? byId.get(current.customer_id) ?? null : null}
          onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  );
}

/** Orçamento aberto: enviar no WhatsApp, aprovado / não aprovado e chamar o mecânico */
function QuoteSheet({ wid, q, customer, onClose, onChanged }: {
  wid: string; q: Quote; customer: QuoteCustomer | null; onClose: () => void; onChanged: () => void;
}) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const car = customer?.vehicles.find(v => v.id === q.vehicle_id) ?? null;
  const st = statusOf(q);
  const items = [...q.items].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'labor' ? -1 : 1));
  const labor = items.filter(i => i.kind === 'labor');
  const phone = onlyDigits(customer?.phone ?? '');
  /** Serviços que ainda não foram para uma demanda */
  const free = labor.filter(i => !i.platform_job_id);
  const stacked = free.length > 0 && free.every(i => i.stacked_at);

  /** Guarda os serviços nos Empilhados (Demandas): juntar com outros e chamar um mecânico só depois */
  async function stack() {
    if (!free.length) return toast.error('O orçamento não tem serviço (mão de obra) para empilhar.');
    setBusy(true);
    const { error } = await markPlatformItems(wid, [q.id], free.map(i => i.id), { stack: true });
    setBusy(false);
    if (error) return toast.error('Não foi possível empilhar: ' + error.message);
    toast.success(`${free.length === 1 ? 'Serviço empilhado' : `${free.length} serviços empilhados`} 📚 — veja em Demandas › Empilhados`);
    onChanged();
  }

  function whatsappText() {
    const first = customer?.full_name.trim().split(/\s+/)[0];
    return [
      `Olá${first ? `, ${first}` : ''}! Segue o orçamento${car ? ` do ${[car.make, car.model].filter(Boolean).join(' ')}` : ''}:`,
      '',
      ...items.map(i => `• ${Number(i.quantity) !== 1 ? `${String(Number(i.quantity)).replace('.', ',')}x ` : ''}${i.description} — ${brl(Number(i.quantity) * Number(i.unit_price))}`),
      '',
      `*Total: ${brl(Number(q.price))}*`,
      '',
      'Posso seguir com o serviço?',
    ].join('\n');
  }

  async function setStatus(approved: boolean) {
    setBusy(true);
    const patch = approved
      ? { status: 'approved', approved_at: new Date().toISOString(), approval_channel: 'whatsapp', quote_status: null }
      : { status: 'cancelled', quote_status: 'declined' };
    const { error } = await supabase.from('service_orders').update(patch).eq('id', q.id).eq('workshop_id', wid);
    setBusy(false);
    if (error) return toast.error('Não foi possível atualizar: ' + error.message);
    toast.success(approved ? 'Orçamento aprovado ✅' : 'Marcado como não aprovado');
    onChanged();
  }

  /** Nova demanda com os serviços do orçamento (o mecânico não vê o nome do cliente) */
  function callMechanic() {
    if (!labor.length) return toast.error('O orçamento não tem serviço (mão de obra) para o mecânico fazer.');
    const model = car ? [car.make, car.model].filter(Boolean).join(' ') : '';
    const title = (labor.length === 1 ? labor[0].description : `${labor[0].description} + ${labor.length - 1} serviço(s)`) + (model ? ` — ${car!.model}` : '');
    const description = [
      'Serviços a realizar:',
      ...labor.map(i => `• ${i.description}${Number(i.quantity) > 1 ? ` (${Number(i.quantity)}x)` : ''}`),
      '',
      car ? `Veículo: ${carText(car)}` : '',
      `Referência: Orçamento nº ${num(q.number, q.id)}`,
    ].filter(l => l !== '').join('\n');
    localStorage.setItem(jobDraftKey(wid), JSON.stringify({
      title: title.slice(0, 120), description, price_per_hour: '', max_hours: '', scheduled_at: '', pricing: 'fixed', total: '',
      service_order_id: q.id, service_order_item_ids: labor.map(i => i.id),
      customer_charge: moneyStr(Number(q.price)), customer_id: q.customer_id, vehicle_id: q.vehicle_id,
    }));
    localStorage.setItem(jobDraftOriginKey(wid), `Orçamento nº ${num(q.number, q.id)}`);
    nav('/oficina/dashboard?nova=os');
  }

  return (
    <div className="fixed inset-0 z-[60] bg-steel-900/70 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && onClose()}>
      <div onClick={e => e.stopPropagation()} className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-steel-500">Orçamento nº {num(q.number, q.id)} · {new Date(q.created_at).toLocaleDateString('pt-BR')}</div>
            <h2 className="text-lg font-bold text-steel-900 break-words">{customer?.full_name ?? 'Sem cliente'}</h2>
            {car && <div className="text-sm text-steel-600">🚗 {carText(car)}</div>}
          </div>
          <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
        </div>

        <ul className="rounded-xl ring-1 ring-steel-200 divide-y divide-steel-100">
          {items.map(i => (
            <li key={i.id} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="text-steel-500 mr-1">{i.kind === 'labor' ? '🔧' : '📦'}</span>
                {Number(i.quantity) !== 1 && <span className="text-steel-500">{String(Number(i.quantity)).replace('.', ',')}x </span>}
                <span className="text-steel-900">{i.description}</span>
              </span>
              <span className="shrink-0 font-semibold">{brl(Number(i.quantity) * Number(i.unit_price))}</span>
            </li>
          ))}
          <li className="px-3 py-2.5 flex justify-between font-bold text-steel-900"><span>Total</span><span>{brl(Number(q.price))}</span></li>
        </ul>

        <div className="space-y-2">
          {phone.length >= 10 ? (
            <a href={`https://wa.me/55${phone}?text=${encodeURIComponent(whatsappText())}`} target="_blank" rel="noreferrer"
              className="w-full h-12 rounded-xl bg-signal-500 text-white text-sm font-bold grid place-items-center">💬 Enviar no WhatsApp</a>
          ) : (
            <button type="button" onClick={() => { navigator.clipboard?.writeText(whatsappText()); toast.success('Orçamento copiado: cole na conversa'); }}
              className="w-full h-12 rounded-xl border border-signal-300 text-signal-700 text-sm font-bold">📋 Copiar texto do orçamento</button>
          )}
          {q.status === 'awaiting_approval' && (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={busy} onClick={() => setStatus(true)} className="h-11 rounded-xl border-2 border-signal-500 text-signal-700 text-sm font-bold">✅ Aprovado</button>
              <button type="button" disabled={busy} onClick={() => setStatus(false)} className="h-11 rounded-xl border border-steel-200 text-steel-700 text-sm font-bold">✕ Não aprovado</button>
            </div>
          )}
          {q.status !== 'cancelled' && free.length > 0 && (
            <div className="grid grid-cols-[1fr_1.4fr] gap-2">
              <button type="button" disabled={busy || stacked} onClick={stack}
                className="h-12 rounded-xl border-2 border-brand-300 text-brand-700 text-sm font-bold disabled:opacity-60">
                {stacked ? '📚 Empilhado' : '📚 Empilhar'}
              </button>
              <button type="button" disabled={busy} onClick={callMechanic}
                className="h-12 rounded-xl bg-brand-500 text-white text-sm font-bold">⚡ Chamar mecânico</button>
            </div>
          )}
          {stacked && <p className="text-xs text-steel-500 text-center">Está nos Empilhados (Demandas): junte com outros e chame um mecânico só.</p>}
          <button type="button" onClick={onClose} className="w-full h-10 text-sm font-semibold text-steel-600">Fechar</button>
        </div>
      </div>
    </div>
  );
}

/** Montar o orçamento: cliente/carro, toque nos serviços e peças salvos (ou digite um item) e o total soma */
function QuoteEditor({ wid, customers, initial, onClose, onSaved }: {
  wid: string; customers: QuoteCustomer[]; initial: { customerId: string | null; vehicleId: string | null };
  onClose: () => void; onSaved: (id: string) => void;
}) {
  const [customerId, setCustomerId] = useState(initial.customerId ?? '');
  const [vehicleId, setVehicleId] = useState(initial.vehicleId ?? '');
  const [services, setServices] = useState<CatalogItem[]>([]);
  const [parts, setParts] = useState<CatalogItem[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState<'labor' | 'part'>('labor');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadCatalog(wid, 'service').then(setServices);
    loadCatalog(wid, 'part').then(setParts);
  }, [wid]);

  const customer = customers.find(c => c.id === customerId) ?? null;
  useEffect(() => {
    // Trocou o cliente: um carro só já vem escolhido
    if (customer && !customer.vehicles.some(v => v.id === vehicleId)) setVehicleId(customer.vehicles.length === 1 ? customer.vehicles[0].id : '');
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const catalog = (pick === 'labor' ? services : parts).filter(i => !q.trim() || catalogLabel(i).toLowerCase().includes(q.trim().toLowerCase()));
  const total = lines.reduce((a, l) => a + (parseMoney(l.qty || '0') * parseMoney(l.price || '0')), 0);
  const upd = (key: string, patch: Partial<Line>) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));

  function add(i: CatalogItem | null) {
    setLines(ls => [...ls, {
      key: Math.random().toString(36).slice(2), kind: pick, description: i ? catalogLabel(i) : q.trim(),
      qty: '1', price: i && i.price > 0 ? moneyStr(i.price) : '',
      ...(pick === 'part' && i ? { partId: i.id, cost: i.cost } : {}),
    }]);
    setQ('');
  }

  async function save() {
    const valid = lines.filter(l => l.description.trim());
    if (!valid.length) return toast.error('Adicione pelo menos um serviço ou peça');
    if (valid.some(l => !(parseMoney(l.qty || '0') > 0))) return toast.error('Quantidade inválida');
    setBusy(true);
    const labor = valid.filter(l => l.kind === 'labor');
    const title = (labor[0] ?? valid[0]).description.trim() + (valid.length > 1 ? ` + ${valid.length - 1}` : '');
    const { data: os, error } = await supabase.from('service_orders').insert({
      workshop_id: wid, customer_id: customerId || null, vehicle_id: vehicleId || null,
      title: title.slice(0, 120), status: 'awaiting_approval', approval_requested_at: new Date().toISOString(), price: 0,
    }).select('id').single();
    if (error || !os) { setBusy(false); return toast.error('Não foi possível salvar: ' + (error?.message ?? '')); }
    const { error: itErr } = await supabase.from('service_order_items').insert(valid.map((l, i) => ({
      service_order_id: os.id, workshop_id: wid, kind: l.kind, description: l.description.trim(),
      quantity: parseMoney(l.qty), unit_price: parseMoney(l.price || '0'), position: i,
      ...(l.partId ? { part_id: l.partId, unit_cost: l.cost ?? null } : {}),
    })));
    setBusy(false);
    if (itErr) return toast.error('Orçamento criado, mas os itens não: ' + itErr.message);
    toast.success('Orçamento salvo');
    onSaved(os.id);
  }

  return (
    <div className="fixed inset-0 z-[60] bg-steel-900/70 flex items-end sm:items-center justify-center sm:p-4" onClick={() => !busy && onClose()}>
      <div onClick={e => e.stopPropagation()} className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[94vh] flex flex-col">
        <div className="p-5 pb-3 space-y-3 overflow-y-auto">
          <h2 className="text-lg font-bold text-steel-900">Novo orçamento</h2>

          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={customerId} onChange={e => setCustomerId(e.target.value)}>
              <option value="">Sem cliente</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            <select className="input" value={vehicleId} onChange={e => setVehicleId(e.target.value)} disabled={!customer?.vehicles.length}>
              <option value="">{customer?.vehicles.length ? 'Escolha o carro' : 'Sem carro'}</option>
              {customer?.vehicles.map(v => <option key={v.id} value={v.id}>{[v.model, v.plate].filter(Boolean).join(' · ')}</option>)}
            </select>
          </div>

          {/* Itens do orçamento */}
          {lines.length > 0 && (
            <ul className="space-y-2">
              {lines.map(l => (
                <li key={l.key} className="rounded-xl ring-1 ring-steel-200 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0" aria-hidden>{l.kind === 'labor' ? '🔧' : '📦'}</span>
                    <input className="input !py-1.5 text-sm flex-1" value={l.description} onChange={e => upd(l.key, { description: e.target.value })} />
                    <button type="button" onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))} aria-label="Remover item"
                      className="h-9 w-9 shrink-0 rounded-lg text-steel-400 hover:text-alert-600">✕</button>
                  </div>
                  <div className="mt-2 grid grid-cols-[70px_1fr_auto] gap-2 items-center">
                    <input className="input !py-1.5 text-sm" inputMode="decimal" value={l.qty} onChange={e => upd(l.key, { qty: e.target.value })} aria-label="Quantidade" />
                    <input className="input !py-1.5 text-sm" inputMode="decimal" placeholder="Valor (R$)" value={l.price} onChange={e => upd(l.key, { price: e.target.value })} aria-label="Valor unitário" />
                    <span className="text-sm font-semibold text-steel-800 min-w-[80px] text-right">{brl(parseMoney(l.qty || '0') * parseMoney(l.price || '0'))}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Adicionar: serviços / peças salvos */}
          <div className="rounded-xl bg-steel-50 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-1 bg-white rounded-lg p-1 ring-1 ring-steel-200">
              {(['labor', 'part'] as const).map(k => (
                <button key={k} type="button" onClick={() => { setPick(k); setQ(''); }}
                  className={`h-9 rounded-md text-sm font-semibold ${pick === k ? 'bg-steel-900 text-white' : 'text-steel-600'}`}>
                  {k === 'labor' ? '🔧 Serviços' : '📦 Peças'}
                </button>
              ))}
            </div>
            <input className="input" type="search" placeholder={pick === 'labor' ? 'Buscar ou digitar um serviço' : 'Buscar ou digitar uma peça'} value={q} onChange={e => setQ(e.target.value)} />
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {catalog.slice(0, 30).map(i => (
                <button key={i.id} type="button" onClick={() => add(i)}
                  className="min-h-[36px] rounded-full border border-steel-200 bg-white px-3 text-xs font-semibold text-steel-800 hover:border-brand-300">
                  ＋ {catalogLabel(i)}{i.price > 0 ? ` · ${brl(i.price)}` : ''}
                </button>
              ))}
              {q.trim() && (
                <button type="button" onClick={() => add(null)}
                  className="min-h-[36px] rounded-full border border-dashed border-brand-300 bg-white px-3 text-xs font-semibold text-brand-700">＋ Adicionar "{q.trim()}"</button>
              )}
              {!catalog.length && !q.trim() && (
                <span className="text-xs text-steel-500">
                  {pick === 'labor' ? 'Nenhum serviço salvo: digite acima ou salve na aba Serviços.' : 'Nenhuma peça salva: digite acima ou salve na aba Peças.'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-steel-100 p-4 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-steel-500">Total</div>
            <div className="text-xl font-bold text-steel-900">{brl(total)}</div>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost">Cancelar</button>
          <button type="button" onClick={save} disabled={busy} className="btn-primary">{busy ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}
