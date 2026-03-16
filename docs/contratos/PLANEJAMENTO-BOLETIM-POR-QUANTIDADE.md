# Planejamento: Boletim de Medição por Quantidade

## Contexto

No fluxo de medição do fornecedor (`/fornecedor/contratos/:id?tab=medicao`), o boletim de medição gera um PDF com o bloco **EXECUÇÃO FISCAL / FINANCEIRA**. Atualmente, a **Execução Fiscal** é sempre contabilizada em **dias** (tempo), usando ano comercial de 360 dias.

**Problema:** Existem contratos de **serviço** que usam medição (modalidade MEDICAO ou CONTINUADO com itens de cronograma), mas cuja execução fiscal deve ser contabilizada por **quantidade** (unidades, horas, metros, etc.), não por dias. Exemplo: contrato de gravações — 100 HORAS × R$ 344,75 — onde o que importa é a quantidade executada (horas), não o tempo decorrido.

## Situação Atual

### Estrutura do bloco EXECUÇÃO FISCAL / FINANCEIRA (PDF)

| Coluna | Execução Fiscal (atual) | Execução Financeira |
|--------|-------------------------|----------------------|
| NO PERÍODO | X dias | R$ valor |
| ATÉ O PERÍODO | Y dias | R$ valor |
| A EXECUTAR | Z dias | R$ valor |

- **Execução Fiscal:** Sempre em dias (tempo), calculada com `diasEntreDatasComercial`, ano comercial 360 dias.
- **Execução Financeira:** Sempre em valor (R$), por item.

### Quando usa itens vs etapas

- **`usarItensCronograma(contratoId)`:** Retorna `true` quando o contrato tem `ItemCronograma` (itens com descrição, unidade, quantidade, valor) em vez de `EtapaCronograma` (etapas de obra com percentual físico).
- **ItemCronograma:** Campos `unidade_medida` (HORA, MENSAL, LITROS, METROS, UNIDADE), `quantidade`, `valor_unitario`, `quantidade_medida` (acumulado aprovado).
- **ItemMedicaoItem:** `quantidade_medida` por medição.

### Dados já disponíveis

Os itens do PDF já possuem:
- `quantidade_no_periodo` — quantidade medida nesta medição
- `quantidade_acumulada_aprovada` — quantidade acumulada em medições anteriores
- `quantidade_total_contrato` — quantidade total contratada
- `unidade` — unidade de medida (h, un, m, etc.)

## Objetivo

Permitir que contratos de serviço com **boletim por quantidade** exibam a Execução Fiscal em **quantidade** (unidades/horas/metros) em vez de dias, mantendo a Execução Financeira em valor (R$).

## Critérios de decisão: Boletim por Quantidade vs por Tempo

| Critério | Boletim por Quantidade | Boletim por Tempo |
|----------|------------------------|-------------------|
| Tipo de contrato | Serviço com itens (HORA, UNIDADE, METROS, LITROS) | Obra/engenharia ou serviço mensal (MENSAL) |
| Execução Fiscal | Quantidade (un, h, m, l) | Dias (ano comercial) |
| Exemplo | 100 h × R$ 344,75 — mede horas executadas | Serviço de limpeza mensal — mede tempo decorrido |

**Regra proposta:** Usar **boletim por quantidade** quando:
1. `usarItensCronograma(contratoId)` = true **e**
2. Pelo menos um item tem `unidade_medida` diferente de `MENSAL` **ou**
3. Contrato possui flag explícita `boletim_por_quantidade: true` (configurável pelo órgão)

**Alternativa mais simples:** Inferir apenas de `usarItensCronograma` + unidade. Se todos os itens forem MENSAL, usar tempo; caso contrário, usar quantidade.

## Plano de Implementação

### Fase 1: Backend — Dados e flag

1. **Contrato (opcional):** Adicionar campo `boletim_por_quantidade?: boolean` na entidade Contrato (nullable, default null). Se null, inferir; se true/false, usar valor explícito.
   - Migration: `AddBoletimPorQuantidadeContrato`
   - Endpoints GET/PUT contrato devem retornar/aceitar o campo.

2. **MedicaoService.calcularExecucaoFinanceiraFornecedor:**
   - Determinar `execucaoFiscalPorQuantidade: boolean`:
     - Se `contrato.boletim_por_quantidade !== null` → usar esse valor
     - Senão: `usarItensCronograma` e existir item com `unidade_medida !== 'MENSAL'` → true
     - Senão: false
   - Quando `execucaoFiscalPorQuantidade`:
     - Não calcular `execucao_fiscal` (dias)
     - Incluir em cada item do resultado: `quantidade_no_periodo`, `quantidade_ate_periodo`, `quantidade_a_executar`
     - Incluir no retorno: `execucao_fiscal_por_quantidade: true` e totais de quantidade (se aplicável)

3. **montarDadosPdfFrontend (MedicaoService):**
   - Incluir `execucao_fiscal_por_quantidade` nos dados do PDF
   - Garantir que `itens` tenham `quantidade_no_periodo`, `quantidade_ate_periodo`, `quantidade_a_executar` e `unidade` quando for boletim por quantidade

### Fase 2: PDF — Bloco Execução Fiscal

4. **frontend/src/lib/pdf-medicao.ts** e **backend/src/assinaturas/medicao-pdf-jspdf.ts:**
   - Se `dados.execucao_fiscal_por_quantidade === true`:
     - Colunas EXECUÇÃO FISCAL: exibir quantidade (formato: `X un`, `Y h`, `Z m` conforme unidade)
     - NO PERÍODO: `quantidade_no_periodo` do item
     - ATÉ O PERÍODO: `quantidade_ate_periodo` (quantidade_acumulada_aprovada + quantidade_no_periodo)
     - A EXECUTAR: `quantidade_a_executar` (quantidade_total - quantidade_ate_periodo)
     - Na linha TOTAL: somar quantidades (ou exibir "-" se unidades mistas; nesse caso, considerar apenas quando mesma unidade)
   - Se `execucao_fiscal_por_quantidade === false`:
     - Manter comportamento atual (dias)

5. **Função auxiliar:** `fmtQuantidade(valor: number, unidade: string): string` — ex: `100 h`, `50 un`, `1.250 m`

### Fase 3: Frontend — Tela do Fornecedor

6. **Execução Fiscal e Financeira (fornecedor/contratos/[id]/page.tsx):**
   - Se `execucao_fiscal_por_quantidade` (vindo de `execucaoFinanceira`):
     - Título: "Execução Fiscal (Quantidade)" em vez de "Execução Fiscal (Tempo)"
     - Exibir quantidades (No Período, Até o Período, A Executar) — pode ser por item ou totais se mesma unidade
   - Senão: manter "Execução Fiscal (Tempo)" com dias

7. **TabMedicao (órgão)** e **aprovacoes (órgão):** Ajustar exibição do bloco Execução Fiscal conforme o mesmo critério.

### Fase 4: Configuração (opcional)

8. **Admin/Contrato:** Permitir marcar "Boletim por quantidade" ao criar/editar contrato (quando modalidade MEDICAO/CONTINUADO e tiver itens de cronograma).

## Arquivos a modificar

| Arquivo | Alteração |
|---------|-----------|
| `backend/src/contratos/entities/contrato.entity.ts` | Campo `boletim_por_quantidade` (opcional) |
| `backend/src/contratos/medicao.service.ts` | Lógica `execucaoFiscalPorQuantidade`, cálculo quantidade por item, `montarDadosPdfFrontend` |
| `backend/src/assinaturas/medicao-pdf-jspdf.ts` | Bloco Execução Fiscal condicional (quantidade vs dias) |
| `frontend/src/lib/pdf-medicao.ts` | Idem |
| `frontend/src/app/fornecedor/contratos/[id]/page.tsx` | Bloco Execução Fiscal condicional |
| `frontend/src/components/contratos/TabMedicao.tsx` | Idem (órgão) |
| `frontend/src/app/orgao/aprovacoes/page.tsx` | Idem (aprovações) |
| Migration (nova) | `AddBoletimPorQuantidadeContrato` |

## Considerações

- **Unidades mistas:** Se o contrato tiver itens com HORA, UNIDADE e METROS, a linha TOTAL da Execução Fiscal pode não fazer sentido somar. Opções: (a) exibir "-" no total; (b) exibir por item apenas; (c) somar apenas itens da mesma unidade.
- **Retrocompatibilidade:** Contratos existentes sem a flag continuam com comportamento atual (inferir de itens). Se `usarItensCronograma` e itens não-MENSAL → quantidade; caso contrário → dias.
- **Etapas (obras):** Contratos com EtapaCronograma (não ItemCronograma) continuam sempre com execução fiscal em dias.

## Resumo

| Item | Descrição |
|------|-----------|
| **Problema** | Execução Fiscal sempre em dias; contratos de serviço por quantidade precisam de execução em unidades |
| **Solução** | Flag/inferência para "boletim por quantidade"; exibir quantidades na Execução Fiscal |
| **Escopo** | Backend (cálculo + PDF), Frontend (PDF + tela fornecedor + órgão) |
| **Risco** | Baixo — mudança condicional, retrocompatível |
