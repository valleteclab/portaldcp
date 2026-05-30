# Plano — Tornar a Fase Interna fluida (encadeamento → IA contextual → cockpit)

> Diagnóstico, arquitetura e plano de implementação para o módulo `/orgao/fase-interna`.
> Prioridades aprovadas pelo usuário (nesta ordem): **1) Encadeamento de documentos, 2) IA contextual, 3) Cockpit do processo.** Modo: plano detalhado antes de codar.

---

## 1. Diagnóstico (por que não flui)

Vestindo o chapéu do analista de licitação que virou engenheiro, a experiência hoje é:

1. **Inferno da re-digitação.** Os 8 documentos são silos. Descrevo a necessidade no DFD, redigito no ETP (inc. I), de novo no TR (alínea c). Itens da demanda → redigito na Pesquisa de Preços. Valor → calculo na PP, redigito no ETP (inc. VI) e no TR (alínea i). **Nada flui downstream.**
2. **IA parafusada, não integrada.** `PainelIA` tem 3 abas, mas **Validação e Dados são stubs**. O chat não enxerga documentos vizinhos nem dados do processo.
3. **Modelo mental errado.** O wizard `novo/page.tsx` (1680 linhas) força produzir os 8 documentos numa sentada. Licitação real é iterada ao longo de semanas. Falta um cockpit.
4. **Sem validação real da lei na interface.** Dá para "aprovar" documento com incisos obrigatórios vazios.
5. **Código morto/duplicado.** `DocumentEditor` (Yjs/Socket.io, não usado), `AiAssistantPanel`, `EditorToolbar`, `pesquisa-precos-agente.service` (duplicado), templates duplicados (inline no wizard + `secoes-template.ts`).

### A raiz técnica (descoberta central)

`dados_estruturados` (JSONB) tem **dois formatos concorrentes e incompatíveis**:

| Modelo | Forma | Usado por |
|---|---|---|
| **Tipado** (`EtpDados`, `TrDados`, `PesquisaPrecosDados`, `MatrizRiscosDados`) | campos nomeados, tipados, validáveis | validadores (`validarEtp`…), geradores PDF/DOCX, IA estruturada (`gerarEtpEstruturado`) |
| **Seções HTML** (`secoes-template.ts`) | `{ secaoId: "<p>html</p>" }` | o editor que o usuário usa (`DocumentoSeccionado`) |

Os IDs de seção (`necessidade`, `requisitos`) **não batem** com os campos tipados (`descricao_necessidade`, `requisitos_contratacao`). Sem um modelo único e endereçável, **não há de onde herdar** → encadeamento é impossível. Unificar o modelo é a fundação.

---

## 2. Decisões de arquitetura

### Decisão 1 — Unificar no modelo TIPADO (fonte de verdade)
`dados_estruturados` passa a ser **sempre** o tipo do backend (`EtpDados`, etc.). O editor renderiza campos tipados:
- campos de prosa (`descricao_necessidade`, `fundamentacao_contratacao`) → mini-editor rich-text (Tiptap) que salva **HTML numa string do campo tipado**;
- campos estruturados (`previsao_pca`, `estimativa_valor`, `justificativa_parcelamento`, `quantitativos`) → widgets próprios (seletor PCA, valor + memória de cálculo, toggle parcelado/integral, tabela de itens).

Ganhos: validadores e geradores passam a funcionar com o que o usuário edita; a IA já produz esse formato; campos viram **endereçáveis** → encadeamento natural (`etp.estimativa_valor.valor_total ← pp.valor_total_estimado`).

`descricao` (text/HTML) continua como **cache** derivado, para listagens e PDF legado.

### Decisão 2 — Encadeamento = SEED + detecção de divergência (não live-link)
Em vez de vínculos vivos (frágeis em prosa e tiram o controle do analista, que é o responsável legal pelo conteúdo):
- **Seed**: ao criar/abrir documento vazio, propõe preencher campos a partir de montante (demanda, licitação, documentos irmãos). O analista revisa e edita livremente.
- **Proveniência por campo**: guardamos de onde cada campo foi semeado (`_origem: { campo: 'DFD' | 'PP' | 'DEMANDA' | … }`).
- **Detecção de divergência (drift)**: se a origem mudou depois do seed, sinalizamos "desatualizado" com botão "atualizar do documento de origem". Alimenta também a aba Validação ("ETP R$50k ≠ mediana PP R$72k").

### Decisão 3 — Vincular Licitação ↔ Demanda
Hoje **não há FK** entre `Licitacao` e `Demanda`. Sem ela, não dá para herdar itens/valores da demanda. Adicionar `demanda_id` (nullable) em `Licitacao`. Permite **"criar processo a partir de demanda aprovada"** → objeto, itens, quantidades, valores e classificação fluem automaticamente. É o início da cadeia e já um grande ganho isolado.

---

## 3. Grafo de derivação (o coração do encadeamento)

```
Demanda (aprovada)
  ├─ objeto, valor_total ─────────────► Licitacao.objeto / valor_total_estimado
  └─ itens[] (catmat, descr, qtd, un, classificação)
        ├──────────────► PP.itens[]            (codigo_catmat, descricao, quantidade, unidade)
        ├──────────────► ETP.estimativas_quantidades
        └──────────────► TR.quantitativos[]

DFD.demanda (necessidade) ──► ETP.descricao_necessidade ──► TR.fundamentacao_contratacao
DFD.previsao (PCA)        ──► ETP.previsao_pca           ──► (referência no TR/Edital)

PP.valor_total_estimado / mediana ──► ETP.estimativa_valor.valor_total
                                  └─► TR.estimativas_valor.valor_total ──► ME(Edital).estimativa

ETP.descricao_solucao   ──► TR.definicao_objeto.descricao_detalhada
ETP.justificativa_parcelamento ──► TR.forma_criterios_selecao (parcelamento/lotes)
DO (dotação)            ──► TR.adequacao_orcamentaria / TR.estimativas_valor

TR.definicao_objeto     ──► ME(Edital).objeto_edital
TR.forma_criterios_selecao ──► ME(Edital).julgamento/participacao
```

Cada aresta = uma regra de seed declarativa no `DerivacaoService`.

---

## 4. Fase 1 — Encadeamento (fundação + herança)

### 4.1 Backend

**Migration + entidade**
- `licitacao.entity.ts`: coluna `demanda_id: string | null` (+ índice). Migration TypeORM.

**Unificação do modelo tipado**
- Reescrever `secoes-template.ts` (frontend) para descrever **campos do tipo** (não seções HTML soltas): cada campo com `{ id, caminho, label, tipo: 'rich'|'texto'|'numero'|'objeto'|'array'|'pca'|'valor'|'toggle', obrigatorio, fundamentoLegal, derivadoDe? }`.
- `atualizarSecao()` no backend passa a gravar no **caminho tipado** (`dados_estruturados.descricao_necessidade`) em vez de `dados_estruturados[secaoId]`. Manter compat: migração leve que converte docs antigos (`htmlParaDadosEstruturados`) na primeira abertura.

**Novo `DerivacaoService` (`backend/src/fase-interna/derivacao.service.ts`)**
- `montarSeed(licitacaoId, tipo): { dados, origem }` — monta `dados_estruturados` proposto puxando de Demanda + Licitacao + documentos irmãos, conforme o grafo.
- `detectarDivergencias(licitacaoId, tipo): Divergencia[]` — compara valores semeados vs. origem atual (ex.: valor ETP vs mediana PP).
- Regras declarativas (um mapa por `tipo`).

**Endpoints (`fase-interna.controller.ts`)**
- `GET  /:licitacaoId/documentos/:tipo/seed` → preview do seed + proveniência (não salva).
- `POST /:licitacaoId/documentos/:tipo/aplicar-seed` → aplica campos escolhidos.
- `GET  /:licitacaoId/documentos/:tipo/divergencias` → lista de drifts.
- `POST /licitacoes` (ou `fase-interna`): aceitar `demanda_id` e, ao criar, semear objeto/itens/valor da demanda.

### 4.2 Frontend

**Editor unificado** (`DocumentoSeccionado` → renomear/refatorar para `EditorDocumento`)
- Renderiza campos a partir do template tipado: `CampoRich`, `CampoValor` (com memória de cálculo), `CampoPca`, `CampoParcelamento`, `CampoQuantitativos` (tabela de itens), etc.
- Auto-save por campo (debounce) gravando no caminho tipado.
- **Chip de origem por campo**: "vindo do DFD" / "vindo da Pesquisa de Preços"; quando em drift, badge "desatualizado" + botão "atualizar".
- Banner ao abrir documento vazio: **"Preencher a partir dos documentos anteriores"** com preview do que será semeado e de onde; aplicar tudo ou por campo.

**Criar processo a partir de demanda**
- Primeiro passo do fluxo de criação: selecionar demanda aprovada → objeto/itens/valor/classificação fluem.

### 4.3 Verificação E2E (Fase 1)
1. Criar processo a partir de demanda → objeto/itens/valor preenchidos.
2. Abrir ETP vazio → banner propõe seed do DFD + demanda; aplicar → `descricao_necessidade`, `estimativas_quantidades`, `previsao_pca` preenchidos com chips de origem.
3. Editar PP (mediana muda) → abrir ETP → campo valor mostra "desatualizado" → "atualizar" reconcilia.
4. TR semeia de ETP + PP; `quantitativos` vêm dos itens.
5. Validador roda sobre os dados tipados que o usuário realmente editou (sem mismatch).
6. Doc antigo (HTML) abre convertido para o modelo tipado sem perda.

---

## 5. Fase 2 — IA contextual de verdade

### 5.1 Backend
- **Endpoint de validação não-lançante**: `GET /fase-interna/estruturado/:documentoId/conformidade` → `{ itens: [{ campo, fundamentoLegal, ok, erro }] }` (envolve os validadores existentes em try/catch, sem `BadRequestException`).
- **Endpoint de contexto cross-documento**: `GET /fase-interna/:licitacaoId/contexto` → objeto consolidado (licitação, demanda, resumo de cada documento irmão, mediana PP, nº itens, classificações) para alimentar a IA e a aba Dados.
- Reaproveitar `/api/ia/gerar-estruturado` e `/api/ia/chat`, passando o contexto consolidado.

### 5.2 Frontend — `PainelIA` (implementar as 3 abas de verdade)
- **Dados**: cartões reais (objeto, modalidade, critério, valor estimado, mediana PP, nº itens, classificações, prazo) vindos de `/contexto`. Botão "inserir na seção".
- **Validação**: checklist por campo/inciso usando `/conformidade` (✓/✗ + citação legal) + divergências do `DerivacaoService`. Botão "corrigir com IA" → injeta sugestão.
- **Chat**: passa o documento atual (tipado) + resumo dos irmãos como contexto → modelo raciocina entre documentos ("seu ETP diz R$50k mas a PP mediana é R$72k").

### 5.3 Verificação E2E (Fase 2)
1. Abrir ETP incompleto → aba Validação lista incisos faltantes com fundamento legal.
2. Aba Dados mostra fatos reais do processo; "inserir" leva texto à seção correta.
3. Chat responde citando dados de documentos irmãos; "inserir no documento" funciona.
4. Divergência valor ETP×PP aparece na Validação.

---

## 6. Fase 3 — Cockpit do processo

### 6.1 Frontend
- Refatorar `processos/[id]/page.tsx` em **hub do processo**:
  - Cartões de documentos na ordem legal, com status, % de preenchimento, incisos obrigatórios faltantes e o que bloqueia o avanço de fase.
  - **"Próximo passo recomendado"** computado da fase + documentos aprovados.
  - Entrada "Criar a partir da demanda" e "Preencher cadeia (DFD+ETP)".
  - Cada cartão abre o editor unificado.
- Manter um "início rápido" leve (semear DFD+ETP da demanda), mas permitir iteração documento-a-documento ao longo do tempo (substitui a obrigação do wizard de tudo-de-uma-vez).

### 6.2 Limpeza (ao longo das fases)
- Remover: `DocumentEditor.tsx`, `AiAssistantPanel.tsx`, `EditorToolbar.tsx` (frontend); `ColaboracaoGateway`/`ColaboracaoModule` + `socket.io`/`yjs` (backend e deps).
- Remover serviço duplicado `pesquisa-precos-agente.service.ts` (confirmar qual está ativo).
- Eliminar templates inline do `novo/page.tsx` (usar o template tipado único).

### 6.3 Verificação E2E (Fase 3)
1. Hub mostra os 8 documentos com status e bloqueios reais.
2. "Próximo passo recomendado" coerente com a fase.
3. Sem conexão WebSocket `/colaboracao` (código morto removido) e build verde.

---

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Migrar docs antigos (HTML) para tipado | `htmlParaDadosEstruturados` na 1ª abertura; manter `descricao` como cache; testar com docs reais |
| Reescrever editor é grande | Faseado: começar por DFD/ETP (mais usados), depois TR/PP/MR/ME |
| Seed sobrescrever trabalho do analista | Seed só em campo vazio; aplicar por campo; nunca sobrescreve sem confirmação |
| FK `demanda_id` em processos antigos | Coluna nullable; fallback sem demanda continua válido |
| Validadores lançam `BadRequestException` | Endpoint `/conformidade` não-lançante para leitura |

---

## 8. Ordem de execução proposta

1. **Fundação** (model unificado + `demanda_id` + conversão de docs antigos).
2. **Encadeamento DFD→ETP** + "criar a partir da demanda" (primeira cadeia visível).
3. **Encadeamento PP→ETP/TR** (itens e valores) + detecção de divergência.
4. **IA contextual** (Dados, Validação, Chat com contexto).
5. **Cockpit** + limpeza de código morto.

Cada etapa é uma PR pequena e verificável, com a tela funcionando ao final.
