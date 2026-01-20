# Migração de Extrato de Contrato (PDF)

## Análise do Documento

O extrato de contrato em PDF contém:

### Dados do Contrato
- Número do contrato: `31/2025`
- Licitação: `16/2025`
- Fornecedor: `VALLETECLAB SOLUÇÕES EM SISTEMAS EIRELI`
- Valor total inicial: `97.090,00`
- Valor total de saídas: `83.990,00`
- Saldo do contrato: `13.100,00`

### Dados dos Itens (Tabela)
Cada item contém:
- **Descrição**: Texto completo da especificação
- **Marca**: Ex: SANDISK, HP, LEXMARK, DELL, LENOVO, ACASIS
- **Unidade**: Ex: UNIDADE, UNIDA DE (erro de digitação)
- **Preço R$**: Valor unitário (ex: 25,00)
- **Qtdade**: Quantidade contratada (ex: 40,00)
- **Valor Inicial R$**: Valor total do item (ex: 1.000,00)
- **Saída**: Quantidade já utilizada (NÃO importar agora)
- **Saída R$**: Valor já utilizado (NÃO importar agora)
- **Qtdade Atual**: Saldo disponível (NÃO importar agora)
- **Valor R$**: Valor do saldo (NÃO importar agora)

## Estratégia de Migração

### Opção 1: Parser Automático de PDF (RECOMENDADA)

**Vantagens:**
- Extração automática dos dados da tabela
- Menos trabalho manual
- Validação automática

**Implementação:**
- Usar biblioteca `pdf-parse` ou `pdfjs-dist` para extrair texto
- Usar regex ou biblioteca de tabelas para identificar estrutura
- Mapear colunas automaticamente
- Validar e importar

**Bibliotecas necessárias:**
```bash
npm install pdf-parse pdf-table-extractor
```

### Opção 2: Exportar CSV do Sistema Antigo (MAIS SIMPLES)

**Vantagens:**
- Mais rápido e confiável
- Reutiliza código existente de importação CSV
- Menos erros de parsing

**Formato CSV esperado:**

```csv
numero_contrato,ano,licitacao_numero,fornecedor_cnpj,fornecedor_razao_social,numero_item,descricao,marca,unidade_medida,quantidade_contratada,valor_unitario,valor_total
31/2025,2025,16/2025,12345678000190,VALLETECLAB SOLUÇÕES EM SISTEMAS EIRELI,1,PENDRIVE 32 GB (USB 3.2 GEN 1)...,SANDISK,UNIDADE,40.00,25.00,1000.00
31/2025,2025,16/2025,12345678000190,VALLETECLAB SOLUÇÕES EM SISTEMAS EIRELI,2,KIT COM 04 UNIDADES DE TONER...,HP,UNIDADE,5.00,250.00,1250.00
```

### Opção 3: Interface Web com Upload de PDF

**Vantagens:**
- Usuário faz upload do PDF
- Sistema extrai dados automaticamente
- Preview antes de importar
- Correção manual se necessário

**Fluxo:**
1. Upload do PDF
2. Extração automática dos dados
3. Preview da tabela extraída
4. Validação e correção manual
5. Importação

## Recomendação Final

**Implementar Opção 3 (Interface Web + Parser PDF)** porque:
1. ✅ Mais flexível - aceita PDF direto
2. ✅ Preview permite validação antes de importar
3. ✅ Fallback para CSV se PDF não funcionar
4. ✅ Reutiliza padrão de importação existente

## Campos a Importar

### Contrato
- ✅ numero_contrato
- ✅ ano
- ✅ licitacao_numero (buscar ou criar referência)
- ✅ fornecedor_cnpj (buscar ou criar fornecedor)
- ✅ fornecedor_razao_social
- ✅ valor_inicial
- ✅ status: VIGENTE (assumir)

### Itens do Contrato
- ✅ numero_item
- ✅ descricao
- ✅ marca (salvar em observacoes ou campo específico)
- ✅ unidade_medida
- ✅ quantidade_contratada
- ✅ valor_unitario
- ✅ valor_total
- ✅ saldo_disponivel = quantidade_contratada (inicial)

### Campos NÃO Importar Agora
- ❌ Saída (quantidade)
- ❌ Saída R$ (valor)
- ❌ Qtdade Atual
- ❌ Valor R$ atual

## Próximos Passos

1. Criar serviço de parser de PDF (`pdf-extract.service.ts`)
2. Criar interface web de upload (`/orgao/almoxarifado/migracao/contratos`)
3. Criar endpoint de importação (`POST /api/almoxarifado/migracao/contratos`)
4. Validar dados antes de importar
5. Criar relatório de importação
