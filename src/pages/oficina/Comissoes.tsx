import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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

export default function Comissoes() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session } = useOperator();
  const allowed = canDo(session, balcao, 'folha');

  const start = currentHalf();
  const [competence, setCompetence] = useState(start.competence);
  const [half, setHalf] = useState<Half>(start.half);
  const [due, setDue] = useState(payDate(start.competence, start.half));
  const [rows, setRows] = useState<CommissionRow[] | null>(null);
  const [include, setInclude] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDue(payDate(competence, half)); }, [competence, half]);

  const load = useCallback(async () => {
    if (!wid) return;
    setRows(null);
    const data = await loadCommissionHalf(wid, competence, half);
    setRows(data);
    setInclude(Object.fromEntries(data.map(r => [r.mechanicId, !r.closed && r.calc.commission > 0])));
  }, [wid, competence, half]);

  useEffect(() => { if (allowed) load(); }, [load, allowed]);

  const toClose = useMemo(() => (rows ?? []).filter(r => !r.closed && include[r.mechanicId] && r.calc.commission > 0), [rows, include]);
  const total = toClose.reduce((a, r) => a + r.calc.commission, 0);
  const label = halfLabel(competence, half);

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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">🏅 Fechar comissões</h1>
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
                          <span className="text-signal-700">✓ Fechada · conta gerada · <button className="underline text-steel-500" onClick={() => reopen(r)}>reabrir</button></span>
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

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <span className="md:hidden text-[10px] text-steel-400 uppercase block">{label}</span>
      <div className="text-sm">{value}</div>
    </div>
  );
}
