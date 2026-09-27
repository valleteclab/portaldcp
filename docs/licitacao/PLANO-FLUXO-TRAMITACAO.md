# Plano â€” Fase interna Ãºnica, com tramitaÃ§Ã£o entre setores

> 26/09/2026 Â· Status: **proposta para aprovaÃ§Ã£o do dono**. Nada foi implementado.
> Base: o mapa de fluxo da CÃ¢mara (enviado pelo dono), a Portaria 089/2024 da CÃ¢mara de LEM, a Lei 14.133/2021 e um levantamento do cÃ³digo atual (anexo A).

## 1. O problema, em uma frase

O sistema sabe **o que falta** (peÃ§as, checklist, conformidade), mas nÃ£o mostra **com quem o processo estÃ¡**. Por isso a fase interna parece um formulÃ¡rio, e nÃ£o um processo andando de mesa em mesa com despacho, como nos autos em papel.

**Por que isso aconteceu:** hoje existem trÃªs mecanismos que nÃ£o se conversam.

| Mecanismo | O que faz bem | O que falta |
|---|---|---|
| **TramitaÃ§Ã£o** (estilo SEI) | envia de setor para setor com despacho; receber e devolver | nÃ£o gera folha nos autos; nÃ£o manda WhatsApp; prazo em dias corridos; sÃ³ aparece numa aba escondida |
| **Tarefas** | sabem o prÃ³ximo passo; prazo em dias Ãºteis; WhatsApp com link; caixa "Minhas tarefas" | nÃ£o registram a passagem entre setores nem o despacho |
| **Fluxo de aprovaÃ§Ã£o de documentos** | Ã© configurÃ¡vel por Ã³rgÃ£o (etapas, ordem, aprovadores) | sÃ³ aparece no editor antigo |

Testar com um Ãºnico usuÃ¡rio, com todos os papÃ©is, escondia exatamente essa lacuna.

## 2. A ideia

**Uma Ãºnica fase interna, em que a tramitaÃ§Ã£o Ã© a espinha.**

1. O processo estÃ¡ sempre **com um setor** (e, se houver, com uma pessoa), desde uma data e com um prazo.
2. Cada setor **recebe**, **faz a sua parte** e **envia** para o prÃ³ximo. A parte pode ser gerada no sistema, com a IA fazendo o rascunho e o humano revisando, ou feita fora e anexada em PDF.
3. Cada envio gera um **despacho curto** ("Encaminhe-se Ã  Contabilidade para a reserva orÃ§amentÃ¡ria"), que entra nos **autos como folha**, igual ao papel.
4. Quem recebe Ã© avisado **no WhatsApp** com o link, como jÃ¡ acontece com OS e mediÃ§Ã£o.
5. As **travas da lei** (hoje chamadas de "portÃµes") continuam impedindo o que a lei proÃ­be.
6. O **caminho** (quais setores, em que ordem, com que prazo) Ã© **configurado pelo administrador** do Ã³rgÃ£o, dentro do que a lei permite.

### Mesmo quando tudo Ã© feito Ã  mÃ£o

Se o setor trabalha no papel ou no Word, o sistema **ainda precisa saber com quem o processo estÃ¡**. O usuÃ¡rio registra no sistema:
- "**Recebi** o processo" (um clique);
- "**Juntei** o documento feito fora" (anexa o PDF, informa nÃºmero e data);
- "**Enviei** para o setor X" (o despacho vem sugerido e pode ser editado).

Se o processo fÃ­sico jÃ¡ andou antes de alguÃ©m registrar, dÃ¡ para lanÃ§ar a movimentaÃ§Ã£o **com a data em que ocorreu**. A data nÃ£o pode ser futura, fica registrado quem lanÃ§ou, e o sistema marca que o lanÃ§amento foi feito depois do fato.

## 3. O que sÃ£o as "travas da lei" (hoje "portÃµes")

SÃ£o **verificaÃ§Ãµes obrigatÃ³rias ligadas a um ato**: o sistema nÃ£o deixa o ato acontecer enquanto a lei nÃ£o estiver cumprida.

| Trava | Ato que ela segura | O que ela exige | Base |
|---|---|---|---|
| **A: limite da dispensa** | concluir a pesquisa de preÃ§os | a soma das dispensas do mesmo ramo no exercÃ­cio nÃ£o pode passar o limite (evita fracionamento) | art. 75, Â§1Âº |
| **B: art. 72** | autorizar a contrataÃ§Ã£o | DFD e ETP/TR prontos, pesquisa de preÃ§os e reserva orÃ§amentÃ¡ria | art. 72, I, II e IV |
| **C: antes de publicar** | publicar o aviso | todas as peÃ§as citam o mesmo inciso e o nÃºmero deste processo; peÃ§as assinadas e datadas; marca sÃ³ com "ou similar" ou justificativa | arts. 72, 75 e 41, I |

AlÃ©m das travas, a **conformidade** faz uma revisÃ£o completa e aponta **atenÃ§Ãµes**: coisas para conferir ou justificar, que nÃ£o bloqueiam.

**Proposta:** trocar o nome "PortÃ£o A/B/C" na tela por **"Trava da lei"**, com a frase do que ela segura. Exemplo: "Trava da lei: nÃ£o publica enquanto houver peÃ§a sem assinatura".

## 4. O mapa padrÃ£o (modelo "CÃ¢mara â€” Portaria 089")

Este Ã© o mapa enviado pelo dono, com os ajustes de lei. Vira o **modelo pronto** que o administrador usa como ponto de partida.

| # | Setor | Faz | Envia para | Prazo | ObrigatÃ³ria? |
|---|---|---|---|---|---|
| 1 | Requisitante | Demanda + DFD | PresidÃªncia (ou direto a Compras) | â€” | sim (art. 72, I) |
| 2 | PresidÃªncia | Despacho "autorizo o inÃ­cio" | Compras | 3 d.u. | **opcional**: a lei nÃ£o exige; alguns Ã³rgÃ£os usam |
| 3 | Compras (ou o requisitante, com apoio) | ETP ou justificativa de dispensa do ETP, TR, **pesquisa de preÃ§os** | LicitaÃ§Ãµes/Agente | pesquisa: 30 d.u. | sim (art. 72, I e II; art. 23) |
| 4 | LicitaÃ§Ãµes/Agente | **Indica a modalidade/enquadramento** pelo valor apurado | Contabilidade | 3 d.u. | sim (Portaria 089, art. 56) |
| 5 | Contabilidade | Reserva orÃ§amentÃ¡ria (dotaÃ§Ã£o) | Agente | 3 d.u. | sim (art. 72, IV) |
| 6 | Agente de contrataÃ§Ã£o | RelatÃ³rio, minutas (aviso e contrato) | JurÃ­dico | 5 d.u. | sim |
| 7 | JurÃ­dico | Parecer, **ou diligÃªncia que volta para quem fez a peÃ§a** | Controle interno ou PresidÃªncia | 5 d.u. | sim, salvo hipÃ³tese dispensada em ato do jurÃ­dico (art. 53, Â§Â§4Âº e 5Âº) |
| 8 | Controle interno | ManifestaÃ§Ã£o | PresidÃªncia | 3 d.u. | **opcional** (liga/desliga por Ã³rgÃ£o) |
| 9 | PresidÃªncia | AutorizaÃ§Ã£o da contrataÃ§Ã£o direta | Agente | 3 d.u. | sim (art. 72, VIII) |
| 10 | Agente | Conformidade e publicaÃ§Ã£o (aviso por 3 dias Ãºteis na dispensa eletrÃ´nica) | â€” | 5 d.u. | sim (art. 72, parÃ¡grafo Ãºnico; art. 75, Â§3Âº) |

Notas de lei:
- A **ordem** das etapas 2 a 8 pode variar entre Ã³rgÃ£os. O sistema sÃ³ impede o que a lei impede, por exemplo autorizar sem pesquisa e reserva, ou publicar sem autorizaÃ§Ã£o.
- **SegregaÃ§Ã£o de funÃ§Ãµes** (art. 7Âº, Â§1Âº): o sistema **avisa** quando a mesma pessoa estÃ¡ configurada em funÃ§Ãµes que se controlam. Exemplos: quem faz a pesquisa tambÃ©m autoriza; o agente de contrataÃ§Ã£o tambÃ©m Ã© a autoridade.
- Para licitaÃ§Ã£o (pregÃ£o/concorrÃªncia), o modelo Ã© outro, com o parecer antes da autorizaÃ§Ã£o da abertura (art. 53). O mesmo mecanismo serve; muda sÃ³ o modelo.

## 5. O que o administrador configura ("BPMN leve")

Um **modelo de fluxo por tipo** de processo (dispensa, inexigibilidade, licitaÃ§Ã£o). Para cada etapa, o administrador escolhe:
- **quem faz**: setor, papel ou pessoa;
- **prazo** em dias Ãºteis, pelo calendÃ¡rio do Ã³rgÃ£o;
- se a etapa **estÃ¡ ligada** (sÃ³ as opcionais podem ser desligadas);
- se a **IA prepara o rascunho** quando o processo chega;
- **aprovaÃ§Ã£o interna** antes de enviar (ex.: o chefe do setor requisitante aprova o TR). Isso reaproveita o "fluxo de aprovaÃ§Ã£o de documentos", que hoje estÃ¡ escondido;
- **para onde vai** a seguir. Vem sugerido pela ordem, mas quem envia pode escolher outro setor permitido.

**O que o administrador NÃƒO pode fazer:** tirar etapa obrigatÃ³ria por lei ou pÃ´r a autorizaÃ§Ã£o antes da pesquisa e da reserva. Ao salvar, o sistema **valida o modelo** e explica o erro com o artigo. Exemplo: "Falta a autorizaÃ§Ã£o da autoridade (art. 72, VIII)".

**Por que nÃ£o um BPMN livre:** um editor livre (caixas e setas Ã  vontade) permitiria desenhar um fluxo ilegal e Ã© difÃ­cil de manter. Uma sequÃªncia de etapas com devoluÃ§Ã£o e etapas opcionais cobre praticamente todos os casos de CÃ¢mara e prefeitura. A tela **mostra o desenho** do fluxo como diagrama, mas a ediÃ§Ã£o Ã© por lista.

## 6. A tela do processo (o que muda para o usuÃ¡rio)

No topo, sempre:

> **EstÃ¡ com: Contabilidade** (Maria) Â· desde 20/09 Â· prazo 23/09 (faltam 2 dias Ãºteis)
> [Recebi] [Anexar feito fora] [Enviar para: Agente de contrataÃ§Ã£o â–¾]

Abaixo:
- **Linha do tempo**: cada envio, recebimento, devoluÃ§Ã£o e peÃ§a, com data, quem fez e despacho. Ã‰ o que o papel mostra nos autos.
- **O que falta nesta etapa**: a peÃ§a do setor atual, com "Gerar (IA faz o rascunho)" ou "Anexar feito fora".
- **Travas e atenÃ§Ãµes**: o que impede o prÃ³ximo ato, em linguagem simples.

Em **Minhas tarefas**: "Chegou para vocÃª/seu setor", com prazo. O painel da TV passa a mostrar "com quem estÃ¡" pela tramitaÃ§Ã£o.

## 7. O que se aproveita (quase tudo)

| JÃ¡ existe | Como entra |
|---|---|
| TramitaÃ§Ã£o (setores, despacho, receber, devolver, caixa) | vira a espinha: ganha folha nos autos, WhatsApp, prazo em dias Ãºteis e identidade pelo login (hoje vem do navegador â€” corrigir) |
| Tarefas e "Minhas tarefas" | viram a caixa de entrada da tramitaÃ§Ã£o: chegou ao setor, aparece a tarefa |
| Telas das etapas (DFD, ETP, TR, pesquisa, reserva, autorizaÃ§Ã£o, minutas, parecer, controle interno, conformidade) | continuam como "o que o setor faz", sem refazer |
| ConfiguraÃ§Ã£o da fase interna (modo, responsÃ¡veis, prazos Portaria 089, controle interno) | evolui para o modelo de fluxo; o que o Ã³rgÃ£o jÃ¡ configurou Ã© migrado automaticamente |
| Fluxo de aprovaÃ§Ã£o de documentos | vira a "aprovaÃ§Ã£o interna da etapa" |
| Conformidade e travas | continuam; passam tambÃ©m a validar o modelo de fluxo |
| Anexar feito fora / juntada em lote | continua em toda etapa |
| Autos, folhas e versÃµes | continuam; o despacho de envio passa a ser folha |
| WhatsApp e e-mail (padrÃ£o de OS e mediÃ§Ã£o) | cada envio avisa quem recebe; aviso de prazo vencendo e vencido |
| IA (assistente do ETP, editor por seÃ§Ãµes, copiloto, agente de pesquisa) | passa a existir em toda etapa, com rascunho na chegada e humano revisando; a revisÃ£o fica registrada |
| Painel da TV | passa a ler "com quem estÃ¡" da tramitaÃ§Ã£o |

## 8. Consolidar: uma fase interna sÃ³

Estas telas antigas ainda funcionam em paralelo e confundem. **Proposta, para decidir item a item** (nada sai sem OK):

| Tela antiga | Proposta |
|---|---|
| `processos/[id]/editar` (abas dados, classificaÃ§Ã£o, **itens**, cronogramaâ€¦) | manter sÃ³ o que Ã© da fase externa (cronograma, habilitaÃ§Ã£o); dados e itens passam para a tela do processo |
| Editor antigo `fase-interna/processos/[id]/editor` | substituÃ­do pelas telas das etapas; vira redirecionamento |
| Riscos em tela separada | entra dentro do ETP |
| Painel antigo e lista antiga da fase interna; lista antiga `/orgao/licitacoes` | redirecionar para a lista de processos |
| Aba "Documentos" do processo (segunda porta de entrada de peÃ§as) | fica sÃ³ para documentos da fase externa; peÃ§as da fase interna entram pela etapa |
| Aba "TramitaÃ§Ã£o" | some, porque a tramitaÃ§Ã£o vai para o topo da tela do processo |

## 9. Entregas

| # | Entrega | Resultado visÃ­vel |
|---|---|---|
| **T0** | Fechar as correÃ§Ãµes do teste do Cowork (PRs #515, #516 e a de estados) | teste do Cowork sem os erros graves |
| **T1** | **TramitaÃ§Ã£o como espinha** (backend): liga tramitaÃ§Ã£o â†” tarefas; despacho vira folha nos autos; identidade pelo login; sÃ³ o setor de destino recebe; prazo em dias Ãºteis; WhatsApp; lanÃ§amento de movimentaÃ§Ã£o com a data em que ocorreu; testes de isolamento entre Ã³rgÃ£os | o sistema sabe com quem estÃ¡ cada processo, inclusive o feito Ã  mÃ£o |
| **T2** | **Tela do processo**: "EstÃ¡ comâ€¦", linha do tempo, botÃµes Recebi / Anexar / Enviar com despacho sugerido; Minhas tarefas e painel TV lendo a tramitaÃ§Ã£o | o usuÃ¡rio vÃª o processo andando |
| **T3** | **Modelo de fluxo configurÃ¡vel**: tela do administrador (lista + diagrama), validaÃ§Ã£o pela lei, modelo "CÃ¢mara â€” Portaria 089", migraÃ§Ã£o da configuraÃ§Ã£o atual, aprovaÃ§Ã£o interna da etapa | cada Ã³rgÃ£o desenha o seu caminho |
| **T4** | **IA em toda etapa**: rascunho ao chegar (incluindo DFD e despacho), revisÃ£o humana registrada | IA faz, humano revisa |
| **T5** | **ConsolidaÃ§Ã£o** das telas antigas (item a item, com OK) | uma fase interna sÃ³ |
| **T6** | **Teste com vÃ¡rios usuÃ¡rios**: roteiro do Cowork com 6 logins (requisitante, compras, contabilidade, jurÃ­dico, autoridade, agente), um papel cada | ver o processo como cada servidor vÃª |

Cada entrega segue o padrÃ£o das anteriores: PR com testes (incluindo isolamento de dados), CI verde, merge, Railway; VPS sÃ³ com ordem do dono.

## 10. DecisÃµes do dono (26/09/2026, noite)

1. **Modo simples:** **SIM**, a tramitaÃ§Ã£o Ã© registrada automaticamente ao concluir cada etapa, com despacho padrÃ£o gerado.
2. **Despacho de envio nos autos como folha:** **SIM.**
3. **Parecer jurÃ­dico dispensÃ¡vel** (art. 53, Â§5Âº): **SIM, permitido**, exigindo o **nÃºmero do ato** do jurÃ­dico, citado nos autos.
4. **"PortÃµes" â†’ "Trava da lei"** na tela: sem resposta explÃ­cita; adotada a recomendaÃ§Ã£o (renomear).
5. **Aviso de chegada:** sem resposta explÃ­cita; adotada a recomendaÃ§Ã£o (pessoa â†’ sÃ³ ela; setor â†’ todos do setor; chefe do setor opcional).
6. **Telas antigas** (seÃ§Ã£o 8): continuam precisando de OK item a item. **Nada Ã© removido** nesta rodada.

**Pedidos novos do dono, na mesma noite:**
- **Nada de regras "hardcoded".** Quais etapas existem, as dependÃªncias entre elas, quem faz, os prazos, o que Ã© opcional, os requisitos mÃ­nimos da lei e quais regras travam cada ato ficam em **dados** (tabelas com modelo inicial carregado automaticamente). NÃ£o ficam em constantes no cÃ³digo. O catÃ¡logo de verificaÃ§Ãµes (o "como verificar") continua em cÃ³digo; **quais** se aplicam e **com que severidade** vem dos dados.
- **VisÃ£o da fase interna** igual Ã  visÃ£o do processo inteiro: cada fase aparece com a sua situaÃ§Ã£o.
  - Cada fase pode **avanÃ§ar** ou **voltar**.
  - Uma fase que **depende** de outra **nÃ£o inicia** antes de a outra terminar.
  - Fases **independentes podem comeÃ§ar em paralelo**.
- **AprovaÃ§Ã£o de inÃ­cio do processo de compra:** por enquanto Ã© **sÃ³ a aprovaÃ§Ã£o da demanda**, feita pela pessoa designada para aprovar. As fases seguintes sÃ³ abrem depois dela.

## 11. ExecuÃ§Ã£o (a partir de 26/09/2026, noite)

Agentes trabalhando como na disputa: PR com testes, CI, merge, Railway.

| Rodada | Frente | Escopo |
|---|---|---|
| 1 | **F1: Modelo de fluxo em dados** | tabelas do modelo de fluxo (etapas, dependÃªncias, responsÃ¡veis, prazos, opcionais, requisitos da lei, travas por ato); modelo "CÃ¢mara â€” Portaria 089" semeado; migraÃ§Ã£o da configuraÃ§Ã£o atual; `etapasDaFaseInterna` passa a ler o modelo; aprovaÃ§Ã£o da demanda como inÃ­cio; parecer dispensÃ¡vel com nÂº do ato; validaÃ§Ã£o do modelo pela lei; tela do administrador (lista + diagrama) |
| 1 | **F2: TramitaÃ§Ã£o como espinha (backend)** | despacho vira folha nos autos; identidade pelo login; sÃ³ o setor de destino recebe; prazo em dias Ãºteis; WhatsApp; lanÃ§amento com data em que ocorreu; API "com quem estÃ¡" + linha do tempo; serviÃ§o interno de envio para uso da F3 |
| 2 | **F3: IntegraÃ§Ã£o + visÃ£o** | chegada ao setor gera a tarefa; tramitaÃ§Ã£o automÃ¡tica no modo simples; painel TV lÃª a tramitaÃ§Ã£o; **visÃ£o da fase interna** (fases, dependÃªncias, avanÃ§ar/voltar); topo "EstÃ¡ comâ€¦" na tela do processo; "Trava da lei" na tela |
| 3 | **F4: Roteiro Cowork com vÃ¡rios usuÃ¡rios** e **IA em toda etapa** (T4) | conforme seÃ§Ãµes 6 e 9 |

## 12. F1 â€” Modelo de fluxo em dados (entregue, 27/09/2026)

Branch `claude/fluxo-modelo-dados`. CÃ³digo em `backend/src/fase-interna/fluxo/`; tela em `/orgao/configuracoes/fluxo`.

**O que saiu das constantes e foi para tabelas** (semeadas no boot, idempotente):

| Antes (cÃ³digo) | Agora (dados) | Quem edita |
|---|---|---|
| `DEPENDENCIAS_DIRETA`, `DEPENDENCIAS_RITO`, `DEFINICAO_PASSO` (papel, prazo 089, portÃ£o), ordem das etapas, `TELA_DO_PASSO` | `modelos_fluxo_fase_interna` + `modelos_fluxo_etapas` â€” um modelo por Ã³rgÃ£o e tipo (DISPENSA, INEXIGIBILIDADE, LICITACAO); `orgao_id` nulo = modelo do sistema "CÃ¢mara â€” Portaria 089" | Ã³rgÃ£o (o seu); admin da plataforma (o do sistema) |
| responsÃ¡veis, prazos e controle interno de `configuracoes_fase_interna` | etapas do modelo do Ã³rgÃ£o (o PUT antigo continua aceito e grava no modelo) | administrador do Ã³rgÃ£o |
| â€” (novo) requisitos mÃ­nimos da lei | `requisitos_legais_fluxo` (etapa obrigatÃ³ria, dependÃªncia mÃ­nima, segregaÃ§Ã£o) | sÃ³ o admin da plataforma |
| `regrasDoPortao` (A, B, C) | `travas_ato_fluxo`: ato â†’ regra + severidade aplicada no ato | sÃ³ o admin da plataforma |
| â€” (novo) estado do fluxo no processo | `fluxos_processo_fase_interna`: snapshot do caminho + versÃ£o, aprovaÃ§Ã£o da demanda, reabertas, a revisar, registros | aÃ§Ãµes do processo |

Continua em cÃ³digo sÃ³ o **catÃ¡logo** (o que o sistema sabe fazer: tela de cada etapa, tipos de peÃ§a, como conclui) e o "como verificar" das regras de conformidade.

**DecisÃµes:**
- **Snapshot do caminho, operacional vivo.** O processo guarda o retrato do modelo quando nasce (etapas, dependÃªncias, obrigatÃ³rias, peÃ§as, exigÃªncia de aprovaÃ§Ã£o, dispensa por ato) e a versÃ£o. Editar o modelo nÃ£o muda o caminho de processo em andamento. Quem faz, prazo, IA, aprovaÃ§Ã£o interna e o liga/desliga das opcionais seguem o modelo vigente â€” Ã© o contrato da configuraÃ§Ã£o desde a Entrega 2 (reatribuir tarefas, ligar/desligar o controle interno) e nÃ£o muda o caminho legal. Opcional ligada depois sÃ³ entra no processo se nenhuma etapa que depende dela comeÃ§ou.
- **AprovaÃ§Ã£o da demanda** (pedido do dono): o modelo define quem aprova (padrÃ£o: "pode aprovar demandas" e o login do Ã³rgÃ£o). Conta como aprovada, sem clique: processo nascido de demanda aprovada no mÃ³dulo de demandas; DFD juntada feita fora (o modelo pode desligar isso); DFD feita, aprovada (fluxo de aprovaÃ§Ã£o de documentos) ou assinada por quem aprova; no **modo simples** (decisÃ£o 1: uma pessoa conduz tudo), o agente do processo. Processos anteriores Ã  F1 = **legado**, aprovados (nada trava).
- **Fluxo de aprovaÃ§Ã£o de documentos reaproveitado** como "aprovaÃ§Ã£o interna da etapa": com a opÃ§Ã£o ligada, a peÃ§a feita no sistema sÃ³ conta depois de aprovada no fluxo do Ã³rgÃ£o (ou assinada) â€” a mesma regra que a instruÃ§Ã£o jÃ¡ aplicava aos tipos com fluxo configurado.
- **Voltar/avanÃ§ar:** reabrir etapa concluÃ­da (motivo obrigatÃ³rio; sÃ³ quem conduz o processo) deixa as dependentes concluÃ­das "a revisar", sem apagar peÃ§a; a marca sai sozinha quando a peÃ§a Ã© alterada, ou pelo "avanÃ§ar" (confirmar a revisÃ£o). A conformidade reflete: regra **FLUXO-01** (bloqueio) segura a publicaÃ§Ã£o enquanto houver etapa reaberta ou a revisar. Reabrir a demanda desfaz a aprovaÃ§Ã£o.
- **Parecer dispensÃ¡vel** (art. 53, Â§5Âº): sÃ³ se o modelo permitir (etapa "dispensÃ¡vel por ato"; recusado na licitaÃ§Ã£o) e com nÃºmero e data do ato; vira o "nÃ£o se aplica" do parecer com a justificativa citando o ato â€” vai para o termo de justificativas dos autos e satisfaz a A72-III.
- **Etapas novas opcionais** (desligadas por padrÃ£o): "autorizaÃ§Ã£o de inÃ­cio" e "indicaÃ§Ã£o da modalidade" concluem por **despacho registrado** no processo.
- **SÃ³ a sincronizaÃ§Ã£o grava o fluxo do processo.** A sincronizaÃ§Ã£o roda depois do commit. PortÃµes, instruÃ§Ã£o e tarefas do sistema sÃ³ leem, porque rodam dentro da transaÃ§Ã£o do ato: gravar ali, por outra conexÃ£o, travaria na linha da licitaÃ§Ã£o.
- **API para a F3:** descrita na PR. Consumida pela visÃ£o da fase interna (voltar e avanÃ§ar, desenho) e pela integraÃ§Ã£o tarefas â†” tramitaÃ§Ã£o.

## 13. F4a â€” IA em toda etapa (T4, 27/09/2026)

Branch `claude/ia-rascunho-etapas`. CÃ³digo em `backend/src/fase-interna/ia-rascunho/`; faixa comum `RascunhoIaFaixa` nas telas das etapas.

**PrincÃ­pio do dono:** "sempre com IA para fazer e humano revisar".

- **Rascunho nÃ£o Ã© peÃ§a.** Fica em `rascunhos_ia_fase_interna` (origem IA, modelo de IA, data, quem disparou) e nunca conta como peÃ§a pronta (regra da #517).
- **Ao chegar:** com `ia_rascunho` ligado na etapa do modelo, a etapa disponÃ­vel (ou em andamento) ganha o rascunho em segundo plano, depois da sincronizaÃ§Ã£o. Roda fora da fila do processo e de qualquer transaÃ§Ã£o, com limite de concorrÃªncia. Ã‰ idempotente: um por etapa e peÃ§a, e de novo sÃ³ se a etapa for reaberta. Se a IA falhar, fica registrado e a tela oferece "Gerar com IA". Sem chave de IA ou com `FASE_INTERNA_IA_RASCUNHO=false`, nada Ã© pedido.
- **PeÃ§as cobertas:**
  - DFD: a necessidade, com justificativa e quantidades a partir dos itens;
  - ETP e TR: as seÃ§Ãµes do modelo, menos as que o sistema preenche com dados do processo;
  - despacho de autorizaÃ§Ã£o: art. 72, VIII e o fundamento;
  - minuta de parecer: relatÃ³rio, fundamentaÃ§Ã£o e conclusÃ£o sugerida;
  - manifestaÃ§Ã£o do controle interno;
  - despacho das etapas de registro e ajuste do despacho de envio.
- **RevisÃ£o:**
  - "Aceitar como base" preenche sÃ³ as seÃ§Ãµes vazias. Texto escrito por uma pessoa nunca Ã© sobrescrito.
  - No despacho da autoridade, o aceite gera o despacho com o texto revisado. Ele sÃ³ vale assinado.
  - No parecer, sÃ³ quem tem o papel JurÃ­dico aceita, e a conclusÃ£o nunca Ã© preenchida.
  - Ao emitir a peÃ§a feita a partir do rascunho, fica registrado quem revisou (`IA_REVISADA_POR`, usuÃ¡rio do login). O registro vai para o histÃ³rico e, de forma discreta, para `_ia_rascunho` da peÃ§a. NÃ£o entra no texto oficial nem no PDF.
- **Privacidade:** o contexto enviado Ã  IA Ã© sÃ³ do processo do Ã³rgÃ£o do login. NÃ£o inclui texto de pesquisa de preÃ§os nem de relatÃ³rio com fornecedor. CPF, CNPJ, e-mail e telefone saem mascarados. No orÃ§amento sigiloso (art. 24), nenhum valor Ã© enviado.

## 14. Demanda â†’ DFD consolidado â†’ processo (27/09/2026)

Branch `claude/demanda-dfd-consolidado`. CÃ³digo em `backend/src/demandas/dfd/` e `backend/src/fase-interna/fluxo/planejamento-fluxo*`; telas `/orgao/demandas/consolidacao` e `/orgao/demandas/dfd/[id]`.

- **Demanda** = pedido de qualquer setor (nÃ£o abre processo). **DFD** = documento da **unidade de planejamento**, que junta pedidos parecidos (art. 12, VII â€” evita o fracionamento, art. 75, Â§1Âº) e abre **um** processo.
- **Nova entidade** `dfds_consolidados` (+ ligaÃ§Ã£o `dfds_consolidados_demandas`, N demandas â†’ 1 DFD â†’ 1 processo) em vez de evoluir `ContratacaoFutura`: a contrataÃ§Ã£o futura era um agrupamento do PCA sem itens, sem aprovaÃ§Ã£o e ligado por uma coluna na demanda; as existentes ficam legÃ­veis na tela do planejamento. `licitacoes.demanda_id` continua para o processo de 1 demanda (compatibilidade); processos antigos de 1 demanda ganham o vÃ­nculo pela migraÃ§Ã£o de boot.
- **Itens**: soma pelo cÃ³digo do item do catÃ¡logo; sem cÃ³digo, por classe + descriÃ§Ã£o (mesma unidade). Cada item guarda a origem (demanda, setor, quantidade) e o ajuste do planejamento (a soma original fica).
- **Planejamento no modelo de fluxo** (dados â€” `planejamento_fluxo_orgao`, padrÃ£o do sistema semeado no boot): quem aprova a demanda (padrÃ£o: "pode aprovar demandas"), quem monta o DFD e abre o processo (padrÃ£o: papel **PLANEJAMENTO** + administrador do Ã³rgÃ£o) e a **2Âª aprovaÃ§Ã£o do DFD** (desligada por padrÃ£o).
- **AprovaÃ§Ã£o**: aprovador sempre do token. A aprovaÃ§Ã£o da demanda do processo conta sozinha quando **todas** as demandas de origem estÃ£o aprovadas (e o DFD, com a 2Âª aprovaÃ§Ã£o ligada). A Central de AprovaÃ§Ãµes junta demandas, DFDs e a "aprovaÃ§Ã£o da demanda" dos processos; a tarefa "Aprovar a demanda" leva para lÃ¡.
- **Travas**: demanda num DFD nÃ£o Ã© editada, nÃ£o entra em outro DFD e nÃ£o abre processo sozinha. "Iniciar contrataÃ§Ã£o" de uma demanda = DFD de 1 demanda, sÃ³ para a unidade de planejamento.
- **Alerta de parecidos**: funÃ§Ã£o pura (`consolidacao-dfd.ts â€º parecidos`) â€” o DFD ainda nÃ£o Ã© processo, entÃ£o nÃ£o cabe no motor de conformidade (que roda sobre a licitaÃ§Ã£o). AtenÃ§Ã£o, nunca bloqueio; vai para o histÃ³rico do processo na abertura.

## 15. Fluxo de aprovaÃ§Ã£o das peÃ§as nas telas das etapas (27/09/2026)

Branch `claude/fluxo-aprovacao-pecas`. CÃ³digo em `backend/src/fase-interna/aprovacao-pecas*.ts` e `aprovacao.service.ts`; telas `/orgao/configuracoes/fluxos-aprovacao`, Central (`/orgao/aprovacoes?tab=documentos`) e o quadro da peÃ§a nas etapas (`CaminhosDaPeca`).

- **Por que "nÃ£o dava certo":** o fluxo sÃ³ valia para etapas com "aprovaÃ§Ã£o interna" ligada (desligada em todas), o envio ao fluxo sÃ³ existia no editor antigo e a tela nÃ£o explicava nada.
- **Quando vale:** sÃ³ nas etapas com "aprovaÃ§Ã£o interna" ligada no modelo de fluxo. Fluxo cadastrado sem ela **nÃ£o trava nada** (antes, qualquer fluxo cadastrado fazia a peÃ§a esperar uma aprovaÃ§Ã£o que as telas novas nÃ£o pediam).
- **Envio automÃ¡tico:** peÃ§a **emitida** (gerada no sistema) ou **anexada pela etapa** vai sozinha para o fluxo do tipo â†’ genÃ©rico â†’ aprovaÃ§Ã£o Ãºnica. Roda fora de qualquer transaÃ§Ã£o de ato (na chamada da tela e na rotina "antes de sincronizar" da fila do processo), uma avaliaÃ§Ã£o por processo de cada vez. A juntada em lote da fase feita fora **nÃ£o** vai (as conferÃªncias jÃ¡ constam de fora). Reprovada: sÃ³ volta depois de corrigida e gerada de novo (nova emissÃ£o ou nova versÃ£o).
- **Sem fluxo cadastrado** (regra de `resolverFluxo`, mantida): aprovaÃ§Ã£o Ãºnica, decidida por **quem conduz o processo** (login do Ã³rgÃ£o, ADMIN do Ã³rgÃ£o, agente do processo). A etapa mostra o aviso "aprovaÃ§Ã£o interna ligada, mas sem fluxo cadastrado".
- **Quem decide:** sempre o usuÃ¡rio do token. Pessoa indicada â†’ sÃ³ ela; setor indicado â†’ quem Ã© do setor; sem responsÃ¡vel â†’ quem conduz. Os demais: 403; outro Ã³rgÃ£o: 404. A Ãºltima etapa com assinatura aprova **assinando** a peÃ§a (portal de assinaturas; o prÃ³prio aprovador). Assinatura sÃ³ na Ãºltima etapa.
- **Modelos prontos em dados** (`modelos_fluxo_aprovacao`, semente no boot, sÃ³ o admin da plataforma altera; a semente nÃ£o sobrescreve o que ele editou): "TR conferido pelo chefe" (TR), "Pesquisa conferida" (PP, MCP), "Minutas revisadas" (ME, MC, RAG), "DFD assinado pela Diretoria" (DFD). "Usar este modelo" abre o editor preenchido; o setor/pessoa de cada etapa Ã© obrigatÃ³rio.
- **Um fluxo, vÃ¡rias peÃ§as** (`tipos_documento`); dois fluxos para a mesma peÃ§a â†’ 409.
- **Avisos:** aprovador (sino, e-mail e WhatsApp com link para a Central); reprovaÃ§Ã£o â†’ quem fez a peÃ§a, com o motivo e o link da etapa.
- **Cache do modelo de fluxo:** a leitura feita durante a gravaÃ§Ã£o do modelo nÃ£o fica mais no cache (o modelo antigo valia por atÃ© 3 s depois de salvo).

## 16. Autos em ordem cronolÃ³gica de juntada (27/09/2026)

Branch `claude/autos-ordem-cronologica`. DecisÃ£o do dono depois da homologaÃ§Ã£o com vÃ¡rios usuÃ¡rios (relatÃ³rio, "9 Â· Autos" e E4): os autos seguem a **ordem de juntada**, como no papel (Lei nÂº 9.784/1999, art. 22, Â§4Âº â€” folhas numeradas em sequÃªncia; nada sai sem termo de desentranhamento).

- **Livro de juntadas** (`juntadas_autos`): cada juntada com a faixa de folhas atribuÃ­da **na juntada** (definitiva â€” a tela e o PDF mostram a mesma), o arquivo tal como juntado, a data e quem juntou. A montagem dos autos **nÃ£o grava nada** (acabou a reescrita das folhas da PR #518) e segue o livro na ordem das folhas.
- **Quando se junta:** peÃ§a anexada, via assinada, despacho de tramitaÃ§Ã£o e despacho de etapa â€” no prÃ³prio ato; peÃ§a feita no sistema â€” quando fica pronta (rotina da fila do processo, depois do envio ao fluxo de aprovaÃ§Ã£o e antes do envio automÃ¡tico da tramitaÃ§Ã£o; o PDF Ã© copiado); aviso publicado, ata, documentos da fase externa e termo de justificativas â€” na sincronizaÃ§Ã£o do processo publicado; registro das publicaÃ§Ãµes (muda a cada envio ao PNCP) â€” quando os autos sÃ£o pedidos.
- **VersÃ£o substituÃ­da continua nos autos**, na folha original, com o carimbo "SubstituÃ­da pela versÃ£o N â€” fl. X"; a nova traz "Substitui a fl. Y". O Ã­ndice lista na ordem das folhas, com a data de juntada de cada documento, e marca as substituÃ­das.
- **Capa, termo de abertura e Ã­ndice sem folha** (as folhas das peÃ§as comeÃ§am na fl. 1 desde a primeira juntada). O **despacho nÂº 1** (posse inicial, sem folha â€” F3a) Ã© o texto de autuaÃ§Ã£o do termo de abertura ("Autue-se e encaminhe-seâ€¦", data/hora e quem); a linha do tempo mostra "Nos autos: Termo de abertura (autuaÃ§Ã£o)". **Termo de encerramento** tambÃ©m sem folha, com as folhas de 000001 a N.
- **Buraco na numeraÃ§Ã£o** (juntada cancelada, dado antigo): a folha sai com a certidÃ£o "folha sem documento" e o Ã­ndice explica â€” nunca se renumera.
- **Dados existentes (migraÃ§Ã£o de boot, uma vez por processo, `autos_processo`):**
  - processo **ainda na fase interna**: folhas recalculadas uma vez pela ordem cronolÃ³gica de juntada (anexo â†’ quando foi anexado; peÃ§a do sistema â†’ a emissÃ£o; assinada â†’ a Ãºltima assinatura; despachos â†’ o registro), inclusive as versÃµes substituÃ­das; o antes/depois fica em `autos_processo.detalhe` e no histÃ³rico do processo (`AUTOS_RENUMERADOS`);
  - processo **jÃ¡ publicado** com autos da regra anterior: **nÃ£o muda** â€” regime `LOGICO_LEGADO` (a montagem antiga, na ordem lÃ³gica), com o motivo registrado; os autos que jÃ¡ saÃ­ram nÃ£o sÃ£o refeitos;
  - publicado sem autos anteriores, ou fase interna sem juntada: cronolÃ³gico, nada a mudar.
- **Outros ajustes:** "A definir"/UF no despacho de tramitaÃ§Ã£o e nos termos tratado como ausente (sÃ³ a data); a situaÃ§Ã£o dos autos deixa de sair "DESATUALIZADO" logo depois de gerar (a impressÃ£o Ã© calculada depois das juntadas pendentes e a montagem nÃ£o mexe nas peÃ§as â€” inclusive no regime legado, que materializa o PDF sem gravar a peÃ§a).
- Desligar: `AUTOS_JUNTADA_AUTOMATICA=false` (juntada das peÃ§as do sistema e dos documentos externos) e `AUTOS_CRONOLOGICOS_NO_BOOT=false` (migraÃ§Ã£o).
## 16. HomologaÃ§Ã£o multiusuÃ¡rio â€” frente A: isolamento das peÃ§as, travas da publicaÃ§Ã£o e LIM-01 (27/09/2026)

Branch `claude/homolog-multi-isolamento-pecas`. RelatÃ³rio: `docs/fase interna/relatorio-homologacao-multiusuario-portaldcp.md` (E2, E3, E6 e as confusÃµes "Aprovar a demanda", "Mais aÃ§Ãµes" e autoridade).

- **Isolamento das peÃ§as (E2).** Ponto Ãºnico `PermissaoEtapaService` (regra pura `fluxo/permissao-etapa.ts`), chamado pelo `TrabalhoNaEtapaGuard` em todo endpoint de escrita das telas da fase interna (`@TrabalhoNaEtapa`) e pela aba Documentos (tipos que viram peÃ§a). SÃ³ escreve numa peÃ§a quem **responde pela etapa** no modelo (pessoa, papel, setor e o chefe dele; o responsÃ¡vel calculado; quem recebeu a tarefa) **e** com a etapa **podendo comeÃ§ar** (demanda aprovada â€” sÃ³ o DFD anda antes â€” e dependÃªncias concluÃ­das). No modo **POR_SETOR**, com a opÃ§Ã£o do modelo **"exigir a posse para trabalhar nas peÃ§as"** (`modelos_fluxo_fase_interna.exigir_posse_pecas`, ligada por padrÃ£o; no modo simples nÃ£o se aplica), tambÃ©m Ã© preciso **estar com o processo** (tramitaÃ§Ã£o vigente: setor, pessoa ou chefe do setor). DiligÃªncia aberta do parecer sobre a peÃ§a devolve a peÃ§a a quem responde por ela sem exigir a posse. Administrador e login do Ã³rgÃ£o passam por cima da responsabilidade e da posse (nunca da ordem), com registro `ACAO_FORA_DA_RESPONSABILIDADE` no histÃ³rico. 403 com a explicaÃ§Ã£o ("Esta etapa Ã© de â€¦ e o processo estÃ¡ com â€¦", "Aguardando a aprovaÃ§Ã£o da demandaâ€¦"). As aÃ§Ãµes do processo inteiro (assistente de criaÃ§Ã£o, juntada em lote, copiloto) ficam com quem conduz. A tela recebe `pode_trabalhar`/`motivo` por etapa (`GET /etapas` â†’ `permissoes_trabalho`) e deixa sÃ³ leitura.
- **Tarefas.** Etapa que ainda nÃ£o pode comeÃ§ar nÃ£o ganha tarefa (nem a de achado da conformidade â€” o LIM-01 do Carlos).
- **PublicaÃ§Ã£o (E3).** Nova trava do PUBLICAR na contrataÃ§Ã£o direta: etapas obrigatÃ³rias do modelo (e as de que a publicaÃ§Ã£o depende) concluÃ­das â€” linha "Etapas do fluxo" na conferÃªncia de prÃ©-publicaÃ§Ã£o.
- **Ordem da contrataÃ§Ã£o direta** (dispensa e inexigibilidade â€” decisÃ£o do dono de 27/09): â€¦ reserva â†’ minutas â†’ parecer â†’ controle interno â†’ autorizaÃ§Ã£o â†’ publicaÃ§Ã£o (art. 53, Â§4Âº; art. 72, VI a VIII; Portaria 089/2024). Semente atualizada; a migraÃ§Ã£o de boot muda sÃ³ o modelo do sistema e os modelos de Ã³rgÃ£o criados pela migraÃ§Ã£o automÃ¡tica e nunca editados; processos em andamento mantÃªm o snapshot. A validaÃ§Ã£o avisa (sem bloquear) quando a autorizaÃ§Ã£o vem antes do parecer.
- **LIM-01 (E6).** Item sem cÃ³digo CATMAT/CATSER (nem classe do catÃ¡logo prÃ³prio) nÃ£o entra num ramo coletivo: soma sÃ³ no prÃ³prio processo; a nova LIM-03 (atenÃ§Ã£o) pede a classificaÃ§Ã£o.
- **Aprovar a demanda** desabilitado antes do DFD, com o motivo. A Central continua **sem listar** o processo antes do DFD (Ã© a fila do que pode ser decidido agora; a tela do processo diz o que falta).
- **Mais aÃ§Ãµes.** Excluir: sÃ³ quem conduz; revogar/anular (e a intenÃ§Ã£o): quem conduz ou a autoridade (art. 71). **Autoridade do processo**: o signatÃ¡rio da autorizaÃ§Ã£o da configuraÃ§Ã£o, antes do cadastro do Ã³rgÃ£o.

---

## Anexo A â€” Levantamento tÃ©cnico (26/09/2026)

- **TramitaÃ§Ã£o:** `backend/src/fase-interna/tramitacao.service.ts` e `entities/tramitacao-processo.entity.ts` (tabela `tramitacoes_processo`: setor e usuÃ¡rio de origem e destino, `despacho`, `prazo_dias`/`data_prazo` corridos, status PENDENTE/RECEBIDA/DEVOLVIDA/CONCLUIDA). Endpoints em `processo-eletronico.controller.ts` (`:id/tramitar`, `tramitacoes`, `caixa-entrada`, `receber`, `devolver`).
  - Lacunas: nÃ£o gera peÃ§a/folha; sÃ³ notifica quando hÃ¡ `para_usuario_id`, o que o front nunca envia, e sÃ³ com aviso interno; `receber` nÃ£o confere o setor de quem recebe; usuÃ¡rio vem do `localStorage`.
  - Front: sÃ³ `TramitacaoProcessoCard.tsx` na aba "tramitacao".
- **Setor:** `orgaos/entities/setor.entity.ts` (cÃ³digo e nome; sem chefe). UsuÃ¡rio tem um `setor_id` e `papeis_fase_interna`.
- **Tarefas:** `fase-interna/tarefas/*`.
  - Entidade `tarefas`: responsÃ¡vel por usuÃ¡rio, papel e/ou setor; prazo em dias Ãºteis; `chave` idempotente.
  - SincronizaÃ§Ã£o por `etapasDaFaseInterna` com gatilho apÃ³s commit.
  - Notifica por e-mail e WhatsApp (`whatsapp_url`).
  - ConfiguraÃ§Ã£o em `configuracoes_fase_interna`: modo SIMPLES/POR_SETOR, `responsaveis`, `prazos` (Portaria 089), controle interno, signatÃ¡rios.
- **Fluxo de aprovaÃ§Ã£o de documentos:** `fase-interna/entities/fluxo-aprovacao.entity.ts` e `aprovacao.service.ts` (etapas ordenadas por Ã³rgÃ£o/tipo de documento, com setor/usuÃ¡rio e assinatura). Telas: `/orgao/configuracoes/fluxos-aprovacao`, `CaixaDocumentosAprovacao`, `AprovacaoEtapasPanel` (sÃ³ no editor antigo).
- **Travas:** `fase-interna/conformidade/portoes.ts` e `regras.ts`. A = CONCLUIR_PESQUISA (LIM-01); B = AUTORIZAR (A72-I, II, IV); C = PUBLICAR (ENQ-01, VINC-01, MARCA-01, ASS-01; A72-VIII e PRAZO-01 garantidos no ato).
- **WhatsApp:** `NotificacoesService.criar/criarParaMultiplos` com `enviar_email: true`, `usuario_telefone` e `metadata.whatsapp_url`. Modelo: `notificarMedicaoAtestada`. WhatsApp configurado por Ã³rgÃ£o.
- **IA:** `ia/ia.service.ts` (OpenRouter). Assistente do ETP, `DocumentoSeccionado` + `PainelIA`, copiloto `preparar-automatico`, agente de pesquisa. Sem IA hoje: DFD, reserva, autorizaÃ§Ã£o, parecer, controle interno.
- **Anexar feito fora:** `POST fase-interna/:id/documentos/:tipo/anexo` â†’ `JuntadaPecasService` â†’ `anexarPeca` (versÃ£o, folhas, SHA-256). Lote em `fase-interna/externa/*`. O anexo avulso nÃ£o grava log e nÃ£o grava `criado_por_nome`.
- **Painel TV:** `painel-tv/painel-tv.service.ts` lÃª "com quem estÃ¡" das tarefas abertas; nÃ£o usa a tramitaÃ§Ã£o.
