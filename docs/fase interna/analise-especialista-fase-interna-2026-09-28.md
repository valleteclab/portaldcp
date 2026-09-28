# Análise de especialista — Fase interna (Portal DCP)

> 28/09/2026 · Base: `main` em `ad467ae` (PRs #515 a #534) · Somente leitura: nada foi alterado no código.
> Fontes: código do backend (`backend/src/fase-interna/**` e vizinhos), do frontend (`frontend/src/**/fase-interna/**`, `processos/[id]/**`, `aprovacoes/**`), o plano `docs/licitacao/PLANO-FLUXO-TRAMITACAO.md`, o relatório de homologação multiusuário de 27/09 e a Lei 14.133/2021 com as INs SEGES 58/2022, 65/2021 e 81/2022.
> Verificação local: `npm test` do backend — 120 suítes, 1.533 testes, todos passando.

## 1. Resumo para o dono

A sprint de 26 a 28/09 entregou o que o plano prometia: a tramitação virou a espinha da posse, o modelo de fluxo saiu do código e foi para dados, as peças ficaram isoladas por etapa, os autos passaram a seguir a ordem de juntada e a IA rascunha em toda etapa. Dos 9 erros da homologação (E1 a E9), **8 estão corrigidos no código** e o E4 (autos) também; das confusões, restam a do "painel da requisitante" e a das três caixas de entrada.

O que a análise encontrou, em ordem de gravidade:

1. **Quatro furos de permissão dentro do órgão** (backend). O mais grave: qualquer servidor do órgão conclui a fase interna pelo `PUT /fase-interna/:id/avancar`, sem papel nenhum. O isolamento por etapa construído na sprint não cobre esse ato.
2. **Três lacunas de lei que passam pelas travas**: parecer jurídico **desfavorável** não trava nada; a compatibilidade orçamentária (art. 72, IV) aceita "não se aplica"; o prazo do art. 75, §3º admite fim do recebimento às 00:00 do 3º dia útil.
3. **Concorrência em memória** (filas, travas, caches por instância). Funciona com 1 réplica do backend. Com 2 réplicas, "voltar etapa" e sincronização podem se perder mutuamente.
4. **Duas fases internas no frontend** continuam vivas e ligadas no menu (a §8 do plano não foi executada), e o servidor tem **três caixas de entrada** (Minhas tarefas, Central com 7 abas, Tramitação).
5. **Custo por clique alto**: o guard recomputa o processo inteiro (25 a 30 queries) antes do handler, e a tela do ETP dispara cerca de 15 requisições a cada "Gerar".

Recomendação de sequência: fechar os furos de permissão e as três lacunas de lei primeiro (dias, não semanas); decidir a política de réplicas; só depois a consolidação das telas e a performance.

## 2. Situação dos itens da homologação de 27/09

| Item | Situação | Evidência |
|---|---|---|
| E1 TR sem lugar para assinar | Corrigido | aba Assinaturas na Central + `AssinaturaDaPeca` na tela (`CaminhosDaPeca.tsx`), commit `cc6609e` |
| E2 Peças editáveis fora da vez | Corrigido, com brecha | `TrabalhoNaEtapaGuard` + `PermissaoEtapaService`; brecha em tipos fora do modelo (ver 3.1) |
| E3 Publicação liberada cedo | Corrigido | trava "Etapas do fluxo" no PUBLICAR (`licitacoes/transicoes/definicoes.ts:119-124`) |
| E4 Autos fora de ordem | Corrigido | livro de juntadas (`juntadas_autos`), PR #530 |
| E5 TR perdeu conteúdo ao anexar v2 | Corrigido | base editável (`documentos-tela.service.ts:665-668`) |
| E6 LIM-01 indevido | Corrigido, parcial | item sem código só soma no próprio processo; ver 3.2 M2 |
| E7 Recebi não atualiza | Corrigido | "Recebi" otimista + evento `fase-interna:atualizada` |
| E8 Data "undefined" | Corrigido | `c72470a` |
| E9 "Salvando…" travado | Corrigido | `4398cee` |
| Fluxo não sugere Jurídico / destino após autorização | Corrigido | `proximo-destino.ts` + ordem nova da contratação direta |
| Sanar só na tela do parecer | Corrigido | diligência na peça (`cc6609e`) |
| Despacho se mistura ao trocar destino | Corrigido | `ComQuemEstaBarra.tsx:439-461` |
| Quem anexou cada versão | Corrigido | `criado_por_nome` no anexo (`pecas-fase-interna.service.ts:325`) |
| Dois formatos de nº de processo | Corrigido | PR #529 |
| Painel da requisitante mostra o órgão inteiro | **Aberto** | painel antigo lê `/licitacoes?limit=50` sem filtro por setor (`fase-interna/painel/page.tsx:224`) |
| Três caixas de entrada | **Aberto** | ver 3.3 |
| Painel TV, seção 11 até a reserva, 2ª aprovação do DFD | Não verificados na homologação | permanecem sem teste com usuários |

## 3. Achados por área

### 3.1 Backend — segurança e consistência

| # | Sev. | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| B1 | Alta | **Concluir a fase interna sem papel.** `PUT :id/avancar` só passa pelo `DonoFaseInternaGuard` (órgão). `TransicoesService.executar` não checa permissão. Mesmo buraco em `PUT /licitacoes/:id/avancar-fase`. | `fase-interna.controller.ts:489-491`; `fase-interna.service.ts:778-811` | `exigirCondutor` (já existe em `permissao-etapa.service.ts:326`) nos dois endpoints; melhor ainda, tabela ato → quem pode dentro de `TransicoesService.executar`. |
| B2 | Alta | **Peça de tipo fora do modelo passa pelo guard.** `avaliar` devolve OK quando o tipo não está em nenhuma etapa (`OUT`, `PT`, `PB`, `PE`…). Qualquer usuário do órgão cria e emite a peça, que entra nos autos com folha. | `fluxo/permissao-etapa.service.ts:250-252`; `POST :id/documento` (`fase-interna.controller.ts:252-289`) | Tipo desconhecido → exigir condutor; lista explícita dos tipos livres. |
| B3 | Alta | **Endpoints de decisão sem papel:** justificar achado (vai para os autos), revisar conformidade, modo de disputa (decisão "do agente"), portaria de designação do órgão (qualquer servidor substitui a vigente), gerar/descartar rascunho de IA de outrem. | `conformidade.controller.ts:56-70, 85-88`; `fase-interna.controller.ts:205-231`; `rascunho-ia.controller.ts:31-49` | `@TrabalhoNaEtapa` com o passo certo ou `exigirAdminDoOrgao`; para DP/DEA a regra já existe (`avaliarDocumentoDoOrgao`) e nunca é acionada. |
| B4 | Alta | **Coordenação de concorrência em memória** (fila por processo, `aguardarPendentes` global, travas de aprovação, cache do modelo, registro de privilégio). Vale só com 1 réplica. `aguardarPendentes` faz um GET de conformidade esperar a sincronização de **todos** os processos da instância. | `tarefas.service.ts:141-286`; `aprovacao-pecas.service.ts:63-73`; `modelo-fluxo.service.ts:283-306` | Ou documentar "1 réplica" no deploy, ou `pg_advisory_xact_lock` por processo + outbox drenada por worker; espera por processo, não global. |
| B5 | Alta | **Lost update nas marcas do fluxo** (`reabertas`, `a_revisar`, `registros`): read-modify-write de jsonb sem lock, substituindo as colunas inteiras; a fila grava nas mesmas colunas. Dois "voltar" simultâneos perdem um. | `fluxo-processo.service.ts:94-111, 182-223`; `modelo-fluxo.service.ts:803-817` | Operadores jsonb atômicos (`\|\|`, `-`) dentro de transação com `FOR UPDATE`, ou executar voltar/avançar dentro da fila do processo. |
| B6 | Média | **Aprovação de etapa sem UPDATE condicional**: dois aprovadores do mesmo setor decidem juntos; se a etapa exige assinatura, assina duas vezes. `submeter` não é transacional. | `aprovacao.service.ts:195-336` | `UPDATE … WHERE status='EM_ANALISE' RETURNING` + 409 (padrão já usado em `tramitacao.service.ts:644-651`). |
| B7 | Média | **Três definições de "quem conduz"** (com/sem o criador) e duas de "responsável pela etapa" (com/sem chefe do setor). O criador sem agente pode excluir o processo mas recebe 403 ao voltar etapa; o chefe pode trabalhar na peça mas não voltar/concluir. | `tarefas.service.ts:1550-1569`; `licitacoes/permissao-atos-processo.ts:27-45`; `fluxo/permissao-etapa.ts:87-101` | Um `PapelNoProcessoService` único (conduz, autoridade, responsável, posse). |
| B8 | Média | **Custo por requisição**: o guard monta o contexto com 25 a 30 queries; o handler recomputa tudo (`etapasDoProcesso` chama sincronização, contexto de novo, `podeConduzir` 2×, e por passo `ehResponsavel` + `nomeDoSetor` — N+1). `getInstrucao` tem 28 chamadores. | `permissao-etapa.service.ts:111-187`; `tarefas.service.ts:1582-1716` | Contexto calculado uma vez por requisição e passado ao handler; memoizar `getInstrucao`; nomes/setores em lote. |
| B9 | Média | **`id::text = $1` em 332 lugares** anula os índices uuid; `documentos_fase_interna` sem índice em `licitacao_id`. | 34 arquivos; `entities/documento-fase-interna.entity.ts` | `WHERE id = $1::uuid`; `@Index(['licitacao_id','tipo','versao_atual'])`. |
| B10 | Média | **Estado em 7 lugares** apesar do "status derivado": `licitacoes.fase`, jsonb do fluxo, `tarefas.status`, status da peça, rodadas de aprovação, config do órgão **e** modelo (a config funde sempre com o modelo DISPENSA), folhas em 4 tabelas. | `tarefas.service.ts:296-306, 338-380`; `folhas-autos.ts:46-61` | Eleger `fluxos_processo_fase_interna` + `juntadas_autos` como fonte; o resto vira projeção; aposentar `configuracoes_fase_interna.responsaveis/prazos`. |
| B11 | Média | **Espinha por callbacks de construtor**: hooks registrados na ordem de instanciação dos providers, ciclos contornados com `require()` e `ModuleRef.get`. `FaseInternaService` (2.594 linhas) e `TarefasService` (1.745) são god services. | `tarefas.service.ts:152-175`; `fase-interna.module.ts:174-231`; `transicoes.service.ts:331-332, 528-544` | Eventos nomeados com prioridade declarada; extrair `InstrucaoService`, `ConfiguracaoOrgaoService`, `CaixaTarefasService`. |
| B12 | Média | **Duas APIs de pesquisa de preços** (`/precos/*`, 20 rotas, e `/pesquisa/*`) gravam o mesmo jsonb sem lock; `pesquisa-precos-agente.service.ts` é código morto (não está em `providers`). | `fase-interna.controller.ts:587-1017`; `fase-interna.module.ts:92,221` | Remover o serviço morto; deprecar `/precos/*` com data. |
| B13 | Média-Baixa | **Datas**: 7 colunas `timestamp` sem fuso na tramitação × `timestamptz` no resto; três cópias de `hojeBrasilia`. Depende de `TZ` do processo Node. Contagem de dias úteis está correta (sem off-by-one). | `entities/tramitacao-processo.entity.ts:86-191` | Migrar para `timestamptz`; `TZ=UTC` no processo; uma só função de "hoje". |
| B14 | Baixa | **`synchronize: true` por padrão em produção**; nenhuma migration cobre as tabelas da sprint; 6 "boot migrations" rodam a cada subida. | `app.module.ts:106-114`; `src/migrations` | Gerar migrations da sprint; `DB_SYNCHRONIZE=false`; boot migrations com tabela de "aplicada". |
| B15 | Baixa | **Testes**: unitários só em funções puras (bom); e2e sólidos por papel/órgão; **nenhum** teste de concorrência (`Promise.all` ausente), scheduler de prazos sem e2e, 20 e2e dependem de `aguardarPendentes()` em memória. | `test/*.e2e-spec.ts` | Testes de `reabrir × sincronizar`, `aprovarEtapa` duplo, `avisarPrazos` com relógio injetado. |

### 3.2 Conformidade com a Lei 14.133/2021

| # | Sev. | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| L1 | Alta | **Parecer desfavorável não produz efeito.** A conclusão (`FAVORAVEL`, `COM_RESSALVAS`, `DESFAVORAVEL`) é gravada, mas A72-III e a trava de publicação só olham o status da peça. Um parecer desfavorável assinado conclui a etapa e libera autorização e publicação sem despacho motivado (art. 53; TCU sobre divergência do parecer). | `telas/parecer-regras.ts:312-331`; `conformidade/art72.ts:146-156`; grep `DESFAVORAVEL` fora do parecer: nenhum uso | Regra `PARECER-01` (bloqueio nos portões B e C) quando a conclusão for desfavorável sem despacho motivado juntado; ressalvas → atenção com justificativa obrigatória. |
| L2 | Alta | **Art. 72, IV aceita "não se aplica".** DO é `obrigatorio: false`, ganha `pode_nao_se_aplicar`, e A72-IV considera pronta a peça em `NAO_SE_APLICA`. O inciso IV não tem a ressalva "se for o caso". | `documentos-obrigatorios.ts:139, 194-197`; `regras.ts:271` | DO obrigatória na contratação direta; exceção só por hipótese sem despesa, com justificativa e atenção. |
| L3 | Alta | **ETP e TR contam como prontos com incisos obrigatórios vazios.** `gerar` exige "ao menos uma seção"; `incisosObrigatoriosVazios` e `obrigatorias_faltando` só vão para a tela; `validarEtp`/`validarTr` só rodam na rota estruturada. | `documentos-tela.service.ts:456, 682`; `etp-analise.ts:72` | Bloquear a emissão com inciso obrigatório do art. 18, §2º vazio; exigir justificativa dos não obrigatórios ausentes (IN 58, art. 9º, §2º); TR com alínea a–j vazia não emite. |
| L4 | Alta | **Prazo do art. 75, §3º**: mínimo = `inicioDoDia(vencimento)`. Divulgação segunda 10h → recebimento pode encerrar quinta 00:00 (menos de 3 dias úteis completos). O próprio arquivo marca a escolha como "a validar". | `publicacao/regras-publicacao.ts:303-306, 47-56` | Mínimo = fim do dia do vencimento (ou mesmo horário da divulgação no 3º dia útil), para dispensa e art. 55. |
| L5 | Alta | **Justificativa de preço da inexigibilidade (art. 23, §4º) não é distinta da pesquisa.** A72-VII só exige RAG/JC "pronto"; exige 3 cotações mesmo com fornecedor exclusivo (estrito demais) e aceita qualquer texto no RAG (frouxo demais). | `art72.ts:56-84`; `pesquisa-regras.ts:199-205`; `modelos-padrao.ts:248-254` | Para `ART74_*`: fontes do §4º (contratos/NF do próprio fornecedor), seção obrigatória "Justificativa do preço" com texto mínimo, A72-VII conferindo a seção. |
| L6 | Média | **Segregação de funções (art. 7º, §1º) só como aviso ao configurar o modelo.** Nada no ato: quem emitiu a pesquisa assina a autorização sem registro. | `fluxo/modelo-fluxo.ts:444-465`; `semente-fluxo.ts:222-224` | Atenção com justificativa nos portões B/C quando o signatário da AA emitiu PP/RAG/PJ; pares parecer×autorização e requisitante×pesquisa. |
| L7 | Média | **Ramo do art. 75, §1º**: item com código e sem classe cai em `COD:<código>` (dois CATMAT da mesma classe não somam); só processos `DISPENSA%`; exercício = ano de criação; rascunhos contam. Valores 2026 corretos (R$ 130.984,20 / R$ 65.492,11). | `limites-dispensa.ts:112-126`; `consumo-limite.service.ts:62-84` | Resolver classe a partir do código (tabela grupo/classe); considerar contratos importados; LIM-03 vira bloqueio no art. 75, I/II. |
| L8 | Média | **Parâmetros do art. 23, §1º (I–V) e preferência não são exigidos**: `avisos` da pesquisa é declarado e nunca preenchido. | `pesquisa-regras.ts:414-436` | Atenção com justificativa quando IV é usado sem consulta registrada a I e II. |
| L9 | Média | **Validade de 1 ano das fontes** só no agente automático; cotações manuais das fontes I–III sem checagem de idade. | `pesquisa-precos-providers.service.ts:13,397,1070`; `pesquisa-regras.ts:380-384` | Alerta `FONTE_HA_MAIS_DE_1_ANO` em toda cotação, excluindo-a do cômputo. |
| L10 | Média | **Outliers com justificativa padrão gerada pelo sistema** ("Descartado como outlier pelo responsável"). IN 65, art. 6º, §§2º-3º exige exclusão fundamentada. | `fase-interna.service.ts:2020-2028` | Motivo digitado obrigatório; registrar o critério e o valor excluído no mapa. |
| L11 | Média | **Matriz de riscos nunca obrigatória** (art. 22, §3º; art. 18, X). | `documentos-obrigatorios.ts:137`; `matriz-riscos.type.ts:2-5` | `RISCO-01` bloqueio para obra/serviço de engenharia de grande vulto; atenção nas demais licitações. |
| L12 | Média | **PCA (art. 12, VII)**: vínculo só como alerta; nenhuma comparação valor/quantidade com o item do PCA. | `pre-publicacao.ts:243-260` | Atenção com justificativa no portão C sem vínculo; `PCA-01` comparando valor estimado × item do PCA. |
| L13 | Média | **Aviso de dispensa (PDF)** sem habilitação, ME/EPP, local/prazo de entrega, pagamento, remissão ao TR (IN 67/2021, art. 7º). O modelo JC chamado "Aviso de Contratação Direta" não é o aviso publicado. | `licitacoes/aviso-dispensa-pdf.ts:59-132`; `modelos-padrao.ts:169-181` | Completar o PDF a partir do TR; renomear o modelo JC. |
| L14 | Média | **Prazo de 3 dias úteis imposto por modalidade, não pelo fundamento**: art. 75, §3º só vale para os incisos I e II; nas demais hipóteses (emergência etc.) o sistema pode exigir o que a lei não exige. | `regras-publicacao.ts:164-165`; `definicoes.ts:69` | Condicionar PRAZO-01 ao inciso do fundamento ou a uma opção "com aviso público". |
| L15 | Média | **Publicação do ato/contrato (art. 72, p.ú.; art. 94)** sem tarefa nem alerta pelos 10/20 dias úteis. | `pncp/mapeamento-pncp.ts:528-529` | Tarefa com prazo criada na autorização/assinatura. |
| L16 | Baixa | MARCA-01 bloqueia por regex heurística; A72-III é só atenção no portão C (o bloqueio vem da etapa do modelo, que o admin da plataforma pode editar); DFD/ETP/TR/RAG contam prontos sem assinatura; TR não depende do ETP na semente; autorização fundamentada em "Art. 18, II" (deveria ser art. 72, VIII); LGPD ausente; garantia (art. 96) só cláusula opcional. | `regras.ts:419-472, 270`; `peca-regras.ts:167-180`; `semente-fluxo.ts:44-45`; `modelos-padrao.ts:151-156, 304` | Ver recomendações item a item no relatório jurídico (seção 5). |

**Nota do fluxo padrão "Câmara — Portaria 089"**: 4/5. Ordem correta (I, II e IV antes do VIII; parecer antes da autorização, art. 53, §4º), obrigatoriedades e dependências mínimas validadas pelo modelo, opcionais coerentes com a lei. Faltam o tratamento do parecer desfavorável, a segregação em tempo de execução e a dependência TR ← ETP.

### 3.3 Frontend — UX e código

| # | Sev. | Achado | Evidência | Recomendação |
|---|---|---|---|---|
| F1 | Alta | **A consolidação da §8 do plano não foi feita e o menu ainda promove o mundo antigo**: Painel, lista antiga, Mapa de Riscos, assistente de 12 etapas com templates próprios, editor antigo (página real, não redirect), aba Tramitação com **dois** componentes de linha do tempo e um segundo diálogo de envio sem sugestão nem prazo, aba Documentos listando peças da fase interna. | `FaseInternaNav.tsx:194-225`; `navigation.tsx:170-173`; `processos/novo/page.tsx:187-200`; `AbasProcesso.tsx:482, 526-529`; `TramitacaoProcessoCard.tsx:169-233` | Sem apagar nada: tirar Painel/Riscos do menu, apontar "Processos" para a lista nova, manter só `LinhaDoTempoTramitacao` (abaixo do "Está com…", como a §6 pede), tirar os botões do card antigo, redirecionar o editor antigo quando houver tela da peça. |
| F2 | Alta | **Três caixas de entrada** para o mesmo servidor: Minhas tarefas, Central com 7 abas, Tramitação. Uma assinatura aparece em 3 lugares; "Aprovar demanda" existe em 3 lugares com endpoints diferentes; badges divergem (o `FaseInternaNav` conta `/licitacoes?limit=100` no cliente — errado acima de 100). A Central sem `?tab=` espera a carga de **todas** as abas (até 8 s). | `CaixaTarefas.tsx:212-215`; `aprovacoes/page.tsx:1032-1048, 1210-1260`; `FaseInternaNav.tsx:124-139` | Uma caixa: Minhas tarefas com filtros Aprovar / Assinar / Fazer / Receber; Documentos/Assinaturas/Demandas da Central viram filtros dela; a Central fica com almoxarifado, contratos e medições. |
| F3 | Alta | **Cascata de requisições sem cache**: um "Gerar" no ETP dispara cerca de 15 requisições (`EtapaShell` escuta o próprio evento, hooks com efeito **e** listener, 2 a 3 `CaminhosDaPeca` por tela). A tela do processo carrega cerca de 15 endpoints e refaz **tudo** a cada `atualizar()` e a cada `focus`/alt-tab. | `EtapaShell.tsx:109-130`; `CaminhosDaPeca.tsx:98-101, 637-640`; `telas.ts:65-70`; `AbasProcesso.tsx:101, 497-532` | Cache/dedupe por chave (`/etapas`, `/instrucao`, `/licitacoes/:id`); `atualizacao` como contador; ignorar o próprio evento; refetch por foco só após 30 s; `FilaPncp` uma vez. |
| F4 | Alta | **Arquivos gigantes com `any`**: `aprovacoes/page.tsx` 2.905 linhas, 57 `useState`, 35 `any`; `processos/novo/page.tsx` 2.286 linhas com prompts de IA embutidos; `PesquisaPrecosDetalhe.tsx` 1.747 linhas, 0 `useMemo`. | (arquivos citados) | Quebrar por aba/diálogo; prompts e templates para `lib/`; tipar as respostas (`EtpTela` já existe). |
| F5 | Média | **Bugs de estado**: Minutas perde a decisão de sigilo ao trocar de aba; ETP monta o editor duas vezes (guarda `!== undefined` com estado inicial `null`) e monta dois `AssistenteEtp`; `MetodoCalculo`/`Propostas` da pesquisa não ressincronizam; corpo das telas de etapa não assina o evento de atualização (só o shell); **identidade do `localStorage`** no corpo do "não se aplica" (`PecasFaseInterna.tsx:132-134`), contra a §7 do plano. | `minutas/page.tsx:93-115`; `etp/page.tsx:56, 149-159, 218`; `pesquisa/page.tsx:428, 617-620` | Corrigir um a um; retirar as 14 leituras de `localStorage.usuario/orgao` do escopo. |
| F6 | Média | **O próximo passo não é único e entregar a etapa exige sair da tela**: nenhuma tela de etapa tem "Está com… / Enviar para" (4 cliques); DFD com duas CTAs simultâneas e orientações contraditórias (toast diz "envie para assinatura", cartão diz "conclui sozinha"); códigos de regra (`LIM-01`, `A72-VI`) vazam para o servidor; aviso "somente leitura" repetido 3× no ETP; motivo dos botões desabilitados só em `title` (invisível no toque). | `dfd/page.tsx:161, 207-214, 446-447`; `FluxoFaseInterna.tsx:309`; `CaminhosDaPeca.tsx:285-321` | `EtapaShell` com faixa compacta "Está com … · Enviar para ▾"; uma CTA primária por estado; texto amigável pronto do servidor com o código só em `title`; um aviso de leitura por tela. |
| F7 | Média | **Acessibilidade e consistência**: tablists sem setas/`aria-controls`; `dangerouslySetInnerHTML` com HTML do servidor em dois pontos (sem sanitizar); 71 cores inline em vez de tokens. | `minutas/page.tsx:233-252`; `autorizacao/page.tsx:364`; `VisorDosAutos.tsx:121` | Radix Tabs; DOMPurify ou renderizar como texto (padrão da `RascunhoIaFaixa`); tokens. |
| F8 | Média | **Quatro helpers de erro** e catches silenciosos que deixam quadros vazios; a tela do processo mostra "HTTP 403" cru. | `telas.ts:151-155`; `despacho.ts:139-144`; `PecasFaseInterna.tsx:85`; `page.tsx:56` | Um `erroDaApi` em `lib/api`; estado visível "não foi possível carregar — tentar de novo". |
| F9 | Baixa | Rotas e textos hardcoded (`/orgao/aprovacoes?tab=` em 5 arquivos; três separadores de caminho diferentes); testes só em `visao-fluxo.test.mjs` e `aba-inicial.test.mjs`. | — | `lib/rotas.ts`; estender o padrão "lógica pura em `lib/` + `node --test`". |
| F10 | Baixa | **Painel antigo com N+1 no navegador**: busca 50 processos e depois `/documentos` de cada um; ainda está no menu. | `fase-interna/painel/page.tsx:224-236` | Retirar do menu (F1) ou trocar por um endpoint agregado. |

## 4. Pontos fortes (para não perder)

- **Estado derivado e regras puras**: `etapasDaFaseInterna`, `avaliarPermissaoEtapa`, `sugerirEnvio`, `validarDataOcorrencia` são funções sem I/O, documentadas e com specs. A lógica mais delicada é testável sem banco.
- **Padrões de concorrência corretos onde importa**: `FOR UPDATE` na licitação ao versionar peça e ao enviar; UPDATE condicional com `RETURNING` no receber; índice único parcial + `orIgnore` nas tarefas.
- **Guard declarativo único** (`@TrabalhoNaEtapa`), com motivo legível no 403 e a mesma regra reaproveitada pela tela e pelo módulo de documentos.
- **Dias úteis centralizados** com calendário por órgão e semântica do art. 183 explícita, sem off-by-one.
- **Frontend**: `visao-fluxo.ts` puro e testado; sincronização sem F5 por evento com "a última carga vence"; `EtapaShell` + "somente leitura" com motivo do servidor; `DecisaoNoCelular` da autoridade; linguagem de servidor com fundamento legal em cada tela e "Trava da lei" com ajuda.
- **Harness e2e** com Postgres efêmero que recusa apontar para banco real, cenários por papel e órgão.

## 5. Sequência sugerida

| Rodada | Escopo | Por quê primeiro |
|---|---|---|
| 1 (dias) | B1, B2, B3 (permissões); L1, L2, L4 (parecer desfavorável, art. 72 IV, prazo do §3º); B5 (marcas jsonb atômicas) | Risco jurídico e de auditoria imediato; correções pequenas e localizadas, com e2e no padrão já existente. |
| 2 | L3, L5, L6, L7, L10 (conteúdo das peças e pesquisa); B6 (aprovação condicional); B7 (papel único) | Fecham o "verificar conteúdo, não só status" e a segregação. |
| 3 | Decisão de réplicas (B4); B8/B9 (contexto por requisição, índices, `::uuid`); F3 (cache no front) | Performance e escala; dependem de decisão de infra. |
| 4 | F1, F2 (consolidação das telas e uma caixa só), F6 (entregar a etapa sem sair da tela) | Exige OK item a item do dono (§8 e §10-6 do plano). |
| 5 | B10, B11, B12, B14 (estado único, eventos nomeados, API de preços, migrations); F4, F5, F7, F8 | Dívida estrutural; melhor depois que o comportamento estiver estável. |

Itens não verificados nesta análise, a cobrir num próximo teste com usuários: Painel TV, seção 11 até a reserva, 2ª aprovação do DFD, adjudicação/homologação exigindo o registro da razão da escolha e do preço (art. 72, VI/VII na dispensa eletrônica).
