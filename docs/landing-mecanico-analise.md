# Landing do mecânico (`/mecanico`): análise e nova versão

Arquivo: `src/pages/public/LandingMecanico.tsx`
Público: mecânicos e profissionais automotivos (marketplace), não a equipe da oficina.

---

## 1. O que manter

- **Visual e identidade:** ilustração do hero, paleta laranja/steel, cards com filete lateral e passos numerados.
- **Calculadora de ganhos:** é o elemento mais persuasivo da página. Ela continua, mas reformulada como simulação.
- **Selos "sem mensalidade / sem fidelidade":** são verdade e reduzem o atrito do cadastro.
- **"Como funciona" em passos.**
- **Argumento "a oficina entra com a estrutura":** ferramenta, elevador e peça ficam com a oficina. É um diferencial real.
- **Reputação digital:** avaliação por serviço já existe no produto (`mechanic_rating` e reviews).

## 2. O que remover

| Trecho atual | Motivo |
|---|---|
| "Sem patrão, sem CLT, sem cliente que some." | Incentiva largar o emprego formal e afasta quem tem carteira assinada. |
| Card de dor "CLT te aprisiona" | Mesmo problema. |
| "Liberdade total: Sem patrão fixo. Sem CLT." | Mesmo problema. |
| "PIX em até 24h" (hero, card, passo 4, número "24h") | O repasse ainda depende de processo manual, porque o split exige CNPJ. A frase é uma promessa de prazo. |
| "Pagamento garantido", "A gente garante", "100% das demandas pré-pagas (escrow)" | Hoje não existe custódia automatizada. É promessa absoluta. |
| Card flutuante "PIX recebido R$ 164 há 23h" | Reforça o prazo de 24h. |
| "Aprovação em 24h" | A análise é manual e não temos SLA. |
| "Oficina fica com metade, 50/50 é o padrão" | É generalização, além de atacar o cliente pagante (a oficina). |
| Slider com presets "Renda principal" e "Foco máximo" (até 48h) | Ancora a página em quem vive só disso. |
| "Comece a faturar" / "Sua próxima OS pode ser hoje" | Promessa de imediatismo. |
| Comentário "estilo Uber" no código | Pediu-se para não associar a marca a esse termo. |

## 3. O que mudar

- **Headline e subtítulo:** saem de "liberdade vs. patrão" e entram em "experiência + oportunidade + rotina" (itens 6 e 7).
- **Bloco de dores:** troca o ataque ao emprego/oficina por "Para quem é", com 4 perfis, incluindo quem tem emprego.
- **Calculadora:** agora tem 2 controles (horas e valor/hora), presets de rotina real ("Só o sábado", "Sábado + 2 noites", "Meio período"), rótulo "Simulação · valor líquido" e aviso explícito de não-garantia. Ela usa `mechanicNet()` em vez do `0.82` hardcoded, como pede a regra do `payment.ts`.
- **Recebimento:** sai a promessa de prazo e entra a transparência: "valor claro antes de aceitar, horas e confirmação registradas, PIX na chave do cadastro, histórico em Ganhos".
- **CTA principal:** de "Cadastrar grátis em 2 minutos" para "Quero receber oportunidades".

## 4. O que mover de posição

- **Calculadora:** estava logo após o hero. Ela vem depois de "Como funciona" e "Benefícios", para o número aparecer quando a pessoa já entende o modelo, e não como promessa de entrada.
- **"Zero investimento":** deixa de ser seção solta e vira um card em Benefícios ("Estrutura da oficina").
- **Reputação:** sai do meio de uma lista de 6 cards e ganha seção própria, com destaque escuro.
- **Prova de confiança:** sai da faixa de "números" no fim e vira a seção "Confiança", antes do FAQ.

## 5. O que estava faltando

- Mensagem explícita para quem **já tem emprego**, mais a nota sobre cláusula de exclusividade.
- **Disponibilidade parcial / sem horário mínimo** (o app já tem o toggle Disponível/Offline).
- **Escolha de região**, com a distância visível em cada oportunidade.
- **Especialidades** como filtro de oportunidades.
- **Relacionamento recorrente** com oficinas.
- **Avaliação de mão dupla:** o mecânico também avalia a oficina.
- **FAQ**, que antes não existia.
- Links de **Termos** e **Privacidade** no rodapé.
- Âncora "Ver como funciona" como CTA secundário.

## 6. Nova headline

**Ganhe mais usando a experiência que você já tem.**

## 7. Novo subtítulo

> Receba oportunidades de serviço em oficinas da sua região, nos horários que você tem livres. Use como renda extra, mesmo já tendo emprego, ou como mais uma fonte de trabalho. **Você escolhe o que aceita.**

## 8. Nova sequência das seções

1. Hero (headline, subtítulo, CTA, selos, card de oportunidade + card de avaliação)
2. Para quem é (4 perfis + nota CLT)
3. Como funciona (5 passos)
4. Benefícios (6 cards)
5. Simulador
6. Reputação profissional (seção escura)
7. Confiança
8. FAQ
9. CTA final
10. Rodapé

## 9. Copy completa de cada seção

**Hero**
- Selo: PARA MECÂNICOS E PROFISSIONAIS AUTOMOTIVOS
- H1: Ganhe mais usando a experiência que você já tem.
- Sub: (item 7)
- CTA: Quero receber oportunidades · secundário: Ver como funciona
- Selos: ✓ Cadastro gratuito · ✓ Sem mensalidade · ✓ Sem horário mínimo
- Card 1: NOVA OPORTUNIDADE · Pastilha de freio · Sábado · 2h · ~3 km de você
- Card 2: AVALIAÇÃO DA OFICINA · ★★★★★ · "Serviço caprichado. Vamos chamar de novo."

**Para quem é**: "Feito pra quem sabe trabalhar, seja qual for a sua rotina."
- *Tem emprego e quer renda extra:* Use folgas, sábados ou o contraturno. Você continua no seu trabalho e soma uma renda complementar quando der.
- *Já trabalha por conta:* Preencha os horários vagos da semana com serviços em oficinas, sem precisar correr atrás de cliente.
- *Tem uma especialidade forte:* Injeção, elétrica, diesel, ar-condicionado, câmbio… Seja encontrado pelo que você faz de melhor.
- *Quer construir nome no mercado:* Cada serviço avaliado vira histórico. Seu trabalho passa a falar por você com novas oficinas.
- Nota: Tem carteira assinada? Vale conferir se o seu contrato tem cláusula de exclusividade. Na maioria dos casos, trabalhar no tempo livre é permitido.

**Como funciona**: "Você informa sua rotina. A gente mostra o que encaixa."
1. *Monte seu perfil profissional:* Especialidades, anos de experiência, região onde mora, valor da sua hora e chave PIX. Leva poucos minutos e é gratuito.
2. *Nossa equipe analisa o cadastro:* Conferimos os dados pra manter a rede confiável, para você e para as oficinas. Você recebe o aviso quando for aprovado.
3. *Fique disponível quando puder:* Ativou, recebe alertas. Desativou, ninguém te chama. Pode ser só no sábado, só à noite ou a semana toda.
4. *Escolha o serviço:* Antes de aceitar você vê o serviço, a oficina, a distância, as horas estimadas e o valor. Aceita o que fizer sentido, recusa o resto, sem penalidade.
5. *Execute e registre:* Faz o serviço na oficina, com a estrutura dela. A oficina confirma, o valor entra no seu histórico de ganhos e o pagamento vai para a sua chave PIX.

**Benefícios**: "Mais trabalho, do seu jeito."
- *Renda complementar:* Transforme horas livres em dinheiro, sem largar o que você já tem.
- *Seus horários:* Sem jornada mínima. Disponibilidade parcial é bem-vinda: uma tarde por semana já conta.
- *Sua região:* Você vê a distância de cada serviço e escolhe até onde vale a pena ir.
- *Suas especialidades:* Cadastre o que você domina e receba oportunidades compatíveis com o seu conhecimento.
- *Estrutura da oficina:* Elevador, ferramental e peças ficam por conta da oficina. Você entra com a mão de obra.
- *Valor claro antes de aceitar:* Você vê quanto vai receber antes de dizer sim. Nada de combinar no fio do bigode.

**Simulador**: "Quanto suas horas livres podem render?"
- Sub: Ajuste as horas e o valor da sua hora. É só uma simulação para você ter uma ideia.
- Controles: horas/semana (2–40, padrão 8h) com presets *Só o sábado · 8h*, *Sábado + 2 noites · 15h*, *Meio período · 25h*; valor/hora (R$ 50–150, padrão R$ 80).
- Resultado: "Simulação · valor líquido": R$ X por semana, ≈ R$ Y por mês.
- Aviso: Simulação ilustrativa, não é promessa nem garantia de ganho. Considera que todas as horas informadas foram preenchidas com serviços e já desconta a taxa da plataforma. O resultado real depende da demanda na sua região, dos serviços que você aceitar e do valor de cada um.

**Reputação profissional**: "Seu trabalho bem feito vira histórico."
- Sub: Hoje a sua competência depende de indicação boca a boca. Aqui ela fica registrada e é vista por cada oficina nova.
- *Avaliação a cada serviço:* A oficina avalia o seu trabalho. A sua nota e os comentários formam o seu perfil profissional.
- *Histórico que acumula:* Serviços feitos, especialidades e anos de experiência ficam no seu perfil. É o seu currículo prático.
- *Oficinas que voltam a chamar:* Oficina que gosta do seu trabalho tende a chamar de novo. É assim que nasce um relacionamento recorrente.
- Rodapé: E a avaliação vale nos dois sentidos: você também avalia a oficina.

**Confiança**: "Tudo combinado e registrado."
- *Oficinas analisadas:* Toda oficina passa por análise da nossa equipe antes de publicar serviços.
- *Valor definido antes de começar:* Serviço, horas estimadas e valor ficam claros na tela antes de você aceitar.
- *Horas e confirmação registradas:* Você registra as horas trabalhadas e a oficina confirma a conclusão. Fica tudo documentado na plataforma.
- *Recebimento via PIX, com histórico:* O pagamento vai para a chave PIX do seu cadastro. Na área Ganhos você acompanha cada serviço e cada valor.

**CTA final**
- Kicker: COMECE NO SEU RITMO
- H2: Sua experiência vale mais do que você imagina.
- Texto: Crie seu perfil grátis, informe suas especialidades e comece a receber oportunidades que cabem na sua rotina.
- Botão: Criar meu perfil grátis
- Linha: Sem mensalidade · Sem horário mínimo · Sai quando quiser

## 10. CTAs recomendados

| Local | CTA |
|---|---|
| Header | Cadastrar grátis |
| Hero (primário) | Quero receber oportunidades → |
| Hero (secundário) | Ver como funciona (âncora) |
| Final | Criar meu perfil grátis → |

Alternativas para teste A/B: "Começar a receber oportunidades", "Cadastrar minhas especialidades".

## 11. FAQ

1. **Posso usar mesmo tendo carteira assinada?** Pode. A plataforma foi pensada também pra quem quer renda extra no tempo livre: folgas, sábados, contraturno. Só vale conferir se o seu contrato tem cláusula de exclusividade.
2. **Preciso ficar disponível um número mínimo de horas?** Não. Você fica disponível quando puder e desativa quando não puder. Não existe jornada mínima nem penalidade por recusar serviço.
3. **Quanto custa?** O cadastro é gratuito e não tem mensalidade. A plataforma só fica com uma parte quando você faz um serviço, e o valor que aparece pra você antes de aceitar já é o que você recebe.
4. **Quanto eu vou ganhar?** Depende da demanda na sua região, do valor da sua hora e de quantos serviços você aceitar. O simulador dá uma ideia, mas não é garantia de ganho.
5. **Como eu recebo?** Depois que a oficina confirma a conclusão, o valor entra no seu histórico de ganhos e o pagamento é feito na chave PIX do seu cadastro.
6. **Preciso ter ferramenta ou oficina própria?** Não. O serviço é feito na oficina, com a estrutura dela.
7. **Como escolho a região e o tipo de serviço?** Você informa onde mora e suas especialidades. Cada oportunidade mostra serviço, oficina e distância.
8. **Quanto tempo leva a aprovação?** A equipe analisa cada cadastro. Você recebe o aviso quando for aprovado.
9. **Preciso de CNPJ ou MEI?** Para começar, não: o cadastro é feito com CPF. Se algum tipo de serviço exigir formalização, avisamos com antecedência.
10. **Posso sair quando quiser?** Sim. Sem fidelidade nem multa.

## 12. Sugestões de confiança e reputação (próximos passos)

- **Depoimentos reais** de 2–3 mecânicos (foto, nome, especialidade, "trabalho CLT + sábados"), só com autorização por escrito. Hoje não colocamos porque não temos depoimentos verdadeiros.
- **Números reais** quando houver volume: "X oficinas ativas em SP", "nota média dos mecânicos". Nada inventado.
- **Selo "Perfil verificado"** no perfil do mecânico após a aprovação.
- **CNPJ e razão social** da empresa no rodapé, assim que a empresa estiver aberta.
- **Contato humano:** botão de WhatsApp de suporte ao mecânico.
- **Página pública do perfil** (nota, especialidades, nº de serviços), que o mecânico pode compartilhar.

## 13. Sugestões para aumentar cadastro e ativação

- **Cadastro em 2 etapas:** primeiro só nome, WhatsApp, especialidades e bairro; depois CPF, PIX e o restante. Reduz o abandono no formulário longo.
- **Levar o simulador para o cadastro:** pré-preencher o valor/hora com o que a pessoa escolheu na landing (query param `?h=15&v=90`).
- **Disponibilidade semanal no perfil** (dias e turnos). Hoje o app só tem Disponível/Offline. Com isso a promessa "informe sua rotina" fica literal e permite alertas só nos horários escolhidos.
- **Raio de atendimento configurável** (ex.: até 10 km). Hoje a distância aparece em cada job, mas não existe filtro.
- **Onboarding pós-aprovação:** WhatsApp com "ative sua disponibilidade no sábado" + checklist de perfil completo (foto, especialidades, PIX).
- **Indicação:** o programa Embaixador já existe. Divulgar um link "indique um colega" após o 1º serviço.
- **Lista de espera por região:** se a região do cadastro ainda não tem oficinas, avisar com honestidade e notificar quando abrir (conversa com a feature futura de recusa por região).
- **Eventos de funil:** visita → clique no CTA → cadastro iniciado → enviado → aprovado → 1º disponível → 1º job.

## 14. Pontos de risco nas promessas atuais (versão antiga)

| Risco | Gravidade | Por quê |
|---|---|---|
| "PIX em até 24h" / "24h prazo máximo do PIX" | Alta | Repasse depende de processo manual; sem split automático (CNPJ). Prazo descumprido vira reclamação e possível questionamento no Procon. |
| "Pagamento garantido" / "A gente garante" / "100% pré-pago (escrow)" | Alta | Não há custódia automatizada hoje. Promessa absoluta. |
| Renda estimada sem aviso de simulação, com taxa oculta | Média | Pode ser lida como promessa de renda. |
| "Aprovação em 24h" | Média | Sem SLA operacional. |
| Discurso anti-CLT | Média | Afasta o público empregado e pode ser lido como incentivo a abandonar emprego formal. |
| "Oficina fica com metade" | Baixa/média | Generalização que ataca o cliente pagante. |
| "Ranking público / sobe na fila" | Baixa | Não há ranking público implementado. |

**Ponto ainda em aberto:** a resposta do FAQ "Preciso de CNPJ ou MEI?" diz que o cadastro é feito com CPF (é verdade hoje). Se o split exigir CNPJ/MEI do mecânico no futuro, é preciso atualizar essa resposta.

## 15. Versão final

Já implementada em `src/pages/public/LandingMecanico.tsx`, no branch `feat/landing-mecanico-renda-extra`.
