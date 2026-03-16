# Integração ANP - Preços de Combustíveis

## Visão geral

O sistema consulta os preços médios de combustíveis publicados pela ANP (Agência Nacional do Petróleo) para **Barreiras-BA**.

## Fontes

- **Site ANP**: https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas
- **Padrão de URL**: `https://www.gov.br/anp/.../arquivos-lpc/{ANO}/resumo_semanal_lpc_{data_inicio}_{data_fim}.xlsx`

## Endpoints

### GET /api/anp/precos/barreiras-ba

Retorna os preços da **última semana publicada** pela ANP. Faz download automático do Excel no site da ANP.

**Resposta:**
```json
{
  "municipio": "Barreiras",
  "estado": "Bahia",
  "data_inicial": "2026-03-01",
  "data_final": "2026-03-07",
  "precos": [
    {
      "produto": "ETANOL HIDRATADO",
      "unidade_medida": "R$/l",
      "preco_medio_revenda": 4.97,
      "preco_minimo_revenda": 4.95,
      "preco_maximo_revenda": 4.99,
      "numero_postos": 8,
      "data_inicial": "2026-03-01",
      "data_final": "2026-03-07"
    },
    ...
  ]
}
```

### POST /api/anp/precos/barreiras-ba/upload

**Fallback** quando o download automático falha (ex: 403 do gov.br em datacenters).

Envia a planilha Excel baixada manualmente do site da ANP.

```bash
curl -X POST -F "arquivo=@resumo_semanal_lpc_2026-03-01_2026-03-07.xlsx" \
  http://localhost:3000/api/anp/precos/barreiras-ba/upload
```

## Produtos retornados

- ETANOL HIDRATADO (R$/l)
- GASOLINA COMUM (R$/l)
- GASOLINA ADITIVADA (R$/l)
- ÓLEO DIESEL (R$/l)
- ÓLEO DIESEL S10 (R$/l)
- GLP (R$/13kg)

## Uso no módulo Frota

Os preços podem ser consumidos pelo módulo Frota para:
- Comparar com preço do contrato
- Exibir referência de mercado nas requisições de combustível
