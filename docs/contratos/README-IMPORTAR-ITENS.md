# Importar Itens de Contrato

## Extrato de Contrato (PDF)

O script `extrair_itens_extrato_pdf.py` extrai itens de um PDF de Extrato de Contrato e gera JSON para importação.

### Uso

```bash
# Usando Python do sistema
python docs/contratos/extrair_itens_extrato_pdf.py "docs/contratos/Extrato de Contrato_xxx.pdf"

# Com venv (se existir)
venv/bin/python docs/contratos/extrair_itens_extrato_pdf.py "docs/contratos/Extrato de Contrato_xxx.pdf"

# Salvar em arquivo específico
python docs/contratos/extrair_itens_extrato_pdf.py extrato.pdf --output itens.json
```

### Dependência

- `pypdf` ou `PyPDF2`: `pip install pypdf`

### Saída

- Gera arquivo `{nome_do_pdf}.itens.json` no mesmo diretório
- Formato: `{ "itens": [ { "numero_item", "descricao", "marca", "unidade_medida", "valor_unitario", "quantidade_contratada" }, ... ] }`

### Importar no sistema

1. Acesse o contrato no portal
2. Use a funcionalidade de importar itens (se disponível)
3. Ou envie via API:

```bash
curl -X POST "https://seu-dominio/api/almoxarifado/contratos/{contratoId}/itens/importar" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d @extrato.itens.json
```

## Formato esperado do Extrato (PDF)

O script reconhece o padrão:
- Linha de valores: `0,00  0,00  [Preço] [Qtd]  [Marca]  [Valor Total]  UNIDA`
- Descrição: texto acima da linha de valores
