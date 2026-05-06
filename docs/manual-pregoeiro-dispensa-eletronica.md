# Manual do Pregoeiro — Dispensa Eletrônica
## Portal DCP · Lei 14.133/2021, Art. 75

---

## Sumário

1. [Introdução e Base Legal](#1-introdução-e-base-legal)
2. [Visão Geral do Fluxo](#2-visão-geral-do-fluxo)
3. [Passo 1 — Criar a Licitação](#3-passo-1--criar-a-licitação)
4. [Passo 2 — Fase Interna (Planejamento)](#4-passo-2--fase-interna-planejamento)
5. [Passo 3 — Dados Básicos](#5-passo-3--dados-básicos)
6. [Passo 4 — Classificação](#6-passo-4--classificação)
7. [Passo 5 — Itens](#7-passo-5--itens)
8. [Passo 6 — Cronograma](#8-passo-6--cronograma)
9. [Passo 7 — Documentos](#9-passo-7--documentos)
10. [Passo 8 — Configurações e Publicação](#10-passo-8--configurações-e-publicação)
11. [Passo 9 — Análise de Propostas](#11-passo-9--análise-de-propostas)
12. [Passo 10 — Sala de Disputa (Sessão Pública)](#12-passo-10--sala-de-disputa-sessão-pública)
13. [Passo 11 — Negociação (Art. 61)](#13-passo-11--negociação-art-61)
14. [Passo 12 — Habilitação (Art. 62–70)](#14-passo-12--habilitação-art-6270)
15. [Passo 13 — Adjudicação (Art. 71)](#15-passo-13--adjudicação-art-71)
16. [Passo 14 — Homologação](#16-passo-14--homologação)
17. [Geração Automática de Contratos](#17-geração-automática-de-contratos)
18. [Situações Especiais](#18-situações-especiais)
19. [Perguntas Frequentes](#19-perguntas-frequentes)

---

## 1. Introdução e Base Legal

A **Dispensa Eletrônica** é a modalidade de contratação direta prevista no **Art. 75, II, da Lei 14.133/2021** para aquisições de **até R$ 50.000,00** (compras e serviços em geral) ou **até R$ 100.000,00** (obras e serviços de engenharia).

Diferentemente do pregão, a dispensa eletrônica:
- **Não** exige publicação de edital no Diário Oficial
- Tem prazo mínimo de **3 dias úteis** para recebimento de propostas (IN SEGES/ME 67/2021, Art. 4º)
- Utiliza **critério de julgamento por menor preço** (obrigatório)
- Adota **modo de disputa aberto** (obrigatório)
- É conduzida **integralmente pelo Portal DCP** sem sessão presencial

> **Atenção:** O Portal DCP gerencia a dispensa eletrônica pelo módulo de Licitações (via Sala de Disputa V3). Dispensas manuais/comuns são gerenciadas pelo módulo de Contratações Diretas.

---

## 2. Visão Geral do Fluxo

```
CRIAR LICITAÇÃO
      │
      ▼
FASE INTERNA (Planejamento, TR, Pesquisa de Preços, Parecer Jurídico)
      │
      ▼
DADOS BÁSICOS → CLASSIFICAÇÃO → ITENS → CRONOGRAMA → DOCUMENTOS → CONFIGURAÇÕES
      │
      ▼
PUBLICAR (fase: ACOLHIMENTO_PROPOSTAS — 3 dias úteis mínimo)
      │
      ▼
ANÁLISE DE PROPOSTAS
      │
      ▼
SALA DE DISPUTA V3 — Lances
      │
      ▼
NEGOCIAÇÃO com o 1º Classificado
      │
      ▼
HABILITAÇÃO — verificar documentos
      │
      ▼
ADJUDICAÇÃO — confirmar vencedor por item
      │
      ▼
HOMOLOGAÇÃO — autoridade ratifica
      │
      ▼
CONTRATOS GERADOS AUTOMATICAMENTE (1 por fornecedor vencedor)
```

---

## 3. Passo 1 — Criar a Licitação

**Caminho:** Menu lateral → **Licitações** → botão **+ Nova Licitação**

### Tela inicial — Escolha como iniciar

O sistema apresenta três opções:

| Opção | Quando usar |
|-------|------------|
| **Elaborar no Sistema** | Criar todos os documentos da fase interna pelo Portal (ETP, TR, Pesquisa de Preços, etc.) |
| **Importar de Outro Sistema** | Processo já existente no SEI, PNCP ou outro sistema |
| **Anexar Documentos** | Fase interna já concluída fora do sistema — apenas registrar |

> **Recomendação para dispensas novas:** Selecione **"Elaborar no Sistema"** para ter o processo completo documentado no Portal.

---

## 4. Passo 2 — Fase Interna (Planejamento)

Ao escolher **"Elaborar no Sistema"**, você acessa a **Fase Interna** com 5 etapas obrigatórias:

### Etapas da Fase Interna

| Etapa | Documento Obrigatório | Documento Opcional |
|-------|----------------------|-------------------|
| 1 — Planejamento | ETP (Estudo Técnico Preliminar) | MR (Matriz de Riscos) |
| 2 — Termo de Referência | TR (Termo de Referência) | PB (Projeto Básico) |
| 3 — Pesquisa de Preços | PP (Pesquisa de Preços) | — |
| 4 — Análise Jurídica | PJ (Parecer Jurídico), ME (Minuta do Edital) | — |
| 5 — Aprovação | AA (Autorização da Autoridade), DP (Designação do Pregoeiro), DO (Dotação Orçamentária) | — |

### Como usar o assistente de IA

Cada etapa possui o botão **"Gerar com IA"**:
1. Clique em **"Gerar com IA"**
2. Digite as informações do objeto no campo de prompt
3. Clique em **"Enviar para IA"**
4. Revise o texto gerado
5. Clique em **"Aplicar Sugestão"** para inserir no documento

> Após concluir todas as etapas obrigatórias, o botão **"Continuar para Dados Básicos"** será habilitado.

---

## 5. Passo 3 — Dados Básicos

**Aba 1 de 6 no formulário principal**

Preencha os campos:

| Campo | Obrigatório | Exemplo |
|-------|-------------|---------|
| Número do Processo | ✅ | `DE-001/2026` |
| Unidade Compradora | ✅ | Selecione no menu |
| Objeto da Licitação | ✅ | "Aquisição de material de escritório" |
| Descrição Detalhada | — | Especificações técnicas completas |
| Justificativa da Contratação | — | Conforme Art. 18, Lei 14.133/2021 |

> **Dica:** Clique em **"Salvar Rascunho"** a qualquer momento para não perder o preenchimento.

---

## 6. Passo 4 — Classificação

**Aba 2 de 6 — Campos automáticos para Dispensa Eletrônica**

### Campos a preencher manualmente

| Campo | Valor para Dispensa Eletrônica |
|-------|-------------------------------|
| **Modalidade** | `Dispensa Eletrônica` |
| **Tipo de Contratação** | Selecione: Compra / Serviço / Obra |

### Campos preenchidos automaticamente

Ao selecionar **"Dispensa Eletrônica"**, o sistema bloqueia e preenche automaticamente:

| Campo | Valor Fixo | Base Legal |
|-------|-----------|------------|
| Critério de Julgamento | **Menor Preço** | Art. 75, §3º |
| Modo de Disputa | **Aberto** | Art. 56, I |

> **Aviso legal exibido pelo sistema:**
> O sistema mostrará o limite legal conforme o tipo escolhido:
> - **Compra / Serviço:** limite de R$ 50.000,00 (Art. 75, II)
> - **Obra / Serviço de Engenharia:** limite de R$ 100.000,00 (Art. 75, I)
>
> Se o valor estimado ultrapassar esse limite, a modalidade deve ser Pregão Eletrônico ou Concorrência.

### ME/EPP — Tratamento Diferenciado

Configure se haverá benefício para Microempresas e Empresas de Pequeno Porte (LC 123/2006):

| Opção | Quando usar |
|-------|------------|
| Sem Benefício | Nenhum tratamento diferenciado |
| Exclusivo ME/EPP | Itens até R$ 80.000 — participação exclusiva |
| Cota Reservada | 25% do total reservado para ME/EPP |

---

## 7. Passo 5 — Itens

**Aba 3 de 6**

### Adicionar itens

Clique em **"Adicionar Manual"** ou use as opções:
- **"Catálogo ComprasGov"** — busca no catálogo federal (CATMAT/CATSER)
- **"Importar Planilha"** — importação em lote via CSV

### Campos de cada item

| Campo | Obrigatório | Descrição |
|-------|-------------|-----------|
| Descrição | ✅ | Especificação clara do item |
| Quantidade | ✅ | Valor > 0 |
| Unidade de Medida | ✅ | Ex: UNIDADE, CAIXA, PACOTE |
| Valor Unitário | ✅ | Preço estimado por unidade |
| Código CATMAT/CATSER | — | Código do catálogo federal |

> O campo **"Subtotal"** é calculado automaticamente (Quantidade × Valor Unitário).

### Vinculação com PCA

Se a contratação estiver vinculada ao Plano de Contratações Anual, utilize o botão **"Vincular PCA"** para associar cada item ao planejamento.

---

## 8. Passo 6 — Cronograma

**Aba 4 de 6**

### Datas obrigatórias

| Campo | Regra | Base Legal |
|-------|-------|-----------|
| Data de Publicação | A partir de hoje | — |
| Fim do Acolhimento de Propostas | Mínimo **3 dias úteis** após publicação | IN SEGES/ME 67/2021, Art. 4º |
| Data/Hora da Sessão Pública | Após o fim do acolhimento | — |

> O sistema calcula e sugere datas automaticamente. Clique em **"Recalcular Datas"** após alterar a data de publicação.

### Datas opcionais

| Campo | Descrição |
|-------|-----------|
| Limite para Impugnações | Data limite para fornecedores contestarem |
| Início do Acolhimento de Propostas | Pode coincidir com a publicação |

---

## 9. Passo 7 — Documentos

**Aba 5 de 6**

### Documentos obrigatórios

| Documento | Descrição |
|-----------|-----------|
| Edital | Documento principal com todas as regras |
| Termo de Referência | Especificações técnicas e condições |
| Pesquisa de Preços | Levantamento de preços de mercado |

### Documentos opcionais

- Estudo Técnico Preliminar
- Parecer Jurídico
- Minuta do Contrato
- Anexos complementares

### Como anexar

1. Clique em **"Enviar Arquivo"** ao lado do documento
2. Selecione o arquivo (PDF recomendado)
3. Aguarde a mensagem de confirmação

> O indicador **"Documentos enviados: X de 7"** mostra o progresso. Documentos obrigatórios pendentes bloqueiam o avanço.

---

## 10. Passo 8 — Configurações e Publicação

**Aba 6 de 6**

### Sigilo do Orçamento

| Opção | Quando usar |
|-------|------------|
| **Orçamento Público** | Valor estimado visível desde a publicação (recomendado para dispensa) |
| **Orçamento Sigiloso** | Valor ocultado até o encerramento dos lances (Art. 24, §2º) |

### Configurações da Sessão

| Campo | Padrão | Descrição |
|-------|--------|-----------|
| Intervalo Mínimo entre Lances | 3 min | Tempo mínimo entre lances do mesmo fornecedor |
| Tempo de Prorrogação | 2 min | Extensão automática após novo lance |
| Diferença Mínima entre Lances | 0 | Valor mínimo de redução (0 = sem limite) |

### Responsáveis

Informe o **Pregoeiro/Agente de Contratação** e a **Equipe de Apoio**.

### Publicar

Após verificar todos os campos (indicadores verdes em todas as abas), clique em **"Criar Licitação"**.

> O status muda para **ACOLHIMENTO_PROPOSTAS** e o processo fica visível para fornecedores no portal público.

---

## 11. Passo 9 — Análise de Propostas

**Caminho:** Licitações → selecione a licitação → aba **Propostas**

Após o encerramento do prazo de acolhimento, você analisa as propostas recebidas.

### Painel de Análise

O sistema exibe:
- **Total de Propostas** recebidas
- **Aguardando Análise** — ainda não avaliadas
- **Classificadas** — dentro dos requisitos
- **Desclassificadas** — fora dos requisitos
- **Valor Total Estimado** — orçamento base

> **Observação:** Se o sigilo de orçamento estiver ativo, os fornecedores ficam identificados como "Fornecedor A", "Fornecedor B", etc. até a fase de disputa.

### Analisar cada proposta

Para cada proposta, você pode:

**Classificar:**
1. Verifique os itens da proposta (descrição, marca, quantidade, valor)
2. Clique em **"Classificar"** se a proposta atende aos requisitos

**Desclassificar:**
1. Clique em **"Desclassificar"**
2. Informe obrigatoriamente o **Motivo da Desclassificação**
3. Opcionalmente, anexe um documento de justificativa
4. Confirme com **"Confirmar Desclassificação"**

### Iniciar a Disputa

Após analisar todas as propostas, clique em **"Concluir Análise e Iniciar Disputa"**.

> O sistema avança para a fase **ANALISE_PROPOSTAS → EM_DISPUTA**.

---

## 12. Passo 10 — Sala de Disputa (Sessão Pública)

**Caminho:** Licitações → selecione a licitação → botão **"Abrir Sala de Disputa V3"**

### Layout da Sala

A sala de disputa possui **três colunas**:

```
┌─────────────────┬──────────────────────────┬──────────────────┐
│  FILA           │    ITEM EM FOCO           │   PAINEL         │
│  OPERACIONAL    │                           │   LATERAL        │
│                 │  ┌──────────────────────┐ │                  │
│  Em disputa     │  │ Timer: 05:00         │ │  (muda conforme  │
│  Aguardando     │  │ Melhor lance: R$...  │ │   a etapa atual) │
│  Encerrados     │  │ Participantes: 3     │ │                  │
│                 │  └──────────────────────┘ │                  │
└─────────────────┴──────────────────────────┴──────────────────┘
```

### Etapas da Sessão (Stepper)

```
Abertura → Análise → Lances → Negociação → Habilitação → 
Benef. ME/EPP → Recursos → Adjudicação → Homologação → Encerramento
```

### Gerenciar os Lances

**Iniciar um item:**
1. Na fila operacional (coluna esquerda), selecione o item desejado
2. Clique em **"Iniciar selecionados"**
3. O timer começa automaticamente

**Encerrar um item:**
1. Aguarde o timer zerar (ou encerre antecipadamente)
2. Clique em **"Encerrar item"** no painel central
3. O sistema registra o melhor lance como vencedor provisório

**Cancelar um lance (a pedido do fornecedor):**
- Fornecedores têm **15 segundos** para cancelar o próprio lance diretamente
- Após 15 segundos, o fornecedor faz uma **"Solicitação de Cancelamento"**
- Você verá a solicitação no painel com o motivo informado
- Clique em **"Cancelar lance (pregoeiro)"** e informe a justificativa

**Suspender a sessão:**
1. Clique em **"Suspender"** (botão superior direito)
2. Escolha o motivo: ADMINISTRATIVO, CAUTELAR ou JUDICIAL
3. Descreva o motivo detalhadamente
4. Confirme — a sessão fica com status **SUSPENSA**

**Retomar a sessão:**
- Clique em **"Retomar"** para reabrir a sessão

### Comunicação Oficial

No painel lateral (aba padrão), use o campo de texto para enviar **mensagens oficiais** da sessão. Todos os participantes recebem em tempo real.

---

## 13. Passo 11 — Negociação (Art. 61)

Após o encerramento dos lances de todos os itens, a sessão avança para **NEGOCIAÇÃO**.

### Objetivo

Tentar obter um preço ainda mais vantajoso com o **1º classificado** antes de verificar sua habilitação.

### Como negociar

1. O painel lateral exibe automaticamente o **1º Classificado** com seu melhor lance
2. Troque mensagens pelo campo de chat (registradas oficialmente)
3. Se houver acordo, informe o **Valor Negociado** no campo correspondente
4. Clique em **"Registrar e avançar para habilitação"**

> Se não houver margem para negociação ou o fornecedor não aceitar redução, clique em **"Pular negociação → habilitação"**.

---

## 14. Passo 12 — Habilitação (Art. 62–70)

A habilitação verifica se o fornecedor vencedor possui os documentos regulatórios em dia.

### Convocar o fornecedor

1. O painel exibe o ranking dos classificados
2. Clique em **"Convocar"** ao lado do **1º Colocado**
3. O fornecedor recebe notificação para enviar documentos

### Documentos a verificar

| Documento | Descrição |
|-----------|-----------|
| Contrato Social ou Estatuto | Habilitação jurídica (Art. 66) |
| Certidão Negativa de Débitos Federais | Regularidade fiscal federal |
| Certidão de Regularidade do FGTS | Regularidade trabalhista |
| Certidão Negativa de Débitos Trabalhistas | CNDT |
| Certidão Negativa de Débitos Estaduais | Regularidade fiscal estadual |
| Certidão Negativa de Débitos Municipais | Regularidade fiscal municipal |

### Avaliar cada documento

Para cada documento, clique:
- 👍 (polegar para cima) → **Válido** (badge verde)
- 👎 (polegar para baixo) → **Inválido** (badge vermelho)

A barra de progresso mostra **"Documentos verificados: X/6"**.

### Decisão

**Habilitar:**
- Todos os 6 documentos marcados como **Válido**
- Botão **"Habilitar — avançar para intenção de recurso"** fica habilitado (verde)
- Clique para avançar

**Inabilitar:**
- Informe o motivo no campo **"Motivo da inabilitação (obrigatório)"**
- Clique em **"Inabilitar — convocar próximo classificado"**
- O sistema automaticamente convoca o **2º colocado** para habilitação (Art. 68)

---

## 15. Passo 13 — Adjudicação (Art. 71)

Após a habilitação, o sistema avança para **ADJUDICAÇÃO**.

### O que é Adjudicação

Ato formal que designa ao vencedor o objeto da licitação. Na dispensa eletrônica, pode ser feita diretamente pelo pregoeiro (Art. 71, I).

### Como adjudicar

1. O painel lateral exibe todos os itens com seus respectivos vencedores
2. Verifique cada item:
   - Número do item e descrição
   - Valor vencedor (em verde)
   - Razão Social e CNPJ do fornecedor
3. Clique em **"Confirmar adjudicação de todos os itens"**
4. Uma caixa de diálogo de confirmação aparece com a lista de itens
5. Clique em **"Confirmar Adjudicação"** (botão verde)

> O sistema registra a data de adjudicação e muda o status de todos os itens para **ADJUDICADO**.

---

## 16. Passo 14 — Homologação

**Caminho:** Licitações → selecione a licitação → aba **Homologação**

A homologação é ato da **autoridade competente** (não necessariamente o pregoeiro) que ratifica o procedimento.

### Verificar antes de homologar

A tela exibe:
- Lista de **Itens Adjudicados** com fornecedor, CNPJ e valor
- **Valor total adjudicado**

### Homologar

1. Revise todos os itens adjudicados
2. Clique em **"Homologar processo licitatório"**
3. Uma caixa de diálogo exibe:
   > *"Você está prestes a homologar o processo licitatório conforme Art. 71, §2º da Lei 14.133/2021. Esta ação é irreversível e autoriza a celebração do contrato com o(s) vencedor(es) adjudicado(s)."*
4. Confirme clicando em **"Confirmar Homologação"**

> Após a confirmação: *"A licitação foi homologada com sucesso. O processo avança para contratação."*

---

## 17. Geração Automática de Contratos

Imediatamente após a homologação, o sistema gera **automaticamente um contrato por fornecedor vencedor**.

### O que é gerado automaticamente

| Campo | Origem |
|-------|--------|
| Número do Contrato | Sequencial do ano (CT-AAAA/NNNN) |
| Fornecedor | Dados do vencedor da disputa |
| Itens | Todos os itens vencidos por esse fornecedor |
| Valor Global | Soma dos valores dos itens do fornecedor |
| Prazo de Execução | Extraído do prazo de entrega informado na proposta |
| Amparo Legal | Lei 14.133/2021, Art. 75, II |
| Status | AGUARDANDO_LIBERACAO |

### Exemplo

Se dois fornecedores venceram itens diferentes:
- **ALFA Materiais** venceu o Item 1 → Contrato CT-2026/0001
- **BETA Suprimentos** venceu o Item 2 → Contrato CT-2026/0002

### Acompanhar contratos gerados

**Caminho:** Menu lateral → **Contratos** → filtrar pelo número do processo

---

## 18. Situações Especiais

### Processo Fracassado

Ocorre quando nenhuma proposta atende aos requisitos ou todos os fornecedores são inabilitados.
- Status da licitação: **FRACASSADO**
- Ação: Revise os requisitos e reabra o processo

### Processo Deserto

Ocorre quando nenhum fornecedor apresenta proposta no prazo.
- Status da licitação: **DESERTO**
- Ação: Verifique a divulgação e reabra com prazo maior

### Suspensão Judicial

Se houver mandado judicial suspendendo a sessão:
1. Clique em **"Suspender"**
2. Selecione motivo **JUDICIAL**
3. Informe o número do processo judicial
4. Aguarde decisão e então clique **"Retomar"**

### Impugnação ao Edital

Se um fornecedor ou cidadão impugnar o processo:
- O prazo de impugnação é configurado no cronograma
- Registre a resposta à impugnação nos documentos do processo
- Se procedente, corrija e republique

---

## 19. Perguntas Frequentes

**P: O sistema exige edital para dispensa eletrônica?**
R: Não há edital formal obrigatório, mas o Portal usa um "Aviso de Contratação Direta" com as mesmas funções. O Termo de Referência é o documento principal.

**P: Posso ter mais de um fornecedor vencedor?**
R: Sim. Cada item pode ter um vencedor diferente. O sistema gera um contrato automático para cada fornecedor vencedor.

**P: O prazo mínimo de 3 dias é corrido ou úteis?**
R: São **3 dias úteis** (IN SEGES/ME 67/2021, Art. 4º). O sistema já considera isso ao calcular as datas do cronograma.

**P: O pregoeiro pode cancelar um lance do fornecedor?**
R: Sim, mediante justificativa. O fornecedor tem 15 segundos para cancelar diretamente. Após isso, solicita ao pregoeiro via sistema.

**P: O que acontece se o valor estimado ultrapassar R$ 50.000?**
R: O sistema exibe um alerta na aba de Classificação informando o limite legal. A licitação não poderá ser publicada como Dispensa Eletrônica acima desse limite.

**P: Posso corrigir dados após publicar?**
R: Dados básicos e critérios não podem ser alterados após publicação. Para correções substantivas, é necessário suspender, corrigir e republicar.

**P: A sessão funciona sem internet do lado do pregoeiro?**
R: Não. A Sala de Disputa usa WebSocket em tempo real. A barra superior mostra o status: **"WS online"** (verde) ou **"WS offline"** (vermelho). Em caso de queda, a sessão é preservada; reconecte e retome.

---

*Portal DCP — versão 2026 · Lei 14.133/2021 · Desenvolvido por Valleteclab*
