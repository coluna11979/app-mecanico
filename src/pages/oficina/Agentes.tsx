import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import WorkshopLayout from '@/components/layout/WorkshopLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useOperator } from '@/lib/operators';
import ReceptionCard from '@/components/agents/ReceptionCard';
import AgentChat from '@/components/agents/AgentChat';
import { useWorkshopModules } from '@/lib/modules';

export default function Agentes() {
  const { currentWorkshop } = useAuth();
  // O sócio conversa sobre os números (caixa, vendas): sem o Caixa (ex.: pacote Atendimento) fica só a Recepção
  const showPartner = useWorkshopModules(s => !s.off.includes('caixa'));
  // O Orçamentista abre OS e lança itens: precisa do módulo de Ordens de serviço
  const showBudget = useWorkshopModules(s => !s.off.includes('os'));
  const balcao = useOperator((s) => s.balcao);
  const wid = currentWorkshop?.id;
  // Atalho da Busca rápida: /oficina/agentes?agente=orcamento leva direto ao agente
  const [params] = useSearchParams();
  const alvo = params.get('agente');
  /** No celular, vindo da Busca rápida: só o agente escolhido na hora fica na tela (os demais ficam escondidos) */
  const only = (k: string) => (alvo && alvo !== k ? 'hidden lg:block' : '');
  useEffect(() => {
    if (!alvo) return;
    const t = setTimeout(() => document.getElementById(`agente-${alvo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    return () => clearTimeout(t);
  }, [alvo, wid]);

  if (balcao) {
    return (
      <WorkshopLayout>
        <div className="card max-w-xl text-sm text-steel-500">🔒 Os agentes de IA são só para o dono da oficina. Saia do modo balcão para abrir.</div>
      </WorkshopLayout>
    );
  }

  return (
    <WorkshopLayout>
      <div className="max-w-3xl space-y-4">
        {alvo && (
          <Link to="/oficina/agentes" className="lg:hidden inline-flex items-center min-h-[44px] text-sm font-medium text-brand-600">← Ver todos os agentes</Link>
        )}
        <div className={alvo ? 'hidden lg:block' : ''}>
          <h1 className="text-2xl font-bold">🤖 Agentes de IA</h1>
          <p className="text-sm text-steel-500 mt-1">
            {showPartner
              ? <>Agentes que atendem os clientes no WhatsApp, um sócio virtual para os números e um orçamentista que abre OS da {currentWorkshop?.business_name ?? 'oficina'}.</>
              : <>Agente que atende os clientes no WhatsApp da {currentWorkshop?.business_name ?? 'oficina'}.</>}
          </p>
        </div>

        {wid && (
          <section className={`space-y-2 ${alvo ? 'hidden lg:block' : ''}`}>
            <h2 className="text-sm font-semibold text-steel-500 uppercase tracking-wide">Atendimento no WhatsApp</h2>
            <ReceptionCard workshopId={wid} />
          </section>
        )}

        {wid && showBudget && <div id="agente-orcamento" className={`scroll-mt-20 ${only('orcamento')}`}><AgentChat key="orcamento" workshopId={wid} template="orcamento" /></div>}
        {wid && <div id="agente-diagnostico" className={`scroll-mt-20 ${only('diagnostico')}`}><AgentChat key="diagnostico" workshopId={wid} template="diagnostico" /></div>}
        {wid && showPartner && <div id="agente-socio" className={`scroll-mt-20 ${only('socio')}`}><AgentChat key="socio" workshopId={wid} template="socio" /></div>}
      </div>
    </WorkshopLayout>
  );
}
