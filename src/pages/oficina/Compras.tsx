import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL } from '@/components/os/osHelpers';
import { fmtQty } from '@/lib/parts';
import { fmtDate, type Payable, type PurchaseInvoice, type PurchaseItem } from '@/lib/purchasing';
import { Restricted } from './Fornecedores';

type Row = PurchaseInvoice & { supplier: { name: string } | null; payables: Pick<Payable, 'paid_at' | 'cancelled_at'>[] };

export default function Compras() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'compras');
  const [params, setParams] = useSearchParams();
  const open = params.get('nota');

  const [list, setList] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    if (!wid) return;
    const { data } = await supabase.from('purchase_invoices')
      .select('*, supplier:suppliers(name), payables(paid_at, cancelled_at)')
      .eq('workshop_id', wid).order('issue_date', { ascending: false }).order('created_at', { ascending: false }).limit(300);
    setList((data as unknown as Row[]) ?? []);
  }, [wid]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  if (!allowed) return <Restricted />;

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">🧾 Notas de compra</h1>
            <p className="text-sm text-steel-500 mt-1">Cada nota lançada coloca as peças no estoque e as parcelas nas contas a pagar.</p>
          </div>
          <Link to="/oficina/compras/nova" className="btn-primary">+ Lançar nota</Link>
        </div>

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
          <div className="card !p-0 overflow-hidden">
            <ul className="divide-y divide-steel-100">
              {list.map(n => {
                const pays = n.payables.filter(p => !p.cancelled_at);
                const paid = pays.filter(p => p.paid_at).length;
                return (
                  <li key={n.id}>
                    <button onClick={() => setParams({ nota: n.id })}
                      className={`w-full text-left px-5 py-3 flex items-center justify-between gap-3 hover:bg-steel-50 ${n.status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {n.supplier?.name ?? 'Fornecedor'} · nota {n.number ?? 's/ nº'}
                          {n.status === 'cancelled' && <span className="badge bg-alert-100 text-alert-700 ml-2">estornada</span>}
                        </div>
                        <div className="text-xs text-steel-500">{fmtDate(n.issue_date)}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold">{fmtBRL(n.total)}</div>
                        {n.status === 'posted' && (
                          <div className={`text-[11px] ${paid === pays.length ? 'text-signal-700' : 'text-steel-500'}`}>
                            {paid === pays.length ? 'paga' : `${paid}/${pays.length} parcela${pays.length === 1 ? '' : 's'} paga${paid === 1 ? '' : 's'}`}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {open && <InvoiceDetail id={open} onClose={() => setParams({})} onChanged={load} />}
    </WorkshopLayout>
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
