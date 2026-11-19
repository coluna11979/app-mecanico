import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useOperator } from '@/lib/operators';
import ReceptionCard from '@/components/agents/ReceptionCard';
import CsCard from '@/components/agents/CsCard';
import AgentChat from '@/components/agents/AgentChat';
import { useWorkshopModules } from '@/lib/modules';

type AgentKey = 'orcamento' | 'diagnostico' | 'socio';
type Area = 'ia' | 'comunicacao';
const STORE = 'agentes:aba';

export default function Agentes() {
  const { currentWorkshop } = useAuth();
  // O sócio conversa sobre os números (caixa, vendas): sem o Caixa (ex.: pacote Atendimento) não aparece
  const showPartner = useWorkshopModules(s => !s.off.includes('caixa'));
  // O Orçamentista abre OS e lança itens: precisa do módulo de Ordens de serviço
  const showBudget = useWorkshopModules(s => !s.off.includes('os'));
  const balcao = useOperator((s) => s.balcao);
  const wid = currentWorkshop?.id;

  const agents = useMemo(() => ([
    showBudget && { key: 'orcamento' as const, icon: '🧾', label: 'Orçamentista', hint: 'Abre e cuida das OS' },
    { key: 'diagnostico' as const, icon: '🩺', label: 'Diagnóstico', hint: 'Causas do defeito' },
    showPartner && { key: 'socio' as const, icon: '📊', label: 'Sócio', hint: 'Números da oficina' },
  ].filter(Boolean) as { key: AgentKey; icon: string; label: string; hint: string }[]), [showBudget, showPartner]);

  // Área e agente vêm do link (?agente=orcamento | ?area=comunicacao, Busca rápida); senão o último usado
  const [params, setParams] = useSearchParams();
  let saved: string | null = null;
  try { saved = localStorage.getItem(STORE); } catch { /* sem storage */ }
  const isAgent = (k: string | null): k is AgentKey => !!k && agents.some(a => a.key === k);
  const urlAgent = params.get('agente');
  const area: Area = params.get('area') === 'comunicacao' ? 'comunicacao'
    : params.get('area') === 'ia' || isAgent(urlAgent) ? 'ia'
    : saved === 'comunicacao' ? 'comunicacao' : 'ia';
  const active: AgentKey = isAgent(urlAgent) ? urlAgent : isAgent(saved) ? saved : agents[0]?.key ?? 'diagnostico';

  useEffect(() => { try { localStorage.setItem(STORE, area === 'comunicacao' ? 'comunicacao' : active); } catch { /* sem storage */ } }, [area, active]);

  function go(next: { area: Area; agente?: AgentKey }) {
    const p = new URLSearchParams();
    p.set('area', next.area);
    if (next.area === 'ia') p.set('agente', next.agente ?? active);
    setParams(p, { replace: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (balcao) {
    return (
      <WorkshopLayout>
        <div className="card max-w-xl text-sm text-steel-500">🔒 Os agentes de IA são só para o dono da oficina. Saia do modo balcão para abrir.</div>
      </WorkshopLayout>
    );
  }

  const show = (k: AgentKey) => (area === 'ia' && active === k ? '' : 'hidden');

  return (
    <WorkshopLayout>
      <div className="max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">🤖 Agentes de IA</h1>

        {/* Seletor fixo no topo: área (IA × Comunicação) e, em IA, um agente por vez.
            Os outros ficam guardados escondidos, sem perder a conversa. */}
        <div className="sticky top-14 lg:top-0 z-20 -mx-4 lg:-mx-8 px-4 lg:px-8 py-2 bg-steel-50/95 backdrop-blur space-y-2">
          <div role="tablist" aria-label="Área" className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-steel-200/70">
            {([
              { key: 'ia' as const, label: '🤖 Agentes de IA' },
              { key: 'comunicacao' as const, label: '💬 Comunicação' },
            ]).map(t => (
              <button key={t.key} role="tab" aria-selected={area === t.key} onClick={() => go({ area: t.key })}
                className={`min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                  area === t.key ? 'bg-white shadow-sm text-steel-900' : 'text-steel-600 hover:text-steel-900'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {area === 'ia' && agents.length > 1 && (
            <div role="tablist" aria-label="Agente" className="flex gap-2 overflow-x-auto pb-0.5">
              {agents.map(a => {
                const on = a.key === active;
                return (
                  <button key={a.key} role="tab" aria-selected={on} onClick={() => go({ area: 'ia', agente: a.key })}
                    className={`shrink-0 min-h-[44px] rounded-full px-4 border text-sm font-medium transition-colors ${
                      on ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                         : 'bg-white border-steel-200 text-steel-700 hover:border-steel-300'}`}>
                    <span aria-hidden>{a.icon}</span> {a.label}
                    <span className={`hidden sm:inline text-xs ml-1.5 ${on ? 'text-white/80' : 'text-steel-400'}`}>· {a.hint}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {wid && showBudget && <div role="tabpanel" className={show('orcamento')}><AgentChat key="orcamento" workshopId={wid} template="orcamento" /></div>}
        {wid && <div role="tabpanel" className={show('diagnostico')}><AgentChat key="diagnostico" workshopId={wid} template="diagnostico" /></div>}
        {wid && showPartner && <div role="tabpanel" className={show('socio')}><AgentChat key="socio" workshopId={wid} template="socio" /></div>}

        {wid && (
          <div role="tabpanel" className={`space-y-6 ${area === 'comunicacao' ? '' : 'hidden'}`}>
            <p className="text-sm text-steel-500">Agentes que falam com os seus clientes pelo WhatsApp da {currentWorkshop?.business_name ?? 'oficina'}.</p>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-steel-500 uppercase tracking-wide">Atendimento no WhatsApp</h2>
              <ReceptionCard workshopId={wid} />
            </section>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-steel-500 uppercase tracking-wide">Pós-venda automático</h2>
              <CsCard workshopId={wid} />
            </section>
          </div>
        )}
      </div>
    </WorkshopLayout>
  );
}
