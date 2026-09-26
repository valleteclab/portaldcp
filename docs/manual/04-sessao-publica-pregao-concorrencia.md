# 04 — Sessão pública: pregão e concorrência

Esta é a parte do dia da sessão. Ela vale para o **pregão eletrônico** e a **concorrência eletrônica** (e, com diferenças indicadas nas partes próprias, para leilão, concurso e diálogo). Tudo acontece na **sala da sessão** do órgão, que se abre a partir do processo.

## Visão rápida das etapas

A sala mostra no topo uma régua com as etapas:

**Abertura → Análise → Lances → Benef. ME/EPP → Aceitação → Negociação → Habilitação → Recursos → Adjudicação → Homologação → Encerramento**

| Etapa | O que acontece | Quem age |
|---|---|---|
| Abertura | Conferências e abertura da sessão | Pregoeiro |
| Análise | Propostas recebidas; julgamento técnico, se houver | Pregoeiro / banca |
| Lances | Disputa conforme o modo (aberto, aberto-fechado, fechado-aberto, fechado) | Fornecedores; pregoeiro acompanha |
| Benef. ME/EPP | Empate ficto: ME/EPP convocada pode cobrir a melhor oferta em 5 min | ME/EPP convocada |
| Aceitação | 1º colocado envia a proposta adequada; pregoeiro aceita ou recusa | Fornecedor e pregoeiro |
| Negociação | Pregoeiro negocia melhor preço; demais licitantes acompanham | Pregoeiro e licitante da vez |
| Habilitação | Documentos do licitante aceito; diligências; habilitar ou inabilitar | Fornecedor e pregoeiro |
| Recursos | Janela de intenção; razões, contrarrazões, decisão | Licitantes, pregoeiro, autoridade |
| Adjudicação / Homologação | Atos da autoridade, registrados pelo agente | Agente / autoridade |
| Encerramento | Contrato ou ata gerados | — |

## 1. Antes da sessão: acompanhar as propostas

No cockpit, o cartão **Sessão pública** mostra quantas propostas chegaram e a data de abertura.

> **Atenção — sigilo.** Até a abertura, aparecem só as contagens: "licitantes e valores em sigilo até a abertura". Nem o órgão vê quem enviou nem os valores.

Quando o recebimento termina (no horário do cronograma, automaticamente), o processo vai para **Análise de Propostas** e o botão **Abrir sala da sessão** fica disponível. Antes disso ele aparece desabilitado: **Sala da sessão (após o recebimento)**.

Na mesma fase aparecem:

- **Propostas recebidas** (`/orgao/processos/<id>/propostas`) — lista com **Aguardando Análise**, **Classificadas** e **Desclassificadas**. Para desclassificar, informe o motivo (fica registrado).
- **Julgamento técnico** — quando o critério é técnica e preço ou melhor técnica (veja o item 6).

## 2. Abrir a sessão

1. No cockpit, cartão **Sessão pública**, clique em **Abrir sala da sessão** (`/orgao/processos/<id>/sessao`).
2. A sala mostra **Conferências antes da sessão pública**: **Fase interna**, **Edital publicado**, **Data de abertura**, **Prazo de impugnação** e **Propostas recebidas**, além do número de propostas, itens e o modo de disputa.
3. Se tudo estiver certo, aparece "Pronto para abrir a sessão pública". Clique em **Abrir sessão pública** (ou **Iniciar sessão pública**, se ela já tiver sido criada).
4. Ao abrir, "os licitantes com proposta são avisados e passam a acompanhar a sala".

> **Atenção.** Sem pregoeiro/agente definido no processo o botão fica bloqueado: "Defina o pregoeiro/agente de contratação no processo antes de abrir a sessão." (Cockpit › **Editar dados** › **Configurações**.)

> **Atenção.** A sessão não abre com: impugnação acolhida que altera o edital ainda sem retificação; propostas aguardando confirmação após retificação; licitação suspensa.

## 3. A sala do pregoeiro

A sala tem:

- cabeçalho **Sessão pública** com os botões **Suspender** / **Retomar** e **Reiniciar**, e o selo **Anonimização ativa**;
- contadores **Aguardando**, **Em disputa**, **Encerrados** e a **Base legal da cronometria**;
- **Fila operacional**: marque os itens (ou lotes) e clique em **Iniciar selecionados**; escolha qual acompanhar;
- **Item em foco**: melhor lance, participantes, quantidade, ritmo da etapa, **Regras da rodada** (etapa aberta, prorrogação, intervalo) e **Ações principais** (**Encerrar item**, **Reiniciar para demais colocações**);
- **Solicitações de cancelamento de lance**: "Fornecedores que ultrapassaram os 15 segundos para cancelamento direto aguardam sua decisão";
- chat: "Mensagens oficiais do pregoeiro — ficam registradas na ata da sessão";
- o painel da etapa atual (ME/EPP, aceitação, negociação, habilitação, recursos, resultado).

Durante a disputa ninguém vê o nome de quem deu o lance: os licitantes aparecem com códigos. A identidade só é revelada depois que termina a etapa de lances de **toda** a licitação.

## 4. Modos de disputa

O modo é definido no edital (aba **Classificação**). O sistema aplica cada um assim:

### Aberto (IN 73, art. 23)

- Lances públicos e sucessivos, por **10 minutos**.
- Se houver lance nos **últimos 2 minutos**, o prazo é prorrogado por mais 2 minutos, sucessivamente.
- Encerra sozinho quando passa uma prorrogação sem lances. O botão **Encerrar item** fica desabilitado quando o encerramento é automático.

### Aberto e fechado (IN 73, art. 24)

1. **Etapa aberta** fixa de **15 minutos**, sem prorrogação.
2. **Aviso de fechamento iminente** (no chat e na tela).
3. **Tempo aleatório** sigiloso de até 10 minutos: a etapa pode terminar a qualquer momento; ninguém sabe quando (nem o pregoeiro). Os lances continuam.
4. **Lance final fechado**: o melhor colocado e quem estiver até **10%** acima dele (no mínimo os 3 melhores; empatados no corte entram todos) podem enviar **um único** lance fechado, em **5 minutos**, melhor que o próprio último.
5. Classificação final pelo melhor valor de cada um (aberto + fechado).

> **Atenção (art. 24, §2º).** O lance fechado é sigiloso até o fim do prazo — **inclusive para o pregoeiro**, que vê só quantos foram recebidos. O encerramento manual é recusado neste modo.

### Fechado e aberto (IN 73, art. 25)

1. As propostas são classificadas automaticamente.
2. O melhor e os que estiverem até 10% acima (mínimo 3) vão para a **etapa aberta**, com as regras do modo aberto.
3. Os demais ficam na classificação pelo valor da proposta.

### Fechado (art. 56, I)

Não há lances: a unidade encerra na abertura e a classificação é pelas propostas. Usado com técnica e preço ou melhor técnica.

> **Atenção (art. 56, §§ 1º e 2º).** O modo fechado **sozinho** não é permitido com menor preço ou maior desconto; o aberto **sozinho** não é permitido com técnica e preço. O sistema recusa.

> **Margem de preferência:** quando houver, a faixa de 10% vira 20%.

### Regras comuns dos lances

- Cada fornecedor só pode dar lance **melhor que o próprio último** (IN 73, art. 21, §2º) e deve respeitar a **diferença mínima** do edital (valor ou percentual).
- **Lances iguais não são aceitos**: vale o registrado primeiro.
- O fornecedor pode cancelar o **próprio último lance** em até **15 segundos** (art. 21, §3º). Depois disso, ele **solicita** ao pregoeiro, que decide no quadro **Solicitações de cancelamento de lance** (com justificativa: "O lance deixará de valer e a cronometria será recalculada").
- Na disputa **por lote**, o lance é pelo valor global do lote. O sistema reparte o valor entre os itens proporcionalmente à proposta. Só disputa o lote quem cotou todos os itens dele.
- Em **maior desconto** o sistema guarda o preço resultante; em **maior lance** (leilão) a ordem é decrescente.

### Reiniciar para demais colocações (art. 56, §4º)

Com a unidade encerrada, se a diferença entre o 1º e o 2º for de **pelo menos 5%**, o pregoeiro pode reabrir a disputa aberta **só para as demais colocações**. A 1ª colocação é mantida e nenhum lance pode alcançá-la. Use **Reiniciar para demais colocações** no **Item em foco** e registre a justificativa. Cabe uma vez por unidade.

### Suspender, retomar, reiniciar a sessão

- **Suspender**: informe o motivo e **Confirmar suspensão**. Os relógios param; na retomada, eles são deslocados pelo tempo parado.
- **Reiniciar**: "Use este ato apenas quando for necessário recomeçar a sessão. Os lances não são apagados: ficam no retrato congelado e cancelados logicamente." Justificativa obrigatória.

### Desconexão do pregoeiro (IN 73, art. 27)

Se o pregoeiro ficar sem conexão com a sala durante os lances, os lances continuam por até **10 minutos**. Passado isso, a sessão é **suspensa automaticamente**. A sala então mostra o aviso e o botão **Comunicar data de reinício**: a retomada só é permitida **24 horas** depois da comunicação aos participantes, a partir da data comunicada.

## 5. Julgamento

Quando termina a etapa de lances de todas as unidades, a licitação vai para **Julgamento** sozinha.

### 5.1 Desempate ME/EPP (LC 123, arts. 44 e 45)

Automático, logo após o encerramento de cada unidade:

1. Se a melhor oferta **não** é de ME/EPP, as ME/EPP com oferta até **5%** acima (pregão) ou **10%** (demais) entram numa fila, na ordem de classificação.
2. A primeira é convocada e tem **5 minutos** para oferecer valor **menor** que a melhor oferta ou recusar — ela responde na sala dela.
3. Sem resposta ou recusando, a próxima é convocada. Sem ninguém, vale a melhor oferta original.

O painel **Benef. ME/EPP** mostra a melhor oferta (não ME/EPP), o intervalo, a fila, a convocada e o prazo. Ofertas iguais entre ME/EPP são ordenadas por **sorteio auditável** ("ordem por sorteio").

> **Atenção.** Não se aplica quando a unidade é exclusiva ou cota ME/EPP, quando a melhor já é ME/EPP, no maior lance, na dispensa, inexigibilidade, leilão e concurso. O porte vem do **cadastro** do fornecedor mais a declaração na proposta. Se a licitação for suspensa, o prazo de 5 minutos **pausa** ("prazo pausado").

A aceitação da unidade só é liberada depois que o desempate termina.

### 5.2 Aceitação da proposta (IN 73, art. 29)

No painel de aceitação:

1. O sistema mostra o ranking e o licitante **na vez** (a ordem não pode ser pulada).
2. Informe o **Prazo (horas)** — **mínimo 2 horas** — e clique em **Convocar &lt;licitante&gt;**.
3. O fornecedor envia, pela sala dele, o arquivo da proposta e os valores por item (a soma não pode passar do último lance; no lote, cada item não passa do valor rateado).
4. Se precisar, **Prorrogar (+N h)** — uma única vez, pelo mesmo período (de ofício ou atendendo pedido justificado do licitante).
5. Abra **Ver proposta** e decida:
   - **Aceitar proposta** (motivação opcional);
   - **Recusar e convocar o próximo** (motivo obrigatório). Sem próximo, a unidade **fracassa**.

Prazo vencido sem envio conta como recusa.

> **Atenção — exequibilidade.** Proposta abaixo de **75%** do orçado em obras/serviços de engenharia (art. 59, §4º) ou abaixo de **50%** em bens/serviços (IN 73, art. 34) gera alerta; para aceitar, é preciso justificar.

### 5.3 Negociação (art. 61; IN 73, art. 30)

A negociação acontece **antes do aceite**, com o licitante na vez:

1. No painel de negociação, clique em **Abrir negociação com &lt;licitante&gt;** (mensagem inicial opcional; os demais licitantes acompanham).
2. Troque mensagens e use **Enviar contraproposta** (valor menor que o atual).
3. O licitante aceita (o valor vira o novo lance e a proposta adequada precisa ser reenviada, com novo prazo de pelo menos 2 h) ou recusa com motivo.
4. Termine com **Encerrar (manter valor)** ou, se o valor continua acima do máximo depois de ao menos uma contraproposta respondida, **Desclassificar por preço acima do máximo** (art. 59, III). O próximo do ranking é chamado à negociação automaticamente.

> **Atenção.** Acima do **preço máximo** (soma do valor estimado da unidade), a negociação é **obrigatória**: o aceite é recusado sem ela. Persistindo acima depois de negociar, só se aceita com motivação expressa (mínimo 20 caracteres).

> **Transparência.** A negociação é **acompanhada** por todos os licitantes (modo leitura). O público vê a abertura e o resultado (valor). O preço máximo só é mostrado ao licitante se o orçamento não for sigiloso.

### 5.4 Desempate do art. 60 e sorteio

Quando há empate de valor final (propostas iguais sem lances, modo fechado, lances fechados iguais) ou de pontuação, o painel de desempate mostra o grupo empatado e a aceitação fica bloqueada até resolver:

1. **Convocar disputa final (art. 60, I)** — informe o prazo em minutos (1 a 60; padrão 5). Cada empatado envia **uma** nova proposta sigilosa, melhor que a própria.
2. Persistindo o empate, **Aplicar critérios do art. 60** (desempenho, equidade, integridade, empresa do estado, empresa brasileira). O sistema registra, critério a critério, se foi aplicável e o efeito.
3. Persistindo, **Realizar sorteio em ato público** (IN 73, art. 28, §2º). O sorteio é auditável: **Conferir sorteio** refaz a conta ("Resultado conferido: a entrada pública reproduz a ordem registrada."). Qualquer licitante também pode conferir.

### 5.5 Julgamento técnico (técnica e preço, melhor técnica)

Tela **Julgamento técnico** (botão no cartão **Sessão pública** ou na linha do tempo; `/orgao/processos/<id>/julgamento-tecnico`):

1. Configure os **quesitos** (peso e **Nota máxima**), o peso da técnica (até 70% — art. 36, §2º) e a **Nota técnica mínima (0–100, opcional)**. Editáveis até a primeira nota.
2. Designe a **banca**: no mínimo **3** usuários ativos do órgão (art. 37, §1º).
3. Os licitantes anexam a proposta técnica até o fim do recebimento. O órgão só a vê depois do recebimento.
4. Cada membro, com o **próprio login**, registra **Minhas notas**. Quem não é membro vê: "Você não é membro da banca".
5. Com todas as notas, clique em **Publicar notas técnicas**. Propostas abaixo da mínima são desclassificadas.

> **Atenção.** A etapa de preços (iniciar os itens na sala) só abre **depois** da publicação das notas.

Classificação: técnica e preço usa o índice ponderado (art. 36); melhor técnica usa só a nota; maior retorno econômico usa a economia menos a remuneração (art. 39).

## 6. Habilitação (arts. 62 a 70)

Com a proposta aceita, abra o painel **Habilitação**:

1. Em **Proposta aceita — convocar para a habilitação**, informe o **Prazo (horas)** (mínimo 2 h — IN 73, art. 39) e clique em **Convocar**.
2. O painel mostra cada exigência do edital. As que o **registro cadastral** do fornecedor já cobre aparecem como "Atendida pelo registro cadastral (art. 70)" — só valem documentos aprovados e dentro da validade.
3. O fornecedor anexa os demais documentos pela sala dele e clica em entregar. Se o prazo acabar, vale o que já estiver anexado.
4. Analise cada documento: **Atende**, **Não atende** (motivo obrigatório) ou abra **diligência**.
5. **Abrir diligência (art. 64)**: motivo, prazo (mínimo 2 h) e as exigências a complementar. O fornecedor complementa **sem substituir** o que entregou. Uma diligência por vez.
6. Se precisar, **Prorrogar o prazo de envio** (uma vez).
7. Decida:
   - **Habilitar licitante** — exige todas as exigências obrigatórias com documento que atende e nenhuma diligência aberta. O licitante fica HABILITADO nas unidades com proposta aceita.
   - **Inabilitar licitante** — motivo obrigatório (mínimo 10 caracteres). O próximo pelos lances é convocado automaticamente para a aceitação. Sem próximo, a unidade fracassa.

> **Atenção (art. 64).** Depois da entrega, o fornecedor **não pode** trocar documentos nem incluir novos — só complementar dentro de uma diligência. Documento com validade vencida não pode ser aceito: o sistema orienta a abrir diligência.

### Inversão de fases (concorrência — art. 17, §1º)

Se o edital prevê inversão:

- todos os licitantes anexam os documentos de habilitação **junto com a proposta**, até o fim do recebimento;
- no painel **Habilitação prévia (inversão de fases)**, o agente julga a habilitação de **todos** antes da disputa: "só os habilitados participam dos lances";
- inabilitado tem a proposta desclassificada (a reversão é por recurso);
- depois da aceitação, a habilitação do vencedor é só **confirmada**, sem novo envio.

## 7. Recursos (art. 165)

### 7.1 Janela de intenção

1. Depois da habilitação, no painel **Recursos**, informe a duração (mínimo **10 minutos**) e clique em **Abrir prazo de intenção de recurso**.
2. Os licitantes manifestam a intenção **pela sala deles**, indicando o ato de que recorrem. Depois de fechada: "intenções posteriores precluem".

### 7.2 Admissibilidade

Para cada intenção, **admita** ou **não admita**. Para não admitir, escolha o pressuposto ausente — **Legitimidade**, **Interesse recursal**, **Motivação** ou **Tempestividade** — e fundamente (mínimo 20 caracteres), clicando em **Confirmar não admissão**.

> **Atenção.** "Só a falta EVIDENTE de pressuposto recursal justifica a não admissão (art. 165 §1º I)."

### 7.3 Razões e contrarrazões

- Admitida a intenção, o recorrente tem **3 dias úteis** para enviar as **razões** (texto e arquivo) pela sala dele.
- Os demais licitantes têm **3 dias úteis**, contados do fim do prazo das razões, para as **contrarrazões**.
- Fora do prazo, o envio é recusado. Razões não apresentadas → recurso **não conhecido**.
- O pregoeiro **não** digita pelas partes: cada licitante envia a própria peça.

### 7.4 Decisão

1. Depois do fim das contrarrazões, o agente decide em até 3 dias úteis:
   - **Reconsiderar (dar provimento)**; ou
   - **Manter e encaminhar à autoridade superior** (fundamentação mínima de 20 caracteres).
2. A autoridade decide em até **10 dias úteis**, no bloco **Decisão da autoridade superior**: nome e cargo, fundamentação, **Dar provimento** ou **Negar provimento**.

> **Atenção — quem decide como autoridade.** A conta do órgão (informando nome e cargo) ou um usuário **Administrador** do órgão — nunca quem manteve a decisão. Pregoeiro e equipe de apoio são recusados.

> **Atenção — efeito suspensivo (art. 168).** Com janela aberta ou recurso pendente, a adjudicação e a homologação ficam bloqueadas.

Prazos vencidos do agente ou da autoridade são **sinalizados** em destaque, mas nunca decididos automaticamente.

### 7.5 O que acontece quando o recurso é provido

O sistema aplica o efeito sozinho:

- contra a própria inabilitação → o recorrente volta a ser habilitado;
- contra recusa ou desclassificação → volta ao ranking;
- contra a habilitação de outro → o outro é inabilitado;
- contra a aceitação de outro → o outro é desclassificado.

Quem tinha sido chamado no lugar e ficou abaixo no novo ranking volta a "classificado". Se alguma unidade ficar sem proposta aceita, a licitação volta ao julgamento e o próximo é convocado; uma nova janela de intenção será necessária sobre o novo resultado.

## 8. Adjudicação e homologação (art. 71, IV)

O cartão **Resultado** aparece no cockpit e na sala (etapas Recursos a Encerramento). Ele mostra cada unidade com o vencedor e os valores (prévia antes de adjudicar), as pendências e o bloco **Formalização** (modo, autoridade padrão).

### Adjudicar

1. Clique em **Adjudicar**.
2. No diálogo **Adjudicar o objeto**, escolha a **autoridade** (a padrão vem marcada).
3. Opcional: **Gerar termo (prévia)** para conferir o termo antes.
4. Conforme o modo do órgão:
   - **Registro direto** → **Confirmar adjudicação** (efeito imediato);
   - **Assinatura eletrônica** → **Enviar para assinatura da autoridade**;
   - **Termo externo** → anexe o termo assinado ou a publicação, informe veículo (ex.: "Diário Oficial do Município") e data, e confirme.

Cada unidade é adjudicada ao licitante **habilitado**, pelos valores da **proposta adequada aceita** — nunca por valor digitado.

### Homologar

1. Clique em **Homologar**. O diálogo **Homologar o resultado** mostra a autoridade e o total calculado. **Não há campo de valor**: o valor homologado é a soma dos valores adjudicados.
2. Confirme conforme o modo (**Confirmar homologação**, **Enviar para assinatura da autoridade** ou anexando o termo externo).
3. Resultado:
   - licitação **não SRP** → um **contrato por vencedor**, em "Aguardando Assinatura";
   - licitação **SRP** → uma **ata de registro de preços por fornecedor** (parte [10](10-registro-de-precos-atas.md));
   - o **Termo de Adjudicação e Homologação** vai para a aba **Documentos** da página pública e para o PNCP.

> **Quem pode registrar:** conta do órgão, Administrador, Pregoeiro/agente. **Equipe de apoio não pode.**

### Acompanhar o pedido de assinatura da autoridade

No modo **Assinatura eletrônica**, o bloco **Formalização** mostra "Aguardando assinatura da autoridade", a situação do documento, **Ver termo enviado**, o link do Portal de Assinaturas e **Cancelar pedido**. Enquanto houver pedido pendente, não é possível registrar outro ato.

Se o resultado mudar entre o envio e a assinatura (vencedor, valores), o efeito é recusado e aparece "Assinado — efeito falhou", com **Tentar de novo** ou **Descartar**.

Os termos efetivados ficam listados com autoridade, delegação e operador ("Registrado no sistema por &lt;operador&gt; em &lt;data&gt;"), para download.

Se a geração do contrato/ata falhar, o cartão mostra **Gerar contrato(s)** ou **Gerar ata de registro de preços** para tentar de novo.

## 9. Contrato

Na tela do processo, a etapa atual mostra o quadro **Contratos e atas**, com cada contrato, valor e situação:

1. Clique em **Gerar termo e colher assinaturas**. Informe/confirme o responsável do órgão. O termo em PDF é gerado; o órgão assina pelo **Portal de Assinaturas** e o fornecedor recebe o link por e-mail.
2. Acompanhe "Assinaturas: X/Y", baixe o **termo (PDF)**, use **assinar/acompanhar** e **reenviar notificações**.
3. Quando todos assinam: "Assinado por todas as partes em &lt;data&gt;". A data de assinatura e a vigência são contadas **desta data**, e o contrato é publicado no PNCP automaticamente (art. 94 — condição de eficácia).
4. Assinado, o link **medições e execução** leva à gestão do contrato.

O prazo de entrega vem da proposta do vencedor.

## 10. Ata da sessão

O botão **Ata da sessão** (cartão **Sessão pública**, depois da análise) abre `/orgao/processos/<id>/ata`: participantes, itens, vencedores, economia e o **registro cronológico** de todas as ações (lances, mensagens, convocações, negociação, habilitação, recursos). A ata pública fica disponível depois do encerramento da sessão.
