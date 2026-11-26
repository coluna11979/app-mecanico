import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import QuotasTab from './QuotasTab';
import {
  CATEGORIES, EXPANSION_STATUS, INSTRUMENTS, NOTICE, PARTICIPATION_NOTE, PROJECTION_NOTICE,
  brl, monthLabel, monthsFrom, openFile, participation, pctLabel,
  type Closing, type Expansion, type Investor, type Projection, type Valuation,
} from '@/lib/investors';

type Share = { month: string; pct: number; amount: number };
type Payment = { id: string; paid_at: string; amount: number; receipt_path: string | null; note: string | null };
type Doc = { id: string; name: string; path: string };
type Kpi = { month: string; mechanics_new: number; workshops_new: number; jobs: number; gross: number; note: string | null };
type Live = {
  mechanics_today: number; mechanics_month: number; mechanics_total: number;
  workshops_today: number; workshops_month: number; workshops_total: number;
  jobs_today: number; jobs_month: number; jobs_paid_today: number;
  gross_today: number; gross_month: number; generated_at: string;
};
type Tab = 'resumo' | 'extrato' | 'plataforma' | 'previsao' | 'cotas' | 'documentos';
const TABS: { key: Tab; label: string }[] = [
  { key: 'resumo', label: 'Resumo' },
  { key: 'extrato', label: 'Extrato' },
  { key: 'plataforma', label: 'Plataforma' },
  { key: 'previsao', label: 'Previsão' },
  { key: 'cotas', label: 'Cotas' },
  { key: 'documentos', label: 'Documentos' },
];

const dateBR = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00').toLocaleDateString('pt-BR');
const realized = (c: Closing) => c.revenue_apps + c.revenue_manual - c.costs - c.taxes;

/** Painel do investidor (mobile-first). Só números agregados da plataforma: nada de oficina, mecânico ou cliente. */
export default function Investidor() {
  const { signOut } = useAuth();
  const [state, setState] = useState<'loading' | 'none' | 'ok'>('loading');
  const [tab, setTab] = useState<Tab>('resumo');
  const [me, setMe] = useState<Investor | null>(null);
  const [closings, setClosings] = useState<Closing[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [proj, setProj] = useState<Projection[]>([]);
  const [live, setLive] = useState<Live | null>(null);
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [expansion, setExpansion] = useState<Expansion[]>([]);

  // Números do dia: só quantidades, atualizam sozinhos a cada minuto
  useEffect(() => {
    if (state !== 'ok') return;
    const load = () => supabase.rpc('investor_live_stats').then(({ data }) => { if (data) setLive(data as Live); });
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [state]);

  useEffect(() => {
    (async () => {
      // Liga o login ao cadastro feito pelo admin (pelo e-mail)
      const { data: id } = await supabase.rpc('investor_claim');
      if (!id) { setState('none'); return; }
      const [i, c, s, p, d] = await Promise.all([
        supabase.from('investors').select('*').maybeSingle(),
        supabase.from('investor_closings').select('*').order('month', { ascending: false }),
        supabase.from('investor_closing_shares').select('month, pct, amount'),
        supabase.from('investor_payments').select('id, paid_at, amount, receipt_path, note').order('paid_at', { ascending: false }),
        supabase.from('investor_documents').select('id, name, path').order('created_at'),
      ]);
      const inv = i.data as Investor | null;
      if (!inv) { setState('none'); return; }
      setMe({ ...inv, amount: Number(inv.amount), share_pct: Number(inv.share_pct) });
      setClosings(((c.data ?? []) as Closing[]).map(x => ({
        ...x, revenue_apps: +x.revenue_apps, revenue_manual: +x.revenue_manual, costs: +x.costs,
        taxes: +x.taxes, reserve: +x.reserve, distributable: +x.distributable,
      })));
      setShares(((s.data ?? []) as Share[]).map(x => ({ ...x, amount: Number(x.amount), pct: Number(x.pct) })));
      setPayments(((p.data ?? []) as Payment[]).map(x => ({ ...x, amount: Number(x.amount) })));
      setDocs((d.data ?? []) as Doc[]);
      const [val, pr, ex, kp] = await Promise.all([
        supabase.from('investor_valuation').select('amount, ref_date, basis, note').maybeSingle(),
        supabase.from('investor_projections').select('scenario, month, revenue, costs, note').eq('scenario', 'base').order('month'),
        supabase.from('investor_expansion').select('id, region, status, expected_date, note').order('expected_date', { nullsFirst: false }),
        supabase.from('investor_kpi_projections').select('month, mechanics_new, workshops_new, jobs, gross, note').order('month'),
      ]);
      setKpis(((kp.data ?? []) as Kpi[]).map(x => ({ ...x, gross: Number(x.gross) })));
      setExpansion((ex.data ?? []) as Expansion[]);
      if (val.data) setValuation({ ...(val.data as Valuation), amount: Number(val.data.amount) });
      setProj(((pr.data ?? []) as Projection[]).map(x => ({ ...x, revenue: Number(x.revenue), costs: Number(x.costs) })));
      setState('ok');
    })();
  }, []);

  if (state === 'loading') {
    return <Page><div className="py-24 text-center text-steel-500 animate-pulse">Carregando seus números…</div></Page>;
  }
  if (state === 'none' || !me) {
    return (
      <Page onExit={signOut}>
        <div className="rounded-3xl bg-white dark:bg-steel-800 border border-steel-200 dark:border-steel-700 p-6 mt-8">
          <h1 className="text-lg font-bold">Não encontramos seu cadastro</h1>
          <p className="text-sm text-steel-500 mt-2">Entre com o e-mail informado no cadastro de investidor ou fale com a equipe.</p>
        </div>
      </Page>
    );
  }

  const last = closings[0];
  const lastShare = last ? shares.find(s => s.month === last.month) : undefined;
  const part = participation(me.amount, valuation?.amount);
  const totalShare = shares.reduce((s, x) => s + x.amount, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const toReceive = totalShare - totalPaid;
  const nextMonth = monthsFrom(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`, 2)[1];
  const nextProj = proj.find(p => p.month === nextMonth);
  const nextKpi = kpis.find(k => k.month === nextMonth);
  const bars = [...closings].slice(0, 6).reverse().map(c => ({ label: monthLabel(c.month).slice(0, 3), value: c.distributable }));
  const signals = buildSignals({ closings, proj, kpis, live });

  return (
    <Page onExit={signOut} name={me.name}>
      {/* Resumo do investidor */}
      <section className="relative overflow-hidden rounded-3xl bg-steel-900 text-white p-5 sm:p-7 shadow-xl">
        <div aria-hidden className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(120% 90% at 100% 0%, rgba(255,106,0,.32), transparent 55%), radial-gradient(80% 60% at 0% 100%, rgba(255,255,255,.06), transparent 60%)' }} />
        <div className="relative">
          <div className="text-xs uppercase tracking-[.18em] text-steel-300">Seu aporte</div>
          <div className="mt-1 text-4xl sm:text-5xl font-bold tabular-nums tracking-tight">{brl(me.amount)}</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/10 px-3 py-1">{INSTRUMENTS[me.instrument]}</span>
            <span className="rounded-full bg-white/10 px-3 py-1">desde {dateBR(me.invested_at)}</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
            <HeroStat label="Participação se converter" value={part === null ? '—' : pctLabel(part)} />
            <HeroStat label="% do resultado" value={`${me.share_pct.toLocaleString('pt-BR')}%`} />
            <HeroStat label="A receber" value={brl(toReceive)} accent={toReceive > 0} />
          </div>
        </div>
      </section>

      {/* Abas */}
      <nav aria-label="Seções" className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-steel-50/90 dark:bg-steel-900/90 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} aria-current={tab === t.key}
              className={`min-h-[44px] px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${tab === t.key
                ? 'bg-steel-900 text-white dark:bg-white dark:text-steel-900'
                : 'bg-white dark:bg-steel-800 text-steel-600 dark:text-steel-300 border border-steel-200 dark:border-steel-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="space-y-4">
        {tab === 'resumo' && (
          <>
            <Thermometer part={part} amount={me.amount} valuation={valuation} signals={signals} />
            {last ? (
              <Card title={`Último mês fechado · ${monthLabel(last.month)}`}>
                <div className="grid grid-cols-2 gap-3">
                  <Big label="Resultado distribuível" value={brl(last.distributable)} tone={last.distributable < 0 ? 'neg' : 'default'} />
                  <Big label="Sua parte" value={brl(lastShare?.amount ?? 0)} tone="brand" />
                </div>
                {bars.length > 1 && (
                  <div className="mt-5">
                    <div className="text-xs text-steel-500 mb-2">Resultado distribuível por mês</div>
                    <MiniBars items={bars} />
                  </div>
                )}
              </Card>
            ) : (
              <Empty icon="🗓️" title="Nenhum mês fechado ainda" text="Seus resultados aparecem aqui depois do primeiro fechamento mensal." />
            )}

            <Card title="Acumulado">
              <div className="grid grid-cols-3 gap-2">
                <Tile label="Sua parte" value={brl(totalShare)} />
                <Tile label="Já recebido" value={brl(totalPaid)} />
                <Tile label="A receber" value={brl(toReceive)} strong />
              </div>
            </Card>

            {valuation && (
              <Card title="Valuation de referência">
                <div className="text-3xl font-bold tabular-nums">{brl(valuation.amount)}</div>
                <p className="text-sm text-steel-500 mt-1">{dateBR(valuation.ref_date)} · {valuation.basis}</p>
                {valuation.note && <p className="text-sm mt-2">{valuation.note}</p>}
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-brand-600 font-semibold min-h-[44px] flex items-center">Como calculamos sua participação</summary>
                  <p className="text-steel-500">
                    {brl(me.amount)} ÷ {brl(valuation.amount)} = {part === null ? '—' : pctLabel(part)}. {PARTICIPATION_NOTE}
                  </p>
                </details>
              </Card>
            )}

            {expansion.length > 0 && (
              <Card title="Expansão: próximas regiões">
                <ul className="divide-y divide-steel-100 dark:divide-steel-700">
                  {['operando', 'proxima', 'planejada'].flatMap(st => expansion.filter(e => e.status === st)).map(e => (
                    <li key={e.id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <b>{e.region}</b>
                        <span className={`text-xs rounded-full px-2.5 py-1 font-semibold whitespace-nowrap ${e.status === 'operando'
                          ? 'bg-green-500/15 text-green-700 dark:text-green-400'
                          : e.status === 'proxima' ? 'bg-brand-500/15 text-brand-600' : 'bg-steel-100 dark:bg-steel-700 text-steel-500'}`}>
                          {EXPANSION_STATUS[e.status]}
                        </span>
                      </div>
                      {e.expected_date && <div className="text-xs text-steel-500">previsto para {monthLabel(e.expected_date.slice(0, 7) + '-01')}</div>}
                      {e.note && <div className="text-xs text-steel-500 mt-0.5">{e.note}</div>}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-steel-500 mt-2">Datas são previsões e podem mudar.</p>
              </Card>
            )}
          </>
        )}

        {tab === 'extrato' && (
          <>
            <Extrato closings={closings} shares={shares} payments={payments} sharePct={me.share_pct} />
            <Card title="Pagamentos recebidos">
              {payments.length === 0 && <p className="text-sm text-steel-500">Nenhum pagamento registrado ainda.</p>}
              <ul className="divide-y divide-steel-100 dark:divide-steel-700">
                {payments.map(p => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span>
                      {dateBR(p.paid_at)}
                      {p.note && <span className="block text-xs text-steel-500">{p.note}</span>}
                      {p.receipt_path && (
                        <button className="text-xs text-brand-600 underline min-h-[44px]" onClick={() => openFile(p.receipt_path!)}>ver comprovante</button>
                      )}
                    </span>
                    <b className="tabular-nums">{brl(p.amount)}</b>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}

        {tab === 'plataforma' && (
          live ? (
            <>
              <section className="rounded-3xl bg-steel-900 text-white p-5 sm:p-6 relative overflow-hidden">
                <div aria-hidden className="absolute inset-0 pointer-events-none"
                  style={{ background: 'radial-gradient(90% 80% at 100% 0%, rgba(255,106,0,.28), transparent 60%)' }} />
                <div className="relative">
                  <div className="text-xs uppercase tracking-[.18em] text-steel-300">Faturamento bruto do dia</div>
                  <div className="mt-1 text-4xl font-bold tabular-nums">{brl(live.gross_today)}</div>
                  <div className="text-sm text-steel-300 mt-1">{brl(live.gross_month)} no mês</div>
                </div>
              </section>
              <div className="grid grid-cols-2 gap-3">
                <LiveTile icon="🔧" label="Mecânicos cadastrados hoje" value={live.mechanics_today} sub={`${live.mechanics_month} no mês · ${live.mechanics_total} no total`} />
                <LiveTile icon="🏪" label="Oficinas cadastradas hoje" value={live.workshops_today} sub={`${live.workshops_month} no mês · ${live.workshops_total} no total`} />
                <LiveTile icon="📋" label="Demandas públicas hoje" value={live.jobs_today} sub={`${live.jobs_month} no mês`} />
                <LiveTile icon="✅" label="Demandas pagas hoje" value={live.jobs_paid_today} />
              </div>
              <p className="text-xs text-steel-500 px-1">
                Só quantidades, atualizadas a cada minuto (última às {new Date(live.generated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}).
                O faturamento bruto é o que as oficinas pagaram pelos serviços; <b>não é a receita da plataforma</b>.
                A receita é a margem e só vale depois do fechamento do mês.
              </p>
            </>
          ) : <Empty icon="📡" title="Carregando números do dia…" text="" />
        )}

        {tab === 'previsao' && (
          <>
            <p className="text-xs rounded-2xl bg-pending-500/10 px-4 py-3 text-steel-600 dark:text-steel-300">⚠️ {PROJECTION_NOTICE}</p>
            {nextProj ? (
              <Card title={`Previsão para ${monthLabel(nextMonth)}`}>
                <div className="grid grid-cols-3 gap-2">
                  <Tile label="Receita" value={brl(nextProj.revenue)} />
                  <Tile label="Custos" value={brl(nextProj.costs)} />
                  <Tile label="Resultado" value={brl(nextProj.revenue - nextProj.costs)} strong />
                </div>
                {nextKpi && live && (
                  <table className="w-full text-sm mt-4">
                    <thead><tr className="text-xs text-steel-500 text-left">
                      <th className="font-medium pb-1"></th><th className="font-medium pb-1 text-right">este mês até agora</th><th className="font-medium pb-1 text-right">previsto</th>
                    </tr></thead>
                    <tbody className="divide-y divide-steel-100 dark:divide-steel-700 tabular-nums">
                      <KpiRow l="Mecânicos novos" now={String(live.mechanics_month)} next={String(nextKpi.mechanics_new)} />
                      <KpiRow l="Oficinas novas" now={String(live.workshops_month)} next={String(nextKpi.workshops_new)} />
                      <KpiRow l="Demandas públicas" now={String(live.jobs_month)} next={String(nextKpi.jobs)} />
                      <KpiRow l="Faturamento bruto" now={brl(live.gross_month)} next={brl(nextKpi.gross)} />
                    </tbody>
                  </table>
                )}
                {nextKpi?.note && <p className="text-xs text-steel-500 mt-3">{nextKpi.note}</p>}
              </Card>
            ) : <Empty icon="🔭" title="Sem previsão para o próximo mês" text="Quando a equipe publicar a previsão, ela aparece aqui." />}

            {proj.length > 0 && (
              <Card title="Previsto × realizado (cenário base)">
                <p className="text-xs text-steel-500 mb-2">Resultado antes da reserva, mês a mês.</p>
                <ul className="divide-y divide-steel-100 dark:divide-steel-700">
                  {proj.map(p => {
                    const c = closings.find(x => x.month === p.month);
                    const prev = p.revenue - p.costs;
                    const real = c ? realized(c) : null;
                    return (
                      <li key={p.month} className="py-3 flex items-center justify-between gap-3 text-sm">
                        <b>{monthLabel(p.month)}</b>
                        <span className="text-right tabular-nums">
                          <span className="block">previsto {brl(prev)}</span>
                          <span className={`block text-xs ${real === null ? 'text-steel-500' : real >= prev ? 'text-green-600 dark:text-green-400' : 'text-alert-500'}`}>
                            {real === null ? 'ainda não fechado' : `realizado ${brl(real)}`}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </>
        )}

        {tab === 'cotas' && <QuotasTab me={me} />}

        {tab === 'documentos' && (
          <>
            {me.conditions && (
              <Card title="Suas condições">
                <p className="text-sm whitespace-pre-line">{me.conditions}</p>
              </Card>
            )}
            <Card title="Documentos">
              {docs.length === 0 && <p className="text-sm text-steel-500">Nenhum documento disponível ainda.</p>}
              <ul className="divide-y divide-steel-100 dark:divide-steel-700">
                {docs.map(d => (
                  <li key={d.id}>
                    <button className="w-full flex items-center gap-3 py-3 min-h-[48px] text-left text-sm active:opacity-70" onClick={() => openFile(d.path)}>
                      <span aria-hidden className="text-lg">📄</span>
                      <span className="flex-1 font-medium">{d.name}</span>
                      <span className="text-brand-600 text-xs font-semibold">abrir</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>

      <p className="text-xs text-steel-500 text-center pt-2 pb-10">⚠️ {NOTICE}</p>
    </Page>
  );
}

/* ── Extrato mensal (como a prestação de contas de condomínio) ─────────── */
function Extrato({ closings, shares, payments, sharePct }: {
  closings: Closing[]; shares: Share[]; payments: Payment[]; sharePct: number;
}) {
  const [month, setMonth] = useState<string>(closings[0]?.month ?? '');
  if (closings.length === 0) {
    return <Empty icon="🧾" title="Nenhum mês fechado ainda" text="O extrato aparece depois do primeiro fechamento mensal." />;
  }
  const c = closings.find(x => x.month === month) ?? closings[0];
  const share = shares.find(s => s.month === c.month);
  const nextMonthStart = monthsFrom(c.month, 2)[1];
  const paidInMonth = payments.filter(p => p.paid_at.slice(0, 7) === c.month.slice(0, 7)).reduce((s, p) => s + p.amount, 0);
  const owedUntil = shares.filter(s => s.month <= c.month).reduce((s, x) => s + x.amount, 0);
  const paidUntil = payments.filter(p => p.paid_at < nextMonthStart).reduce((s, p) => s + p.amount, 0);
  const cats = Object.entries(c.snapshot?.custos_por_categoria ?? {});
  const entradas = c.revenue_apps + c.revenue_manual;
  const saidas = c.costs + c.taxes + c.reserve;

  return (
    <Card title="Extrato mensal">
      <label className="block">
        <span className="sr-only">Mês</span>
        <select className="input w-full min-h-[48px] font-semibold" value={c.month} onChange={e => setMonth(e.target.value)}>
          {closings.map(x => <option key={x.month} value={x.month}>{monthLabel(x.month)}</option>)}
        </select>
      </label>

      <Section title="Entradas" tone="in">
        {c.snapshot?.receitas_por_tipo && Object.keys(c.snapshot.receitas_por_tipo).length > 0
          ? Object.entries(c.snapshot.receitas_por_tipo).map(([k, val]) => <Line key={k} l={k} v={Number(val)} />)
          : <><Line l="Receita do app (margem das demandas)" v={c.revenue_apps} /><Line l="Mensalidades" v={c.revenue_manual} /></>}
        <Sum l="Total de entradas" v={entradas} />
      </Section>

      <Section title="Saídas" tone="out">
        {cats.map(([k, v]) => <Line key={k} l={CATEGORIES[k] ?? k} v={-Number(v)} />)}
        {c.reserve > 0 && <Line l="Reserva" v={-c.reserve} />}
        <Sum l="Total de saídas" v={-saidas} />
      </Section>

      <div className="mt-5 rounded-2xl bg-steel-900 text-white p-4 flex items-center justify-between gap-3">
        <span className="text-sm text-steel-300">Resultado distribuível</span>
        <b className={`text-xl tabular-nums ${c.distributable < 0 ? 'text-red-300' : ''}`}>{brl(c.distributable)}</b>
      </div>

      <Section title="Você" tone="you">
        <div className="flex items-center justify-between rounded-2xl bg-brand-500/10 px-4 py-3">
          <span className="text-sm font-semibold">Sua parte ({(share?.pct ?? sharePct).toLocaleString('pt-BR')}%)</span>
          <b className="text-lg text-brand-600 tabular-nums">{brl(share?.amount ?? 0)}</b>
        </div>
        <Line l="Pago a você neste mês" v={paidInMonth} />
        <Line l="Saldo a receber até este mês" v={owedUntil - paidUntil} />
      </Section>

      <p className="text-xs text-steel-500 mt-4">
        Fechado em {new Date(c.closed_at).toLocaleDateString('pt-BR')}. Mês fechado não muda mais. O número oficial é o do contador.
      </p>
    </Card>
  );
}

/* ── Peças de interface ───────────────────────────────────────────────── */
function Page({ children, onExit, name }: { children: ReactNode; onExit?: () => void; name?: string }) {
  return (
    <div className="min-h-screen bg-steel-50 dark:bg-steel-900 text-steel-900 dark:text-white">
      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[.18em] text-brand-600 font-semibold">Painel do investidor</div>
            {name && <h1 className="text-lg font-bold truncate">Olá, {name.split(' ')[0]}</h1>}
          </div>
          {onExit && <button className="btn-ghost text-sm min-h-[44px] px-4" onClick={onExit}>Sair</button>}
        </header>
        {children}
      </div>
    </div>
  );
}

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-3xl bg-white dark:bg-steel-800 border border-steel-200 dark:border-steel-700 p-5 shadow-sm">
    <h2 className="text-xs uppercase tracking-[.14em] text-steel-500 font-semibold mb-3">{title}</h2>
    {children}
  </section>
);

const Empty = ({ icon, title, text }: { icon: string; title: string; text: string }) => (
  <div className="rounded-3xl border border-dashed border-steel-300 dark:border-steel-600 p-8 text-center">
    <div aria-hidden className="text-3xl">{icon}</div>
    <div className="font-semibold mt-2">{title}</div>
    {text && <p className="text-sm text-steel-500 mt-1">{text}</p>}
  </div>
);

const HeroStat = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className={`rounded-2xl px-3 py-3 ${accent ? 'bg-brand-500 text-white' : 'bg-white/10'}`}>
    <div className={`text-[11px] leading-tight ${accent ? 'text-white/85' : 'text-steel-300'}`}>{label}</div>
    <div className="mt-1 text-base sm:text-lg font-bold tabular-nums break-words">{value}</div>
  </div>
);

const Big = ({ label, value, tone }: { label: string; value: string; tone?: 'neg' | 'brand' | 'default' }) => (
  <div>
    <div className="text-xs text-steel-500">{label}</div>
    <div className={`text-2xl sm:text-3xl font-bold tabular-nums ${tone === 'neg' ? 'text-alert-500' : tone === 'brand' ? 'text-brand-600' : ''}`}>{value}</div>
  </div>
);

const Tile = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`rounded-2xl p-3 ${strong ? 'bg-steel-900 text-white' : 'bg-steel-50 dark:bg-steel-900'}`}>
    <div className={`text-[11px] leading-tight ${strong ? 'text-steel-300' : 'text-steel-500'}`}>{label}</div>
    <div className="mt-1 text-sm sm:text-base font-bold tabular-nums break-words">{value}</div>
  </div>
);

const LiveTile = ({ icon, label, value, sub }: { icon: string; label: string; value: number; sub?: string }) => (
  <div className="rounded-3xl bg-white dark:bg-steel-800 border border-steel-200 dark:border-steel-700 p-4">
    <div aria-hidden className="text-xl">{icon}</div>
    <div className="mt-2 text-4xl font-bold tabular-nums">{value}</div>
    <div className="text-xs font-semibold mt-1">{label}</div>
    {sub && <div className="text-[11px] text-steel-500 mt-0.5">{sub}</div>}
  </div>
);

const KpiRow = ({ l, now, next }: { l: string; now: string; next: string }) => (
  <tr><td className="py-2">{l}</td><td className="py-2 text-right text-steel-500">{now}</td><td className="py-2 text-right font-bold">{next}</td></tr>
);

function Section({ title, tone, children }: { title: string; tone: 'in' | 'out' | 'you'; children: ReactNode }) {
  const dot = tone === 'in' ? 'bg-green-500' : tone === 'out' ? 'bg-alert-500' : 'bg-brand-500';
  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[.14em] uppercase text-steel-500 mb-1">
        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />{title}
      </div>
      {children}
    </div>
  );
}
const Line = ({ l, v }: { l: string; v: number }) => (
  <div className="flex justify-between gap-3 py-1.5 text-sm"><span className="text-steel-600 dark:text-steel-300">{l}</span><span className="tabular-nums whitespace-nowrap">{brl(v)}</span></div>
);
const Sum = ({ l, v }: { l: string; v: number }) => (
  <div className="flex justify-between gap-3 border-t border-steel-200 dark:border-steel-700 mt-1 pt-2 text-sm font-bold"><span>{l}</span><span className="tabular-nums">{brl(v)}</span></div>
);

/** Barras simples (positivo em laranja, negativo em vermelho) com a linha do zero */
function MiniBars({ items }: { items: { label: string; value: number }[] }) {
  const H = 96;
  const max = Math.max(0, ...items.map(i => i.value));
  const min = Math.min(0, ...items.map(i => i.value));
  const range = max - min || 1;
  const zeroTop = (max / range) * H;
  return (
    <div>
      <div className="relative" style={{ height: H }}>
        <div className="absolute left-0 right-0 border-t border-dashed border-steel-300 dark:border-steel-600" style={{ top: zeroTop }} />
        <div className="absolute inset-0 flex items-stretch gap-2">
          {items.map((i, idx) => {
            const h = Math.max(2, (Math.abs(i.value) / range) * H);
            const top = i.value >= 0 ? zeroTop - h : zeroTop;
            return (
              <div key={idx} className="relative flex-1">
                <div className={`absolute left-1/4 right-1/4 rounded-md ${i.value >= 0 ? 'bg-brand-500' : 'bg-alert-500'}`}
                  style={{ top, height: h }} title={brl(i.value)} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2 mt-1">
        {items.map((i, idx) => <div key={idx} className="flex-1 text-center text-[11px] text-steel-500">{i.label}</div>)}
      </div>
    </div>
  );
}

/* ── Termômetro do momento ────────────────────────────────────────────────
   Indicador INFORMATIVO calculado só com os números que o investidor já vê:
   resultado realizado × previsto, tendência dos meses fechados, resultado positivo
   e cadastros/demandas do mês × previsão. Não é garantia nem recomendação. */
type Signal = { ok: -1 | 0 | 1; text: string };

function buildSignals({ closings, proj, kpis, live }: {
  closings: Closing[]; proj: Projection[]; kpis: Kpi[]; live: Live | null;
}): Signal[] {
  const out: Signal[] = [];
  const last = closings[0];
  const prev = closings[1];

  if (last) {
    const p = proj.find(x => x.month === last.month);
    if (p) {
      const planned = p.revenue - p.costs;
      const real = realized(last);
      if (planned > 0) {
        const ratio = real / planned;
        out.push({
          ok: ratio >= 1 ? 1 : ratio >= 0.7 ? 0 : -1,
          text: `Em ${monthLabel(last.month)}, o resultado antes da reserva foi ${brl(real)}, ${Math.round(ratio * 100)}% do previsto (${brl(planned)}).`,
        });
      } else {
        out.push({
          ok: real >= planned ? 1 : -1,
          text: `Em ${monthLabel(last.month)}, o resultado antes da reserva foi ${brl(real)}, contra ${brl(planned)} previstos.`,
        });
      }
    }
    out.push(last.distributable > 0
      ? { ok: 1, text: `${monthLabel(last.month)} fechou positivo, com ${brl(last.distributable)} distribuíveis depois dos custos, impostos e da reserva.` }
      : last.distributable < 0
        ? { ok: -1, text: `${monthLabel(last.month)} fechou com resultado distribuível negativo (${brl(last.distributable)}): os custos, impostos e a reserva superaram a receita do mês.` }
        : { ok: 0, text: `${monthLabel(last.month)} fechou sem resultado distribuível.` });
  }
  if (last && prev) {
    const up = last.distributable > prev.distributable;
    const down = last.distributable < prev.distributable;
    out.push({
      ok: up ? 1 : down ? -1 : 0,
      text: `O resultado distribuível ${up ? 'subiu' : down ? 'caiu' : 'ficou igual'} de ${brl(prev.distributable)} (${monthLabel(prev.month)}) para ${brl(last.distributable)} (${monthLabel(last.month)}).`,
    });
  }

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const kpi = kpis.find(k => k.month === monthKey);
  if (kpi && live) {
    const elapsed = now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const judge = (actual: number, goal: number, label: string, unit: string): Signal | null => {
      if (goal <= 0) return null;
      const expectedNow = goal * elapsed;
      const ok = actual >= expectedNow ? 1 : actual >= expectedNow * 0.7 ? 0 : -1;
      return { ok, text: `${label}: ${actual} ${unit} no mês, contra cerca de ${Math.round(expectedNow)} esperados até hoje (meta do mês: ${goal}).` };
    };
    const a = judge(live.mechanics_month + live.workshops_month, kpi.mechanics_new + kpi.workshops_new, 'Cadastros novos', 'cadastros');
    const b = judge(live.jobs_month, kpi.jobs, 'Demandas públicas', 'demandas');
    if (a) out.push(a);
    if (b) out.push(b);
  }
  return out;
}

function Thermometer({ part, amount, valuation, signals }: {
  part: number | null; amount: number; valuation: Valuation | null; signals: Signal[];
}) {
  const enough = signals.length >= 2;
  const avg = enough ? signals.reduce((s, x) => s + x.ok, 0) / signals.length : 0;
  const pos = Math.round(50 + avg * 50);
  const mood = avg > 0.34 ? { label: 'Em alta', color: 'text-green-600 dark:text-green-400' }
    : avg < -0.34 ? { label: 'Em atenção', color: 'text-alert-500' }
      : { label: 'Estável', color: 'text-pending-500' };
  const dot = (ok: number) => ok > 0 ? 'bg-green-500' : ok < 0 ? 'bg-alert-500' : 'bg-pending-500';

  return (
    <Card title="Momento da sua cota">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-xs text-steel-500">Participação estimada se o mútuo for convertido</div>
          <div className="text-3xl font-bold tabular-nums">{part === null ? '—' : pctLabel(part)}</div>
          <div className="text-xs text-steel-500">
            {brl(amount)}{valuation ? ` sobre um valuation de ${brl(valuation.amount)}` : ''}
          </div>
        </div>
        {enough && <div className={`text-right font-bold text-lg ${mood.color}`}>{mood.label}</div>}
      </div>

      {enough ? (
        <div className="mt-5">
          <div className="relative h-3 rounded-full" style={{ background: 'linear-gradient(90deg,#ef4444 0%,#f59e0b 50%,#22c55e 100%)' }}>
            <div className="absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white border-4 border-steel-900 shadow-md transition-all duration-700"
              style={{ left: `${pos}%` }} aria-label={`Termômetro em ${pos}%`} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-steel-500"><span>Atenção</span><span>Estável</span><span>Em alta</span></div>

          <div className="mt-4 text-xs uppercase tracking-[.14em] text-steel-500 font-semibold">Por que está assim</div>
          <ul className="mt-2 space-y-2">
            {signals.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot(s.ok)}`} />
                <span className="text-steel-700 dark:text-steel-200">{s.text}</span>
              </li>
            ))}
          </ul>
          <details className="mt-3 text-xs text-steel-500">
            <summary className="cursor-pointer min-h-[44px] flex items-center text-brand-600 font-semibold">Como o termômetro é calculado</summary>
            <p>
              Ele resume os indicadores acima: resultado realizado contra o previsto, resultado positivo ou negativo, tendência
              entre os últimos meses fechados e cadastros e demandas do mês contra a previsão. Cada indicador vale igual.
              É uma leitura informativa, não é garantia nem recomendação, e o número oficial é o do contador.
            </p>
          </details>
        </div>
      ) : (
        <p className="mt-4 text-sm text-steel-500 rounded-2xl bg-steel-50 dark:bg-steel-900 p-4">
          O termômetro aparece quando houver pelo menos dois indicadores, por exemplo um mês fechado com a previsão
          cadastrada pela equipe. Assim ele mostra como está o momento e explica o porquê.
        </p>
      )}
    </Card>
  );
}
