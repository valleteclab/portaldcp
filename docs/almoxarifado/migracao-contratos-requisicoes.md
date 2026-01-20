# Sistema de Migração de Contratos e Requisições

## Visão Geral

Sistema completo para migração de dados históricos de contratos e requisições (pedidos) de outro sistema para o PortalDCP. Suporta múltiplos formatos de entrada e validação robusta de dados.

## Opções de Migração

### 1. **Importação via Interface Web (Recomendada para volumes médios)**

**Quando usar:**
- Migração de até 10.000 registros
- Dados precisam de revisão antes da importação
- Usuários não técnicos precisam executar a migração

**Características:**
- Upload de arquivo CSV/Excel
- Preview dos dados antes da importação
- Validação em tempo real
- Correção de erros antes da importação
- Relatório detalhado de sucesso/erros

**Formato CSV Esperado:**

#### Contratos (contratos.csv)
```csv
numero_contrato,ano,fornecedor_cnpj,fornecedor_razao_social,tipo,categoria,status,objeto,valor_inicial,data_assinatura,data_vigencia_inicio,data_vigencia_fim,numero_processo,licitacao_numero
001/2024,2024,12345678000190,Empresa ABC Ltda,CONTRATO,COMPRAS,VIGENTE,Fornecimento de materiais,50000.00,2024-01-15,2024-01-15,2024-12-31,2024/001,001/2024
```

#### Itens de Contrato (itens_contrato.csv)
```csv
contrato_numero,numero_item,descricao,unidade_medida,quantidade_contratada,valor_unitario,valor_total,codigo_catalogo
001/2024,1,Material de escritório,UNIDADE,100,50.00,5000.00,CATMAT-001
001/2024,2,Papel A4,CAIXA,50,30.00,1500.00,CATMAT-002
```

#### Requisições (requisicoes.csv)
```csv
numero,ano,contrato_numero,usuario_solicitante_email,setor,prioridade,tipo,status,data_solicitacao,observacoes
REQ-001/2024,2024,001/2024,joao@orgao.gov.br,Almoxarifado,NORMAL,MATERIAL,AUTORIZADA,2024-02-01,Solicitação urgente
```

#### Itens de Requisição (itens_requisicao.csv)
```csv
requisicao_numero,numero_item,item_contrato_numero,descricao,unidade_medida,quantidade_solicitada,quantidade_autorizada,valor_unitario
REQ-001/2024,1,001/2024-1,Material de escritório,UNIDADE,10,10,50.00
REQ-001/2024,2,001/2024-2,Papel A4,CAIXA,5,5,30.00
```

### 2. **Importação via API REST (Recomendada para integração)**

**Quando usar:**
- Integração com outro sistema via API
- Migração automatizada
- Dados já validados no sistema origem

**Endpoints:**

```typescript
POST /api/almoxarifado/migracao/contratos
POST /api/almoxarifado/migracao/requisicoes
POST /api/almoxarifado/migracao/itens-contrato
POST /api/almoxarifado/migracao/itens-requisicao
```

**Exemplo de Payload:**

```json
{
  "contratos": [
    {
      "numero_contrato": "001/2024",
      "ano": 2024,
      "fornecedor_cnpj": "12345678000190",
      "fornecedor_razao_social": "Empresa ABC Ltda",
      "tipo": "CONTRATO",
      "categoria": "COMPRAS",
      "status": "VIGENTE",
      "objeto": "Fornecimento de materiais",
      "valor_inicial": 50000.00,
      "data_assinatura": "2024-01-15",
      "data_vigencia_inicio": "2024-01-15",
      "data_vigencia_fim": "2024-12-31",
      "itens": [
        {
          "numero_item": 1,
          "descricao": "Material de escritório",
          "unidade_medida": "UNIDADE",
          "quantidade_contratada": 100,
          "valor_unitario": 50.00,
          "valor_total": 5000.00
        }
      ]
    }
  ]
}
```

### 3. **Script CLI para Migração em Massa (Recomendada para grandes volumes)**

**Quando usar:**
- Migração de mais de 10.000 registros
- Migração única de histórico completo
- Dados já validados e limpos

**Uso:**

```bash
npm run migrate:contratos -- --arquivo=contratos.json --orgao-id=uuid
npm run migrate:requisicoes -- --arquivo=requisicoes.json --orgao-id=uuid
```

## Validações Implementadas

### Contratos
- ✅ Fornecedor deve existir no sistema (ou será criado automaticamente)
- ✅ CNPJ válido e formatado
- ✅ Datas válidas (vigência fim > vigência início)
- ✅ Valores positivos
- ✅ Tipo e categoria válidos
- ✅ Status válido
- ✅ Número de contrato único por órgão/ano

### Itens de Contrato
- ✅ Contrato deve existir
- ✅ Quantidades e valores positivos
- ✅ Unidade de medida válida
- ✅ Saldo disponível calculado corretamente

### Requisições
- ✅ Contrato deve existir e estar vigente
- ✅ Usuário solicitante deve existir
- ✅ Status válido
- ✅ Datas válidas
- ✅ Número de requisição único por órgão/ano

### Itens de Requisição
- ✅ Requisição deve existir
- ✅ Item de contrato deve existir
- ✅ Quantidade solicitada <= saldo disponível do contrato
- ✅ Valores consistentes

## Fluxo de Importação

```
1. Upload/Envio dos dados
   ↓
2. Validação de formato e estrutura
   ↓
3. Validação de regras de negócio
   ↓
4. Preview/Confirmação (interface web)
   ↓
5. Importação em lote (transação)
   ↓
6. Relatório de resultado
```

## Tratamento de Erros

### Erros Críticos (bloqueiam importação)
- Formato de arquivo inválido
- Dados obrigatórios faltando
- Relacionamentos inválidos (contrato não existe, etc)
- Violação de constraints do banco

### Avisos (permitem importação com ajustes)
- Fornecedor não existe (será criado automaticamente)
- Usuário não existe (será criado ou ignorado)
- Valores inconsistentes (serão ajustados)
- Datas no futuro/passado (serão ajustadas)

## Relatório de Importação

```json
{
  "sucesso": true,
  "estatisticas": {
    "total_registros": 1000,
    "importados": 950,
    "erros": 30,
    "avisos": 20
  },
  "erros": [
    {
      "linha": 15,
      "campo": "fornecedor_cnpj",
      "mensagem": "CNPJ inválido",
      "valor": "123456789"
    }
  ],
  "avisos": [
    {
      "linha": 20,
      "tipo": "FORNECEDOR_NAO_EXISTE",
      "mensagem": "Fornecedor será criado automaticamente",
      "acao": "CRIADO"
    }
  ]
}
```

## Recomendações por Cenário

### Cenário 1: Migração Completa de Histórico
**Recomendação:** Script CLI
- Mais rápido para grandes volumes
- Menos overhead de validação em tempo real
- Permite processamento em background

### Cenário 2: Migração Incremental
**Recomendação:** API REST
- Integração automatizada
- Validação em tempo real
- Notificações de sucesso/erro

### Cenário 3: Migração Manual com Revisão
**Recomendação:** Interface Web
- Preview antes de importar
- Correção de erros na interface
- Relatório visual

## Próximos Passos

1. Implementar serviço de migração no backend
2. Criar interface web de importação
3. Criar endpoints de API REST
4. Criar script CLI para migração em massa
5. Documentar formatos de arquivo esperados
6. Criar templates de exemplo
