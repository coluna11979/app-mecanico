import { brl } from '@/lib/cash';
import { refMinutesOf } from '@/lib/serviceCatalog';
import { fmtHours } from '@/lib/teamCost';
import type { TeamCostRange } from '@/lib/teamCost';

type Parts = Pick<TeamCostRange, 'salaryCost' | 'encargosCost' | 'benefitsCost' | 'commission' | 'total'>;

/** Custo real da equipe própria (CLT) separado em salários, encargos, benefícios e comissões */
export function CostBreakdown({ c }: { c: Parts }) {
  const rows: [string, number][] = [
    ['Salários', c.salaryCost],
    ['Encargos e provisões', c.encargosCost],
    ['Benefícios', c.benefitsCost],
    ['Comissões', c.commission],
  ];
  return (
    <ul className="divide-y divide-steel-100 text-sm">
      {rows.map(([label, v]) => (
        <li key={label} className="flex items-baseline justify-between gap-3 py-1.5">
          <span className="text-steel-600">{label}</span>
          <span className="font-semibold tabular-nums">{brl(v)}<span className="text-xs font-normal text-steel-400"> {c.total > 0 ? Math.round((v / c.total) * 100) : 0}%</span></span>
        </li>
      ))}
      <li className="flex items-baseline justify-between gap-3 py-2 font-bold">
        <span>Custo real da equipe</span><span className="tabular-nums">{brl(c.total)}</span>
      </li>
    </ul>
  );
}

/**
 * Equipe própria × mecânico da plataforma (valor fechado). A régua é a mesma: o trabalho feito no período,
 * medido pelo tempo de referência dos serviços. Equipe própria = custo real da jornada inteira (inclui o tempo parado);
 * plataforma = só as horas do serviço × valor/hora (simulador), sem encargos nem ociosidade.
 */
export default function TeamCostCompare({ cost, estMin, services, hourly, onHourly }: {
  cost: TeamCostRange; estMin: number;
  services: { name: string; orders: number }[];
  hourly: number; onHourly: (v: number) => void;
}) {
  const H = estMin / 60;                       // horas de serviço (tabela de referência)
  const W = cost.workedMin / 60;               // horas pagas à equipe
  const occ = W > 0 ? H / W : 0;
  const fixed = cost.salaryCost + cost.encargosCost + cost.benefitsCost;
  const platform = H * hourly;
  const perHourNow = H > 0 ? cost.total / H : null;   // também é o valor/hora da plataforma que empata
  const rows = services.map(s => ({ ...s, ref: refMinutesOf(s.name) })).filter(s => s.ref != null).slice(0, 6);
  // E se a equipe estivesse mais ocupada? Mesmas horas pagas, mais serviço (a comissão acompanha o serviço)
  const what = (o: number) => (H > 0 && W > 0 ? fixed / (o * W) + cost.commission / H : null);
  const diff = cost.total - platform;

  return (
    <div className="mt-5 pt-4 border-t border-steel-100">
      <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-1">⚖️ Equipe própria × mecânico da plataforma</div>
      <p className="text-[11px] text-steel-400 mb-3">
        Mesmo trabalho: {fmtHours(estMin)} de serviço pela tabela de referência. Plataforma com valor fechado (valor/hora × tempo do serviço).
      </p>

      {H <= 0 ? (
        <p className="text-sm text-steel-400">Sem serviços com tempo de referência no período para comparar.</p>
      ) : (
        <>
          <label className="flex flex-wrap items-center gap-2 text-sm mb-4">
            <span className="text-steel-600">Valor/hora do mecânico da plataforma</span>
            <span className="flex items-center gap-1">R$
              <input type="number" inputMode="decimal" min={0} step={5} className="input !py-1.5 !w-24 text-right" value={hourly}
                onChange={e => onHourly(Math.max(0, Number(e.target.value) || 0))} />
            </span>
            <span className="text-[11px] text-steel-400">na sua base: de R$ 50 a R$ 130 (mediana R$ 80)</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-steel-200 p-3">
              <div className="text-[11px] text-steel-500">Equipe própria (CLT)</div>
              <div className="text-xl font-bold mt-0.5">{brl(cost.total)}</div>
              <div className="text-[11px] text-steel-400">jornada inteira, com encargos e comissões</div>
            </div>
            <div className="rounded-2xl border border-steel-200 p-3">
              <div className="text-[11px] text-steel-500">Plataforma (valor fechado)</div>
              <div className="text-xl font-bold mt-0.5">{brl(platform)}</div>
              <div className="text-[11px] text-steel-400">{fmtHours(estMin)} × {brl(hourly)}/h, só o serviço feito</div>
            </div>
          </div>
          <p className={`text-sm font-semibold mt-2 ${diff <= 0 ? 'text-signal-700' : 'text-pending-800'}`}>
            {diff <= 0
              ? `A equipe própria custa ${brl(-diff)} a menos que a plataforma neste período.`
              : `A plataforma custaria ${brl(diff)} a menos que a equipe própria neste período.`}
          </p>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="rounded-xl bg-steel-50 p-3">
              <div className="text-[11px] text-steel-500">Equipe própria, por hora de serviço</div>
              <div className="text-lg font-bold">{perHourNow != null ? brl(perHourNow) : '—'}</div>
              <div className="text-[11px] text-steel-400">ocupação estimada {Math.round(occ * 100)}%</div>
            </div>
            <div className="rounded-xl bg-steel-50 p-3">
              <div className="text-[11px] text-steel-500">Valor/hora que empata</div>
              <div className="text-lg font-bold">{perHourNow != null ? brl(perHourNow) : '—'}</div>
              <div className="text-[11px] text-steel-400">abaixo disso, a plataforma sai mais barata</div>
            </div>
          </div>
          {occ < 0.9 && (
            <p className="text-xs text-steel-600 mt-3">
              Com a equipe mais ocupada, a hora de serviço própria cai:
              {[0.7, 0.8].filter(o => o > occ).map(o => <span key={o} className="ml-2 font-semibold">{Math.round(o * 100)}% → {brl(what(o)!)}/h</span>)}
            </p>
          )}

          {rows.length > 0 && (
            <div className="mt-4">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest mb-2">Por serviço (preço de cada um)</div>
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1.5 text-xs items-baseline">
                <span className="text-steel-400">Serviço</span><span className="text-steel-400 text-right">Ref.</span><span className="text-steel-400 text-right">Própria</span><span className="text-steel-400 text-right">Plataforma</span>
                {rows.map(r => (
                  <div key={r.name} className="contents">
                    <span className="text-steel-700 truncate">{r.name}</span>
                    <span className="text-right text-steel-500 tabular-nums">{fmtHours(r.ref!)}</span>
                    <span className="text-right font-semibold tabular-nums">{perHourNow != null ? brl((r.ref! / 60) * perHourNow) : '—'}</span>
                    <span className="text-right font-semibold tabular-nums">{brl((r.ref! / 60) * hourly)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11px] text-steel-400 leading-relaxed mt-3">
            Simulação, não orçamento: o tempo é a referência de mercado e o valor/hora é o que você digitar. A equipe própria inclui o tempo parado e as comissões;
            a plataforma cobra só o serviço feito, sem encargos. Motor e serviços não identificados ficam de fora.
          </p>
        </>
      )}
    </div>
  );
}
