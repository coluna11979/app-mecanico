import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { fetchAll } from '@/lib/fetchAll';
import { METHODS, brl, hhmm, type PayMethod } from '@/lib/cash';

/** Recebimento de OS (os_payments) com a OS e as formas de pagamento */
export type ReceivedRow = {
  id: string; amount: number; discount: number; change_given: number; created_at: string; operator_id: string | null;
  service_order: {
    id: string; number: number | null; title: string; price: number; paid_amount: number;
    customer: { full_name: string } | null; vehicle: { plate: string | null; make: string | null; model: string | null } | null;
  } | null;
  parts: { method: PayMethod; amount: number; installments: number; cancelled_at: string | null }[];
};

const osNum = (o: { id: string; number: number | null }) => (o.number != null ? String(o.number).padStart(4, '0') : o.id.slice(0, 8));
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Lista das OS recebidas no período (mais recentes primeiro), com busca por nº, cliente, placa ou serviço.
 * Usada no Caixa (aba Recebidas) e no Financeiro.
 */
export default function ReceivedPayments({ wid, from, to, ops = {}, compact = false }: {
  wid: string; from: Date; to: Date; ops?: Record<string, string>; compact?: boolean;
}) {
  const [rows, setRows] = useState<ReceivedRow[] | null>(null);
  const [q, setQ] = useState('');
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchAll((a, b) => supabase.from('os_payments')
      .select('id, amount, discount, change_given, created_at, operator_id, service_order:service_orders(id, number, title, price, paid_amount, customer:customers(full_name), vehicle:vehicles(plate, make, model)), parts:cash_entries(method, amount, installments, cancelled_at)')
      .eq('workshop_id', wid).is('cancelled_at', null).gte('created_at', fromIso).lt('created_at', toIso)
      .order('created_at', { ascending: false }).order('id').range(a, b))
      .then(({ data }) => { if (alive) setRows((data as unknown as ReceivedRow[]) ?? []); });
    return () => { alive = false; };
  }, [wid, fromIso, toIso]);

  const shown = useMemo(() => {
    const t = norm(q.trim());
    if (!t || !rows) return rows ?? [];
    const plateQ = t.replace(/[^a-z0-9]/g, '');
    const isNumber = /^\d+$/.test(t);
    return rows.filter(r => {
      const o = r.service_order;
      if (!o) return false;
      return (isNumber && osNum(o).includes(t))
        || norm(o.customer?.full_name ?? '').includes(t)
        || (plateQ.length >= 3 && norm(o.vehicle?.plate ?? '').replace(/[^a-z0-9]/g, '').includes(plateQ))
        || norm(o.title).includes(t);
    });
  }, [rows, q]);

  const total = shown.reduce((a, r) => a + Number(r.amount), 0);
  const sameDay = from.toDateString() === new Date(to.getTime() - 1).toDateString();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input className="input flex-1 min-w-[220px]" placeholder="Buscar OS paga por nº, cliente, placa ou serviço…" value={q} onChange={e => setQ(e.target.value)} />
        {rows && rows.length > 0 && (
          <div className="text-sm text-steel-600">
            <strong>{shown.length}</strong> recebimento{shown.length === 1 ? '' : 's'} · <strong>{brl(total)}</strong>
          </div>
        )}
      </div>
      {rows === null ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-steel-50 rounded-xl animate-pulse" />)}</div>
      ) : shown.length === 0 ? (
        <div className="text-center py-8 text-sm text-steel-500">
          {rows.length === 0 ? 'Nenhuma OS recebida no período.' : 'Nenhum recebimento encontrado para essa busca.'}
        </div>
      ) : (
        <ul className="divide-y divide-steel-100">
          {(compact ? shown.slice(0, 15) : shown).map(r => {
            const o = r.service_order;
            const parts = r.parts.filter(p => !p.cancelled_at);
            const open = o ? Math.round((Number(o.price) - Number(o.paid_amount)) * 100) / 100 : 0;
            const when = new Date(r.created_at);
            return (
              <li key={r.id}>
                <Link to={o ? `/oficina/os/${o.id}` : '#'} className="flex items-center justify-between gap-3 py-2.5 hover:bg-steel-50 -mx-2 px-2 rounded-lg">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">
                      {o ? <>OS {osNum(o)} · {o.title}</> : 'OS removida'}
                      {o && open > 0.009 && <span className="badge bg-pending-100 text-pending-800 ml-2">falta {brl(open)}</span>}
                    </div>
                    <div className="text-xs text-steel-500 truncate">
                      {o?.customer?.full_name ?? 'Sem cliente'}{o?.vehicle?.plate ? ` · ${o.vehicle.plate}` : ''}
                      {' · '}{sameDay ? hhmm(r.created_at) : `${when.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hhmm(r.created_at)}`}
                      {r.operator_id && ops[r.operator_id] ? ` · ${ops[r.operator_id]}` : ''}
                    </div>
                    <div className="text-[11px] text-steel-500 mt-0.5">
                      {parts.map((p, i) => (
                        <span key={i} className="mr-2">{METHODS[p.method]?.icon} {METHODS[p.method]?.label ?? p.method} {brl(p.amount)}{p.installments > 1 ? ` (${p.installments}x)` : ''}</span>
                      ))}
                      {Number(r.discount) > 0 && <span className="mr-2 text-steel-400">desconto {brl(r.discount)}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold">{brl(r.amount)}</div>
                    <div className="text-[11px] text-signal-700">Ver OS →</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {compact && shown.length > 15 && (
        <p className="text-xs text-steel-500 mt-2">Mostrando os 15 mais recentes de {shown.length}. Use a busca para achar uma OS.</p>
      )}
    </div>
  );
}
