import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { METHODS, brl, type PayMethod } from '@/lib/cash';

type PaymentRow = {
  id: string; amount: number; discount: number; change_given: number; created_at: string;
  cancelled_at: string | null; cancel_reason: string | null; operator_id: string | null;
  service_order: {
    id: string; number: number | null; title: string;
    customer: { full_name: string } | null; vehicle: { plate: string | null; make: string | null; model: string | null } | null;
  } | null;
  entries: { method: PayMethod; amount: number; installments: number }[];
};

type Filter =
  | { registerId: string }
  | { serviceOrderId: string }
  | { workshopId: string; from: string; to: string };

const osNum = (o: { id: string; number: number | null }) => (o.number != null ? String(o.number).padStart(4, '0') : o.id.slice(0, 8));

/**
 * Histórico de recebimentos de OS: de qual OS veio, cliente, placa, formas de
 * pagamento, quem recebeu e quando. Cada linha leva para a OS.
 */
export default function PaymentsList({ filter, showOs = true, empty = 'Nenhum recebimento ainda.', reloadKey, title }: {
  filter: Filter; showOs?: boolean; empty?: string | null; reloadKey?: unknown;
  /** Título mostrado acima da lista (some junto quando `empty` é null e não há nada) */
  title?: string;
}) {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [ops, setOps]   = useState<Record<string, string>>({});
  const fkey = JSON.stringify(filter);

  useEffect(() => {
    let alive = true;
    (async () => {
      let q = supabase.from('os_payments')
        .select('id, amount, discount, change_given, created_at, cancelled_at, cancel_reason, operator_id, workshop_id, '
          + 'service_order:service_orders(id, number, title, customer:customers(full_name), vehicle:vehicles(plate, make, model)), '
          + 'entries:cash_entries(method, amount, installments)')
        .order('created_at', { ascending: false }).limit(300);
      if ('registerId' in filter) q = q.eq('register_id', filter.registerId);
      else if ('serviceOrderId' in filter) q = q.eq('service_order_id', filter.serviceOrderId);
      else q = q.eq('workshop_id', filter.workshopId).gte('created_at', filter.from).lt('created_at', filter.to);
      const { data } = await q;
      if (!alive) return;
      const list = (data as unknown as (PaymentRow & { workshop_id: string })[]) ?? [];
      setRows(list);
      const wid = list[0]?.workshop_id;
      if (wid) {
        const { data: o } = await supabase.from('workshop_operators').select('id, name').eq('workshop_id', wid);
        if (alive) setOps(Object.fromEntries(((o as { id: string; name: string }[]) ?? []).map(x => [x.id, x.name])));
      }
    })();
    return () => { alive = false; };
  }, [fkey, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows === null) return empty === null ? null : <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-14 bg-white rounded-2xl animate-pulse" />)}</div>;
  if (rows.length === 0) {
    if (empty === null) return null;
    return <div>{title && <h2 className="text-sm font-bold text-steel-700 mb-2">{title}</h2>}<div className="card text-center py-8 text-sm text-steel-500">{empty}</div></div>;
  }

  return (
    <div>
    {title && <h2 className="text-sm font-bold text-steel-700 mb-2">{title}</h2>}
    <div className="card p-0 divide-y divide-steel-100">
      {rows.map(p => {
        const os = p.service_order;
        const cancelled = !!p.cancelled_at;
        const forms = p.entries.map(e =>
          `${METHODS[e.method]?.icon ?? ''} ${METHODS[e.method]?.label ?? e.method}${e.installments > 1 ? ` ${e.installments}x` : ''} ${brl(e.amount)}`);
        const body = (
          <>
            <div className="text-xs text-steel-400 w-16 shrink-0 leading-tight">
              {new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}<br />
              {new Date(p.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div className="flex-1 min-w-0">
              {showOs && os && (
                <div className={`text-sm font-semibold truncate ${cancelled ? 'line-through' : ''}`}>
                  OS nº {osNum(os)} · {os.customer?.full_name ?? 'Sem cliente'}
                  {os.vehicle?.plate ? <span className="font-normal text-steel-500"> · {os.vehicle.plate}</span> : null}
                </div>
              )}
              <div className="text-xs text-steel-500 truncate">{forms.join(' + ')}</div>
              <div className="text-[11px] text-steel-400 truncate">
                {[p.operator_id && ops[p.operator_id] ? `recebido por ${ops[p.operator_id]}` : null,
                  p.discount > 0 ? `desconto ${brl(p.discount)}` : null,
                  p.change_given > 0 ? `troco ${brl(p.change_given)}` : null,
                  cancelled ? `ESTORNADO: ${p.cancel_reason}` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className={`font-bold shrink-0 ${cancelled ? 'text-steel-400 line-through' : 'text-signal-700'}`}>{brl(p.amount)}</div>
            {showOs && os && <span className="text-steel-300 shrink-0">›</span>}
          </>
        );
        return showOs && os ? (
          <Link key={p.id} to={`/oficina/os/${os.id}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-steel-50 transition ${cancelled ? 'opacity-60' : ''}`}>
            {body}
          </Link>
        ) : (
          <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${cancelled ? 'opacity-60' : ''}`}>{body}</div>
        );
      })}
    </div>
    </div>
  );
}
