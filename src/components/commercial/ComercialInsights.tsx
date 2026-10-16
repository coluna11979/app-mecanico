import { useMemo } from 'react';
import { fmtBRL } from '@/components/os/osHelpers';
import { idleMoney, mechanicRanking, responseCycle, topDeclined, type Opp } from '@/lib/commercialFunnel';

type Range = { from: Date; to: Date };

const TONE: Record<string, string> = {
  ok: 'bg-signal-50 border-signal-200 text-signal-700',
  warn: 'bg-pending-50 border-pending-200 text-pending-800',
  bad: 'bg-brand-50 border-brand-200 text-brand-700',
  crit: 'bg-alert-50 border-alert-200 text-alert-700',
};

const dias = (d: number) => (d < 1 ? 'menos de 1 dia' : `${d.toFixed(1).replace('.', ',')} dia${d >= 1.95 ? 's' : ''}`);

/**
 * Análises do Comercial: dinheiro parado, o que mais recusam, desempenho por mecânico e tempo de resposta.
 * Só lê o que a tela já carregou (funil) — não consulta nada novo.
 */
export default function ComercialInsights({ opps, answered, range }: { opps: Opp[]; answered: Opp[]; range: Range }) {
  const idle = useMemo(() => idleMoney(opps), [opps]);
  const declined = useMemo(() => topDeclined(answered), [answered]);
  const ranking = useMemo(() => mechanicRanking(opps, range), [opps, range]);
  const cycle = useMemo(() => responseCycle(answered), [answered]);
  const maxDecl = Math.max(1, ...declined.map(d => d.declinedValue));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight">📊 Análises</h2>
        <p className="text-xs text-steel-500">Onde está o dinheiro parado, o que o cliente recusa e quem converte mais. Parado = situação de agora; o resto vale para o período escolhido.</p>
      </div>

      {/* Dinheiro parado */}
      <div className="card">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="font-bold text-sm">💸 Dinheiro esperando resposta</div>
          <div className="text-sm"><strong>{fmtBRL(idle.total)}</strong> <span className="text-steel-500">aguardando o cliente</span></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
          {idle.buckets.map(b => (
            <div key={b.key} className={`rounded-xl border px-3 py-2.5 ${b.n ? TONE[b.tone] : 'bg-steel-50 border-steel-200 text-steel-500'}`}>
              <div className="text-[11px] font-semibold">{b.label}</div>
              <div className="text-lg font-bold font-display">{fmtBRL(b.value)}</div>
              <div className="text-[11px] opacity-80">{b.n} orçamento{b.n === 1 ? '' : 's'}</div>
            </div>
          ))}
        </div>
        {idle.ready.n > 0 && (
          <p className="text-xs text-steel-500 mt-2">
            Fora desse total: <strong className="text-steel-700">{idle.ready.n} check-up{idle.ready.n === 1 ? '' : 's'} pronto{idle.ready.n === 1 ? '' : 's'} sem enviar</strong>
            {idle.ready.value > 0 && <> ({fmtBRL(idle.ready.value)})</>} — o cliente nem recebeu o orçamento ainda.
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* O que mais recusam */}
        <div className="card">
          <div className="font-bold text-sm">🚫 O que mais recusam</div>
          <p className="text-[11px] text-steel-500 mb-3">Itens do check-up que o cliente marcou “agora não”, nos orçamentos respondidos no período.</p>
          {declined.length === 0 ? (
            <p className="text-sm text-steel-400 py-4 text-center">Nenhum item recusado no período.</p>
          ) : (
            <ul className="space-y-2.5">
              {declined.map(d => (
                <li key={d.label}>
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="font-semibold truncate">{d.label}</span>
                    <span className="font-bold shrink-0">{fmtBRL(d.declinedValue)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-steel-100 mt-1 overflow-hidden">
                    <div className="h-full rounded-full bg-alert-500" style={{ width: `${(d.declinedValue / maxDecl) * 100}%` }} />
                  </div>
                  <div className="text-[11px] text-steel-500 mt-0.5">recusado {d.declined} de {d.offered} vez{d.offered === 1 ? '' : 'es'} ({Math.round((d.declined / d.offered) * 100)}%)</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tempo de resposta */}
        <div className="card">
          <div className="font-bold text-sm">⏱ Quanto o cliente demora para responder</div>
          <p className="text-[11px] text-steel-500 mb-3">Do envio do orçamento até a resposta, e quanto aprovam em cada faixa.</p>
          {cycle.n === 0 ? (
            <p className="text-sm text-steel-400 py-4 text-center">Sem respostas com data no período.</p>
          ) : (
            <>
              <div className="flex gap-6 mb-3">
                <div><div className="text-[11px] text-steel-500">Média</div><div className="text-xl font-bold font-display">{dias(cycle.avg!)}</div></div>
                <div><div className="text-[11px] text-steel-500">Típico (mediana)</div><div className="text-xl font-bold font-display">{dias(cycle.median!)}</div></div>
                <div><div className="text-[11px] text-steel-500">Respostas</div><div className="text-xl font-bold font-display">{cycle.n}</div></div>
              </div>
              <ul className="space-y-2">
                {cycle.bands.map(b => (
                  <li key={b.label}>
                    <div className="flex justify-between gap-2 text-sm">
                      <span>{b.label} <span className="text-steel-400 text-xs">({b.n})</span></span>
                      <strong>{b.rate == null ? '—' : `${Math.round(b.rate)}% aprovam`}</strong>
                    </div>
                    <div className="h-1.5 rounded-full bg-steel-100 mt-1 overflow-hidden">
                      <div className="h-full rounded-full bg-signal-500" style={{ width: `${b.rate ?? 0}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Por mecânico */}
      <div className="card !p-0 overflow-hidden">
        <div className="px-5 pt-4 pb-2">
          <div className="font-bold text-sm">🔧 Check-ups por mecânico</div>
          <p className="text-[11px] text-steel-500">Quem faz o check-up que o cliente aprova. Conta só check-ups (o orçamento direto na OS não tem mecânico).</p>
        </div>
        {ranking.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-steel-400 text-center">Nenhum check-up respondido no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-steel-500 border-y border-steel-100 bg-steel-50">
                  <th className="text-left font-semibold px-5 py-2">Mecânico</th>
                  <th className="text-right font-semibold px-3 py-2">Respondidos</th>
                  <th className="text-right font-semibold px-3 py-2">Aprovados</th>
                  <th className="text-right font-semibold px-3 py-2">Taxa</th>
                  <th className="text-right font-semibold px-3 py-2">Valor aprovado</th>
                  <th className="text-right font-semibold px-3 py-2">Ticket</th>
                  <th className="text-right font-semibold px-5 py-2">Em aberto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-steel-100">
                {ranking.map((m, i) => (
                  <tr key={m.id}>
                    <td className="px-5 py-2.5 font-semibold">{i === 0 && m.approvedValue > 0 ? '🏆 ' : ''}{m.name}</td>
                    <td className="px-3 py-2.5 text-right">{m.answered}</td>
                    <td className="px-3 py-2.5 text-right">{m.approved}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{m.rate == null ? '—' : `${Math.round(m.rate)}%`}</td>
                    <td className="px-3 py-2.5 text-right font-bold">{fmtBRL(m.approvedValue)}</td>
                    <td className="px-3 py-2.5 text-right text-steel-600">{m.approved ? fmtBRL(m.ticket) : '—'}</td>
                    <td className="px-5 py-2.5 text-right text-steel-500">{m.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
