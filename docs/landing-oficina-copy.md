# Landing Oficina — análise e nova copy

Página analisada: `src/pages/public/LandingOficina.tsx` (rota `/oficina`), versão igual à da `main` em 06/10/2026.

Proposta central: **"A mão de obra que sua oficina precisa, quando precisa."**

---

## 0. Diagnóstico geral

A página atual vende **"trocar CLT por app"**. A página nova deve vender **"nunca mais recusar serviço por falta de gente"** e **"montar sua própria equipe de confiança sob demanda"**.

Três problemas estruturais:

1. **A promessa principal é arriscada.** "Mecânico em 1 hora. Sem CLT. Sem encargos." promete prazo que a plataforma não controla e coloca o app como substituto do registro em carteira. Isso afasta o dono de oficina que tem equipe registrada e é um tema jurídico sensível (vínculo empregatício).
2. **O foco está espalhado.** Metade das dores e dos benefícios é sobre gestão (caderninho, marketing, controle). Gestão é um bônus, não o motivo do cadastro.
3. **O melhor diferencial está escondido.** A lista de **mecânicos preferidos** (com vaga publicada só para eles) já existe no produto e não aparece na página. É isso que separa o MecânicoApp de um "classificado de bico".

---

## 1–5. Análise seção por seção

### Nav
| | |
|---|---|
| **Manter** | Logo, "Entrar", botão de cadastro fixo. |
| **Mudar** | Botão "Cadastrar" → "Cadastrar oficina". |

### Hero
| | |
|---|---|
| **Manter** | Layout em 2 colunas, mock do painel à direita, CTA principal forte, selo "Para donos de oficina". |
| **Remover** | "Mecânico em 1 hora", "Sem CLT. Sem encargos.", "100% gratuito", tag "Ao vivo · Mecânico chegou", "Chega em ~14 min". |
| **Mudar** | Headline e subtítulo (ver itens 6 e 7). O mock deve mostrar **um pedido indo primeiro para os Preferidos e recebendo respostas**, não um carro de entrega chegando. |
| **Faltando** | A palavra "preferidos/confiança" logo na primeira dobra. |

### Dores ("Reconhece esses problemas?")
| | |
|---|---|
| **Manter** | O formato de cards e a linguagem do dia a dia ("Vou ter que ver, mestre"). |
| **Remover** | "CLT pesa toda hora", "OS no caderninho", "Sem controle real", "Marketing? Esquece". Ficam fora do foco (mão de obra). |
| **Mudar** | "Mecânico bom é raro — e some" fica, com tom menos amargo. |
| **Faltando** | Carro parado ocupando box, equipe sobrecarregada, pico de demanda, serviço recusado, dificuldade de contratar. |

### Calculadora "Quanto sua oficina paga em CLT"
| | |
|---|---|
| **Remover da página** | A comparação CLT × app. Ela usa números estimados (encargos de 1,7×, R$ 80/h, produtividade de 50%) que o dono pode contestar, convida a "demitir e usar o app" e reforça o risco trabalhista. |
| **Trocar por** | Calculadora **"Quanto você deixa de faturar por falta de gente"**: serviços recusados ou adiados por semana × ticket médio. Ela vende resultado, usa só números do próprio dono e não fala de CLT. |

### Solução ("Tudo que falta. Em um único painel.")
| | |
|---|---|
| **Manter** | Pagamento protegido, reputação, multi-loja (como bônus). |
| **Remover** | "Pague só pela hora trabalhada — Sem CLT, sem encargos", "Rastreamento ao vivo · ETA preciso", "mecânico aceita em minutos". |
| **Mudar** | Dividir em duas seções: **(a) Rede de confiança** (seção própria, destaque) e **(b) Gestão integrada** (seção curta, depois). |

### Como funciona
| | |
|---|---|
| **Manter** | 4 passos. |
| **Mudar** | O passo 2 deve mostrar a escolha "só para meus preferidos ou para todos da região". O passo 4 deve terminar em "salve nos preferidos". O texto "quando ele chega, você paga" pode virar "o pagamento fica protegido até você confirmar". |
| **Mover** | Logo depois da seção de rede de confiança. Hoje vem depois das funcionalidades. |

### FAQ
| | |
|---|---|
| **Manter** | "Posso continuar com minha equipe?", "Tem mensalidade?", "Como sei que é qualificado?". |
| **Mudar** | Remover "se algo der errado, não paga" (garantia incondicional) e "escrow". |
| **Mover** | Para logo antes do CTA final. Hoje fica colado em "Como funciona" com o mesmo fundo cinza, e as duas seções se misturam visualmente. |

### Números (StatCards)
| | |
|---|---|
| **Remover** | A seção inteira ("Sem CLT / zero encargos", "100% escrow"). Os números não são prova, são slogans. |
| **Trocar por** | Faixa de confiança (ver item 12) e, quando houver dados reais, números reais. |

### CTA final
| | |
|---|---|
| **Manter** | Estrutura e destaque. |
| **Mudar** | Sair de "sistema + marketplace + intermediação" e ir para resultado: "Na próxima vez que faltar gente, você já tem a quem chamar." |

### Footer
| | |
|---|---|
| **Remover** | Link "Brandbook", que não interessa ao dono de oficina. |
| **Mudar** | "Pagamento em escrow" → "Pagamento protegido". "CPF e CNH verificados" → "Cadastro verificado". |

---

## 6. Nova headline

> **A mão de obra que sua oficina precisa, quando precisa.**

Alternativas para teste A/B:
- "Faltou gente? Chame quem você já confia."
- "Pare de recusar serviço por falta de mecânico."

## 7. Novo subtítulo

> Reforce sua equipe nos dias de pico, nas faltas e nos serviços que não cabem na agenda. Encontre mecânicos verificados na sua região e, com o tempo, monte a sua própria rede de profissionais de confiança.

Linha de apoio sob o CTA:
> Cadastro gratuito · Sem mensalidade · Você só paga pelo serviço que contratar

---

## 8. Nova sequência das seções

1. **Hero:** promessa + CTA
2. **Dores:** "Quando falta gente, a oficina inteira sente"
3. **Calculadora de perda:** "Quanto custa recusar serviço"
4. **Solução:** "Reforço sob demanda, sem complicar sua rotina"
5. **Rede de confiança:** preferidos (seção destaque, fundo escuro)
6. **Como funciona:** 4 passos
7. **Segurança:** verificação, reputação, pagamento protegido
8. **Gestão integrada:** bônus (OS, clientes, multi-loja)
9. **Prova social:** depoimento/logo das primeiras oficinas (quando houver)
10. **FAQ**
11. **CTA final**
12. Footer

Lógica: dor → custo da dor → solução → diferencial → como funciona → por que confiar → bônus → objeções → ação.

---

## 9. Copy completa de cada seção

### 9.1 Hero

**Selo:** Para donos de oficina

**H1:** A mão de obra que sua oficina precisa, **quando precisa.**

**Subtítulo:** Reforce sua equipe nos dias de pico, nas faltas e nos serviços que não cabem na agenda. Encontre mecânicos verificados na sua região e, com o tempo, monte a sua própria rede de profissionais de confiança.

**CTA primário:** Cadastrar minha oficina grátis →
**CTA secundário:** Ver como funciona (âncora para #como-funciona)

**Microcopy:** ✓ Cadastro gratuito ✓ Sem mensalidade ✓ Sem exclusividade

**Mock à direita (substitui o atual):**
- Card 1: "Novo pedido · Suspensão dianteira — Gol 2015 · Hoje, à tarde"
- Chip: "Enviado para: ★ Seus preferidos (4)"
- Card 2: "2 respostas · Carlos S. ★ 4,9 · 37 serviços · Preferido"
- Rodapé: "Pagamento protegido até você confirmar o serviço"
- Tag flutuante (no lugar de "Ao vivo"): "★ Na sua rede"

### 9.2 Dores

**Eyebrow:** A rotina de quem toca oficina
**H2:** Quando falta gente, a oficina inteira sente.

Cards:
1. **Serviço recusado** — "Posso deixar pra semana que vem?" O cliente não espera, e vai pra outra oficina.
2. **Carro parado no box** — Um serviço travado ocupa o espaço de outros três. O pátio enche e o faturamento não sai.
3. **Equipe no limite** — Nos dias de pico, todo mundo vira hora extra. Cai a qualidade, sobe o retrabalho, e o cansaço cobra a conta.
4. **Contratar é difícil** — Achar mecânico bom leva semanas. E quando aparece, nem sempre a demanda justifica mais uma pessoa fixa.
5. **Alguém faltou** — Atestado, férias, imprevisto. A agenda era pra quatro e só tem três.
6. **Serviço fora da especialidade** — Chegou uma injeção eletrônica ou um câmbio automático e ninguém da equipe domina. Recusar é perder o cliente.

**Fechamento:** Não é falta de cliente. É falta de **mãos na hora certa.**

### 9.3 Calculadora de perda

**Eyebrow:** Faça a conta
**H2:** Quanto sua oficina deixa de faturar por falta de gente?

Inputs:
- Serviços recusados ou adiados por semana (slider 1–20, padrão 3)
- Ticket médio por serviço (slider R$ 200–3.000, padrão R$ 600)

Resultado:
- **R$ X por mês** em serviços que foram embora
- **R$ Y por ano**
- Texto: "E isso sem contar o cliente que não volta. Com reforço sob demanda, você aceita o serviço e chama ajuda só quando precisa."

Nota de rodapé: "Estimativa simples com os números que você informou. Serve como referência, não como garantia de resultado."

*Fórmula:* `mensal = recusados_semana × ticket × 4,3`

### 9.4 Solução

**Eyebrow:** Como o MecânicoApp ajuda
**H2:** Reforço sob demanda, sem complicar sua rotina.

1. **Mais capacidade nos picos** — Entrou mais serviço do que a equipe dá conta? Publique o pedido e receba mecânicos interessados da sua região.
2. **Cobertura para faltas** — Alguém faltou ou está de férias? Chame um reforço para o dia, sem refazer a agenda inteira.
3. **Especialistas quando precisar** — Ache profissionais com experiência no serviço que sua equipe não faz no dia a dia.
4. **Pague pelo serviço, não pela ociosidade** — Você combina o valor do serviço e paga por ele. Sem mensalidade e sem custo quando não usa.

### 9.5 Rede de confiança (seção destaque)

**Eyebrow:** O diferencial
**H2:** Comece conhecendo. **Termine com uma equipe de confiança.**

**Texto:** Todo mecânico que trabalha bem na sua oficina pode entrar na sua lista de **Preferidos**. Na próxima vez que faltar gente, você manda o pedido primeiro para eles, que já conhecem seu jeito de trabalhar.

3 etapas visuais (linha do tempo horizontal):
1. **Conheça:** publique para a região e receba profissionais verificados, com nota e histórico.
2. **Avalie:** depois do serviço, dê sua nota. Gostou do trabalho? Salve nos preferidos.
3. **Chame de novo:** publique pedidos só para a sua rede. Quem já conhece sua oficina responde primeiro.

**Frase de fechamento:** É como ter uma equipe extra, que você chama só quando precisa.

### 9.6 Como funciona

**Eyebrow:** Como funciona
**H2:** Do pedido ao serviço pronto, em 4 passos.

1. **Cadastre sua oficina.** Leva poucos minutos. Nossa equipe confere os dados e libera seu acesso.
2. **Publique o que precisa.** Serviço, dia, valor e prazo. Escolha: só para seus preferidos ou para mecânicos verificados da região.
3. **Escolha quem vai.** Veja nota, histórico e especialidades antes de confirmar. O pagamento fica protegido na plataforma.
4. **Confirme e avalie.** Serviço feito, você confirma e o pagamento é liberado. Gostou? Salve nos preferidos.

### 9.7 Segurança

**Eyebrow:** Confiança em cada etapa
**H2:** Você sabe quem está entrando na sua oficina.

1. **Cadastro verificado:** todo mecânico passa por análise de documentos antes de ser aprovado.
2. **Reputação real:** cada serviço gera uma avaliação. Você vê nota, número de serviços e especialidades.
3. **Pagamento protegido:** o valor fica guardado na plataforma e só é liberado depois que você confirma a conclusão.
4. **Tudo registrado:** histórico de cada serviço, quem fez, quanto custou e como foi avaliado.

### 9.8 Gestão integrada

**Eyebrow:** De bônus
**H2:** O reforço entra direto na rotina da oficina.

**Texto:** Além da mão de obra, sua oficina ganha um sistema de gestão gratuito. O serviço feito pelo profissional de fora fica no mesmo histórico da OS, do cliente e do veículo.

Bullets:
- Ordens de serviço, clientes e veículos
- Agenda e histórico de cada carro
- Várias lojas no mesmo login
- Comece só com o reforço de mão de obra e adote a gestão no seu ritmo

### 9.9 Prova social
Ver item 12. Enquanto não houver depoimento autorizado, **não exibir a seção** (melhor nenhuma prova do que prova falsa).

### 9.10 FAQ — ver item 11.

### 9.11 CTA final

**Eyebrow:** Comece hoje, use quando precisar
**H2:** Na próxima vez que faltar gente, **você já sabe quem chamar.**
**Texto:** Cadastre sua oficina de graça. Não tem mensalidade nem exclusividade, e você só paga pelo serviço que contratar.
**CTA:** Cadastrar minha oficina grátis →
**Microcopy:** Conferimos os dados de cada oficina antes de liberar o acesso.

### 9.12 Footer
Descrição: "Mão de obra sob demanda e gestão para oficinas, num só lugar."
Confiança: Cadastro verificado · Pagamento protegido · Avaliações reais · Suporte por chat.

---

## 10. CTAs recomendados

| Local | CTA | Tipo |
|---|---|---|
| Nav | Cadastrar oficina | Primário |
| Hero | **Cadastrar minha oficina grátis** | Primário |
| Hero | Ver como funciona | Secundário (âncora) |
| Após calculadora | Quero parar de recusar serviço | Primário |
| Após rede de confiança | Começar minha rede | Primário |
| CTA final | Cadastrar minha oficina grátis | Primário |
| Opcional | Falar com a equipe no WhatsApp | Secundário (para quem não decide sozinho) |

Regra: **um único CTA primário**, sempre levando a `/cadastro/oficina`. Os CTAs variam o texto, nunca o destino.

---

## 11. FAQ recomendado

1. **Preciso pagar para me cadastrar?**
   Não. O cadastro e o sistema de gestão são gratuitos, sem mensalidade. Você só paga pelos serviços que contratar.

2. **Posso continuar com minha equipe atual?**
   Pode, e é para isso que o app existe. O MecânicoApp complementa sua equipe nos picos, nas faltas e em serviços específicos. Não tem exclusividade nem fidelidade.

3. **Como sei se o mecânico é bom?**
   Todo profissional passa por análise de cadastro antes de ser aprovado. Cada serviço gera uma avaliação, e você vê nota, quantidade de serviços e especialidades antes de escolher.

4. **O que são os mecânicos preferidos?**
   É a sua lista pessoal de profissionais de confiança. Gostou de um trabalho? Salve o mecânico. Depois, você pode publicar pedidos só para essa lista.

5. **Como funciona o pagamento?**
   O valor combinado fica protegido na plataforma e só é liberado ao mecânico depois que você confirma que o serviço foi concluído.

6. **E se o serviço não ficar como combinado?**
   Você não confirma a conclusão e abre uma ocorrência pelo app. Nossa equipe analisa o caso com as duas partes antes de liberar o pagamento.
   *(⚠ Só publicar depois que existir esse fluxo de disputa no produto e nos Termos.)*

7. **Quanto tempo leva para achar um mecânico?**
   Depende da sua região, do dia e do tipo de serviço. Publicar com antecedência e ter uma lista de preferidos ajuda bastante. Quem já conhece sua oficina costuma responder primeiro.

8. **O mecânico vira funcionário da minha oficina?**
   Não. Ele é um profissional independente que presta um serviço pontual pela plataforma. Para dúvidas trabalhistas do seu caso específico, consulte seu contador.

9. **Atendem minha cidade?**
   Estamos crescendo região por região. Cadastre sua oficina e avisamos quando houver profissionais disponíveis perto de você.

---

## 12. Prova social e confiança

**Dá pra usar já (sem inventar nada):**
- Faixa "Como protegemos sua oficina": Cadastro verificado · Avaliações reais · Pagamento protegido · Suporte humano.
- Selo "Pagamento processado por Stripe" (com logo, se os termos de marca permitirem).
- Nome e rosto do fundador, com uma frase curta tipo "Construímos o MecânicoApp ouvindo dono de oficina". Isso gera confiança em produto novo.
- Link visível para Termos e Privacidade, e CNPJ no rodapé quando estiver aberto.

**Coletar nas próximas semanas:**
- Depoimento em vídeo curto (30s) do primeiro cliente (JC Pneus / Jota Car), **com autorização por escrito**.
- Contadores reais puxados do banco ("X oficinas cadastradas", "Y serviços concluídos"), exibidos só depois de passar de um mínimo que não pareça pequeno.
- Prints reais de avaliações (com nome abreviado).
- Mapa ou lista "Regiões atendidas".

**Não usar:** números inventados, logos de clientes sem autorização, depoimentos genéricos ("Ótimo app! — João").

---

## 13. Sugestões para aumentar conversão

1. **Calculadora de perda no topo do funil**, com o CTA logo abaixo do resultado ("Quero parar de perder R$ X/mês").
2. **CTA fixo no rodapé no celular** (sticky bar) com "Cadastrar grátis". A maior parte do público vai abrir pelo celular, via WhatsApp/Instagram.
3. **Botão de WhatsApp** para o dono que quer conversar antes. Isso é muito comum nesse público.
4. **Cadastro em 2 etapas:** pedir só nome, WhatsApp e cidade primeiro, e CNPJ/endereço depois. Reduz o abandono.
5. **Mock do hero com animação leve:** pedido → "enviado aos preferidos" → "2 respostas". Mostra o diferencial sem ler nada.
6. **Parâmetros UTM e evento de conversão** no clique do CTA, para saber qual canal traz oficina.
7. **Página leve:** remover blurs grandes e sombras pesadas no mobile e checar a nota do Lighthouse.
8. **Teste A/B da headline** (as 3 opções do item 6) quando houver tráfego.
9. **Captura para regiões ainda não atendidas** ("Me avise quando chegar na minha cidade"), em vez de perder o lead.

---

## 14. Pontos de risco nas promessas atuais

| Trecho atual | Risco | Substituir por |
|---|---|---|
| "Mecânico em 1 hora" | Prazo que a plataforma não controla; frustração e reclamação. | "Quando precisa" / "publique e receba respostas de profissionais da região" |
| "Sem CLT. Sem encargos." / StatCard "Sem CLT – zero encargos" | Sugere troca de funcionário registrado por autônomo. Tema de vínculo empregatício e de atenção na fiscalização. Afasta oficina com equipe registrada. | "Reforço para sua equipe" / "Pague pelo serviço, não pela ociosidade" |
| Calculadora CLT × app | Números estimados (1,7×, R$ 80/h) apresentados como economia. Incentiva substituir a equipe. | Calculadora de serviço recusado |
| "Rastreamento ao vivo · ETA preciso" / "Chega em ~14 min" | Promete precisão e velocidade. | Remover da landing (pode aparecer como detalhe no app) |
| "Mecânico aceita em minutos" | Depende da oferta em cada região. | "Receba respostas de profissionais da região" |
| "Cartão **ou PIX**" | PIX ainda não está em produção (só Stripe/cartão). | "Pagamento pelo app" (adicionar PIX quando lançar) |
| "Escrow" | Termo técnico e com sentido jurídico específico. | "Pagamento protegido até você confirmar" |
| "Se algo der errado, não paga" | Garantia incondicional; o mecânico também precisa de proteção. Gera conflito. | Fluxo de ocorrência/mediação (FAQ 6) |
| "100% gratuito" / "Tudo grátis" / "Sem pagar nada" | O serviço contratado é pago; parece pegadinha. | "Cadastro gratuito, sem mensalidade. Você só paga pelo serviço que contratar." |
| "Aprovação em até 24h" | Prazo fixo de operação manual. | "Conferimos os dados e liberamos seu acesso" (ou "em geral, em 1 dia útil") |
| "CPF e CNH validados manualmente… checamos o histórico" | Confirmar que a checagem acontece exatamente assim. | "Cadastro verificado com análise de documentos" |
| "Mais mecânicos top aceitam trabalhar pra você" | Promessa de qualidade ligada à nota. | Manter só como "reputação real nos dois lados" |

---

## 15. Versão final pronta para implementação

A copy das seções 9.1 a 9.12 é a versão final. Resumo da implementação em `LandingOficina.tsx`:

1. **Hero:** trocar H1, subtítulo, microcopy e o mock (pedido para preferidos em vez de "mecânico a caminho").
2. **Dores:** trocar os 6 cards (9.2) e adicionar a frase de fechamento.
3. **Calculadora:** substituir o bloco CLT (estados `mechanicsCount/avgSalary/productivity` e constantes `CLT_LOAD_FACTOR`, `HOURS_PAID_PER_MONTH`, `APP_HOURLY_BRL`) por `refusedPerWeek` + `avgTicket`.
4. **Solução:** 4 cards `Win` (9.4).
5. **Nova seção Rede de confiança:** fundo `steel-900`, timeline de 3 etapas (9.5).
6. **Como funciona:** novos textos e `id="como-funciona"` para a âncora do hero.
7. **Nova seção Segurança** (9.7) e **nova seção Gestão integrada** (9.8).
8. **Remover** a seção de StatCards.
9. **FAQ** (item 11), movido para antes do CTA final, com fundo diferente de "Como funciona".
10. **CTA final** (9.11) e ajustes do footer (9.12).
11. **Mobile:** barra fixa com o CTA.

Antes de publicar, decidir: o FAQ 6 (disputa) só entra se o fluxo existir; a menção a PIX só entra quando ele estiver em produção.
