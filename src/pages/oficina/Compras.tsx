import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fetchAll } from '@/lib/fetchAll';
import { fmtBRL } from '@/components/os/osHelpers';
import { fmtQty } from '@/lib/parts';
import { addDaysISO, fmtDate, todayISO, type Payable, type PurchaseInvoice, type PurchaseItem } from '@/lib/purchasing';
import StockTabs from '@/components/stock/StockTabs';
import { Restricted } from './Fornecedores';

type Row = PurchaseInvoice & {
  supplier: { name: string } | null;
  payables: Pick<Payable, 'paid_at' | 'cancelled_at' | 'due_date'>[];
  items: { count: number }[];
};

export type InvoiceStatus = 'paga' | 'aberto' | 'vencida' | 'estornada';

export const STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  paga:      { label: 'Paga',      cls: 'bg-signal-100 text-signal-700' },
  aberto:    { label: 'Em aberto', cls: 'bg-pending-100 text-pending-800' },
  vencida:   { label: 'Vencida',   cls: 'bg-alert-100 text-alert-700' },
  estornada: { label: 'Estornada', cls: 'bg-steel-100 text-steel-500' },
};

/** Situação da nota pelas parcelas dela (as mesmas de Contas a pagar) */
export function invoiceStatus(n: Pick<PurchaseInvoice, 'status'> & { payables: Pick<Payable, 'paid_at' | 'cancelled_at' | 'due_date'>[] }): InvoiceStatus {
  if (n.status === 'cancelled') return 'estornada';
  const open = n.payables.filter(p => !p.cancelled_at && !p.paid_at);
  if (!open.length) return 'paga';
  return open.some(p => p.due_date < todayISO()) ? 'vencida' : 'aberto';
}

type Period = 'mes' | '90' | 'ano' | 'tudo';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'mes', label: 'Este mês' }, { value: '90', label: 'Últimos 90 dias' }, { value: 'ano', label: 'Este ano' }, { value: 'tudo', label: 'Todo o período' },
];
const periodStart = (p: Period) => {
  const t = todayISO();
  return p === 'mes' ? `${t.slice(0, 7)}-01` : p === '90' ? addDaysISO(t, -90) : p === 'ano' ? `${t.slice(0, 4)}-01-01` : '';
};

export default function Compras() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'compras');
  const [params, setParams] = useSearchParams();
  const open = params.get('nota');

  const [list, setList] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [supplierF, setSupplierF] = useState(params.get('fornecedor') ?? '');
  const [period, setPeriod] = useState<Period>('tudo');
  const [statusF, setStatusF] = useState<InvoiceStatus | ''>('');

  const load = useCallback(async () => {
    if (!wid) return;
    const { data } = await fetchAll((a, b) => supabase.from('purchase_invoices')
      .select('*, supplier:suppliers(name), payables(paid_at, cancelled_at, due_date), items:purchase_items(count)')
      .eq('workshop_id', wid).order('id').range(a, b));
    setList((data as unknown as Row[]).sort((x, y) => y.issue_date.localeCompare(x.issue_date) || y.created_at.localeCompare(x.created_at)));
  }, [wid]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  const suppliers = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of list ?? []) m.set(n.supplier_id, n.supplier?.name ?? 'Fornecedor');
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [list]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const from = periodStart(period);
    return (list ?? []).filter(n => (!supplierF || n.supplier_id === supplierF) && (!from || n.issue_date >= from)
      && (!t || n.number?.toLowerCase().includes(t) || n.supplier?.name.toLowerCase().includes(t) || n.notes?.toLowerCase().includes(t)));
  }, [list, q, supplierF, period]);

  const byStatus = useMemo(() => {
    const c: Record<InvoiceStatus, number> = { paga: 0, aberto: 0, vencida: 0, estornada: 0 };
    for (const n of filtered) c[invoiceStatus(n)]++;
    return c;
  }, [filtered]);

  const shown = statusF ? filtered.filter(n => invoiceStatus(n) === statusF) : filtered;
  const total = shown.filter(n => n.status === 'posted').reduce((s, n) => s + Number(n.total), 0);

  if (!allowed) return <Restricted />;

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-4">
        <StockTabs title="Compras" subtitle="Cada nota lançada coloca as peças no estoque e as parcelas nas contas a pagar."
          actions={<Link to="/oficina/compras/nova" className="btn-primary text-sm !py-2">🧾 Lançar nota</Link>} />

        {list === null ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : list.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-2">🧾</div>
            <h2 className="text-lg font-bold">Nenhuma nota lançada ainda</h2>
            <p className="text-sm text-steel-500 mt-1 max-w-md mx-auto">Lance a primeira nota de compra: as peças entram no estoque e o boleto vai para as contas a pagar.</p>
            <Link to="/oficina/compras/nova" className="btn-primary mt-5 inline-flex">+ Lançar nota</Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <input className="input flex-1" placeholder="🔍 Buscar por nº da nota ou fornecedor" value={q} onChange={e => setQ(e.target.value)} />
              <div className="flex gap-2">
                <select className="input !py-2 flex-1 sm:!w-auto text-sm" value={supplierF} onChange={e => setSupplierF(e.target.value)}>
                  <option value="">Todos os fornecedores</option>
                  {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                <select className="input !py-2 flex-1 sm:!w-auto text-sm" value={period} onChange={e => setPeriod(e.target.value as Period)}>
                  {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <Chip on={!statusF} onClick={() => setStatusF('')}>Todas ({filtered.length})</Chip>
                {(Object.keys(STATUS) as InvoiceStatus[]).filter(s => byStatus[s] > 0).map(s => (
                  <Chip key={s} on={statusF === s} onClick={() => setStatusF(statusF === s ? '' : s)} warn={s === 'vencida'}>
                    {STATUS[s].label} ({byStatus[s]})
                  </Chip>
                ))}
              </div>
              <div className="text-sm text-steel-600">Total: <strong className="text-steel-900">{fmtBRL(total)}</strong></div>
            </div>

            {shown.length === 0 ? (
              <div className="card text-center py-8 text-sm text-steel-500">Nenhuma nota com esses filtros.</div>
            ) : (
              <div className="card !p-0 overflow-hidden">
                <div className="hidden md:grid grid-cols-[96px_minmax(0,2fr)_minmax(0,1fr)_70px_120px_110px] gap-3 px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">
                  <div>Data</div><div>Fornecedor</div><div>Nota</div><div className="text-right">Itens</div><div className="text-right">Valor</div><div className="text-right">Status</div>
                </div>
                <ul className="divide-y divide-steel-100">
                  {shown.map(n => {
                    const st = invoiceStatus(n);
                    const count = n.items[0]?.count ?? 0;
                    return (
                      <li key={n.id}>
                        <button onClick={() => setParams({ nota: n.id })}
                          className={`w-full text-left px-5 py-3 hover:bg-steel-50 ${st === 'estornada' ? 'opacity-60' : ''}`}>
                          {/* Desktop */}
                          <div className="hidden md:grid grid-cols-[96px_minmax(0,2fr)_minmax(0,1fr)_70px_120px_110px] gap-3 items-center text-sm">
                            <div className="text-steel-600">{fmtDate(n.issue_date)}</div>
                            <div className="font-semibold truncate">{n.supplier?.name ?? 'Fornecedor'}</div>
                            <div className="text-steel-600 truncate">{n.number ?? 's/ nº'}</div>
                            <div className="text-right text-steel-600">{count}</div>
                            <div className="text-right font-bold">{fmtBRL(n.total)}</div>
                            <div className="text-right"><span className={`badge ${STATUS[st].cls}`}>{STATUS[st].label}</span></div>
                          </div>
                          {/* Celular */}
                          <div className="md:hidden flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold truncate">{n.supplier?.name ?? 'Fornecedor'}</div>
                              <div className="text-xs text-steel-500">{fmtDate(n.issue_date)} · nota {n.number ?? 's/ nº'} · {count} ite{count === 1 ? 'm' : 'ns'}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-sm font-bold">{fmtBRL(n.total)}</div>
                              <span className={`badge ${STATUS[st].cls}`}>{STATUS[st].label}</span>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      {open && <InvoiceDetail id={open} onClose={() => setParams({})} onChanged={load} />}
    </WorkshopLayout>
  );
}

function Chip({ on, warn, onClick, children }: { on: boolean; warn?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${on ? 'bg-steel-900 text-white border-steel-900'
        : warn ? 'bg-alert-50 text-alert-700 border-alert-200' : 'bg-white text-steel-600 border-steel-200'}`}>
      {children}
    </button>
  );
}

function InvoiceDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [inv, setInv]     = useState<(PurchaseInvoice & { supplier: { name: string } | null }) | null>(null);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [pays, setPays]   = useState<Payable[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy]   = useState(false);

  const load = useCallback(async () => {
    const [i, it, p] = await Promise.all([
      supabase.from('purchase_invoices').select('*, supplier:suppliers(name)').eq('id', id).maybeSingle(),
      supabase.from('purchase_items').select('*').eq('invoice_id', id),
      supabase.from('payables').select('*').eq('invoice_id', id).order('due_date'),
    ]);
    setInv(i.data as never);
    setItems((it.data as PurchaseItem[]) ?? []);
    setPays((p.data as Payable[]) ?? []);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function cancel() {
    if (!reason.trim()) return toast.error('Informe o motivo do estorno');
    setBusy(true);
    const { error } = await supabase.rpc('purchase_cancel', { p_invoice: id, p_reason: reason });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Nota estornada. Estoque e contas a pagar desfeitos.');
    setCancelling(false);
    load(); onChanged();
  }

  const hasPaid = pays.some(p => p.paid_at && !p.cancelled_at);

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl max-h-[94vh] flex flex-col shadow-2xl">
        <div className="px-6 pt-5 pb-3 border-b border-steel-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">{inv ? `${inv.supplier?.name ?? 'Fornecedor'} · nota ${inv.number ?? 's/ nº'}` : '…'}</h2>
            {inv && <div className="text-xs text-steel-500">{fmtDate(inv.issue_date)}{inv.status === 'cancelled' && ` · estornada: ${inv.cancel_reason}`}</div>}
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg grid place-items-center text-steel-500 hover:bg-steel-100">✕</button>
        </div>
        {inv && (
          <div className="px-6 py-4 space-y-5 overflow-y-auto">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500 mb-2">Peças</div>
              <ul className="divide-y divide-steel-100 text-sm">
                {items.map(i => (
                  <li key={i.id} className="py-1.5 flex justify-between gap-3">
                    <span className="min-w-0 truncate">{fmtQty(i.quantity)} × {i.description}</span>
                    <span className="shrink-0 text-steel-600">{fmtBRL(i.unit_cost)} <strong className="text-steel-900 ml-2">{fmtBRL(Number(i.quantity) * Number(i.unit_cost))}</strong></span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-sm space-y-1 max-w-xs ml-auto">
                {Number(inv.freight) > 0 && <div className="flex justify-between text-steel-600"><span>Frete</span><span>{fmtBRL(inv.freight)}</span></div>}
                {Number(inv.discount) > 0 && <div className="flex justify-between text-steel-600"><span>Desconto</span><span>− {fmtBRL(inv.discount)}</span></div>}
                <div className="flex justify-between font-bold"><span>Total</span><span>{fmtBRL(inv.total)}</span></div>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500 mb-2">Parcelas</div>
              <ul className="space-y-1.5 text-sm">
                {pays.map(p => (
                  <li key={p.id} className="flex justify-between items-center gap-3">
                    <span>{p.installment ?? 'Única'} · vence {fmtDate(p.due_date)}</span>
                    <span className="flex items-center gap-2">
                      {fmtBRL(p.amount)}
                      <span className={`badge ${p.cancelled_at ? 'bg-steel-100 text-steel-500' : p.paid_at ? 'bg-signal-100 text-signal-700' : 'bg-pending-100 text-pending-800'}`}>
                        {p.cancelled_at ? 'cancelada' : p.paid_at ? `paga ${fmtDate(p.paid_at)}` : 'em aberto'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {inv.status === 'posted' && <Link to="/oficina/contas-a-pagar" className="text-xs font-semibold text-brand-700 mt-2 inline-block">Ver em Contas a pagar →</Link>}
            </div>
            {inv.notes && <p className="text-sm text-steel-600">📝 {inv.notes}</p>}

            {inv.status === 'posted' && (
              <div className="border-t border-steel-100 pt-4">
                {!cancelling ? (
                  <button className="text-sm text-alert-600 font-semibold" onClick={() => setCancelling(true)}>Estornar esta nota…</button>
                ) : hasPaid ? (
                  <p className="text-sm text-alert-700 bg-alert-50 rounded-lg px-3 py-2">Há parcela paga desta nota. Desfaça o pagamento em Contas a pagar antes de estornar.</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-steel-600">O estorno tira as peças do estoque, volta o custo anterior e cancela as parcelas.</p>
                    <input className="input" placeholder="Motivo (ex.: nota lançada em duplicidade)" value={reason} onChange={e => setReason(e.target.value)} />
                    <div className="flex gap-2 justify-end">
                      <button className="btn-ghost" onClick={() => setCancelling(false)} disabled={busy}>Voltar</button>
                      <button className="btn-primary !bg-alert-600 hover:!bg-alert-700" onClick={cancel} disabled={busy}>{busy ? 'Estornando…' : 'Confirmar estorno'}</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
