# Home MecânicoApp: briefing de redesign

Branch `feat/home-premium`. A página já está implementada em `src/pages/public/Landing.tsx`.
Os componentes ficam em `src/components/home/` (`ui.tsx`, `mockups.tsx`, `ImpactCalculator.tsx`, `content.ts`).

---

## 1. Análise da página atual

| Ponto | Diagnóstico |
|---|---|
| Headline "A ponte direta entre oficina e mecânico" | Clara, mas descreve o que a empresa é, não o que o visitante ganha. Funciona melhor como assinatura. |
| Faixa de números | "PIX em até 24h", "100% pré-pagas (escrow)" e "24h aprovação" são promessas operacionais que ainda não estão validadas. É o maior risco jurídico e de confiança da página. |
| Copy do mecânico | "Sem patrão, sem CLT" afasta quem já tem emprego e quer renda extra, que é um público grande. "Cliente que some" é uma dor de autônomo B2C, não do nosso modelo. |
| Copy da oficina | "Sem CLT, sem encargos" soa como substituir a equipe. Isso gera objeção e pode virar risco trabalhista. |
| Produto | As ilustrações SVG (skyline, estrada, sol) são decorativas. O produto não aparece como protagonista. |
| Diferenciais ausentes | Rede de preferidos, ausência de disputa entre mecânicos, calculadora, gestão integrada, FAQ, prova social. |
| Manifesto | "App de mobilidade" convida a comparação com a Uber, que o próprio briefing quer evitar. |
| Técnico | Não tinha menu mobile, FAQ estruturado, OG tags nem acessibilidade básica (skip link, landmarks, foco visível). A meta description mencionava escrow. |

## 2. O que manter
- Paleta preto/branco/laranja (`brand-500 #FF5C0A`, `steel-900 #0B1117`), Space Grotesk nos títulos e Inter no texto.
- "Sua hora. Sua agenda. Seu dinheiro." para o mecânico.
- O conceito do manifesto ("o setor move bilhões...").
- O gate de lead (`LeadCaptureModal`) no caminho para `/oficina` e `/mecanico`.
- Os dois caminhos de entrada (oficina e mecânico) logo no topo.

## 3. O que remover
- Escrow, "PIX em 24h", "100%", "aprovação em 24h", "pagamento garantido".
- "Sem CLT / sem encargos / sem patrão".
- Ilustrações de skyline e estrada.
- "Brandbook" no footer público.
- "Tempo real / rastreamento" como destaque principal, até isso ser o diferencial validado.

## 4. O que melhorar
- Hero com benefício e não com descrição, com CTAs diretos para o cadastro.
- Mostrar o produto em uso: tela da oficina confirmando e celular do mecânico aceitando.
- Deixar explícito: "Sua equipe continua sendo sua base" e "sem disputa entre profissionais".
- Prova honesta: fatos verificáveis enquanto não houver números.

## 5 e 6. Arquitetura e ordem das seções

1. Header: logo, menu de 6 itens, Entrar e "Cadastrar grátis" (o menu pergunta oficina ou mecânico)
2. Hero: headline, sub com os dois lados, 2 CTAs e o produto
3. Prova: métricas reais ou, sem elas, 4 fatos
4. Para oficinas
5. Para mecânicos (fundo escuro, contraste de energia)
6. Calculadora de impacto
7. Como funciona (4 passos)
8. Confiança
9. Rede de confiança (fundo escuro)
10. Sistema de gestão
11. Prova social
12. Segurança
13. Manifesto (fundo laranja cheio, o momento de marca)
14. FAQ
15. CTA final (fundo escuro)
16. Footer

Lógica: entender, ver que é para mim, ver o produto, quantificar a dor, ver como é simples, confiar, entender o diferencial (rede), ver que é plataforma (gestão), prova, segurança, emoção e ação. O ritmo claro/escuro (4 claro, 5 escuro, 6 claro, 9 escuro, 13 laranja, 15 escuro) dá cadência sem cansar.

## 7. Headline principal

**Escolhida:** "Nenhum serviço parado. Nenhuma hora desperdiçada."
A primeira frase é a dor da oficina, a segunda é a do mecânico. As duas são curtas e simétricas e não dependem de comparação com outra marca.
"A ponte direta entre oficina e mecânico" virou o kicker acima do H1, como assinatura.

Alternativas para teste A/B:
- "O mecânico certo, na hora que a oficina precisa." (foco oficina)
- "Mão de obra de um lado. Oportunidade do outro."
- "Sua oficina não para. Sua experiência não fica parada."

## 8. Subheadline
"Sua oficina encontra profissionais disponíveis quando falta mão de obra. Você, mecânico, encontra serviços reais em oficinas da sua região, no horário que tem livre."

Microcopy abaixo dos CTAs: "Cadastro gratuito · sem mensalidade · cada perfil é analisado pela nossa equipe"

## 9, 10 e 11. Copy, CTAs e cards por seção

O texto final está em `Landing.tsx` e `content.ts`. Resumo:

| Seção | Título | CTA |
|---|---|---|
| Hero | Nenhum serviço parado. Nenhuma hora desperdiçada. | Cadastrar minha oficina · Quero ser mecânico |
| Oficinas | Mão de obra quando você precisa. | Conhecer solução para oficinas |
| Mecânicos | Sua hora. Sua agenda. Seu dinheiro. | Conhecer solução para mecânicos |
| Calculadora | Quanto sua oficina pode estar deixando de faturar por falta de mão de obra? | Cadastrar minha oficina |
| Como funciona | Do cadastro ao serviço feito, em quatro passos. | — |
| Confiança | Você sabe quem está entrando na sua oficina. | — |
| Rede | Comece conhecendo. Construa sua rede. | — |
| Gestão | Mais que um marketplace. Um sistema para sua oficina. | — |
| Prova social | Oficinas e mecânicos, nas palavras deles. | Quero participar como oficina / mecânico |
| Segurança | Cada serviço registrado. Cada parte protegida. | — |
| Manifesto | O setor automotivo move bilhões. Quem move esse setor não pode continuar desconectado. | — |
| Final | Na próxima vez que precisar, você já sabe onde encontrar. | Cadastrar minha oficina · Quero ser mecânico |

**Cards da oficina:** publicar demandas em minutos · ver quem está disponível · analisar perfil e especialidade · avaliar depois do serviço · salvar os melhores nos preferidos · atender mais sem aumentar a folha fixa. Destaque: "Sua equipe continua sendo sua base."
**Cards do mecânico:** oportunidades de oficinas · você escolhe o horário · reputação que acompanha você · oficinas que chamam de novo. Mais "dá para usar tendo carteira assinada" e "recebimento pela plataforma, depois que a oficina confirma".
**Confiança (6):** perfil analisado · especialidades · avaliações de oficinas · histórico · reputação · preferidos. Fecho: "E você decide com quem trabalha."
**Segurança (6):** pagamento pela plataforma (parceiro especializado) · dados conforme LGPD · verificação de cadastro · suporte · histórico completo · reputação dos dois lados.

## 12. FAQ recomendado
Está em `content.ts` e é publicado também como JSON-LD `FAQPage`. São 8 perguntas: substitui a equipe? · como sei quem entra? · há disputa entre mecânicos? · quanto custa? · como é o pagamento? · posso tendo carteira assinada? · preciso de ferramenta? · a gestão é obrigatória?

## 13. Sugestões de confiança (para a operação)
- Selo "Perfil verificado" com critério público ("o que verificamos").
- Página `/seguranca` explicando a análise de cadastro e o fluxo de pagamento, revisada pelo jurídico.
- CNPJ e razão social no footer assim que a empresa estiver aberta.
- Canal de suporte com horário declarado (WhatsApp Business ou email).
- Avaliação bilateral visível (oficinas também têm nota).

## 14. Sugestões de prova social
- Gravar 2 ou 3 vídeos curtos (30s) com a primeira oficina parceira e mecânicos dela, **com autorização escrita**.
- Formato: dor (faltou gente), uso (chamou pelo app), resultado (serviço entregue).
- Números agregados só depois de terem base no banco (`METRICS` em `content.ts`).
- Logos de oficinas parceiras, com autorização.
- Enquanto não houver nada, a home mostra "Estamos formando a primeira rede". Isso é honesto e ainda converte como convite de early adopter.

## 15. Layout
- Container de 1152px (`max-w-6xl`), gutter de 16px no mobile, 24 no tablet e 32 no desktop.
- Seções com `py-20` / `lg:py-28`. Cards com `rounded-2xl`, borda `steel-100` e sombra `sm`, que vira `md` no hover.
- Títulos de 30/36/48px (display), kicker em caixa alta laranja com tracking de 0.18em.
- Botões com mínimo de 48px de altura (alvo de toque), seta que desliza no hover e escala de 0.98 no clique.

## 16. Mockups
Hoje são HTML/Tailwind (`mockups.tsx`): leves, nítidos e editáveis. Todos têm a legenda "Tela ilustrativa".
- **Hero:** janela da oficina com a demanda e 2 profissionais que aceitaram, celular do mecânico com a oportunidade e o toast "Profissional confirmado".
- **Oficinas:** card de perfil (verificado, especialidades, nota, serviços, avaliação, botão de preferido).
- **Mecânicos:** celular com disponibilidade, oportunidade, nota e "oficinas que voltaram".
- **Rede:** lista "Meus preferidos" com "Chamar".
- **Gestão:** painel de OS com uma linha "Reforço · André L." mostrando a integração.

**Próximo passo de design:** substituir por capturas reais (exportadas em WebP, `loading="lazy"` fora do hero) quando as telas estiverem estáveis.

## 17. Desktop
- Hero em 2 colunas (texto e produto), com o H1 em até 4 linhas na largura de 1280.
- As seções alternam a posição do produto (direita, esquerda, direita) para criar ritmo.
- Header transparente que ganha fundo com blur ao rolar.

## 18. Mobile
- No hero, os CTAs ficam empilhados em largura total, com a oficina primeiro (laranja).
- O celular sobreposto some abaixo de `sm`. Fica só a janela da oficina e o toast.
- Menu hambúrguer com os 6 links e 2 botões de cadastro.
- Na seção do mecânico, o texto vem antes do celular.
- Validado sem rolagem horizontal em 375px.

## 19. Riscos de conversão
- O gate de lead antes de `/oficina` e `/mecanico` adiciona fricção. Medir a taxa de abandono do modal.
- A página é longa (16 blocos). Os CTAs estão distribuídos (hero, oficinas, mecânicos, calculadora, prova, final), mas vale medir o scroll depth.
- Sem números nem depoimentos reais, a prova é fraca. Prioridade nº 1 depois do lançamento.
- Sem `og:image` (1200x630), o compartilhamento no WhatsApp sai sem imagem. **TODO de design.**
- É uma SPA: o Google renderiza o JS, mas um prerender da home melhoraria o SEO e o LCP.

## 20. Pontos jurídicos e promessas suavizadas
| Antes | Agora |
|---|---|
| Escrow / 100% pré-pago | "Pagamento pela plataforma, processado por parceiro especializado" |
| PIX em até 24h | "Recebe depois que a oficina confirma o serviço" (sem prazo) |
| Aprovação em até 24h | "Cada perfil é analisado pela nossa equipe" |
| Sem CLT, sem encargos | "Sua equipe continua sendo sua base" (complementar) |
| CPF/CNH validados | "Perfil analisado". **Validar com o jurídico** antes de listar documentos específicos. |
| Pagamento garantido | Removido |
| Calculadora | Aviso fixo: "Simulação... não é garantia de faturamento" |
| Mockups com valores | Legenda "nomes e valores de exemplo" |

Ainda para revisar: as landings `/oficina` e `/mecanico` (em `main`) ainda usam escrow, "100%" e "24h" no FAQ e na faixa de números.

## 21. Para o dev: o que editar
- **Números reais:** `METRICS` em `src/components/home/content.ts`. Quando houver um `value`, a faixa de métricas aparece sozinha.
- **Depoimentos:** `TESTIMONIALS` no mesmo arquivo. Os placeholders só aparecem em `npm run dev`, com o selo "Placeholder · substituir".
- **FAQ:** `FAQ` no mesmo arquivo (já alimenta o JSON-LD).
- **Acessibilidade:** skip link, `aria-labelledby` por seção, `details/summary` no FAQ, foco visível, `prefers-reduced-motion` respeitado no `Reveal`, `aria-live` no resultado da calculadora.
- **Performance:** nenhuma imagem nem lib nova, mockups em HTML, animação só com CSS e IntersectionObserver.

---

# Revisão mobile (06/10/2026)

## 1. Problemas encontrados na versão anterior
- Os blocos de 2 colunas cresciam além da tela em 375px (a coluna do grid não encolhia), e o kicker do hero saía 4px para fora.
- Não havia CTA de cadastro no header mobile, e "Entrar" ocupava o espaço do CTA.
- Títulos de 30–36px: o manifesto chegava a 6 linhas e o simulador a 4.
- Os cards empilhavam com ícone em cima e texto embaixo: 12 cards altos, o que dava sensação de página infinita.
- Slider nativo fino, com polegar de cerca de 16px, difícil de tocar. O CTA do simulador ficava fora do card de resultado.
- Os depoimentos virariam 3 cards empilhados.
- Blur de 560px decorativo no hero e na seção do mecânico (filtro caro em GPU de celular).
- O CSS do Mapbox vinha de outro domínio e bloqueava a renderização de todas as páginas. A fonte Barlow Condensed era baixada sem uso.
- Sem CTA persistente: entre o hero e o final eram vários scrolls sem botão de cadastro visível.

## 2 e 3. Correções e ordem dos elementos no mobile
| Seção | Ordem no celular | O que mudou |
|---|---|---|
| Header | logo · **Cadastrar ▾** · ☰ | "Entrar" foi para dentro do menu. O CTA abre a escolha oficina/mecânico. |
| Menu | 6 links (52px cada) · Cadastrar minha oficina · Quero ser mecânico · Entrar | Tela cheia, trava o scroll do fundo, fecha com Esc |
| Hero | kicker · H1 · texto · 2 CTAs empilhados · microcopy · mockup | Os 2 CTAs ficam acima da dobra em 375×812. O celular sobreposto some e o blur virou gradiente leve. |
| Fatos | grade 2×2, só títulos | A descrição aparece a partir de `sm` |
| Oficinas | título · texto · 6 checks (1 col.) · destaque "equipe" · CTA 100% · perfil | — |
| Mecânicos | título · texto · **carrossel de 4 cards** (80% da largura, com o próximo aparecendo) · checks · CTA 100% · celular | Dica "Deslize para ver os 4 benefícios" |
| Simulador | título · sub · campo 1 · campo 2 · **resultado · CTA · aviso** | Tudo num card só, empilhado |
| Como funciona | 4 cards em linha (número à esquerda) | Bem mais baixos |
| Confiança e Segurança | título · texto · 6 cards em linha (ícone à esquerda) | — |
| Rede | título · sub curto · **fluxo vertical Conheça → Avalie → Adicione → Chame de novo** · mockup | O último passo tem ícone de "repetir" |
| Gestão | título · sub · dashboard (sem sidebar) · chips | — |
| Depoimentos | carrossel com 1 card por vez (86%), swipe e snap | Grade de 3 a partir de `md` |
| Manifesto | 32px, parágrafos de 17px em branco puro | Padding de 64px |
| FAQ | acordeão com perguntas de 17px, área de toque de 60px, abertura com slide suave | — |
| CTA final | H2 de 32px · 1 linha · 2 botões empilhados de 52px (laranja primeiro) | — |
| Footer | logo (linha inteira) · 3 colunas em 2×2 | Contraste melhor |

## 4. Tamanhos (mobile, até `sm`)
- **H1:** 38px (até 399px) e 42px (400–639px), entrelinha 1.04. Ocupa 4 linhas.
- **H2 de seção:** 28px, entrelinha 1.12, com 2–3 linhas. Manifesto e CTA final usam 32px.
- **Texto:** 16–17px. **Secundário:** 15px (descrição de cards) e 14px (microcopy). **Legenda:** 11–12px.
- **Botões:** altura mínima de 52px, texto de 16px. Chips e alvos secundários com no mínimo 44px.
- **Seções:** padding vertical de 56px (era 80). Gutter lateral de 16px.

## 5. Grids
- Mobile: 1 coluna sempre. As exceções que fazem sentido são os fatos (2×2, só título), os KPIs do dashboard (3 números curtos), os resultados do simulador entre 640 e 1023px, e o footer (2 colunas).
- `sm` (640+): os cards voltam a 2 colunas. `md` (768+): passos e depoimentos em 2/3 colunas. `lg` (1024+): layout desktop original.

## 6. Cards
- No mobile ficam em linha: ícone de 40px à esquerda, título e descrição à direita, padding de 16px. A partir de `sm` voltam a ser verticais com padding de 20px (desktop inalterado).
- Carrossel só onde reduz a rolagem sem esconder informação crítica: benefícios do mecânico e depoimentos.

## 7. Simulador
- Botões −/+ de 48×48, número de 36px no centro e slider com trilho de 8px, polegar de 28px e área de toque de 44px. O preenchimento laranja acompanha o valor.
- Ticket com campo de 56px de altura e fonte de 24px (não dispara zoom no iOS), seleção total ao focar e 4 atalhos (R$ 250 / 450 / 800 / 1.200) com 44px.
- Resultado: mês em 40px e ano em 24px laranja, com `aria-live`. Em seguida o CTA de largura total e o aviso de simulação por último.

## 8. Menu
- Hambúrguer de 44×44 até 1023px. O painel tem altura `100dvh − header`, rolagem própria, fundo travado e fecha com Esc ou ao tocar num link.

## 9. CTAs
- No hero, no menu, nas seções de oficinas e mecânicos, no simulador, nos depoimentos e no final.
- **Barra fixa no rodapé (só mobile/tablet):** aparece ao sair do hero e some ao chegar no CTA final, no menu aberto e no modal de lead. Mostra "Cadastrar oficina" (abaixo de 420px) ou "Cadastrar minha oficina", mais "Sou mecânico". Respeita a safe area do iPhone.

## 10. Performance
- O CSS do Mapbox saiu do `<head>` e agora é importado pelos componentes de mapa. Antes era uma requisição externa que bloqueava a renderização.
- Removida a família Barlow Condensed (não usada).
- Blur pesado só a partir de `sm`. O hero não usa animação dependente de JS (é CSS puro, bom para o LCP).
- Mockups em HTML: nenhuma imagem para baixar.
- **Recomendado (fora deste PR, mexe no `App.tsx` que outros branches também editam):** carregar as rotas internas com `lazy()`. O bundle principal tem cerca de 1,2 MB sem compressão porque inclui todas as telas do painel. A home seria a maior beneficiada.

## 11. Por largura
- **375px:** H1 de 38px em 4 linhas, CTAs acima da dobra, barra fixa com "Cadastrar oficina". Sem overflow horizontal (verificado).
- **390px:** igual a 375. Sem overflow horizontal (verificado).
- **430px:** H1 de 42px, barra fixa com o texto completo "Cadastrar minha oficina" em 1 linha (verificado).
- **768px:** hambúrguer ainda ativo, H1 de 60px em 3 linhas, cards em 2 colunas, depoimentos em 3 colunas, carrosséis viram grade (verificado).
- **Desktop (1024+):** layout anterior. A única mudança visível é o CTA do simulador, que foi para dentro do card de resultado.

## 12. Checklist de QA mobile
- [ ] Nenhuma rolagem horizontal em 375, 390, 430 e 768 (`scrollWidth === innerWidth`)
- [ ] Os 2 CTAs do hero aparecem sem rolar em 375×667 (iPhone SE)
- [ ] O menu abre, trava o fundo, fecha com Esc e ao tocar num link âncora
- [ ] "Cadastrar ▾" do header abre e fecha (toque fora / Esc)
- [ ] Barra fixa: aparece depois do hero, some no CTA final, não cobre o footer e respeita o notch
- [ ] Simulador: −/+, slider, digitar ticket e atalhos atualizam o resultado. O teclado numérico abre no ticket.
- [ ] Carrosséis: o swipe para no card (snap) e o próximo card aparece pela borda
- [ ] FAQ: cada pergunta abre e fecha, com área de toque ≥ 44px
- [ ] Alvos de toque ≥ 44px (exceto links dentro de frase)
- [ ] Contraste: textos sobre preto em steel-300/200 e sobre laranja em branco puro
- [ ] Com "reduzir movimento" ligado, nada anima e todo o conteúdo aparece
- [ ] Teste em um aparelho Android real e em um iPhone real (Safari)
- [ ] Lighthouse mobile: LCP < 2,5s e CLS < 0,1 (rodar no deploy de preview)
