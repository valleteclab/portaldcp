# Plano — Fase interna única, com tramitação entre setores

> 26/09/2026 · Status: **proposta para aprovação do dono**. Nada foi implementado.
> Base: o mapa de fluxo da Câmara (enviado pelo dono), a Portaria 089/2024 da Câmara de LEM, a Lei 14.133/2021 e um levantamento do código atual (anexo A).

## 1. O problema, em uma frase

O sistema sabe **o que falta** (peças, checklist, conformidade), mas não mostra **com quem o processo está**. Por isso a fase interna parece um formulário, e não um processo andando de mesa em mesa com despacho, como nos autos em papel.

**Por que isso aconteceu:** hoje existem três mecanismos que não se conversam.

| Mecanismo | O que faz bem | O que falta |
|---|---|---|
| **Tramitação** (estilo SEI) | envia de setor para setor com despacho; receber e devolver | não gera folha nos autos; não manda WhatsApp; prazo em dias corridos; só aparece numa aba escondida |
| **Tarefas** | sabem o próximo passo; prazo em dias úteis; WhatsApp com link; caixa "Minhas tarefas" | não registram a passagem entre setores nem o despacho |
| **Fluxo de aprovação de documentos** | é configurável por órgão (etapas, ordem, aprovadores) | só aparece no editor antigo |

Testar com um único usuário, com todos os papéis, escondia exatamente essa lacuna.

## 2. A ideia

**Uma única fase interna, em que a tramitação é a espinha.**

1. O processo está sempre **com um setor** (e, se houver, com uma pessoa), desde uma data e com um prazo.
2. Cada setor **recebe**, **faz a sua parte** e **envia** para o próximo. A parte pode ser gerada no sistema, com a IA fazendo o rascunho e o humano revisando, ou feita fora e anexada em PDF.
3. Cada envio gera um **despacho curto** ("Encaminhe-se à Contabilidade para a reserva orçamentária"), que entra nos **autos como folha**, igual ao papel.
4. Quem recebe é avisado **no WhatsApp** com o link, como já acontece com OS e medição.
5. As **travas da lei** (hoje chamadas de "portões") continuam impedindo o que a lei proíbe.
6. O **caminho** (quais setores, em que ordem, com que prazo) é **configurado pelo administrador** do órgão, dentro do que a lei permite.

### Mesmo quando tudo é feito à mão

Se o setor trabalha no papel ou no Word, o sistema **ainda precisa saber com quem o processo está**. O usuário registra no sistema:
- "**Recebi** o processo" (um clique);
- "**Juntei** o documento feito fora" (anexa o PDF, informa número e data);
- "**Enviei** para o setor X" (o despacho vem sugerido e pode ser editado).

Se o processo físico já andou antes de alguém registrar, dá para lançar a movimentação **com a data em que ocorreu**. A data não pode ser futura, fica registrado quem lançou, e o sistema marca que o lançamento foi feito depois do fato.

## 3. O que são as "travas da lei" (hoje "portões")

São **verificações obrigatórias ligadas a um ato**: o sistema não deixa o ato acontecer enquanto a lei não estiver cumprida.

| Trava | Ato que ela segura | O que ela exige | Base |
|---|---|---|---|
| **A: limite da dispensa** | concluir a pesquisa de preços | a soma das dispensas do mesmo ramo no exercício não pode passar o limite (evita fracionamento) | art. 75, §1º |
| **B: art. 72** | autorizar a contratação | DFD e ETP/TR prontos, pesquisa de preços e reserva orçamentária | art. 72, I, II e IV |
| **C: antes de publicar** | publicar o aviso | todas as peças citam o mesmo inciso e o número deste processo; peças assinadas e datadas; marca só com "ou similar" ou justificativa | arts. 72, 75 e 41, I |

Além das travas, a **conformidade** faz uma revisão completa e aponta **atenções**: coisas para conferir ou justificar, que não bloqueiam.

**Proposta:** trocar o nome "Portão A/B/C" na tela por **"Trava da lei"**, com a frase do que ela segura. Exemplo: "Trava da lei: não publica enquanto houver peça sem assinatura".

## 4. O mapa padrão (modelo "Câmara — Portaria 089")

Este é o mapa enviado pelo dono, com os ajustes de lei. Vira o **modelo pronto** que o administrador usa como ponto de partida.

| # | Setor | Faz | Envia para | Prazo | Obrigatória? |
|---|---|---|---|---|---|
| 1 | Requisitante | Demanda + DFD | Presidência (ou direto a Compras) | — | sim (art. 72, I) |
| 2 | Presidência | Despacho "autorizo o início" | Compras | 3 d.u. | **opcional**: a lei não exige; alguns órgãos usam |
| 3 | Compras (ou o requisitante, com apoio) | ETP ou justificativa de dispensa do ETP, TR, **pesquisa de preços** | Licitações/Agente | pesquisa: 30 d.u. | sim (art. 72, I e II; art. 23) |
| 4 | Licitações/Agente | **Indica a modalidade/enquadramento** pelo valor apurado | Contabilidade | 3 d.u. | sim (Portaria 089, art. 56) |
| 5 | Contabilidade | Reserva orçamentária (dotação) | Agente | 3 d.u. | sim (art. 72, IV) |
| 6 | Agente de contratação | Relatório, minutas (aviso e contrato) | Jurídico | 5 d.u. | sim |
| 7 | Jurídico | Parecer, **ou diligência que volta para quem fez a peça** | Controle interno ou Presidência | 5 d.u. | sim, salvo hipótese dispensada em ato do jurídico (art. 53, §§4º e 5º) |
| 8 | Controle interno | Manifestação | Presidência | 3 d.u. | **opcional** (liga/desliga por órgão) |
| 9 | Presidência | Autorização da contratação direta | Agente | 3 d.u. | sim (art. 72, VIII) |
| 10 | Agente | Conformidade e publicação (aviso por 3 dias úteis na dispensa eletrônica) | — | 5 d.u. | sim (art. 72, parágrafo único; art. 75, §3º) |

Notas de lei:
- A **ordem** das etapas 2 a 8 pode variar entre órgãos. O sistema só impede o que a lei impede, por exemplo autorizar sem pesquisa e reserva, ou publicar sem autorização.
- **Segregação de funções** (art. 7º, §1º): o sistema **avisa** quando a mesma pessoa está configurada em funções que se controlam. Exemplos: quem faz a pesquisa também autoriza; o agente de contratação também é a autoridade.
- Para licitação (pregão/concorrência), o modelo é outro, com o parecer antes da autorização da abertura (art. 53). O mesmo mecanismo serve; muda só o modelo.

## 5. O que o administrador configura ("BPMN leve")

Um **modelo de fluxo por tipo** de processo (dispensa, inexigibilidade, licitação). Para cada etapa, o administrador escolhe:
- **quem faz**: setor, papel ou pessoa;
- **prazo** em dias úteis, pelo calendário do órgão;
- se a etapa **está ligada** (só as opcionais podem ser desligadas);
- se a **IA prepara o rascunho** quando o processo chega;
- **aprovação interna** antes de enviar (ex.: o chefe do setor requisitante aprova o TR). Isso reaproveita o "fluxo de aprovação de documentos", que hoje está escondido;
- **para onde vai** a seguir. Vem sugerido pela ordem, mas quem envia pode escolher outro setor permitido.

**O que o administrador NÃO pode fazer:** tirar etapa obrigatória por lei ou pôr a autorização antes da pesquisa e da reserva. Ao salvar, o sistema **valida o modelo** e explica o erro com o artigo. Exemplo: "Falta a autorização da autoridade (art. 72, VIII)".

**Por que não um BPMN livre:** um editor livre (caixas e setas à vontade) permitiria desenhar um fluxo ilegal e é difícil de manter. Uma sequência de etapas com devolução e etapas opcionais cobre praticamente todos os casos de Câmara e prefeitura. A tela **mostra o desenho** do fluxo como diagrama, mas a edição é por lista.

## 6. A tela do processo (o que muda para o usuário)

No topo, sempre:

> **Está com: Contabilidade** (Maria) · desde 20/09 · prazo 23/09 (faltam 2 dias úteis)
> [Recebi] [Anexar feito fora] [Enviar para: Agente de contratação ▾]

Abaixo:
- **Linha do tempo**: cada envio, recebimento, devolução e peça, com data, quem fez e despacho. É o que o papel mostra nos autos.
- **O que falta nesta etapa**: a peça do setor atual, com "Gerar (IA faz o rascunho)" ou "Anexar feito fora".
- **Travas e atenções**: o que impede o próximo ato, em linguagem simples.

Em **Minhas tarefas**: "Chegou para você/seu setor", com prazo. O painel da TV passa a mostrar "com quem está" pela tramitação.

## 7. O que se aproveita (quase tudo)

| Já existe | Como entra |
|---|---|
| Tramitação (setores, despacho, receber, devolver, caixa) | vira a espinha: ganha folha nos autos, WhatsApp, prazo em dias úteis e identidade pelo login (hoje vem do navegador — corrigir) |
| Tarefas e "Minhas tarefas" | viram a caixa de entrada da tramitação: chegou ao setor, aparece a tarefa |
| Telas das etapas (DFD, ETP, TR, pesquisa, reserva, autorização, minutas, parecer, controle interno, conformidade) | continuam como "o que o setor faz", sem refazer |
| Configuração da fase interna (modo, responsáveis, prazos Portaria 089, controle interno) | evolui para o modelo de fluxo; o que o órgão já configurou é migrado automaticamente |
| Fluxo de aprovação de documentos | vira a "aprovação interna da etapa" |
| Conformidade e travas | continuam; passam também a validar o modelo de fluxo |
| Anexar feito fora / juntada em lote | continua em toda etapa |
| Autos, folhas e versões | continuam; o despacho de envio passa a ser folha |
| WhatsApp e e-mail (padrão de OS e medição) | cada envio avisa quem recebe; aviso de prazo vencendo e vencido |
| IA (assistente do ETP, editor por seções, copiloto, agente de pesquisa) | passa a existir em toda etapa, com rascunho na chegada e humano revisando; a revisão fica registrada |
| Painel da TV | passa a ler "com quem está" da tramitação |

## 8. Consolidar: uma fase interna só

Estas telas antigas ainda funcionam em paralelo e confundem. **Proposta, para decidir item a item** (nada sai sem OK):

| Tela antiga | Proposta |
|---|---|
| `processos/[id]/editar` (abas dados, classificação, **itens**, cronograma…) | manter só o que é da fase externa (cronograma, habilitação); dados e itens passam para a tela do processo |
| Editor antigo `fase-interna/processos/[id]/editor` | substituído pelas telas das etapas; vira redirecionamento |
| Riscos em tela separada | entra dentro do ETP |
| Painel antigo e lista antiga da fase interna; lista antiga `/orgao/licitacoes` | redirecionar para a lista de processos |
| Aba "Documentos" do processo (segunda porta de entrada de peças) | fica só para documentos da fase externa; peças da fase interna entram pela etapa |
| Aba "Tramitação" | some, porque a tramitação vai para o topo da tela do processo |

## 9. Entregas

| # | Entrega | Resultado visível |
|---|---|---|
| **T0** | Fechar as correções do teste do Cowork (PRs #515, #516 e a de estados) | teste do Cowork sem os erros graves |
| **T1** | **Tramitação como espinha** (backend): liga tramitação ↔ tarefas; despacho vira folha nos autos; identidade pelo login; só o setor de destino recebe; prazo em dias úteis; WhatsApp; lançamento de movimentação com a data em que ocorreu; testes de isolamento entre órgãos | o sistema sabe com quem está cada processo, inclusive o feito à mão |
| **T2** | **Tela do processo**: "Está com…", linha do tempo, botões Recebi / Anexar / Enviar com despacho sugerido; Minhas tarefas e painel TV lendo a tramitação | o usuário vê o processo andando |
| **T3** | **Modelo de fluxo configurável**: tela do administrador (lista + diagrama), validação pela lei, modelo "Câmara — Portaria 089", migração da configuração atual, aprovação interna da etapa | cada órgão desenha o seu caminho |
| **T4** | **IA em toda etapa**: rascunho ao chegar (incluindo DFD e despacho), revisão humana registrada | IA faz, humano revisa |
| **T5** | **Consolidação** das telas antigas (item a item, com OK) | uma fase interna só |
| **T6** | **Teste com vários usuários**: roteiro do Cowork com 6 logins (requisitante, compras, contabilidade, jurídico, autoridade, agente), um papel cada | ver o processo como cada servidor vê |

Cada entrega segue o padrão das anteriores: PR com testes (incluindo isolamento de dados), CI verde, merge, Railway; VPS só com ordem do dono.

## 10. Decisões do dono (26/09/2026, noite)

1. **Modo simples:** **SIM**, a tramitação é registrada automaticamente ao concluir cada etapa, com despacho padrão gerado.
2. **Despacho de envio nos autos como folha:** **SIM.**
3. **Parecer jurídico dispensável** (art. 53, §5º): **SIM, permitido**, exigindo o **número do ato** do jurídico, citado nos autos.
4. **"Portões" → "Trava da lei"** na tela: sem resposta explícita; adotada a recomendação (renomear).
5. **Aviso de chegada:** sem resposta explícita; adotada a recomendação (pessoa → só ela; setor → todos do setor; chefe do setor opcional).
6. **Telas antigas** (seção 8): continuam precisando de OK item a item. **Nada é removido** nesta rodada.

**Pedidos novos do dono, na mesma noite:**
- **Nada de regras "hardcoded".** Quais etapas existem, as dependências entre elas, quem faz, os prazos, o que é opcional, os requisitos mínimos da lei e quais regras travam cada ato ficam em **dados** (tabelas com modelo inicial carregado automaticamente). Não ficam em constantes no código. O catálogo de verificações (o "como verificar") continua em código; **quais** se aplicam e **com que severidade** vem dos dados.
- **Visão da fase interna** igual à visão do processo inteiro: cada fase aparece com a sua situação.
  - Cada fase pode **avançar** ou **voltar**.
  - Uma fase que **depende** de outra **não inicia** antes de a outra terminar.
  - Fases **independentes podem começar em paralelo**.
- **Aprovação de início do processo de compra:** por enquanto é **só a aprovação da demanda**, feita pela pessoa designada para aprovar. As fases seguintes só abrem depois dela.

## 11. Execução (a partir de 26/09/2026, noite)

Agentes trabalhando como na disputa: PR com testes, CI, merge, Railway.

| Rodada | Frente | Escopo |
|---|---|---|
| 1 | **F1: Modelo de fluxo em dados** | tabelas do modelo de fluxo (etapas, dependências, responsáveis, prazos, opcionais, requisitos da lei, travas por ato); modelo "Câmara — Portaria 089" semeado; migração da configuração atual; `etapasDaFaseInterna` passa a ler o modelo; aprovação da demanda como início; parecer dispensável com nº do ato; validação do modelo pela lei; tela do administrador (lista + diagrama) |
| 1 | **F2: Tramitação como espinha (backend)** | despacho vira folha nos autos; identidade pelo login; só o setor de destino recebe; prazo em dias úteis; WhatsApp; lançamento com data em que ocorreu; API "com quem está" + linha do tempo; serviço interno de envio para uso da F3 |
| 2 | **F3: Integração + visão** | chegada ao setor gera a tarefa; tramitação automática no modo simples; painel TV lê a tramitação; **visão da fase interna** (fases, dependências, avançar/voltar); topo "Está com…" na tela do processo; "Trava da lei" na tela |
| 3 | **F4: Roteiro Cowork com vários usuários** e **IA em toda etapa** (T4) | conforme seções 6 e 9 |

## 12. F1 — Modelo de fluxo em dados (entregue, 27/09/2026)

Branch `claude/fluxo-modelo-dados`. Código em `backend/src/fase-interna/fluxo/`; tela em `/orgao/configuracoes/fluxo`.

**O que saiu das constantes e foi para tabelas** (semeadas no boot, idempotente):

| Antes (código) | Agora (dados) | Quem edita |
|---|---|---|
| `DEPENDENCIAS_DIRETA`, `DEPENDENCIAS_RITO`, `DEFINICAO_PASSO` (papel, prazo 089, portão), ordem das etapas, `TELA_DO_PASSO` | `modelos_fluxo_fase_interna` + `modelos_fluxo_etapas` — um modelo por órgão e tipo (DISPENSA, INEXIGIBILIDADE, LICITACAO); `orgao_id` nulo = modelo do sistema "Câmara — Portaria 089" | órgão (o seu); admin da plataforma (o do sistema) |
| responsáveis, prazos e controle interno de `configuracoes_fase_interna` | etapas do modelo do órgão (o PUT antigo continua aceito e grava no modelo) | administrador do órgão |
| — (novo) requisitos mínimos da lei | `requisitos_legais_fluxo` (etapa obrigatória, dependência mínima, segregação) | só o admin da plataforma |
| `regrasDoPortao` (A, B, C) | `travas_ato_fluxo`: ato → regra + severidade aplicada no ato | só o admin da plataforma |
| — (novo) estado do fluxo no processo | `fluxos_processo_fase_interna`: snapshot do caminho + versão, aprovação da demanda, reabertas, a revisar, registros | ações do processo |

Continua em código só o **catálogo** (o que o sistema sabe fazer: tela de cada etapa, tipos de peça, como conclui) e o "como verificar" das regras de conformidade.

**Decisões:**
- **Snapshot do caminho, operacional vivo.** O processo guarda o retrato do modelo quando nasce (etapas, dependências, obrigatórias, peças, exigência de aprovação, dispensa por ato) e a versão. Editar o modelo não muda o caminho de processo em andamento. Quem faz, prazo, IA, aprovação interna e o liga/desliga das opcionais seguem o modelo vigente — é o contrato da configuração desde a Entrega 2 (reatribuir tarefas, ligar/desligar o controle interno) e não muda o caminho legal. Opcional ligada depois só entra no processo se nenhuma etapa que depende dela começou.
- **Aprovação da demanda** (pedido do dono): o modelo define quem aprova (padrão: "pode aprovar demandas" e o login do órgão). Conta como aprovada, sem clique: processo nascido de demanda aprovada no módulo de demandas; DFD juntada feita fora (o modelo pode desligar isso); DFD feita, aprovada (fluxo de aprovação de documentos) ou assinada por quem aprova; no **modo simples** (decisão 1: uma pessoa conduz tudo), o agente do processo. Processos anteriores à F1 = **legado**, aprovados (nada trava).
- **Fluxo de aprovação de documentos reaproveitado** como "aprovação interna da etapa": com a opção ligada, a peça feita no sistema só conta depois de aprovada no fluxo do órgão (ou assinada) — a mesma regra que a instrução já aplicava aos tipos com fluxo configurado.
- **Voltar/avançar:** reabrir etapa concluída (motivo obrigatório; só quem conduz o processo) deixa as dependentes concluídas "a revisar", sem apagar peça; a marca sai sozinha quando a peça é alterada, ou pelo "avançar" (confirmar a revisão). A conformidade reflete: regra **FLUXO-01** (bloqueio) segura a publicação enquanto houver etapa reaberta ou a revisar. Reabrir a demanda desfaz a aprovação.
- **Parecer dispensável** (art. 53, §5º): só se o modelo permitir (etapa "dispensável por ato"; recusado na licitação) e com número e data do ato; vira o "não se aplica" do parecer com a justificativa citando o ato — vai para o termo de justificativas dos autos e satisfaz a A72-III.
- **Etapas novas opcionais** (desligadas por padrão): "autorização de início" e "indicação da modalidade" concluem por **despacho registrado** no processo.

---

## Anexo A — Levantamento técnico (26/09/2026)

- **Tramitação:** `backend/src/fase-interna/tramitacao.service.ts` e `entities/tramitacao-processo.entity.ts` (tabela `tramitacoes_processo`: setor e usuário de origem e destino, `despacho`, `prazo_dias`/`data_prazo` corridos, status PENDENTE/RECEBIDA/DEVOLVIDA/CONCLUIDA). Endpoints em `processo-eletronico.controller.ts` (`:id/tramitar`, `tramitacoes`, `caixa-entrada`, `receber`, `devolver`).
  - Lacunas: não gera peça/folha; só notifica quando há `para_usuario_id`, o que o front nunca envia, e só com aviso interno; `receber` não confere o setor de quem recebe; usuário vem do `localStorage`.
  - Front: só `TramitacaoProcessoCard.tsx` na aba "tramitacao".
- **Setor:** `orgaos/entities/setor.entity.ts` (código e nome; sem chefe). Usuário tem um `setor_id` e `papeis_fase_interna`.
- **Tarefas:** `fase-interna/tarefas/*`.
  - Entidade `tarefas`: responsável por usuário, papel e/ou setor; prazo em dias úteis; `chave` idempotente.
  - Sincronização por `etapasDaFaseInterna` com gatilho após commit.
  - Notifica por e-mail e WhatsApp (`whatsapp_url`).
  - Configuração em `configuracoes_fase_interna`: modo SIMPLES/POR_SETOR, `responsaveis`, `prazos` (Portaria 089), controle interno, signatários.
- **Fluxo de aprovação de documentos:** `fase-interna/entities/fluxo-aprovacao.entity.ts` e `aprovacao.service.ts` (etapas ordenadas por órgão/tipo de documento, com setor/usuário e assinatura). Telas: `/orgao/configuracoes/fluxos-aprovacao`, `CaixaDocumentosAprovacao`, `AprovacaoEtapasPanel` (só no editor antigo).
- **Travas:** `fase-interna/conformidade/portoes.ts` e `regras.ts`. A = CONCLUIR_PESQUISA (LIM-01); B = AUTORIZAR (A72-I, II, IV); C = PUBLICAR (ENQ-01, VINC-01, MARCA-01, ASS-01; A72-VIII e PRAZO-01 garantidos no ato).
- **WhatsApp:** `NotificacoesService.criar/criarParaMultiplos` com `enviar_email: true`, `usuario_telefone` e `metadata.whatsapp_url`. Modelo: `notificarMedicaoAtestada`. WhatsApp configurado por órgão.
- **IA:** `ia/ia.service.ts` (OpenRouter). Assistente do ETP, `DocumentoSeccionado` + `PainelIA`, copiloto `preparar-automatico`, agente de pesquisa. Sem IA hoje: DFD, reserva, autorização, parecer, controle interno.
- **Anexar feito fora:** `POST fase-interna/:id/documentos/:tipo/anexo` → `JuntadaPecasService` → `anexarPeca` (versão, folhas, SHA-256). Lote em `fase-interna/externa/*`. O anexo avulso não grava log e não grava `criado_por_nome`.
- **Painel TV:** `painel-tv/painel-tv.service.ts` lê "com quem está" das tarefas abertas; não usa a tramitação.
