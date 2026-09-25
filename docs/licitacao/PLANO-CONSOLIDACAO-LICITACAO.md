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
- ~~Razões/contrarrazões ainda aceitam registro pelo órgão dono em nome do licitante (o `RecursosPanel` faz assim) → E5 cria a tela do fornecedor e restringe ao próprio recorrente.~~ **RESOLVIDO NA E5**: razões só do recorrente e contrarrazões só dos demais licitantes, pelo token (`/api/recursos`); o `RecursosPanel` do órgão só lê e decide.
- `item_encerrado` revela o vencedor de um item enquanto outros itens ainda estão em disputa (risco de conluio entre itens) → E2: identidade só após o fim da etapa de lances da sessão inteira.
- Corrida da anonimização (código repetido; lance gravado com "erro" ao fornecedor) → E2.

### E1 — Máquina de estados única · tamanho G

**E1 CONCLUÍDA (25/09/2026)** — nenhuma atribuição direta de `fase` fora do `TransicoesService` (restam só a criação em PLANEJAMENTO, filtros de consulta e o `down()` da migração). Sala (sessão/disputa/recursos), PNCP, fase interna, admin-testes e cron usam atos nomeados com histórico e trava de linha; sala recusa atos com licitação não ATIVA; B7 corrigido (fim da etapa de lances leva a licitação a julgamento); prazo de impugnação/esclarecimento pelo art. 164 (3 dias úteis antes da abertura, pela data e não pela fase; feriados na E7); gate único de documentos da fase interna para todas as modalidades; PNCP não retrocede fase e não fura o gate de publicação. e2e 292/292, unitários 510/510.
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
  - ~~`licitacoes-scheduler.service.ts` → `INICIAR_ACOLHIMENTO`/`ENCERRAR_ACOLHIMENTO` e respeitar `data_limite_impugnacao`~~ **FEITO (24/09)**: o scheduler só pede atos (ator `SISTEMA/scheduler`, `ignorarSeJaAplicado`, `situacao = ATIVA`, cada licitação isolada — falha de uma não para o lote); `PUT atualizar-fase` usa o mesmo caminho (ator = órgão). Prazo de impugnação/esclarecimento (art. 164) agora é por DATA, não por fase: `data_limite_impugnacao` do edital ou, sem ela, fim do 3º dia útil (Brasília) antes da abertura (dispensa: fim do acolhimento) — `impugnacoes/prazo-manifestacao.util.ts`, usado na criação de impugnações e esclarecimentos e exposto nas visões como `data_limite_impugnacao_efetiva`/`prazo_manifestacao_aberto`. O acolhimento corre em paralelo ao prazo. `ABRIR_IMPUGNACAO` saiu dos fluxos; a fase `IMPUGNACAO` fica válida só para linhas legadas. Feriados: E7 item 2. Testes: `prazo-manifestacao.util.spec.ts`, `test/prazos-impugnacao.e2e-spec.ts`.
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

**E2 — núcleo CONCLUÍDO (25/09/2026)** — `backend/src/disputa-v2/`:
- **Modelo do lance** (`modelo-lance.ts`, `entities/lance.entity.ts`): `fornecedor_id` é a chave (o `fornecedor_identificador` ficou só para leitura de linhas antigas); `valor` = valor comparável na `base_lance` da licitação (UNITARIO | TOTAL_ITEM | TOTAL_LOTE; padrão TOTAL_ITEM), `valor_unitario` e `valor_total` explícitos, `origem` (PROPOSTA, LANCE, LANCE_FECHADO, DESEMPATE_MPE, NEGOCIACAO, JANELA_DISPENSA), cancelamento lógico com `cancelado_em/por/motivo`. Homologação e ata leem unitário/total (fim do B2); `f.cnpj` → `cpf_cnpj` na ata. Migração dos dados: `migracao-lances.ts` (boot + migration `20260925000001-ModeloLanceE2`).
- **Um `registrarLance`** (trava no item, regras puras em `validarLance`): diferença mínima do edital (valor ou %) no intermediário e no que cobre a melhor oferta (IN 73 art. 21 §2º, art. 22 §1º); **lances iguais recusados — prevalece o registrado primeiro** (decisão: a IN 73 não trata o empate entre lances; seguimos o Decreto 10.024 art. 30 §3º em vez de fabricar empate para art. 60/sorteio); intervalo de TEMPO entre lances do mesmo fornecedor = parâmetro, **padrão 0** (não é exigência legal); desempate ME/EPP (`aceitarLanceMPE`) passa pelo motor com origem DESEMPATE_MPE; exclusão do próprio último lance uma única vez em 15 s (art. 21 §3º, parâmetro). Apagados: módulo `lances` + gateway `/`, `sessao.registrarLance`, `registrarLanceLote` (rota → 501 "disponível na disputa por lote"), conversões duplicadas proposta→lance (índice único parcial `UQ_lances_proposta_ativa`).
- **Um relógio** (`relogio-disputa.ts` + DisputaTimerService); status TEMPO_ALEATORIO como gancho dos modos (o aberto não usa aleatório — art. 23). Apagados o cron morto do `sessao` (`SESSAO_CRON_TEMPO_ALEATORIO`), `sync_cronometro` e as cópias da fórmula (admin, sessao).
- **Anonimização atômica** (advisory lock por sessão + índice único `(sessao_id, indice)`); o lance é confirmado antes da difusão (simulador 5c/7b verdes). `item_encerrado` e as leituras de item não identificam o vencedor enquanto houver item da licitação na etapa de lances.
- **Parâmetros** pelo resolvedor único (`parametros-disputa.ts`: sessão → licitação → órgão → sistema), incluindo exclusão em 15 s e **aviso de reinício ≥ 5% (art. 56 §4º)** — o antigo alerta "< 5%" a cada lance estava invertido.
- **Reinício** sem DELETE: retrato congelado `sessao_atas_snapshots` (SHA-256) + cancelamento lógico (também pela sala `/sessao`). **Chat** único nos eventos da sessão, respeitando `chat_desabilitado`; `mensagens` só devolve chat.
- Telas mortas apagadas: `licitacoes/new`, `licitacoes/[id]/sala*`, `orgao/sala-disputa`, `fornecedor/sala-disputa`, `useSessaoDisputa.ts`.
- **Falta na E2** (outros blocos): modos aberto-fechado/fechado-aberto/fechado (estratégias: `OrigemLance.LANCE_FECHADO`, status TEMPO_ALEATORIO no relógio), lote (`BaseLance.TOTAL_LOTE` hoje 409/501), dispensa no motor (`OrigemLance.JANELA_DISPENSA`), gateway único `/disputa` e a absorção do resto do `sessao`.

**E2 item 5 — Disputa por LOTE CONCLUÍDA** — `disputa-v2/disputa-lote.service.ts`, `rateio-lote.ts`, `unidade-disputa.ts`:
- **Unidade de disputa**: o motor disputa ITEM ou LOTE (licitação com `base_lance = TOTAL_LOTE`). O lote guarda o MESMO estado do item, com as mesmas colunas (`lotes_licitacao.status_disputa`, tempos, melhor lance) — relógio (`relogioDaUnidade`), regras (`validarLance`) e exclusão do próprio lance (`podeExcluirLanceDireto`) são comuns. Na sala o id da unidade é o id do lote (board, `iniciar_itens`, `enviar_lance`, `encerrar_item`, leituras `item/:id/*`, cancelamentos V3): a tela não muda de protocolo; `tipoUnidade: 'LOTE'` + `itensDoLote` para mostrar o lote. Os itens do lote ESPELHAM o status e o melhor valor (fim da etapa de lances, sigilo, adjudicação, homologação e ata leem item sem caminho próprio). `DisputaService` despacha para o `DisputaLoteService` pelo id/base; `/sessao/:id/lance-lote` (501) apagado — lance de lote = `POST /disputa-v2/sessao/:id/lance { loteId, valor }` ou socket com o id do lote.
- **Elegibilidade**: só disputa o lote quem cotou TODOS os itens do lote com valor > 0 em proposta válida (regra dos editais de adjudicação por grupo). Quem não cotou continua na licitação e disputa os lotes completos; lance no lote incompleto → 400. Lance por item numa licitação por lote → 409. Todo item precisa estar num lote para iniciar (409 com a lista).
- **Valor inicial** = soma dos totais da proposta do licitante nos itens do lote (lance PROPOSTA do lote; índice único parcial `UQ_lances_lote_proposta_ativa`).
- **Lance**: linha do lote (`lote_id`, `item_id` nulo, `valor` = global) + uma linha de RATEIO por item (`lance_lote_id`), com `valor` = global (o menor valor do item é o do vencedor do lote) e `valor_total`/`valor_unitario` rateados. **Rateio**: total_i = proposta_i × lance ÷ proposta do lote, ao centavo (meio para cima, inteiros/BigInt) para todos menos o último item (ordem do número); o último recebe o resíduo → soma exata = lance; unitário = total ÷ quantidade (4 casas). Lance do lote só com 2 casas. Diferença mínima, lances iguais, intervalo e prorrogação sobre o valor global. Cancelamento (fornecedor art. 21 §3º / pregoeiro §4º) sempre do lance e do seu rateio.
- **Lotes**: rota corrigida `/api/lotes` (era `/api/api/lotes`), escrita só do órgão dono (E1a), leitura pública com sigilo; item em no máximo um lote (trocar = "mover"); composição congelada a partir da disputa; `tipo_beneficio_mpe` no lote (coerente com `exclusivo_mpe`/`percentual_cota_reservada`; regras ME/EPP ficam na E3). `PUT /licitacoes/:id` com `lotes` faz upsert (não apaga/recria) e liga os itens pelo `numero_lote`. Wizard: seletor "Disputa: por item | por lote".
- **Limites**: ~~lote só no modo ABERTO~~ — todos os modos valem para o lote desde a E2.4 (abaixo); desempate ME/EPP e negociação por lote na E3.
- Testes: `rateio-lote.spec.ts`, `test/disputa-lote.e2e-spec.ts`. Migration `20260927000001-DisputaPorLote`.

**E2.4 — Modos de disputa CONCLUÍDA** — estratégias do MESMO motor (`disputa-v2/modos-disputa.ts` regras puras · `modo-disputa.service.ts` · `desconexao-pregoeiro.service.ts` · `modos-disputa.controller.ts`), para a unidade ITEM e LOTE; estado da fase em `disputa_estado_modo_item` (chave = id da unidade, `tipo_unidade`; migration `20260928000001-ModosDisputa`):
- **Aberto** (IN 73 art. 23): 10 min + prorrogações de 2 min (parâmetros). **Reinício para as demais colocações** (Lei art. 56 §4º): ato do pregoeiro `POST /disputa-v2/sessao/:s/item/:unidade/reiniciar-demais` (justificativa), só com a unidade encerrada e diferença 1º→2º ≥ parâmetro (5%); só as demais colocações dão lance, nenhum lance alcança a 1ª; relógio do art. 23; uma vez por unidade; nada é cancelado.
- **Aberto-fechado** (art. 24): etapa aberta FIXA de 15 min (parâmetro, sem prorrogação) → aviso de fechamento iminente (evento + chat) → tempo aleatório de até 10 min (sorteado com `crypto`, duração guardada só na tabela de estado; ninguém recebe o restante — `oculto`; lances continuam) → etapa fechada: melhor oferta + até 10% (20% com margem de preferência), mínimo 3 na ordem, empates no corte incluídos → UM `LANCE_FECHADO` por convocado, melhor que o próprio último, em 5 min (parâmetro); não convocado → 409 → ranking final pelo melhor de cada um (aberto + fechado). Encerramento manual pelo pregoeiro recusado (409; só relógio/ADMIN). No lote, o lance fechado é o valor GLOBAL, rateado por item como os demais.
- **Fechado-aberto** (art. 25): classificação automática das propostas (melhor + 10%/20%, mín. 3) → etapa aberta art. 23 só para os classificados; os demais ficam no ranking pela proposta.
- **Fechado** (art. 56 I): sem lances — a unidade encerra na abertura; ranking pelas propostas.
- **Modo × critério** (art. 56 §§1º-2º): 400 na criação, edição, criação a partir de demanda, início da sessão e dos itens; `GET /disputa-v2/modos/validar`.
- **Sigilo do lance fechado** (art. 24 §2º "sigiloso até o encerramento deste prazo"): fora de TODAS as leituras (board, lances, melhores, ranking, rateio por item, melhor lance da unidade, valor do evento) até a unidade encerrar — **inclusive para o pregoeiro**, que vê só a contagem (`lance_fechado_recebido`, `lancesFechadosRecebidos`); o autor vê o próprio (`meuLanceFechado`).
- **Direção por critério**: maior desconto guarda o PREÇO resultante (a proposta não tem percentual) → ordem crescente de preço = decrescente de desconto; a faixa de 10% do maior desconto é medida no desconto. Maior lance (leilão) → direção MAIOR já ligada em validação/ranking/classificação dos itens (E7c só traz os dados; o lote ainda ordena crescente).
- **Desconexão do agente** (art. 27): sinal do socket (pregoeiro sem nenhum socket na sala) + verificador a cada 5 s; lances seguem até 10 min; depois a sessão é suspensa (evento + chat) — só pregão/concorrência (dispensa/IN 67 fora); retomada só com a data comunicada (`POST .../agendar-retomada`, ≥ 24 h) e a partir dela (`exigirRetomadaPermitida`, em todos os caminhos de retomar). Presença em memória por instância (várias réplicas → afinidade ou Redis).
- **Relógios ao retomar** (helper único `retomarRelogiosDaSessao`, itens E lotes): desconexão → cada unidade recomeça a fase; demais suspensões → relógios deslocados pela pausa (antes a unidade vencia na retomada).
- **Decisões onde a norma é omissa**: só as vedações da LEI bloqueiam combinações; empates no corte da faixa entram todos; lances fechados iguais são aceitos (desempate do art. 60/sorteio na E3); diferença mínima do lance fechado só sobre o próprio último; tempo aleatório entre o mínimo da sessão e 10 min; reinício só nos modos com disputa aberta final e sem reabrir a etapa de lances da licitação; IN 73 art. 24 §6º (novo lance fechado sem classificado) não implementado.
- Telas: sala V3 (órgão e fornecedor) com a fase (aberta / fechamento iminente sem contagem / lance final fechado com prazo próprio / encerrada), "enviar lance final fechado" com confirmação, reinício para demais colocações, comunicação da retomada; monitor do admin mostra "Tempo aleatório". Removido o falso "operado pela V2". Tela de edição da licitação gravava 60/120 (segundos) em campos de minutos — corrigido.
- Testes: `modos-disputa.spec.ts`, `desconexao-pregoeiro.service.spec.ts`, `disputa-v3.presenter.spec.ts`, `test/modos-disputa.e2e-spec.ts` (item e lote, robôs `SalaModos` do simulador).

### E3 — Julgamento, ME/EPP, negociação · tamanho M
1. `RankingService` único **por critério** (todos os do art. 33: menor preço, maior desconto, maior lance em ordem decrescente, técnica e preço com ponderação do art. 36, melhor técnica, maior retorno econômico) usando lances + notas técnicas + situação do licitante; usado por disputa, aceitação, habilitação, recursos e resultado (fim do B4/B5). Desempate art. 60 + sorteio público registrado.
2. **Aceitação da proposta** (nova etapa, IN 73 art. 29): pregoeiro aceita/recusa a proposta do 1º colocado com motivo; fornecedor envia proposta adequada ao último lance em **mínimo 2 h, prorrogável** (a pedido ou de ofício); análise de exequibilidade (art. 59); recusa chama o próximo.
2b. **Julgamento técnico** (técnica e preço / melhor técnica / concurso): comissão atribui notas por quesito do edital, registradas por membro, com ponderação e publicação das notas antes da fase de preço.
3. **ME/EPP (LC 123 art. 44/45)**: logo após o encerramento do item, antes da aceitação; checa porte declarado; empate ficto 5% (pregão) / 10% (demais); convoca automaticamente com prazo de 5 min; aceitar/recusar pelo **fornecedor** na sala; sem resposta → próximo ME/EPP no intervalo; tratamento de exclusivo e cota reservada (≤25%).
4. **Negociação** (art. 61): pregoeiro propõe, fornecedor responde contraproposta na sala; valor negociado vira lance de origem NEGOCIACAO; rota corrigida (B8).

**Pronto quando:** e2e passa por aceitação, empate ficto com ME/EPP (aceita e recusa) e negociação; leilão/técnica e preço recusados na criação.

**E3 — núcleo CONCLUÍDO (ranking único + licitante na unidade + aceitação)** — `backend/src/julgamento/`:
- **Licitante na unidade** (`licitantes_unidade`, único por unidade + fornecedor; unidade = ITEM, ou LOTE na base TOTAL_LOTE): situação CLASSIFICADO, CONVOCADO_DESEMPATE (gancho ME/EPP), CONVOCADO_ACEITACAO, ACEITO, RECUSADO, DESCLASSIFICADO, HABILITADO, INABILITADO, VENCEDOR, com motivo/ator/data. Criada pelo motor ao encerrar a unidade (ranking final → CLASSIFICADO; `licitantes-unidade.sql.ts`, sem DI — o motor não importa o módulo) e recomposta de forma idempotente na leitura; o reinício da disputa cancela as convocações e descarta as situações.
- **`RankingService` único** (fim do B4): melhores ofertas ativas do motor (`rankingDoItem` — cancelados e lance fechado sigiloso fora, lote pelo global), direção do critério, sem DESCLASSIFICADO/RECUSADO/INABILITADO; empate de valor → **gancho `definirDesempatador`** (padrão: registrado primeiro; art. 60/sorteio pluga aqui). Habilitação, negociação, intenção de recurso, adjudicação (tela, adjudicar-todos, adjudicar item) e homologação leem só ele; `encontrarProximoClassificado` e os filtros `VALIDA`/`SEGUNDA_COLOCADA` apagados.
- **Aceitação (IN 73 art. 29)** — etapa da sala `ACEITACAO_PROPOSTA` (fim da etapa de lances vai para ela; dispensa segue em NEGOCIACAO). Tabela `aceitacoes_proposta`: convocação do licitante NA VEZ (a ordem não se pula), prazo ≥ 2 h (parâmetro `prazo_proposta_adequada_horas` do órgão, nunca < 2), prorrogação única pelo mesmo período (de ofício ou deferindo pedido justificado do licitante), envio do arquivo (no banco, só órgão dono e o próprio licitante leem) + valores por item (soma ≤ último lance; no lote, cada item ≤ rateio), aceite (ACEITO) ou recusa com motivo (RECUSADO → próximo convocado automaticamente; sem próximo, a unidade FRACASSA + roll-up); prazo vencido sem envio → recusa. Exequibilidade = alerta que exige justificativa no aceite: obras/serviços de engenharia < 75% do orçado (Lei art. 59 §4º), bens/serviços < 50% (IN 73 art. 34). Licitação fica em JULGAMENTO; **INICIAR_HABILITACAO tem pré-condição: toda unidade com lances e resultado possível tem proposta aceita**. Gancho `registrarGanchoAntesDaConvocacao` para o desempate ME/EPP bloquear a convocação.
- **Habilitação (preparo do B3/E4)**: convocar só quem tem proposta aceita; aprovar → HABILITADO; reprovar → INABILITADO em todas as unidades, convocações dele canceladas, `RETORNAR_JULGAMENTO` e o próximo pelos lances é convocado para a aceitação. Adjudicar/homologar nunca escolhem recusado/inabilitado/desclassificado (B3 e B4 do e2e de pregão viraram `test`).
- Rotas `/api/julgamento/sessao/:id/…` (aceitacao, ranking, convocar, prorrogar, aceitar, recusar, proposta, pedir-prorrogacao, arquivo); telas: `AceitacaoPanel` (sala V3 do órgão, etapa ACEITACAO) e `PropostaAdequadaPanel` (sala V3 do fornecedor, só quando convocado); stepper com Benef. ME/EPP → Aceitação → Negociação.
- Migração: `migracao-julgamento.ts` (boot `MigracaoJulgamentoBootService`, desligável por `JULGAMENTO_MIGRAR_NO_BOOT=false`, + migration `20260929000001-JulgamentoAceitacao`, sem transação por causa do `ALTER TYPE ... ADD VALUE`).
- Testes: `julgamento/regras-julgamento.spec.ts`, pré-condição em `transicoes.spec.ts`, `test/julgamento-aceitacao.e2e-spec.ts`; pregão/lote/transições-sessão atualizados.
- **Falta na E3**: ~~ME/EPP~~ (feito — bloco abaixo), negociação (depois da aceitação; exige nova proposta adequada se o valor mudar), desempate art. 60/sorteio (gancho do ranking), julgamento técnico, critérios técnica e preço/melhor técnica/maior retorno; valores da proposta readequada ainda não alimentam a homologação (E6).

**E3 — NEGOCIAÇÃO CONCLUÍDA (item 4; fim do B8)** — `backend/src/julgamento/negociacao.service.ts` + `regras-negociacao.ts`:
- **Onde fica** (Lei 14.133 art. 61; IN SEGES 73/2022 art. 30): por unidade, depois dos lances e ANTES do aceite (a proposta adequada do art. 29/30 §4º é a do valor negociado); sempre com o licitante NA VEZ do ranking único (CLASSIFICADO ou CONVOCADO_ACEITACAO). Só critérios de menor valor.
- **Preço máximo** = soma do valor total estimado dos itens da unidade. Acima dele a negociação é **obrigatória**: o aceite (gancho `registrarGanchoAntesDoAceite` da aceitação) é recusado sem negociação concluída com o licitante; persistindo acima depois de negociar, só com motivação expressa (≥ 20 caracteres) — ou o agente desclassifica.
- **Negociação acompanhada** (IN 73 art. 30 §2º): eventos `NEGOCIACAO_*` com `dados_adicionais.visibilidade = 'PARTICIPANTES'` — leitura do órgão dono e de todo licitante com proposta válida (REST `/api/sessao/:id/eventos`, painel em modo leitura, socket na sala da sessão `sessao:<id>`, onde só entram órgão dono e participantes); o público anônimo e outros órgãos veem só abertura e resultado (valor). Escrita (mensagem/contraproposta/resposta) só do agente e do licitante na vez (outro licitante → 403). A ata registra a negociação inteira (registro público após a conclusão). Preço máximo ao licitante só com orçamento público (`sigilo_orcamento` ≠ SIGILOSO — art. 24).
- **Atos**: abrir → mensagens → contraproposta (valor na base do lance, MENOR que o atual) → licitante aceita (vira lance **NEGOCIACAO** pelo motor; negociação concluída REDUZIDO; a convocação de aceitação ativa é readequada: novos limites, nova solicitação com prazo ≥ 2 h, proposta anterior descartada — `AceitacaoService.readequarAposNegociacao`) ou recusa com motivo → encerrar (MANTIDO) ou **desclassificar** (art. 59 III: só depois de ao menos uma contraproposta respondida e com o valor ainda acima do máximo → DESCLASSIFICADO, aceitação dele cancelada, próximo do ranking chamado à negociação automaticamente — IN 73 art. 30 §1º; sem próximo, a unidade fracassa). Abertura e resultado (só o valor) são públicos (art. 61 §1º; IN 73 art. 30 §3º). Convocar a aceitação com negociação em andamento → 409.
- **Rotas** `/api/julgamento/sessao/:id/negociacao` (GET painel/minhas; POST `unidade/:unidadeId/abrir`, `:negId/contraproposta`, `:negId/mensagem`, `:negId/responder`, `:negId/encerrar`, `:negId/desclassificar`); as antigas `/api/sessao/:id/negociacao...` (B8) foram apagadas.
- Telas: `NegociacaoPanel` (sala V3 do órgão, junto da aceitação) e `NegociacaoFornecedorPanel` (sala V3 do fornecedor: a própria negociação com resposta e as dos demais em modo leitura). Tabela `negociacoes_unidade` (migration `20260930000003-JulgamentoNegociacao`).
- Testes: `julgamento/regras-negociacao.spec.ts`, `test/negociacao.e2e-spec.ts`; B8 do e2e de pregão virou `test`.

**E3 — ME/EPP CONCLUÍDO (item 3; LC 123/2006 arts. 44–48; Lei 14.133 art. 4º)** — `backend/src/julgamento/me-epp/` (`regras-me-epp.ts` puras · `beneficio-mpe.sql.ts` sem DI · `me-epp.service.ts` · `me-epp.controller.ts`):
- **Enquadramento**: ME/EPP = porte do CADASTRO (ME, EPP ou MEI) + declaração na proposta; o porte é retratado na proposta na criação (`propostas.porte_fornecedor`, `enquadramento_mpe`) — nunca vem do cliente. Declarar ME/EPP com porte demais/sem porte → 400.
- **Empate ficto** (arts. 44/45): o motor chama o gancho `GanchoBeneficioMpe.aposEncerrarUnidade` ao encerrar cada unidade (item ou lote); com o ranking único, se a melhor oferta NÃO é de ME/EPP, as ME/EPP com oferta até 5% (pregão) / 10% (demais — parâmetros `percentual_empate_ficto_*`) acima dela entram na fila, na ordem de classificação; iguais → sorteio auditável COMPARTILHADO (`julgamento/sorteio.ts`, contexto `LC123-ART45-III`, entrada = licitação + unidade + candidatos + instante do encerramento). A 1ª é convocada automaticamente (situação CONVOCADO_DESEMPATE, prazo `prazo_desempate_mpe_minutos` = 5 — art. 45 §3º) e responde SOZINHA pelo token: oferta ESTRITAMENTE menor (lance DESEMPATE_MPE pelo motor → passa a 1ª) ou recusa; prazo vencido (cron a cada 5 s + verificação em toda leitura/ato) → a próxima; sem ninguém → mantida a melhor original. Não se aplica: unidade exclusiva/cota, melhor já ME/EPP (art. 45 §2º), critério de maior valor, dispensa/inexigibilidade/leilão/concurso.
- **Etapa**: sala vai a BENEFICIO_MPE (em vez de ACEITACAO_PROPOSTA) quando a etapa de lances termina com desempate em curso; volta à aceitação quando não há mais nenhum. A aceitação da UNIDADE é bloqueada pelo gancho `registrarGanchoAntesDaConvocacao` (409); unidade encerrada sem apuração (dado anterior) é apurada no próprio gancho.
- **Art. 48**: benefício por unidade conforme `modo_beneficio_mpe` (GERAL → tipo da licitação; POR_LOTE → tipo do lote; POR_ITEM → `tipo_participacao`); `tratamento_diferenciado_mpe = false` desliga só o art. 48. EXCLUSIVO: proposta de não-ME/EPP → 400 na criação; o motor também barra lance e a conversão proposta→lance (item e lote). Conferência (`GET .../me-epp/conferencia`): exclusivo acima do limite legal `MPE_EXCLUSIVO_ITEM` (R$ 80.000, semeado em `limites_legais`) e cota pendente — **alerta**, não bloqueio. COTA RESERVADA: `POST /api/julgamento/licitacao/:id/me-epp/cotas` (órgão dono, idempotente, só sem propostas) clona o item (ou o lote com seus itens, na base TOTAL_LOTE) com a quantidade da cota (`item_cota_origem_id` / `lote_cota_origem_id`), exclusiva de ME/EPP; o principal fica com o restante e segue ampla (com empate ficto); percentual > 0 e ≤ `percentual_cota_maxima_mpe` (nunca > 25%).
- **Legado**: `tipo_beneficio_mpe` é a fonte da verdade; `exclusivo_mpe`/`cota_reservada` só como entrada de clientes antigos e sempre DERIVADOS (licitações e lotes). Migração idempotente no boot (`MigracaoMeEppBootService`, desligável por `MEEPP_MIGRAR_NO_BOOT=false`) + migration `20260930000004-BeneficioMeEpp`.
- **Rotas** `/api/julgamento/sessao/:id/me-epp` (GET: painel do órgão / convocações do próprio licitante; POST `:convocacaoId/exercer` `{ valor }`, `:convocacaoId/declinar` — só a ME/EPP do token; convocação de outro → 404; pregoeiro → 403), `/api/julgamento/licitacao/:id/me-epp/{participacao,conferencia,cotas}`. Apagados `sessao.verificarEmpateFicto/convocarMPEParaLance/aceitarLanceMPE/recusarLanceMPE` e `PUT /api/sessao/:id/mpe/*`. Socket: `mpe_convocado` na sala privada do licitante, `mpe_desempate` anônimo na sala, `mpe_atualizado` na sala do órgão; eventos da ata sem nome na descrição.
- Telas: `BeneficioMeEppPanel` (sala V3 do órgão: intervalo, fila, convocada, contagem), `DesempateMeEppFornecedorPanel` (sala V3 do fornecedor: "Você foi convocado", valor e recusa), aviso/bloqueio de itens exclusivos/cota na proposta, `CotasMeEppCard` (cockpit, aba Itens).
- Testes: `julgamento/me-epp/regras-me-epp.spec.ts`, `test/me-epp.e2e-spec.ts`; `motor-lances` e `disputa-lote` usam o fluxo novo (a ME do intervalo é convocada e responde).
- **Suspensão pausa o prazo** (devido processo): o tempo em que a SESSÃO (eventos SESSAO_SUSPENSA/RETOMADA) ou a LICITAÇÃO (transições de/para SUSPENSA) esteve suspensa não conta — prazo efetivo = 5 min de tempo ATIVO desde a convocação (`tempoSuspenso` + `estadoDoPrazoMpe`, instantes pelo relógio do banco); suspensa, a convocação não expira (nem pelo cron) e exercer/declinar → 409; retomada, o restante volta a correr. Telas mostram "prazo pausado".
- **PUBLICAR × art. 48 I** (pré-condição `exclusividadeMpeArt48` em `transicoes/definicoes.ts`, consulta `conferenciaArt48` sem DI): unidade EXCLUSIVA com valor estimado acima do limite `MPE_EXCLUSIVO_ITEM` (R$ 80.000) **bloqueia** a publicação, listando as unidades — item pelo valor total do item; **na disputa por lote, o lote pelo valor TOTAL** (decisão: o "item de contratação" disputado é o lote); a unidade-cota não entra. Unidade até o limite SEM exclusividade → exige a justificativa do art. 49 (≥ 20 caracteres) em `justificativa_nao_exclusividade_mpe` — no ato (`PUT /publicar-edital`) ou gravada antes na licitação (cockpit: aba Itens → "Tratamento ME/EPP"; vale também para a publicação pelo PNCP); fica na licitação e nos dados da transição. Só pregão/concorrência.
- Decisões a validar: a sala mostra ACEITACAO_PROPOSTA assim que qualquer unidade é convocada à aceitação (o painel ME/EPP aparece enquanto houver desempate em curso).

**E3 — DESEMPATE (art. 60) e JULGAMENTO TÉCNICO / critérios pontuados CONCLUÍDOS (itens 1 e 2b)** — `backend/src/julgamento/` (`sorteio.ts`, `desempate-regras.ts`, `desempate.sql.ts`, `desempate.service.ts`, `criterios-julgamento.ts`, `julgamento-tecnico.sql.ts`, `julgamento-tecnico.service.ts`):
- **Sorteio auditável** (`sorteio.ts`, compartilhado com o ME/EPP): `sortear(seedInput, candidatos) → ordem`. Entrada canônica PÚBLICA (algoritmo, contexto, licitação, unidade, candidatos em ordem crescente, instante do ato ISO-UTC) → semente SHA-256 → Fisher–Yates com amostragem por rejeição (`SHA256-FY-v1`). O instante do ato é gravado ANTES do cálculo; o ato não se desfaz nem se repete; `conferir` refaz a conta (órgão dono ou qualquer licitante participante).
- **Desempate** (gancho `RankingService.definirDesempatador`): empate de valor final (propostas iguais sem lances, modo fechado, lances fechados iguais) ou de pontuação → grupo PENDENTE (ordem provisória pelo registro) e a aceitação não convoca (gancho `registrarGanchoAntesDaConvocacao`; na convocação AUTOMÁTICA do próximo a pendência não fracassa a unidade — `PendenciaAntesDaAceitacao`). Rito: agente inicia → **disputa final** (art. 60 I) com prazo em minutos (1–60, padrão 5; "ato contínuo"), uma nova proposta SELADA por empatado, estritamente melhor que o próprio valor; encerra no prazo (leituras) ou quando todos enviaram → propostas viram lances `DISPUTA_FINAL` (item, ou lote + rateio) → ranking refeito → critérios **II desempenho** (não aplicável: sem registro cadastral de desempenho), **III equidade** (não aplicável: sem comprovação — Decreto 11.430/2023), **IV integridade** (declaração da proposta), **§1º I** (UF do fornecedor = UF do órgão), **§1º II** (CNPJ + UF brasileira), **§1º III/IV** (não aplicáveis: sem dado) → persistindo, **sorteio** em ato público (IN 73 art. 28 §2º). Trilha completa (base legal, aplicável/motivo, efeito) no registro `desempates` e nos eventos da sala. Disputa final NÃO se aplica a melhor técnica (empate de nota da banca; preço fixo do edital) e maior retorno (limite do modelo) — registrado. **Dispensa**: `julgarDispensa` aplica II..§1º IV e o sorteio no próprio ato do julgamento (IN 67 não prevê disputa final; a janela de lances é a oportunidade de nova oferta) — decisão documentada, idempotente. Reinício da disputa cancela os desempates.
- **Julgamento técnico** (melhor técnica / técnica e preço): quesitos (peso, nota máxima) + peso da técnica (≤ 70% — art. 36 §2º) + nota mínima, editáveis até a 1ª nota; **banca** = usuários ativos do órgão, mínimo **3** (art. 37 §1º); proposta técnica anexada pelo licitante até o fim do acolhimento (arquivo no banco; demais licitantes só veem depois da publicação; órgão depois do acolhimento); notas por MEMBRO (usuário do token) entre ANALISE_PROPOSTAS e EM_DISPUTA; nota do quesito = média dos membros; NT = 100·Σ(peso·média/máx)/Σpeso; **publicação** exige banca completa e todas as notas, congela o resultado, desclassifica abaixo da mínima, evento na sala e leitura pública. **A etapa de preços (iniciar unidades) só abre com as notas publicadas** (gate no motor).
- **Ranking por critério** (estratégia no `RankingService`): técnica e preço → índice IF = pT·(NT/maior NT) + pP·(menor preço/preço), só entre os classificados, 4 casas; melhor técnica → NT (o preço não pesa: a negociação do "melhor técnica" da Lei 8.666 não existe na 14.133 — art. 35); maior retorno (art. 39 §3º) → retorno = economia estimada − economia × percentual (proposta de trabalho por item em `propostas_retorno_economico`). Pontuação igual → desempate do art. 60.
- **Rotas**: `/api/julgamento/sessao/:id/desempate` (GET painel/meus; POST `unidade/:u/iniciar`, `:d/oferta`, `:d/encerrar-disputa-final`, `:d/sortear`; GET `:d/conferir`); `/api/julgamento/licitacao/:id/tecnica/{configuracao,comissao,usuarios-elegiveis,notas,publicar,resultado,documentos}` e `/retorno-economico`. Migration `20260930000005-JulgamentoTecnicoDesempate`.
- Telas: `DesempatePanel` (sala V3 do órgão), `DisputaFinalPanel` (sala V3 do fornecedor), índice/nota/retorno e estado do desempate no ranking da `AceitacaoPanel`; `/orgao/licitacoes/[id]/julgamento-tecnico` (`JulgamentoTecnicoConfig` + `NotasTecnicasPanel`; link no cockpit e na aba Configurações da edição); `PropostaTecnicaPanel` na página da proposta do fornecedor.
- Testes: `sorteio.spec.ts`, `desempate-regras.spec.ts`, `criterios-julgamento.spec.ts`, `test/julgamento-tecnico-desempate.e2e-spec.ts`; `modos-disputa` (FECHADO + melhor técnica) passa pelo julgamento técnico.
- **Limites/decisões a validar**: banca de 3 exigida (o art. 37 §1º fala da banca do inciso II); nota mínima opcional; classificação dos modos fechado-aberto/aberto-fechado continua pelo PREÇO também na técnica e preço (IN 73 não detalha); proposta técnica sem retificação após o acolhimento; maior retorno sem disputa final e sem medição da economia na execução (art. 39 §4º fica para contratos).

### E4 — Habilitação real · tamanho M
1. Exigências de habilitação definidas no edital (lista por licitação, com modelos padrão por modalidade).
2. Convocação do aceito com **prazo mínimo de 2 h, prorrogável** (IN 73 art. 39 §5º); documentos exigidos só do vencedor, salvo inversão (art. 39 §2º); sem substituição, só complementação por diligência (art. 39 §4º); fornecedor envia documentos **pela sala/portal**; reaproveita documentos válidos do cadastro (`verificarHabilitacao`) em vez de pedir de novo.
3. Análise por documento persistida no banco (fim do checklist no navegador); diligência (pedir complemento); inabilitar marca o licitante no item e chama o próximo pelo ranking de lances (fim do B3).
4. Job de vencimento de documentos do cadastro.
5. Inversão de fases (concorrência): habilitação antes do julgamento como configuração da máquina de estados.

**Pronto quando:** e2e com inabilitação do 1º e habilitação do 2º; vencedor final nunca é inabilitado.

**E4 — CONCLUÍDA (habilitação real)** — `backend/src/habilitacao/` (`regras-habilitacao.ts` puras · `modelos-exigencias.ts` · `habilitacao.sql.ts` sem DI · `habilitacao.service.ts` · `habilitacao.controller.ts` · `vencimento-documentos.service.ts` · `migracao-habilitacao.ts`):
- **Base legal**: Lei 14.133/2021 arts. 62–69 (jurídica, técnica, fiscal/social/trabalhista, econômico-financeira), art. 63 II (documentos só do vencedor, salvo inversão), **art. 64** (depois da entrega, sem substituição nem documento novo — só diligência para complementar/atualizar), art. 70 (registro cadastral substitui documentos; III — documentação reduzida em pequeno valor), art. 17 §1º (inversão de fases); IN SEGES 73/2022 art. 39 (prazo ≥ 2 h prorrogável; §4º sem substituição).
- **Modelo**: `exigencias_habilitacao` por licitação (categoria JURIDICA/FISCAL/SOCIAL_TRABALHISTA/ECONOMICO_FINANCEIRA/TECNICA, descrição, base legal, obrigatória, aceita registro cadastral, `tipos_documento_cadastro` = tipos do cadastro que a atendem, exige validade). **Modelos padrão versionados no código** (sem tabela): BENS, SERVICOS, OBRAS (+ CREA/CAU e vistoria) e DISPENSA (reduzido — art. 70 III), escolhidos por `tipo_contratacao`/modalidade; toda licitação ganha o modelo na 1ª leitura/convocação (nunca há habilitação sem exigências). Edição só na fase interna; publicada → 409 (retificação é a E7). `habilitacoes_licitante` (uma por licitante — a habilitação é do licitante, não do item; origem CONVOCACAO/INVERSAO/MIGRACAO; AGUARDANDO_ENVIO → ENVIADA ⇄ EM_DILIGENCIA → HABILITADO/INABILITADO; prazo, prorrogação, retrato da pré-checagem), `documentos_habilitacao` (origem CADASTRO com retrato do documento do cadastro, ENVIO ou COMPLEMENTO; **arquivo em bytea, nunca na pasta pública**, SHA-256; validade informada; análise PENDENTE/ATENDE/NAO_ATENDE/DILIGENCIA com motivo e ator) e `diligencias_habilitacao` (motivo, exigências, prazo próprio, ABERTA/RESPONDIDA/EXPIRADA). `licitacoes.inversao_fases` e `parametros_licitacao.prazo_habilitacao_horas` (padrão 2).
- **Regras**: convocar só quem tem proposta ACEITA (`AceitacaoService.exigirPropostaAceita`), licitação ATIVA, INICIAR_HABILITACAO pela máquina (pré-condição: todas as unidades aceitas); prazo ≥ max(2 h, parâmetro), prorrogação ÚNICA pelo mesmo período antes do fim. **Registro cadastral**: na convocação, cada exigência que aceita o cadastro recebe o melhor documento dos tipos mapeados que esteja **APROVADO, não VENCIDO e com validade ≥ hoje (Brasília)**; exigência com validade não aceita documento sem data; cadastro SUSPENSO/REJEITADO não aproveita; ao aceitar (ATENDE) um documento do cadastro a validade é conferida de novo. **Envio**: por exigência, PDF/JPG/PNG ≤ 10 MB; antes da entrega pode retirar o que anexou; a entrega é o ato "entregar" OU o fim do prazo (o anexado vale — não reabre); depois, qualquer envio → 409 (art. 64) exceto COMPLEMENTO numa diligência vigente que inclua a exigência (o original nunca é substituído). **Análise**: só com a documentação entregue; NÃO ATENDE exige motivo (≥ 10); documento com validade vencida → 409 com orientação de diligência (art. 64 II). **Diligência**: motivo ≥ 10, prazo ≥ 2 h (decisão: mesmo piso da convocação), exigências da licitação; uma por vez; o licitante responde ou o prazo expira (lido pelo relógio em toda leitura/ato). **Habilitar**: sem diligência vigente e toda exigência obrigatória com ≥ 1 documento ATENDE → HABILITADO nas unidades com proposta aceita (`aoHabilitar`); sala → INTENCAO_RECURSO (ou volta à convocação se ainda há aceito sem habilitação). **Inabilitar** (motivo ≥ 10) → `AceitacaoService.aoInabilitar` (INABILITADO em todas as unidades, RETORNAR_JULGAMENTO, próximo pelos lances convocado para a aceitação; sem próximo, a unidade fracassa). Decidida = final (reversão só por recurso — E5). Já HABILITADO que ganha nova unidade: convocar herda o resultado.
- **Máquina de estados**: `ADJUDICAR` e `DECIDIR_RECURSOS` com pré-condição `licitantesAceitosHabilitados` (unidade com proposta ACEITA sem HABILITADO → 400 "Habilitação pendente" — o vencedor final nunca é quem não passou pela habilitação). **Inversão de fases** (só CONCORRÊNCIA; 400 em outra modalidade; 409 se alterada depois da publicação): documentos de todos anexados com a proposta até o fim do acolhimento (habilitação criada no 1º envio, com a pré-checagem do cadastro); depois do acolhimento, toda proposta apta ganha a sua habilitação (quem não anexou nada pode estar coberto pelo cadastro) e a comissão julga TODOS em ANALISE_PROPOSTAS; inabilitado → proposta DESCLASSIFICADA (o motor não converte em lance); `INICIAR_DISPUTA` com pré-condição `habilitacaoPreviaJulgada` (toda proposta apta HABILITADA — reclassificar um inabilitado não fura). Depois da aceitação, "habilitar" do vencedor já habilitado **confirma** (INICIAR_HABILITACAO + unidades) — sem novo envio. Convocar na inversão → 409.
- **Cadastro**: job diário (03:30 Brasília, `@Cron`) marca VENCIDO o documento com validade passada (idempotente) e avisa o fornecedor por notificação do portal/e-mail do órgão da licitação mais recente dele (a notificação exige órgão; sem participação, só o registro); nenhuma integração nova. Prazos da habilitação são em HORAS (IN 73 art. 39) — não usam `dias-uteis.ts`.
- **Rotas** `/api/habilitacao`: `GET modelos`; `GET licitacao/:id/exigencias` (público); `PUT licitacao/:id/exigencias` e `POST licitacao/:id/exigencias/modelo` (órgão dono, fase interna); `GET licitacao/:id` (órgão dono: exigências, ranking por licitante com `podeConvocar`, habilitações com documentos/diligências/pendências; licitante: só a própria + cobertura do cadastro antes do 1º envio na inversão); `POST licitacao/:id/convocar {fornecedorId, prazoHoras}`, `POST :habId/prorrogar`, `POST documentos/:docId/analisar {resultado, motivo}`, `POST :habId/diligencia {motivo, prazoHoras, exigenciaIds}`, `POST :habId/habilitar`, `POST :habId/inabilitar {motivo}` (órgão dono); `POST licitacao/:id/exigencias/:exId/documentos` (multipart), `DELETE documentos/:docId`, `POST licitacao/:id/entregar`, `POST diligencias/:id/responder` (licitante do token; de outro → 404; sem proposta → 403); `GET documentos/:docId/arquivo` (órgão dono ou o próprio; público 401). **Apagados**: `GET /api/sessao/:id/habilitacao`, `PUT /api/sessao/:id/habilitacao/{convocar,aprovar,reprovar}/:fornecedorId` e os métodos do `SessaoService` (convocar/aprovar/reprovar/estado, `levarAHabilitacao`). Eventos da ata sem valor novo no enum: `CONVOCACAO_HABILITACAO`, `DOCUMENTO_HABILITACAO_ENVIADO` (entrega, complemento, resposta), `HABILITACAO_APROVADA/REPROVADA`, `MENSAGEM_SISTEMA` (prorrogação, diligência).
- **Telas**: `HabilitacaoPanel` (sala V3 do órgão, etapa Habilitação; também antes da disputa quando há inversão): convocar com prazo, cobertura do cadastro por exigência, documentos com ATENDE / NÃO ATENDE (motivo) / DILIGÊNCIA, diligência com exigências marcadas, prorrogar, habilitar/inabilitar/confirmar vencedor (inversão) por diálogo — o checklist `habDocStatus` só no navegador foi apagado. `HabilitacaoFornecedorPanel` (sala V3 do fornecedor e, na inversão, a página da proposta): checklist com o que o cadastro já atende, envio/retirada, entregar (aviso do art. 64), complemento e resposta à diligência, resultado. `ExigenciasHabilitacaoEditor` (aba "Habilitação" da edição da licitação: modelos, categorias, tipos do cadastro, congelada após publicar) e chave "Inversão de fases" na classificação (só concorrência). Página duplicada `orgao/licitacoes/[id]/habilitacao` apagada (e o link do detalhe).
- **Migração** (`migracao-habilitacao.ts`, idempotente; boot `MigracaoHabilitacaoBootService` — desligável por `HABILITACAO_MIGRAR_NO_BOOT=false` — + migration `20261002000004-HabilitacaoReal`): licitação em HABILITACAO sem exigências → modelo padrão; convocado da sala antiga (`fornecedor_habilitacao_id`) sem habilitação → habilitação MIGRACAO com prazo de 24 h da implantação e pré-checagem do cadastro; eventos antigos mantidos.
- **Testes**: `habilitacao/regras-habilitacao.spec.ts` (17 — mapeamento do cadastro, validade/vencido, sem substituição, diligência, pendências, modelos, inversão); `test/habilitacao.e2e-spec.ts` (17 — exigências/modelo/congelamento, cadastro pré-preenchido e vencido pelo job não aceito, envio/retirada/entrega, isolamento completo, análise, diligência com complemento, habilitar → ADJUDICAR sem pendência de habilitação, inabilitar → próximo convocado e vencedor final habilitado, prazo vencido = entregue, inversão na concorrência só com habilitados na disputa, migração de boot). Adaptados sem enfraquecer: `pregao-eletronico-completo` (56), `julgamento-aceitacao` (12), `disputa-lote` (20), `isolamento-dados-licitacao` (114), `transicoes-sessao` (13); `me-epp` (12) e `negociacao` (10) verdes; unitários 725/725.
- **Decisões a validar**: modelos no código (não por órgão); diligência pode incluir exigência sem documento entregue (comprovar condição preexistente — TCU Acórdão 1211/2021-Plenário); prazo mínimo da diligência = 2 h; entrega por decurso do prazo aproveita o que foi anexado; na inversão, o inabilitado tem a proposta desclassificada (a reversão é por recurso); arquivo do cadastro exibido pelo caminho já usado no módulo de fornecedores (o cadastro continua na pasta de uploads — fora do escopo da E4).

### E5 — Recursos com efeito · tamanho P
1. Intenção de recurso registrada **pelo fornecedor** na sala, imediatamente, em janela de **mínimo 10 min** após julgamento/habilitação, sob pena de preclusão (lei art. 165 §1º I; IN 73 art. 40); pregoeiro admite/recusa com motivo.
2. Razões em **3 dias úteis** e contrarrazões em **3 dias úteis** (lei art. 165; IN 73 art. 40 §§1º–2º), enviadas pelos próprios fornecedores (fim do "pregoeiro digita pelo recorrente"); prazos com **feriados** e **bloqueio** após o prazo; reconsideração pelo agente em 3 dias úteis e encaminhamento à autoridade (art. 165 §2º).
3. Decisão PROVIDO produz efeito: volta a licitação à etapa atingida (aceitação/habilitação) via máquina de estados; apaga os eventos antigos de intenção paralelos.

**Pronto quando:** e2e com recurso provido que reverte habilitação e muda o vencedor.

**E5 — CONCLUÍDA (recursos com efeito)** — `backend/src/sessao/` (`regras-recursos.ts` puras · `recursos.service.ts` · `recursos.controller.ts` · `recursos.sql.ts` sem DI · `migracao-recursos.ts`) + `common/prazos/dias-uteis.ts`:
- **Base legal**: Lei 14.133/2021 art. 165 (I: 3 dias úteis; §1º I intenção imediata sob pena de preclusão; §1º II fase recursal única após a habilitação; §2º reconsideração em 3 dias úteis ou encaminhamento à autoridade superior, que decide em 10; §3º só se invalidam os atos insuscetíveis de aproveitamento; §4º contrarrazões no mesmo prazo), **art. 168** (efeito suspensivo — é este artigo, não o §4º do 165), art. 183 (contagem) e IN SEGES 73/2022 art. 40 (janela ≥ 10 min; contrarrazões contadas do FIM do prazo das razões).
- **Modelo**: `recursos_administrativos` ganhou ato recorrido (`INABILITACAO`, `RECUSA_PROPOSTA`, `DESCLASSIFICACAO`, `HABILITACAO_TERCEIRO`, `ACEITACAO_TERCEIRO`, `OUTRO`), licitante alvo, unidade, janela, admissibilidade (pressuposto ausente + motivo), arquivo das razões (no banco, SHA-256), reconsideração (agente, fundamentação, prazo), encaminhamento/prazo da autoridade, instância da decisão (`AGENTE`/`AUTORIDADE`/`LEGADO`), `efeitos` (jsonb) e `origem`; status novo `AGUARDANDO_AUTORIDADE`. Tabelas novas `janelas_intencao_recurso` (aberta/fecha, minutos, superada) e `recursos_contrarrazoes` (uma por licitante, com arquivo). Máquina do recurso: INTENCAO → AGUARDANDO_RAZOES | NAO_CONHECIDO → CONTRARRAZOES → EM_ANALISE → PROVIDO | AGUARDANDO_AUTORIDADE → PROVIDO/IMPROVIDO; decurso do prazo das PARTES é aplicado em toda leitura/ato (razões não apresentadas → não conhecido; fim das contrarrazões → reconsideração), o do agente/autoridade só é **sinalizado** (`reconsideracaoAtrasada`/`autoridadeAtrasada`) — nunca decisão automática.
- **Dias úteis — função única** `fimDoPrazoEmDiasUteis`/`ehDiaUtil` (Brasília, exclui o dia do começo, vence 23:59:59 do N-ésimo dia útil); a impugnação (art. 164) passou a usar a mesma `ehDiaUtil`/`limiteDiasUteisAntes` → o calendário de feriados da E7 troca num lugar só.
- **Rotas** `/api/recursos`: `GET sessao/:id` (órgão dono: tudo + `podeAbrirJanela`; licitante: processo recursal inteiro + `atosRecorriveis` e o que pode fazer em cada recurso; público/outro órgão: só os DECIDIDOS, como a ata); `POST sessao/:id/janela` (órgão dono; ≥ 10 min, parâmetro `prazo_intencao_recurso_minutos`; só com a licitação em HABILITACAO, sem janela aberta nem recurso pendente e com o licitante na vez HABILITADO em toda unidade); `POST sessao/:id/intencao` (licitante do token; fora da janela → 409 preclusão; o ato indicado precisa existir para ele); `POST :id/admitir` (→ AGUARDANDO_RAZOES, prazo das razões, `ABRIR_PRAZO_RECURSAL`) e `POST :id/recusar` (`pressuposto` LEGITIMIDADE/INTERESSE/MOTIVACAO/TEMPESTIVIDADE + fundamentação); `POST :id/razoes` (só o recorrente; multipart texto + arquivo) e `POST :id/contrarrazoes` (só os demais licitantes; uma por licitante) — fora do prazo → 409; `POST :id/reconsiderar` (`{reconsiderar, fundamentacao}`; 409 antes do fim do contraditório); `POST :id/decisao-autoridade` (`{provido, fundamentacao, nome, cargo}`); `GET :id/razoes/arquivo` e `:id/contrarrazoes/:cid/arquivo` (órgão dono e licitantes). **Apagados**: `PUT/GET/POST /api/sessao/:id/recursos/{abrir-prazo,intencoes,intencao,encerrar-prazo}`, `GET /api/sessao/:id/recursos`, `POST .../recursos/:fornecedorId/{admitir,recusar}`, `PUT /api/sessao/recursos/:id/{razoes,contrarrazoes,decidir}` e os métodos de intenção por evento do `SessaoService`.
- **Autoridade superior**: não há papel "autoridade" no cadastro de usuários (roles ADMIN/PREGOEIRO/EQUIPE_APOIO) → decide a **conta do órgão** (ato próprio, com nome e cargo obrigatórios) ou um **usuário ADMIN do órgão**; nunca o usuário que manteve a decisão (segregação); pregoeiro/equipe → 403; outro órgão → 403.
- **Efeito do provimento** (mesma transação da decisão; registrado em `efeitos`): contra a própria inabilitação → recorrente volta **HABILITADO** onde a proposta dele estava aceita (nas demais unidades, CLASSIFICADO); contra recusa/desclassificação → volta ao ranking (CLASSIFICADO); em ambos, quem ficou **abaixo** dele no ranking recalculado e tinha sido convocado/aceito/habilitado no lugar dele volta a CLASSIFICADO e as aceitações dele são CANCELADAS (atos invalidados); contra a habilitação de outro → alvo **INABILITADO** em todas as unidades; contra a aceitação de outro → alvo **DESCLASSIFICADO** na unidade; `OUTRO` → sem efeito automático (registrado). **Fim da fase recursal** (decididos todos, sem janela aberta — `desfechoDaFaseRecursal`): alguma unidade sem proposta aceita → `RETORNAR_JULGAMENTO` + convocação automática do licitante na vez para a aceitação (`AceitacaoService.convocarPendentesAposRecurso`) + janelas **superadas** (o novo resultado exige nova janela); resultado alterado mas completo → ato novo **`RETORNAR_HABILITACAO`** (RECURSO → HABILITACAO, só a sala) e segue a adjudicação; nada alterado → `DECIDIR_RECURSOS` (motivo lista as decisões).
- **Pré-condições novas** (`transicoes/definicoes.ts`, consulta `estadoRecursal`): `ABRIR_PRAZO_RECURSAL` exige intenção admitida; `ADJUDICAR`, `DECIDIR_RECURSOS`, `HOMOLOGAR` e `RETORNAR_HABILITACAO` bloqueados com janela aberta ou recurso/intenção pendente (efeito suspensivo); `ADJUDICAR`/`DECIDIR_RECURSOS` bloqueados com provimento cujo efeito ainda não foi levado à fase; `ADJUDICAR` exige uma janela de intenção **encerrada e não superada** sobre o resultado atual.
- **Publicidade**: razões, contrarrazões, reconsideração e decisão visíveis a todos os licitantes (identidades já reveladas nesta etapa) com download dos arquivos; público e outros órgãos veem só os recursos decididos. Eventos da ata: `PRAZO_RECURSAL_INICIADO` (janela), `INTENCAO_RECURSO_*`, `RECURSO_REGISTRADO` (razões), `CONTRARRAZOES_REGISTRADAS`, `RECURSO_PROVIDO/IMPROVIDO` e `MENSAGEM_SISTEMA` (encaminhamento, decurso, fim da fase) — nenhum valor novo no enum de eventos.
- **Telas**: `RecursosPanel` (sala V3 do órgão, etapa Recursos) reescrito — abrir a janela (contagem), admitir/não admitir com pressuposto (sem `prompt()`), prazos e atrasos, reconsiderar/manter, formulário da autoridade superior, efeitos; o bloco antigo de intenção da página (contagem fixa de 30 min, "encerrar prazo") foi apagado. `RecursosFornecedorPanel` (sala V3 do fornecedor): contagem da janela, "Manifestar intenção de recurso" com o ato recorrido, formulários de razões/contrarrazões com arquivo e prazo, decisões e efeitos. Peças comuns em `recursos-comum.tsx`.
- **Migração** (`migracao-recursos.ts`, idempotente; boot `MigracaoRecursosBootService` — desligável por `RECURSOS_MIGRAR_NO_BOOT=false` — + migration `20261003000005-RecursosComEfeito`): prazos de intenção do fluxo antigo → janelas ENCERRADAS (origem MIGRACAO_E5); intenções por evento sem recurso → recurso `INTENCAO` (aguarda admissibilidade — bloqueia a adjudicação, art. 168) quando a licitação está ATIVA em HABILITACAO/RECURSO, senão `NAO_CONHECIDO` histórico; contrarrazões JSON → `recursos_contrarrazoes`; `RAZOES_APRESENTADAS` → `CONTRARRAZOES`; prazos ausentes calculados; decididos → instância `LEGADO`, sem efeito retroativo.
- **Testes**: `sessao/regras-recursos.spec.ts` (dias úteis/art. 183, prazos, janela, máquina, efeitos, desfecho), `sessao/recursos.service.spec.ts` reescrito (janela, preclusão, admissibilidade, razões/contrarrazões e prazos, reconsideração/autoridade/segregação, efeito da inabilitação reformada), `test/recursos.e2e-spec.ts` (A: inabilitação reformada em reconsideração muda o vencedor, com isolamento, publicidade, preclusão, 409 de prazo e efeito suspensivo; B: mantido → autoridade provê contra a habilitação de outro → volta ao julgamento e nova janela; C: migração idempotente). `pregao-eletronico-completo` (seção 7 pelo fluxo do licitante), `transicoes-sessao` e `disputa-lote` atualizados. Resultados: unitários 725/725; e2e recursos 18/18, pregão 56/56, transições-sessão 13/13, lote 20/20.
- **Decisões a validar**: prazo das razões contado da ADMISSÃO da intenção (intimação); contrarrazões podem ser apresentadas desde a apresentação das razões até 3 dias úteis após o fim do prazo delas; o agente só decide depois do prazo de contrarrazões (contraditório); inabilitação reformada restaura HABILITADO sem nova sessão de habilitação e não reabre a janela (a decisão do recurso é o ato final); a autoridade superior é a conta do órgão ou usuário ADMIN até existir papel próprio; recurso contra "outro ato" provido não tem efeito automático; a janela não pode ser encerrada antes do prazo pelo agente.

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
5. **Impugnação e esclarecimento**: prazo-limite (3 dias úteis antes da abertura — *feito na E1; falta aplicar feriados*), resposta com prazo, publicação da resposta; formulário público sem cadastro (cidadão); guard de perfil em `responder`.
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
