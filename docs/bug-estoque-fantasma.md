# Bug: estoque fantasma ao cancelar/reabrir OS importada

**Status:** documentado, NÃO corrigido. Vai ser tratado numa etapa técnica separada (branch própria, testes e validação antes de publicar), porque a correção mexe no gatilho da OS.

## O que acontece

O gatilho `trg_os_stock` (migration `0039_suppliers_purchases_payables.sql`) faz o seguinte:

- quando a OS **passa para** `completed`, dá baixa nas peças do cadastro (`kind = 'os'`, quantidade negativa);
- quando a OS **sai de** `completed` (reaberta ou cancelada), devolve as peças (`kind = 'estorno_os'`, quantidade positiva).

A OS importada de nota antiga (`source = 'paper_import'`) e a venda de balcão **nascem** como `completed`
(com `insert`, não `update`). Por isso a baixa nunca acontece. Mas, se essa OS for cancelada ou reaberta depois, o gatilho
devolve peças que **nunca saíram** do estoque, e elas aparecem no estoque sem nunca terem sido compradas.

## Evidência (produção, 07/10/2026)

- Oficina `69408e90…`: a OS nº 0078 (`paper_import`) foi cancelada e gerou 4 movimentos `estorno_os` de +1.
  Resultado: 4 peças com estoque 1 sem nenhuma compra. São exatamente as 4 que o painel novo mostra em "Custo a confirmar".
- Oficina `be54b880…`: a OS nº 1424 (`balcao`) foi reaberta, com o mesmo padrão de `estorno_os`. Aqui é preciso conferir se a venda de
  balcão teve baixa: `counter_sale` faz `update … status = 'completed'`, então nesse caso a baixa **existe**
  e a devolução está correta.

## Correção proposta (para a etapa separada)

No `trg_os_stock`, ao devolver, devolver só o que realmente saiu:
calcular, por peça, a soma dos movimentos `os` + `estorno_os` daquela OS e devolver apenas esse saldo (se for negativo).
Isso cobre a OS importada (saldo 0 → não devolve nada) e não muda o comportamento das OS normais.

Também é preciso decidir se as 4 peças afetadas recebem um ajuste de volta para 0. Como isso depende da contagem real
da prateleira, a decisão fica com a oficina.

## Checklist da etapa

- [ ] branch separada (`fix/estoque-fantasma-os-importada`)
- [ ] migration nova alterando só `trg_os_stock`
- [ ] testar: OS normal concluir/reabrir/concluir; OS importada cancelar; venda balcão cancelar
- [ ] validar com o usuário antes de aplicar em produção
