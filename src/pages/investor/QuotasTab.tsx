import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { brl, maskMoney, pctLabel, toNum, type Investor } from '@/lib/investors';

type Round = { valuation: number | null; cap_pct: number; sold: number; count: number; rank: number };
type Req = { id: string; kind: 'comprar' | 'vender'; amount: number; note: string | null; status: string; admin_note: string | null; created_at: string };

const STATUS: Record<string, { label: string; cls: string }> = {
  novo: { label: 'Enviado', cls: 'bg-brand-500/15 text-brand-600' },
  em_analise: { label: 'Em análise', cls: 'bg-pending-500/15 text-pending-500' },
  concluido: { label: 'Concluído', cls: 'bg-green-500/15 text-green-700 dark:text-green-400' },
  recusado: { label: 'Não atendido', cls: 'bg-alert-500/15 text-alert-500' },
  cancelado: { label: 'Cancelado', cls: 'bg-steel-100 dark:bg-steel-700 text-steel-500' },
};
const MIN = 20000, STEP = 1000;
const fmt = (n: number) => n.toLocaleString('pt-BR');

/** Cotas: o que ainda está disponível na primeira rodada e o pedido de venda da cota do investidor.
 *  São PEDIDOS: a equipe analisa e resolve com contrato. O sistema não compra, vende nem cobra nada. */
export default function QuotasTab({ me }: { me: Investor }) {
  const [round, setRound] = useState<Round | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [buy, setBuy] = useState('20.000');
  const [buyNote, setBuyNote] = useState('');
  const [sell, setSell] = useState(fmt(me.amount));
  const [sellNote, setSellNote] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string; where: 'buy' | 'sell' } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r, q] = await Promise.all([
      supabase.rpc('investor_round_status'),
      supabase.from('investor_quota_requests').select('*').order('created_at', { ascending: false }),
    ]);
    if (r.data) setRound({ ...r.data, valuation: r.data.valuation === null ? null : Number(r.data.valuation), cap_pct: Number(r.data.cap_pct), sold: Number(r.data.sold) });
    setReqs(((q.data ?? []) as Req[]).map(x => ({ ...x, amount: Number(x.amount) })));
  }, []);
  useEffect(() => { load(); }, [load]);

  const val = round?.valuation ?? null;
  const capAmount = val && round ? (val * round.cap_pct) / 100 : 0;
  const avail = val && round ? Math.max(0, Math.floor(capAmount - round.sold)) : 0;
  const soldPct = val && round ? (round.sold / val) * 100 : 0;
  const availPct = round ? Math.max(0, round.cap_pct - soldPct) : 0;
  const canBuy = !!val && avail >= MIN;
  const buyN = toNum(buy);
  const sellN = toNum(sell);
  const partNow = val ? (me.amount / val) * 100 : null;
  const partAfter = val ? ((me.amount + buyN) / val) * 100 : null;
  const open = reqs.filter(r => r.status === 'novo' || r.status === 'em_analise').length;

  async function send(kind: 'comprar' | 'vender') {
    const amount = kind === 'comprar' ? buyN : sellN;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('investor_quota_request', { p_kind: kind, p_amount: amount, p_note: kind === 'comprar' ? buyNote : sellNote });
    setBusy(false);
    const where = kind === 'comprar' ? 'buy' : 'sell';
    if (error) return setMsg({ kind: 'err', where, text: error.message });
    setMsg({ kind: 'ok', where, text: 'Pedido enviado. A equipe vai falar com você. Nada foi cobrado.' });
    if (kind === 'comprar') setBuyNote(''); else setSellNote('');
    load();
  }
  async function cancel(id: string) {
    await supabase.rpc('investor_quota_request_cancel', { p_id: id });
    load();
  }
  const bump = (cur: string, set: (v: string) => void, d: number, min: number, max: number) =>
    set(fmt(Math.min(max, Math.max(min, (toNum(cur) || min) + d))));

  return (
    <>
      {/* Primeira rodada + pertencimento */}
      <section className="relative overflow-hidden rounded-3xl bg-steel-900 text-white p-5 sm:p-6">
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(90% 80% at 100% 0%, rgba(255,106,0,.28), transparent 60%)' }} />
        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-[.18em] text-steel-300">Primeira rodada</div>
            {round && <span className="text-[11px] rounded-full bg-white/10 px-3 py-1">Investidor nº {round.rank} de {round.count}</span>}
          </div>
          <p className="mt-2 text-sm text-steel-200">
            Fase inicial para captar recursos e escalar o negócio. Você faz parte do grupo dos primeiros investidores, todos com as mesmas condições.
          </p>
          {val && round ? (
            <>
              <div className="mt-4 h-3 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-brand-500 transition-all duration-700"
                  style={{ width: `${capAmount ? Math.min(100, (round.sold / capAmount) * 100) : 0}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-xs text-steel-300">
                <span>{pctLabel(soldPct)} reservado de {pctLabel(round.cap_pct)}</span>
                <span>{avail >= MIN ? `${pctLabel(availPct)} disponível` : 'sem cotas disponíveis'}</span>
              </div>
            </>
          ) : <p className="mt-3 text-xs text-steel-300">O andamento da rodada aparece quando a equipe cadastrar o valuation.</p>}
        </div>
      </section>

      {/* Comprar */}
      <Card title="Cotas disponíveis para compra">
        {canBuy ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Mini label="Disponível agora" value={brl(avail)} sub={`${pctLabel(availPct)} do valuation`} />
              <Mini label="Mínimo por pedido" value={brl(MIN)} />
            </div>
            <Stepper label="Quanto você quer comprar?" value={buy} onChange={v => setBuy(maskMoney(v))}
              onMinus={() => bump(buy, setBuy, -STEP, MIN, avail)} onPlus={() => bump(buy, setBuy, STEP, MIN, avail)} />
            {partNow !== null && partAfter !== null && buyN >= MIN && (
              <div className="mt-3 rounded-2xl bg-steel-50 dark:bg-steel-900 p-3 text-sm">
                Sua participação estimada iria de <b>{pctLabel(partNow)}</b> para <b>{pctLabel(partAfter)}</b> se o valor for convertido.
              </div>
            )}
            <label className="mt-3 block"><span className="text-xs text-steel-500">Observação (opcional)</span>
              <textarea className="input mt-1" rows={2} maxLength={800} value={buyNote} onChange={e => setBuyNote(e.target.value)} /></label>
            <button className="btn-primary w-full mt-3 min-h-[52px]" disabled={busy || buyN < MIN || buyN > avail} onClick={() => send('comprar')}>
              {busy ? 'Enviando…' : 'Pedir para comprar'}
            </button>
            <Feedback m={msg} where="buy" />
            <p className="mt-3 text-xs text-steel-500">
              É um <b>pedido de interesse</b>. A equipe confirma a disponibilidade, as condições e o contrato antes de qualquer valor ser pago.
              A simulação segue a conta simples valor ÷ valuation e não considera teto, desconto nem rodadas futuras.
            </p>
          </>
        ) : (
          <p className="text-sm text-steel-500">
            {val ? 'Não há cotas disponíveis na primeira rodada no momento. Avisaremos se abrir uma nova fase.' : 'As cotas disponíveis aparecem quando a equipe cadastrar o valuation.'}
          </p>
        )}
      </Card>

      {/* Vender */}
      <Card title="Minha cota">
        <div className="grid grid-cols-2 gap-3">
          <Mini label="Meu aporte" value={brl(me.amount)} />
          <Mini label="Participação se converter" value={partNow === null ? '—' : pctLabel(partNow)} />
        </div>
        <details className="mt-4" open={false}>
          <summary className="cursor-pointer min-h-[48px] flex items-center font-semibold text-brand-600">Quero vender minha cota</summary>
          <Stepper label="Quanto da sua cota você quer vender?" value={sell} onChange={v => setSell(maskMoney(v))}
            onMinus={() => bump(sell, setSell, -STEP, STEP, me.amount)} onPlus={() => bump(sell, setSell, STEP, STEP, me.amount)} />
          <div className="mt-2 flex gap-2">
            <button type="button" className="text-xs underline text-brand-600" onClick={() => setSell(fmt(me.amount))}>vender tudo</button>
            <button type="button" className="text-xs underline text-brand-600" onClick={() => setSell(fmt(Math.floor(me.amount / 2)))}>vender metade</button>
          </div>
          <label className="mt-3 block"><span className="text-xs text-steel-500">Conte o motivo ou o que espera (opcional)</span>
            <textarea className="input mt-1" rows={2} maxLength={800} value={sellNote} onChange={e => setSellNote(e.target.value)} /></label>
          <button className="btn-ghost w-full mt-3 min-h-[52px]" disabled={busy || sellN <= 0 || sellN > me.amount} onClick={() => send('vender')}>
            {busy ? 'Enviando…' : 'Pedir para vender'}
          </button>
          <Feedback m={msg} where="sell" />
          <p className="mt-3 text-xs text-steel-500 leading-relaxed">
            Aqui você só <b>registra o pedido</b>. A venda depende do que o seu contrato prevê (consentimento da empresa, direito de preferência,
            novo contrato) e da existência de um comprador. <b>Não garantimos que haverá comprador, prazo ou preço</b>, e o sistema não faz a
            transferência nem movimenta dinheiro. Cada caso é tratado pela equipe, com apoio jurídico.
          </p>
        </details>
      </Card>

      {/* Pedidos */}
      <Card title="Meus pedidos">
        {reqs.length === 0 && <p className="text-sm text-steel-500">Você ainda não fez pedidos.</p>}
        <ul className="divide-y divide-steel-100 dark:divide-steel-700">
          {reqs.map(r => (
            <li key={r.id} className="py-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <b>{r.kind === 'comprar' ? 'Compra' : 'Venda'} · {brl(r.amount)}</b>
                <span className={`text-xs rounded-full px-2.5 py-1 font-semibold whitespace-nowrap ${STATUS[r.status]?.cls ?? ''}`}>{STATUS[r.status]?.label ?? r.status}</span>
              </div>
              <div className="text-xs text-steel-500">{new Date(r.created_at).toLocaleDateString('pt-BR')}{r.note ? ` · ${r.note}` : ''}</div>
              {r.admin_note && <div className="mt-1 text-xs rounded-lg bg-steel-50 dark:bg-steel-900 px-3 py-2">Resposta da equipe: {r.admin_note}</div>}
              {r.status === 'novo' && <button className="text-xs text-alert-500 underline min-h-[44px]" onClick={() => cancel(r.id)}>cancelar pedido</button>}
            </li>
          ))}
        </ul>
        {open >= 3 && <p className="text-xs text-steel-500 mt-2">Você já tem 3 pedidos em andamento. Aguarde a equipe responder para fazer outro.</p>}
      </Card>
    </>
  );
}

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-3xl bg-white dark:bg-steel-800 border border-steel-200 dark:border-steel-700 p-5 shadow-sm">
    <h2 className="text-xs uppercase tracking-[.14em] text-steel-500 font-semibold mb-3">{title}</h2>
    {children}
  </section>
);
const Mini = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="rounded-2xl bg-steel-50 dark:bg-steel-900 p-3">
    <div className="text-[11px] text-steel-500 leading-tight">{label}</div>
    <div className="mt-1 text-lg font-bold tabular-nums break-words">{value}</div>
    {sub && <div className="text-[11px] text-steel-500">{sub}</div>}
  </div>
);
function Stepper({ label, value, onChange, onMinus, onPlus }: { label: string; value: string; onChange: (v: string) => void; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="mt-4">
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" aria-label="Diminuir R$ 1.000" onClick={onMinus} className="h-12 w-12 shrink-0 rounded-full border-2 border-steel-300 dark:border-steel-600 text-2xl font-semibold active:scale-95">−</button>
        <input className="input text-center text-lg font-bold tabular-nums" inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} />
        <button type="button" aria-label="Aumentar R$ 1.000" onClick={onPlus} className="h-12 w-12 shrink-0 rounded-full border-2 border-steel-300 dark:border-steel-600 text-2xl font-semibold active:scale-95">+</button>
      </div>
    </div>
  );
}
const Feedback = ({ m, where }: { m: { kind: 'ok' | 'err'; text: string; where: string } | null; where: string }) =>
  m && m.where === where
    ? <p role="alert" className={`mt-3 rounded-xl px-4 py-3 text-sm ${m.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{m.text}</p>
    : null;
