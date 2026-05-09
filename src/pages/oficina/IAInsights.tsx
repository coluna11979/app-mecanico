import ComingSoonPage from '@/components/ComingSoonPage';

export default function WorkshopIAInsights() {
  return (
    <ComingSoonPage
      featureKey="ai_insights"
      emoji="🤖"
      badge="Em breve · Powered by IA"
      title="Análise de Dados com IA"
      subtitle="Pare de adivinhar. Deixa a inteligência artificial te dizer o que tá funcionando, o que tá vazando dinheiro e onde focar pra crescer."
      gradient="from-steel-700 via-steel-800 to-steel-900"
      ctaText="Quero entrar na fila"
      ctaSuccessText="Você está na fila pro lançamento da IA!"
      description={
        <>
          <p>
            A oficina gera centenas de dados todo mês — OS, tempo de execução, mecânicos, peças, satisfação do cliente. Mas <strong>quem tem tempo de cruzar tudo isso?</strong>
          </p>
          <p>
            Nossa IA vai analisar continuamente os dados da sua oficina e <strong>te entregar insights acionáveis</strong> direto no painel — em linguagem clara, sem precisar saber Excel ou abrir planilha.
          </p>
          <p>
            Imagina abrir o app e ver: <em>"Suas trocas de óleo levam 23% mais tempo que a média da região. O mecânico Carlos é 40% mais rápido que os outros — vale ver o que ele faz diferente."</em> Isso é o que vamos entregar.
          </p>
        </>
      }
      benefits={[
        {
          icon: '🧠',
          title: 'Insights diários',
          desc: 'A IA analisa seus dados todo dia e gera 3-5 recomendações práticas: "vc tá deixando dinheiro na mesa em X" ou "vale focar em Y".',
        },
        {
          icon: '📈',
          title: 'Previsão de receita',
          desc: 'Baseado no histórico e nas oportunidades em aberto, prevê o faturamento do mês com margem de erro precisa.',
        },
        {
          icon: '⏱️',
          title: 'Eficiência por mecânico',
          desc: 'Quem é mais rápido? Quem comete mais retrabalho? Quem tem melhor avaliação? Ranking automatizado.',
        },
        {
          icon: '🎯',
          title: 'Detecção de gargalo',
          desc: 'Identifica onde tá travando: serviço que demora demais, cliente que sempre reclama, peça que sempre falta.',
        },
        {
          icon: '💡',
          title: 'Sugestões de upsell',
          desc: '"Esse cliente troca óleo a cada 6 meses. Próxima é em 12 dias. Mande um lembrete agora pra antecipar."',
        },
        {
          icon: '🚨',
          title: 'Alertas anti-fraude',
          desc: 'A IA flagra padrões estranhos: peça cobrada e não usada, OS muito acima da média, retrabalho em sequência.',
        },
        {
          icon: '🗣️',
          title: 'Pergunte em português',
          desc: '"Qual o serviço mais rentável?" "Quanto faturei mês passado?" — chat com IA que conhece sua oficina.',
        },
        {
          icon: '📊',
          title: 'Dashboards automáticos',
          desc: 'Gráficos que se montam sozinhos. Receita, mix de serviços, ticket médio, sazonalidade — tudo visual e claro.',
        },
        {
          icon: '🔒',
          title: 'Seus dados, seu controle',
          desc: 'Tudo criptografado. A IA só usa dados da sua oficina. Você pode exportar e remover quando quiser.',
        },
      ]}
    />
  );
}
