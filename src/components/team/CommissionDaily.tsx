import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtBRL } from '@/components/os/osHelpers';
import { dayKey, daysOfHalf, daySummary, halfOfDay, loadHalfData, type HalfData } from '@/lib/commissionDaily';

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
const longDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const shortDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
const osNum = (n: number | null, id: string) => (n != null ? String(n).padStart(4, '0') : id.slice(0, 6));

/**
 * Comissão por dia: quem ganhou quanto no dia, de quais OS, e o dia a dia da quinzena.
 * Só consulta — quem paga continua sendo o fechamento da quinzena.
 */
export default function CommissionDaily({ wid }: { wid: string }) {
  const today = dayKey(new Date());
  const [day, setDay] = useState(today);
  const half = halfOfDay(day);
  const key = `${half.competence}-${half.half}`;
  const [data, setData] = useState<{ key: string; d: HalfData } | null>(null);

  useEffect(() => {
    let alive = true;
    if (data?.key === key) return;
    loadHalfData(wid, half.competence, half.half).then(d => { if (alive) setData({ key, d }); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wid, key]);

  const ready = data?.key === key ? data.d : null;
  const sum = useMemo(() => (ready ? daySummary(ready, day) : null), [ready, day]);
  const days = useMemo(() => (ready ? daysOfHalf(ready) : []), [ready]);
  const maxDay = Math.max(1, ...days.map(x => x.total));
  const yesterday = addDays(today, -1);

  return (
    <div className="space-y-4">
      {/* Escolha do dia */}
      <div className="flex flex-wrap items-center gap-2">
        {([['Hoje', today], ['Ontem', yesterday]] as const).map(([l, v]) => (
          <button key={l} onClick={() => setDay(v)}
            className={`text-sm font-semibold px-4 py-2 rounded-full border transition ${day === v ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200 hover:border-steel-300'}`}>
            {l}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-auto">
          <button className="h-10 w-10 rounded-xl border border-steel-200 bg-white hover:bg-steel-50" onClick={() => setDay(addDays(day, -1))} aria-label="Dia anterior">‹</button>
          <input type="date" className="input !w-auto" value={day} onChange={e => e.target.value && setDay(e.target.value)} />
          <button className="h-10 w-10 rounded-xl border border-steel-200 bg-white hover:bg-steel-50" onClick={() => setDay(addDays(day, 1))} aria-label="Próximo dia">›</button>
        </div>
      </div>
      <h2 className="text-lg font-bold capitalize">{longDay(day)}</h2>

      {!sum ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="card !p-4 col-span-3 sm:col-span-1 !bg-steel-900 text-white">
              <div className="text-[11px] text-steel-400">Comissão do dia</div>
              <div className="text-2xl font-bold font-display mt-0.5">{fmtBRL(sum.total)}</div>
            </div>
            <div className="card !p-4 col-span-3 sm:col-span-1">
              <div className="text-[11px] text-steel-500">Serviços finalizados</div>
              <div className="text-xl font-bold mt-0.5">{sum.orders} <span className="text-sm font-normal text-steel-400">OS</span></div>
            </div>
            <div className="card !p-4 col-span-3 sm:col-span-1">
              <div className="text-[11px] text-steel-500">Faturamento do dia</div>
              <div className="text-xl font-bold mt-0.5">{fmtBRL(sum.revenue)}</div>
              <div className="text-[11px] text-steel-400">OS concluídas hoje</div>
            </div>
          </div>

          {sum.people.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-3xl mb-1">🏅</div>
              <p className="text-sm text-steel-600">Nenhum serviço finalizado neste dia.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {sum.people.map(p => (
                <li key={p.id} className="card !p-0 overflow-hidden">
                  <details className="group" open={sum.people.length <= 3}>
                    <summary className="list-none cursor-pointer px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{p.name}{!p.active && <span className="badge bg-steel-100 text-steel-500 ml-2">inativo</span>}</div>
                        <div className="text-[11px] text-steel-400 leading-snug">{p.rule}</div>
                        <div className="text-[11px] text-steel-500 mt-0.5">{p.orders} OS{p.calc.revCommission > 0 ? ` · inclui ${fmtBRL(p.calc.revCommission)} do faturamento da loja` : ''}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-lg font-bold tabular-nums ${p.calc.commission > 0 ? '' : 'text-steel-400'}`}>{fmtBRL(p.calc.commission)}</span>
                        <span className="text-steel-400 group-open:rotate-90 transition">›</span>
                      </div>
                    </summary>
                    {p.lines.length > 0 && (
                      <ul className="border-t border-steel-100 divide-y divide-steel-100 bg-steel-50/50">
                        {p.lines.map(l => (
                          <li key={l.os.id} className="px-4 py-2.5 flex items-start justify-between gap-3 text-sm">
                            <Link to={`/oficina/os/${l.os.id}`} state={{ backLabel: 'Comissões' }} className="min-w-0 hover:text-brand-700">
                              <span className="font-semibold">OS {osNum(l.os.number, l.os.id)}</span>
                              <span className="text-steel-500"> · {l.os.customer ?? 'Sem cliente'}</span>
                              <span className="block text-[11px] text-steel-400 truncate">{l.os.title}</span>
                            </Link>
                            <span className="font-semibold shrink-0 tabular-nums">{fmtBRL(l.commission)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </li>
              ))}
            </ul>
          )}

          {/* Dia a dia da quinzena */}
          {days.length > 0 && (
            <div className="card">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-3">Dia a dia da quinzena</div>
              <ul className="space-y-1">
                {days.map(x => (
                  <li key={x.day}>
                    <button onClick={() => setDay(x.day)} className={`w-full text-left rounded-xl px-3 py-2 transition ${x.day === day ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-steel-50'}`}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="capitalize text-steel-700">{shortDay(x.day)}<span className="text-steel-400 text-xs"> · {x.orders} OS</span></span>
                        <strong className="tabular-nums">{fmtBRL(x.total)}</strong>
                      </div>
                      <div className="h-1.5 rounded-full bg-steel-100 mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${(x.total / maxDay) * 100}%` }} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-steel-400 leading-relaxed">
            Só consulta: a comissão conta no dia em que o serviço foi finalizado. O pagamento continua sendo fechado por quinzena, na aba “Por quinzena”.
            A % do faturamento da loja (gerente) usa as OS concluídas no dia.
          </p>
        </>
      )}
    </div>
  );
}
