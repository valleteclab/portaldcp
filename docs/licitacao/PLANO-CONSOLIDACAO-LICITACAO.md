# Plano de Trabalho — Consolidação Técnica da Licitação

> Data: 24/09/2026 · Base legal: Lei 14.133/2021, LC 123/2006, IN SEGES 67/2021 e 73/2022
> Substitui, para fins de execução técnica, o roadmap de `PLANO-LICITACAO-COMPLETA.md` (que continua valendo como histórico e estratégia).
> Contexto de produto: a licitação passa a ser lançada como **plataforma de compras públicas** (art. 175 §1º) — ver memória/decisão de 24/09/2026.

## 0. Objetivo e regras do jogo

**Objetivo:** deixar **um único modelo de licitação**, funcional e completo, do edital ao contrato — sem caminhos paralelos, sem gambiarras, sem atalhos que "resolvem a tela" e deixam o dado errado.

**Fora deste plano (vem depois, em plano próprio):** MFA, auditoria imutável (hash encadeado), `synchronize` off + migrations, SLA/monitoramento, LGPD, segregação de ambientes. *Exceção:* falhas de segurança que **quebram a regra do negócio** (qualquer um dar lance em nome de outro, reiniciar sessão sem login) entram aqui, porque sem isso o modelo não é funcional.

**Regras que valem para todas as etapas:**
1. **Um ato, um caminho.** Cada ato jurídico (publicar, dar lance, aceitar, habilitar, adjudicar, homologar, revogar…) tem **um** método no backend e **uma** tela. O resto é apagado, não "deixado por compatibilidade".
2. **O backend é dono da regra.** A tela nunca decide fase, vencedor ou valor; ela pede o ato e mostra o resultado. Valor homologado é calculado, não digitado.
3. **Toda mudança de fase passa pela máquina de estados** — nada de `licitacao.fase = ...` espalhado.
4. **Nenhum placeholder em produção:** PDF em branco, número aleatório, `localStorage` como banco, "em breve", `alert()`/`prompt()` como fluxo.
5. **Teste antes de apagar.** Cada etapa começa com teste que prova o comportamento esperado e termina com o código legado removido.
6. **O que não for suportado é bloqueado explicitamente** (ex.: critério técnica e preço) — nunca aceito e julgado errado em silêncio.

---

## 1. Diagnóstico (levantamento de 24/09/2026)

### 1.1 O que está sólido e será a base
- **Dispensa eletrônica** fim a fim: instrução art. 72, divulgação com 3 dias úteis, PNCP automático (aviso, resultado, contrato), janela de lances com prorrogação, chat, julgamento, contrato com termo gerado + assinatura + PNCP.
- **Motor de lances `disputa-v2`**: lock pessimista, prorrogação, anonimização, cancelamento de lance.
- **Cockpit do processo** (`/orgao/processos/[id]`), **seleção externa**, **recursos** (`RecursoAdministrativo`, testado), **parâmetros por órgão**, **integração PNCP** (métodos de compra/itens/resultado/ata/contrato existem).

### 1.2 Os problemas (por gravidade)

**Quebram o resultado jurídico (bloqueadores):**
| # | Problema | Onde |
|---|---|---|
| B1 | **Pregão conduzido pela sala nunca gera contrato**: `sessao.adjudicar*` só grava evento (item não vira ADJUDICADO); `sessao.homologar` não gera contrato nem PNCP; `gerarContratoAutomatico` exige ADJUDICADO | `sessao.service.ts:1228,1480,1527`; `contratos.service.ts:2466` |
| B2 | **Valor homologado inflado**: lance de pregão guarda total do item, mas homologação/ata multiplicam por quantidade de novo; dispensa e lote guardam unitário | `sessao.service.ts:1559-1568,1704`; `disputa.service.ts:449,1736` |
| B3 | **Vencedor pode ser o inabilitado**: reprovar habilitação não marca o licitante; adjudicar/homologar pegam o menor lance de qualquer um | `sessao.service.ts:1083-1192,1491,1548` |
| B4 | **Rankings divergentes**: disputa ordena por lance; habilitação/negociação/recurso ordenam por `valor_total_proposta` e filtram status (`VALIDA`, `SEGUNDA_COLOCADA`) que não existem no enum | `sessao.service.ts:1149,1183,1272,1355` |
| B5 | **Critério de julgamento ignorado**: tudo é menor preço; leilão seria vencido pelo MENOR lance; PNCP recebe `criterioJulgamentoId: 1` fixo | vários; `pncp.service.ts:1713,1876` |
| B6 | **Lance sem autenticação**: REST `disputa-v2` inteiro `@Public`; sockets `/sessao`, `/disputa-v2` e `/` sem auth, confiam no `usuarioId` do cliente; `fornecedorId` vem do body; `reiniciar_disputa` (que APAGA lances) aberto | `disputa.controller.ts:23-201`; `sessao.gateway.ts`; `sessao.service.ts:904` |
| B7 | **Sessão trava em DISPUTA**: v2 encerra itens mas nunca avança etapa da sessão nem fase da licitação | `disputa-v2` |
| B8 | **Negociação "encerrar" inalcançável** (rota `:fornecedorId` declarada antes de `encerrar`) | `sessao.controller.ts:174/182` |
| B9 | **Ata da sessão provavelmente quebra** (`f.cnpj` × coluna `cpf_cnpj`, erro engolido) e nunca é salva/versionada/assinada | `sessao.service.ts:1657,1671,2069,2925` |
| B10 | **SRP gera contrato em vez de ata**; ARP não copia vencedores/itens; `recalcularValorAta` zera o saldo usado | `contratos.service.ts`; `atas.service.ts:42,207` |

**Caminhos paralelos (fragmentação):**
- **5 formas de registrar lance** (lances legado, sessao, sessao-lote, sessao-MPE, disputa-v2) + dispensa em tabela própria; **4 namespaces WebSocket** (`/`, `/sessao`, `/disputa-v2`, `/dispensa`); **3 relógios** (cron v2, setInterval do legado, cálculo repetido 3×); **4 lugares de chat**; **3 anonimizações**.
- **5 caminhos de adjudicação, 4 de homologação** (licitacoes, sessao, avancar-fase, itens).
- **22 pontos** que alteram `licitacao.fase` sem máquina de estados; **3 máquinas de estado** paralelas (fase da licitação, etapa da sessão, status do item); `RECURSO`, `DESERTO`, `FRACASSADO`, `CONCLUIDO` nunca são atribuídos.
- **Telas:** 3 salas do pregoeiro + 3 do fornecedor; 2 "casas" da licitação (detalhe 2.516 linhas × cockpit); 4 formas de criar licitação; 3 UIs de fase interna; 2 modelos de aprovação; 4 implementações de homologação na UI.

**Incompleto (o fluxo existe só pela metade):**
- Modos **ABERTO_FECHADO / FECHADO_ABERTO / FECHADO**: só enum e texto (a própria tela diz que "é operado pela V2" — falso).
- **Aceitação da proposta** pós-disputa não existe; **ME/EPP** não checa porte, não é chamado automaticamente, sem prazo, e a UI coloca depois da habilitação.
- **Habilitação**: fornecedor não envia documento na licitação; checklist do pregoeiro vive só no navegador; cadastro de fornecedor (`verificarHabilitacao`) não é usado; documento nunca vence.
- **Fornecedor na sala**: sem negociação, sem envio de habilitação, sem intenção/razões/contrarrazões de recurso (o pregoeiro digita pelo fornecedor); perde o botão da sala após o julgamento; `participacoes` é tela estática.
- **Publicação**: pregão/concorrência sem gate de documentos, sem prazos do art. 55, sem feriados; edital enviado ao PNCP é **PDF em branco**; sem retificação/republicação; impugnação acolhida não altera nada; cron fecha impugnação cedo.
- **Suspender/revogar/anular** sem guarda, sem contraditório, sem aviso, sem PNCP, `retomar` perde a fase anterior; **deserta/fracassada** inexistentes na licitação.
- **PNCP** automático só na dispensa; pregão/concorrência/inexigibilidade manuais; contrato vai ao PNCP **antes** de assinado e a versão assinada nunca é retificada; sem reenvio automático de falhas; bugs de mapeamento (`materialOuServico` sempre 'M', `anoCompra` do `created_at`, datas "+30 dias").
- **Diferença mínima entre lances** não validada; parâmetros resolvidos só no caminho `sessao` (v2/v3/dispensa ignoram).
- **Testes**: não há teste de `SessaoService`, `registrarLance`, timer, homologação, ata, ME/EPP, lote, contrato automático; o e2e de pregão para antes da habilitação.

---

## 2. Modelo-alvo (como fica quando terminar)

### 2.1 Escopo funcional — o que a lei pede (decisão do usuário 24/09: "é o que a lei pede, temos que fazer")

**Princípio:** o modelo nasce completo para tudo o que a Lei 14.133 e as INs exigem; a **liberação** para clientes é gradual (dispensa → pregão → concorrência → credenciamento → leilão → concurso → diálogo), cada uma só depois de a anterior ser validada em uso real.

**Modos de disputa (Lei 14.133 art. 56; IN SEGES 73/2022 arts. 22–25)**
| Modo | Regra | Permitido com |
|---|---|---|
| Aberto (IN 73 art. 23) | lances públicos sucessivos; 10 min iniciais; prorroga 2 min a cada lance nos últimos 2 min; encerra sem lance na prorrogação | menor preço, maior desconto, maior lance |
| Aberto e fechado (art. 24) | etapa aberta 15 min → aviso de fechamento iminente → aleatório até 10 min → **lance final fechado em 5 min** para o melhor + propostas até 10% (mínimo 3 melhores) | menor preço, maior desconto, técnica e preço |
| Fechado e aberto (art. 25) | propostas fechadas → melhor + até 10% (mínimo 3) vão para lances abertos (regra do art. 23) | menor preço, maior desconto, técnica e preço |
| Fechado | só propostas lacradas, sem lances | **vedado isolado para menor preço/maior desconto** (art. 56 §1º); usado em técnica e preço / melhor técnica |
| Aberto isolado | — | **vedado para técnica e preço** (art. 56 §2º) |

Regras comuns (IN 73): lance só abaixo do **próprio** último (art. 21 §2º); **intervalo mínimo de diferença** previsto no edital, vale para intermediários (art. 22 §1º; lei art. 56 §3º); exclusão do próprio lance em 15 s (art. 21 §3º); melhor lance em tempo real sem identificação (art. 21 §6º); valor mínimo/desconto máximo parametrizável e sigiloso (art. 19); reinício da disputa para as demais colocações quando diferença ≥ 5% (art. 23 / lei art. 56 §4º); margem de preferência eleva os 10% para 20% (Decreto 11.890/2024); desconexão > 10 min suspende e reinicia 24 h após comunicação (art. 27); desempate pelo art. 60 da lei e, persistindo, **sorteio em ato público** (art. 28).

**Critérios de julgamento (lei art. 33)** — todos implementados, com a modalidade que os admite:
| Critério | Onde |
|---|---|
| Menor preço, maior desconto | pregão, concorrência, dispensa |
| Melhor técnica ou conteúdo artístico | concorrência, concurso |
| Técnica e preço (ponderação art. 36) | concorrência |
| Maior retorno econômico (art. 39) | concorrência (contrato de eficiência) |
| Maior lance | leilão |

**Modalidades e procedimentos**
| Modalidade / procedimento | Base | Observação |
|---|---|---|
| Pregão eletrônico | art. 29; IN 73 | bens e serviços comuns; menor preço/maior desconto |
| Concorrência eletrônica | art. 29; IN 73 | todos os critérios exceto maior lance; inversão de fases (art. 17 §1º) |
| Dispensa eletrônica | art. 75 §3º; IN 67/2021 | aviso 3 dias úteis; janela de lances |
| Inexigibilidade | art. 74 | instrução art. 72 |
| **Credenciamento** | arts. 78 I e 79 | procedimento auxiliar; contratação dos credenciados por inexigibilidade (art. 74 IV); edital no PNCP |
| Leilão | art. 31 | maior lance; leiloeiro/servidor; bens móveis/imóveis |
| Concurso | art. 30 | melhor técnica/artístico, prêmio, comissão julgadora |
| Diálogo competitivo | art. 32 | fases de diálogo + fase competitiva (60 dias úteis) |
| **Transversal** | | SRP/ARP (arts. 82–86), lotes, ME/EPP (LC 123 arts. 44–48), margem de preferência, seleção externa |

**Prazos mínimos de divulgação (lei art. 55 / IN 73 art. 17):** bens menor preço/maior desconto 8 dias úteis; serviços comuns e obras/serv. comuns de engenharia 10; serviços especiais e obras/serv. especiais 25; contratação integrada 60; semi-integrada 35; demais casos de técnica e preço/melhor técnica 35 (lei art. 55 II); leilão 15 dias úteis (art. 55 III); técnica/artística 35 (art. 55 IV).

> ⚠️ Números do IN 73 conferidos em resumo da página oficial (gov.br/compras); antes de codificar cada etapa, conferir o artigo no texto oficial e citar no código/teste.

### 2.2 Arquitetura do backend
```
licitacoes/            cadastro + TransicoesService (máquina de estados ÚNICA)
publicacao/            publicar, retificar, republicar, prazos (art. 55 + calendário de feriados)
disputa/               (ex-disputa-v2) motor ÚNICO: lances, relógio, modos, lote, chat, anonimização
                       1 gateway /disputa com JWT · lances de pregão/concorrência/dispensa na mesma tabela
julgamento/            ranking por critério, aceitação, ME/EPP, negociação
habilitacao/           convocação, documentos do licitante, análise, inabilitação → próximo
recursos/              (já existe) intenção → razões → contrarrazões → decisão, com efeito no resultado
resultado/             adjudicação por item, homologação, deserta/fracassada, geração de contrato OU ata
atas/                  ARP a partir do resultado, saldo, adesão
pncp/                  fila (outbox) com reenvio automático; disparado pelas transições
```
**Apagados ao final:** `lances/` (módulo e gateway `/`), `sessao/` como motor paralelo (o que sobrar de útil migra), gateway `/sessao`, `disputa-v3/` como módulo separado (o presenter vai para `disputa/`), gateway `/dispensa` (vira sala do motor único), `iniciar-disputa`, `itens/:id/adjudicar|homologar|deserto|fracassado`, `PncpPublicacaoService` mock, `/api/api/lotes`.

### 2.3 Decisões de modelo de dados
- **Estado:** `licitacao.fase` = fase do processo; **`licitacao.situacao`** separada (ATIVA, SUSPENSA, REVOGADA, ANULADA, DESERTA, FRACASSADA, CONCLUIDA); `fase_anterior` para retomar; tabela **`licitacao_transicoes`** (de, para, ato, usuário, motivo, data). A etapa da sessão pública deixa de ser uma segunda máquina independente: é derivada/sincronizada pelas transições.
- **Status por item** continua (item pode ser deserto/fracassado sozinho) e a licitação faz o *roll-up* (todos desertos → DESERTA etc.).
- **Lance:** `fornecedor_id` obrigatório (acaba `fornecedor_identificador` como chave), `valor_unitario` **e** `valor_total` explícitos, `base_lance` da licitação (UNITARIO | TOTAL_ITEM | TOTAL_LOTE), `origem` (PROPOSTA, LANCE, LANCE_FECHADO, DESEMPATE_MPE, NEGOCIACAO, JANELA_DISPENSA). Dispensa migra de `dispensa_lances` para cá.
- **Licitante no item:** situação do licitante por item (CLASSIFICADO, DESCLASSIFICADO, ACEITO, HABILITADO, INABILITADO, VENCEDOR) — é o que o ranking consulta para "chamar o próximo".
- **Valor homologado** = soma calculada dos itens adjudicados; nunca vem do body.
- **Campos legados removidos com migração:** `exclusivo_mpe`, `cota_reservada`, `percentual_cota_reservada` (lote e licitação), `pregoeiro_nome`, `equipe_apoio` (JSON string → tabela), estado PNCP duplicado na licitação (fica só `pncp_sync`), `item_atual_id`/tempos na sessão.

---

## 3. Etapas de trabalho

Cada etapa = 1 ou mais PRs, com critério de pronto verificável. A ordem importa: **E1 e E2 primeiro** porque sem máquina de estados e motor único todo o resto seria construído em cima de areia.

### E0 — Rede de segurança (antes de mexer) · tamanho M
1. **e2e de pregão completo** (hoje para no ranking): edital → propostas → disputa → aceitação → habilitação → recurso → adjudicação → homologação → contrato → PNCP (mock HTTP). Escrito contra o comportamento **desejado**; vai falhar nos bloqueadores B1–B9 e servir de régua.
2. **e2e da dispensa** (hoje sem teste) cobrindo o fluxo que já funciona — garante que a consolidação não quebre o que está em produção.
3. **Simulador de disputa**: N fornecedores robôs por socket dando lances concorrentes; valida ranking, prorrogação, encerramento e ata. Roda no CI.
4. Fixtures de banco (órgão, fornecedores ME/EPP e demais, licitação por modalidade).

**Pronto quando:** os três rodam no CI; o de dispensa passa; o de pregão falha exatamente nos pontos do §1.2.

**E0 CONCLUÍDA (24/09/2026)** — `backend/test/`: infra (Postgres descartável), `dispensa-eletronica` (45: 36 ok + 9 defeitos), `pregao-eletronico-completo` (53: 36 ok + 17 defeitos — B1–B9 confirmados), `isolamento-dados-licitacao` (92: 10 seguros + **82 vazamentos confirmados por execução**), `simulador-disputa` (13: 10 robôs × 2 itens × 2 licitações). 211/211 verdes (defeitos como `test.failing`: quando um for corrigido, o teste acusa e vira `test` normal).

Achados novos da E0 (não estavam no §1.2):
- **Cron triplicado** (`ScheduleModule.forRoot` em 3 módulos) — corrigido na PR #489 junto com leitura de arquivos fora de uploads e credenciais nas respostas.
- **Isolamento — 82 falhas**, as críticas: REST `disputa-v2` e sockets `/sessao`, `/disputa-v2` e `/` aceitam atos **sem login** (lance, reiniciar, encerrar, chat como pregoeiro); rotas do `sessao` só exigem "ter token" (órgão B/fornecedor iniciam, adjudicam e homologam sessão de A); `licitacoes`, `parametros`, `atas`, `credenciamento`, `documentos` sem checagem de órgão; propostas criadas/alteradas/excluídas em nome de outro fornecedor; lance de item de outra licitação aceito; orçamento sigiloso exposto em rota pública.
- **Simulador:** lance gravado mas o fornecedor recebe "erro" e ninguém recebe o aviso (corrida na anonimização); código anônimo repetido entre fornecedores; razão social nos eventos `participante_entrou`/`novo_lance`; dois lances intermediários iguais no mesmo ms aceitos.
- **Pregão:** publicar pregão não envia compra ao PNCP; abertura com menos de 8 dias úteis aceita; diferença mínima do edital não validada; PNCP resultado com `ordemClassificacao: 1` e `aplicacaoBeneficioMeEpp: false` fixos.
- **Dispensa:** painel público mostra o menor valor antes do fim do acolhimento; `?fornecedorId=` no painel expõe valor de outro; fornecedor consegue julgar; prazo de entrega do contrato sempre 30 dias.

### E1a — Blindagem de acesso (NOVA, antes da E1) · tamanho G
Motivo: os 82 vazamentos incluem atos **sem login** em produção (a dispensa já está em uso). Não dá para esperar a E2.
1. **Guarda de papel e órgão reutilizável** (decorators): `@SomenteOrgao()` (ORGAO/USUARIO do mesmo órgão da licitação/sessão/ata/credenciamento/documento), `@SomenteFornecedor()` (identidade SEMPRE do JWT), leitura pública explícita e mínima. Aplicada em licitacoes, sessao, disputa-v2, disputa-v3, propostas, itens, parametros-licitacao, atas, credenciamento, documentos, impugnações/esclarecimentos (resposta).
2. **Sockets** (`/disputa-v2`, `/sessao`, `/dispensa`, `/`): autenticação no handshake (JWT), sala só para quem participa (fornecedor com proposta / órgão dono), ações de pregoeiro só para o órgão dono; identidade nunca do payload. O gateway `/` (legado `lances`) e o `/sessao` passam a recusar escrita (serão removidos na E2).
3. **Propostas e lances:** `fornecedor_id` do token; checagem de dono em ler/alterar/excluir; item precisa pertencer à licitação da sessão; 409 sem id alheio.
4. **Dados públicos mínimos:** sem razão social/ids nos eventos durante a disputa; orçamento sigiloso fora das rotas públicas; `melhor_lance_fornecedor_id` fora da leitura pública; painel da dispensa sem `?fornecedorId=` de terceiros e respeitando o sigilo.
5. **Frontend:** ajustar as telas que mandavam `fornecedorId`/`tipo` no corpo/socket para usar só o token.

**Pronto quando:** os 82 `test.failing` de `isolamento-dados-licitacao` viram testes normais e passam; dispensa e pregão continuam verdes.

**Pendências herdadas pela E1a (resolver nas etapas indicadas):**
- Razões/contrarrazões ainda aceitam registro pelo órgão dono em nome do licitante (o `RecursosPanel` faz assim) → E5 cria a tela do fornecedor e restringe ao próprio recorrente.
- `item_encerrado` revela o vencedor de um item enquanto outros itens ainda estão em disputa (risco de conluio entre itens) → E2: identidade só após o fim da etapa de lances da sessão inteira.
- Corrida da anonimização (código repetido; lance gravado com "erro" ao fornecedor) → E2.

### E1 — Máquina de estados única · tamanho G
1. `TransicoesService` declarativo: por modalidade, fases válidas, pré-condições (documentos, prazos, propostas, resultado) e efeitos (datas, eventos, PNCP, notificações).
2. Substituir os **22 pontos** que alteram `fase` (licitacoes, scheduler, sessao, pncp, fase-interna, admin-testes) por chamadas ao serviço. `avancarFase` genérico e `retrocederFase` livre deixam de existir — cada transição é um ato nomeado.
3. `situacao` separada, `fase_anterior`, histórico `licitacao_transicoes`.
4. **Suspender / retomar / revogar / anular** com guarda por fase (ex.: não revoga com contrato assinado sem desfazer), motivo obrigatório, prazo de manifestação (art. 71 §3º) para revogar/anular, notificação aos licitantes, cancelamento de sessão e PNCP.
5. **Deserta / fracassada**: roll-up automático a partir dos itens; ato explícito quando sem propostas (substitui o erro de hoje no julgamento da dispensa).
6. Scheduler passa a só **pedir** transições por prazo (acolhimento, fim de impugnação) — e respeita `data_limite_impugnacao`.
7. Fase interna: um só gate — `avancarFaseInterna` com documentos obrigatórios vale para todas as modalidades (hoje só dispensa/inexigibilidade).

**Pronto quando:** `grep "fase ="` fora do `TransicoesService` retorna zero; teste de tabela de transições por modalidade; RECURSO/DESERTO/FRACASSADO/CONCLUIDO atingíveis.

**E1 — núcleo CONCLUÍDO (24/09/2026)** — `backend/src/licitacoes/transicoes/`:
- `TransicoesService.executar(id, ato, { ator, motivo, dados, aplicar, manager, ignorarSeJaAplicado })`: transação + `SELECT … FOR UPDATE` na licitação, valida fase/situação (409) e pré-condições (400 com a lista de pendências), aplica destino/efeitos, grava `licitacao_transicoes` e emite evento (`TransicoesEventos`). Definição declarativa por modalidade em `definicoes.ts` (núcleo puro em `maquina.ts`).
- `licitacao.situacao` (ATIVA, SUSPENSA, REVOGADA, ANULADA, DESERTA, FRACASSADA, CONCLUIDA) + `fase_anterior`; valores SUSPENSO/REVOGADO/… de `FaseLicitacao` ficam só por compatibilidade (@deprecated, nunca atribuídos). Migração dos dados legados: `migracao-situacao.ts` (roda no boot — `MigracaoSituacaoBootService` — e na migration `20260924000001-SituacaoLicitacao`).
- `licitacoes.service` todo nos atos (avancar-fase = ato principal da fase; retroceder-fase = ato de retorno; `POST /licitacoes/:id/atos/:ato`; `GET /licitacoes/:id/atos` e `/transicoes`; `atos_disponiveis` no processo-completo). Roll-up deserta/fracassada ligado a `itens/:id/deserto|fracassado`.
- **Falta (próximas partes da E1)** — trocar os setters diretos pelos atos:
  - `sessao.service.ts:136` → `ENCERRAR_ACOLHIMENTO` (ignorarSeJaAplicado) · `:202` → `INICIAR_DISPUTA` · `:1092`/`:1342` → `ENCERRAR_DISPUTA` (se em disputa) + `INICIAR_HABILITACAO` · `:1252` e `:1514` → `ADJUDICAR` (ou `DECIDIR_RECURSOS` se em RECURSO) · `:1573` → `HOMOLOGAR` (com `aplicar` gravando valor/itens).
  - `pncp.service.ts:773`/`:810`/`:871` → `PUBLICAR` com `ignorarSeJaAplicado: true` e `dados.data_publicacao_edital` · `:2824` → `CANCELAR_PUBLICACAO` (motivo = justificativa; destino APROVACAO_INTERNA, só sem propostas).
  - `fase-interna.service.ts:608` (importação) → criar em PLANEJAMENTO + `registrarCriacao` + `CONCLUIR_FASE_INTERNA` · `:776` → `CONCLUIR_FASE_INTERNA` · `:803` → ato da etapa (`CONCLUIR_PLANEJAMENTO`/`_TERMO_REFERENCIA`/`_PESQUISA_PRECOS`/`_ANALISE_JURIDICA`) e, na última, `CONCLUIR_FASE_INTERNA`; mover o gate documental para pré-condição (E1.7).
  - `licitacoes-scheduler.service.ts:72`/`:132` → `INICIAR_ACOLHIMENTO` · `:100`/`:142` → `ENCERRAR_ACOLHIMENTO` (ator `SISTEMA/scheduler`, `ignorarSeJaAplicado`; já filtra `situacao = ATIVA`) e respeitar `data_limite_impugnacao`.
  - `admin-testes.service.ts:274` (SQL) → ajustar datas e chamar `ENCERRAR_ACOLHIMENTO`.

### E2 — Motor de disputa único · tamanho G
1. `disputa-v2` vira `disputa/` e absorve o que o `sessao` faz de sessão pública: criar/iniciar/suspender/retomar/encerrar sessão, iniciar itens, lote.
2. **Um único `registrarLance`** (o da v2, que tem lock): acrescentar diferença mínima (valor ou %), regra de lote, lance fechado; apagar os outros 4 caminhos e o módulo `lances`.
3. **Um único relógio** (cron da v2), com `TEMPO_ALEATORIO` real; apagar o `setInterval` do legado, o cron morto do `sessao` e as cópias do cálculo.
4. **Todos os modos do art. 56 / IN 73** como estratégias do mesmo motor: aberto (10 min + prorrogação 2 min), aberto-fechado (15 min + aleatório até 10 min + lance final fechado 5 min, melhor + 10%/mín. 3), fechado-aberto (classificação automática melhor + 10%/mín. 3 → aberto), fechado (sem lances); validação da combinação modo × critério (vedações do art. 56 §§1º e 2º); reinício para demais colocações (≥ 5%); valor mínimo sigiloso; margem de preferência (20%); maior lance em ordem decrescente (leilão/maior desconto); suspensão por desconexão > 10 min com reinício em 24 h.
5. **Lote**: disputa pelo total do lote com rateio proporcional documentado para os itens; mesma tabela de lances.
6. **Unidade do valor corrigida** (`valor_unitario` + `valor_total` + `base_lance`) — fim do B2; migração dos lances existentes.
7. **Dispensa** usa o mesmo motor em modo JANELA (regra IN 67: reduzir o próprio valor; menor valor público e anônimo; prorrogação opcional). Apaga `dispensa_lances`, gateway `/dispensa` e o chat próprio. *Decisão (24/09): plataforma única, como Compras.gov e demais — a dispensa é um procedimento da mesma sala. O que é maduro na dispensa é a **camada de processo** (instrução art. 72, gate de divulgação, sigilo, PNCP automático, contrato com termo e assinatura) — essa camada vira o padrão para todas as modalidades. O **registro de lance** da dispensa é o mais frágil (sem transação/lock, `fornecedor_id` vem do body) — por isso ele é que migra para o motor, não o contrário. Migração com conferência dos lances existentes antes/depois.*
8. **Segurança do ato**: gateway `/disputa` único com JWT; fornecedor identificado pelo token (nunca pelo body/cliente); REST sem `@Public` para escrita; leitura pública só do que é público (lances anônimos, eventos); `buscar_lances_item` sem bypass de anonimização.
9. **Reinício** só com ata congelada antes e cancelamento lógico (nunca DELETE).
10. **Chat único** (eventos da sessão) respeitando `chat_desabilitado`; anonimização única (`mapeamento_anonimo`).
11. **Todos os parâmetros** lidos do resolvedor por órgão (hoje 6 parâmetros nunca são lidos: cancelamento, intenção de recurso, cota MPE, validade, lance fechado, etapa aberta híbrida).
12. Ao encerrar o último item, o motor **pede a transição** para julgamento (fim do B7).

**Pronto quando:** existe um só namespace, um só `registrarLance`, uma só tabela de lances; simulador passa para aberto, aberto-fechado, lote e janela de dispensa; teste de segurança: lance com token de outro fornecedor é recusado.

### E3 — Julgamento, ME/EPP, negociação · tamanho M
1. `RankingService` único **por critério** (todos os do art. 33: menor preço, maior desconto, maior lance em ordem decrescente, técnica e preço com ponderação do art. 36, melhor técnica, maior retorno econômico) usando lances + notas técnicas + situação do licitante; usado por disputa, aceitação, habilitação, recursos e resultado (fim do B4/B5). Desempate art. 60 + sorteio público registrado.
2. **Aceitação da proposta** (nova etapa, IN 73 art. 29): pregoeiro aceita/recusa a proposta do 1º colocado com motivo; fornecedor envia proposta adequada ao último lance em **mínimo 2 h, prorrogável** (a pedido ou de ofício); análise de exequibilidade (art. 59); recusa chama o próximo.
2b. **Julgamento técnico** (técnica e preço / melhor técnica / concurso): comissão atribui notas por quesito do edital, registradas por membro, com ponderação e publicação das notas antes da fase de preço.
3. **ME/EPP (LC 123 art. 44/45)**: logo após o encerramento do item, antes da aceitação; checa porte declarado; empate ficto 5% (pregão) / 10% (demais); convoca automaticamente com prazo de 5 min; aceitar/recusar pelo **fornecedor** na sala; sem resposta → próximo ME/EPP no intervalo; tratamento de exclusivo e cota reservada (≤25%).
4. **Negociação** (art. 61): pregoeiro propõe, fornecedor responde contraproposta na sala; valor negociado vira lance de origem NEGOCIACAO; rota corrigida (B8).

**Pronto quando:** e2e passa por aceitação, empate ficto com ME/EPP (aceita e recusa) e negociação; leilão/técnica e preço recusados na criação.

### E4 — Habilitação real · tamanho M
1. Exigências de habilitação definidas no edital (lista por licitação, com modelos padrão por modalidade).
2. Convocação do aceito com **prazo mínimo de 2 h, prorrogável** (IN 73 art. 39 §5º); documentos exigidos só do vencedor, salvo inversão (art. 39 §2º); sem substituição, só complementação por diligência (art. 39 §4º); fornecedor envia documentos **pela sala/portal**; reaproveita documentos válidos do cadastro (`verificarHabilitacao`) em vez de pedir de novo.
3. Análise por documento persistida no banco (fim do checklist no navegador); diligência (pedir complemento); inabilitar marca o licitante no item e chama o próximo pelo ranking de lances (fim do B3).
4. Job de vencimento de documentos do cadastro.
5. Inversão de fases (concorrência): habilitação antes do julgamento como configuração da máquina de estados.

**Pronto quando:** e2e com inabilitação do 1º e habilitação do 2º; vencedor final nunca é inabilitado.

### E5 — Recursos com efeito · tamanho P
1. Intenção de recurso registrada **pelo fornecedor** na sala, imediatamente, em janela de **mínimo 10 min** após julgamento/habilitação, sob pena de preclusão (lei art. 165 §1º I; IN 73 art. 40); pregoeiro admite/recusa com motivo.
2. Razões em **3 dias úteis** e contrarrazões em **3 dias úteis** (lei art. 165; IN 73 art. 40 §§1º–2º), enviadas pelos próprios fornecedores (fim do "pregoeiro digita pelo recorrente"); prazos com **feriados** e **bloqueio** após o prazo; reconsideração pelo agente em 3 dias úteis e encaminhamento à autoridade (art. 165 §2º).
3. Decisão PROVIDO produz efeito: volta a licitação à etapa atingida (aceitação/habilitação) via máquina de estados; apaga os eventos antigos de intenção paralelos.

**Pronto quando:** e2e com recurso provido que reverte habilitação e muda o vencedor.

### E6 — Resultado único: adjudicação, homologação, contrato, ARP · tamanho M
1. `ResultadoService`: **adjudicar por item** grava vencedor, valores e status ADJUDICADO; **homologar** é um só método (autoridade, data, valor calculado) — usado por pregão, concorrência, dispensa e seleção externa. Apaga os outros 3 caminhos de homologação e os endpoints de item soltos.
2. Pós-homologação: **não-SRP → contrato** (gerar, colher assinaturas, `data_assinatura` só na última assinatura); **SRP → ARP** com itens, vencedores, preços e cadastro de reserva, já assinável.
3. **ARP**: saldo correto (sem zerar ao editar), consumo ligado a contrato/ordem, vigência com job de expiração, **adesão (carona)** com pedido, aceite do fornecedor, limites do art. 86 (50% por órgão, 2× no total), telas de detalhe e utilização (hoje 404) e entrada no menu.
4. Prazo de entrega do contrato lido da proposta vencedora (hoje cai em 30 dias fixos após o julgamento da dispensa).
5. Demanda e item do PCA atualizam status automaticamente (licitação iniciada → contratado).

**Pronto quando:** e2e de pregão chega ao contrato assinado; e2e de pregão SRP chega à ARP com adesão; valores homologados batem com os lances (teste de regressão do B2).

### E7 — Publicação, prazos, eventos e PNCP · tamanho G
1. **Gate de publicação** para todas as modalidades: documentos obrigatórios (edital, TR, minuta, ETP quando couber, parecer), **prazos mínimos do art. 55** por objeto/critério, ordem coerente das datas.
2. **Calendário de feriados** (nacionais + municipais por órgão) usado por todo cálculo de dias úteis (dispensa, art. 55, recursos, impugnação).
3. **Edital real** gerado/anexado e enviado ao PNCP (fim do PDF em branco em todas as modalidades); documentos do módulo `documentos` publicados.
4. **Retificação / republicação**: editar após publicar gera versão do edital, decide se reabre prazo (art. 55 §1º) e retifica no PNCP; impugnação acolhida com `altera_edital` dispara esse fluxo.
5. **Impugnação e esclarecimento**: prazo-limite (3 dias úteis antes da abertura), resposta com prazo, publicação da resposta; formulário público sem cadastro (cidadão); guard de perfil em `responder`.
6. **PNCP como fila (outbox)**: toda publicação vira registro em `pncp_sync` processado por job com reenvio (backoff) e painel de pendências — fim do *fire-and-forget* e dos `catch {}` silenciosos.
7. **PNCP automático em todas as transições**: publicar (compra+itens+edital) para pregão/concorrência/inexigibilidade, retificação, suspensão/revogação/anulação/deserta/fracassada (situação da compra), resultado por item, ARP, contrato **somente após assinado** (e retificação se já enviado).
8. Correções de mapeamento: `materialOuServico` do tipo real do item, `anoCompra` da data de publicação, sem datas "+30 dias" inventadas, critério/amparo legal/modo de disputa vindos da licitação.

**Pronto quando:** e2e de pregão publica e homologa no PNCP de treinamento com todos os documentos reais; falha simulada do PNCP é reenviada sozinha.

### E7b — Credenciamento ligado ao processo · tamanho M
*Decisão (24/09): agora.*
1. Credenciamento passa a ser um **processo** da mesma base (fase interna, instrução, edital, cockpit), com tipo de procedimento auxiliar (art. 78 I) e hipóteses do art. 79 (paralela e não excludente; seleção a critério de terceiros; mercados fluidos).
2. Edital publicado no PNCP (hoje as colunas existem e nunca são preenchidas); inscrição aberta durante a vigência do edital; análise de documentos reaproveitando a habilitação da E4; guarda de estado em iniciar/encerrar.
3. **Contratação do credenciado** por inexigibilidade (art. 74 IV) gerando contrato pelo `ResultadoService` (E6), com regra de distribuição do edital (rodízio/sorteio/escolha do beneficiário) registrada; validade do credenciamento vinda do edital (fim do 1 ano fixo).
4. Telas: credenciamento no cockpit; inscrição pública com link funcionando (`/credenciamento/:id/inscrever` hoje 404).

### E7c — Leilão, concurso e diálogo competitivo · tamanho G
Último bloco, liberado depois de pregão e concorrência validados — mas o **motor** já nasce preparado (E2/E3).
1. **Leilão** (art. 31): critério maior lance (ordem decrescente), bens com avaliação, leiloeiro oficial ou servidor designado, pagamento/arrematação e edital com prazo de 15 dias úteis.
2. **Concurso** (art. 30): trabalho técnico/científico/artístico, comissão julgadora, prêmio/remuneração, cessão de direitos (art. 93).
3. **Diálogo competitivo** (art. 32): pré-seleção, fases de diálogo com registro em ata e gravação, sigilo das soluções, fase competitiva com prazo de 60 dias úteis.

### E8 — Telas: um caminho por papel · tamanho G
**Órgão**
1. **Cockpit `/orgao/processos/[id]` é a casa única** da licitação (todas as modalidades). O detalhe de 2.516 linhas é desmontado: o que for ação vai para o cockpit (em componentes por etapa), o que for página própria fica como sub-rota do processo.
2. **Criação única:** demanda → processo, ou "novo processo" (wizard da fase interna de 8 passos) → cockpit. Apagar `licitacoes/nova` + `nova/fase-interna` (que perde os documentos no localStorage) e `licitacoes/[id]/fase-interna`.
3. **Fase interna:** o módulo `fase-interna` é o único; dossiê ganha saída para "publicar" (hoje beco sem saída); aprovações unificadas no modelo de fluxo por etapa (`orgao/aprovacoes`), apagando a aprovação por documento duplicada.
4. **Sala única do pregoeiro** `/orgao/processos/[id]/sessao` (ex-v3) com seletor de sessão, todas as etapas com painel real (aceitação, ME/EPP, negociação, habilitação, recursos, adjudicação, homologação) e ata; apagar `orgao/disputa`, `orgao/sala-disputa`, `licitacoes/[id]/{sala,sessao,habilitacao,homologacao,propostas}` duplicados.
5. Trocar `alert()`/`prompt()` por modais com confirmação e motivo.

**Fornecedor**
6. **Sala única** `/fornecedor/licitacoes/[id]/sessao` disponível de ANALISE_PROPOSTAS até homologação, com painéis de: lances, desempate ME/EPP, proposta readequada, negociação, envio de habilitação, recurso (intenção/razões/contrarrazões), resultado. Dispensa usa a mesma sala.
7. Lista de licitações vinda do endpoint filtrado no servidor (hoje baixa tudo e some com IMPUGNACAO/RECURSO/ADJUDICACAO).
8. **Minhas participações** real (fim da tela estática) e resultado visível (vencedor, valor, ata).
9. Apagar `fornecedor/disputa`, `fornecedor/sala-disputa`, `fornecedor/disputa-v3` (absorvida), `lances` da dispensa.

**Público**
10. Detalhe público com esclarecimentos/impugnações respondidos, resultado, ata e contrato; apagar `licitacoes/new`, `licitacoes/[id]/sala` + `page_v2`, `page.new.tsx`, `useSessaoDisputa`.
11. Menu: remover "Sala de Disputa V3" (a sala se abre do processo), incluir Atas; corrigir links 404 (`/orgao/atas/:id`, `/utilizar`, `/fornecedor/atas/:id`, `/credenciamento/:id/inscrever`, `href="#"` da fase interna).

**Pronto quando:** existe uma rota por ato e por papel; `grep` por `disputa-v2|sala-disputa|disputa-v3` no frontend só acha o novo caminho; nenhum `localhost` fixo nem `alert()` no fluxo de licitação.

### E9 — Limpeza de schema e dívidas · tamanho M
1. Migrações removendo campos legados (§2.3) e tabelas mortas (`chat_mensagens`, `dispensa_lances`, `dispensa_mensagens`, `contratacoes_diretas`, `itens_contratacao_direta`) após migrar dados.
2. Unificar os dois sistemas de documentos (`documentos_fase_interna` × `documentos_licitacao`) e corrigir o upload que marca SUBSTITUIDO sem publicar.
3. Checagem de órgão (tenant) em `LicitacoesService.findOne/update` e atas; fim do "usa o primeiro órgão da lista" no wizard.
4. Reduzir `any` nos serviços tocados (pncp 113, sessao 53, licitacoes 46) e trocar `console.*` por logger.

### E10 — Validação final · tamanho M
1. e2e verdes por modalidade: pregão (aberto e aberto-fechado, item e lote, SRP e não-SRP), concorrência com inversão, dispensa com e sem lances, inexigibilidade, seleção externa.
2. Simulador com 20 robôs por item em CI.
3. **Ensaio real no ambiente de testes:** um pregão completo conduzido por alguém que não é dev, do edital ao contrato assinado, com espelho no PNCP de treinamento — é o critério de "modelo pronto".

---

## 4. Ordem, dependências e estimativa

```
E0 ──► E1a ──► E1 ──► E2 ──► E3 ──► E4 ──► E5 ──► E6 ──► E7b (credenciamento) ──► E7c (leilão/concurso/diálogo)
                 └──────────────► E7 (pode correr em paralelo a E3–E6)
E8 acompanha cada etapa (tela nova nasce junto do backend novo); E9 no fim; E10 fecha.
```
**Liberação para clientes (decisão 24/09):** o código fica pronto para todas as modalidades, mas o ensaio real e a liberação seguem a ordem **dispensa → pregão → concorrência → credenciamento → leilão → concurso → diálogo**; uma só é liberada depois que a anterior funcionou em uso real.
| Etapa | Tamanho | Observação |
|---|---|---|
| E0 Rede de segurança | M | pré-requisito de tudo |
| E1 Máquina de estados | G | maior impacto estrutural |
| E2 Motor único | G | maior risco — simulador obrigatório |
| E3 Julgamento/ME-EPP/negociação | M | |
| E4 Habilitação | M | |
| E5 Recursos | P | base já existe |
| E6 Resultado/contrato/ARP | M | fecha o B1 |
| E7 Publicação/PNCP | G | paralelo |
| E7b Credenciamento | M | |
| E7c Leilão/concurso/diálogo | G | último a liberar |
| E8 Telas | G | distribuída |
| E9 Limpeza | M | |
| E10 Validação | M | |

**Proteção da produção:** dispensa e seleção externa estão em uso — cada etapa mantém o e2e da dispensa verde; migrações de dados (lances, dispensa_lances) com script de conferência antes/depois; deploy com `BRANCH=` para testar no ambiente de testes antes.

## 5. Decisões do usuário (24/09/2026)
1. **Modos e critérios:** "o que a lei pede, temos que fazer" → todos os modos do art. 56 e todos os critérios do art. 33, com as vedações legais validadas (§2.1).
2. **Escopo:** tudo pronto no código; testar e liberar uma modalidade por vez, começando pela dispensa.
3. **Dispensa:** plataforma única (como os demais sistemas) — dispensa vira procedimento do motor único; sua camada de processo, que é a mais madura, vira o padrão.
4. **Credenciamento:** agora (E7b).
5. **Rotas:** `/orgao/processos/[id]/sessao` e `/fornecedor/licitacoes/[id]/sessao` aprovadas.

## 6. Próximo plano (depois deste)
MFA para perfis críticos · auditoria imutável (hash encadeado) · migrations + `synchronize=false` · monitoramento/SLA · LGPD (política, DPA) · segregação de ambientes · regras de cobrança da plataforma (órgão/fornecedor/híbrido).
