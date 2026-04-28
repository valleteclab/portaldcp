# API de Fornecedores - Portal DCP

API REST oficial para integracoes de fornecedores com contratos, medicoes, ordens e notas fiscais.

## Base URL

Producao:

```text
https://compras.cmlem.ba.gov.br/api/ext/v1
```

Ambiente local:

```text
http://localhost:3000/api/ext/v1
```

## Autenticacao

Todos os endpoints da API usam o header `X-Api-Key`.

```http
X-Api-Key: sua_chave_do_fornecedor
```

A chave e gerada no Portal DCP no cadastro do fornecedor. O valor completo aparece apenas uma vez no momento da geracao. Se a chave for perdida, gere uma nova e atualize a integracao.

Evite enviar a chave em query string. O endpoint MCP legado ainda aceita `?api_key=...`, mas novas integracoes devem usar esta API REST com `X-Api-Key`.

## Swagger

A documentacao interativa fica em:

```text
https://compras.cmlem.ba.gov.br/api/docs
```

O OpenAPI JSON fica em:

```text
https://compras.cmlem.ba.gov.br/api/docs-json
```

## Fluxo rapido

### 1. Validar a chave

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/me" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

### 2. Listar contratos

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/contratos" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

### 3. Consultar contrato

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/contratos/$CONTRACT_ID" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

Use esta resposta para obter `itens_cronograma[].id` quando o contrato medir por item/quantidade.

### 4. Criar medicao

Para contrato mensal/continuado:

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/contratos/$CONTRACT_ID/medicoes" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "periodo_inicio": "2026-04-01",
    "periodo_fim": "2026-04-30",
    "nota_fiscal_numero": "12345",
    "nota_fiscal_valor": 36789.73,
    "nota_fiscal_data": "2026-04-28",
    "valor_medido": 36789.73,
    "observacoes": "Servico executado conforme contrato."
  }'
```

Para contrato por item/quantidade:

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/contratos/$CONTRACT_ID/medicoes" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "periodo_inicio": "2026-04-01",
    "periodo_fim": "2026-04-30",
    "itens": [
      {
        "item_cronograma_id": "UUID_DO_ITEM",
        "quantidade_medida": 1
      }
    ]
  }'
```

Para criar e submeter em uma unica chamada, envie `"enviar_imediatamente": true`.

### 5. Anexar documento da medicao

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/medicoes/$MEASUREMENT_ID/documentos" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -F "tipo=NOTA_FISCAL" \
  -F "descricao=Nota fiscal de abril" \
  -F "file=@./nota-fiscal.pdf"
```

Tipos aceitos: `NOTA_FISCAL`, `DOCUMENTO`, `FOTO`.

Arquivos aceitos: PDF, JPG e PNG, ate 10 MB.

### 6. Enviar medicao ao fiscal

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/medicoes/$MEASUREMENT_ID/enviar" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

### 7. Consultar status da medicao

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/medicoes/$MEASUREMENT_ID" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

## Ordens e notas fiscais

### Listar ordens

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

Filtros opcionais:

```text
?status=ENVIADA&contratoId=UUID_DO_CONTRATO
```

### Consultar ordem

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

### Dar ciencia de recebimento

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID/ciencia-recebimento" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"observacao":"Ordem recebida."}'
```

### Informar entrega

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID/ciencia-entrega" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"data_entrega":"2026-04-28","observacao":"Entrega realizada."}'
```

### Enviar nota fiscal da ordem

O envio exige pelo menos um XML e um PDF no campo `arquivos`.

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID/nota-fiscal" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -F "arquivos=@./nota.xml" \
  -F "arquivos=@./nota.pdf"
```

Arquivos aceitos: XML, PDF, JPG e PNG, ate 15 MB por arquivo.

### Consultar notas fiscais da ordem

Mais recente:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID/nota-fiscal" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

Todas:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID/notas-fiscais" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

## Erros comuns

| Status | Motivo comum |
| --- | --- |
| 400 | Campo obrigatorio ausente, data invalida ou arquivo invalido |
| 401 | Header `X-Api-Key` ausente, invalido ou revogado |
| 403 | Contrato, medicao ou ordem nao pertence ao fornecedor autenticado |
| 404 | Recurso nao encontrado |

## MCP legado

O endpoint MCP continua ativo para compatibilidade:

```text
https://compras.cmlem.ba.gov.br/api/mcp/sse?api_key=SUA_CHAVE
```

Novas integracoes devem preferir a API REST `/api/ext/v1`, pois ela evita chave na URL, possui Swagger e e mais simples de testar.
