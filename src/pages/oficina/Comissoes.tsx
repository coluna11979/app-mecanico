import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL } from '@/components/os/osHelpers';
import { fmtDate, todayISO } from '@/lib/purchasing';
import {
  currentHalf, halfLabel, loadCommissionHalf, payDate, shiftHalf, type CommissionRow, type Half,
} from '@/lib/commissionClosing';
import { Restricted } from './Fornecedores';
import ItemRulesCard from '@/components/team/ItemRulesCard';
import TeamTabs from '@/components/team/TeamTabs';

export default function Comissoes() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'folha');

  // ?quinzena=2026-09-2 abre direto numa quinzena (vem dos alertas do Painel da equipe)
  const [params] = useSearchParams();
  const start = (() => {
    const m = /^(\d{4}-\d{2})-([12])$/.exec(params.get('quinzena') ?? '');
    return m ? { competence: m[1], half: Number(m[2]) as Half } : currentHalf();
  })();
  const [competence, setCompetence] = useState(start.competence);
  const [half, setHalf] = useState<Half>(start.half);
  const [due, setDue] = useState(payDate(start.competence, start.half));
  const [rows, setRows] = useState<CommissionRow[] | null>(null);
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  /** Situação das contas geradas: pago em / vence em */
  const [paid, setPaid] = useState<Record<string, { paid_at: string | null; due_date: string | null }>>({});
  /** Quinzena anterior à atual com comissão sem fechar */
  const [prevOpen, setPrevOpen] = useState<{ competence: string; half: Half; total: number } | null>(null);

  useEffect(() => { setDue(payDate(competence, half)); }, [competence, half]);

  const load = useCallback(async () => {
    if (!wid) return;
    setRows(null);
    const data = await loadCommissionHalf(wid, competence, half);
    const ids = data.map(r => r.closed?.payable_id).filter(Boolean) as string[];
    const { data: pays } = ids.length
      ? await supabase.from('payables').select('id, paid_at, due_date').in('id', ids)
      : { data: [] as { id: string; paid_at: string | null; due_date: string | null }[] };
    setPaid(Object.fromEntries(((pays ?? []) as { id: string; paid_at: string | null; due_date: string | null }[]).map(p => [p.id, p])));
    setRows(data);
    setInclude(Object.fromEntries(data.map(r => [r.mechanicId, !r.closed && r.calc.commission > 0])));
  }, [wid, competence, half]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  // Pendência: a última quinzena que já terminou ainda tem comissão sem fechar?
  useEffect(() => {
    if (!wid || !allowed) return;
    const now = currentHalf();
    const p = shiftHalf(now.competence, now.half, -1);
    loadCommissionHalf(wid, p.competence, p.half).then(list => {
      const open = list.filter(r => !r.closed && r.calc.commission > 0);
      setPrevOpen(open.length ? { ...p, total: open.reduce((a, r) => a + r.calc.commission, 0) } : null);
    });
  }, [wid, allowed, rows]);

  const toClose = useMemo(() => (rows ?? []).filter(r => !r.closed && include[r.mechanicId] && r.calc.commission > 0), [rows, include]);
  const total = toClose.reduce((a, r) => a + r.calc.commission, 0);
  const label = halfLabel(competence, half);
  const sum = useMemo(() => {
    const out = { total: 0, paid: 0, toPay: 0, open: 0, overdue: 0 };
    for (const r of rows ?? []) {
      if (r.closed) {
        const v = Number(r.closed.commission);
        out.total += v;
        const p = r.closed.payable_id ? paid[r.closed.payable_id] : null;
        if (p?.paid_at) out.paid += v;
        else if (r.closed.payable_id) { out.toPay += v; if (p?.due_date && p.due_date < todayISO()) out.overdue += v; }
      } else if (r.calc.commission > 0) { out.total += r.calc.commission; out.open += r.calc.commission; }
    }
    return out;
  }, [rows, paid]);
  const showingPrev = prevOpen && prevOpen.competence === competence && prevOpen.half === half;

  function go(dir: -1 | 1) {
    const n = shiftHalf(competence, half, dir);
    setCompetence(n.competence); setHalf(n.half);
  }

  async function generate() {
    if (!wid || !toClose.length) return;
    setBusy(true);
    let done = 0;
    try {
      for (const r of toClose) {
        const c = r.calc;
        const notes = [
          c.labor > 0 && `serviços ${fmtBRL(c.labor)}`,
          c.laborOwn > 0 && `só serviço ${fmtBRL(c.laborOwn)}`,
          c.parts > 0 && `peças ${fmtBRL(c.parts)}`,
          c.svc > 0 && `serviço + peças ${fmtBRL(c.svc)} × 4%`,
          c.mo > 0 && `mão de obra ${fmtBRL(c.mo)} × 10%`,
          c.revenue > 0 && `faturamento da loja ${fmtBRL(c.revenue)}`,
        ].filter(Boolean).join(' · ') + ` → ${r.rule} = ${fmtBRL(c.commission)}`;
        const { data, error } = await supabase.from('payables').insert({
          workshop_id: wid, category: 'Comissões', mechanic_id: r.mechanicId, competence,
          description: `Comissão · ${r.name} · ${label}`,
          amount: c.commission, due_date: due, notes,
        }).select('id').single();
        if (error) throw error;
        const { error: e2 } = await supabase.from('commission_closings').insert({
          workshop_id: wid, mechanic_id: r.mechanicId, competence, half,
          labor: c.labor, labor_own: c.laborOwn, parts: c.parts, revenue: c.revenue, commission: c.commission,
          rule: r.rule, payable_id: (data as { id: string }).id,
        });
        if (e2) throw e2;
        done++;
      }
      toast.success(`Comissões da ${label} fechadas: ${done} colaborador${done === 1 ? '' : 'es'} ✓ Em Contas a pagar para ${fmtDate(due)}.`);
    } catch (err: unknown) {
      toast.error(`Parou no ${done + 1}º colaborador: ${(err as { message?: string })?.message ?? 'erro'}`);
    } finally {
      setBusy(false);
      load();
    }
  }

  async function reopen(r: CommissionRow) {
    if (!r.closed) return;
    if (!confirm(`Reabrir a comissão de ${r.name} (${label})? A conta será excluída.`)) return;
    if (r.closed.payable_id) {
      const { data: p } = await supabase.from('payables').select('paid_at').eq('id', r.closed.payable_id).maybeSingle();
      if ((p as { paid_at: string | null } | null)?.paid_at) return toast.error('Essa comissão já foi paga. Desfaça o pagamento em Contas a pagar antes de reabrir.');
      const { error } = await supabase.from('payables').update({ cancelled_at: new Date().toISOString() }).eq('id', r.closed.payable_id);
      if (error) return toast.error(error.message);
    }
    const { error } = await supabase.from('commission_closings').delete().eq('id', r.closed.id);
    if (error) return toast.error(error.message);
    toast.success('Comissão reaberta');
    load();
  }

  if (!allowed) return <Restricted />;

  return (
    <WorkshopLayout>
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <TeamTabs />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3 !mt-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">🏅 Comissões</h1>
            <p className="text-sm text-steel-500 mt-1">Quinzenal: OS concluídas do dia 1 ao 15 pagas no dia 15; do 16 ao fim do mês, no dia 30.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Quinzena</label>
              <div className="flex items-center gap-1">
                <button className="h-10 w-10 rounded-xl border border-steel-200 bg-white hover:bg-steel-50" onClick={() => go(-1)} title="Quinzena anterior">‹</button>
                <div className="input !w-auto min-w-[210px] text-center font-semibold">{halfLabel(competence, half, true)}</div>
                <button className="h-10 w-10 rounded-xl border border-steel-200 bg-white hover:bg-steel-50" onClick={() => go(1)} title="Próxima quinzena">›</button>
              </div>
            </div>
            <div>
              <label className="label">Pagar em</label>
              <input type="date" className="input !w-auto" value={due} onChange={e => setDue(e.target.value || todayISO())} />
            </div>
          </div>
        </div>

        {prevOpen && !showingPrev && (
          <div className="card !py-3 border-l-4 border-l-pending-500 flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>🏅 A <strong>{halfLabel(prevOpen.competence, prevOpen.half)}</strong> já terminou e tem <strong>{fmtBRL(prevOpen.total)}</strong> de comissão sem fechar.</span>
            <button className="text-xs font-semibold px-3 py-1.5 rounded-full border border-steel-200 bg-white hover:border-brand-300"
              onClick={() => { setCompetence(prevOpen.competence); setHalf(prevOpen.half); }}>Ir para essa quinzena →</button>
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SumCard label="Total da quinzena" value={fmtBRL(sum.total)} />
            <SumCard label="Pago" value={fmtBRL(sum.paid)} tone="text-signal-700" />
            <SumCard label="A pagar" value={fmtBRL(sum.toPay)} sub={sum.overdue > 0 ? `${fmtBRL(sum.overdue)} vencido` : 'contas já geradas'} tone={sum.overdue > 0 ? 'text-alert-600' : undefined} />
            <SumCard label="Em aberto" value={fmtBRL(sum.open)} sub={sum.open > 0 ? 'falta fechar' : 'nada a fechar'} tone={sum.open > 0 ? 'text-pending-700' : undefined} />
          </div>
        )}

        {rows === null ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-2">🏅</div>
            <h2 className="text-lg font-bold">Ninguém com comissão nesta quinzena</h2>
            <p className="text-sm text-steel-500 mt-1">Defina o % de comissão de cada colaborador na ficha dele (Equipe → Colaboradores).</p>
          </div>
        ) : (
          <div className="card !p-0 overflow-hidden">
            <div className="hidden md:grid grid-cols-[28px_1.8fr_1fr_1fr_1fr_1.1fr] gap-3 px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider">
              <span />
              <span>Colaborador</span>
              <span className="text-right">Serviços que fez</span>
              <span className="text-right">Peças que fez</span>
              <span className="text-right">Faturamento</span>
              <span className="text-right">Comissão</span>
            </div>
            <ul className="divide-y divide-steel-100">
              {rows.map(r => {
                const c = r.closed ?? { labor: r.calc.labor + r.calc.laborOwn, parts: r.calc.parts, revenue: r.calc.revenue, commission: r.calc.commission };
                const labor = r.closed ? Number(r.closed.labor) + Number(r.closed.labor_own) : r.calc.labor + r.calc.laborOwn;
                return (
                  <li key={r.mechanicId} className={`px-5 py-3 grid grid-cols-2 md:grid-cols-[28px_1.8fr_1fr_1fr_1fr_1.1fr] gap-x-3 gap-y-1 items-center ${r.closed ? 'bg-steel-50/60' : ''}`}>
                    <span className="hidden md:block">
                      {!r.closed && r.calc.commission > 0 && (
                        <input type="checkbox" checked={!!include[r.mechanicId]} onChange={e => setInclude(x => ({ ...x, [r.mechanicId]: e.target.checked }))} />
                      )}
                    </span>
                    <div className="col-span-2 md:col-span-1 min-w-0">
                      <div className="font-semibold truncate">{r.name}{!r.active && <span className="badge bg-steel-100 text-steel-500 ml-2">inativo</span>}</div>
                      <div className="text-[11px] mt-0.5">
                        {r.closed ? (
                          (() => {
                            const p = r.closed.payable_id ? paid[r.closed.payable_id] : null;
                            return p?.paid_at
                              ? <span className="text-signal-700">✓ Paga em {fmtDate(p.paid_at.slice(0, 10))}</span>
                              : <span className={p?.due_date && p.due_date < todayISO() ? 'text-alert-600 font-semibold' : 'text-pending-800'}>
                                  Fechada · a pagar{p?.due_date ? ` em ${fmtDate(p.due_date)}` : ''} · <button className="underline text-steel-500 font-normal" onClick={() => reopen(r)}>reabrir</button>
                                </span>;
                          })()
                        ) : <span className="text-steel-400">{r.rule || 'sem % definido'}</span>}
                      </div>
                    </div>
                    <Cell label="Serviços" value={fmtBRL(labor)} />
                    <Cell label="Peças" value={fmtBRL(c.parts)} />
                    <Cell label="Faturamento" value={Number(c.revenue) > 0 ? fmtBRL(c.revenue) : '—'} />
                    <div className="text-right">
                      <span className="md:hidden text-[10px] text-steel-400 uppercase block">Comissão</span>
                      <div className={`text-base font-bold ${Number(c.commission) > 0 ? '' : 'text-steel-400'}`}>{fmtBRL(c.commission)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="px-5 py-4 bg-steel-50 border-t border-steel-100 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-steel-600">
                {toClose.length
                  ? <><strong className="text-steel-900">{toClose.length}</strong> colaborador{toClose.length === 1 ? '' : 'es'} · total <strong className="text-steel-900">{fmtBRL(total)}</strong> · pagar em {fmtDate(due)}</>
                  : 'Nada a fechar nesta quinzena.'}
              </div>
              <button className="btn-primary" disabled={busy || !toClose.length} onClick={generate}>
                {busy ? 'Gerando…' : `Gerar contas a pagar${toClose.length ? ` (${toClose.length})` : ''}`}
              </button>
            </div>
          </div>
        )}

        {wid && <ItemRulesCard wid={wid} />}

        <p className="text-xs text-steel-400 leading-relaxed">
          Comissão sobre os serviços e as peças que cada um fez nas OS concluídas na quinzena (+ % sobre o faturamento da loja, para quem tiver).
          Os vales não entram aqui: são descontados do salário no <Link to="/oficina/folha" className="underline">Fechar folha</Link> do fim do mês.
        </p>
      </div>
    </WorkshopLayout>
  );
}

function SumCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="card !p-4">
      <div className="text-[11px] text-steel-500">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${tone ?? 'text-steel-900'}`}>{value}</div>
      {sub && <div className="text-[11px] text-steel-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <span className="md:hidden text-[10px] text-steel-400 uppercase block">{label}</span>
      <div className="text-sm">{value}</div>
    </div>
  );
}
