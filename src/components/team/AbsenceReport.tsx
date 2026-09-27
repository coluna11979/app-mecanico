import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ABSENCE_REASONS, absenceDays, absenceDaysIn, fmtDay, isoToday, returnStatus,
  type Absence, type AbsenceReason,
} from '@/lib/team';
import type { WorkshopMechanic } from '@/types/database';

type Period = 'month' | 'lastMonth' | '3m' | 'year';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'Este mês' }, { key: 'lastMonth', label: 'Mês passado' },
  { key: '3m', label: 'Últimos 3 meses' }, { key: 'year', label: 'Este ano' },
];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rangeOf(p: Period): { from: string; to: string } {
  const t = new Date();
  switch (p) {
    case 'month':     return { from: iso(new Date(t.getFullYear(), t.getMonth(), 1)), to: iso(t) };
    case 'lastMonth': return { from: iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: iso(new Date(t.getFullYear(), t.getMonth(), 0)) };
    case '3m':        return { from: iso(new Date(t.getFullYear(), t.getMonth() - 2, 1)), to: iso(t) };
    case 'year':      return { from: iso(new Date(t.getFullYear(), 0, 1)), to: iso(t) };
  }
}

/** Relatório de afastamentos: quem está fora, retornos atrasados, dias por pessoa e por motivo */
export default function AbsenceReport({ absences, mechanics }: { absences: Absence[]; mechanics: WorkshopMechanic[] }) {
  const [period, setPeriod] = useState<Period>('month');
  const { from, to } = rangeOf(period);
  const name = (id: string) => mechanics.find(m => m.id === id)?.name ?? 'Colaborador';

  const r = useMemo(() => {
    const today = isoToday();
    const open = absences.filter(a => !a.returned_on);
    const late = open.filter(a => a.expected_return && a.expected_return < today);
    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const soon = open.filter(a => a.expected_return && a.expected_return >= today && a.expected_return <= iso(in7));
    const inPeriod = absences
      .map(a => ({ a, days: absenceDaysIn(a, from, to) }))
      .filter(x => x.days > 0)
      .sort((x, y) => y.a.started_on.localeCompare(x.a.started_on));
    const byPerson = new Map<string, { days: number; count: number; reasons: Map<AbsenceReason, number> }>();
    const byReason = new Map<AbsenceReason, number>();
    for (const { a, days } of inPeriod) {
      const p = byPerson.get(a.mechanic_id) ?? { days: 0, count: 0, reasons: new Map() };
      p.days += days; p.count += 1;
      p.reasons.set(a.reason, (p.reasons.get(a.reason) ?? 0) + days);
      byPerson.set(a.mechanic_id, p);
      byReason.set(a.reason, (byReason.get(a.reason) ?? 0) + days);
    }
    return {
      open, late, soon, inPeriod,
      totalDays: inPeriod.reduce((s, x) => s + x.days, 0),
      people: [...byPerson.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.days - a.days),
      reasons: [...byReason.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [absences, from, to]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-steel-500">{fmtDay(from)} a {fmtDay(to)}</div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`text-sm font-semibold px-3 py-1.5 rounded-full border transition ${period === p.key ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Afastados agora" value={r.open.length} />
        <Stat label="Retornos atrasados" value={r.late.length} alert={r.late.length > 0} />
        <Stat label="Voltam em até 7 dias" value={r.soon.length} />
        <Stat label="Dias de afastamento no período" value={r.totalDays} />
      </div>

      {/* Afastados agora */}
      {r.open.length > 0 && (
        <div className="card">
          <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500 mb-2">Fora da oficina agora</div>
          <ul className="divide-y divide-steel-100">
            {r.open.sort((a, b) => (a.expected_return ?? '9999').localeCompare(b.expected_return ?? '9999')).map(a => {
              const rs = returnStatus(a);
              return (
                <li key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <Link to={`/oficina/equipe/${a.mechanic_id}`} className="font-semibold hover:text-brand-600">{name(a.mechanic_id)}</Link>
                    <span className="text-steel-500"> · {ABSENCE_REASONS[a.reason].icon} {ABSENCE_REASONS[a.reason].label} · desde {fmtDay(a.started_on)} ({absenceDays(a)} dias)</span>
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${rs?.late ? 'bg-alert-50 text-alert-700' : 'bg-pending-50 text-pending-800'}`}>
                    {a.expected_return ? `previsão ${fmtDay(a.expected_return)}${rs ? ` · ${rs.text}` : ''}` : 'sem previsão de retorno'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Por colaborador */}
        <div className="card lg:col-span-2 !p-0 overflow-x-auto">
          <div className="px-4 pt-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-steel-500">Dias afastados por colaborador</div>
          {r.people.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-steel-400">Nenhum afastamento no período.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-steel-50 border-y border-steel-100 text-[10px] uppercase tracking-wider text-steel-500">
                <tr><th className="text-left px-4 py-2">Colaborador</th><th className="text-right px-4 py-2">Dias</th><th className="text-right px-4 py-2">Afastamentos</th><th className="text-left px-4 py-2">Motivos</th></tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {r.people.map(p => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5"><Link to={`/oficina/equipe/${p.id}`} className="font-semibold hover:text-brand-600">{name(p.id)}</Link></td>
                    <td className="px-4 py-2.5 text-right font-bold">{p.days}</td>
                    <td className="px-4 py-2.5 text-right">{p.count}</td>
                    <td className="px-4 py-2.5 text-xs text-steel-600">
                      {[...p.reasons.entries()].map(([k, d]) => `${ABSENCE_REASONS[k].icon} ${ABSENCE_REASONS[k].label} (${d}d)`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Por motivo */}
        <div className="card">
          <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500 mb-3">Por motivo</div>
          {r.reasons.length === 0 ? <p className="text-sm text-steel-400">—</p> : (
            <div className="space-y-2.5">
              {r.reasons.map(([k, d]) => (
                <div key={k}>
                  <div className="flex justify-between text-sm"><span>{ABSENCE_REASONS[k].icon} {ABSENCE_REASONS[k].label}</span><strong>{d} dias</strong></div>
                  <div className="h-1.5 rounded-full bg-steel-100 mt-1 overflow-hidden">
                    <div className="h-full bg-pending-500 rounded-full" style={{ width: `${(d / Math.max(1, r.totalDays)) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lista do período */}
      {r.inPeriod.length > 0 && (
        <div className="card !p-0 overflow-x-auto">
          <div className="px-4 pt-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-steel-500">Afastamentos no período</div>
          <table className="w-full text-sm">
            <thead className="bg-steel-50 border-y border-steel-100 text-[10px] uppercase tracking-wider text-steel-500">
              <tr>
                <th className="text-left px-4 py-2">Colaborador</th><th className="text-left px-4 py-2">Motivo</th>
                <th className="text-left px-4 py-2">Afastamento</th><th className="text-left px-4 py-2">Previsão</th>
                <th className="text-left px-4 py-2">Retorno</th><th className="text-right px-4 py-2">Dias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {r.inPeriod.map(({ a }) => {
                const lateDays = a.returned_on && a.expected_return && a.returned_on > a.expected_return
                  ? Math.round((new Date(`${a.returned_on}T00:00:00`).getTime() - new Date(`${a.expected_return}T00:00:00`).getTime()) / 86400000) : 0;
                return (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 font-semibold">{name(a.mechanic_id)}</td>
                    <td className="px-4 py-2.5">{ABSENCE_REASONS[a.reason].icon} {ABSENCE_REASONS[a.reason].label}</td>
                    <td className="px-4 py-2.5">{fmtDay(a.started_on)}</td>
                    <td className="px-4 py-2.5">{fmtDay(a.expected_return)}</td>
                    <td className="px-4 py-2.5">
                      {a.returned_on ? fmtDay(a.returned_on) : <span className="text-pending-800 font-semibold">afastado</span>}
                      {lateDays > 0 && <span className="block text-[10px] text-alert-600">{lateDays} dia(s) após o previsto</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-bold">{absenceDays(a)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-steel-400">Dias corridos. O dia da saída conta; o dia do retorno não. "Dias no período" conta só os dias que caem dentro das datas escolhidas.</p>
    </div>
  );
}

function Stat({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="card">
      <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${alert ? 'text-alert-600' : 'text-steel-900'}`}>{value}</div>
    </div>
  );
}
