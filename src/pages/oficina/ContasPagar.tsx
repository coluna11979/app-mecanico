import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import {
  PAYABLE_CATEGORIES, addMonthsISO, daysUntil, fmtDate, todayISO, type Payable, type Supplier,
} from '@/lib/purchasing';
import { Restricted } from './Fornecedores';

type Row = Payable & { supplier: { name: string } | null };
type View = 'abertas' | 'pagas';

export default function ContasPagar() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'ver_financeiro');
  const sid = balcao ? session?.session_id ?? null : null;

  const [list, setList]       = useState<Row[] | null>(null);
  const [view, setView]       = useState<View>('abertas');
  const [paying, setPaying]   = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [hasOpenRegister, setHasOpenRegister] = useState(false);

  const load = useCallback(async () => {
    if (!wid) return;
    const since = addMonthsISO(todayISO(), -3);
    const [open, paid, s, reg] = await Promise.all([
      supabase.from('payables').select('*, supplier:suppliers(name)').eq('workshop_id', wid)
        .is('cancelled_at', null).is('paid_at', null).order('due_date').limit(1000),
      supabase.from('payables').select('*, supplier:suppliers(name)').eq('workshop_id', wid)
        .is('cancelled_at', null).gte('paid_at', since).order('paid_at', { ascending: false }).limit(500),
      supabase.from('suppliers').select('*').eq('workshop_id', wid).eq('active', true).order('name'),
      supabase.from('cash_registers').select('id').eq('workshop_id', wid).eq('status', 'open').maybeSingle(),
    ]);
    setList([...((open.data as unknown as Row[]) ?? []), ...((paid.data as unknown as Row[]) ?? [])]);
    setSuppliers((s.data as Supplier[]) ?? []);
    setHasOpenRegister(!!reg.data);
  }, [wid]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  const k = useMemo(() => {
    const open = (list ?? []).filter(p => !p.paid_at);
    const paid = (list ?? []).filter(p => p.paid_at);
    const sum = (xs: Row[]) => xs.reduce((a, p) => a + Number(p.amount), 0);
    const overdue = open.filter(p => daysUntil(p.due_date) < 0);
    const today = open.filter(p => daysUntil(p.due_date) === 0);
    const week = open.filter(p => { const d = daysUntil(p.due_date); return d > 0 && d <= 7; });
    const later = open.filter(p => daysUntil(p.due_date) > 7);
    const month = todayISO().slice(0, 7);
    return {
      open, paid, overdue, today, week, later,
      overdueTotal: sum(overdue), weekTotal: sum([...today, ...week]), openTotal: sum(open),
      paidMonth: sum(paid.filter(p => p.paid_at!.startsWith(month))),
    };
  }, [list]);

  async function remove(p: Row) {
    if (!confirm(`Excluir a conta "${p.description}" de ${fmtBRL(p.amount)}?`)) return;
    const { error } = await supabase.from('payables').update({ cancelled_at: new Date().toISOString() }).eq('id', p.id);
    if (error) return toast.error(error.message);
    toast.success('Conta excluída');
    load();
  }

  async function unpay(p: Row) {
    if (!confirm(`Desfazer o pagamento de "${p.description}"?${p.paid_from === 'caixa' ? ' O lançamento no caixa será estornado.' : ''}`)) return;
    const { error } = await supabase.rpc('payable_unpay', { p_payable: p.id, p_session: sid });
    if (error) return toast.error(error.message);
    toast.success('Pagamento desfeito');
    load();
  }

  if (!allowed) return <Restricted />;

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">📤 Contas a pagar</h1>
            <p className="text-sm text-steel-500 mt-1">Parcelas das notas de compra entram sozinhas. Aluguel, luz e salários você lança aqui.</p>
          </div>
          <div className="flex gap-2">
            <Link to="/oficina/compras/nova" className="btn-ghost border border-steel-200">🧾 Lançar nota</Link>
            <button className="btn-primary" onClick={() => setCreating(true)}>+ Nova conta</button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Vencidas" value={fmtBRL(k.overdueTotal)} sub={`${k.overdue.length} conta${k.overdue.length === 1 ? '' : 's'}`} tone={k.overdueTotal > 0 ? 'bad' : undefined} />
          <Kpi label="Hoje e próximos 7 dias" value={fmtBRL(k.weekTotal)} sub={`${k.today.length + k.week.length} conta${k.today.length + k.week.length === 1 ? '' : 's'}`} tone={k.weekTotal > 0 ? 'warn' : undefined} />
          <Kpi label="Total em aberto" value={fmtBRL(k.openTotal)} sub={`${k.open.length} conta${k.open.length === 1 ? '' : 's'}`} />
          <Kpi label="Pago este mês" value={fmtBRL(k.paidMonth)} />
        </div>

        <div className="flex gap-2">
          {([['abertas', `Em aberto (${k.open.length})`], ['pagas', 'Pagas (últimos 3 meses)']] as [View, string][]).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`text-sm font-semibold px-4 py-2 rounded-full border transition ${view === v ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
              {l}
            </button>
          ))}
        </div>

        {list === null ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : view === 'abertas' ? (
          k.open.length === 0 ? (
            <div className="card text-center py-10 text-sm text-steel-500">Nenhuma conta em aberto. 👏</div>
          ) : (
            <div className="space-y-4">
              <Group title="⚠️ Vencidas" rows={k.overdue} onPay={setPaying} onRemove={remove} tone="bad" />
              <Group title="📅 Vencem hoje" rows={k.today} onPay={setPaying} onRemove={remove} tone="warn" />
              <Group title="Próximos 7 dias" rows={k.week} onPay={setPaying} onRemove={remove} />
              <Group title="Depois" rows={k.later} onPay={setPaying} onRemove={remove} />
            </div>
          )
        ) : k.paid.length === 0 ? (
          <div className="card text-center py-10 text-sm text-steel-500">Nenhuma conta paga nos últimos 3 meses.</div>
        ) : (
          <div className="card !p-0 overflow-hidden">
            <ul className="divide-y divide-steel-100">
              {k.paid.map(p => (
                <li key={p.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{p.description}{p.installment && <span className="text-steel-500 font-normal"> · {p.installment}</span>}</div>
                    <div className="text-xs text-steel-500">{p.category} · paga {fmtDate(p.paid_at!)} pelo {p.paid_from === 'caixa' ? 'caixa' : 'banco'} · vencia {fmtDate(p.due_date)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-bold">{fmtBRL(p.amount)}</span>
                    <button className="text-xs text-steel-500 hover:text-alert-600" onClick={() => unpay(p)}>Desfazer</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {paying && (
        <PayModal payable={paying} sid={sid} hasOpenRegister={hasOpenRegister}
          onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} />
      )}
      {creating && wid && (
        <NewPayable wid={wid} suppliers={suppliers} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />
      )}
    </WorkshopLayout>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="card">
      <div className="text-[10px] font-bold uppercase tracking-widest text-steel-500">{label}</div>
      <div className={`text-2xl font-bold font-display mt-1 ${tone === 'bad' ? 'text-alert-600' : tone === 'warn' ? 'text-pending-700' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-steel-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Group({ title, rows, onPay, onRemove, tone }: {
  title: string; rows: Row[]; onPay: (p: Row) => void; onRemove: (p: Row) => void; tone?: 'bad' | 'warn';
}) {
  if (!rows.length) return null;
  const total = rows.reduce((a, p) => a + Number(p.amount), 0);
  return (
    <div className="card !p-0 overflow-hidden">
      <div className={`px-5 py-2 flex justify-between text-xs font-bold uppercase tracking-widest border-b border-steel-100 ${
        tone === 'bad' ? 'bg-alert-50 text-alert-700' : tone === 'warn' ? 'bg-pending-50 text-pending-800' : 'bg-steel-50 text-steel-500'}`}>
        <span>{title}</span><span>{fmtBRL(total)}</span>
      </div>
      <ul className="divide-y divide-steel-100">
        {rows.map(p => {
          const d = daysUntil(p.due_date);
          return (
            <li key={p.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{p.description}{p.installment && <span className="text-steel-500 font-normal"> · {p.installment}</span>}</div>
                <div className="text-xs text-steel-500">
                  {p.category} · vence {fmtDate(p.due_date)}
                  {d < 0 && <span className="text-alert-600 font-semibold"> · há {-d} dia{d === -1 ? '' : 's'}</span>}
                  {d > 0 && d <= 7 && <span> · em {d} dia{d === 1 ? '' : 's'}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold mr-1">{fmtBRL(p.amount)}</span>
                {!p.invoice_id && (
                  <button className="h-8 w-8 rounded-lg grid place-items-center text-xs bg-steel-100 hover:bg-alert-100 text-steel-500 hover:text-alert-600" title="Excluir" onClick={() => onRemove(p)}>✕</button>
                )}
                <button className="btn-primary !py-1.5 text-sm" onClick={() => onPay(p)}>Pagar</button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PayModal({ payable, sid, hasOpenRegister, onClose, onDone }: {
  payable: Row; sid: string | null; hasOpenRegister: boolean; onClose: () => void; onDone: () => void;
}) {
  const [from, setFrom] = useState<'banco' | 'caixa'>('banco');
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    const { error } = await supabase.rpc('payable_pay', { p_payable: payable.id, p_from: from, p_paid_at: date, p_session: sid });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(from === 'caixa' ? 'Conta paga e lançada como saída do caixa ✓' : 'Conta paga ✓');
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Pagar conta</h2>
          <p className="text-sm text-steel-500">{payable.description}{payable.installment && ` · ${payable.installment}`}</p>
          <div className="text-3xl font-bold font-display mt-2">{fmtBRL(payable.amount)}</div>
        </div>
        <div>
          <label className="label">De onde saiu o dinheiro?</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setFrom('banco')}
              className={`px-3 py-3 rounded-xl border text-sm font-semibold ${from === 'banco' ? 'bg-steel-900 text-white border-steel-900' : 'bg-white border-steel-200 text-steel-600'}`}>
              🏦 Banco / PIX / boleto
            </button>
            <button type="button" onClick={() => setFrom('caixa')} disabled={!hasOpenRegister}
              className={`px-3 py-3 rounded-xl border text-sm font-semibold disabled:opacity-40 ${from === 'caixa' ? 'bg-steel-900 text-white border-steel-900' : 'bg-white border-steel-200 text-steel-600'}`}>
              💰 Dinheiro do caixa
            </button>
          </div>
          {!hasOpenRegister && <p className="text-[11px] text-steel-400 mt-1">Para pagar com o dinheiro do caixa, abra o caixa primeiro.</p>}
          {from === 'caixa' && <p className="text-[11px] text-steel-500 mt-1">Vira uma saída (despesa) no caixa aberto agora.</p>}
        </div>
        {from === 'banco' && (
          <div>
            <label className="label">Data do pagamento</label>
            <input type="date" className="input" value={date} onChange={e => setDate(e.target.value || todayISO())} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn-primary" onClick={pay} disabled={busy}>{busy ? 'Pagando…' : '✓ Confirmar pagamento'}</button>
        </div>
      </div>
    </div>
  );
}

function NewPayable({ wid, suppliers, onClose, onDone }: { wid: string; suppliers: Supplier[]; onClose: () => void; onDone: () => void }) {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Aluguel');
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState(todayISO());
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const v = parseMoney(amount);
    if (!description.trim()) return toast.error('Informe a descrição');
    if (!Number.isFinite(v) || v <= 0) return toast.error('Informe o valor');
    const rows = Array.from({ length: months }, (_, i) => ({
      workshop_id: wid, description: description.trim(), category, supplier_id: supplierId || null,
      amount: v, due_date: addMonthsISO(due, i), installment: months > 1 ? `${i + 1}/${months}` : null,
    }));
    setBusy(true);
    const { error } = await supabase.from('payables').insert(rows);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(months > 1 ? `${months} contas lançadas ✓` : 'Conta lançada ✓');
    onDone();
  }

  return (
    <div className="fixed inset-0 bg-steel-900/60 z-50 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <form onSubmit={save} onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold">Nova conta a pagar</h2>
        <div>
          <label className="label">Descrição *</label>
          <input className="input" autoFocus placeholder="Ex.: Aluguel do galpão" value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              {PAYABLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Fornecedor</label>
            <select className="input" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
              <option value="">—</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Valor *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-steel-400 text-sm">R$</span>
              <input className="input !pl-9" inputMode="decimal" placeholder="0,00" value={amount}
                onChange={e => setAmount(e.target.value)}
                onBlur={e => { const v = parseMoney(e.target.value); if (Number.isFinite(v)) setAmount(moneyInput(v)); }} />
            </div>
          </div>
          <div>
            <label className="label">Vencimento</label>
            <input type="date" className="input" value={due} onChange={e => setDue(e.target.value || todayISO())} />
          </div>
        </div>
        <div>
          <label className="label">Repetir</label>
          <select className="input" value={months} onChange={e => setMonths(Number(e.target.value))}>
            <option value={1}>Não repetir</option>
            {[3, 6, 12, 24].map(n => <option key={n} value={n}>Todo mês, por {n} meses</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Salvando…' : 'Lançar conta'}</button>
        </div>
      </form>
    </div>
  );
}
