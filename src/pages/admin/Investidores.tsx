import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/layout/AdminLayout';
import InvestorsTab from '@/components/admin/investors/InvestorsTab';
import InterestsTab from '@/components/admin/investors/InterestsTab';
import QuotaRequestsTab from '@/components/admin/investors/QuotaRequestsTab';
import DashboardTab from '@/components/admin/investors/DashboardTab';
import SimulatorToggle from '@/components/admin/investors/SimulatorToggle';
import RevenueTab from '@/components/admin/investors/RevenueTab';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/ui/Toast';
import {
  CATEGORIES, INSTRUMENTS, NOTICE, PROJECTION_NOTICE, SCENARIOS, brl, monthLabel, monthsFrom, openFile, toNum, uploadFile, maskMoney, numToInput,
  EXPANSION_STATUS, PARTICIPATION_NOTE, participation, pctLabel, type Closing, type Expansion, type Investor, type Projection,
} from '@/lib/investors';

type Tab = 'painel' | 'pedidos' | 'interessados' | 'investidores' | 'valuation' | 'receitas' | 'custos' | 'fechamento' | 'pagamentos';
const TABS: { key: Tab; label: string }[] = [
  { key: 'painel', label: 'Painel' },
  { key: 'interessados', label: 'Interessados' },
  { key: 'pedidos', label: 'Pedidos de cotas' },
  { key: 'investidores', label: 'Investidores' },
  { key: 'valuation', label: 'Valuation e projeções' },
  { key: 'receitas', label: 'Receitas' },
  { key: 'custos', label: 'Custos' },
  { key: 'fechamento', label: 'Fechamento' },
  { key: 'pagamentos', label: 'Pagamentos' },
];

type Cost = { id: string; month: string; category: string; description: string | null; amount: number; receipt_path: string | null };
type Payment = { id: string; investor_id: string; paid_at: string; amount: number; receipt_path: string | null; note: string | null };
type Doc = { id: string; investor_id: string; name: string; path: string };

const firstOfMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const prevMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return firstOfMonth(d); };
const today = () => new Date().toISOString().slice(0, 10);

/** Superadmin: investidores (mútuo/anjo). Não são sócios e não veem dado de oficina, mecânico ou cliente. */
export default function AdminInvestidores() {
  const [tab, setTab] = useState<Tab>('painel');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [closings, setClosings] = useState<Closing[]>([]);

  const loadBase = useCallback(async () => {
    const [i, c, s] = await Promise.all([
      supabase.from('investors').select('*').order('created_at'),
      supabase.from('investor_closings').select('*').order('month', { ascending: false }),
      supabase.from('app_settings').select('value').eq('key', 'investors_enabled').maybeSingle(),
    ]);
    setInvestors(((i.data ?? []) as Investor[]).map(x => ({ ...x, amount: Number(x.amount), share_pct: Number(x.share_pct) })));
    setClosings(((c.data ?? []) as Closing[]).map(x => ({
      ...x, revenue_apps: +x.revenue_apps, revenue_manual: +x.revenue_manual, costs: +x.costs,
      taxes: +x.taxes, reserve: +x.reserve, distributable: +x.distributable,
    })));
    setEnabled(s.data?.value === 'true');
  }, []);
  useEffect(() => { loadBase(); }, [loadBase]);

  async function toggleEnabled() {
    const next = !enabled;
    const { error } = await supabase.from('app_settings').update({ value: String(next) }).eq('key', 'investors_enabled');
    if (error) return toast.error('Não salvou: ' + error.message);
    setEnabled(next);
    toast.success(next ? 'Módulo ligado' : 'Módulo desligado');
  }

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-steel-900 dark:text-white">Investidores</h1>
            <p className="text-sm text-steel-500 mt-1">Aportes pequenos, mesmas condições para todos. Não são sócios e não veem dado de cliente.</p>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input type="checkbox" checked={!!enabled} onChange={toggleEnabled} className="h-5 w-5" />
            Módulo ligado
          </label>
        </div>
        <p className="mt-3 text-xs rounded-lg bg-pending-500/10 text-steel-600 dark:text-steel-300 px-3 py-2">⚠️ {NOTICE}</p>

        <div className="mt-4 flex gap-1 overflow-x-auto border-b border-steel-200 dark:border-steel-700">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === t.key
                ? 'border-brand-500 text-brand-600 font-semibold' : 'border-transparent text-steel-500'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === 'painel' && <DashboardTab investors={investors} closings={closings} />}
          {tab === 'pedidos' && <QuotaRequestsTab investors={investors} />}
          {tab === 'interessados' && <InterestsTab onConverted={loadBase} />}
          {tab === 'investidores' && <InvestorsTab investors={investors} reload={loadBase} />}
          {tab === 'valuation' && <ValuationTab closings={closings} />}
          {tab === 'receitas' && <RevenueTab closings={closings} />}
          {tab === 'custos' && <CostsTab closings={closings} />}
          {tab === 'fechamento' && <ClosingTab closings={closings} investors={investors} reload={loadBase} />}
          {tab === 'pagamentos' && <PaymentsTab investors={investors} />}
        </div>
      </div>
    </AdminLayout>
  );
}

/* ── Custos ───────────────────────────────────────────────────────────── */
function CostsTab({ closings }: { closings: Closing[] }) {
  const [month, setMonth] = useState(firstOfMonth());
  const [rows, setRows] = useState<Cost[]>([]);
  const [cat, setCat] = useState('equipe');
  const [desc, setDesc] = useState('');
  const [val, setVal] = useState('');
  const [file, setFile] = useState<File | undefined>();
  const closed = closings.some(c => c.month === month);

  const load = useCallback(async () => {
    const { data } = await supabase.from('investor_costs').select('*').eq('month', month).order('created_at');
    setRows(((data ?? []) as Cost[]).map(r => ({ ...r, amount: Number(r.amount) })));
  }, [month]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!toNum(val)) return toast.error('Informe o valor.');
    try {
      const receipt_path = file ? await uploadFile('costs', file) : null;
      const { error } = await supabase.from('investor_costs').insert({
        month, category: cat, description: desc.trim() || null, amount: toNum(val), receipt_path,
      });
      if (error) throw error;
      setDesc(''); setVal(''); setFile(undefined); load();
    } catch (e) { toast.error('Não salvou: ' + (e as Error).message); }
  }
  async function del(id: string) {
    const { error } = await supabase.from('investor_costs').delete().eq('id', id);
    if (error) return toast.error(error.message);
    load();
  }

  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="space-y-4">
      <MonthPicker value={month} onChange={setMonth} />
      {closed ? <p className="text-sm text-steel-500">Mês fechado: custos congelados.</p> : (
        <div className="rounded-xl border border-steel-200 dark:border-steel-700 p-4 grid sm:grid-cols-2 gap-3">
          <select className="input" value={cat} onChange={e => setCat(e.target.value)}>
            {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="block"><span className="text-xs text-steel-500">Valor (R$)</span><input className="input mt-1" placeholder="Valor (R$)" inputMode="decimal" value={val} onChange={e => setVal(maskMoney(e.target.value))} /></label>
          <label className="block sm:col-span-2"><span className="text-xs text-steel-500">Descrição (só o admin vê)</span><input className="input mt-1" placeholder="Descrição (só o admin vê)" value={desc} onChange={e => setDesc(e.target.value)} /></label>
          <input type="file" className="text-sm sm:col-span-2" onChange={e => setFile(e.target.files?.[0])} />
          <button className="btn-primary sm:col-span-2" onClick={add}>Lançar custo</button>
        </div>
      )}
      <p className="text-sm text-steel-500">Total do mês: <b>{brl(total)}</b></p>
      {rows.map(r => (
        <div key={r.id} className="flex justify-between gap-3 rounded-lg border border-steel-200 dark:border-steel-700 px-3 py-2 text-sm">
          <div>
            <b>{CATEGORIES[r.category]}</b> {r.description && <span className="text-steel-500">· {r.description}</span>}
            {r.receipt_path && <button className="ml-2 text-brand-600 underline" onClick={() => openFile(r.receipt_path!)}>comprovante</button>}
          </div>
          <div className="flex gap-3 items-center whitespace-nowrap">
            {brl(r.amount)}
            {!closed && <button className="text-alert-500" onClick={() => del(r.id)}>✕</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Fechamento ───────────────────────────────────────────────────────── */
function ClosingTab({ closings, investors, reload }: { closings: Closing[]; investors: Investor[]; reload: () => void }) {
  const [month, setMonth] = useState(prevMonth());
  const [reserve, setReserve] = useState('');
  const [busy, setBusy] = useState(false);
  const [shares, setShares] = useState<{ investor_id: string; pct: number; amount: number }[]>([]);
  const closed = closings.find(c => c.month === month);

  useEffect(() => {
    if (!closed) { setShares([]); return; }
    supabase.from('investor_closing_shares').select('investor_id, pct, amount').eq('month', month)
      .then(({ data }) => setShares(((data ?? []) as typeof shares).map(s => ({ ...s, amount: Number(s.amount), pct: Number(s.pct) }))));
  }, [month, closed]);

  async function close() {
    setBusy(true);
    const { error } = await supabase.rpc('investor_close_month', { p_month: month, p_reserve: toNum(reserve) });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Mês fechado e congelado'); reload();
  }

  return (
    <div className="space-y-4">
      <MonthPicker value={month} onChange={setMonth} onlyPast />
      {closed ? (
        <div className="rounded-xl border border-steel-200 dark:border-steel-700 p-4 space-y-1 text-sm">
          <div className="font-semibold mb-2">🔒 {monthLabel(month)} fechado em {new Date(closed.closed_at).toLocaleDateString('pt-BR')}</div>
          <Line l="Receita do app" v={closed.revenue_apps} />
          <Line l="Mensalidades (manual)" v={closed.revenue_manual} />
          <Line l="Custos" v={-closed.costs} />
          <Line l="Impostos" v={-closed.taxes} />
          <Line l="Reserva" v={-closed.reserve} />
          <div className="border-t border-steel-200 dark:border-steel-700 pt-2 mt-2 flex justify-between font-bold">
            <span>Resultado distribuível</span><span>{brl(closed.distributable)}</span>
          </div>
          <div className="pt-3 space-y-1">
            {shares.map(s => (
              <div key={s.investor_id} className="flex justify-between">
                <span>{investors.find(i => i.id === s.investor_id)?.name ?? '—'} ({s.pct}%)</span><b>{brl(s.amount)}</b>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-steel-200 dark:border-steel-700 p-4 space-y-3">
          <p className="text-sm text-steel-500">
            Resultado = receita do app + mensalidades − custos − impostos − reserva. Ao fechar, o mês congela e não muda mais.
            Só fecha meses já encerrados.
          </p>
          <label className="block"><span className="text-xs text-steel-500">Reserva do mês (R$)</span><input className="input mt-1" placeholder="Reserva do mês (R$)" inputMode="decimal" value={reserve} onChange={e => setReserve(maskMoney(e.target.value))} /></label>
          <button className="btn-primary" disabled={busy} onClick={close}>{busy ? 'Fechando…' : `Fechar ${monthLabel(month)}`}</button>
        </div>
      )}
    </div>
  );
}
const Line = ({ l, v }: { l: string; v: number }) => <div className="flex justify-between"><span className="text-steel-500">{l}</span><span>{brl(v)}</span></div>;

/* ── Pagamentos ───────────────────────────────────────────────────────── */
function PaymentsTab({ investors }: { investors: Investor[] }) {
  const [rows, setRows] = useState<Payment[]>([]);
  const [inv, setInv] = useState('');
  const [date, setDate] = useState(today());
  const [val, setVal] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | undefined>();

  const load = useCallback(async () => {
    const { data } = await supabase.from('investor_payments').select('*').order('paid_at', { ascending: false });
    setRows(((data ?? []) as Payment[]).map(r => ({ ...r, amount: Number(r.amount) })));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!inv || !toNum(val)) return toast.error('Escolha o investidor e o valor.');
    try {
      const receipt_path = file ? await uploadFile(`payments/${inv}`, file) : null;
      const { error } = await supabase.from('investor_payments').insert({
        investor_id: inv, paid_at: date, amount: toNum(val), note: note.trim() || null, receipt_path,
      });
      if (error) throw error;
      setVal(''); setNote(''); setFile(undefined); load(); toast.success('Pagamento registrado');
    } catch (e) { toast.error('Não salvou: ' + (e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-steel-500">Aqui você só registra o que já pagou. O sistema não movimenta dinheiro.</p>
      <div className="rounded-xl border border-steel-200 dark:border-steel-700 p-4 grid sm:grid-cols-2 gap-3">
        <select className="input" value={inv} onChange={e => setInv(e.target.value)}>
          <option value="">Investidor…</option>
          {investors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <label className="block"><span className="text-xs text-steel-500">Valor pago (R$)</span><input className="input mt-1" placeholder="Valor pago (R$)" inputMode="decimal" value={val} onChange={e => setVal(maskMoney(e.target.value))} /></label>
        <label className="block"><span className="text-xs text-steel-500">Observação</span><input className="input mt-1" placeholder="Observação" value={note} onChange={e => setNote(e.target.value)} /></label>
        <input type="file" className="text-sm sm:col-span-2" onChange={e => setFile(e.target.files?.[0])} />
        <button className="btn-primary sm:col-span-2" onClick={add}>Registrar pagamento</button>
      </div>
      {rows.map(r => (
        <div key={r.id} className="flex justify-between gap-3 rounded-lg border border-steel-200 dark:border-steel-700 px-3 py-2 text-sm">
          <div>
            <b>{investors.find(i => i.id === r.investor_id)?.name ?? '—'}</b>
            <span className="text-steel-500"> · {new Date(r.paid_at + 'T12:00').toLocaleDateString('pt-BR')}</span>
            {r.note && <span className="text-steel-500"> · {r.note}</span>}
            {r.receipt_path && <button className="ml-2 text-brand-600 underline" onClick={() => openFile(r.receipt_path!)}>comprovante</button>}
          </div>
          <b>{brl(r.amount)}</b>
        </div>
      ))}
    </div>
  );
}

/* ── Seletor de mês ───────────────────────────────────────────────────── */
function MonthPicker({ value, onChange, onlyPast }: { value: string; onChange: (m: string) => void; onlyPast?: boolean }) {
  const opts: string[] = [];
  const d = new Date(); d.setDate(1);
  if (onlyPast) d.setMonth(d.getMonth() - 1);
  for (let i = 0; i < 24; i++) { opts.push(firstOfMonth(d)); d.setMonth(d.getMonth() - 1); }
  return (
    <select className="input max-w-[12rem]" value={value} onChange={e => onChange(e.target.value)}>
      {opts.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
    </select>
  );
}

/* ── Valuation inicial e projeções ────────────────────────────────────── */
function ValuationTab({ closings }: { closings: Closing[] }) {
  const [v, setV] = useState({ amount: '', ref_date: today(), basis: '', note: '' });
  const [saved, setSaved] = useState(false);
  const [scenario, setScenario] = useState('base');
  const start = firstOfMonth();
  const months = monthsFrom(start, 12);
  const [grid, setGrid] = useState<Record<string, { revenue: string; costs: string; note: string }>>({});

  useEffect(() => {
    supabase.from('investor_valuation').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) {
        setV({ amount: numToInput(data.amount), ref_date: data.ref_date, basis: data.basis, note: data.note ?? '' });
        setSaved(true);
      }
    });
  }, []);

  useEffect(() => {
    supabase.from('investor_projections').select('*').eq('scenario', scenario).then(({ data }) => {
      const g: typeof grid = {};
      ((data ?? []) as Projection[]).forEach(p => {
        g[p.month] = { revenue: numToInput(p.revenue), costs: numToInput(p.costs), note: p.note ?? '' };
      });
      setGrid(g);
    });
  }, [scenario]);

  async function saveValuation() {
    if (!toNum(v.amount) || !v.basis.trim()) return toast.error('Informe o valor e a base do valuation.');
    const { error } = await supabase.from('investor_valuation').upsert({
      id: 1, amount: toNum(v.amount), ref_date: v.ref_date, basis: v.basis.trim(), note: v.note.trim() || null,
      updated_at: new Date().toISOString(),
    });
    if (error) return toast.error('Não salvou: ' + error.message);
    setSaved(true); toast.success('Valuation salvo');
  }

  const cell = (m: string) => grid[m] ?? { revenue: '', costs: '', note: '' };
  const setCell = (m: string, k: 'revenue' | 'costs' | 'note', val: string) =>
    setGrid(g => ({ ...g, [m]: { ...cell(m), [k]: val } }));

  async function saveProjection() {
    const rows = months
      .filter(m => toNum(cell(m).revenue) > 0 || toNum(cell(m).costs) > 0)
      .map(m => ({ scenario, month: m, revenue: toNum(cell(m).revenue), costs: toNum(cell(m).costs), note: cell(m).note.trim() || null }));
    if (!rows.length) return toast.error('Preencha ao menos um mês.');
    const { error } = await supabase.from('investor_projections').upsert(rows);
    if (error) return toast.error('Não salvou: ' + error.message);
    toast.success(`Projeção ${SCENARIOS[scenario].toLowerCase()} salva`);
  }

  const totRev = months.reduce((s, m) => s + toNum(cell(m).revenue), 0);
  const totCost = months.reduce((s, m) => s + toNum(cell(m).costs), 0);
  /** Realizado = receita − custos − impostos (antes da reserva), igual à base da projeção */
  const realized = (m: string) => {
    const c = closings.find(x => x.month === m);
    return c ? c.revenue_apps + c.revenue_manual - c.costs - c.taxes : null;
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-steel-200 dark:border-steel-700 p-4 space-y-3">
        <h2 className="font-semibold">Valuation inicial</h2>
        <p className="text-xs text-steel-500">Um único valor, com data e base. O investidor vê este cartão no painel dele.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="text-xs text-steel-500">Valuation (R$)</span><input className="input mt-1" placeholder="Valuation (R$)" inputMode="decimal" value={v.amount} onChange={e => setV({ ...v, amount: maskMoney(e.target.value) })} /></label>
          <input className="input" type="date" value={v.ref_date} onChange={e => setV({ ...v, ref_date: e.target.value })} />
          <label className="block sm:col-span-2"><span className="text-xs text-steel-500">Base usada (ex.: valor negociado, múltiplo da receita)</span><input className="input mt-1" placeholder="Base usada (ex.: valor negociado, múltiplo da receita)" value={v.basis} onChange={e => setV({ ...v, basis: e.target.value })} /></label>
          <label className="block sm:col-span-2"><span className="text-xs text-steel-500">Observação (aparece para o investidor)</span><textarea className="input mt-1" rows={2} placeholder="Observação (aparece para o investidor)" value={v.note} onChange={e => setV({ ...v, note: e.target.value })} /></label>
        </div>
        <button className="btn-primary" onClick={saveValuation}>{saved ? 'Atualizar valuation' : 'Salvar valuation'}</button>
      </section>

      <section className="rounded-xl border border-steel-200 dark:border-steel-700 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold">Projeções (12 meses)</h2>
          <select className="input max-w-[11rem]" value={scenario} onChange={e => setScenario(e.target.value)}>
            {Object.entries(SCENARIOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <p className="text-xs text-steel-500">
          Só o cenário Base aparece para o investidor. A coluna Realizado (meses fechados) aparece nos três cenários, para você comparar. Conservador e otimista são só seus.
          Custos = custos + impostos previstos (antes da reserva).
        </p>
        <p className="text-xs rounded-lg bg-pending-500/10 px-3 py-2">⚠️ {PROJECTION_NOTICE}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-xs text-steel-500">
              <th className="py-1">Mês</th><th>Receita</th><th>Custos</th><th className="text-right">Resultado</th>
              <th className="text-right">Realizado</th>
            </tr></thead>
            <tbody>
              {months.map(m => {
                const c = cell(m);
                const r = realized(m);
                return (
                  <tr key={m} className="border-t border-steel-200 dark:border-steel-700">
                    <td className="py-1 pr-2 whitespace-nowrap">{monthLabel(m)}</td>
                    <td className="pr-2"><input className="input !py-1" inputMode="decimal" value={c.revenue} onChange={e => setCell(m, 'revenue', maskMoney(e.target.value))} /></td>
                    <td className="pr-2"><input className="input !py-1" inputMode="decimal" value={c.costs} onChange={e => setCell(m, 'costs', maskMoney(e.target.value))} /></td>
                    <td className="text-right whitespace-nowrap">{brl(toNum(c.revenue) - toNum(c.costs))}</td>
                    <td className="text-right whitespace-nowrap">{r === null ? '—' : brl(r)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-steel-300 dark:border-steel-600 font-semibold">
                <td className="py-1">Total</td><td>{brl(totRev)}</td><td>{brl(totCost)}</td><td className="text-right">{brl(totRev - totCost)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <button className="btn-primary" onClick={saveProjection}>Salvar projeção {SCENARIOS[scenario].toLowerCase()}</button>
      </section>

      <SimulatorToggle />

      <KpiForecast />

      <ExpansionSection />
    </div>
  );
}

/* ── KPIs previstos do mês (o investidor vê o do próximo mês) ─────────── */
function KpiForecast() {
  const next = monthsFrom(firstOfMonth(), 2)[1];
  const [month, setMonth] = useState(next);
  const [f, setF] = useState({ mechanics_new: '', workshops_new: '', jobs: '', gross: '', note: '' });
  const opts = monthsFrom(firstOfMonth(), 12);

  useEffect(() => {
    setF({ mechanics_new: '', workshops_new: '', jobs: '', gross: '', note: '' });
    supabase.from('investor_kpi_projections').select('*').eq('month', month).maybeSingle().then(({ data }) => {
      if (data) setF({
        mechanics_new: String(data.mechanics_new), workshops_new: String(data.workshops_new), jobs: String(data.jobs),
        gross: numToInput(data.gross), note: data.note ?? '',
      });
    });
  }, [month]);

  const int = (s: string) => Math.max(0, Math.floor(Number(s.replace(/\D/g, '')) || 0));
  async function save() {
    const { error } = await supabase.from('investor_kpi_projections').upsert({
      month, mechanics_new: int(f.mechanics_new), workshops_new: int(f.workshops_new), jobs: int(f.jobs),
      gross: toNum(f.gross), note: f.note.trim() || null,
    });
    if (error) return toast.error('Não salvou: ' + error.message);
    toast.success('KPIs previstos salvos');
  }

  return (
    <section className="rounded-xl border border-steel-200 dark:border-steel-700 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-semibold">KPIs previstos do mês</h2>
        <select className="input max-w-[11rem]" value={month} onChange={e => setMonth(e.target.value)}>
          {opts.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>
      <p className="text-xs text-steel-500">O investidor vê o previsto do próximo mês no painel dele, só quantidades e totais. O faturamento bruto previsto é o que as oficinas pagariam pelos serviços, não a receita da plataforma.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="text-xs text-steel-500">Mecânicos novos no mês</span><input className="input mt-1" placeholder="Mecânicos novos no mês" inputMode="numeric" value={f.mechanics_new} onChange={e => setF({ ...f, mechanics_new: e.target.value.replace(/\D/g, '') })} /></label>
        <label className="block"><span className="text-xs text-steel-500">Oficinas novas no mês</span><input className="input mt-1" placeholder="Oficinas novas no mês" inputMode="numeric" value={f.workshops_new} onChange={e => setF({ ...f, workshops_new: e.target.value.replace(/\D/g, '') })} /></label>
        <label className="block"><span className="text-xs text-steel-500">Demandas públicas publicadas</span><input className="input mt-1" placeholder="Demandas públicas publicadas" inputMode="numeric" value={f.jobs} onChange={e => setF({ ...f, jobs: e.target.value.replace(/\D/g, '') })} /></label>
        <label className="block"><span className="text-xs text-steel-500">Faturamento bruto previsto (R$)</span><input className="input mt-1" placeholder="Faturamento bruto previsto (R$)" inputMode="decimal" value={f.gross} onChange={e => setF({ ...f, gross: maskMoney(e.target.value) })} /></label>
        <label className="block sm:col-span-2"><span className="text-xs text-steel-500">Observação (aparece para o investidor)</span><input className="input mt-1" placeholder="Observação (aparece para o investidor)" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></label>
      </div>
      <button className="btn-primary" onClick={save}>Salvar KPIs de {monthLabel(month)}</button>
    </section>
  );
}

/* ── Expansão: próximas regiões ───────────────────────────────────────── */
function ExpansionSection() {
  const [rows, setRows] = useState<Expansion[]>([]);
  const [f, setF] = useState({ region: '', status: 'proxima', expected_date: '', note: '' });

  const load = useCallback(async () => {
    const { data } = await supabase.from('investor_expansion').select('*').order('created_at');
    setRows((data ?? []) as Expansion[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!f.region.trim()) return toast.error('Informe a região.');
    const { error } = await supabase.from('investor_expansion').insert({
      region: f.region.trim(), status: f.status, expected_date: f.expected_date || null, note: f.note.trim() || null,
    });
    if (error) return toast.error('Não salvou: ' + error.message);
    setF({ region: '', status: 'proxima', expected_date: '', note: '' }); load();
  }
  async function setStatus(id: string, status: string) {
    const { error } = await supabase.from('investor_expansion').update({ status }).eq('id', id);
    if (error) return toast.error(error.message);
    load();
  }
  async function del(id: string) {
    const { error } = await supabase.from('investor_expansion').delete().eq('id', id);
    if (error) return toast.error(error.message);
    load();
  }

  return (
    <section className="rounded-xl border border-steel-200 dark:border-steel-700 p-4 space-y-3">
      <h2 className="font-semibold">Expansão: próximas regiões</h2>
      <p className="text-xs text-steel-500">O investidor vê esta lista no painel dele (região, situação, previsão e observação). Não coloque dado de oficina, mecânico ou cliente.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block"><span className="text-xs text-steel-500">Região</span>
          <input className="input mt-1" placeholder="Ex.: Zona Leste de São Paulo" value={f.region} onChange={e => setF({ ...f, region: e.target.value })} /></label>
        <label className="block"><span className="text-xs text-steel-500">Situação</span>
          <select className="input mt-1" value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>
            {Object.entries(EXPANSION_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select></label>
        <label className="block"><span className="text-xs text-steel-500">Previsão (opcional)</span>
          <input className="input mt-1" type="date" value={f.expected_date} onChange={e => setF({ ...f, expected_date: e.target.value })} /></label>
        <label className="block"><span className="text-xs text-steel-500">Observação (aparece para o investidor)</span>
          <input className="input mt-1" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></label>
      </div>
      <button className="btn-primary" onClick={add}>Adicionar região</button>
      {rows.map(r => (
        <div key={r.id} className="flex justify-between gap-3 rounded-lg border border-steel-200 dark:border-steel-700 px-3 py-2 text-sm">
          <div>
            <b>{r.region}</b>
            {r.expected_date && <span className="text-steel-500"> · previsto {monthLabel(r.expected_date.slice(0, 7) + '-01')}</span>}
            {r.note && <div className="text-xs text-steel-500">{r.note}</div>}
          </div>
          <div className="flex gap-2 items-center whitespace-nowrap">
            <select className="input !py-1 !w-auto" value={r.status} onChange={e => setStatus(r.id, e.target.value)}>
              {Object.entries(EXPANSION_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <button className="text-alert-500" onClick={() => del(r.id)}>✕</button>
          </div>
        </div>
      ))}
    </section>
  );
}
