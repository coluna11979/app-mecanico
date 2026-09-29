import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/components/ui/Toast';
import { canDo, useOperator } from '@/lib/operators';
import { fmtBRL, moneyInput, parseMoney } from '@/components/os/osHelpers';
import { addMonthsISO, fmtDate, todayISO } from '@/lib/purchasing';
import { addMonthsCompetence, fmtCompetence } from '@/lib/payableForms';
import { breakdown, calcNet, loadPayroll, type PayrollRow } from '@/lib/payroll';
import { Restricted } from './Fornecedores';

type Edit = { days: string; other: string; include: boolean };

const num = (s: string) => { const n = parseMoney(s || '0'); return Number.isFinite(n) && n > 0 ? n : 0; };

export default function Folha() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'folha');

  const [competence, setCompetence] = useState(todayISO().slice(0, 7));
  // Vencimento padrão: dia 5 do mês seguinte à competência
  const [due, setDue] = useState(`${addMonthsCompetence(todayISO().slice(0, 7), 1)}-05`);
  const [rows, setRows] = useState<PayrollRow[] | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDue(`${addMonthsCompetence(competence, 1)}-05`); }, [competence]);

  const load = useCallback(async () => {
    if (!wid) return;
    setRows(null);
    const data = await loadPayroll(wid, competence);
    setRows(data);
    setEdits(Object.fromEntries(data.map(r => [r.mechanicId, { days: '', other: '', include: !r.closed && !r.manual && (r.base > 0 || r.commission > 0) }])));
  }, [wid, competence]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  const calc = useMemo(() => Object.fromEntries((rows ?? []).map(r => {
    const e = edits[r.mechanicId] ?? { days: '', other: '', include: false };
    return [r.mechanicId, calcNet({ base: r.base, commission: r.commission, absenceDays: num(e.days), other: num(e.other), vales: r.vales, carryIn: r.carryIn })];
  })), [rows, edits]);

  const toClose = (rows ?? []).filter(r => !r.closed && !r.manual && edits[r.mechanicId]?.include);
  const totalNet = toClose.reduce((a, r) => a + calc[r.mechanicId].net, 0);

  function setEdit(id: string, patch: Partial<Edit>) {
    setEdits(x => ({ ...x, [id]: { ...x[id], ...patch } }));
  }

  async function generate() {
    if (!wid || !toClose.length) return;
    setBusy(true);
    let done = 0;
    try {
      for (const r of toClose) {
        const e = edits[r.mechanicId];
        const c = calc[r.mechanicId];
        const days = num(e.days), other = num(e.other);
        const notes = breakdown({ base: r.base, commission: r.commission, commissionPct: r.commissionPct, commissionRule: r.commissionRule, absenceDays: days, absence: c.absence, other, vales: r.vales, carryIn: r.carryIn, net: c.net, carryOut: c.carryOut });
        let payableId: string | null = null;
        if (c.net > 0) {
          const { data, error } = await supabase.from('payables').insert({
            workshop_id: wid, category: 'Salários', mechanic_id: r.mechanicId, competence,
            description: `Salário · ${r.name} · ${fmtCompetence(competence)}`,
            amount: c.net, due_date: due, notes,
          }).select('id').single();
          if (error) throw error;
          payableId = (data as { id: string }).id;
        }
        const { error: e2 } = await supabase.from('payroll_items').insert({
          workshop_id: wid, mechanic_id: r.mechanicId, competence,
          base_salary: r.base, commission: r.commission, absence_days: days, absence_discount: c.absence,
          other_discount: other, vales: r.vales, carry_in: r.carryIn, net: c.net, carry_out: c.carryOut,
          payable_id: payableId, notes,
        });
        if (e2) throw e2;
        done++;
      }
      toast.success(`Folha de ${fmtCompetence(competence)} fechada: ${done} colaborador${done === 1 ? '' : 'es'} ✓ Salários em Contas a pagar.`);
    } catch (err: unknown) {
      toast.error(`Parou no ${done + 1}º colaborador: ${(err as { message?: string })?.message ?? 'erro'}`);
    } finally {
      setBusy(false);
      load();
    }
  }

  async function reopen(r: PayrollRow) {
    if (!r.closed) return;
    if (!confirm(`Reabrir a folha de ${r.name} (${fmtCompetence(competence)})? A conta do salário será excluída.`)) return;
    if (r.closed.payable_id) {
      const { data: p } = await supabase.from('payables').select('paid_at').eq('id', r.closed.payable_id).maybeSingle();
      if ((p as { paid_at: string | null } | null)?.paid_at) return toast.error('Esse salário já foi pago. Desfaça o pagamento em Contas a pagar antes de reabrir.');
      const { error } = await supabase.from('payables').update({ cancelled_at: new Date().toISOString() }).eq('id', r.closed.payable_id);
      if (error) return toast.error(error.message);
    }
    const { error } = await supabase.from('payroll_items').delete().eq('id', r.closed.id);
    if (error) return toast.error(error.message);
    toast.success('Folha reaberta');
    load();
  }

  if (!allowed) return <Restricted />;

  const missingSalary = (rows ?? []).filter(r => !r.closed && r.base <= 0);

  return (
    <WorkshopLayout>
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">💼 Fechar folha</h1>
            <p className="text-sm text-steel-500 mt-1">Salário + comissão − faltas − vales. Confira e gere as contas a pagar dos salários.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">Competência</label>
              <input type="month" className="input !w-auto" value={competence} onChange={e => setCompetence(e.target.value || todayISO().slice(0, 7))} />
            </div>
            <div>
              <label className="label">Pagar em</label>
              <input type="date" className="input !w-auto" value={due} onChange={e => setDue(e.target.value || todayISO())} />
            </div>
          </div>
        </div>

        {missingSalary.length > 0 && (
          <div className="card !py-3 text-sm text-pending-800 bg-pending-50 border border-pending-200">
            ⚠️ Sem salário no cadastro: {missingSalary.map((r, i) => (
              <span key={r.mechanicId}>{i > 0 && ', '}<Link to={`/oficina/equipe/${r.mechanicId}`} className="font-semibold underline">{r.name}</Link></span>
            ))}. Preencha na ficha do colaborador (aba Contratação).
          </div>
        )}

        {rows === null ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />)}</div>
        ) : rows.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-2">👷</div>
            <h2 className="text-lg font-bold">Nenhum colaborador cadastrado</h2>
            <Link to="/oficina/equipe" className="btn-primary mt-4 inline-flex">Cadastrar equipe</Link>
          </div>
        ) : (
          <div className="card !p-0 overflow-hidden">
            <div className="hidden lg:grid grid-cols-[28px_1.6fr_1fr_1fr_1fr_0.8fr_1fr_1fr_1.1fr] gap-3 px-5 py-2 bg-steel-50 border-b border-steel-100 text-[10px] font-bold text-steel-500 uppercase tracking-wider items-center">
              <span />
              <span>Colaborador</span>
              <span className="text-right">Salário</span>
              <span className="text-right">Comissão</span>
              <span className="text-right">Vales</span>
              <span className="text-right">Faltas (dias)</span>
              <span className="text-right">Outros desc.</span>
              <span className="text-right">Descontos</span>
              <span className="text-right">Líquido</span>
            </div>
            <ul className="divide-y divide-steel-100">
              {rows.map(r => {
                const e = edits[r.mechanicId];
                const c = calc[r.mechanicId];
                const closed = r.closed;
                const locked = !!closed || !!r.manual;
                const vales = closed ? Number(closed.vales) + Number(closed.carry_in) : r.vales + r.carryIn;
                return (
                  <li key={r.mechanicId} className={`px-5 py-3 grid grid-cols-2 lg:grid-cols-[28px_1.6fr_1fr_1fr_1fr_0.8fr_1fr_1fr_1.1fr] gap-x-3 gap-y-2 items-center ${locked ? 'bg-steel-50/60' : ''}`}>
                    <span className="hidden lg:block">
                      {!locked && <input type="checkbox" checked={!!e?.include} onChange={ev => setEdit(r.mechanicId, { include: ev.target.checked })} />}
                    </span>
                    <div className="col-span-2 lg:col-span-1 min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">
                        {!locked && <input type="checkbox" className="lg:hidden" checked={!!e?.include} onChange={ev => setEdit(r.mechanicId, { include: ev.target.checked })} />}
                        {r.name}
                      </div>
                      <div className="text-[11px] mt-0.5">
                        {closed ? (
                          <span className="text-signal-700">✓ Fechada{closed.payable_id ? ' · conta gerada' : ' · nada a pagar'} · <button className="underline text-steel-500" onClick={() => reopen(r)}>reabrir</button></span>
                        ) : r.manual ? (
                          <span className="text-steel-500">Salário já lançado à mão em Contas a pagar ({fmtBRL(r.manual.amount)})</span>
                        ) : r.commissionRule ? (
                          <span className="text-steel-400">comissão {r.commissionRule}</span>
                        ) : <span className="text-steel-400">sem comissão</span>}
                      </div>
                    </div>
                    <Cell label="Salário" value={fmtBRL(closed ? closed.base_salary : r.base)} muted={!closed && r.base <= 0} />
                    <Cell label="Comissão" value={`+ ${fmtBRL(closed ? closed.commission : r.commission)}`} tone="text-signal-700" />
                    <Cell label="Vales" value={`− ${fmtBRL(vales)}`} sub={!closed && r.carryIn > 0 ? `inclui ${fmtBRL(r.carryIn)} do mês anterior` : undefined} tone="text-alert-600" />
                    <div className="text-right">
                      <span className="lg:hidden text-[10px] text-steel-400 uppercase block">Faltas (dias)</span>
                      {locked ? <span className="text-sm">{closed ? Number(closed.absence_days) : '—'}</span> : (
                        <input className="input !py-1 !w-16 text-sm text-right ml-auto" inputMode="decimal" placeholder="0" value={e?.days ?? ''}
                          onChange={ev => setEdit(r.mechanicId, { days: ev.target.value })} />
                      )}
                    </div>
                    <div className="text-right">
                      <span className="lg:hidden text-[10px] text-steel-400 uppercase block">Outros desc.</span>
                      {locked ? <span className="text-sm">{closed ? fmtBRL(closed.other_discount) : '—'}</span> : (
                        <input className="input !py-1 !w-24 text-sm text-right ml-auto" inputMode="decimal" placeholder="0,00" value={e?.other ?? ''}
                          onChange={ev => setEdit(r.mechanicId, { other: ev.target.value })}
                          onBlur={ev => { const v = parseMoney(ev.target.value); if (Number.isFinite(v) && v > 0) setEdit(r.mechanicId, { other: moneyInput(v) }); }} />
                      )}
                    </div>
                    <Cell label="Descontos" value={`− ${fmtBRL(closed
                      ? Number(closed.absence_discount) + Number(closed.other_discount) + Number(closed.vales) + Number(closed.carry_in)
                      : c.deductions)}`} sub={!closed && c.absence > 0 ? `faltas ${fmtBRL(c.absence)}` : undefined} />
                    <div className="text-right">
                      <span className="lg:hidden text-[10px] text-steel-400 uppercase block">Líquido</span>
                      <div className="text-base font-bold">{fmtBRL(closed ? closed.net : c.net)}</div>
                      {(closed ? Number(closed.carry_out) : c.carryOut) > 0 && (
                        <div className="text-[10px] text-pending-700">sobra {fmtBRL(closed ? closed.carry_out : c.carryOut)} p/ próximo mês</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="px-5 py-4 bg-steel-50 border-t border-steel-100 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-steel-600">
                {toClose.length ? (
                  <><strong className="text-steel-900">{toClose.length}</strong> colaborador{toClose.length === 1 ? '' : 'es'} · líquido total <strong className="text-steel-900">{fmtBRL(totalNet)}</strong> · pagar em {fmtDate(due)}</>
                ) : 'Marque quem entra no fechamento.'}
              </div>
              <button className="btn-primary" disabled={busy || !toClose.length} onClick={generate}>
                {busy ? 'Gerando…' : `Gerar contas a pagar${toClose.length ? ` (${toClose.length})` : ''}`}
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-steel-400 leading-relaxed">
          Comissão: % do colaborador sobre a mão de obra das OS que ele concluiu no mês. Faltas: salário ÷ 30 × dias.
          Vales: tirados no Caixa no mês. Se os descontos passam do que há para receber, a diferença é descontada no mês seguinte.
          Mês anterior: <button className="underline" onClick={() => setCompetence(addMonthsISO(`${competence}-01`, -1).slice(0, 7))}>{fmtCompetence(addMonthsISO(`${competence}-01`, -1).slice(0, 7))}</button>
        </p>
      </div>
    </WorkshopLayout>
  );
}

function Cell({ label, value, sub, tone = '', muted }: { label: string; value: string; sub?: string; tone?: string; muted?: boolean }) {
  return (
    <div className="text-right">
      <span className="lg:hidden text-[10px] text-steel-400 uppercase block">{label}</span>
      <div className={`text-sm ${muted ? 'text-steel-400' : tone}`}>{value}</div>
      {sub && <div className="text-[10px] text-steel-400">{sub}</div>}
    </div>
  );
}
