#!/bin/bash
# Criar primeira atualização do sistema
docker exec portaldcp-postgres-1 psql -U portaldcp -d portaldcp -c "
INSERT INTO atualizacoes_sistema (id, versao, titulo, conteudo, ativo, publico_alvo, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  1,
  'Novidades no chat de medição',
  E'Olá! Melhoramos o chat de medição para facilitar seu uso:\n\n1. Envie o XML ou PDF da Nota Fiscal e o sistema preenche o boletim automaticamente — você só valida e assina!\n2. Ao informar o período, o sistema mostra os itens disponíveis com saldo atualizado.\n3. Contrato com 1 item? Você é guiado diretamente, sem tabela desnecessária.\n4. Se todos os itens já foram medidos no período, o sistema avisa e pede outro período.\n5. Para múltiplos itens, basta informar item e quantidade (ex: item 1 = 10,5).\n\nEssas mudanças tornam o processo mais rápido e claro. Bom trabalho!',
  true,
  'fornecedor',
  now(),
  now()
);
"
echo "Atualização criada com sucesso!"
