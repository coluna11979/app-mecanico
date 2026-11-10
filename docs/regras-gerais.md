# MecânicoApp: regras gerais

Retrato do aplicativo em 06/11/2026, atualizado em 10/11/2026 com a nova regra de cancelamento. Base: código da `origin/main`, banco de produção (só leitura) e decisões registradas nas sessões de trabalho.

**Como ler**
- Sem marca: conferido no código, nos termos de uso, nos documentos do projeto ou no banco.
- **(decisão)**: decisão registrada no histórico, não reconferida linha a linha no código.
- **Alcance:** foram lidos o mapa de rotas e de arquivos, e por inteiro ou em parte as regras centrais (módulos, acessos, pagamento, cancelamento, termos, marca). A maioria das telas e migrações não foi lida linha a linha. A seção 14 lista o que não bate.

---

## 1. O que é

> **O MecânicoApp é um marketplace B2B que liga oficinas que precisam de mão de obra a mecânicos da região que querem trabalhar. Em volta dele existe um sistema de gestão para oficinas, liberado por módulos.**

- **Não atende o dono do carro.** O cliente é a oficina; o mecânico é parceiro.
- **A receita vem das demandas:** 20% sobre cada serviço. Cadastro gratuito e sem mensalidade.
- **Prioridade (decisão, 19/10/2026):** marketplace primeiro. O sistema de gestão continua sendo desenvolvido e deve virar plano pago no futuro.
- **Referência:** a Jota Car fica com tudo liberado, para aprendermos a rotina real de uma oficina (decisão).

**Números em produção hoje:** 17 cadastros de mecânico (4 aprovados), 8 oficinas, 90 demandas, 30 concluídas e 30 pagas. A contagem pode incluir cadastros e demandas de teste.

---

## 2. Quem usa

| Perfil | Quem é | Onde entra | Observação |
|---|---|---|---|
| **Mecânico da plataforma** | Autônomo do marketplace | `/mecanico/*` | ~97% pelo celular (decisão) |
| **Dono da oficina** | Quem contrata | `/oficina/*` | Um login pode ter várias lojas |
| **Colaborador da oficina** | Equipe interna, inclusive o mecânico da loja | PIN (modo balcão) ou login em `/equipe` | Não é o mecânico da plataforma |
| **Admin** | Equipe do MecânicoApp | `/admin/*` | Aprova, repassa e configura |
| **Cliente final** | Dono do carro | Só links públicos e site da oficina | Não tem conta |

**Regra de vocabulário:** no contexto da gestão da oficina, "mecânico" é o da equipe (`workshop_mechanics`). O do marketplace é outro público (`mechanics`). Na dúvida, perguntar antes de construir (decisão).

---

## 3. Cadastro e aprovação

- Cadastro gratuito, com aprovação prévia. Quem não está `approved` só vê a tela de espera (admin é exceção).
- Status possíveis: `pending`, `awaiting_region`, `approved`, `rejected`.
- Fora da área atendida, existe recusa com texto padrão "Ainda não atendemos essa região" (decisão).
- Verificação de mecânico pela Infosimples (CPF, antecedentes, mandados), acionada por botão manual. Certidão que não sai nunca recusa sozinha: vai para análise manual (decisão).
- Depois de aprovado, CPF, nascimento e nome da mãe só o admin altera (decisão).
- Toda tela que muda o status do cadastro deve enviar o e-mail correspondente (decisão).
- Oficina nova nasce só com a Plataforma; a 2ª loja do mesmo dono nasce com os módulos liberados (decisão).

---

## 4. Ciclo da demanda

**Caminho normal:**
1. A oficina publica a demanda.
2. O mecânico aceita. Não existe "aguardando confirmação da oficina" (decisão).
3. Dentro do prazo de troca, a oficina pode trocar o mecânico ou confirmá-lo antes.
4. O mecânico vai até a oficina e marca a chegada.
5. A oficina paga o serviço ou desiste pagando multa. Depois de pago, não cancela mais pelo app.
6. O mecânico inicia e conclui o serviço.
7. A oficina confirma a conclusão, e as partes se avaliam.
8. O admin faz o repasse por PIX.

**Status no banco:** `open`, `assigned`, `in_progress`, `completed`, `disputed`, `cancelled`.

**Tipos de público**
- **Aberta:** o primeiro que aceita fica com o serviço.
- **Preferidos:** vai para os mecânicos favoritos da oficina.
- **Convite direto:** continua `open`, com `audience='invite'`. O `mechanic_id` só é gravado no aceite; o mecânico pode recusar. Sem resposta em 15 min, a oficina é avisada de que pode chamar outro.

**Preço**
- **Por hora:** valor/hora × horas previstas.
- **Preço fechado:** gravado como valor × 1h; o tempo previsto é só informativo.
- **O valor é pacote fechado:** sem cobrança extra se passar do tempo e sem desconto se acabar antes.
- **Aumento de valor:** o mecânico vê o selo "Valor aumentou" por 24h.
- **Empilhamento:** junta vários serviços numa demanda só, para reduzir o custo da oficina.
- **Sugestão ao chamar pela OS:** 40% da mão de obra + 20% de adicional de autônomo + R$ 30 de deslocamento. A oficina pode ajustar.
- **Régua interna (decisão):** hora bruta de ~R$ 48 a R$ 64. Não é mostrada ao mecânico.

**Imediata ou agendada**
- **Agendada:** horário marcado para mais de 1 hora depois do aceite. As demais seguem a regra da imediata.

**Prazo de chegada**
- Imediata: 45 min após o aceite.
- Agendada: 30 min após o horário marcado, nunca menos que 45 min após o aceite.
- Passou do prazo: a oficina cancela sem multa, e o cancelamento fica registrado como atraso do mecânico.
- Faltando 10 min, o mecânico recebe um aviso na tela do serviço, com mensagens prontas para avisar a oficina pelo chat. É só aviso: o prazo não muda.

**Trocar mecânico**
- Imediata: até 5 min após o aceite. Agendada: até 2 horas antes do horário marcado.
- Sem multa e sem nota para ninguém.
- A demanda volta a ficar aberta e o mecânico trocado não pode aceitá-la de novo.
- Depois que a oficina confirma o mecânico, não troca mais (ainda pode cancelar sem multa dentro do prazo).

---

## 5. Dinheiro da plataforma

| Item | Regra |
|---|---|
| **Taxa** | 20%; o mecânico recebe 80% |
| **O que o mecânico vê** | Só o valor líquido, nunca o bruto nem a taxa |
| **Gateway ativo** | NextPay (`payment_gateway=nextpay`), trocável no admin; Stripe segue no código |
| **Formas de pagamento** | PIX, cartão e saldo da carteira (serviço: depositado + crédito; multa: só depositado) |
| **Taxa do cartão** | 4,20%, absorvida pela plataforma (`card_fee_passthrough=false`); sobra 15,8% do valor no cartão |
| **Repasse** | Manual, por PIX, em até 24 horas úteis após a oficina confirmar (termos) |
| **Split automático** | Não existe; dependia de CNPJ (decisão, status atual a confirmar) |
| **Carteira** | Ligada, depósito mínimo de R$ 100, aviso de saldo baixo em R$ 100 |
| **Carteira: tipos de saldo** | `cash` (depositado) e `credit` (dado pela plataforma, só para demandas) |
| **Multa de cancelamento** | 30%; 80% vão ao mecânico, paga ou perdoada (perdoada: a plataforma absorve). Repasse manual em Repasses → Multas |
| **Embaixador** | 20% da taxa da plataforma; programa de 12 meses; não incide sobre multa |
| **Cupom** | Só é registrado; o benefício não é descontado automaticamente (decisão) |

**Mudar a taxa exige alterar juntos:** `PLATFORM_FEE`, os termos de uso e `app_settings.platform_fee_percent`.

**Valor fechado:** usar `price_per_hour × max_hours`. O campo `jobs.price` diverge em algumas demandas antigas (decisão).

---

## 6. Cancelamento, disputa e conduta

**Oficina cancela** (regra de 06/11/2026, agendada desde 10/11/2026)

| Situação | Multa |
|---|---|
| Ninguém aceitou ainda, ou convite sem resposta | Nenhuma |
| Imediata: primeiros 5 min após o aceite | Nenhuma |
| Agendada: até 2 horas antes do horário marcado | Nenhuma |
| Depois desses prazos, mecânico a caminho | 30% |
| Mecânico passou do prazo de chegada | Nenhuma; atraso registrado contra o mecânico |
| Mecânico chegou, sem pagamento | Paga o serviço ou cancela com 30% |
| Já pagou | Não cancela pelo app; o mecânico inicia, e problemas vão ao suporte |
| Em andamento | Só por acordo, via suporte: aceite dá 50% para cada lado; recusa vira disputa |
| Concluído | Não cancela; vira disputa |

- **Multa:** fica pendente e impede a oficina de publicar novas demandas. Paga por PIX, cartão ou saldo depositado da carteira. O admin pode perdoar.
- **Parte do mecânico:** 80% da multa, paga ou perdoada, via PIX manual. Aparece para ele em Ganhos, só com o valor líquido.
- **Pago e com problema:** o estorno é feito à mão (no painel da NextPay, cuja API não estorna).
- **Vigência:** repasse da multa e registro de atraso valem para cancelamentos a partir de 06/11/2026; históricos ficaram de fora.

**Mecânico cancela (antes de chegar)**
- Demanda aberta: volta a ficar disponível para os outros.
- Convite direto: é cancelado sem multa e a oficina escolhe outro.
- Depois de chegar, não cancela sozinho.

**Reputação e conduta (termos)**
- Cancelar mais de 20% das demandas aceitas em 30 dias pode suspender ou banir (decisão manual; não há punição automática).
- Atrasos ficam registrados e visíveis no admin, sem punição automática.
- Nota abaixo de 3,0 após 10 ou mais avaliações pode levar a banimento.
- **Não-burla:** por 12 meses após o último serviço, o mecânico não pode fechar serviço direto com oficina conhecida pela plataforma. Multa de 3× o valor.
- **Disputa:** a equipe decide em até 7 dias úteis e o valor fica retido até a decisão.

---

## 7. Regras de comunicação (não negociáveis)

1. **Nunca mostrar o dinheiro da oficina** em conteúdo para o dono: nada de faturamento, lucro ou margem. Análise interna pode usar.
2. **Nunca explicar ao mecânico o cálculo do preço** (meta, hora-alvo, MEI × CLT, taxa).
3. **O mecânico da plataforma é invisível para o cliente final.** Impressão, PDF, WhatsApp, link de aprovação e relatório de check-up não mostram terceirização. A demanda publicada não leva o nome do cliente.
4. **Sem outreach por WhatsApp.** Captação é self-service; botão manual no card do lead pode (decisão).
5. **Renda é sempre simulação:** "simulação · valor líquido · não é garantia".
6. **Um público por peça:** nunca misturar oficina e mecânico no mesmo post.
7. **Revisão humana antes de publicar.**
8. **Toda comunicação da plataforma** leva a assinatura "Tecnologia que conecta" (decisão).

**Palavras proibidas em marketing:** "sem CLT", "sem patrão", "demita", "Uber dos mecânicos", "mecânico em 1 hora", "aprovação em 24h", "PIX em 24h", "pagamento garantido", "100% escrow", "bico", "ajudante", "revolucionário", "tudo em um".

**Na interface:** não usar a palavra "disputa" (decisão).

**Marca:** laranja `#FF5C0A` + tons steel; Space Grotesk e Inter. Tom de colega de oficina que fala reto. Referência completa em [dna-marca.md](marca/dna-marca.md).

---

## 8. Módulos da oficina

**Como funcionam**
- Módulo fica ligado até ser desligado (padrão).
- **Opcionais** nascem desligados: Inbox, Avaliações Google, Agentes de IA, Site e Plano VIP.
- Cada módulo pode ser liberado em todos os aparelhos ou só no PC.
- Dentro do módulo, é possível desligar ferramentas específicas (`FEATURES`).
- **Oficina "Só mecânicos":** sem OS e com Plataforma, ela entra direto nas Demandas.
- **Pacote Atendimento:** WhatsApp + Clientes + Comercial + Agentes.

**Trilha de liberação (cada etapa soma as anteriores)**

| # | Etapa | Módulos |
|---|---|---|
| 1 | Só mecânicos | Plataforma |
| 2 | Oficina básica | Clientes, Tabela de serviços, OS, Agenda |
| 3 | Vendas | Check-up, Comercial |
| 4 | Financeiro | Caixa, Contas a pagar, Visão financeira, Painel de vendas |
| 5 | Estoque | Peças, Compras, Importar notas |
| 6 | Equipe | Equipe, Fechamentos, Acessos |

**Tela nova** precisa entrar em `MODULES`, numa etapa, em `DEPENDS_ON` e na lista fixa do gatilho SQL. Fora do catálogo, ela fica sempre liberada.

---

## 9. Gestão da oficina

**Acessos**

| Função | Alcance | Tela inicial |
|---|---|---|
| Gestor | Tudo, menos editar acessos | Painel |
| Caixa | Caixa, OS, Agenda, Check-up, Demandas | Caixa |
| Atendente | OS, Agenda, Check-up, Clientes, Demandas | OS |
| Vendedor | Comercial, Check-up, Clientes, OS, Agenda | Comercial |
| Mecânico | OS, Agenda, Check-up, Avisos | OS |

Permissões extras somam telas: financeiro, contas a pagar, compras, estoque, folha, equipe, plataforma, WhatsApp. O módulo é checado antes da função.

**OS e check-up (decisão)**
- Cada serviço da OS pode ser da loja ou da plataforma.
- O mecânico da equipe vê só as OS dele, sem preço, sem contato do cliente e sem ações comerciais.
- No check-up, ele marca status, motivo e foto. Peça, serviço e preço são do comercial.
- O cliente responde pelo link: "Pode fazer", "Me lembra" ou "Agora não", e escolhe o horário entre os livres.
- OS aprovada pelo check-up não herda o mecânico: o gestor escolhe quem executa.
- Depois de enviado, o check-up não volta a rascunho: vira "Refazer".

**Comissão da equipe (decisão)**
- Linha de mão de obra: 10%.
- Serviço + peças abaixo dele: 4% sobre a soma, para o responsável pelo serviço.
- Gerente: % sobre o faturamento da loja, definido na ficha.
- Conta quando o serviço termina, mesmo sem estar pago.
- Comissão manual substitui a regra: por item ou na OS inteira. A manual da OS manda em tudo.
- Peculiaridades da loja ficam em `commission_item_rules`, não no código.
- Fechamento quinzenal (dias 15 e 30). Vales são descontados do salário, no fim do mês.
- **Notas antigas são só para análise:** não geram contas a pagar.

**Financeiro e estoque (decisão)**
- Custo da peça é o da última compra; a baixa no estoque acontece ao concluir a OS.
- Margem padrão de 100%, com ajuste por categoria e por peça.
- "A receber" só conta OS concluídas depois do primeiro caixa aberto, para não mostrar valores falsos.
- **Armadilha de nome:** `service_orders.parts_cost` é o valor de venda; o custo fica em `service_order_items.unit_cost`.
- Siglas das notas em papel: MC (crédito), F (pagar depois), R$ (dinheiro), PIX, D (débito).

**CRM (decisão)**
- Simples e orientado à ação: "Quem devo chamar hoje". Campanhas em massa foram rejeitadas.
- Contato só é registrado pelo botão "Já chamei"; abrir o WhatsApp não conta.

---

## 10. WhatsApp, IA e site

- **Inbox:** módulo opcional, usa UAZAPI (API não oficial). Mensagem ativa em volume pode bloquear o número (decisão).
- **Recepção por IA:** só uma IA por conversa, e quando um humano fala a IA sai. Não passa preço nem confirma horário (decisão).
- **Próximos agentes, ainda não feitos:** Follow-up de orçamento e Pós-venda (decisão).
- **Leitura por IA:** notas em papel e notas de compra.
- **Sócio operacional:** IA que conversa sobre os números, só para o dono.
- **Blog:** rascunho semanal por IA.
- **Site da oficina:** feito por nós, não é editor self-service (decisão). Quem chega pelo site vira Interessado no Comercial, com origem "Site".
- **Modelos e chaves de IA** ficam em `app_settings`.

---

## 11. Painel do admin

| Grupo | Telas |
|---|---|
| **Captação** | Leads, Marketing, Material gráfico, Kit da marca |
| **Crescimento** | Radar, Metas, Funis |
| **Operação** | Aprovações, Jobs |
| **Cadastros** | Mecânicos, Oficinas, ficha do usuário |
| **Financeiro** | Repasses, Carteiras, Financeiro |
| **Sistema** | Agentes, Módulos, Avisos, Embaixadores, Treinamentos, Configurações |

**Treinamentos:** sala LiveKit com gravação só pelo botão do apresentador. A gravação pode virar webinar público em `/webinar/:slug`, liberado com nome e WhatsApp.

---

## 12. Experiência e técnica

**Interface**
- Painel do mecânico é mobile-first: projetar em 375px, toque ≥ 44px, texto ≥ 12px, sem depender de hover (decisão).
- É PWA: não há app nas lojas. iPhone só recebe push com o app na Tela de Início (decisão).
- Sessão não cai por oscilação de rede: o app tenta reconectar antes de mandar para o login.

**Stack**
- React 18, Vite, TypeScript, Tailwind, Zustand, Mapbox, LiveKit.
- Supabase (Auth, Postgres, Realtime, Edge Functions), hospedagem na Vercel, Cloudflare R2 para gravações, Resend para e-mail.
- Tamanho: 103 tabelas, todas com RLS ligado; 36 funções ativas em produção; ~166 migrações.

**Regras de código**
- Consulta com `jobs` → `mechanics`: sempre `mechanics!jobs_mechanic_id_fkey`. Sem isso, a busca volta vazia e sem erro (decisão).
- Chave nova em `app_settings`: criar a linha privada antes, porque `is_public` nasce `true` (decisão).
- Consulta externa lenta: rodar em background com polling (decisão).
- Tela nova não baixa histórico inteiro: filtrar por período, por causa do egress (decisão).
- Prazo de chegada existe em dois lugares: `arrivalDeadline.ts` e `cancel-job`. Mudar nos dois.
- Credenciais ficam no admin ou nos secrets, nunca no código.

**Processo (decisão)**
- **Não publicar sem aprovação no localhost.** Merge na `main` publica no site.
- **O localhost usa o banco de produção.** Teste local mexe em dados reais.
- Várias sessões dividem portas: confirmar que a porta serve o código certo antes de pedir teste.
- Trocar para branch com `tailwind.config.js` diferente exige reiniciar o servidor.
- Numeração de migração tem duplicatas (dois arquivos `0105`, por exemplo). Aplicar pelo nome completo.

---

## 13. O que ainda não existe

- Split automático de pagamento.
- Saque da carteira pelo app.
- Agentes de Follow-up e Pós-venda.
- Ranking e gamificação do mecânico; pré-cadastro regional (ideias da mentoria).
- Importação de XML de NF-e; contas a receber do cartão; DRE completo.
- Fornecedor compartilhado entre lojas do mesmo dono.
- Plano pago do sistema de gestão (só existe o VIP, liberado à mão).
- Pixel do Meta no site.
- Aviso de prazo de chegada por notificação no celular (hoje só com o app aberto).
- Canal de suporte que funcione: o e-mail `suporte@mecanicoapp.com.br` ainda não recebe mensagens.

---

## 14. Pontos de atenção

Situação em 10/11/2026. Os itens resolvidos ficam registrados para histórico.

**Resolvidos em 06–10/11/2026**
- ~~Cancelar demanda paga pela NextPay falhava~~: depois de pago não se cancela mais pelo app.
- ~~Termos com "X horas" / "Y horas" e "perde 0,5 estrela"~~: trechos reescritos para o que o app faz.
- ~~README com 15%, "escrow" e "PIX em 24h"~~: atualizado.

**Dinheiro**

1. **A multa de 30% usa `jobs.price`,** enquanto a cobrança usa valor/hora × horas. Nas demandas novas os dois batem; em demandas antigas podem divergir.
2. **Repasse em 24 horas úteis:** está nos termos, mas o processo é manual e a landing evita prometer isso. Vale manter a operação alinhada ao contrato.

**Suporte**

3. **Não há canal de suporte que funcione.** Os termos (disputa, cancelamento durante o serviço) e a mensagem de erro do `cancel-job` mandam falar com o suporte, mas o e-mail `suporte@mecanicoapp.com.br` não recebe mensagens (domínio sem caixa). Falta definir o canal.

**Segurança e código**

4. **A restrição do colaborador com login é só na tela (decisão).** Ele usa as mesmas permissões de banco da oficina, então um mecânico da equipe poderia, pela API, ler dados que a tela esconde.
5. **Funções em produção sem código no repositório:** `create-card-payment`, `create-pix-payment`, `stripe-webhook`, `pay-cancellation-fees`, `request-password-reset`, `confirm-password-reset`, `admin-update-user-email`, `crm-message`, `campaign-message` e as 3 `efi-*`. Sem o código versionado, não há como revisar nem restaurar.
6. **A regra de prazo existe em três lugares:** `src/lib/arrivalDeadline.ts`, `cancel-job` e a função `workshop_swap_mechanic` (0158). Mudar um exige mudar os três.

**Documentação**

7. **O `SECURITY_AUDIT_REPORT.md` é de maio de 2026** e não representa o estado atual.
8. **"Uber" é só modelo mental interno.** Os registros de decisão falam em "tipo Uber", mas a marca proíbe o termo em público.
9. **A palavra "disputa"** está nos termos e no admin, embora a regra seja não usá-la na interface. Vale definir se a regra cobre só as telas de oficina e mecânico.
