import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useOperator } from '@/lib/operators';
import { fetchAll } from '@/lib/fetchAll';
import { monthRange, type PayrollItem } from '@/lib/payroll';
import { addMonthsCompetence } from '@/lib/payableForms';
import { fmtBRL, osNumber } from '@/components/os/osHelpers';

type Os = { id: string; number: number | null; title: string; labor_cost: number | null; completed_at: string; vehicle: { plate: string | null } | null };

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (c: string) => {
  const [y, m] = c.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

/** Modo balcão: o colaborador vê só as próprias comissões, mês a mês (mesma conta do Fechar folha). */
export default function MinhasComissoes() {
  const { currentWorkshop } = useAuth();
  const wid = currentWorkshop?.id ?? null;
  const { balcao, session, me } = useOperator();

  const [competence, setCompetence] = useState(thisMonth());
  const [list, setList]     = useState<Os[] | null>(null);
  const [vales, setVales]   = useState(0);
  const [closed, setClosed] = useState<PayrollItem | null>(null);

  const mechanicId = me?.mechanicId ?? null;

  useEffect(() => {
    if (!wid || !mechanicId) return;
    let alive = true;
    setList(null);
    const { from, to } = monthRange(competence);
    Promise.all([
      fetchAll((a, b) => supabase.from('service_orders')
        .select('id, number, title, labor_cost, completed_at, vehicle:vehicles(plate)')
        .eq('workshop_id', wid).eq('workshop_mechanic_id', mechanicId).eq('status', 'completed').is('quote_status', null)
        .gte('completed_at', from).lt('completed_at', to).order('completed_at', { ascending: false }).range(a, b)),
      fetchAll((a, b) => supabase.from('cash_entries').select('id, amount')
        .eq('workshop_id', wid).eq('mechanic_id', mechanicId).eq('kind', 'vale').is('cancelled_at', null)
        .gte('created_at', from).lt('created_at', to).order('id').range(a, b)),
      supabase.from('payroll_items').select('*').eq('workshop_id', wid).eq('mechanic_id', mechanicId).eq('competence', competence).maybeSingle(),
    ]).then(([o, v, p]) => {
      if (!alive) return;
      setList((o.data ?? []) as unknown as Os[]);
      setVales(((v.data ?? []) as { amount: number }[]).reduce((t, x) => t + Number(x.amount), 0));
      setClosed((p.data as PayrollItem | null) ?? null);
    });
    return () => { alive = false; };
  }, [wid, mechanicId, competence]);

  // Fora do modo balcão (dono) ou pessoa sem ficha na Equipe
  if (!balcao || !session) {
    return (
      <WorkshopLayout>
        <div className="max-w-md mx-auto card text-center py-10">
          <div className="text-4xl mb-2">💸</div>
          <h1 className="text-lg font-bold">Tela do colaborador</h1>
          <p className="text-sm text-steel-500 mt-1">Aqui cada colaborador vê a própria comissão, entrando com o PIN no modo balcão.</p>
          <Link to="/oficina/desempenho?aba=comissoes" className="btn-primary mt-5 inline-block">Ver comissões da equipe</Link>
        </div>
      </WorkshopLayout>
    );
  }
  if (me === undefined) {
    return <WorkshopLayout><div className="max-w-3xl mx-auto h-64 bg-white rounded-2xl animate-pulse" /></WorkshopLayout>;
  }
  if (!me) {
    return (
      <WorkshopLayout>
        <div className="max-w-md mx-auto card text-center py-10">
          <div className="text-4xl mb-2">💸</div>
          <h1 className="text-lg font-bold">Sem comissão cadastrada</h1>
          <p className="text-sm text-steel-500 mt-1">Seu acesso não está ligado a uma ficha da Equipe. Fale com o gestor.</p>
        </div>
      </WorkshopLayout>
    );
  }

  const pct = me.commissionPct;
  const labor = (list ?? []).reduce((t, o) => t + Number(o.labor_cost ?? 0), 0);
  // Mês já fechado: vale o que foi fechado na folha
  const commission = closed ? Number(closed.commission) : Math.round(labor * pct) / 100;
  const isCurrent = competence === thisMonth();

  return (
    <WorkshopLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight">💸 Minhas comissões</h1>
        <p className="text-sm text-steel-500 mt-1">
          {session.name} · {pct > 0 ? <><strong>{String(pct).replace('.', ',')}%</strong> da mão de obra das OS que você concluir</> : 'sem comissão cadastrada'}
        </p>

        <div className="flex items-center justify-between gap-2 mt-5 mb-4">
          <button onClick={() => setCompetence(c => addMonthsCompetence(c, -1))} className="btn-ghost border border-steel-200 !py-2 text-sm">‹ Anterior</button>
          <div className="text-lg font-bold capitalize">{monthLabel(competence)}</div>
          <button onClick={() => setCompetence(c => addMonthsCompetence(c, 1))} disabled={isCurrent}
            className="btn-ghost border border-steel-200 !py-2 text-sm disabled:opacity-30">Próximo ›</button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card !p-4 bg-steel-900 text-white border-steel-900 col-span-2 sm:col-span-1">
            <div className="text-[11px] text-steel-400">{isCurrent && !closed ? 'Comissão até agora' : 'Comissão do mês'}</div>
            <div className="text-2xl font-bold mt-1">{list ? fmtBRL(commission) : '…'}</div>
          </div>
          <div className="card !p-4">
            <div className="text-[11px] text-steel-500">OS concluídas</div>
            <div className="text-2xl font-bold mt-1">{list ? list.length : '…'}</div>
          </div>
          <div className="card !p-4">
            <div className="text-[11px] text-steel-500">Mão de obra</div>
            <div className="text-2xl font-bold mt-1">{list ? fmtBRL(labor) : '…'}</div>
          </div>
          <div className="card !p-4">
            <div className="text-[11px] text-steel-500">Vales no mês</div>
            <div className="text-2xl font-bold mt-1 text-alert-600">{list ? fmtBRL(vales) : '…'}</div>
          </div>
        </div>

        {closed && (
          <div className="card mt-3 !py-3 bg-signal-50 border-signal-200 text-sm text-signal-800">
            ✓ Folha deste mês fechada · valor líquido <strong>{fmtBRL(Number(closed.net))}</strong>
          </div>
        )}
        {!closed && isCurrent && (
          <p className="text-xs text-steel-500 mt-3">
            O valor vai subindo conforme você conclui OS. Vales e outros descontos são abatidos no fechamento da folha.
          </p>
        )}

        <div className="card mt-4 !p-0 overflow-hidden">
          <div className="px-4 py-3 text-[10px] font-bold text-steel-500 uppercase tracking-widest border-b border-steel-100">OS que contaram no mês</div>
          {list === null ? (
            <div className="h-24 animate-pulse bg-steel-50" />
          ) : list.length === 0 ? (
            <p className="text-sm text-steel-400 px-4 py-6 text-center">Nenhuma OS concluída por você neste mês.</p>
          ) : (
            <ul className="divide-y divide-steel-100">
              {list.map(o => {
                const l = Number(o.labor_cost ?? 0);
                return (
                  <li key={o.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">OS {osNumber(o)} · {o.title}</div>
                      <div className="text-xs text-steel-500">
                        {new Date(o.completed_at).toLocaleDateString('pt-BR')}{o.vehicle?.plate ? ` · ${o.vehicle.plate}` : ''} · mão de obra {fmtBRL(l)}
                      </div>
                    </div>
                    <div className={`shrink-0 font-bold ${l > 0 ? 'text-signal-700' : 'text-steel-400'}`}>{fmtBRL(l * pct / 100)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </WorkshopLayout>
  );
}
