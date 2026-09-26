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

> **Atenção — itens.** Sem pelo menos um item com quantidade e valor unitário estimado o processo **não conclui a fase interna nem publica** (todas as modalidades), e a compra não vai ao PNCP. No cockpit, o cartão **Itens da contratação** mostra os itens e, na fase interna, **Editar itens** (aba Itens da edição) e **Pesquisa de preços**.

Para leilão, concurso e diálogo competitivo, o assistente mostra também os campos próprios da modalidade (veja as partes [07](07-leilao.md), [08](08-concurso.md) e [09](09-dialogo-competitivo.md)). O credenciamento tem cadastro próprio no menu **Credenciamentos** (parte [06](06-credenciamento.md)).

> **Atenção — IA.** "Texto gerado por IA deve ser revisado pelo servidor responsável." A responsabilidade pelo conteúdo é sempre do servidor. Nada é publicado sem a sua validação.

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

Os atos aparecem no cartão **Atos do processo** do cockpit: **Concluir planejamento (ETP)**, **Aprovar termo de referência**, **Concluir pesquisa de preços**, **Registrar parecer jurídico**, **Concluir fase interna (autorização)**. Se precisar voltar, use **Devolver à etapa interna anterior**.

### Dispensa, inexigibilidade e credenciamento (contratação direta — art. 72)

A fase interna é uma **etapa única** chamada **instrução do processo**. No cockpit, na **Linha do tempo da contratação**, o bloco **Instrução do processo — contratação direta (Art. 72)** lista:

| Documento | Obrigatório? | Base |
|---|---|---|
| Formalização da demanda (DFD) | Sim | Art. 72, I |
| Estimativa de despesa (pesquisa de preços) | Sim | Art. 72, II c/c art. 23 |
| Autorização da autoridade competente | Sim | Art. 72, VIII |
| ETP, TR, análise de riscos | "Se for o caso" | Art. 72, I |
| Parecer jurídico | Conforme o caso | Art. 72, III c/c art. 53, §5º |
| Compatibilidade orçamentária | Conforme o caso | Art. 72, IV |
| Justificativa da contratação direta (razão da escolha e do preço) | Conforme o caso | Art. 72, VI e VII |

- O que não for obrigatório e não se aplicar pode ser marcado como **não se aplica**, com justificativa (fica nos autos). Para voltar atrás, **desfazer**.
- O link **abrir** leva ao documento no dossiê.
- O botão **Preparar automaticamente** chama o copiloto (pesquisa de preços em fontes reais e rascunhos dos documentos).
- Os sinais ao lado de cada item mostram: concluído, **não se aplica**, **em aprovação** (com a etapa e o responsável) ou **aguarda envio p/ aprovação**.

> **Atenção.** "Mínimo para divulgar: DFD, estimativa de despesa e autorização." Sem eles, o botão de divulgação fica desabilitado e, ao passar o mouse, mostra as pendências.

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

- **Classificação**: modalidade, critério de julgamento, modo de disputa, tipo de contratação, vínculo com o PCA, disputa **Por item** ou **Por lote**, **Inversão de fases** (só concorrência), tratamento ME/EPP (**Sem Benefício**, **Exclusivo para ME/EPP**, **Cota Reservada** até 25%) e o modo de aplicação (toda a licitação, por lote ou por item).
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

Quando há pendência de ME/EPP, o cockpit mostra, na **Linha do tempo da contratação**, um quadro de cotas e justificativa (o quadro some quando não há pendência):

- **Gerar cotas reservadas**: separa a cota (até 25%) de cada item/lote marcado como cota reservada. Só é possível antes de haver propostas.
- Itens de até R$ 80.000 **sem** exclusividade exigem a justificativa do art. 49 (mínimo 20 caracteres).

> **Atenção (LC 123, art. 48, I).** Item exclusivo para ME/EPP com valor estimado acima de R$ 80.000 **bloqueia a publicação** (na disputa por lote, vale o valor total do lote).

## Excluir um processo

Enquanto está na fase interna, o cockpit mostra **Excluir**. A exclusão é definitiva. Depois da publicação, use **Revogar** ou **Anular** (parte [03](03-publicacao-e-prazos.md)).
