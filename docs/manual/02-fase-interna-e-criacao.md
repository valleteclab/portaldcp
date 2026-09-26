# 02 — Fase interna e criação do processo

A fase interna é a preparação da contratação (art. 18): descrever a necessidade, estudar a solução, pesquisar preços, fazer o termo de referência, obter o parecer jurídico e a autorização. O sistema guarda tudo no **dossiê do processo** e só deixa publicar quando os documentos obrigatórios estão prontos.

## Duas formas de criar um processo

### A. A partir de uma demanda aprovada (recomendado)

1. Menu **Demandas** › abra a demanda (ela precisa estar **Aprovada** ou **Consolidada**).
2. Clique em **Iniciar contratação**.
3. Na janela, escolha a **Modalidade da contratação**: Dispensa Eletrônica, Pregão Eletrônico, Inexigibilidade ou Concorrência. O sistema sugere a dispensa quando o valor cabe no limite vigente do art. 75, II — mas a escolha é sua.
4. Se quiser, marque a opção do **copiloto**: "O sistema pesquisa preços em fontes reais (PNCP/Painel de Preços) e redige os rascunhos do ETP, TR e autorização — você só revisa e aprova."
5. Clique em **Criar processo e abrir cockpit**.

O processo nasce **vinculado à demanda** e já com itens, quantidades, valores estimados e o DFD. A demanda passa a **Em contratação** e o item do PCA a **Licitação iniciada**. Quando o contrato for assinado por todos, a demanda vira **Contratada** e o item do PCA **Contratado**.

Se a demanda já tiver processo, o botão vira **Ver processo &lt;número&gt;**.

### B. Pelo assistente "Novo processo"

1. Menu **Novo processo** (endereço `/orgao/fase-interna/processos/novo`).
2. Siga os passos do assistente, na ordem:

| Passo | O que se preenche | Base |
|---|---|---|
| **Dados básicos** | Objeto, área demandante, modalidade, critério de julgamento, modo de disputa, SRP, tipo de contratação, vínculo com o PCA (ou justificativa da ausência — art. 12, §1º) | Configuração inicial |
| **Itens da contratação** | Descrição, quantidade, unidade, valor unitário estimado, tipo (material/serviço), código do catálogo (CATMAT/CATSER) e vínculo com o PCA. **Salvar e continuar** grava o rascunho do processo com os itens. O valor unitário pode ficar para a pesquisa de preços. Item do PCA escolhido no DFD/ETP entra aqui automaticamente | Art. 18, IV · art. 40 |
| **Formalização da Demanda** (DFD) | Necessidade, quantidade, previsão no PCA, data prevista | Art. 18, I |
| **Estudo Técnico Preliminar** (ETP) | 13 incisos do art. 18, §1º (necessidade, requisitos, quantidades, mercado, valor, posicionamento conclusivo...) | Art. 18, §1º |
| **Análise de Riscos** | Riscos com probabilidade e impacto (Baixo, Médio, Alto, Crítico) | Art. 18, X |
| **Pesquisa de Preços** | Abre o **módulo de pesquisa de preços** do processo (por item: busca automática PNCP/Painel/contratos, curadoria, estatísticas, metodologia, comprovantes). **Gerar Documento PP** registra a pesquisa nos autos (vale como estimativa de despesa do art. 72 e como pesquisa + mapa comparativo do rito completo) e grava o valor referencial de cada item como valor unitário estimado. **Próxima etapa do assistente** volta ao assistente no TR | Art. 23 · IN SEGES 65/2021 |
| **Termo de Referência** | Alíneas "a" a "j" do art. 6º, XXIII | Art. 6º, XXIII |
| **Dotação Orçamentária** | Exercício, fonte de recurso, elemento de despesa, valor disponível | Art. 167 CF, LRF |
| **Autorização** | Autorização da autoridade competente para iniciar | Art. 18, II |
| **Edital / Aviso** | Minuta do edital ou do aviso | Art. 25 / arts. 74-75 |
| **Parecer Jurídico** | Parecer da procuradoria | Art. 53 |

3. Em cada passo você pode usar **Gerar com IA**, **Sugerir com IA** ou **Gerar rascunho** e depois editar. Use **Salvar rascunho** para continuar depois e **Próxima etapa** / **Anterior** para navegar.
   - **Dispensa e inexigibilidade (art. 72):** obrigatórios só Dados básicos, Itens, DFD, Pesquisa de Preços (estimativa de despesa) e Autorização. ETP, Análise de Riscos, TR, Dotação, Aviso e Parecer aparecem como **facultativa**: preencha se o caso exigir, clique **Pular etapa**, ou **Não se aplica — justificar** (a justificativa fica nos autos; **Desfazer** reverte).
4. No fim, clique em **Concluir fase interna** (ou vá ao cockpit para concluir mais tarde).

> **Atenção — itens.** Sem pelo menos um item com quantidade e valor unitário estimado o processo **não conclui a fase interna nem publica** (todas as modalidades), e a compra não vai ao PNCP. Na tela do processo, a aba **Itens** (contador em vermelho quando não há item) mostra os itens e, na fase interna, **Editar itens** (aba Itens da edição) e **Pesquisa de preços**; o checklist da etapa atual também aponta a pendência com **Cadastrar itens**.

Para leilão, concurso e diálogo competitivo, o assistente mostra também os campos próprios da modalidade (veja as partes [07](07-leilao.md), [08](08-concurso.md) e [09](09-dialogo-competitivo.md)). O credenciamento tem cadastro próprio no menu **Credenciamentos** (parte [06](06-credenciamento.md)).

> **Atenção — IA.** "Texto gerado por IA deve ser revisado pelo servidor responsável." A responsabilidade pelo conteúdo é sempre do servidor. Nada é publicado sem a sua validação.

## Minhas tarefas (caixa de entrada)

Ao entrar em **Minhas tarefas** (menu principal, ou o início da área de fase interna), você vê as suas tarefas abertas, das mais urgentes para as menos urgentes. O número ao lado do menu mostra quantas estão abertas. Ele fica laranja quando alguma está atrasada.

- **Para mim**: as tarefas atribuídas a você e as do seu papel ou setor.
- **Aguardando outros**: tarefas dos processos em que você é o agente e que estão com outras pessoas. Para o administrador do órgão, todas as do órgão.
- **Concluídas**: as que você cumpriu ou que eram suas.
- **Prazos da semana**: tarefas que vencem nos próximos 7 dias e sessões públicas marcadas.

Cada tarefa tem o botão **Abrir peça**, que leva direto à peça dentro da tela do processo. A peça fica destacada. Tarefa atrasada aparece em laranja.

**As tarefas nascem e terminam sozinhas.**
- Quando uma etapa fica disponível, o sistema cria a tarefa para o responsável. Ao abrir um processo, nasce a tarefa da **demanda (DFD)**.
- Quando a peça fica pronta (feita aqui, anexada em PDF, assinada por todos ou marcada "não se aplica"), a tarefa é concluída e o sistema registra quem cumpriu.
- Se o processo for revogado ou anulado, ou se a etapa deixar de valer (ex.: controle interno desligado), a tarefa é cancelada.

**Assumir e reatribuir.** Uma tarefa do seu papel ou setor pode ser **assumida**: ela passa a ser só sua. **Reatribuir** passa a tarefa para outra pessoa do órgão, com motivo opcional. Podem reatribuir o responsável, o agente do processo e o administrador do órgão. Tudo fica no histórico.

> **Tramitação × tarefa.** A tramitação continua sendo o despacho formal entre setores, que vai para os autos. A tarefa é o "o que eu tenho que fazer". Uma não cria a outra.

## Etapas da fase interna

Na tela do processo, o quadro **Fluxo da fase interna** mostra as etapas com a situação, o responsável e o prazo:

1. Demanda (DFD)
2. ETP e análise de riscos
3. Termo de referência
4. Pesquisa de preços
5. Reserva orçamentária
6. Autorização
7. Minutas e parecer jurídico
8. Controle interno (só se o órgão ligou)
9. Conformidade e publicação

Na licitação (rito completo), o parecer vem antes da autorização.

- A **ordem é sugestão**: qualquer peça pode ser feita ou anexada antes, e conta na hora.
- As tarefas seguem as dependências. Depois da demanda, ficam disponíveis o estudo técnico, o TR e a pesquisa. A reserva orçamentária espera a pesquisa, porque precisa do valor. A autorização espera as etapas 1 a 5. As minutas vêm depois da autorização, e o parecer vem depois das minutas.
- Clique numa etapa para ver as peças, o que falta, o prazo padrão e quem concluiu. **Ver histórico** mostra cada mudança de etapa e de tarefa, com quem e quando.

## O dossiê da fase interna

No cockpit, clique em **Fase interna** (o botão aparece enquanto o processo está na fase interna). O dossiê tem as abas **Visão geral**, **Documentos**, **Tramitação**, **Comentários** e **Permissões**, e mostra cada peça: DFD, ETP, Mapa de Riscos, Pesquisa de Preços, Termo de Referência, Parecer Jurídico, Elaboração do Edital, Autorização para abertura.

- Clique numa peça para abrir o **editor por seções**. Os botões **Redigir com IA** e **Melhorar com IA** ajudam a escrever; o painel lateral de IA também pode ser usado.
- **Exportar dossiê** baixa os autos em PDF. **Comentar** abre a aba de comentários.
- **Ir para o processo / publicar** leva de volta ao cockpit.

Para a pesquisa de preços, há telas próprias de preços e de riscos dentro do processo da fase interna.

## Documentos obrigatórios por modalidade

### Pregão, concorrência, leilão, concurso e diálogo (rito completo)

O processo percorre as etapas internas, cada uma com seus documentos obrigatórios:

| Etapa | Documentos obrigatórios | Base |
|---|---|---|
| Planejamento | DFD e ETP | Art. 18, I e §1º |
| Termo de Referência | TR e justificativa da contratação | Art. 18, II e IX |
| Pesquisa de Preços | Pesquisa de preços e mapa comparativo | Art. 18, IV c/c art. 23 |
| Análise Jurídica | Parecer jurídico | Art. 53 |
| Aprovação Interna | Autorização de abertura, designação do agente/pregoeiro e dotação orçamentária | Art. 18 |

Os atos aparecem no menu **Mais ações** da tela do processo: **Concluir planejamento (ETP)**, **Aprovar termo de referência**, **Concluir pesquisa de preços**, **Registrar parecer jurídico**, **Concluir fase interna (autorização)**. Se precisar voltar, use **Devolver à etapa interna anterior**.

### Dispensa, inexigibilidade e credenciamento (contratação direta — art. 72)

A fase interna é uma **etapa única** chamada **instrução do processo**. Na tela do processo, a **Etapa atual** mostra o checklist antes de publicar e o quadro **Peças da instrução (art. 72)** (nas demais modalidades, **Peças da fase interna (art. 18)**), que lista:

| Documento | Obrigatório? | Base |
|---|---|---|
| Formalização da demanda (DFD) | Sim | Art. 72, I |
| Estimativa de despesa (pesquisa de preços) | Sim | Art. 72, II c/c art. 23 |
| Autorização da autoridade competente | Sim | Art. 72, VIII |
| ETP, TR, análise de riscos | "Se for o caso" | Art. 72, I |
| Parecer jurídico | Conforme o caso | Art. 72, III c/c art. 53, §5º |
| Compatibilidade orçamentária | Conforme o caso | Art. 72, IV |
| Justificativa da contratação direta (razão da escolha e do preço) | Conforme o caso | Art. 72, VI e VII |
| Designação do agente de contratação (portaria do exercício) | Conforme o caso | Art. 8º |
| Relatório do agente de contratação | Conforme o caso | Art. 72, VI e VII |
| Minuta do contrato | Conforme o caso | Art. 72 c/c art. 92 |

- O que não for obrigatório e não se aplicar pode ser marcado como **não se aplica**, com justificativa (fica nos autos). Para voltar atrás, **desfazer**. O botão só aparece nas peças em que a lei permite dispensar.
- O botão **Preparar automaticamente (copiloto)** chama o copiloto (pesquisa de preços em fontes reais e rascunhos dos documentos).
- Os sinais ao lado de cada item mostram: concluído, **não se aplica**, **em aprovação** (com a etapa e o responsável) ou **aguarda envio p/ aprovação**.

> **Atenção.** "Mínimo para divulgar: DFD, estimativa de despesa e autorização." Sem eles, o botão de divulgação fica desabilitado e, ao passar o mouse, mostra as pendências.

## Cada peça: fazer aqui, anexar PDF ou não se aplica

Toda peça da lista tem três caminhos, e os três contam igual no checklist:

| Botão | Quando usar | O que acontece |
|---|---|---|
| **Fazer aqui** | A peça será escrita no sistema | Abre o editor da peça (modelo + IA). A data da peça feita e assinada no sistema é a da **última assinatura** — nunca é digitada. |
| **Anexar PDF** | A peça foi feita fora (Word, outro setor, procuradoria, Mesa Diretora) | Janela com **Arquivo (PDF)**, **Número da peça** (ex.: "Parecer 167/2025"), **Data do documento** (a data que está escrita na peça — obrigatória e não pode ser futura), **Quem assinou** (nome e cargo) e **Observação**. O sistema guarda também a data do envio e o código SHA-256 do arquivo. |
| **Não se aplica** | Só nas peças "se for o caso" da contratação direta | Pede a justificativa, que vai para os autos. |

- **Só PDF.** Outro formato (ou arquivo que não abre como PDF) é recusado. O tamanho máximo é 25 MB.
- **Substituir.** Anexar de novo, ou editar no **Fazer aqui** uma peça anexada ou assinada, cria uma **nova versão**. A anterior fica no histórico como **substituída** — nunca some.
- **Folhas dos autos.** Quando a peça é anexada ou termina de ser assinada, ela recebe as folhas seguintes do processo (ex.: "fls. 12–16"). A linha da peça mostra se foi feita no sistema ou anexada, o número, a data, as folhas, a versão e o link **ver PDF**.
- **Portaria de designação.** A portaria do agente de contratação e da equipe vale para o **ano inteiro**. Ela é anexada uma vez pelo órgão e, em cada processo, o botão **Usar portaria do órgão** (na linha "Designação do agente de contratação") junta a portaria vigente do exercício, sem copiar o arquivo. Se o órgão anexar outra portaria para o mesmo ano, ela vira a versão 2 e a anterior fica no histórico.
- **Anexo pela aba Documentos.** O PDF de ETP, TR, pesquisa de preços, parecer, autorização, dotação, riscos ou minuta do contrato anexado na aba **Documentos** do processo também conta como a peça (antes o checklist dizia que faltava).

> **Atenção.** Depois que o processo é divulgado, as peças da fase interna não mudam mais. O parecer jurídico da fase externa (antes da adjudicação) continua podendo ser anexado.

### Peça com vários signatários (autoridade colegiada)

Quando a autoridade é colegiada (ex.: Mesa Diretora com 4 assinaturas), a peça feita no sistema é enviada para assinatura de **vários usuários do órgão, cada um com o seu papel** (Presidente, Vice-Presidente, 1º Secretário...). A peça aparece como **aguardando assinaturas** e **só conta como pronta quando todos assinarem**; nesse momento o sistema grava a data (a da última assinatura), o código do arquivo assinado e as folhas. Cada signatário assina pelo **Portal de assinaturas** (menu Assinaturas pendentes). Nesta etapa o envio é feito pela API (`POST /api/fase-interna/:id/documentos/:tipo/assinatura`); o botão na tela vem com as telas por etapa.

## Fundamento legal e limite da dispensa

- O **fundamento legal** do processo (ex.: "art. 75, II — dispensa por valor; art. 74, III, 'c'; art. 75, VIII — emergência") é escolhido em **Editar dados › Classificação › Fundamento legal**. As opções dependem da modalidade. Esse campo é a **fonte única**: vai para o PNCP (amparo legal), para as peças geradas por modelo e para o aviso de contratação direta. Trocar a modalidade devolve o fundamento ao padrão dela.
- **Limites da dispensa por valor** (art. 75, I e II) são **por exercício**, com o decreto de cada ano: 2023 — Dec. 11.317/2022 (R$ 114.416,65 / R$ 57.208,33); 2024 — Dec. 11.871/2023 (R$ 119.812,02 / R$ 59.906,02); 2025 — Dec. 12.343/2024 (R$ 125.451,15 / R$ 62.725,59); 2026 — Dec. 12.807/2025 (R$ 130.984,20 / R$ 65.492,11). O administrador da plataforma cadastra o exercício seguinte quando sai o decreto; enquanto não cadastra, vale o do último ano, marcado como provisório.
- Na dispensa por valor, a etapa atual mostra o **consumo do limite**: quanto o órgão já contratou no exercício, no mesmo ramo (classe do código CATMAT/CATSER) e na mesma unidade gestora — por exemplo, "98,4% de R$ 62.725,59 — Dec. 12.343/2024". Acima de 80% o quadro fica amarelo; acima de 100%, vermelho (art. 75, §1º — fracionamento). Nesta etapa é só um aviso; o bloqueio automático vem depois.

## O copiloto (preparação automática)

Quando acionado (na criação a partir da demanda ou pelo botão **Preparar automaticamente**), o cockpit mostra um cartão:

- "Copiloto preparando o processo…" enquanto trabalha;
- "Processo preparado pelo copiloto — **revise os itens sugeridos antes de aprovar**", com o registro do que foi feito;
- em caso de falha, a mensagem e o botão **Tentar de novo**.

## Aprovações

Quando um documento tem fluxo de aprovação configurado (veja [Configuração](01-configuracao-do-orgao.md#5-fluxos-de-aprovação)):

1. Quem elaborou abre o documento e clica em **Submeter para aprovação**.
2. Os aprovadores recebem o documento em **Aprovações** › aba **Documentos** (o menu **Aprovações** aparece para todos; cada aba conforme a permissão).
3. O aprovador da vez clica em **Aprovar etapa** ou **Reprovar etapa** (com **Motivo da reprovação** obrigatório). Quem não é da etapa vê "Aguardando vez".
4. Reprovado, o documento volta para ajuste e pode ser submetido de novo.

O andamento aparece na aba **Tramitação** do dossiê e no checklist do cockpit ("em aprovação — etapa X/Y · responsável").

## Editar os dados do processo

No cockpit, **Editar dados** abre as abas **Dados Básicos**, **Classificação**, **Itens**, **Lotes** (se usar lotes), **Cronograma**, **Habilitação** e **Configurações**.

- **Classificação**: modalidade, **fundamento legal** (select com as hipóteses da modalidade — veja acima), critério de julgamento, modo de disputa, tipo de contratação, vínculo com o PCA, disputa **Por item** ou **Por lote**, **Inversão de fases** (só concorrência), tratamento ME/EPP (**Sem Benefício**, **Exclusivo para ME/EPP**, **Cota Reservada** até 25%) e o modo de aplicação (toda a licitação, por lote ou por item).
- **Itens** e **Lotes**: cada item pode estar em no máximo um lote; cada lote pode ter seu próprio benefício ME/EPP.
- **Habilitação**: exigências de habilitação do edital (veja abaixo).
- **Configurações**: **Pregoeiro / Agente de Contratação** (escolhido entre os usuários ativos do órgão), diferença mínima entre lances, intervalo mínimo, tempo de prorrogação, lances intermediários e sigilo do orçamento (com **Justificativa do Sigilo** obrigatória — art. 24).

> **Atenção.** Depois da publicação, só dados internos podem ser alterados. Qualquer regra do edital (cronograma, objeto, critério, itens...) é recusada com a lista dos campos, e deve ser mudada pela **Retificação** (parte [03](03-publicacao-e-prazos.md)).

> **Atenção — combinações proibidas.** O sistema recusa na criação e na edição: modo **Fechado** isolado com menor preço ou maior desconto (art. 56, §1º); modo **Aberto** isolado com técnica e preço (art. 56, §2º); **maior lance** fora do leilão; leilão sem maior lance; concurso fora de melhor técnica/conteúdo artístico; objeto especial ou obra no pregão (art. 29).

### Exigências de habilitação

Na aba **Habilitação** da edição:

1. Escolha um modelo padrão (Bens, Serviços, Obras — com CREA/CAU e vistoria — ou Dispensa, com documentação reduzida conforme art. 70, III).
2. Ajuste as exigências por categoria (jurídica, fiscal, social/trabalhista, econômico-financeira, técnica): descrição, base legal, se é obrigatória, se aceita o registro cadastral e quais tipos de documento do cadastro a atendem, e se exige validade.
3. Salve.

Se nada for configurado, o processo recebe o modelo padrão automaticamente — **nunca há habilitação sem exigências**. Depois de publicado, as exigências ficam congeladas.

### ME/EPP: cotas e justificativa

Quando há pendência de ME/EPP, a etapa atual da tela do processo (fase interna) mostra a linha **Tratamento ME/EPP** no checklist e um quadro de cotas e justificativa (o quadro some quando não há pendência):

- **Gerar cotas reservadas**: separa a cota (até 25%) de cada item/lote marcado como cota reservada. Só é possível antes de haver propostas.
- Itens de até R$ 80.000 **sem** exclusividade exigem a justificativa do art. 49 (mínimo 20 caracteres).

> **Atenção (LC 123, art. 48, I).** Item exclusivo para ME/EPP com valor estimado acima de R$ 80.000 **bloqueia a publicação** (na disputa por lote, vale o valor total do lote).

## Excluir um processo

Enquanto está na fase interna, o cockpit mostra **Excluir**. A exclusão é definitiva. Depois da publicação, use **Revogar** ou **Anular** (parte [03](03-publicacao-e-prazos.md)).
