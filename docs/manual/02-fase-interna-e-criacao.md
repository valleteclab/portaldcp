# 02 — Fase interna e criação do processo

A fase interna é a preparação da contratação (art. 18): descrever a necessidade, estudar a solução, pesquisar preços, fazer o termo de referência, obter o parecer jurídico e a autorização. O sistema guarda tudo no **dossiê do processo** e só deixa publicar quando os documentos obrigatórios estão prontos.

## Duas formas de criar um processo

### A. A partir de uma demanda aprovada (recomendado)

1. Menu **Demandas** › abra a demanda (ela precisa estar **Aprovada** ou **Consolidada**).
2. Clique em **Iniciar contratação**.
3. Na janela, escolha a **Modalidade da contratação**: Dispensa Eletrônica, Pregão Eletrônico, Inexigibilidade ou Concorrência. O sistema sugere a dispensa quando o valor cabe no limite vigente do art. 75, II — mas a escolha é sua.
4. Se quiser, marque a opção do **copiloto**: "O sistema pesquisa preços em fontes reais (PNCP/Painel de Preços) e redige os rascunhos do ETP, TR e autorização — você só revisa e aprova."
5. Clique em **Criar processo**. O processo abre direto na **tela do DFD** (veja "Telas por etapa", abaixo).

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
4. No fim, clique em **Concluir fase interna** (ou vá à tela do processo para concluir mais tarde). O assistente serve só para **criar**: depois, cada etapa tem a sua tela dentro do processo.

> **Atenção — itens.** Sem pelo menos um item com quantidade e valor unitário estimado o processo **não conclui a fase interna nem publica** (todas as modalidades), e a compra não vai ao PNCP. Na tela do processo, a aba **Itens** (contador em vermelho quando não há item) mostra os itens e, na fase interna, **Editar itens** (aba Itens da edição) e **Pesquisa de preços**; o checklist da etapa atual também aponta a pendência com **Cadastrar itens**.

Para leilão, concurso e diálogo competitivo, o assistente mostra também os campos próprios da modalidade (veja as partes [07](07-leilao.md), [08](08-concurso.md) e [09](09-dialogo-competitivo.md)). O credenciamento tem cadastro próprio no menu **Credenciamentos** (parte [06](06-credenciamento.md)).

> **Atenção — IA.** "Texto gerado por IA deve ser revisado pelo servidor responsável." A responsabilidade pelo conteúdo é sempre do servidor. Nada é publicado sem a sua validação.

## Minhas tarefas (caixa de entrada)

Ao entrar em **Minhas tarefas** (menu principal, ou o início da área de fase interna), você vê as suas tarefas abertas, das mais urgentes para as menos urgentes. O número ao lado do menu mostra quantas estão abertas. Ele fica laranja quando alguma está atrasada.

- **Para mim**: as tarefas atribuídas a você e as do seu papel ou setor.
- **Aguardando outros**: tarefas dos processos em que você é o agente e que estão com outras pessoas. Para o administrador do órgão, todas as do órgão.
- **Concluídas**: as que você cumpriu ou que eram suas.
- **Prazos da semana**: tarefas que vencem nos próximos 7 dias e sessões públicas marcadas.

Cada tarefa tem o botão **Abrir peça**. Nas etapas com tela própria (DFD, ETP, TR, pesquisa de preços e reserva orçamentária) ele abre **a tela da etapa**; nas demais, leva à peça dentro da tela do processo, destacada. Tarefa atrasada aparece em laranja. As tarefas da **conformidade** (achado de bloqueio — ex.: minuta citando outro processo) e de **diligência** do parecer aparecem com etiqueta; **Abrir achado** leva à tela da conformidade, no achado, e a tarefa conclui sozinha quando a peça é corrigida.

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

## Telas por etapa

**Um processo, uma tela.** Tudo parte da tela do processo (`/orgao/processos/<id>`). No quadro **Fluxo da fase interna**, **Abrir a etapa →** (ou **fazer ou anexar**, dentro da etapa) abre a tela da etapa; a tarefa da caixa leva ao mesmo lugar. Toda tela tem **← Voltar ao processo** e, no alto, a barra das 8 etapas (1 Demanda › 2 ETP › 3 TR › 4 Pesquisa › 5 Reserva › 6 Autorização › 7 Minutas › 7 Parecer › [Controle interno] › 8 Conformidade e publicação) com a situação de cada uma. O controle interno só aparece quando o órgão o ativou.

Em todas as telas há o quadro da peça com **os dois caminhos, que contam igual**:
- **fazer aqui**, na própria tela, gerando a peça pelo modelo; ou
- **Anexar feito fora**: o PDF com o número, a data que consta na peça e quem assinou (setores que continuam no papel).

O mesmo quadro mostra a situação da peça, **Não se aplica** (quando a lei permite), **Enviar para assinatura** (vários signatários, cada um com o seu papel), **Ver PDF** e **Versões** (o histórico: cada versão, se foi feita aqui ou anexada, a data e o PDF). Quando a peça fica pronta (gerada, assinada, anexada ou "não se aplica"), a tarefa da etapa conclui sozinha.

> **Rascunho salvo automaticamente.** Nas telas, cada campo é gravado quando você sai dele (ou alguns segundos depois de parar de digitar). Não há botão "salvar".

### 1. Demanda (DFD)

- **Unidade requisitante** (setores do órgão), **Responsável pela demanda** e **Fiscal sugerido** (usuários do órgão), **Data pretendida** e **Prioridade**: listas, sem digitação livre. Sem setores cadastrados, a tela avisa para cadastrá-los em Configurações › Setores.
- **Item do Plano de Contratações Anual**: escolha o item do PCA do órgão. Se a contratação não consta do PCA, marque **A contratação não consta do PCA** e escreva a **justificativa** (art. 12, §1º).
- **Objeto** e **Por que o órgão precisa disso? (necessidade)**. Descreva a função, não o produto: a tela avisa quando o objeto cita marca ou modelo.
- **Itens e quantidades**: a tabela mostra cada item com o código **CATMAT** (bens) ou **CATSER** (serviços). **Editar itens (catálogo)** abre o mesmo editor de itens de "Editar processo" (busca no catálogo, planilha, digitação). Item sem código aparece como "sem código": o código é necessário para somar o limite da dispensa no ramo (art. 75, §1º).
- **Antes de gerar**: checklist (PCA ou justificativa, necessidade, itens com código, unidade e responsável, data, marca no objeto).
- **Gerar DFD** monta a peça pelo modelo, com as seções completadas pelos dados da tela (quantidades pelos itens, previsão no PCA, data), e gera o PDF.
- **Ir ao ETP (rascunho com IA)** abre a tela do ETP.

### 2. ETP e análise de riscos

- Editor por seções do **art. 18, §1º** (incisos I a XIII). O painel **Assistente do ETP** mostra os incisos com um ponto: azul = preenchido; laranja = **obrigatório vazio** (§2º: I, IV, VI, VIII e XIII); cinza = facultativo vazio. Clique no inciso para ir à seção.
- **Indicação de marca (art. 41, I).** O assistente detecta marca citada no texto:
  - citada **sem** a forma "apenas como referência, ou similar/equivalente" e sem justificativa → **bloqueio** (aviso vermelho no alto da tela);
  - citada **com** "similar/equivalente/superior" → **atenção**: a justificativa passa a ser obrigatória;
  - **Reescrever por função** pede à IA o trecho reescrito sem a marca; **Inserir justificativa** registra a justificativa formal (padronização, compatibilidade, única que atende ou referência). Com ela, a marca fica "justificada".
- **Coerência entre seções**: cada requisito citado na necessidade (ex.: "Closed Caption", "NDI") precisa aparecer na solução e no TR.
- **Pedir ao assistente**: escolha a seção e peça o rascunho, feito a partir do DFD e dos itens.
- **A sugestão nunca entra sozinha.** Ela aparece no painel; nada muda até você clicar em **Aplicar na seção** (ou **Substituir o trecho**). O texto aplicado fica registrado **como editado por você**, com o seu nome, no histórico. Sem IA configurada, o assistente avisa e as análises (incisos, marca, coerência) continuam funcionando.
- **Análise de riscos (N)** abre a matriz de riscos (a tela existente), com **← Voltar ao ETP**.
- **Gerar ETP (PDF)** completa as seções vazias com o que já existe (DFD, valor do processo) — nunca apaga o que você escreveu — e gera o PDF pelo modelo.
- **Contratação direta:** o ETP e os riscos são "se for o caso" (art. 72, I). Use **Não se aplica** com a justificativa; a etapa conclui.

### 3. Termo de referência

- Editor por seções (art. 6º, XXIII, alíneas a–j). **Gerar TR (PDF)** completa as seções vazias **a partir do ETP**, do **fundamento legal do processo** (o mesmo campo de "Editar processo" › Classificação, que vale para todas as peças) e da **dotação da reserva orçamentária**.
- Quadros: fundamento legal, dotação (da reserva; sem reserva, o link para abri-la), situação do ETP e a tabela de **itens e valores**.
- **Orçamento sigiloso (art. 24):** a tela avisa e o texto do TR diz que o valor é sigiloso, sem mostrá-lo (o valor fica só nos autos).

### 4. Pesquisa de preços

No alto, escolha **Pesquisa feita aqui** ou **Pesquisa feita fora (anexar o mapa)**.

**Feita aqui:**
- **Parâmetros (art. 23, §1º):** os 5 incisos (I painel de preços; II contratações similares do último ano; III mídia especializada e sítios; IV pesquisa direta com fornecedores; V notas fiscais). Em cada um, **Registrar consulta**: situação (**Consultado, com preços**, **Consultado, sem retorno** ou **Não consultado**), a data da consulta e o resultado (ex.: "0 resultados equivalentes"); **Evidência** anexa o print ou relatório (PDF, PNG ou JPG). O "consultado sem retorno" vale e vai para a certidão.
- **Cotações diretas (inciso IV):** **Nova cotação** com fornecedor, **CNPJ** (conferido), **data de emissão** (a da proposta; não pode ser futura), **validade** e o **valor unitário de cada item**. Depois, **anexar comprovante**. A situação mostra **Válida**, **Vence antes** (vence antes da publicação prevista), **Vencida** ou **Mais de 6 meses** (emitida mais de 6 meses antes da publicação prevista — art. 23, §1º, IV). Cotação vencida ou com mais de 6 meses **não entra no cálculo**. Registre também a data em que a solicitação de cotação foi enviada.
- **Método de cálculo:** os três totais — **Menor preço**, **Mediana** e **Média** — são calculados sozinhos; clique no método adotado. A **justificativa do método é obrigatória**; com cotação direta, também a **justificativa da escolha dos fornecedores**. Com menos de 3 preços válidos num item, a tela pede a justificativa (IN SEGES 65/2021). **Publicação prevista** é a base do alerta de validade.
- **Emitir mapa e certidão** (só com tudo pronto): aplica o método em cada item, gera o **mapa** (o documento da pesquisa já existente) e a **certidão de pesquisa** (parâmetros consultados, inclusive sem retorno, cotações, método, justificativas e valor). O valor de referência passa para os itens do processo.
- **Consultar PNCP de novo** roda os agentes de pesquisa (PNCP e Painel de Preços). O detalhamento por item (agentes, CSV da Fonte de Preços, cotações por fonte, estatística, outliers) fica em **Pesquisa detalhada por item**, na mesma tela.

**Feita fora (decisão do órgão: basta anexar o mapa e digitar o valor):** anexe o PDF do mapa em **Anexar feito fora** e digite o **valor unitário de cada item** — o PNCP exige o valor por item. **Gravar valores nos itens** atualiza o valor do processo.

No painel ao lado: **Limite e fracionamento (art. 75, §1º)** (dispensa) — por exemplo, "98,4% de R$ 62.725,59 — Dec. 12.343/2024", amarelo acima de 80% e vermelho acima de 100% —, e os **Avisos desta etapa** (validade, escolha dos fornecedores, sigilo, parâmetro não registrado).

> **Portão A — limite e fracionamento.** Se a soma das dispensas do órgão no exercício, no mesmo ramo (classe CATMAT/CATSER e unidade gestora), com o valor desta pesquisa passar do limite do inciso, o sistema **recusa emitir o mapa e a certidão** (e o ato "Concluir pesquisa de preços"), mostrando a soma e o limite. Na pesquisa feita fora, o valor digitado nos itens é gravado, mas a etapa da pesquisa **não conclui** (a reserva e a autorização não abrem) e nasce a tarefa "Conformidade (LIM-01)" para quem cuida da pesquisa. Acima de 80% do limite, só atenção (LIM-02). Reveja o objeto e as quantidades ou adote a licitação.

### 5. Reserva orçamentária

- **Dotação orçamentária:** escolha na tabela do órgão; aparecem unidade orçamentária, programa, projeto/atividade, elemento de despesa e fonte. Sem dotação cadastrada, **Cadastrar dotação** abre o cadastro rápido.
- **Distribuição por exercício:** uma linha por exercício, com o valor, o saldo na dotação e a situação — **Reservar agora** (exercício corrente) ou **Previsão — confirmar na LOA** (exercícios seguintes). Um contrato de 12 meses cruza o ano (ex.: 2025 R$ 6.021,12 + 2026 R$ 55.732,32). O total é comparado com o valor estimado da pesquisa.
- **Declarações:** adequação à LOA, LDO e PPA; compatibilidade com os arts. 15, 16 e 17 da LRF. **Leis** (LDO obrigatória, LOA e PPA) escolhidas da **tabela única** de leis — despacho, informação orçamentária e parecer citam sempre o mesmo número. **+ cadastrar LDO/LOA/PPA** abre o cadastro rápido.
- **Emitir e reservar saldo** (com dotação, LDO e declarações) gera a **informação orçamentária** (peça DO) pelo modelo, com a tabela por exercício, e o PDF. A etapa conclui. **Devolver sem saldo** registra que não há dotação suficiente, com o motivo.
- Emitida, a informação não se edita: **Retificar** cria uma versão nova (com motivo) para corrigir a classificação; a anterior fica em **Versões anteriores**.
- **Renovar dotação (virada do exercício):** se o contrato não foi assinado até 31/12, informe o novo exercício e o motivo. O sistema cria a **versão nova** — o valor do exercício encerrado passa para o novo, tudo volta a previsão e a dotação/LDO do novo ano são sugeridas quando existem — e a **tarefa "Renovar a informação orçamentária"** para a Contabilidade (no modo simples, para o agente). A tarefa conclui quando a nova versão é emitida, ou quando a informação feita fora é anexada (o anexo é aceito mesmo depois da divulgação enquanto a renovação estiver pendente).

### 6. Autorização da autoridade

A tela tem duas visões:

- **Para quem assina** (a autoridade, ou cada membro da Mesa Diretora): um cartão no formato do celular, com o objeto, o **teto autorizado** (o valor estimado da pesquisa), a modalidade e o fundamento, a dotação, o requisitante e as peças do art. 72 conferidas pelo sistema ("DFD, TR, PP, DO — completos"). **Ler os documentos (N folhas)** abre os autos em PDF. Os botões:
  - **Autorizar e assinar** — assina com o seu usuário. A data e a hora entram no despacho;
  - **Devolver com observação** — o despacho volta ao agente com o motivo (obrigatório). O pedido de assinatura é cancelado e o agente recebe a tarefa "Autorização devolvida — corrigir e reenviar", com o motivo.
- **Para o agente:**
  - **Gerar despacho** monta o texto pelo modelo, lendo o processo: número, objeto, fundamento legal, teto, dotação e leis da reserva, e o nome da autoridade;
  - **Enviar à autoridade** manda o despacho para os signatários da configuração do órgão (Configurações › Fase interna › Autorização). A autoridade pode ser **colegiada** (ex.: Mesa Diretora com 4 signatários): a autorização **só vale quando todos assinarem**. Antes disso, o despacho aparece como "aguardando as assinaturas" e **não conta** como peça pronta.

O quadro **Instrução do art. 72 (portão B)** mostra se as peças exigidas para autorizar estão prontas: I (DFD e, se for o caso, ETP, riscos e TR), II (pesquisa) e IV (dotação). III (parecer), VI e VII (razão da escolha e preço) vêm depois.

> **Portão B — bloqueia.** Enquanto faltar peça dos incisos I, II ou IV (feita, anexada ou "não se aplica"), ou o limite da dispensa estourar no ramo, o despacho **não vai para a autoridade**, **não é assinado** e o despacho assinado fora **não é anexado**. A tela mostra em vermelho o que falta.

O despacho assinado fora (Mesa em papel) entra por **Anexar feito fora** e conta como autorizado. Na mesma tela fica a **designação do agente** (portaria do órgão).

> **Só o signatário designado assina.** Quem não está na lista recebe "Você não é signatário desta peça".

### 7. Relatório do agente e minutas

Três abas: **Relatório do agente** (enquadramento, justificativa do preço, razão da escolha), **Minuta do aviso** e **Minuta do contrato** (cláusulas do art. 92).

- **Gerar as três pelo modelo**: as peças leem **sempre os dados do processo**: número do PA e da dispensa, fundamento legal, limite do inciso no exercício, valores, dotação, sigilo e a portaria de designação do órgão. Uma minuta nunca herda o número de outro processo (no PA 139/2025, o contrato citava o "PA 115/2025").
- Se a peça cita o número de outro processo, a tela mostra um aviso vermelho.
- **Mudar o fundamento** (Editar processo › Classificação), o número do processo, o sigilo ou o objeto **regera sozinho** as peças geradas pelo modelo que ninguém editou. A peça editada à mão, assinada ou em assinatura **não é reescrita**: ela ganha o aviso "O processo mudou… Regerar?". O botão **Regerar** atualiza o texto.
- **Sigilo do orçamento (art. 24)**: escolha "Público" ou "Sigiloso até o julgamento". O sigilo exige justificativa. Com o sigilo, a minuta do aviso diz "Valor estimado: sigiloso (art. 24)".
- Cada peça tem o editor por seções, **Anexar feito fora**, **Não se aplica** (contratação direta) e **Versões**.

### 7. Parecer jurídico com diligências

À esquerda ficam **os autos**: as peças na ordem das folhas, cada uma abrindo no texto ou no PDF. À direita fica o **roteiro de análise**:

| Item | O que o sistema confere sozinho |
|---|---|
| Art. 72, I, II, IV, VI e VII, VIII | As peças da instrução estão prontas |
| Art. 75 | O mesmo inciso em todas as peças — as feitas no sistema e o texto dos PDFs anexados (ex.: "art. 75, I" no aviso e "II" no processo = atenção) |
| Art. 41, I | Marca citada no ETP ou no TR, e a justificativa |
| Art. 24 | Sigilo do orçamento com justificativa |
| Art. 92 | Cláusulas obrigatórias preenchidas na minuta do contrato |
| Vinculação | As peças citam o número deste processo (nunca o de outro, como o "PA 115/2025") |

A conferência automática é a do **motor de conformidade** (a mesma da tela da etapa 8): o roteiro mostra o que ele encontrou.

- A Procuradoria pode marcar cada item (**Conforme**, **Ressalva**, **Não se aplica**, **Pendente**) e escrever uma observação. A marcação vale sobre a conferência automática.
- Clicar num item ou numa diligência **abre a peça na folha** (e destaca o trecho, quando informado).
- **Devolver com diligência**: escolha a peça, descreva o que corrigir e, se quiser, o item do roteiro e o trecho. O sistema:
  - cria a **tarefa** do responsável pela peça (no modo por setor, o setor dela; no simples, o agente);
  - o processo "volta" para aquela peça **sem desfazer nada**: a autorização e as demais peças assinadas depois continuam assinadas.
- **Sanar**: quem responde pela peça a corrige (versão nova, feita aqui ou anexada) e clica em **Sanar**, com a resposta. Se não houver o que mudar, marque "Não há o que alterar" e explique. O processo **volta para a Procuradoria** (tarefa "Diligência sanada — retomar a análise"). A Procuradoria pode **reabrir** a diligência sanada ou **cancelar** a aberta.
- **Conclusão**: **Favorável** (não sai com diligência aberta), **Favorável, condicionado ao saneamento das ressalvas** ou **Desfavorável** (exige a fundamentação). **Assinar parecer** monta o texto a partir do roteiro, das diligências e da conclusão, e o assina com o usuário do procurador. A tarefa do parecer conclui.
- **Só quem tem o papel Jurídico** (Configurações › Fase interna › Papéis) abre diligência e assina o parecer. Os demais acompanham, e o parecer feito fora pode ser anexado.
- **Parecer da fase externa** (parecer nº 2): no link "parecer da fase externa" da tela. Ele fica disponível depois da sessão (julgamento, habilitação ou recurso) e antes da adjudicação. **Pedir o parecer** cria a tarefa da Procuradoria. O roteiro confere o parecer prévio, o julgamento, o preço vencedor, a habilitação e os recursos.

### Controle interno (quando o órgão ativou)

A tela aparece entre o parecer e a publicação. Nela, a manifestação é **Favorável** ou **Com apontamentos** (os apontamentos são obrigatórios). **Assinar manifestação** gera a peça e a assina com o usuário de quem tem o papel **Controle interno**. A manifestação feita fora também pode ser anexada. Por enquanto a etapa é **aviso**: não impede a publicação — sem a manifestação, o checklist antes de publicar mostra a linha amarela **Manifestação do controle interno** (com o link **Abrir o controle interno**) e a tela da conformidade repete o aviso. Com o controle interno desativado, a tela informa que a etapa não se aplica.

### 8. Conformidade e publicação (portão C)

Antes de publicar, o **motor de conformidade** cruza todas as peças dos autos entre si — as feitas no sistema e o texto dos PDFs anexados (o PDF digitalizado, sem texto, não é lido: confira no papel). A tela (`/orgao/processos/<id>/fase-interna/conformidade`) mostra:

- no alto, a contagem: **bloqueios**, **atenções** e **regras aprovadas**; **Revisar agora** roda a conferência na hora (ela também roda sozinha a cada peça salva e antes dos atos protegidos);
- cada **achado**, com a descrição, as **evidências** (peça e folha — clique para abrir a peça na folha, com o trecho em destaque) e a ação: **Corrigir peça** (leva à tela da peça), **Justificar** (atenção) ou **Abrir**;
- ao lado, o quadro do **aviso** (veja "Publicar pela tela da conformidade", abaixo); o botão **Publicar — resolva N bloqueios** fica desabilitado até não sobrar nenhum;
- o quadro das **assinaturas** de cada peça (assinada, anexada, sem data, faltam assinaturas) e as **justificativas** registradas.

| Regra | O que confere | Efeito |
|---|---|---|
| LIM-01 / LIM-02 | Soma das dispensas do órgão no exercício, no mesmo ramo, dentro do limite do inciso / acima de 80% | Bloqueio (portão A) / atenção |
| A72-I, II, IV | Peças do art. 72 antes de autorizar | Bloqueio (portão B) |
| A72-III, VII, VIII | Parecer, justificativa de preço e autorização antes de publicar | Atenção / atenção / bloqueio |
| ENQ-01 | O mesmo inciso do art. 75 em todas as peças e no fundamento legal | Bloqueio |
| VINC-01 | Peça (despacho, informação orçamentária, relatório, minutas, parecer) que cita o número de outro processo | Bloqueio |
| MARCA-01 | Marca sem "apenas como referência/ou similar" e sem justificativa / marca "ou similar" | Bloqueio / atenção que exige justificativa |
| PRECO-01 | Valor estimado igual a uma única cotação, sem média/mediana e sem justificativa do método | Atenção que exige justificativa |
| PRECO-02 / PRECO-03 | Cotação que vence antes da publicação / emitida há mais de 6 meses | Atenção |
| CRONO-01 | Peça datada antes da peça que a pediu (ex.: informação orçamentária antes da pesquisa) | Atenção |
| LEI-01 | LDO, LOA e PPA com números diferentes no despacho, na informação orçamentária e no parecer | Atenção |
| EXERC-01 | Reserva de um exercício com a publicação ou o contrato no seguinte | Atenção + tarefa "renovar a dotação" para a Contabilidade |
| DUP-01 | A mesma peça juntada duas vezes com textos diferentes | Atenção |
| ASS-01 | Peça sem data ou com assinaturas faltantes | Bloqueio |
| PRAZO-01 | Janela de propostas abaixo do mínimo de dias úteis (3 na dispensa) | Bloqueio (conferido de novo com as datas ao publicar) |
| MINUTA-DESAT, SIGILO-01, ART92-01 | Minuta desatualizada, sigilo sem justificativa, cláusula do art. 92 vazia | Atenção |

- **Bloqueio** não se justifica: corrija a peça (versão nova, feita aqui ou anexada) — o achado se resolve sozinho na revisão seguinte. Cada bloqueio aberto vira uma **tarefa** ("Conformidade") para quem responde pela peça, que conclui quando o achado se resolve.
- **Atenção** pode ser **justificada** (texto obrigatório; a justificativa vai para os autos). As que exigem justificativa (marca "ou similar", estimativa por uma única cotação) impedem a publicação até serem justificadas.
- **Não é possível publicar com bloqueio aberto.** O checklist de publicação da tela do processo ganhou a linha **Conformidade das peças (portão C)**, e o **Publicar** recusa com o que falta e onde (peça e folha). O quadro **Fluxo da fase interna** do processo mostra o resumo dos achados.
- **Processo já publicado:** a conferência fica como estava na publicação — nada do que já foi feito é travado.

#### Publicar pela tela da conformidade (etapa 8)

Na **dispensa eletrônica** a publicação é feita na própria tela da conformidade — é o mesmo ato **Publicar** do processo (com o portão C, os itens, o aviso e o prazo conferidos de novo):

1. **Fim do recebimento de propostas** — já vem com a data mínima (3 dias úteis — art. 75, §3º —, contados no calendário do órgão); o painel mostra os dias úteis e os feriados que não contam. O início é a confirmação da publicação pelo PNCP.
2. **Gerar aviso (PDF)** e **Conferir aviso vN** — o aviso de contratação direta diz se a dispensa tem **etapa de lances de 6 a 10 horas (IN 67)** ou é **sem disputa de lances, apenas cadastro de propostas (regulamento do órgão)**, conforme a configuração do órgão (parte [01](01-configuracao-do-orgao.md#8-fase-interna-e-tarefas)).
3. **Publicar**. O modo da disputa fica gravado no processo nesse momento.

O quadro mostra ainda:
- **Disputa**: o modo (com ou sem etapa de lances) e a referência legal (IN 67 ou regulamento do órgão);
- **Canais**, cada um com a situação real: **PNCP** (envio automático ao publicar → na fila → publicado com o número de controle, ou o erro devolvido pelo PNCP), **sítio oficial** (o portal público, depois da confirmação), **Diário Oficial do órgão** (pendente até ser registrado) e **plataforma** (recebimento de propostas e, se houver, lances);
- o **aviso do controle interno**, quando a etapa está ativa e sem manifestação (não impede publicar).

Depois de publicar, a etapa 8 fica **em andamento** ("Aviso enviado — a etapa conclui quando o PNCP confirmar a publicação"); a tarefa da publicação continua aberta. Quando o PNCP confirma (ou, no órgão sem PNCP, quando o Diário Oficial é registrado), a etapa 8 fica **concluída** e a tarefa se fecha, em nome de quem publicou.

**Diário Oficial.** O quadro **Diário Oficial** registra a publicação no diário do órgão: **número/edição**, **data**, **página**, link (opcional) e a **página do diário em PDF** (opcional — entra nos autos, com folhas). O registro vira a peça **Publicação no Diário Oficial** dos autos; registrar de novo cria versão nova. No **órgão sem integração com o PNCP**, esse registro **é a divulgação oficial** (art. 176, parágrafo único): o prazo corre da data informada e a etapa 8 conclui. Antes de publicar, o registro é recusado.

Nas demais modalidades (edital), o botão leva ao cartão **Publicar edital** da tela do processo (parte [03](03-publicacao-e-prazos.md#publicar-o-edital)).

#### Autos do processo em PDF

O botão **Gerar autos (PDF)** (no cabeçalho do processo e na tela da conformidade) monta os autos como os do papel:

- **capa** (órgão, processo administrativo, número da dispensa ou licitação, objeto, interessado — a unidade requisitante do DFD — e a data de autuação), **termo de abertura** e **índice** (peça, folhas, data do documento, origem — gerada, assinada, anexada —, signatários e "substitui a versão X");
- as peças na **ordem lógica dos autos**, não na ordem das datas: DFD, ETP e riscos, TR, pesquisa (mapa e certidão), informação orçamentária, despacho de autorização, portaria de designação, relatório do agente, minuta do aviso, minuta do contrato, parecer, controle interno, **termo de justificativas** (os achados de atenção justificados na conformidade e as peças "não se aplica"), aviso publicado, **registro das publicações** (PNCP, Diário Oficial, sítio) e a página do Diário Oficial; depois da sessão, a ata, os documentos da fase externa (resultado, parecer nº 2, adjudicação, homologação) e os contratos; por fim o **termo de encerramento**;
- peça **anexada** entra com as páginas reais do PDF; peça feita aqui, com o PDF gerado ou assinado; **versões substituídas não entram**;
- **carimbo "Fl. 000123"** no canto superior direito de todas as folhas, em numeração contínua.

A montagem roda **em segundo plano** (um processo por vez): o botão acompanha e baixa o PDF quando fica pronto; se você sair da tela, chega a notificação "Autos em PDF prontos". Se nada mudou nas peças, o mesmo PDF é entregue na hora (sem montar de novo).

> **Folhas.** A folha dada na juntada da peça é provisória; ao montar os autos, **o PDF é a fonte**: cada peça passa a mostrar as folhas que tem nos autos (tela do parecer, conformidade, índice). Por isso as folhas citadas numa evidência antiga podem mudar depois da montagem — confira a peça pelo índice.

> **Tramitação.** O despacho formal entre setores (estilo SEI) fica na aba **Tramitação** da tela do processo. O antigo "dossiê da fase interna" (`/orgao/fase-interna/processos/<id>`) e as telas avulsas do editor (DFD, ETP, TR) e de preços agora redirecionam para as telas acima.

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
| Minuta do aviso de contratação direta | Conforme o caso | Art. 72 c/c art. 75, §3º |

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

Quando a autoridade é colegiada (ex.: Mesa Diretora com 4 assinaturas), a peça feita no sistema é enviada para assinatura de **vários usuários do órgão, cada um com o seu papel** (Presidente, Vice-Presidente, 1º Secretário...). A peça aparece como **aguardando assinaturas** e **só conta como pronta quando todos assinarem**; nesse momento o sistema grava a data (a da última assinatura), o código do arquivo assinado e as folhas. Cada signatário assina pelo **Portal de assinaturas** (menu Assinaturas pendentes). Para enviar, use **Enviar para assinatura** no quadro da peça, na tela da etapa: marque os usuários e escreva o papel de cada um. Na **autorização**, os signatários vêm da configuração do órgão e cada um assina na própria tela da etapa (**Autorizar e assinar**, pensada para o celular).

## Fundamento legal e limite da dispensa

- O **fundamento legal** do processo (ex.: "art. 75, II — dispensa por valor; art. 74, III, 'c'; art. 75, VIII — emergência") é escolhido em **Editar dados › Classificação › Fundamento legal**. As opções dependem da modalidade. Esse campo é a **fonte única**: vai para o PNCP (amparo legal), para as peças geradas por modelo e para o aviso de contratação direta. Trocar a modalidade devolve o fundamento ao padrão dela.
- **Limites da dispensa por valor** (art. 75, I e II) são **por exercício**, com o decreto de cada ano: 2023 — Dec. 11.317/2022 (R$ 114.416,65 / R$ 57.208,33); 2024 — Dec. 11.871/2023 (R$ 119.812,02 / R$ 59.906,02); 2025 — Dec. 12.343/2024 (R$ 125.451,15 / R$ 62.725,59); 2026 — Dec. 12.807/2025 (R$ 130.984,20 / R$ 65.492,11). O administrador da plataforma cadastra o exercício seguinte quando sai o decreto; enquanto não cadastra, vale o do último ano, marcado como provisório.
- Na dispensa por valor, a etapa atual mostra o **consumo do limite**: quanto o órgão já contratou no exercício, no mesmo ramo (classe do código CATMAT/CATSER) e na mesma unidade gestora — por exemplo, "98,4% de R$ 62.725,59 — Dec. 12.343/2024". Acima de 80% o quadro fica amarelo; acima de 100%, vermelho (art. 75, §1º — fracionamento). Acima de 100% é **bloqueio** (portão A): a pesquisa não conclui, a autorização não sai e o processo não é publicado.

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
