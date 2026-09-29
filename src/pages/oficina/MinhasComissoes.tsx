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
import { commissionFor, commissionRule, pcts } from '@/lib/commission';

/** OS do mês com a parte que foi feita por este colaborador */
type Os = { id: string; number: number | null; title: string; completed_at: string; plate: string | null; labor: number; parts: number };

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
  const [revenue, setRevenue] = useState(0);
  const [closed, setClosed] = useState<PayrollItem | null>(null);

  const mechanicId = me?.mechanicId ?? null;

  useEffect(() => {
    if (!wid || !mechanicId) return;
    let alive = true;
    setList(null);
    const { from, to } = monthRange(competence);
    const rules = pcts(me!.commission);
    Promise.all([
      // Base de comissão já dividida por quem fez cada item (mesma da folha)
      fetchAll((a, b) => supabase.from('os_commission_base').select('service_order_id, labor, parts')
        .eq('workshop_id', wid).eq('mechanic_id', mechanicId).eq('status', 'completed').is('quote_status', null)
        .gte('completed_at', from).lt('completed_at', to).order('service_order_id').range(a, b)),
      // Faturamento da loja: só para quem ganha % sobre ele
      rules.revenue > 0
        ? fetchAll((a, b) => supabase.from('service_orders').select('id, price')
            .eq('workshop_id', wid).eq('status', 'completed').is('quote_status', null)
            .gte('completed_at', from).lt('completed_at', to).order('id').range(a, b))
        : Promise.resolve({ data: [] as { price: number }[] }),
      fetchAll((a, b) => supabase.from('cash_entries').select('id, amount')
        .eq('workshop_id', wid).eq('mechanic_id', mechanicId).eq('kind', 'vale').is('cancelled_at', null)
        .gte('created_at', from).lt('created_at', to).order('id').range(a, b)),
      supabase.from('payroll_items').select('*').eq('workshop_id', wid).eq('mechanic_id', mechanicId).eq('competence', competence).maybeSingle(),
    ]).then(async ([b, sales, v, p]) => {
      const base = new Map<string, { labor: number; parts: number }>();
      for (const x of (b.data ?? []) as { service_order_id: string; labor: number; parts: number }[]) {
        const e = base.get(x.service_order_id) ?? { labor: 0, parts: 0 };
        e.labor += Number(x.labor); e.parts += Number(x.parts);
        base.set(x.service_order_id, e);
      }
      const ids = [...base.keys()];
      const info = new Map<string, { number: number | null; title: string; completed_at: string; vehicle: { plate: string | null } | null }>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from('service_orders').select('id, number, title, completed_at, vehicle:vehicles(plate)').in('id', ids.slice(i, i + 200));
        for (const o of (data ?? []) as any[]) info.set(o.id, o);
      }
      if (!alive) return;
      setList(ids.map(id => {
        const o = info.get(id);
        return { id, number: o?.number ?? null, title: o?.title ?? 'OS', completed_at: o?.completed_at ?? '', plate: o?.vehicle?.plate ?? null, ...base.get(id)! };
      }).sort((x, y) => y.completed_at.localeCompare(x.completed_at)));
      setRevenue(((sales.data ?? []) as { price: number }[]).reduce((t, x) => t + Number(x.price), 0));
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

  const p = pcts(me.commission);
  const rule = commissionRule(me.commission);
  const calc = commissionFor(me.commission, {
    labor: (list ?? []).reduce((t, o) => t + o.labor, 0),
    parts: (list ?? []).reduce((t, o) => t + o.parts, 0),
  }, revenue);
  // Mês já fechado: vale o que foi fechado na folha
  const commission = closed ? Number(closed.commission) : calc.commission;
  const osCommission = (o: Os) => o.labor * p.labor / 100 + o.parts * p.parts / 100;
  const isCurrent = competence === thisMonth();

  return (
    <WorkshopLayout>
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight">💸 Minhas comissões</h1>
        <p className="text-sm text-steel-500 mt-1">
          {session.name} · {rule ? <>sua regra: <strong>{rule}</strong></> : 'sem comissão cadastrada'}
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
            <div className="text-[11px] text-steel-500">{p.parts > 0 ? 'Serviços + peças que você fez' : 'Serviços que você fez'}</div>
            <div className="text-2xl font-bold mt-1">{list ? fmtBRL(calc.labor + (p.parts > 0 ? calc.parts : 0)) : '…'}</div>
          </div>
          <div className="card !p-4">
            <div className="text-[11px] text-steel-500">Vales no mês</div>
            <div className="text-2xl font-bold mt-1 text-alert-600">{list ? fmtBRL(vales) : '…'}</div>
          </div>
        </div>

        {p.revenue > 0 && list && (
          <p className="text-xs text-steel-500 mt-3">
            Inclui {fmtBRL(Math.round(calc.revenue * p.revenue) / 100)} dos {String(p.revenue).replace('.', ',')}% sobre o faturamento da loja.
          </p>
        )}
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
            <p className="text-sm text-steel-400 px-4 py-6 text-center">Nenhum serviço seu em OS concluída neste mês.</p>
          ) : (
            <ul className="divide-y divide-steel-100">
              {list.map(o => {
                const c = osCommission(o);
                return (
                  <li key={o.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">OS {osNumber(o)} · {o.title}</div>
                      <div className="text-xs text-steel-500">
                        {o.completed_at && new Date(o.completed_at).toLocaleDateString('pt-BR')}{o.plate ? ` · ${o.plate}` : ''}
                        {o.labor > 0 && ` · serviços ${fmtBRL(o.labor)}`}{p.parts > 0 && o.parts > 0 && ` · peças ${fmtBRL(o.parts)}`}
                      </div>
                    </div>
                    <div className={`shrink-0 font-bold ${c > 0 ? 'text-signal-700' : 'text-steel-400'}`}>{fmtBRL(c)}</div>
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
