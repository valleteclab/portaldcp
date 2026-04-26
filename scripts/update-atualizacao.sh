#!/bin/bash
# Atualizar conteúdo da atualização versão 1
docker exec portaldcp-postgres-1 psql -U portaldcp -d portaldcp -c "
DELETE FROM atualizacoes_lidas WHERE atualizacao_id = (SELECT id FROM atualizacoes_sistema WHERE versao = 1);
DELETE FROM atualizacoes_sistema WHERE versao = 1;
INSERT INTO atualizacoes_sistema (id, versao, titulo, conteudo, ativo, publico_alvo, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  1,
  'Novidade: Chat de Medição',
  E'Olá! Lançamos o Chat de Medição — uma nova forma de registrar suas medições de forma rápida e simples!\n\nComo funciona:\n\n1. Acesse um contrato e clique em \"Medição por Chat\".\n2. Envie o XML ou PDF da Nota Fiscal e o sistema preenche o boletim automaticamente.\n3. Informe o período da medição (ex: 01/04/2026 a 30/04/2026).\n4. O sistema mostra os itens disponíveis e você informa a quantidade medida.\n5. Valide os dados e assine — pronto!\n\nÉ como conversar com um assistente que preenche tudo para você. Experimente!',
  true,
  'fornecedor',
  now(),
  now()
);
"
echo "Atualização atualizada com sucesso!"
