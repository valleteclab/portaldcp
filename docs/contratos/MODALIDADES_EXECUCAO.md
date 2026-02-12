# Modalidades de Execução de Contratos

## Visão Geral

Contratos públicos possuem diferentes formas de execução e pagamento. O sistema precisa suportar cada modalidade com controles específicos.

## Modalidades

### 1. ITEM_QUANTIDADE (já implementado)
- **Uso:** Compras de materiais, bens permanentes
- **Controle:** Itens com quantidade contratada × valor unitário
- **Pagamento:** Por entrega de itens
- **Fluxo:** Requisição → Ordem de Fornecimento → Recebimento → Pagamento
- **Exemplo:** 500 resmas de papel A4 × R$ 25,00

### 2. MEDICAO (Obras e Engenharia)
- **Uso:** Obras, reformas, serviços de engenharia, manutenção predial
- **Controle:** Cronograma físico-financeiro com etapas
- **Pagamento:** Por medição do fiscal (% executado da etapa)
- **Fluxo:** Etapa planejada → Execução → Medição pelo fiscal → Boletim de Medição → Pagamento
- **Exemplo:** Construção de escola - Etapa 1: Fundação (15%) = R$ 150.000

#### Entidades:
- **EtapaCronograma**: Etapas do cronograma físico-financeiro
  - numero_etapa, descricao, percentual_fisico, valor_previsto
  - data_inicio_prevista, data_fim_prevista
  - status (PENDENTE, EM_EXECUCAO, MEDIDA, PAGA)

- **Medicao**: Boletim de Medição
  - numero_medicao, periodo_inicio, periodo_fim
  - valor_medido, valor_acumulado_anterior, valor_acumulado_atual
  - percentual_fisico_medido
  - fiscal_id, fiscal_nome, data_medicao
  - status (RASCUNHO, AGUARDANDO_APROVACAO, APROVADA, REJEITADA, PAGA)
  - observacoes, fotos/documentos

- **ItemMedicao**: Itens/etapas medidos em cada medição
  - etapa_id, percentual_executado, valor_medido

#### Fundamentação Legal:
- Lei 14.133/2021, Art. 134: Cronograma físico-financeiro
- Lei 14.133/2021, Art. 140, I: Recebimento provisório pelo fiscal

### 3. CONTINUADO (Serviços Contínuos)
- **Uso:** Limpeza, vigilância, manutenção, telefonia
- **Controle:** Atestação mensal de execução
- **Pagamento:** Mensal, após atestação do fiscal
- **Fluxo:** Mês de referência → Fiscal atesta → Aplica IMR/glosas → Pagamento
- **Exemplo:** Serviço de limpeza - R$ 15.000/mês × 12 meses

#### Entidades:
- **AtestacaoMensal**: Atestação mensal do fiscal
  - mes_referencia (YYYY-MM), valor_mensal_contratado
  - valor_atestado, valor_glosa, valor_liquido
  - nota_imr (0-100), criterios_imr (JSON)
  - fiscal_id, fiscal_nome, data_atestacao
  - status (PENDENTE, ATESTADA, GLOSADA, PAGA)
  - observacoes

- **GlosaServico**: Glosas aplicadas
  - atestacao_id, descricao, valor_glosa
  - fundamentacao (cláusula contratual)
  - aceita_fornecedor (boolean)

#### Fundamentação Legal:
- Lei 14.133/2021, Art. 106, §3º: Instrumento de Medição de Resultado (IMR)
- IN SEGES/ME nº 5/2017, Art. 47: Fiscalização de serviços contínuos

### 4. LICENCA (Software/Assinatura)
- **Uso:** Licenças de software, SaaS, assinaturas
- **Controle:** Quantidade de licenças × período × valor
- **Pagamento:** Periódico (mensal/anual)
- **Fluxo:** Ativação → Controle de uso → Renovação → Pagamento periódico
- **Exemplo:** 50 licenças Microsoft 365 × R$ 50/mês

#### Entidades:
- **LicencaControle**: Controle de licenças
  - descricao, tipo_licenca (USUARIO, DISPOSITIVO, SITE, VOLUME)
  - quantidade_contratada, quantidade_ativa
  - valor_unitario_mensal, valor_unitario_anual
  - periodicidade_pagamento (MENSAL, TRIMESTRAL, SEMESTRAL, ANUAL)
  - data_ativacao, data_expiracao
  - chave_licenca (criptografada), fornecedor_contato
  - status (ATIVA, SUSPENSA, EXPIRADA, CANCELADA)

- **PagamentoLicenca**: Registro de pagamentos periódicos
  - licenca_id, periodo_referencia
  - valor_pago, data_pagamento
  - nota_fiscal, comprovante

#### Fundamentação Legal:
- Lei 14.133/2021, Art. 75, XVI: Contratação de software
- Decreto 10.024/2019: Pregão eletrônico para TIC

### 5. ORDEM_SERVICO (Demanda/OS)
- **Uso:** Consultoria, fábrica de software, serviços sob demanda
- **Controle:** Ordens de Serviço com escopo, prazo e valor
- **Pagamento:** Por OS concluída e aceita
- **Fluxo:** Abertura OS → Execução → Entrega → Aceite → Pagamento
- **Exemplo:** OS-001: Desenvolver módulo X = 200 UST × R$ 150 = R$ 30.000

#### Entidades:
- **OrdemServicoContrato**: Ordem de Serviço
  - numero_os, descricao, escopo_detalhado
  - metrica (UST, HORA, PONTO_FUNCAO, DEMANDA_FIXA)
  - quantidade_metrica, valor_unitario_metrica, valor_total
  - data_abertura, data_prazo, data_entrega, data_aceite
  - responsavel_tecnico, fiscal_id
  - status (ABERTA, EM_EXECUCAO, ENTREGUE, EM_ACEITE, ACEITA, REJEITADA, PAGA, CANCELADA)
  - nivel_servico_acordado (SLA)
  - nota_qualidade (0-100)

- **BancoMetricas**: Controle de saldo de métricas (UST, horas, etc.)
  - contrato_id, metrica, quantidade_total, quantidade_consumida, saldo

#### Fundamentação Legal:
- IN SGD/ME nº 94/2022: Contratação de TIC
- Lei 14.133/2021, Art. 75, IV, "h": Serviços de TI

---

## Impacto no Contrato (entidade existente)

### Novo campo: `modalidade_execucao`
```
ITEM_QUANTIDADE    → Padrão (compras)
MEDICAO            → Obras/Engenharia
CONTINUADO         → Serviços mensais
LICENCA            → Software/SaaS
ORDEM_SERVICO      → Consultoria/Demanda
```

### Regras:
- Default: `ITEM_QUANTIDADE` (compatível com contratos existentes)
- Definido na criação do contrato
- Pode ser alterado enquanto AGUARDANDO_LIBERACAO
- Após VIGENTE, não pode mudar

### Impacto na Requisição:
- Contratos `ITEM_QUANTIDADE`: fluxo atual (selecionar itens)
- Contratos `MEDICAO`: não usa requisição, usa Medição
- Contratos `CONTINUADO`: não usa requisição, usa Atestação Mensal
- Contratos `LICENCA`: não usa requisição, usa controle de licenças
- Contratos `ORDEM_SERVICO`: não usa requisição, usa Ordem de Serviço

---

## Ordem de Implementação

1. **Migration**: Adicionar `modalidade_execucao` ao contrato + criar tabelas
2. **Entidades**: TypeORM para cada modalidade
3. **Services**: CRUD + lógica de negócio para cada modalidade
4. **Controllers**: Endpoints REST
5. **Frontend - Contrato**: Aba dinâmica conforme modalidade
6. **Frontend - Medição**: Tela de cronograma + boletim de medição
7. **Frontend - Continuado**: Tela de atestação mensal + IMR
8. **Frontend - Licença**: Tela de controle de licenças
9. **Frontend - OS**: Tela de ordens de serviço
