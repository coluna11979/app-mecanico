import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { brl } from '@/lib/cash';
import { osNumber } from '@/components/os/osHelpers';
import type { FinOs } from '@/lib/finance';

/**
 * Financeiro → "OS concluídas no período": todas as OS que contam no faturado (pagas e a receber),
 * com a situação de cada uma — para conferir nota por nota com o bloquinho.
 */
type Filter = 'todas' | 'pagas' | 'receber';
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function CompletedOsList({ list }: { list: FinOs[] }) {
  const [filter, setFilter] = useState<Filter>('todas');
  const [all, setAll] = useState(false);

  const rows = useMemo(() => [...list]
    .map(o => {
      const total = r2(Number(o.price) - Number(o.counter_discount ?? 0));
      const paid = r2(Number(o.paid_amount ?? 0));
      return { o, total, paid, open: r2(total - paid) };
    })
    .sort((a, b) => (a.o.completed_at ?? '').localeCompare(b.o.completed_at ?? '') || (a.o.number ?? 0) - (b.o.number ?? 0)), [list]);

  const shown = rows.filter(r => filter === 'todas' || (filter === 'pagas' ? r.open <= 0.004 : r.open > 0.004));
  const visible = all ? shown : shown.slice(0, 30);
  const sum = (xs: typeof rows, f: (x: typeof rows[number]) => number) => r2(xs.reduce((a, x) => a + f(x), 0));
  const paidCount = rows.filter(r => r.open <= 0.004).length;

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">📋 OS concluídas no período</div>
        <div className="text-sm"><strong>{brl(sum(rows, r => r.total))}</strong> <span className="text-steel-500">· {rows.length} OS</span></div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {([['todas', `Todas (${rows.length})`], ['pagas', `✅ Pagas (${paidCount})`], ['receber', `🕒 A receber (${rows.length - paidCount})`]] as [Filter, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${
              filter === k ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
            {l}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-steel-400">Nenhuma OS neste filtro.</p>
      ) : (
        <ul className="divide-y divide-steel-100">
          {visible.map(({ o, total, paid, open }) => (
            <li key={o.id}>
              <Link to={`/oficina/os/${o.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-steel-50 -mx-2 px-2 rounded-lg">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">OS {osNumber(o)} · {o.title}</div>
                  <div className="text-xs text-steel-500 truncate">
                    {o.customer?.full_name ?? 'Sem cliente'}{o.vehicle?.plate ? ` · ${o.vehicle.plate}` : ''}
                    {o.completed_at && ` · ${new Date(o.completed_at).toLocaleDateString('pt-BR')}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold">{brl(total)}</div>
                  {open <= 0.004 ? (
                    <div className="text-[11px] text-signal-700 font-semibold">✅ paga</div>
                  ) : paid > 0 ? (
                    <div className="text-[11px] text-pending-800 font-semibold">parcial · falta {brl(open)}</div>
                  ) : (
                    <div className="text-[11px] text-brand-700 font-semibold">
                      🕒 a receber{o.pay_later_due ? ` · vence ${new Date(`${o.pay_later_due}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}
                    </div>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 30 && (
        <button onClick={() => setAll(a => !a)} className="text-sm font-semibold text-brand-600 mt-3">
          {all ? 'Mostrar menos' : `Ver todas as ${shown.length} OS →`}
        </button>
      )}
      <p className="text-[11px] text-steel-400 mt-3">Conta no faturado pelo dia em que a OS foi concluída, paga ou não. O dinheiro entra em “Recebimentos” no dia do pagamento.</p>
    </div>
  );
}
