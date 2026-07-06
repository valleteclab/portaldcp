# Licitação fim a fim no Portal DCP — Estudo, Diagnóstico e Plano

> Data: 06/07/2026 · Base legal: Lei 14.133/2021, LC 123/2006, IN SEGES/ME 73/2022
> Documentos relacionados: `docs/plano-fase-interna-fluidez.md` (aprovado), `docs/SALA_DISPUTA_FUNCIONAL.md`, `docs/PNCP-INTEGRACAO.md`

## 1. Objetivo

Ter todo o ciclo de licitação dentro do sistema — da fase interna (DFD → ETP → riscos → pesquisa de preços → TR → autorização → edital → parecer) à fase externa (publicação, impugnação/esclarecimento, propostas, sala de disputa, julgamento, habilitação, recursos, adjudicação, homologação, ata, contrato, PNCP) — cobrindo todas as modalidades da Lei 14.133/2021, **sem regras hardcoded**, com confiança suficiente para implantar em cliente.

## 2. Diagnóstico consolidado (o que já existe)

A conclusão central do estudo: **não precisamos de uma área nova**. O sistema já tem ~80% das entidades e ~60% da lógica. O que falta é **completar fluxos pela metade, consolidar as 3 versões de disputa e parametrizar o que está fixo no código** — e criar as condições de confiança (testes, auditoria, migrations).

### 2.1 Maturidade por área

| Área | Estado | Observações |
|---|---|---|
| Modelo de dados (licitação, itens, lotes, propostas, lances, sessão) | ✅ Maduro | Enums completos: 7 modalidades, 6 critérios de julgamento, 4 modos de disputa, 17 fases. ME/EPP, lotes, sigilo de orçamento, vinculação PCA em 3 níveis |
| Disputa modo ABERTO (backend `disputa-v2`) | ✅ Maduro | Lances com lock pessimista, timer por item, prorrogação automática +2min, anonimização, cancelamento (15s direto / depois via pregoeiro), suspensão, chat, ata completa |
| Pós-disputa: negociação, habilitação, intenção de recurso, adjudicação (`sessao.service`) | ⚠️ Parcial | Endpoints existem; frontend v3 consome parcialmente. Falta amarração fim a fim |
| Modos ABERTO_FECHADO / FECHADO_ABERTO / FECHADO | ❌ Só template | Presenter da v3 tem os textos; **não existe lógica de transição de fases** no service |
| Benefício ME/EPP (LC 123 art. 44/45) | ⚠️ Parcial | Detecta empate ficto (≤5%) e convoca; **não existe aceitar/recusar lance da ME/EPP** |
| Recursos (prazo recursal, contrarrazões, decisão) | ❌ Ausente | Etapas `PRAZO_RECURSAL` e `ANALISE_RECURSOS` existem no enum, **sem nenhum método** |
| Homologação | ❌ Ausente | Etapa existe no enum, sem ato da autoridade competente |
| Fase interna (documentos estruturados + IA) | ⚠️ Parcial | Modelo tipado + prompts IA prontos (ETP, TR, PP, PJ, MR, ME, AA); plano de fluidez já aprovado em `docs/plano-fase-interna-fluidez.md` |
| Esclarecimentos e impugnações | ✅ Funcional | Entidades e endpoints completos, inclusive cidadão não cadastrado |
| Contratação direta (dispensa/inexigibilidade) | ⚠️ Entidades prontas | Todas as hipóteses do art. 74/75 mapeadas; **fluxo de dispensa eletrônica não implementado** |
| Credenciamento (art. 79) | ✅ Funcional | Fluxo completo com análise de inscritos |
| Leilão, diálogo competitivo, concurso | ❌ Só enum | Nenhuma lógica específica |
| ARP / registro de preços (SRP) | ❌ Inexistente | Flag `srp` existe na licitação; módulo de ata de registro de preços não |
| PNCP | ⚠️ Só PCA | Publicação de compra + itens + documentos + **resultados/homologação** não implementada (obrigação legal da fase externa). Stub vazio em `fase-interna/pncp-publicacao.service.ts` |
| Assinatura digital | ✅ Funcional | OTP WhatsApp/e-mail, signatários, hash; cache OTP em memória (migrar p/ Redis) |
| Frontend órgão | ⚠️ Misto | Wizard de licitação completo; detalhe (~2.500 linhas) precisa decompor; fase interna com dados mock |
| Frontend sala de disputa | ⚠️ 3 versões | `disputa` (v2 operacional, pronta), `disputa-v3` (cockpit por etapa jurídica, painéis parcialmente mock), `sala-disputa` (morta) |
| Frontend fornecedor | ⚠️ Só v2 | Dá lances na v2; não vê negociação/habilitação/recurso da v3 |
| Testes do core de disputa | ❌ Quase zero | Só presenter e anonimização têm spec; lances/timer/estados sem testes |
| Auditoria | ❌ Não persiste | `audit.service.ts:96` — só console.log |
| Migrations | ❌ Risco grave | `app.module.ts:97` — `synchronize: true` **em produção** |

### 2.2 Hardcoded que precisa virar parâmetro

- Tempos de disputa: inatividade 10min, prorrogação 2min, intervalo mínimo 3min, aleatório 2–30min, lance final fechado 5min, etapa aberta híbrida 15min.
- Cancelamento direto de lance: 15s (`disputa-cancelamento.constants.ts`).
- Empate ficto ME/EPP: 5% fixo (deveria ser 5% pregão / 10% demais — LC 123 art. 44 §1º e §2º).
- Prazo de intenção de recurso: 10min no backend (comentário) vs 30min na UI v3 — **inconsistente entre si e deve ser configurável**.
- Limites de valor de dispensa (art. 75 I/II) — atualizados anualmente por decreto — não estão em lugar nenhum validável.
- Cota reservada ME/EPP ≤25% e teto de lote exclusivo: campos existem, **sem validação**.
- Cores/textos no frontend (`#1351b4` espalhado) e prazo de validade de proposta (60 dias).

### 2.3 Duplicações a resolver

1. **Backend**: `sessao.service` e `disputa-v2` duplicam controle de tempo e conversão proposta→lance (dois cronômetros concorrentes = fonte de bug).
2. **Frontend**: `orgao/disputa` (v2) × `orgao/disputa-v3` × `orgao/sala-disputa` (morta) — tipos, cards e formatadores copiados.
3. **Entidade**: campos ME/EPP antigos (`exclusivo_mpe`, `cota_reservada`) coexistem com os novos (`modo_beneficio_mpe`, `tipo_beneficio_mpe`) sem depreciação.

## 3. Por que ainda não dá para implantar em cliente (riscos)

1. **`synchronize: true` em produção** — o TypeORM pode alterar schema sozinho e destruir dados de uma sessão de disputa real. Bloqueador absoluto.
2. **Auditoria não persistida** — numa licitação real, cada ato do pregoeiro precisa de trilha auditável em banco (TCU/controle interno). Hoje se perde no console.
3. **Zero testes no motor de lances/timer** — é a parte com maior risco jurídico (lance aceito fora do prazo, prorrogação errada) e nada garante regressão.
4. **Fluxo legal incompleto** — sem recursos e homologação, o processo não fecha juridicamente; sem publicação no PNCP da compra/resultado, a licitação eletrônica não tem validade (art. 54 e 174).
5. **Reiniciar sessão destrói lances sem versão de ata** — precisa de snapshot/versionamento antes de qualquer ação destrutiva.
6. **Divergências v2×v3** — o pregoeiro veria dados diferentes conforme a tela.

## 4. Decisões de arquitetura

### D1 — Consolidar, não reescrever
`disputa-v2` vira o **motor único de disputa** (engine). A `disputa-v3` continua como camada de apresentação/orquestração de etapas jurídicas — que é o que ela já é. O que falta migra do `sessao.service` para o motor (um único dono do tempo e dos lances). Frontend: a v3 vira a única sala (absorvendo a operação em tempo real da v2 como aba/modo), e `orgao/disputa` + `orgao/sala-disputa` são aposentadas após paridade.

### D2 — Parâmetros em banco, com vigência
Nova tabela `parametros_licitacao` (por órgão + defaults globais do sistema) e `limites_legais` (valores do art. 75 etc. com `vigencia_inicio/fim`, atualizáveis por decreto sem deploy):

```
parametros_licitacao: orgao_id?, tempo_inatividade_min, tempo_prorrogacao_min,
  intervalo_minimo_lances_min, tempo_aleatorio_min/max, lance_final_fechado_min,
  etapa_aberta_hibrida_min, cancelamento_direto_seg, prazo_intencao_recurso_min,
  prazo_recursal_dias_uteis, prazo_contrarrazoes_dias_uteis,
  percentual_empate_ficto_pregao, percentual_empate_ficto_demais,
  percentual_cota_maxima_mpe, validade_proposta_dias
limites_legais: chave (ex. DISPENSA_OBRAS, DISPENSA_OUTROS), valor, vigencia_inicio, vigencia_fim, fonte (decreto)
```
Resolução: parâmetro da licitação → parâmetro do órgão → default do sistema. A UI de configuração da licitação já grava por sessão; passa a herdar dessa cadeia.

### D3 — Máquina de estados declarativa por modalidade
Em vez de `if modalidade === ...` espalhado, um `TransicoesService` com definição declarativa: para cada modalidade, a sequência de fases válidas, pré-condições (documentos obrigatórios, prazos mínimos do art. 55, propostas existentes) e efeitos (datas, eventos, publicação PNCP). Pregão, concorrência, dispensa eletrônica, leilão e diálogo competitivo viram **configurações do mesmo motor**, não módulos paralelos. Credenciamento e contratação direta mantêm seus módulos, plugando no mesmo serviço de transições/auditoria.

### D4 — Modos de disputa como estratégias do motor
O timer por item ganha um conceito de **fase de disputa** (`ABERTA`, `FECHAMENTO_IMINENTE`, `FECHADA_FINAL`, `RANDOMICA`), e cada modo (aberto, aberto-fechado, fechado-aberto, fechado) é uma sequência de fases com regras de visibilidade de lances. Isso implementa os híbridos sem duplicar o motor.

### D5 — PNCP como efeito de transição
Publicações no PNCP (edital+itens ao publicar, retificações, resultado por item ao homologar, ata) disparam automaticamente nas transições de fase, com fila/retry e status visível (`pncp-sync` já existe como entidade). Nada de botão manual esquecível.

### D6 — Trilha de auditoria e atas versionadas
`audit.service` passa a persistir em tabela própria (append-only). Ata da sessão ganha snapshot versionado (gerada e congelada a cada evento destrutivo: reinício, suspensão, reabertura), assinável pelo fluxo de assinaturas existente.

## 5. Roadmap

### Fase 0 — Fundações de confiança (pré-requisito para tudo)
1. ⏳ Gerar migrations do schema atual e **desligar `synchronize` em produção**. — *lever `DB_SYNCHRONIZE` por env já entregue (PR fase0-fundacoes); falta gerar as migrations para poder pôr `false` em produção.*
2. ✅ Persistir auditoria em banco (tabela `audit_logs`), plugando os atos de sessão/licitação já emitidos. — *entregue: `AuditLogEntity` + `AuditService` persiste (fire-and-forget) + `GET /audit/logs`.*
3. ⏳ Testes do motor: registrar lance (5 validações + concorrência), timer/prorrogação, transições de fase da sessão. Meta: core de disputa coberto. — *pendente.*
4. ✅ Tabelas `parametros_licitacao` + `limites_legais`, migrando os defaults atuais; resolver a inconsistência 10min×30min da intenção de recurso. — *entregue: entidades + service (resolve órgão→sistema) + seed + tela de config; sessão herda os tempos. Intenção de recurso agora é parâmetro único (`prazo_intencao_recurso_minutos`, default 10).*
5. ⏳ Unificar dono do tempo: mover o que resta de timer do `sessao.service` para `disputa-v2` (ou vice-versa — um só). — *pendente.*

**Critério de saída**: rodar uma disputa simulada completa em homologação sem tocar em código para configurar prazos.

### Fase 1 — Pregão eletrônico fim a fim (modalidade âncora)
1. Completar pós-disputa: recursos (registro de razões no prazo recursal, contrarrazões, decisão do pregoeiro/autoridade) e **homologação** como ato explícito da autoridade competente.
2. ME/EPP completo: aceitar/recusar novo lance da ME/EPP convocada, com prazo (5min) e efeito no ranking; percentual 5%/10% parametrizado.
3. Validar intervalo mínimo entre lances e diferença mínima (colunas já existem).
4. Frontend: v3 vira a sala única do pregoeiro (integrar operação em tempo real da v2); criar a visão v3 do **fornecedor** (acompanhar negociação, ser convocado para habilitação, manifestar intenção de recurso, apresentar razões).
5. Ata versionada + assinatura digital da ata.
6. PNCP: publicar compra + itens + documentos ao publicar edital; publicar resultado por item na homologação (D5).

**Critério de saída**: um pregão de teste completo — do edital publicado à homologação com ata assinada e espelho no PNCP de homologação — conduzido por um usuário que não é dev.

### Fase 2 — Modos de disputa restantes + dispensa eletrônica
1. Implementar ABERTO_FECHADO e FECHADO_ABERTO no motor (D4), com testes de transição de fase.
2. Modo FECHADO puro (propostas lacradas + abertura).
3. Dispensa eletrônica (art. 75 §3º): fluxo de cotação com prazo mínimo em horas úteis, usando o mesmo motor com modo simplificado; validação automática contra `limites_legais`.

### Fase 3 — Demais modalidades e SRP
1. Concorrência: mesmas fases do pregão com inversão opcional de fases (habilitação antes do julgamento, art. 17 §1º) — vira flag da máquina de estados.
2. Leilão (maior lance) e concurso: variações de critério de julgamento no motor.
3. Diálogo competitivo: máquina própria (fases iterativas de diálogo) — deixar por último, demanda rara em municípios.
4. **Módulo ARP** (ata de registro de preços): gestão de saldo, adesões/caronas, publicação no PNCP — conecta com o módulo de contratos existente.

### Fase 4 — Fase interna fluida (plano já aprovado)
Executar `docs/plano-fase-interna-fluidez.md` (encadeamento Demanda→DFD→ETP→TR→Edital com modelo tipado, IA contextual, cockpit), agora amarrado à máquina de estados: a transição para `PUBLICADO` valida os documentos obrigatórios da fase interna automaticamente.

### Limpeza contínua (em cada fase)
- Aposentar `orgao/sala-disputa` e depois `orgao/disputa`; extrair tipos/cards/formatadores compartilhados de disputa.
- Depreciar campos ME/EPP antigos com migração.
- Decompor `orgao/licitacoes/[id]/page.tsx` (~2.500 linhas) em componentes por aba.

## 6. Estratégia de confiança para implantar em cliente

1. **Simulador de disputa**: script que cria licitação + N fornecedores robôs dando lances concorrentes (via socket) — roda em CI e valida ranking, timer e ata. É o teste que compra confiança de verdade.
2. **Piloto interno**: uma dispensa eletrônica real (menor risco jurídico, prazo curto) antes de um pregão real.
3. **Modo treinamento**: flag na licitação (`ambiente: TREINAMENTO`) que permite ao cliente ensaiar sem publicar no PNCP.
4. **Checklist legal por modalidade** exibido na transição de fase (o próprio sistema diz o que falta — já há base no `getDocumentosObrigatorios`).

## 7. Ordem sugerida de ataque imediato

1. Fase 0 inteira (é pequena em código e elimina os bloqueadores).
2. Recursos + homologação no backend (fecha o ciclo jurídico).
3. Sala única v3 com visão do fornecedor.
4. PNCP da fase externa.
