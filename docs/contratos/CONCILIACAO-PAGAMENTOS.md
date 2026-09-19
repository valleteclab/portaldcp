# Conciliação de pagamentos consultados

Na aba **Empenhos**, use **Consultar pagamentos para conciliar**.
A consulta abrange os exercícios pesquisados pela integração existente, desde
o ano inicial do contrato até o atual, sem restringir pela data de renovação.

1. Localize o pagamento e confira empenho, data e histórico contábil.
2. Clique em **Conciliar pagamento**, selecione a medição aprovada e confira a NF.
3. Informe o valor (integral ou parcial) e a justificativa da conferência.
4. Confirme. A medição exibirá o total conciliado e a diferença a conferir.

Um pagamento pode ser rateado entre medições do mesmo contrato; uma medição
pode receber vários pagamentos. Estornos usam valores negativos. A soma não
pode ultrapassar o documento contábil nem deixar a medição negativa ou acima
do valor medido. Coincidência de valor apenas sugere uma medição, sem confirmação
automática. Retenções e glosas precisam ser conferidas documentalmente; não há
baixa automática da diferença.

O vínculo **não altera saldo, aprovação, boletim ou execução do contrato**.
Para corrigir, cancele o vínculo com justificativa e registre outro. O histórico
preserva autor, data, motivo e cópia dos dados contábeis consultados.

Pagamentos sem confirmação de contrato/fornecedor ou com identificação ambígua
não podem ser vinculados. O nº de liquidação não é exigido (atas e o formato
antigo do portal não o trazem) e o documento vazio de pessoa física é aceito,
pois a consulta já é filtrada pelo CPF/CNPJ do contrato. Um pagamento já vinculado a outro contrato do órgão
é bloqueado. As confirmações usam transação e bloqueios no PostgreSQL.

Se um pagamento desaparecer ou mudar na origem, os vínculos anteriores permanecem
marcados para revisão. Estornos pendentes no mesmo empenho também exigem revisão.
Falha de rede, configuração ausente ou HTML não reconhecido não são tratados
como ausência de pagamentos. A tela mostra o horário da última consulta.

## Implantação

Nova tabela: `conciliacoes_pagamento`. Em ambientes com `DB_SYNCHRONIZE=false`,
aplicar a migration `20260919000001-AddConciliacaoPagamentos` antes de disponibilizar
a interface. A migration foi adicionada ao código; não foi executada em produção.

## Limites desta primeira etapa

- Conciliação confirmada pelo responsável; a origem não fornece uma chave
  estruturada de NF em todos os pagamentos.
- Valor integral conciliado se refere aos vínculos confirmados na consulta,
  não substitui a conferência contábil de retenções e documentos.
- Consulta iniciada pelo usuário, sem alteração no fluxo de envio à contabilidade.
- Não cria medições retroativas nem lança pagamentos na contabilidade.
