# API de Fornecedores - Portal DCP

API REST oficial para integracao de fornecedores com o Portal de Compras Publicas (Portal DCP). Permite gerenciar contratos, medicoes, ordens de fornecimento e notas fiscais de forma programatica.

**Dominio**: Sistema de compras publicas municipais (Lei 14.133/2021). O fornecedor autenticado so pode acessar contratos, medicoes e ordens vinculados ao seu cadastro.

## Base URL

| Ambiente | URL |
| --- | --- |
| Producao | `https://compras.cmlem.ba.gov.br/api/ext/v1` |
| Local | `http://localhost:3000/api/ext/v1` |

## Autenticacao

Todos os endpoints exigem o header `X-Api-Key` com a chave de API do fornecedor.

```http
X-Api-Key: sua_chave_do_fornecedor
```

A chave e gerada no Portal DCP no cadastro do fornecedor. O valor completo aparece apenas uma vez no momento da geracao. Se a chave for perdida, gere uma nova no portal e atualize a integracao.

**Seguranca**: Nunca envie a chave em query string. A API REST usa header `X-Api-Key`. O endpoint MCP legado aceita `?api_key=...`, mas novas integracoes devem usar a API REST.

## Swagger interativo

| Recurso | URL |
| --- | --- |
| **Documentacao da API** (HTML) | `https://compras.cmlem.ba.gov.br/api/ext/docs` |
| **Documentacao da API** (Markdown) | `https://compras.cmlem.ba.gov.br/api/ext/docs.md` |
| Interface Swagger | `https://compras.cmlem.ba.gov.br/api/docs` |
| OpenAPI JSON | `https://compras.cmlem.ba.gov.br/api/docs-json` |

## Fluxo de integracao

O fluxo tipico de integracao segue estas etapas:

1. **Validar chave** → `GET /me`
2. **Listar contratos** → `GET /contratos`
3. **Consultar contrato** → `GET /contratos/:id` (obtem IDs dos itens do cronograma)
4. **Criar medicao** → `POST /contratos/:id/medicoes`
5. **Anexar documentos** → `POST /medicoes/:id/documentos`
6. **Enviar medicao** → `POST /medicoes/:id/enviar`
7. **Consultar status** → `GET /medicoes/:id`
8. **Download do boletim PDF** → `GET /medicoes/:id/boletim-pdf`

Para ordens de fornecimento, o fluxo e:

1. **Listar ordens** → `GET /ordens`
2. **Dar ciencia de recebimento** → `POST /ordens/:id/ciencia-recebimento`
3. **Informar entrega** → `POST /ordens/:id/ciencia-entrega`
4. **Enviar nota fiscal** → `POST /ordens/:id/nota-fiscal`

---

## Referencia de endpoints

### GET /me

Valida a API key e retorna os dados do fornecedor autenticado.

**Request**:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/me" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

**Response 200**:

```json
{
  "id": "44f0c194-5233-4b44-aa63-a091a057fb9b",
  "razao_social": "EFFECT PRODUTORA LTDA",
  "cpf_cnpj": "10723280000110",
  "email": "financeiro@fornecedor.com.br",
  "telefone": "77999999999"
}
```

---

### GET /contratos

Lista todos os contratos vinculados ao fornecedor autenticado. Retorna apenas contratos onde o fornecedor e o contratado.

**Request**:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/contratos" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

**Response 200** (array):

```json
[
  {
    "id": "a662ca03-1476-4abf-9939-cbcad6298927",
    "numero_contrato": "049/2023 2 AD",
    "objeto": "Prestacao de servicos especializados",
    "tipo": "CONTINUADO",
    "modalidade_execucao": "MEDICAO",
    "valor_global": 36789.73,
    "data_vigencia_inicio": "2026-01-01",
    "data_vigencia_fim": "2026-12-31",
    "status": "VIGENTE",
    "numero_processo": "001/2026"
  }
]
```

---

### GET /contratos/:id

Retorna detalhes completos do contrato, incluindo itens do cronograma e ultimas medicoes.

**Parametros**:

| Param | Tipo | Local | Descricao |
| --- | --- | --- | --- |
| `id` | string (UUID) | path | UUID do contrato |

**Request**:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/contratos/$CONTRACT_ID" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

**Response 200**:

```json
{
  "id": "a662ca03-1476-4abf-9939-cbcad6298927",
  "numero_contrato": "049/2023 2 AD",
  "objeto": "Prestacao de servicos especializados",
  "tipo": "CONTINUADO",
  "modalidade_execucao": "MEDICAO",
  "valor_global": 36789.73,
  "valor_executado_anterior": 15000.00,
  "saldo_disponivel": 21789.73,
  "data_vigencia_inicio": "2026-01-01",
  "data_vigencia_fim": "2026-12-31",
  "status": "VIGENTE",
  "numero_processo": "001/2026",
  "etapas": [
    {
      "id": "uuid-etapa",
      "numero_etapa": 1,
      "descricao": "Etapa 1",
      "valor_previsto": 36789.73,
      "percentual_executado": 40.77
    }
  ],
  "itens_cronograma": [
    {
      "id": "742b9fb0-4372-4740-8d53-1fc05e3e61bd",
      "numero_item": 1,
      "descricao": "Servico mensal",
      "unidade_medida": "MES",
      "quantidade": 12,
      "quantidade_medida": 4,
      "saldo_quantidade": 8,
      "valor_unitario": 1000.00,
      "valor_total": 12000.00
    }
  ],
  "ultimas_medicoes": [
    {
      "id": "uuid-medicao",
      "numero_medicao": 4,
      "periodo_inicio": "2026-04-01",
      "periodo_fim": "2026-04-30",
      "valor_medido": 36789.73,
      "status": "APROVADA",
      "data_submissao": "2026-04-28",
      "nota_fiscal_numero": "12345"
    }
  ]
}
```

**Importante**: Use `itens_cronograma[].id` como `item_cronograma_id` ao criar medicoes para contratos por item/quantidade.

---

### POST /contratos/:id/medicoes

Cria uma medicao para o contrato. A medicao e criada com status `RASCUNHO`. Se `enviar_imediatamente: true` for enviado, a medicao e criada e submetida ao fiscal em uma unica chamada.

**Parametros**:

| Param | Tipo | Local | Descricao |
| --- | --- | --- | --- |
| `id` | string (UUID) | path | UUID do contrato |

**Body** (JSON):

| Campo | Tipo | Obrigatorio | Descricao |
| --- | --- | --- | --- |
| `periodo_inicio` | string (YYYY-MM-DD) | sim | Inicio do periodo da medicao |
| `periodo_fim` | string (YYYY-MM-DD) | sim | Fim do periodo da medicao |
| `nota_fiscal_numero` | string | nao | Numero da nota fiscal |
| `nota_fiscal_valor` | number | nao | Valor da nota fiscal |
| `nota_fiscal_data` | string (YYYY-MM-DD) | nao | Data de emissao da nota fiscal |
| `valor_medido` | number | nao | Valor medido no periodo. Obrigatorio para contratos mensais/continuados |
| `itens` | array | condicional | Obrigatorio para contratos por item/quantidade. Veja abaixo |
| `discriminacoes` | array | nao | Composicao financeira da despesa. Veja abaixo |
| `observacoes` | string | nao | Observacoes do boletim de medicao |
| `enviar_imediatamente` | boolean | nao | Se true, cria e submete a medicao ao fiscal em uma unica chamada |

**Itens do cronograma** (obrigatorio para contratos por item/quantidade):

| Campo | Tipo | Obrigatorio | Descricao |
| --- | --- | --- | --- |
| `item_cronograma_id` | string (UUID) | sim | ID do item do cronograma (obtido em `GET /contratos/:id`) |
| `quantidade_medida` | number | sim | Quantidade medida no periodo |

**Discriminacoes da despesa** (opcional, composicao financeira do boletim):

| Campo | Tipo | Obrigatorio | Descricao |
| --- | --- | --- | --- |
| `descricao` | string | sim | Nome da despesa (ex: "ISS", "Servicos", "Materiais") |
| `percentual` | number | nao | Percentual sobre o valor bruto. Se informado, o valor e calculado automaticamente |
| `valor` | number | nao | Valor absoluto em reais. Usado quando nao ha percentual |

Se `percentual` for informado, o sistema calcula o valor a partir de `nota_fiscal_valor` ou `valor_medido`. Se apenas `valor` for informado, o percentual e derivado automaticamente.

**Exemplo - contrato mensal/continuado**:

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
    "discriminacoes": [
      { "descricao": "ISS", "percentual": 2 },
      { "descricao": "Despesas Operacionais", "percentual": 48 },
      { "descricao": "Servicos", "percentual": 50 }
    ],
    "observacoes": "Servico executado conforme contrato."
  }'
```

**Exemplo - contrato por item/quantidade**:

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/contratos/$CONTRACT_ID/medicoes" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "periodo_inicio": "2026-04-01",
    "periodo_fim": "2026-04-30",
    "itens": [
      {
        "item_cronograma_id": "742b9fb0-4372-4740-8d53-1fc05e3e61bd",
        "quantidade_medida": 1
      }
    ],
    "discriminacoes": [
      { "descricao": "ISS", "percentual": 2 },
      { "descricao": "Despesas Operacionais", "percentual": 48 },
      { "descricao": "Servicos", "percentual": 50 }
    ]
  }'
```

**Response 200**:

```json
{
  "id": "974135df-7f40-4c9b-8926-07a546c26c12",
  "numero_medicao": 4,
  "status": "RASCUNHO",
  "valor_medido": 36789.73,
  "periodo_inicio": "2026-04-01",
  "periodo_fim": "2026-04-30"
}
```

Se `enviar_imediatamente: true` foi usado, o status sera `SUBMETIDA` e a resposta incluira `codigo_validacao` e `mensagem`.

---

### POST /medicoes/:id/documentos

Anexa um documento (nota fiscal, documento ou foto) a uma medicao. A medicao deve estar com status `RASCUNHO`, `DEVOLVIDA` ou `PARCIALMENTE_ATESTADA`.

**Parametros**:

| Param | Tipo | Local | Descricao |
| --- | --- | --- | --- |
| `id` | string (UUID) | path | UUID da medicao |

**Body** (multipart/form-data):

| Campo | Tipo | Obrigatorio | Descricao |
| --- | --- | --- | --- |
| `file` | binary | sim | Arquivo (PDF, JPG ou PNG, ate 10 MB) |
| `tipo` | string | sim | `NOTA_FISCAL`, `DOCUMENTO` ou `FOTO` |
| `descricao` | string | nao | Descricao do anexo |

**Request**:

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/medicoes/$MEASUREMENT_ID/documentos" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -F "tipo=NOTA_FISCAL" \
  -F "descricao=Nota fiscal de abril" \
  -F "file=@./nota-fiscal.pdf"
```

**Response 200**:

```json
{
  "id": "uuid-anexo",
  "url": "/uploads/medicoes/uuid-medicao/1234567890-arquivo.pdf",
  "nome_original": "nota-fiscal.pdf",
  "tipo": "DOCUMENTO"
}
```

---

### POST /medicoes/:id/enviar

Submete a medicao ao fiscal para ateste. A medicao deve estar com status `RASCUNHO`.

Ao submeter via API, o sistema gera automaticamente uma **assinatura digital** em nome do fornecedor autenticado. A API Key funciona como equivalente funcional ao token OTP usado no portal web — quem possui a chave tem controle exclusivo da conta do fornecedor.

**Como funciona a assinatura via API**:

1. A requisicao e autenticada pela API Key (header `X-Api-Key`)
2. O sistema cria um registro de `AssinaturaDigital` com os dados do fornecedor
3. E gerado um `codigo_validacao` de 16 caracteres, retornado na resposta
4. O boletim de medicao (PDF) inclui a assinatura com codigo de validacao e QR Code para verificacao publica

**Rastro de auditoria**: A assinatura registra `usuario_cargo` como `"Assinatura via API Key - A3B5C7D9***"` (prefixo da chave), `user_agent` como `"portaldcp-api/1.0"` e `ip_address` como nulo (requisicoes server-to-server nao tem IP confiavel).

**Validacao juridica**: O `codigo_validacao` pode ser verificado publicamente em `https://portaldcp.com.br/validar-documento`. O PDF do boletim inclui dados do assinante, data/hora, codigo de validacao, QR Code e hash SHA-256 do documento.

**Parametros**:

| Param | Tipo | Local | Descricao |
| --- | --- | --- | --- |
| `id` | string (UUID) | path | UUID da medicao |

**Request**:

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/medicoes/$MEASUREMENT_ID/enviar" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

**Response 200**:

```json
{
  "id": "974135df-7f40-4c9b-8926-07a546c26c12",
  "numero_medicao": 4,
  "status": "SUBMETIDA",
  "valor_medido": 36789.73,
  "data_submissao": "2026-04-28T19:00:00.000Z",
  "codigo_validacao": "A3B5C7D9E1F2G4H6",
  "mensagem": "Medicao submetida com sucesso. Aguardando ateste do fiscal."
}
```

---

### GET /medicoes/:id

Consulta o status e dados de uma medicao.

**Parametros**:

| Param | Tipo | Local | Descricao |
| --- | --- | --- | --- |
| `id` | string (UUID) | path | UUID da medicao |

**Request**:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/medicoes/$MEASUREMENT_ID" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

**Response 200**:

```json
{
  "id": "974135df-7f40-4c9b-8926-07a546c26c12",
  "numero_medicao": 4,
  "contrato_id": "a662ca03-1476-4abf-9939-cbcad6298927",
  "periodo_inicio": "2026-04-01",
  "periodo_fim": "2026-04-30",
  "valor_medido": 36789.73,
  "nota_fiscal_numero": "12345",
  "nota_fiscal_valor": 36789.73,
  "status": "SUBMETIDA",
  "data_submissao": "2026-04-28T19:00:00.000Z",
  "data_aprovacao": null,
  "motivo_devolucao": null,
  "observacoes": "Servico executado conforme contrato."
}
```

**Status possiveis da medicao**: `RASCUNHO`, `SUBMETIDA`, `PARCIALMENTE_ATESTADA`, `ATESTADA`, `APROVADA`, `DEVOLVIDA`, `REJEITADA`.

---

### GET /medicoes/:id/documentos

Lista os anexos de uma medicao.

**Parametros**:

| Param | Tipo | Local | Descricao |
| --- | --- | --- | --- |
| `id` | string (UUID) | path | UUID da medicao |

**Request**:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/medicoes/$MEASUREMENT_ID/documentos" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

---

### GET /medicoes/:id/boletim-pdf

Download do boletim de medicao em PDF. O PDF e gerado automaticamente se ainda nao existir (inclui assinaturas digitais, codigo de validacao e QR Code). Disponivel para medicoes com status `SUBMETIDA` ou superior.

**Parametros**:

| Param | Tipo | Local | Descricao |
| --- | --- | --- | --- |
| `id` | string (UUID) | path | UUID da medicao |

**Request**:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/medicoes/$MEASUREMENT_ID/boletim-pdf" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -o boletim_medicao.pdf
```

**Response**: Arquivo PDF binario com header `Content-Type: application/pdf` e `Content-Disposition: attachment; filename="boletim_medicao_N.pdf"`.

---

### GET /ordens

Lista ordens de fornecimento vinculadas ao fornecedor autenticado.

**Query params opcionais**:

| Param | Tipo | Descricao |
| --- | --- | --- |
| `status` | string | Filtrar por status: `ENVIADA`, `EM_ATENDIMENTO`, `ENTREGUE`, `CANCELADA` |
| `contratoId` | string (UUID) | Filtrar por contrato |

**Request**:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens?status=ENVIADA&contratoId=$CONTRACT_ID" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

**Response 200** (array):

```json
[
  {
    "id": "9b42a246-22b4-4c1d-9cfd-7f1462ed778e",
    "numero": "OF-0001/2026",
    "status": "ENVIADA",
    "tipo": "FORNECIMENTO",
    "valor_total": 1500.00
  }
]
```

---

### GET /ordens/:id

Consulta detalhes de uma ordem de fornecimento.

**Parametros**:

| Param | Tipo | Local | Descricao |
| --- | --- | --- | --- |
| `id` | string (UUID) | path | UUID da ordem |

**Request**:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

---

### POST /ordens/:id/ciencia-recebimento

Registra ciencia de recebimento da ordem pelo fornecedor. A ordem deve estar com status `ENVIADA`.

**Parametros**:

| Param | Tipo | Local | Descricao |
| --- | --- | --- | --- |
| `id` | string (UUID) | path | UUID da ordem |

**Body**:

| Campo | Tipo | Obrigatorio | Descricao |
| --- | --- | --- | --- |
| `observacao` | string | nao | Observacao sobre o recebimento |

**Request**:

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID/ciencia-recebimento" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"observacao":"Ordem recebida."}'
```

---

### POST /ordens/:id/ciencia-entrega

Registra ciencia de entrega da ordem pelo fornecedor. A ordem deve estar com status `EM_ATENDIMENTO`.

**Parametros**:

| Param | Tipo | Local | Descricao |
| --- | --- | --- | --- |
| `id` | string (UUID) | path | UUID da ordem |

**Body**:

| Campo | Tipo | Obrigatorio | Descricao |
| --- | --- | --- | --- |
| `data_entrega` | string (YYYY-MM-DD) | sim | Data em que a entrega foi realizada |
| `observacao` | string | nao | Observacao sobre a entrega |

**Request**:

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID/ciencia-entrega" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"data_entrega":"2026-04-28","observacao":"Entrega realizada."}'
```

---

### POST /ordens/:id/nota-fiscal

Envia nota fiscal para uma ordem de fornecimento. Exige pelo menos um arquivo XML e um PDF.

**Parametros**:

| Param | Tipo | Local | Descricao |
| --- | --- | --- | --- |
| `id` | string (UUID) | path | UUID da ordem |

**Body** (multipart/form-data):

| Campo | Tipo | Obrigatorio | Descricao |
| --- | --- | --- | --- |
| `arquivos` | binary[] | sim | Pelo menos 1 XML e 1 PDF. Aceita tambem JPG e PNG. Ate 15 MB por arquivo, maximo 10 arquivos |

**Request**:

```bash
curl -sS -X POST "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID/nota-fiscal" \
  -H "X-Api-Key: $PORTALDCP_API_KEY" \
  -F "arquivos=@./nota.xml" \
  -F "arquivos=@./nota.pdf"
```

---

### GET /ordens/:id/nota-fiscal

Retorna a nota fiscal mais recente da ordem.

**Request**:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID/nota-fiscal" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

---

### GET /ordens/:id/notas-fiscais

Lista todas as notas fiscais de uma ordem.

**Request**:

```bash
curl -sS "https://compras.cmlem.ba.gov.br/api/ext/v1/ordens/$ORDER_ID/notas-fiscais" \
  -H "X-Api-Key: $PORTALDCP_API_KEY"
```

---

## Erros

Todos os erros seguem o formato:

```json
{
  "message": "Descricao do erro",
  "error": "Bad Request",
  "statusCode": 400
}
```

| Status | Motivo comum |
| --- | --- |
| 400 | Campo obrigatorio ausente, data invalida, arquivo invalido ou regra de negocio violada |
| 401 | Header `X-Api-Key` ausente, invalido ou revogado |
| 403 | Contrato, medicao ou ordem nao pertence ao fornecedor autenticado |
| 404 | Recurso nao encontrado |

## MCP legado

O endpoint MCP (Model Context Protocol) continua ativo para compatibilidade:

```text
https://compras.cmlem.ba.gov.br/api/mcp/sse?api_key=SUA_CHAVE
```

Novas integracoes devem preferir a API REST `/api/ext/v1`, pois ela evita chave na URL, possui Swagger interativo e e mais simples de testar com curl ou qualquer cliente HTTP.
