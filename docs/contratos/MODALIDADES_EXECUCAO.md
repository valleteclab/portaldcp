# Modalidades de Execução de Contratos

## Visão Geral

Contratos públicos possuem diferentes formas de execução e controle. O sistema controla o **recebimento/atestação** de produtos e serviços e o **saldo contratual**. O pagamento é responsabilidade do setor financeiro/contabilidade (fora do escopo deste sistema).

**Nosso foco:**
- Fiscal atesta que o serviço foi prestado / produto entregue / etapa executada
- Saldo do contrato é consumido conforme atestações/medições/aceites
- Rastreabilidade: quem atestou, quando, quanto

## Modalidades

### 1. ITEM_QUANTIDADE (já implementado)
- **Uso:** Compras de materiais, bens permanentes
- **Controle:** Itens com quantidade contratada × valor unitário
- **Saldo:** Por item (quantidade contratada - empenhada - entregue)
- **Fluxo:** Requisição → Ordem de Fornecimento → Recebimento → Saldo baixado
- **Exemplo:** 500 resmas de papel A4 × R$ 25,00

### 2. MEDICAO (Obras e Engenharia)
- **Uso:** Obras, reformas, serviços de engenharia, manutenção predial
- **Controle:** Cronograma físico-financeiro com etapas
- **Saldo:** Por valor (valor_global - valor_medido_acumulado = saldo)
- **Fluxo:** Etapa planejada → Execução → Fiscal mede % executado → Aprovação → Saldo consumido
- **Exemplo:** Construção de escola - Etapa 1: Fundação (15%) = R$ 150.000

#### Entidades:
- **EtapaCronograma**: Etapas do cronograma físico-financeiro
  - numero_etapa, descricao, percentual_fisico, valor_previsto
  - data_inicio_prevista, data_fim_prevista, data_inicio_real, data_fim_real
  - percentual_executado, valor_executado
  - status (PENDENTE, EM_EXECUCAO, MEDIDA_PARCIAL, CONCLUIDA)

- **Medicao**: Boletim de Medição
  - numero_medicao, periodo_inicio, periodo_fim
  - valor_medido, valor_acumulado_anterior, valor_acumulado_atual
  - percentual_fisico_medido, percentual_fisico_acumulado
  - fiscal_id, fiscal_nome, data_medicao
  - aprovador_id, aprovador_nome, data_aprovacao
  - status (RASCUNHO, AGUARDANDO_APROVACAO, APROVADA, REJEITADA)
  - observacoes, fotos, documentos

- **ItemMedicao**: Detalhe de cada etapa medida
  - etapa_id, percentual_executado_anterior/atual/acumulado, valor_medido

#### Controle de Saldo:
- Ao APROVAR medição: `saldo_contrato -= valor_medido`
- Ao REJEITAR: saldo não é afetado
- Etapa muda para CONCLUIDA quando percentual_executado = 100%

#### Fundamentação Legal:
- Lei 14.133/2021, Art. 134: Cronograma físico-financeiro
- Lei 14.133/2021, Art. 140, I: Recebimento provisório pelo fiscal

### 3. CONTINUADO (Serviços Contínuos)
- **Uso:** Limpeza, vigilância, manutenção, telefonia
- **Controle:** Atestação mensal de execução pelo fiscal
- **Saldo:** Por valor (valor_global - soma_atestações = saldo restante)
- **Fluxo:** Mês de referência → Fiscal atesta execução → Aplica IMR/glosas → Saldo consumido
- **Exemplo:** Serviço de limpeza - R$ 15.000/mês × 12 meses = R$ 180.000

#### Entidades:
- **AtestacaoMensal**: Atestação mensal do fiscal
  - mes_referencia (YYYY-MM), valor_mensal_contratado
  - valor_atestado (quanto o fiscal atestou que foi executado)
  - valor_glosa (desconto por falhas na execução)
  - valor_liquido (atestado - glosa = valor que consome do saldo)
  - nota_imr (0-100), criterios_imr (JSON com critérios e notas)
  - fiscal_id, fiscal_nome, data_atestacao
  - status (PENDENTE, ATESTADA, ATESTADA_COM_GLOSA, REJEITADA)
  - observacoes, justificativa_glosa

#### Controle de Saldo:
- Ao ATESTAR: `saldo_contrato -= valor_liquido`
- Ao ATESTAR COM GLOSA: `saldo_contrato -= (valor_atestado - valor_glosa)`
- Ao REJEITAR: saldo não é afetado (serviço não foi prestado no mês)
- Constraint UNIQUE (contrato_id, mes_referencia): só 1 atestação por mês

#### Fundamentação Legal:
- Lei 14.133/2021, Art. 106, §3º: Instrumento de Medição de Resultado (IMR)
- IN SEGES/ME nº 5/2017, Art. 47: Fiscalização de serviços contínuos

### 4. LICENCA (Software/Assinatura)
- **Uso:** Licenças de software, SaaS, assinaturas
- **Controle:** Quantidade de licenças ativas vs. contratadas, vigência
- **Saldo:** Por quantidade (contratadas - ativas = disponíveis para ativar)
- **Fluxo:** Ativação → Controle de uso → Alerta de expiração → Renovação
- **Exemplo:** 50 licenças Microsoft 365 × R$ 600/ano

#### Entidades:
- **LicencaControle**: Controle de licenças
  - descricao, tipo_licenca (USUARIO, DISPOSITIVO, SITE, VOLUME, ASSINATURA)
  - quantidade_contratada, quantidade_ativa
  - valor_unitario, valor_total_contratado
  - periodicidade_renovacao (MENSAL, TRIMESTRAL, SEMESTRAL, ANUAL, UNICO)
  - data_ativacao, data_expiracao, data_proxima_renovacao
  - chave_licenca, fornecedor_contato, url_painel_admin
  - status (ATIVA, SUSPENSA, EXPIRADA, CANCELADA)

#### Controle de Saldo:
- Saldo = quantidade_contratada - quantidade_ativa
- Alertas automáticos quando data_expiracao se aproxima
- Status muda para EXPIRADA automaticamente após data_expiracao

#### Fundamentação Legal:
- Lei 14.133/2021, Art. 75, XVI: Contratação de software

### 5. ORDEM_SERVICO (Demanda/OS)
- **Uso:** Consultoria, fábrica de software, serviços sob demanda
- **Controle:** Ordens de Serviço com escopo, prazo e métricas
- **Saldo:** Por métricas (UST/horas/PF total - consumido = saldo)
- **Fluxo:** Abertura OS → Execução → Entrega → Fiscal aceita → Saldo consumido
- **Exemplo:** OS-001: Desenvolver módulo X = 200 UST × R$ 150 = R$ 30.000

#### Entidades:
- **OrdemServicoContrato**: Ordem de Serviço
  - numero_os, descricao, escopo_detalhado
  - metrica (UST, HORA, PONTO_FUNCAO, DEMANDA_FIXA, UNIDADE)
  - quantidade_metrica, valor_unitario_metrica, valor_total
  - data_abertura, data_prazo, data_entrega, data_aceite
  - responsavel_tecnico, fiscal_id, fiscal_nome
  - nota_qualidade (0-100), criterios_aceite, parecer_aceite
  - sla_dias, sla_excedido
  - status (ABERTA, EM_EXECUCAO, ENTREGUE, EM_ACEITE, ACEITA, REJEITADA, CANCELADA)

- **BancoMetricas**: Controle de saldo de métricas
  - contrato_id, metrica, descricao
  - quantidade_total, quantidade_consumida, quantidade_reservada, saldo
  - valor_unitario

#### Controle de Saldo:
- Ao ABRIR OS: `banco.quantidade_reservada += quantidade_metrica`
- Ao ACEITAR OS: `banco.quantidade_consumida += quantidade_metrica`, `banco.quantidade_reservada -= quantidade_metrica`
- Ao REJEITAR/CANCELAR: `banco.quantidade_reservada -= quantidade_metrica`
- `banco.saldo = total - consumida - reservada`

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
- Contratos `ITEM_QUANTIDADE`: fluxo atual (selecionar itens, requisição)
- Contratos `MEDICAO`: não usa requisição → usa Medição (fiscal mede etapas)
- Contratos `CONTINUADO`: não usa requisição → usa Atestação Mensal (fiscal atesta mês)
- Contratos `LICENCA`: não usa requisição → usa Controle de Licenças (ativar/desativar)
- Contratos `ORDEM_SERVICO`: não usa requisição → usa Ordem de Serviço (abrir/aceitar OS)

---

## Resumo: Quem faz o quê

| Ação | Quem | Resultado |
|---|---|---|
| Medir etapa de obra | Fiscal | Saldo do contrato diminui |
| Atestar serviço mensal | Fiscal | Saldo do contrato diminui |
| Ativar/desativar licença | Gestor TI | Quantidade disponível muda |
| Aceitar Ordem de Serviço | Fiscal | Banco de métricas consumido |
| Requisitar item (compras) | Setor solicitante | Saldo empenhado |
| Receber item (compras) | Almoxarifado | Saldo entregue |

---

## Ordem de Implementação

1. ✅ **Migration**: Adicionar `modalidade_execucao` ao contrato + criar tabelas
2. ✅ **Entidades**: TypeORM para cada modalidade
3. **Services**: CRUD + lógica de saldos para cada modalidade
4. **Controllers**: Endpoints REST
5. **Frontend - Contrato**: Seletor de modalidade + aba dinâmica
6. **Frontend - Medição**: Cronograma + Boletim de Medição
7. **Frontend - Continuado**: Atestação mensal + IMR
8. **Frontend - Licença**: Controle de licenças
9. **Frontend - OS**: Ordens de Serviço + Banco de métricas
