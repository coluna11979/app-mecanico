import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL } from '@/components/os/osHelpers';
import {
  PAYABLE_GROUPS, addMonthsISO, daysUntil, fmtDate, groupOf, todayISO, type Payable, type PayableGroupKey,
} from '@/lib/purchasing';
import { Restricted } from './Fornecedores';
import NewPayableModal from '@/components/payables/NewPayableModal';
import { fmtBarcode, fmtCompetence } from '@/lib/payableForms';

type Row = Payable & { supplier: { name: string } | null; mechanic: { name: string } | null };
type View = 'abertas' | 'pagas';

export default function ContasPagar() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'ver_financeiro');
  const sid = balcao ? session?.session_id ?? null : null;

  const [list, setList]       = useState<Row[] | null>(null);
  const [view, setView]       = useState<View>('abertas');
  const [group, setGroup]     = useState<PayableGroupKey | 'all'>('all');
  const [paying, setPaying]   = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [hasOpenRegister, setHasOpenRegister] = useState(false);

  const load = useCallback(async () => {
    if (!wid) return;
    const since = addMonthsISO(todayISO(), -3);
    const [open, paid, reg] = await Promise.all([
      supabase.from('payables').select('*, supplier:suppliers(name), mechanic:workshop_mechanics(name)').eq('workshop_id', wid)
        .is('cancelled_at', null).is('paid_at', null).order('due_date').limit(1000),
      supabase.from('payables').select('*, supplier:suppliers(name), mechanic:workshop_mechanics(name)').eq('workshop_id', wid)
        .is('cancelled_at', null).gte('paid_at', since).order('paid_at', { ascending: false }).limit(500),
      supabase.from('cash_registers').select('id').eq('workshop_id', wid).eq('status', 'open').maybeSingle(),
    ]);
    setList([...((open.data as unknown as Row[]) ?? []), ...((paid.data as unknown as Row[]) ?? [])]);
    setHasOpenRegister(!!reg.data);
  }, [wid]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  // Resumo por tipo: em aberto (para os filtros) e o que vence neste mês (pago ou não)
  const byGroup = useMemo(() => {
    const month = todayISO().slice(0, 7);
    return PAYABLE_GROUPS.map(g => {
      const mine = (list ?? []).filter(p => groupOf(p.category).key === g.key);
      return {
        ...g,
        open: mine.filter(p => !p.paid_at).reduce((a, p) => a + Number(p.amount), 0),
        openCount: mine.filter(p => !p.paid_at).length,
        month: mine.filter(p => p.due_date.startsWith(month)).reduce((a, p) => a + Number(p.amount), 0),
      };
    });
  }, [list]);
  const monthTotal = byGroup.reduce((a, g) => a + g.month, 0);

  const k = useMemo(() => {
    const scoped = (list ?? []).filter(p => group === 'all' || groupOf(p.category).key === group);
    const open = scoped.filter(p => !p.paid_at);
    const paid = scoped.filter(p => p.paid_at);
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
  }, [list, group]);

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

        {/* Este mês por tipo */}
        {monthTotal > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-bold text-steel-500 uppercase tracking-widest">Contas que vencem este mês, por tipo</div>
              <div className="text-sm font-bold">{fmtBRL(monthTotal)}</div>
            </div>
            <div className="h-3 rounded-full bg-steel-100 overflow-hidden flex mb-3">
              {byGroup.filter(g => g.month > 0).map(g => (
                <div key={g.key} className={g.bar} style={{ width: `${(g.month / monthTotal) * 100}%` }} title={`${g.label}: ${fmtBRL(g.month)}`} />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
              {byGroup.map(g => (
                <div key={g.key} className={g.month > 0 ? '' : 'opacity-40'}>
                  <div className="flex items-center gap-1.5 text-xs text-steel-500"><i className={`w-2.5 h-2.5 rounded-sm inline-block ${g.bar}`} />{g.icon} {g.label}</div>
                  <div className="font-bold">{fmtBRL(g.month)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filtro por tipo */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setGroup('all')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${group === 'all' ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
            Todos os tipos
          </button>
          {byGroup.map(g => (
            <button key={g.key} onClick={() => setGroup(g.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition ${group === g.key ? 'bg-steel-900 text-white border-steel-900' : 'bg-white text-steel-600 border-steel-200'}`}>
              {g.icon} {g.label}{g.openCount > 0 && <span className={group === g.key ? 'text-steel-300' : 'text-steel-400'}> · {fmtBRL(g.open)}</span>}
            </button>
          ))}
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
                    <div className="text-xs text-steel-500"><CategoryBadge category={p.category} /> paga {fmtDate(p.paid_at!)} pelo {p.paid_from === 'caixa' ? 'caixa' : 'banco'} · vencia {fmtDate(p.due_date)}</div>
                    <Details p={p} />
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
        <NewPayableModal wid={wid} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />
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

/** Favorecido, competência, documento e código de barras (copiar) */
function Details({ p }: { p: Row }) {
  const who = p.supplier?.name ?? p.mechanic?.name ?? p.payee;
  const bits = [
    who && !p.description.includes(who) ? who : null,
    p.competence && !p.description.includes(fmtCompetence(p.competence)) ? `competência ${fmtCompetence(p.competence)}` : null,
    p.document ? `doc. ${p.document}` : null,
  ].filter(Boolean);
  if (!bits.length && !p.barcode && !p.notes) return null;
  return (
    <div className="text-[11px] text-steel-400 mt-0.5 flex flex-wrap items-center gap-x-2">
      {bits.length > 0 && <span>{bits.join(' · ')}</span>}
      {p.barcode && (
        <button type="button" className="font-semibold text-brand-700 hover:underline" title={fmtBarcode(p.barcode)}
          onClick={() => { navigator.clipboard?.writeText(p.barcode!).then(() => toast.success('Código de barras copiado ✓'), () => toast.error('Não foi possível copiar')); }}>
          📋 copiar código de barras
        </button>
      )}
      {p.notes && <span className="italic">“{p.notes}”</span>}
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const g = groupOf(category);
  return <span className={`badge text-[10px] mr-1 ${g.badge}`}>{g.icon} {category}</span>;
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
                  <CategoryBadge category={p.category} /> vence {fmtDate(p.due_date)}
                  {d < 0 && <span className="text-alert-600 font-semibold"> · há {-d} dia{d === -1 ? '' : 's'}</span>}
                  {d > 0 && d <= 7 && <span> · em {d} dia{d === 1 ? '' : 's'}</span>}
                </div>
                <Details p={p} />
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
