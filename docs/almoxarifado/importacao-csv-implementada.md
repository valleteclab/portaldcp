# Importação de Contratos via CSV - IMPLEMENTADO

## Listagem Empenhado e Não Pago → Excel

Para converter o PDF "Listagem de Empenhado e Não Pago" em Excel:
1. Instale: `pip install pypdf openpyxl`
2. Execute: `python docs/almoxarifado/pdf_empenho_to_excel.py`
3. O Excel será gerado no mesmo diretório do PDF

## ✅ Status: Implementado e Pronto para Uso

## Formato CSV Aceito

O sistema aceita CSV no formato exportado do sistema antigo:

```csv
Ítem,Descrição,Marca,Und,Preço R$,Qtdade,Valor Inicial R$,Saída,Saída R$,Qtdade Atual,Valor R$
,PENDRIVE 32 GB...,SANDISK,,25.00,40.00,1000.00,40.00,1000.00,0.00,0.00
```

### Campos Utilizados
- ✅ **Descrição**: Obrigatório
- ✅ **Marca**: Opcional (salvo em observações)
- ✅ **Und**: Unidade de medida (normalizada automaticamente)
- ✅ **Preço R$**: Valor unitário
- ✅ **Qtdade**: Quantidade contratada
- ✅ **Valor Inicial R$**: Valor total do item

### Campos Ignorados (não importados)
- ❌ Saída
- ❌ Saída R$
- ❌ Qtdade Atual
- ❌ Valor R$

## Endpoint da API

```
POST /api/almoxarifado/migracao/contratos/importar-csv
```

### Headers
```
Content-Type: multipart/form-data
Authorization: Bearer {token}
```

### Body (Form Data)
- `arquivo`: Arquivo CSV (máximo 10MB)
- `numero_contrato`: string (ex: "31/2025")
- `ano`: number (ex: 2025)
- `fornecedor_cnpj`: string (ex: "12345678000190")
- `fornecedor_razao_social`: string
- `valor_inicial`: number (valor total do contrato)
- `licitacao_numero`: string (opcional)
- `objeto`: string (opcional)
- `data_assinatura`: string ISO date (opcional)
- `data_vigencia_inicio`: string ISO date (opcional)
- `data_vigencia_fim`: string ISO date (opcional)

### Resposta de Sucesso

```json
{
  "sucesso": true,
  "mensagem": "Contrato 31/2025 importado com sucesso",
  "contrato_id": "uuid-do-contrato",
  "estatisticas": {
    "total_itens": 14,
    "itens_importados": 14,
    "itens_com_erro": 0,
    "erros": []
  }
}
```

### Resposta com Erros

```json
{
  "sucesso": true,
  "mensagem": "Contrato importado com avisos",
  "contrato_id": "uuid-do-contrato",
  "estatisticas": {
    "total_itens": 14,
    "itens_importados": 12,
    "itens_com_erro": 2,
    "erros": [
      {
        "linha": 5,
        "campo": "Preço R$",
        "mensagem": "Preço inválido",
        "valor": "abc"
      }
    ]
  }
}
```

## Funcionalidades Implementadas

### 1. Parser CSV Inteligente
- ✅ Detecta automaticamente colunas pelo cabeçalho
- ✅ Suporta vírgulas dentro de aspas
- ✅ Normaliza encoding (UTF-8)
- ✅ Trata valores monetários com vírgula

### 2. Normalização de Unidades
- ✅ Converte unidades comuns para enum:
  - UN, UNIDADE, UNID → UNIDADE
  - CAIXA, CX → CAIXA
  - METRO, M → METRO
  - E mais...

### 3. Criação Automática de Fornecedor
- ✅ Se fornecedor não existe, cria automaticamente
- ✅ Status: APROVADO (para migração)
- ✅ Busca por CNPJ limpo (sem formatação)

### 4. Validações
- ✅ Descrição obrigatória
- ✅ Preço > 0
- ✅ Quantidade > 0
- ✅ Valores numéricos válidos
- ✅ Relatório de erros por linha

### 5. Transação Segura
- ✅ Tudo ou nada (rollback em caso de erro)
- ✅ Cria contrato e itens em lote
- ✅ Saldo disponível = quantidade contratada (inicial)

## Exemplo de Uso

### cURL

```bash
curl -X POST \
  http://localhost:3000/api/almoxarifado/migracao/contratos/importar-csv \
  -H "Authorization: Bearer {token}" \
  -F "arquivo=@import.csv" \
  -F "numero_contrato=31/2025" \
  -F "ano=2025" \
  -F "fornecedor_cnpj=12345678000190" \
  -F "fornecedor_razao_social=VALLETECLAB SOLUÇÕES EM SISTEMAS EIRELI" \
  -F "valor_inicial=97090.00"
```

### JavaScript/TypeScript

```typescript
const formData = new FormData();
formData.append('arquivo', fileInput.files[0]);
formData.append('numero_contrato', '31/2025');
formData.append('ano', '2025');
formData.append('fornecedor_cnpj', '12345678000190');
formData.append('fornecedor_razao_social', 'VALLETECLAB SOLUÇÕES EM SISTEMAS EIRELI');
formData.append('valor_inicial', '97090.00');

const response = await fetch('/api/almoxarifado/migracao/contratos/importar-csv', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
  },
  body: formData,
});

const resultado = await response.json();
console.log(resultado);
```

## Próximos Passos

1. ✅ Backend implementado
2. ⏳ Criar interface web para upload
3. ⏳ Adicionar preview dos dados antes de importar
4. ⏳ Permitir correção manual de erros na interface

## Arquivos Criados

- `backend/src/almoxarifado/migracao-contratos.service.ts` - Serviço de importação
- `backend/src/almoxarifado/dto/migracao-contrato.dto.ts` - DTO de validação
- Endpoint adicionado em `almoxarifado.controller.ts`
