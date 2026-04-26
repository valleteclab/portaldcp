#!/bin/bash
# Criar primeira atualização do sistema
docker exec portaldcp-postgres-1 psql -U licitafacil -d licitafacil -c "
INSERT INTO atualizacoes_sistema (id, versao, titulo, conteudo, ativo, publico_alvo, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  1,
  'Novidades no chat de medição',
  E'Olá! Melhoramos o chat de medição para facilitar seu uso:\n\n1. Ao informar o período, o sistema agora mostra os itens disponíveis para medição com saldo atualizado.\n2. Se o contrato tem apenas um item, você será guiado diretamente — sem tabela desnecessária.\n3. Se todos os itens já foram medidos no período informado, o sistema avisa e pede outro período.\n4. Para contratos com múltiplos itens, basta informar o item e a quantidade, exemplo: item 1 = 10,5.\n\nEssas mudanças tornam o processo mais rápido e claro. Bom trabalho!',
  true,
  'fornecedor',
  now(),
  now()
);
"
echo "Atualização criada com sucesso!"
