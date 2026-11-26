-- Cadastro completo do investidor (pessoa física) e modelo de contrato editável.
-- Colunas novas são opcionais (não quebram nada). Dados pessoais: só o admin e o próprio investidor leem
-- (a política investors_self já limita o investidor à própria linha).
-- O texto abaixo é um ESQUELETO NEUTRO para teste: marcado "MINUTA", precisa de revisão de advogado.

alter table public.investors
  add column if not exists cpf            text,
  add column if not exists rg             text,
  add column if not exists nationality    text,
  add column if not exists marital_status text,
  add column if not exists profession     text,
  add column if not exists address        text,
  add column if not exists phone          text,
  add column if not exists pix_key        text;

create table if not exists public.investor_contract_template (
  instrument text primary key check (instrument in ('mutuo_conversivel', 'investidor_anjo')),
  body       text not null,
  updated_at timestamptz not null default now()
);
alter table public.investor_contract_template enable row level security;
drop policy if exists investor_contract_template_admin on public.investor_contract_template;
create policy investor_contract_template_admin on public.investor_contract_template for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop trigger if exists investor_contract_template_audit on public.investor_contract_template;
create trigger investor_contract_template_audit after insert or update or delete on public.investor_contract_template
  for each row execute function public.investor_audit();
grant select, insert, update, delete on public.investor_contract_template to authenticated;

insert into public.investor_contract_template (instrument, body) values
('mutuo_conversivel', $t$MINUTA PARA REVISÃO JURÍDICA — NÃO USAR SEM REVISÃO DE ADVOGADO

CONTRATO DE MÚTUO CONVERSÍVEL

MUTUANTE (INVESTIDOR): {{nome}}, {{nacionalidade}}, {{estado_civil}}, {{profissao}}, CPF {{cpf}}, RG {{rg}}, residente em {{endereco}}, telefone {{telefone}}.
MUTUÁRIA: [preencher: razão social, CNPJ e endereço da empresa].

1. OBJETO. O MUTUANTE entrega à MUTUÁRIA, em {{data_aporte}}, a quantia de {{valor}} ({{valor_extenso}}), a título de mútuo.

2. VALUATION DE REFERÊNCIA. As partes tomam como referência o valuation de {{valuation}}. Com base nele, a participação estimada do MUTUANTE em caso de conversão é de {{participacao}} (aporte dividido pelo valuation), sujeita às condições da cláusula 3.

3. CONVERSÃO. O mútuo poderá ser convertido em participação societária ou outro direito, conforme as condições a seguir: {{condicoes}}. [preencher: gatilho da conversão, prazo, desconto e teto, se houver].

4. DEVOLUÇÃO. Não ocorrendo a conversão, a MUTUÁRIA devolverá o valor nas condições de prazo e correção: [preencher].

5. POSIÇÃO DO INVESTIDOR. Enquanto não houver conversão, o MUTUANTE não é sócio, não administra a MUTUÁRIA e não responde por suas obrigações.

6. PARTICIPAÇÃO NO RESULTADO. Se acordado, o MUTUANTE receberá {{percentual_resultado}} do resultado distribuível apurado mensalmente pela MUTUÁRIA, pago por PIX ({{pix}}). Os relatórios do painel do investidor são informativos; o número oficial é o apurado pelo contador da MUTUÁRIA.

7. DADOS PESSOAIS. As partes tratarão os dados pessoais conforme a Lei Geral de Proteção de Dados (LGPD).

8. FORO. [preencher: foro competente].

Local e data: [preencher], {{data_hoje}}.

_______________________________   _______________________________
{{nome}} (MUTUANTE)                [representante da MUTUÁRIA]
$t$),
('investidor_anjo', $t$MINUTA PARA REVISÃO JURÍDICA — NÃO USAR SEM REVISÃO DE ADVOGADO

CONTRATO DE PARTICIPAÇÃO (INVESTIDOR-ANJO)

INVESTIDOR: {{nome}}, {{nacionalidade}}, {{estado_civil}}, {{profissao}}, CPF {{cpf}}, RG {{rg}}, residente em {{endereco}}, telefone {{telefone}}.
SOCIEDADE: [preencher: razão social, CNPJ e endereço da empresa].

1. OBJETO. O INVESTIDOR aporta à SOCIEDADE, em {{data_aporte}}, a quantia de {{valor}} ({{valor_extenso}}), por meio de contrato de participação.

2. VALUATION DE REFERÊNCIA. As partes tomam como referência o valuation de {{valuation}}, do qual resulta participação estimada de {{participacao}} (aporte dividido pelo valuation), nos termos das condições abaixo.

3. CONDIÇÕES. {{condicoes}}. [preencher: prazo, remuneração, direito de conversão, saída].

4. POSIÇÃO DO INVESTIDOR. [preencher, conforme a legislação aplicável ao investidor-anjo: o investidor não é sócio nem administrador e não responde pelas dívidas da sociedade; revisar com advogado].

5. PARTICIPAÇÃO NO RESULTADO. Se acordado, {{percentual_resultado}} do resultado distribuível apurado mensalmente, pago por PIX ({{pix}}). Os relatórios do painel são informativos; o número oficial é o do contador.

6. DADOS PESSOAIS. As partes tratarão os dados pessoais conforme a LGPD.

7. FORO. [preencher: foro competente].

Local e data: [preencher], {{data_hoje}}.

_______________________________   _______________________________
{{nome}} (INVESTIDOR)              [representante da SOCIEDADE]
$t$)
on conflict (instrument) do nothing;
