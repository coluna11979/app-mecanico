/**
 * Conteúdo legal do MecânicoApp.
 * Versão: v1.0 — 2026-05-09
 *
 * IMPORTANTE: Este conteúdo é um esqueleto sólido baseado em padrões
 * de mercado (Uber, iFood, GetNinjas). Recomenda-se revisão por
 * advogado antes de uso em produção real.
 */

export const TERMS_VERSION = 'v1.0-2026-05-09';
export const TERMS_DATE = '09 de maio de 2026';
export const PLATFORM_NAME = 'MecânicoApp';
export const PLATFORM_DOMAIN = 'mecanicoapp.com.br';
export const PLATFORM_CNPJ = '[CNPJ a ser preenchido]';
export const PLATFORM_FORO = 'São Paulo/SP';
export const PLATFORM_CONTACT_EMAIL = 'suporte@mecanicoapp.com.br';
export const PLATFORM_FEE_PERCENT = 18;
export const CANCELLATION_FEE_PERCENT = 30;
export const TOLERANCE_MINUTES = 5;

/* ════════════════════════════════════════════════════════════════════
   TERMOS GERAIS DE USO
   ════════════════════════════════════════════════════════════════════ */

export const TERMS_GENERAL = `
# Termos Gerais de Uso — MecânicoApp

**Versão ${TERMS_VERSION}** — vigente a partir de ${TERMS_DATE}

Bem-vindo ao **MecânicoApp**. Antes de usar nossa plataforma, leia atentamente estes Termos. Ao se cadastrar e clicar em "Li e concordo com os Termos", você concorda integralmente com as condições aqui descritas.

---

## 1. Definições

- **Plataforma / MecânicoApp**: aplicativo e site (${PLATFORM_DOMAIN}) operados por **${PLATFORM_NAME}**, CNPJ ${PLATFORM_CNPJ}.
- **Mecânico**: profissional autônomo cadastrado para prestar serviços a oficinas.
- **Oficina**: estabelecimento empresarial cadastrado para contratar mecânicos por demanda.
- **Demanda / Job**: solicitação de serviço publicada por uma Oficina.
- **Usuário**: qualquer pessoa cadastrada (Mecânico, Oficina ou Cliente Final).

## 2. Natureza da Plataforma

**${PLATFORM_NAME} é uma plataforma de intermediação digital.** Conectamos Oficinas e Mecânicos autônomos por meio de tecnologia, mas **NÃO** somos:

- ❌ Empregadora dos mecânicos cadastrados
- ❌ Prestadora dos serviços mecânicos contratados
- ❌ Sócia, parceira ou representante das Oficinas
- ❌ Responsável pela qualidade, prazo ou resultado dos serviços

A relação entre Mecânico e Oficina é **independente, comercial e direta**, regida pelas leis brasileiras aplicáveis a prestação de serviços autônomos. Não há vínculo trabalhista, de subordinação ou empregatício, nem com a Plataforma, nem entre Mecânico e Oficina.

## 3. Cadastro e Conta

3.1. O cadastro é gratuito e exige aprovação prévia da Plataforma após análise de documentos.

3.2. Ao cadastrar-se, você declara, sob as penas da lei, que:
- É maior de 18 anos e juridicamente capaz
- Todas as informações fornecidas são verdadeiras, atuais e completas
- Você é o titular legítimo da conta de e-mail, telefone, CPF/CNPJ e dados bancários informados

3.3. Você é responsável por manter sua senha confidencial. Atividades realizadas com sua conta são de sua responsabilidade.

3.4. A Plataforma pode **suspender ou banir** contas, sem aviso prévio, em casos de:
- Fornecimento de informações falsas
- Uso fraudulento
- Quebra destes Termos
- Avaliação média abaixo do mínimo aceitável (3.0 estrelas)
- Reclamações reiteradas

## 4. Pagamentos

4.1. **Processamento**: pagamentos são processados pela **Stripe Inc.** (parceira certificada). A Plataforma nunca tem acesso direto aos dados completos do cartão.

4.2. **Taxa da Plataforma**: ${PLATFORM_FEE_PERCENT}% sobre o valor de cada serviço, descontada do repasse ao Mecânico.

4.3. **Modelo de cobrança "pacote fechado"**: o valor publicado na demanda é fechado. Não há cobrança extra se o serviço passar do tempo previsto, nem desconto se terminar antes. Esse valor é pago integralmente pela Oficina e repassado ao Mecânico (descontada a taxa).

4.4. **Repasse ao Mecânico**: realizado via PIX para a chave cadastrada pelo Mecânico, em até 24 horas úteis após confirmação da conclusão do serviço pela Oficina.

4.5. **Estornos** seguem a política da Stripe e os critérios definidos nesta Plataforma (ver seção 5).

## 5. Política de Cancelamento

### 5.1. Cancelamento pela OFICINA

| Quando | Condição | Multa |
|---|---|---|
| Mecânico ainda não chegou — primeiros ${TOLERANCE_MINUTES} minutos | Tolerância de arrependimento | **Sem multa** |
| Mecânico ainda não chegou — após ${TOLERANCE_MINUTES} minutos | Multa pelo deslocamento | **${CANCELLATION_FEE_PERCENT}% do valor** |
| Mecânico chegou, ainda não pago | Multa pelo deslocamento e tempo | **${CANCELLATION_FEE_PERCENT}% do valor** (cobrado via cartão) |
| Pago, mecânico ainda não iniciou | Multa, com estorno parcial | **${CANCELLATION_FEE_PERCENT}% retido**, restante estornado |
| Mecânico já iniciou o serviço | Cancelamento bilateral, em acordo | Ver seção 5.3 |
| Serviço concluído | Não permite cancelamento | Vira disputa (seção 6) |

### 5.2. Cancelamento pelo MECÂNICO (antes de chegar)

- Mecânico pode cancelar antes de chegar, sem multa, mas perde 0,5 estrela na avaliação automática.
- Cancelamentos repetidos podem levar a banimento.

### 5.3. Cancelamento durante o serviço (em acordo bilateral)

Se o serviço já está em andamento, a Oficina pode iniciar pedido de cancelamento por motivo legítimo (ex.: percepção de incompetência técnica que coloque em risco a segurança/reputação da Oficina ou cliente final).

- A Oficina deve descrever o motivo e, opcionalmente, anexar evidências
- O Mecânico recebe notificação imediata e tem 2 opções:
  - **Aceitar o cancelamento**: recebe **50% do valor**, Oficina recebe **50% de estorno**
  - **Recusar e abrir disputa**: caso vai para o Administrador, que decide o split final com base nas evidências apresentadas
- O resultado da disputa é vinculante para ambas as partes

### 5.4. Cancelamentos automáticos

A Plataforma pode cancelar automaticamente um job em casos de:
- Mecânico não confirmar chegada após X horas do horário agendado
- Pagamento não confirmado após Y horas da chegada do mecânico
- Inatividade de qualquer parte por mais de 7 dias após contratação

## 6. Disputas

6.1. Em caso de divergência entre Mecânico e Oficina sobre execução, qualidade, dano ou cancelamento, qualquer parte pode abrir uma **Disputa** pela própria Plataforma.

6.2. O Administrador da Plataforma analisará evidências apresentadas (mensagens, fotos, vídeos, histórico) e decidirá em até 7 dias úteis. A decisão é vinculante para ambas as partes no que diz respeito ao split do pagamento.

6.3. Decisões administrativas **não impedem** o uso de meios legais e judiciais externos pelas partes.

## 7. Avaliações

7.1. Após cada serviço, ambas as partes (Oficina e Mecânico) podem se avaliar por nota (1 a 5 estrelas) e comentário.

7.2. A Plataforma se reserva o direito de **moderar avaliações** que contenham linguagem ofensiva, falsas acusações, dados pessoais de terceiros ou conteúdo que viole estes Termos.

7.3. Avaliações são públicas dentro da Plataforma e impactam a reputação dos usuários.

## 8. Conduta Proibida

É expressamente proibido:
- Fraude ou tentativa de fraude
- Assédio, ofensa, discriminação de qualquer natureza
- Compartilhamento de conta com terceiros
- Uso de bots, scraping ou automação não autorizada
- Tentar fechar serviços fora da Plataforma para evitar a taxa (ver seção 9)
- Publicar demandas falsas para teste ou má-fé
- Causar dano deliberado à reputação de outros usuários

Violações podem levar a suspensão imediata sem aviso, bem como ações legais.

## 9. Não-burla da Plataforma

Mecânicos e Oficinas que se conheceram **através da Plataforma** se comprometem a, **pelo prazo de 12 meses** após o último serviço realizado pela Plataforma, **não fechar novos serviços diretamente fora da Plataforma**, sob pena de multa de 3x o valor do serviço.

Esta regra **NÃO** se aplica a:
- Relacionamentos pré-existentes que comprovadamente já existiam antes do uso da Plataforma
- Serviços iniciados na Plataforma e legitimamente concluídos fora por motivo técnico justificado

## 10. Limitação de Responsabilidade

10.1. **A PLATAFORMA NÃO É RESPONSÁVEL** por:
- Qualidade ou resultado dos serviços prestados pelos Mecânicos
- Atrasos, faltas ou comportamento de Mecânicos ou Oficinas
- Danos materiais, morais ou patrimoniais causados a veículos, terceiros ou ambientes durante a prestação do serviço
- Lucros cessantes, perdas indiretas, dano emergente ou consequencial
- Prejuízos decorrentes da impossibilidade de uso temporário da Plataforma (manutenção, falha de internet, etc)

10.2. A responsabilidade da Plataforma, em qualquer hipótese, **fica limitada ao valor de até R$ 1.000,00 (mil reais)** ou ao valor da última transação realizada na Plataforma, o que for menor.

## 11. Indenização

Você concorda em **defender, indenizar e isentar** a Plataforma de quaisquer reclamações, processos, perdas ou despesas (incluindo honorários advocatícios) decorrentes de:
- Sua violação destes Termos
- Sua violação de direitos de terceiros
- Conteúdo que você publicar na Plataforma
- Sua interação com outros usuários

## 12. Privacidade e LGPD

A coleta, uso e proteção dos seus dados pessoais é regida pela nossa **[Política de Privacidade](/privacidade)**, parte integrante destes Termos.

## 13. Modificações

13.1. Estes Termos podem ser modificados a qualquer tempo. Mudanças relevantes exigirão **novo aceite** dos usuários.

13.2. Você será notificado das mudanças por e-mail ou banner na Plataforma. O uso continuado após notificação implica em concordância com as novas condições.

## 14. Foro e Lei Aplicável

14.1. Estes Termos são regidos pelas leis da **República Federativa do Brasil**.

14.2. Fica eleito o **Foro da Comarca de ${PLATFORM_FORO}** para dirimir qualquer controvérsia, com renúncia expressa a qualquer outro, por mais privilegiado que seja.

## 15. Disposições Finais

15.1. A invalidade de qualquer cláusula não afeta as demais.

15.2. A tolerância de uma parte ao descumprimento de obrigação pela outra não constitui novação ou renúncia.

15.3. Para dúvidas, sugestões ou notificações: **${PLATFORM_CONTACT_EMAIL}**.

---

**${PLATFORM_NAME}** · CNPJ ${PLATFORM_CNPJ}
Última atualização: ${TERMS_DATE}
`;

/* ════════════════════════════════════════════════════════════════════
   TERMOS DO MECÂNICO
   ════════════════════════════════════════════════════════════════════ */

export const TERMS_MECHANIC = `
# Termos Específicos do Mecânico

**Aplicáveis a profissionais que se cadastrarem como Mecânicos.**

Estes termos complementam os **[Termos Gerais de Uso](#general)** e se aplicam adicionalmente a Mecânicos cadastrados na Plataforma.

---

## 1. Sua Independência Profissional

1.1. Você é um **profissional autônomo independente**. Não há vínculo empregatício, de subordinação ou trabalhista entre você e:
- A Plataforma ${PLATFORM_NAME}
- As Oficinas que te contratam pela Plataforma

1.2. Você é o **único responsável** por:
- Recolhimento de tributos (INSS, ISS, IRPF)
- Emissão de notas fiscais quando exigidas
- Equipamentos de trabalho (ferramentas, EPIs)
- Deslocamento e seus custos
- Sua segurança no exercício da atividade

## 2. Documentação Obrigatória

Para se cadastrar você deve fornecer e manter atualizados:
- **CPF** válido e regular
- **CNH** quando aplicável (serviços que exigem deslocamento próprio)
- **Comprovante de endereço** atualizado
- **Chave PIX** ativa para recebimento dos repasses
- **Foto de perfil** atual e nítida
- **Habilidades / Especializações** declaradas com sinceridade

A Plataforma pode solicitar **documentos complementares** a qualquer momento para verificação.

## 3. Compromissos Profissionais

3.1. Você se compromete a:
- Comparecer pontualmente nos horários acordados
- Prestar serviço com **diligência e qualidade técnica adequadas**
- Tratar Oficinas e clientes finais com **respeito e profissionalismo**
- Usar EPIs adequados e seguir normas de segurança
- Comunicar imprevistos com **mínimo 1 hora de antecedência** (quando possível)
- Não consumir álcool ou drogas durante o serviço
- Cumprir com as descrições publicadas das demandas que aceitar

3.2. Você declara possuir conhecimento técnico compatível com as habilidades cadastradas.

## 4. Pagamento e Taxa

4.1. Você recebe o valor publicado na demanda **descontada a taxa de ${PLATFORM_FEE_PERCENT}% da Plataforma**.

4.2. Os repasses são feitos via PIX na chave cadastrada, em até 24 horas úteis após confirmação da Oficina.

4.3. Você é responsável por manter sua chave PIX **válida e correta**. Repasses para chave inválida ou desatualizada são de sua responsabilidade.

## 5. Cancelamentos

5.1. Você pode cancelar uma demanda **antes de confirmar chegada**, mas:
- Cancelamentos contam negativamente em sua avaliação
- Cancelamentos repetidos (acima de 20% das demandas aceitas em 30 dias) podem levar a **suspensão temporária ou banimento**

5.2. Após confirmar chegada, você não pode cancelar unilateralmente. Eventuais imprevistos devem ser comunicados à Oficina pelo chat e podem virar **Disputa** caso não haja acordo.

5.3. Se a Oficina cancelar enquanto você já está em serviço:
- Você é notificado imediatamente
- Pode **aceitar** (recebe 50% do valor) ou **recusar** (vira disputa)
- Detalhes em **[Termos Gerais, seção 5](#general-cancelamento)**

## 6. Não-burla da Plataforma

6.1. **Você se compromete a, durante o uso da Plataforma e por 12 meses após o último serviço realizado, NÃO fechar novos serviços diretamente com Oficinas conhecidas pela Plataforma fora dela.**

6.2. Multa: **3x o valor do serviço fechado fora da Plataforma**, devidos imediatamente.

6.3. Esta regra protege a Plataforma e mantém o ecossistema saudável para todos os Mecânicos.

## 7. Avaliação e Reputação

7.1. Sua nota média é pública na Plataforma e influencia diretamente:
- Quantidade de demandas que você verá
- Sua prioridade em demandas concorridas
- Sua manutenção como ativo na Plataforma

7.2. Nota média **abaixo de 3.0 estrelas** após 10 ou mais avaliações pode levar a banimento.

## 8. Reembolso de Multas/Danos

Caso você cause **dano material comprovado** ao veículo ou patrimônio durante o serviço:
- Você é o único responsável financeiro pelo dano
- A Plataforma pode reter repasses futuros até resolução do caso
- A Plataforma pode te excluir definitivamente em casos graves

## 9. Aceitação

Ao clicar em "Li e concordo com os Termos" durante o cadastro como Mecânico, você declara ter lido, compreendido e concordado com:
- Os **[Termos Gerais de Uso](#general)**
- Estes Termos Específicos do Mecânico
- A **[Política de Privacidade](/privacidade)**
`;

/* ════════════════════════════════════════════════════════════════════
   TERMOS DA OFICINA
   ════════════════════════════════════════════════════════════════════ */

export const TERMS_WORKSHOP = `
# Termos Específicos da Oficina

**Aplicáveis a estabelecimentos que se cadastrarem como Oficinas.**

Estes termos complementam os **[Termos Gerais de Uso](#general)** e se aplicam adicionalmente a Oficinas cadastradas na Plataforma.

---

## 1. Natureza da Contratação

1.1. Ao publicar uma demanda na Plataforma, você não está contratando um **funcionário**. Você está contratando um **prestador de serviço autônomo**, em regime de pessoa física, sem vínculo empregatício.

1.2. **NÃO há subordinação** entre Oficina e Mecânico. O Mecânico executa o serviço com autonomia técnica.

## 2. Documentação Obrigatória

Para se cadastrar a Oficina deve fornecer e manter atualizados:
- **CNPJ** ativo e regular
- **Razão social** e nome fantasia
- **Endereço comercial completo**
- **Telefone de contato**
- **Forma de pagamento** (cartão de crédito ou PIX cadastrado na Stripe)

A Plataforma pode solicitar **alvarás, comprovantes de endereço ou documentos complementares** a qualquer momento.

## 3. Compromissos da Oficina

3.1. Você se compromete a:
- Publicar **demandas reais e legítimas** (não publicar testes ou demandas falsas)
- Fornecer **descrição clara e precisa** do serviço pretendido
- **Aguardar pontualmente** a chegada do Mecânico no horário agendado
- Disponibilizar **ambiente adequado e seguro** para execução do serviço (iluminação, ferramentas básicas se aplicável, EPIs gerais)
- Tratar o Mecânico com **respeito e profissionalismo**
- Confirmar a conclusão do serviço **em até 24 horas** após o término
- Avaliar com sinceridade

3.2. Você é responsável por:
- Pagar o valor integral publicado na demanda (modelo de pacote fechado)
- Cumprir com horários acordados
- Garantir segurança do ambiente

## 4. Pagamento

4.1. **Pagamento antecipado**: a Oficina paga o valor integral antes do início do serviço, via cartão (Stripe) ou PIX (quando disponível).

4.2. **Pacote fechado**: o valor publicado é fechado e não muda com base no tempo real de execução. Se o Mecânico terminar antes ou levar mais tempo, o valor é o mesmo.

4.3. Em caso de **cancelamento**, ver políticas em **[Termos Gerais, seção 5](#general-cancelamento)** — pode haver multas conforme o estágio do serviço.

## 5. Direito de Cancelamento Durante o Serviço

5.1. **A Oficina TEM o direito** de iniciar pedido de cancelamento durante a execução, em casos legítimos (ex.: percepção de incompetência técnica que coloque em risco a Oficina ou cliente final).

5.2. O cancelamento **bilateral** é a primeira opção:
- Oficina explica motivo + opcional evidências (foto/vídeo)
- Mecânico aceita (50% pra ele, 50% estorno) ou recusa (vira Disputa)
- Detalhes em **[Termos Gerais, seção 5.3](#general-cancelamento-bilateral)**

5.3. **A reputação da Oficina é também impactada** por cancelamentos durante o serviço — use com responsabilidade.

## 6. Não-burla da Plataforma

6.1. **A Oficina se compromete a, durante o uso da Plataforma e por 12 meses após o último serviço realizado, NÃO contratar Mecânicos conhecidos pela Plataforma diretamente fora dela.**

6.2. Multa: **3x o valor do serviço fechado fora da Plataforma**, devidos imediatamente.

## 7. Avaliação e Reputação

7.1. Sua nota média é pública e influencia:
- Disposição de Mecânicos para aceitar suas demandas
- Sua manutenção como ativa na Plataforma

7.2. Nota média **abaixo de 3.0 estrelas** após 10 ou mais avaliações pode levar a banimento.

7.3. Cancelamentos abusivos ou sucessivos durante o serviço podem levar a suspensão.

## 8. Responsabilidade pelo Ambiente

A Oficina é responsável por:
- Segurança do local onde o serviço será prestado
- Conformidade com normas de saúde e segurança do trabalho aplicáveis
- Equipamentos disponibilizados (que devem estar em condições de uso)

A Plataforma **NÃO se responsabiliza** por acidentes ocorridos durante o serviço dentro do ambiente da Oficina.

## 9. Aceitação

Ao clicar em "Li e concordo com os Termos" durante o cadastro como Oficina, o representante legal/responsável declara ter poderes para vincular o estabelecimento e ter lido, compreendido e concordado com:
- Os **[Termos Gerais de Uso](#general)**
- Estes Termos Específicos da Oficina
- A **[Política de Privacidade](/privacidade)**
`;

/* ════════════════════════════════════════════════════════════════════
   POLÍTICA DE PRIVACIDADE (LGPD)
   ════════════════════════════════════════════════════════════════════ */

export const PRIVACY_POLICY = `
# Política de Privacidade — MecânicoApp

**Versão ${TERMS_VERSION}** — vigente a partir de ${TERMS_DATE}

Esta Política descreve como o **${PLATFORM_NAME}** coleta, usa, armazena e protege seus dados pessoais, em conformidade com a **Lei Geral de Proteção de Dados (LGPD — Lei 13.709/2018)**.

---

## 1. Quem é o Controlador

**${PLATFORM_NAME}** · CNPJ ${PLATFORM_CNPJ}
- Site: ${PLATFORM_DOMAIN}
- E-mail: ${PLATFORM_CONTACT_EMAIL}

## 2. Dados Que Coletamos

### 2.1. Dados de Cadastro
- Nome completo
- E-mail
- Telefone / WhatsApp
- CPF (mecânicos) ou CNPJ (oficinas)
- Endereço
- Foto de perfil (opcional)
- Documentos de verificação (CNH, RG, comprovante de endereço — quando solicitados)
- Chave PIX (apenas mecânicos)

### 2.2. Dados Profissionais
- Habilidades / especializações declaradas (mecânicos)
- Razão social, dados comerciais (oficinas)
- Localização da oficina (latitude/longitude)
- Histórico de serviços
- Avaliações dadas e recebidas

### 2.3. Dados de Pagamento
- Os dados de cartão **NUNCA** são armazenados em nossos servidores. Eles são processados diretamente pela **Stripe Inc.**, certificada PCI-DSS Nível 1.
- Mantemos apenas o ID da transação e metadados (valor, status, data).

### 2.4. Dados de Uso e Geolocalização
- Localização em tempo real **apenas durante deslocamento ativo** para um serviço (mecânicos)
- Logs de acesso (IP, navegador, dispositivo)
- Mensagens trocadas no chat da Plataforma
- Cliques e telas visitadas (analytics)

### 2.5. Dados de Comunicação
- Histórico de e-mails enviados pela Plataforma
- Mensagens com a equipe de suporte
- Anexos enviados durante processo de aprovação (RG, comprovantes, etc)

## 3. Para Que Usamos Seus Dados

### 3.1. Execução do Serviço (Base Legal: Execução de Contrato)
- Conectar Oficinas e Mecânicos
- Processar pagamentos e repasses
- Permitir comunicação entre partes
- Monitorar localização durante deslocamento (apenas durante serviço)

### 3.2. Verificação de Identidade (Base Legal: Cumprimento de Obrigação Legal)
- Análise de cadastros novos
- Prevenção a fraudes
- Cumprimento de exigências fiscais

### 3.3. Comunicação (Base Legal: Legítimo Interesse)
- Notificações sobre serviços em andamento
- Atualizações de status
- Confirmações de pagamento
- Solicitações de documentação

### 3.4. Melhoria do Produto (Base Legal: Legítimo Interesse)
- Análise agregada de uso
- Identificação de bugs e gargalos
- Pesquisas anônimas (com seu consentimento explícito)

### 3.5. Marketing (Base Legal: Consentimento)
- Envio de novidades e promoções **apenas se você optar por receber**
- Você pode descadastrar a qualquer momento

## 4. Com Quem Compartilhamos

Compartilhamos dados estritamente necessários com:

| Parceiro | Finalidade | Onde |
|---|---|---|
| **Stripe Inc.** | Processamento de pagamentos | EUA / UE (com cláusulas-padrão da LGPD/GDPR) |
| **Supabase Inc.** | Hospedagem do banco de dados | EUA |
| **Resend** | Envio de e-mails transacionais | EUA |
| **Mapbox / OpenStreetMap** | Mapas e geolocalização | EUA |
| **Google Cloud** | Recuperação de senha, captcha | EUA |

**Não vendemos seus dados a terceiros.** Compartilhamentos sempre seguem cláusulas-padrão da LGPD para transferência internacional.

## 5. Compartilhamento Entre Usuários

Para executar o serviço, alguns dados são visíveis entre Oficinas e Mecânicos contratados:
- Nome, foto, avaliação média (público a outros usuários)
- Telefone (quando há serviço ativo entre as partes)
- Localização durante deslocamento ativo (Mecânico → Oficina contratante)

**Dados sensíveis (CPF, comprovantes, chave PIX) NÃO são compartilhados entre usuários.**

## 6. Por Quanto Tempo Guardamos

| Dado | Tempo de retenção |
|---|---|
| Cadastro ativo | Enquanto a conta estiver ativa |
| Cadastro excluído | 5 anos (obrigação fiscal/civil) |
| Histórico de pagamentos | 5 anos (obrigação fiscal) |
| Histórico de mensagens | 2 anos após último uso |
| Logs de acesso | 6 meses |
| Anexos de aprovação | 5 anos após aprovação ou 1 ano após rejeição |

Após esses prazos, dados são **anonimizados ou excluídos**.

## 7. Seus Direitos como Titular (LGPD)

Você tem direito a, a qualquer momento:
- **Confirmação** da existência de tratamento
- **Acesso** aos seus dados
- **Correção** de dados incompletos, inexatos ou desatualizados
- **Anonimização, bloqueio ou eliminação** de dados desnecessários
- **Portabilidade** dos dados a outro fornecedor
- **Eliminação** dos dados tratados com seu consentimento
- **Informação** sobre com quem compartilhamos seus dados
- **Revogação do consentimento**, quando aplicável

### Como exercer seus direitos
Envie e-mail para **${PLATFORM_CONTACT_EMAIL}** com:
- Nome completo
- E-mail cadastrado
- Direito que deseja exercer
- Documento com foto (para verificação)

Responderemos em até **15 dias úteis**.

## 8. Segurança

Adotamos medidas técnicas e organizacionais para proteger seus dados:
- **Criptografia em trânsito** (HTTPS/TLS) em todas as comunicações
- **Criptografia em repouso** no banco de dados
- **Controle de acesso** com autenticação e permissões granulares
- **Backups** automáticos diários
- **Monitoramento** de tentativas de acesso suspeitas
- **Treinamento** dos colaboradores com acesso a dados pessoais

Em caso de **incidente de segurança** que possa impactar você, comunicaremos em até 72 horas após detecção, conforme a LGPD.

## 9. Cookies

Usamos cookies essenciais para funcionamento da Plataforma (autenticação, sessão). Não usamos cookies de terceiros para rastreamento publicitário.

## 10. Crianças e Adolescentes

A Plataforma **não se destina a menores de 18 anos**. Não coletamos intencionalmente dados de menores.

## 11. Encarregado pelo Tratamento (DPO)

Caso queira contatar nosso Encarregado de Dados:
**${PLATFORM_CONTACT_EMAIL}**

## 12. Alterações nesta Política

Atualizações desta Política podem ocorrer. Você será comunicado por e-mail ou banner. O uso continuado após a comunicação implica em concordância.

---

**${PLATFORM_NAME}** · CNPJ ${PLATFORM_CNPJ}
Última atualização: ${TERMS_DATE}
`;
