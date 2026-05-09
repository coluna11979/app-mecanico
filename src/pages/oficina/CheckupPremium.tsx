import ComingSoonPage from '@/components/ComingSoonPage';

export default function WorkshopCheckupPremium() {
  return (
    <ComingSoonPage
      featureKey="checkup_premium"
      emoji="🔍"
      badge="Em breve · Beta fechado em construção"
      title="Check-up Premium"
      subtitle="A ferramenta gratuita que vira sua máquina de captação. Atraia clientes sem investir em tráfego pago."
      gradient="from-brand-500 via-brand-600 to-brand-700"
      ctaText="Quero participar do beta"
      ctaSuccessText="Você está na lista do beta. Entraremos em contato!"
      description={
        <>
          <p>
            O Check-up Premium é o nosso módulo mais ambicioso. Ele transforma cada cliente que entra na sua oficina em um <strong>relacionamento de longo prazo</strong> — não só no atendimento atual.
          </p>
          <p>
            A ideia é simples: você (ou um avaliador credenciado) faz uma <strong>vistoria completa e gratuita</strong> no veículo do cliente. O sistema gera um <em>relatório profissional</em> de saúde do carro, e cada item que precisa de atenção vira uma <strong>oportunidade de OS</strong> registrada no seu CRM.
          </p>
          <p>
            <strong>Resultado:</strong> sua oficina vira referência de transparência na região, fideliza clientes e cria um pipeline previsível de manutenções futuras — sem gastar com anúncios.
          </p>
        </>
      }
      benefits={[
        {
          icon: '📋',
          title: 'Templates inteligentes',
          desc: 'Inspeção pronta com 50+ pontos de checagem (Motor, Freios, Suspensão, Elétrica, Pneus, Fluidos, etc), customizável por oficina.',
        },
        {
          icon: '🚦',
          title: 'Status visual claro',
          desc: 'Cada item recebe semáforo (Verde/Amarelo/Vermelho) com fotos, observações e medidas. Nada subjetivo.',
        },
        {
          icon: '📄',
          title: 'Relatório profissional',
          desc: 'PDF bonito com a sua marca enviado direto pro WhatsApp/email do cliente. Ele guarda e mostra pra família.',
        },
        {
          icon: '💰',
          title: 'Banco de oportunidades',
          desc: 'Cada item amarelo/vermelho vira lead automático no CRM. Você sabe o que tem que ser feito e quando lembrar o cliente.',
        },
        {
          icon: '👥',
          title: 'Avaliadores credenciados',
          desc: 'Sua equipe ou mecânicos do marketplace fazem o check-up. Login temporário com permissões limitadas — segurança garantida.',
        },
        {
          icon: '🔔',
          title: 'Lembretes automáticos',
          desc: 'O sistema lembra você (e o cliente) na hora certa: "O Sr. João precisa trocar a pastilha que vc indicou em janeiro".',
        },
        {
          icon: '📱',
          title: 'App do avaliador',
          desc: 'Mecânico avaliador faz tudo no celular: tira foto, marca status, salva. Sincroniza automaticamente com a oficina.',
        },
        {
          icon: '📊',
          title: 'Métricas que importam',
          desc: 'Quantos check-ups viraram OS? Qual o ticket médio? Que mecânico converte mais? Você responde tudo isso.',
        },
        {
          icon: '🎁',
          title: '30 dias grátis',
          desc: 'Experimenta sem custo. Se gostar, plano mensal acessível. Sem fidelidade.',
        },
      ]}
    />
  );
}
