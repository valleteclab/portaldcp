# Roteiro de homologação — Fluxo da fase interna com vários usuários

**Para:** o Claude (Cowork) que vai testar o sistema pelo navegador.
**Objetivo:** percorrer uma **dispensa eletrônica** do início ao fim com **6 usuários, um papel cada** — como ela é usada de verdade, de mesa em mesa — começando pelos **pedidos dos setores (demandas)**, a **aprovação na Central de Aprovações** e o **DFD consolidado** montado pela unidade de planejamento, e conferindo a tramitação ("com quem está"), a visão da fase interna (avançar/voltar, etapas em paralelo), o isolamento entre setores e os autos em PDF com os despachos.

Este roteiro **complementa** `docs/testes/ROTEIRO-COWORK-FASE-INTERNA.md` (um usuário só, com todos os papéis, focado nas peças). Aqui o foco é a **tramitação entre pessoas**. Rode os dois; o que um não cobre, o outro cobre.

---

## 0. Regras (leia antes de começar)

1. **Ambiente:** use só **https://www.portaldcp.com.br** (homologação). Não acesse outro endereço do Portal DCP.
2. **Dados:** use só o **órgão de teste** e os usuários que o dono informar no chat. **Não altere nada de outro órgão**, não exclua processos que você não criou, não mexa em contratos, medições ou almoxarifado.
3. **6 logins, 6 janelas.** O dono vai passar no chat **6 pares de login/senha**, um por papel: **Requisitante, Compras (pesquisa), Contabilidade, Jurídico, Autoridade/Presidência e Agente de contratação**. Abra **um perfil ou uma janela anônima do navegador para cada um** e não misture: cada usuário só faz o que o papel dele faria de verdade. Se um passo pedir a ação de outro papel, troque de janela — não faça pelo usuário errado (isso é justamente o que este roteiro testa).
4. **Senhas:** o dono passa no chat. Não escreva senhas no relatório.
5. **Não corrija nada no código nem no banco.** Seu papel é testar e relatar.
6. **Em caso de erro:** tire um print, anote a URL, **qual usuário/janela** estava logado, o que clicou e a mensagem exata, e **continue o roteiro** a partir do próximo passo possível. Não fique repetindo o mesmo clique.
7. **Não invente resultado.** Se não conseguiu verificar algo, escreva "não verificado" e o motivo.
8. Nomeie tudo o que criar com o prefixo **"TESTE COWORK MULTI"** e a data, para ser fácil de achar e limpar depois.
9. **Isolamento é parte do teste.** Sempre que o roteiro pedir para um usuário tentar agir fora do que lhe cabe (setor errado, papel errado), o resultado esperado é a **recusa** (403/mensagem clara) — isso é sucesso, não falha.

---

## 1. Preparação (administrador do órgão de teste)

Entre com o **administrador** numa janela à parte (pode ser a mesma do Agente de contratação, se o dono não der um login de admin separado).

### 1.1 Setores (com chefe)

**Configurações › Setores** (aba "Setores"):

1. Crie (ou confirme que já existem) os setores: **Requisitante/Demandante**, **Compras**, **Contabilidade**, **Jurídico**, **Presidência** e **Licitações** (para o agente de contratação, se for um setor à parte — pode usar "Licitações" ou o setor onde o agente está lotado).
2. Em **pelo menos um setor** (ex.: Contabilidade), cadastre um **chefe do setor** (campo de chefe no modal "Novo Setor"/edição — escolha um dos 6 usuários de teste). **Esperado:** o setor salva com o chefe; isso serve para depois conferir que o chefe também é avisado quando o processo chega ao setor.

### 1.2 Usuários com setor e papel

**Configurações › Usuários** (ou onde o admin cadastra/edita usuário): para cada um dos 6 logins que o dono passar, confirme ou ajuste:
- **Setor** de lotação (o do papel dele: Requisitante no setor Requisitante, Compras no setor Compras, etc.);
- **Papel(is) da fase interna** (**Configurações › Fase interna e tarefas**, quadro "Papéis dos usuários"): dê a cada usuário **um só papel principal** para este teste — Requisitante, Compras, Contabilidade, Jurídico, Autoridade e Agente de contratação, um para cada login. **Além disso**, dê ao **Agente de contratação** (Janela 6) também o papel **Planejamento** — ele fará o papel da unidade de planejamento que monta o DFD. **Esperado:** "Salvo às HH:MM" na linha de cada usuário; ao recarregar, os papéis continuam.

### 1.3 Modelo de fluxo — Configurações › Fluxo (`/orgao/configuracoes/fluxo`) — 1ª rodada: **POR_SETOR**

1. Primeiro, em **Configurações › Fase interna e tarefas**, marque o modo **Por setor** e salve. **Esperado:** confirmação de salvo; ao recarregar, o modo continua "Por setor".
2. Em **Configurações › Fluxo**, aba/tipo **Dispensa**:
   - Confira o **desenho** do modelo (colunas por nível de dependência) e o **responsável de cada etapa**: ajuste para que a Demanda/DFD seja do setor Requisitante, ETP/TR/Pesquisa do setor Compras, Reserva da Contabilidade, Minutas/Relatório do Agente de contratação, Parecer do Jurídico e Autorização da Autoridade/Presidência.
   - Confira o bloco de **aprovação da demanda**: defina o aprovador como a pessoa ou o papel da **Autoridade/Presidência** (ou quem tiver "pode aprovar demandas").
   - Clique em **Salvar modelo**. **Esperado:** confirmação (barra de status), sem erro de validação da lei; se o sistema recusar alguma combinação, anote a mensagem (ela deve citar o artigo).
   - Se quiser conferir o modelo pronto da Câmara, o botão **Restaurar modelo padrão** aplica "Câmara — Portaria 089" — não é obrigatório usá-lo, mas é uma forma rápida de já vir com setores e ordem coerentes; ajuste os responsáveis depois para os 6 papéis de teste.

3. Ainda em **Configurações › Fluxo**, no quadro **"Antes do processo: demandas e DFD"** (no alto):
   - **Quem aprova a demanda** = **Papel › Autoridade** (Janela 5);
   - **Quem monta o DFD e abre o processo** = **Papel › Planejamento** (padrão);
   - **2ª aprovação do DFD** = **desligada** (padrão) nesta primeira passada.
   - Clique em **Salvar**. **Esperado:** "Salvo às HH:MM (versão N)".

> Guarde o link `/orgao/configuracoes/fluxo` — a **segunda rodada** deste roteiro (seção 11) repete um percurso curto em modo **Simples**, para comparar.

### 1.4 Orçamento (se ainda não tiver dessa rodada)

Como no roteiro de fase interna: pelo menos uma **LDO 2026** e uma **LOA 2026** cadastradas, e uma **dotação** de 2026 com saldo (**Configurações › Orçamento**). Pule se o órgão de teste já tiver.

---

## 2. Login dos 6 usuários

Abra as 6 janelas/perfis e faça login, uma vez, em cada uma, confirmando o nome de cada usuário no canto do sistema:

| Janela | Usuário | Papel |
|---|---|---|
| 1 | Requisitante | REQUISITANTE |
| 2 | Compras | COMPRAS |
| 3 | Contabilidade | CONTABILIDADE |
| 4 | Jurídico | JURIDICO |
| 5 | Autoridade/Presidência | AUTORIDADE |
| 6 | Agente de contratação (e unidade de planejamento) | AGENTE_CONTRATACAO + PLANEJAMENTO |

**Esperado:** cada janela mostra o nome do usuário correto; **Minhas tarefas** de cada uma está vazia (ou só com tarefas de testes anteriores) antes de começar.

---

## 3. Setores pedem, a Autoridade aprova, o planejamento monta o DFD e abre o processo

**Conceito:** a **demanda** é o pedido de qualquer setor (o que precisa, quanto, por quê, para quando) e **não abre processo**. O **DFD** é feito pela **unidade de planejamento**, que junta os pedidos parecidos num único DFD (art. 12, VII — evita o fracionamento) e abre **um** processo.

### 3.1 Os setores criam as demandas

1. **Janela 1 — Requisitante:** menu **Demandas** › **Nova demanda**: objeto "TESTE COWORK MULTI — licença de software de gestão (12 meses)", unidade requisitante = o setor Requisitante, com **1 item do catálogo** (anote o código do item) e quantidade 3. Clique em **Enviar demanda**.
   - **Esperado:** a tela se chama **"Demanda (pedido do setor)"** (não "DFD"); o breadcrumb diz **"Demanda — [setor]"**; depois de enviar, situação **Enviada**.
2. **Janela 2 — Compras** (aqui fazendo o papel de um segundo setor que pede): **Nova demanda** "TESTE COWORK MULTI — licenças adicionais", com o **mesmo item do catálogo**, quantidade 2. **Enviar demanda**.
3. (Opcional, para o alerta) **Janela 3 — Contabilidade:** uma terceira demanda com item **da mesma classe** (ou o mesmo item), quantidade 1. **Enviar demanda**.

### 3.2 A Autoridade aprova na Central de Aprovações (Janela 5)

1. **Janela 5 — Autoridade:** confira o aviso (sino; e-mail/WhatsApp se configurados) e abra **Central de Aprovações** › aba **"Demandas e DFD"**. **Esperado:** as demandas enviadas aparecem com Aprovar / Rejeitar / Ver demanda.
2. **Rejeite** a demanda da Janela 2 com o motivo "TESTE — informe o prazo de uso". **Janela 2:** abra a demanda. **Esperado:** faixa vermelha com o motivo e o botão **"Voltar para rascunho e corrigir"**. Clique, ajuste a demanda, envie de novo.
3. **Janela 5:** aprove as demandas das Janelas 1, 2 (e 3, se criou). **Esperado:** situação **Aprovada**; em "aprovada por" aparece o **nome de quem está logado** (não dá para escolher outro).
4. **Isolamento:** na **Janela 4 — Jurídico**, abra a Central › "Demandas e DFD". **Esperado:** nada pendente (o Jurídico não aprova demandas).

### 3.3 O planejamento monta o DFD (Janela 6 — Agente com papel Planejamento)

1. Menu **Demandas** › **DFD consolidado**. **Esperado:** as demandas aprovadas e livres aparecem agrupadas por classe.
2. Marque as demandas das Janelas 1 e 2 (a da Janela 3 fica de fora de propósito). **Esperado:** a **prévia** mostra o item **somado** (3 + 2 = 5) e **de onde veio** cada quantidade (Requisitante: 3; Compras: 2); se criou a 3ª demanda, aparece o aviso amarelo **"Atenção: há outro pedido parecido no mesmo exercício"** com o link dela (art. 12, VII; art. 75, §1º) — é aviso, não trava.
3. Clique em **Montar DFD**. **Esperado:** abre o **DFD nº N/2026** "Em elaboração", com objeto, justificativa de cada setor, unidade de planejamento (o setor do usuário), responsável (ele), data pretendida e prioridade já sugeridos. Ajuste a quantidade do item para 4 com a justificativa "TESTE — uma licença reaproveitada" e **Salvar dados e ajustes**.
4. Clique em **PDF do DFD**. **Esperado:** PDF com os itens somados, a origem de cada quantidade ("somado: 5"), as demandas de origem (setor, quem aprovou) e a data no horário de Brasília.
5. **Travas:** na **Janela 1**, abra a sua demanda. **Esperado:** faixa "Esta demanda está no DFD nº N/2026…" e nada editável; o botão "Iniciar contratação" **não aparece**. Na Janela 1, abra **Demandas › DFD consolidado**. **Esperado:** consulta sem os botões de montar ("só a unidade de planejamento…").
6. **Janela 6:** no DFD, **Abrir processo** › Dispensa Eletrônica › fase interna guiada. **Esperado:** o processo abre em `/orgao/processos/[id]` com os **itens do DFD** (quantidade 4); a peça **DFD do processo** já vem preenchida (unidade, responsável, data pretendida, prioridade, PCA) e o quadro "Fluxo da fase interna" mostra a **demanda já aprovada** ("DFD consolidado nº N/2026 (2 demandas aprovadas)"): ETP, TR e Pesquisa liberados. As demandas das Janelas 1 e 2 passam a **Em contratação**.

### 3.4 (Opcional) 2ª aprovação do DFD

1. **Administrador:** Configurações › Fluxo › "Antes do processo": ligue **Exigir a 2ª aprovação do DFD**, aprovador = **Papel › Autoridade**. Salve.
2. **Janela 6:** monte um DFD com a demanda da Janela 3. **Esperado:** "Abrir processo" não aparece; aparece **Enviar para aprovação**. Envie.
3. **Janela 5:** Central › "Demandas e DFD" › bloco **"DFD consolidado (2ª aprovação)"**: **Devolva** com motivo; **Janela 6** ajusta e reenvia; **Janela 5** **Aprova**. **Janela 6:** agora **Abrir processo** aparece.
4. **Administrador:** desligue a 2ª aprovação ao final (padrão).

---

## 4. Aprovação da demanda dentro do processo (processo criado sem demanda)

O processo aberto pelo DFD já nasce com a demanda aprovada. Para ver a aprovação **dentro** do processo, crie um processo pelo assistente **Novo processo** (sem demanda), na Janela 1, e gere o DFD da etapa 1.

1. **Esperado:** bloco amarelo **"Aguardando aprovação da demanda por [Autoridade]"**; ETP, TR e Pesquisa aparecem como **"Aguardando: Demanda"**.
2. **Janela 5 — Autoridade:** em **Minhas tarefas**, a tarefa **"Aprovar a demanda"** leva à **Central de Aprovações** › "Demandas e DFD" › bloco "Aprovação da demanda nos processos". Clique em **Aprovar a demanda** ali.
   - **Esperado:** no processo, a linha verde "Demanda aprovada por [nome] em [data]"; as etapas seguintes liberadas.

**Isolamento:** na Janela 2 (Compras), a Central não mostra essa aprovação e, no processo, o botão **Aprovar a demanda** não aparece.

---

## 5. "Está com…", peças em paralelo, tramitação e Voltar

A tabela abaixo percorre a tramitação. Em cada linha, confira sempre no topo do processo o bloco **"Está com: [setor/pessoa] · desde … · prazo … (faltam N dias úteis)"**.

| # | Janela / usuário | Ação | O que conferir |
|---|---|---|---|
| 5.1 | 1 — Requisitante | Depois do DFD pronto e da demanda aprovada, clique em **Enviar para: [Compras] ▾** no topo. Confira o **despacho sugerido** (editável) e o **prazo em dias úteis**. Envie. | Despacho enviado; **Linha do tempo** mostra o envio; a peça vira **folha nos autos** ("Ver despacho (fl. N)"). Topo passa a "Está com: Compras". |
| 5.2 | 2 — Compras | Confirme o aviso de chegada (tarefa em **Minhas tarefas** e, se o WhatsApp estiver configurado no órgão de teste, a mensagem com o link). Clique em **Recebi**. | Status muda de "Aguardando o recebimento" para recebido, com "Recebido em … por Compras". |
| 5.3 | 2 — Compras | Abra **ETP** e **TR** — confira que **as duas etapas aparecem lado a lado** no quadro "Fluxo da fase interna" (mesma coluna/nível, "lado a lado"), ou seja, **independentes, podem andar em paralelo**. Conclua o ETP (ou "Não se aplica" na dispensa) e gere o TR. | As duas etapas ficam disponíveis ao mesmo tempo, sem uma esperar a outra; a **Pesquisa** deve mostrar "Aguardando: …" até o TR estar pronto (se o modelo assim depender) ou já disponível junto, conforme o desenho configurado — anote o que o desenho realmente mostrou. |
| 5.4 | 2 — Compras | Faça a **Pesquisa de preços** (parâmetros do art. 23, 3 cotações, método, **Emitir mapa e certidão**). | Peça pronta; consumo do limite da dispensa aparece. |
| 5.5 | 2 — Compras | No topo, **Enviar para: Contabilidade**, com despacho e prazo. | Envio registrado; folha nos autos; "Está com: Contabilidade". |
| 5.6 | 3 — Contabilidade | **Recebi**. Faça a **Reserva orçamentária** (dotação, emitir). | Peça pronta; tarefa concluída. |
| 5.7 | 3 — Contabilidade | **Enviar para: Agente de contratação**, com despacho e prazo. | Igual aos anteriores. |
| 5.8 | 6 — Agente | **Recebi**. Gere o **relatório do agente** e as **minutas** (aviso e contrato). | Peças prontas, citando o número deste processo. |
| 5.9 | 6 — Agente | **Enviar para: Jurídico**, com despacho. | Igual aos anteriores. |

**Teste do "Voltar" (uma etapa):**

1. Ainda antes de enviar ao Jurídico (ou logo depois, se preferir testar com mais coisa concluída), na Janela 2 (Compras) ou em quem tiver o botão disponível, abra o quadro **"Fluxo da fase interna"** e clique em **Voltar** no **TR** (etapa já concluída).
   - **Esperado:** confirmação obrigatória com **motivo**, avisando quais etapas dependentes ficam **"a revisar"** (ex.: Reserva, Minutas — se dependerem do TR) e que a aprovação da demanda **não** é desfeita (só reabrir a própria demanda desfaz).
2. Confirme com um motivo de teste. **Esperado:** o TR volta para "reaberta"/"a revisar" conforme o caso; as etapas dependentes que já estavam concluídas aparecem marcadas **"A revisar: …"**, com o botão **"Confirmar a revisão"** — sem apagar nenhuma peça.
3. Refaça o TR (gere de novo) e conclua ("Avançar"/"Confirmar a revisão" nas dependentes que ficaram marcadas). **Esperado:** a marca de "a revisar" some quando a peça muda ou quando a etapa é confirmada; a tramitação e o restante do processo continuam de onde estavam.

**Teste do "Devolver":**

1. Escolha um ponto da tramitação (ex.: enquanto o processo está com o Agente, antes do envio ao Jurídico) e, na janela de quem está com o processo, clique em **Devolver**.
2. Tente devolver **sem motivo**. **Esperado:** botão desabilitado / recusado — motivo é obrigatório.
3. Devolva com um motivo de teste. **Esperado:** o processo volta para a origem (quem enviou); a **Linha do tempo** registra a devolução, com o motivo.
4. Reenvie normalmente para retomar o percurso.

---

## 6. Diligência do Jurídico, correção, parecer e autorização

1. **Janela 4 — Jurídico:** confirme que recebeu o aviso e clique em **Recebi**.
2. Abra o **Parecer**. Escolha uma peça (ex.: o TR ou o relatório do agente) e **abra uma diligência** (Devolver com diligência), descrevendo o que precisa corrigir.
   - **Esperado:** nasce uma tarefa para quem responde pela peça (no modo por setor, o setor dela — ex.: Compras); o processo "volta" para aquela peça sem desfazer o que já foi assinado.
3. **Janela correspondente ao setor da peça** (ex.: 2 — Compras, se a diligência foi na peça do TR): abra a tarefa de diligência, corrija a peça (gere de novo ou anexe) e clique em **Sanar**, respondendo o que foi feito.
   - **Esperado:** o processo volta para o Jurídico (tarefa "Diligência sanada — retomar a análise").
4. **Janela 4 — Jurídico:** confirme que a diligência aparece sanada; emita o **parecer favorável** e assine.
   - **Esperado:** o favorável só sai **sem diligência aberta**; depois de assinado, a etapa do parecer conclui.
   - **Opcional (art. 53, §5º):** se o modelo do órgão tiver "parecer dispensável por ato" ligado para este tipo de processo, teste também o botão **"Dispensar parecer (ato do jurídico)"** num processo separado (ou anote como "não testado nesta rodada, testar em processo à parte") — número e data do ato são obrigatórios (data não futura); confira que o cartão mostra "Dispensado por ato do jurídico — nº …, de … (art. 53, §5º)".
5. **Janela 4 — Jurídico:** **Enviar para: Autoridade/Presidência**, com despacho.
6. **Janela 5 — Autoridade:** **Recebi**. Abra a **Autorização**, confira o checklist do art. 72 e clique em **Autorizar e assinar** (ou gere o despacho e assine, conforme a tela).
   - **Esperado:** só autoriza com o art. 72 completo; a autorização assinada aparece na Linha do tempo com a folha correspondente.
7. **Janela 5 — Autoridade:** **Enviar para: Agente de contratação** (para a publicação) ou confirme que a tramitação segue o desenho do modelo (a etapa de publicação pode já estar com o Agente, dependendo de como o modelo foi configurado).

---

## 7. Lançamento de movimentação com data passada ("aconteceu em")

Escolha **um** envio da seção 5 ou 6 (ex.: Compras → Contabilidade) e refaça o teste **como se o processo tivesse andado no papel antes de alguém registrar**:

1. No diálogo de **Enviar para**, preencha o campo **"Aconteceu em (opcional)"** com uma data de **ontem** (não futura).
2. Envie. **Esperado:** a **Linha do tempo** mostra "Lançado depois em … por … — ocorrido em …"; o sistema não deixa usar uma data futura (teste também colocando a data de amanhã — deve ser **recusado** com mensagem clara).
3. Faça o mesmo com **Recebi** (campo "Recebido em") e/ou com **Devolver** ("Aconteceu em"), num outro passo.

---

## 8. Isolamento entre setores

1. Enquanto o processo está com um setor (ex.: Contabilidade, depois do passo 5.6), troque para uma janela de **outro** setor que não é o dono nem o chefe (ex.: Jurídico) e tente clicar em **Recebi** para esse mesmo processo.
   - **Esperado:** **recusado** com mensagem clara (403 explicado na tela) — só quem é do setor de destino, a pessoa de destino, o chefe do setor ou o administrador do órgão pode receber.
2. Tente, da mesma janela "errada", **Enviar para** um destino, sem estar com o processo.
   - **Esperado:** recusado — só quem está com o processo pode enviar adiante (salvo o envio automático do modo simples).
3. Se o setor com o chefe cadastrado (passo 1.1) estiver na tramitação em algum momento, confirme que **o chefe também consegue** **Recebi**/**Enviar** mesmo sem ser o usuário de destino direto — isso é esperado (chefe do setor pode agir pelo setor).

---

## 9. Publicação e autos

1. **Janela 6 — Agente:** com o processo de volta (ou já com ele), conclua a **Conformidade** e **Publique** normalmente (como no roteiro de fase interna: escolher com/sem disputa de lances, gerar o aviso, publicar).
2. **Gerar autos (PDF)** no cabeçalho do processo. Abra o PDF e confira:
   - as peças na ordem lógica de sempre;
   - os **despachos de tramitação intercalados em ordem cronológica** entre as peças (cada envio/devolução aparece como uma folha, na posição certa pela data/hora, não misturado fora de ordem);
   - o carimbo de folha contínuo, sem pular número;
   - se testou o "aconteceu em" (seção 7), confira que a folha desse despacho registra "lançada em X por Y, ocorrida em Z".

---

## 10. Painel TV

1. Em **Configurações › Painel para TV**, gere ou use um link já existente. Abra o painel (não precisa de login).
2. Localize o processo de teste. **Esperado:** o cartão mostra **"com quem está"** pela tramitação (setor/pessoa, desde quando, prazo, se está atrasado) — refletindo a última tramitação que você registrou, e não uma tarefa antiga.

---

## 11. Segunda rodada — modo Simples

1. Volte com o **administrador** a **Configurações › Fase interna e tarefas** e mude o modo para **Simples**. Salve.
2. Crie um **segundo processo** de teste ("TESTE COWORK MULTI — SIMPLES"), pela Janela 6 (Agente de contratação), do início (DFD) até pelo menos a reserva orçamentária, **sem clicar em nenhum "Enviar para"**.
   - **Esperado:** o sistema **tramita sozinho**: ao concluir cada etapa (ex.: DFD, depois ETP/TR/Pesquisa), quando o modelo aponta um setor diferente do agente (ex.: a Reserva é da Contabilidade), o processo é enviado **automaticamente**, com despacho padrão e folha nos autos, e a Janela 3 (Contabilidade) recebe o aviso e a tarefa sem que ninguém tenha clicado em "Enviar para".
3. Confirme na **Linha do tempo** que os envios automáticos aparecem com a marca de "registrado automaticamente".
4. Volte o modo do órgão para o que estava antes de terminar o teste (ou deixe registrado no relatório qual modo ficou configurado).

---

## 12. Relatório final (formato obrigatório)

Entregue um relatório com:

1. **Resumo em 5 linhas:** passou / não passou, e os 3 problemas mais graves.
2. **Tabela por passo:**

| Seção.Passo | Janela/usuário | Resultado (OK / FALHOU / PARCIAL / NÃO VERIFICADO) | O que aconteceu | URL | Print |
|---|---|---|---|---|---|

3. **Erros**, cada um com: URL, janela/usuário, passos para reproduzir, mensagem exata, o que era esperado e o print.
4. **Confusões de uso:** telas ou textos em que um servidor da Câmara ficaria perdido (mesmo sem erro técnico) — em especial confusões **entre papéis** (ex.: um usuário não entender por que não pode agir, ou não achar o botão certo).
5. **Isolamento:** liste explicitamente cada tentativa de ação fora do papel/setor (seção 8) e se foi corretamente recusada.
6. **Dados criados:** número dos processos (DFD consolidado, processo sem demanda e rodada simples), as demandas, os DFDs (nº/ano), os setores/usuários ajustados, o modo do órgão e se a 2ª aprovação do DFD ficou ligada ou desligada ao final, para a limpeza depois.
