# 05 — Dispensa e inexigibilidade (contratação direta)

A contratação direta não passa pelo rito completo de licitação, mas exige a **instrução do processo** (art. 72). Na **dispensa eletrônica** (art. 75, §3º; IN SEGES 67/2021 — e não a IN 73, que trata da licitação) há ainda a divulgação de um aviso no PNCP, prazo de propostas, etapa de lances, julgamento e negociação com o vencedor. Tudo é feito na **tela do processo** (desenho descrito na parte [03](03-publicacao-e-prazos.md#a-tela-do-processo)): a barra de etapas da dispensa é **Planejamento › Fase interna › Publicação › Propostas/lances › Julgamento › Habilitação › Homologação › Contrato** (na dispensa não há recurso), e a área **Etapa atual** muda conforme o ponto em que o processo está.

## Dispensa eletrônica — passo a passo

### 1. Criar o processo

Pela demanda aprovada (**Iniciar contratação** › **Dispensa Eletrônica**) ou pelo **Novo processo** escolhendo **Dispensa Eletrônica** (veja a parte [02](02-fase-interna-e-criacao.md)). Na dispensa, o critério fica fixado em **Menor Preço** e o modo em **Aberto**.

> **Atenção — limite de valor.** Se o valor estimado passar do limite vigente da dispensa (art. 75, I para obras e serviços de engenharia; art. 75, II para compras e demais serviços), a etapa atual mostra um alerta: "excede o limite vigente de dispensa... Verifique o enquadramento legal." Os limites são mantidos em **Configurações** › **Parâmetros de licitação** › **Limites legais**.

### 2. Instrução (art. 72)

Na fase interna, a **Etapa atual** mostra o **checklist antes de publicar** — Instrução do processo (DFD, estimativa de despesa e peças "se for o caso"), **Autorização da autoridade competente (art. 72, VIII)**, **Aviso de contratação direta (PDF)**, **Itens com quantidade, unidade e valor estimado** e o vínculo com o **PCA** (recomendado; não bloqueia) —, cada pendência com o botão que resolve (**Abrir fase interna**, **Gerar aviso**, **Cadastrar itens**, **Vincular ou justificar**). Logo abaixo fica o quadro **Peças da instrução (art. 72)**:

1. Complete os obrigatórios: **Formalização da demanda (DFD)**, **Estimativa de despesa (pesquisa de preços)** e **Autorização da autoridade competente** — e os **itens** (pelo menos um com quantidade e valor estimado; sem eles a instrução não conclui e o aviso não é divulgado). No assistente, ETP, riscos, TR, dotação, aviso e parecer são **facultativos** (Pular etapa ou Não se aplica — justificar).
2. Para os demais (ETP, TR, riscos, parecer, compatibilidade orçamentária, justificativa da contratação direta), elabore ou marque **não se aplica** com justificativa.
3. Se quiser ajuda, clique em **Preparar automaticamente (copiloto)**.
4. Quando tudo estiver pronto, conclua a instrução pelo botão principal (abaixo) — ou, sem divulgar ainda, por **Mais ações** › **Concluir instrução (art. 72)**.

### 3. Divulgar o aviso

1. Clique em **Gerar aviso e divulgar** (o botão principal do checklist; fica desabilitado enquanto houver pendência, com o número de pendências e o motivo escritos).
2. Na janela **Divulgar aviso da dispensa**, o campo **Receber propostas até** já vem com a data mínima sugerida: "Mínimo de 3 dias úteis a partir de agora (art. 75, §3º), descontados os feriados do órgão".
3. Clique em **Gerar aviso (PDF)** e depois em **Conferir aviso vN**. O aviso de contratação direta é **gerado pelo sistema e guardado no processo** (versão e código de integridade). Sem ele, a divulgação é recusada com a pendência "Gere o aviso de contratação direta (PDF)".
4. Confira o painel de prazos e clique em **Divulgar agora**.

A divulgação conclui a instrução e envia ao **PNCP** o aviso guardado (a versão divulgada é gerada de novo com o cronograma final; as anteriores ficam como histórico). O processo fica em **Aguardando publicação no PNCP**: **o prazo de 3 dias úteis só corre da divulgação no PNCP** (IN SEGES 67/2021, arts. 6º, parágrafo único, e 7º). Quando o PNCP confirma, o processo passa a **Recebendo propostas**; se a confirmação atrasar, o fim do recebimento é estendido até o mínimo legal (fica no histórico e você recebe uma notificação). Se o PNCP recusar, o alerta vermelho no topo mostra o código e a mensagem do PNCP e o que corrigir — veja a parte [03](03-publicacao-e-prazos.md#aviso-não-publicado-no-pncp).

> **Atenção.** Data anterior ao mínimo legal é recusada, com a data mínima indicada. Antes da confirmação do PNCP o fornecedor não consegue enviar proposta.

### 4. Recebimento de propostas

A etapa atual passa a **Recebimento de propostas e avisos aos fornecedores**: mostra só a **quantidade** de propostas recebidas e o quadro de **avisos** do órgão (item 6).

> **Atenção — sigilo.** Enquanto o prazo está aberto, ninguém vê **quem propôs nem os valores** — nem o órgão (Lei 14.133/2021, art. 13, parágrafo único, I; IN SEGES 67/2021, art. 13). O servidor nem envia esses dados à tela: o cartão **Propostas** e a aba **Propostas** mostram só o número.

Na dispensa **não há impugnação nem pedido de esclarecimento formal** (a IN SEGES 67/2021 não prevê; o art. 164 da Lei trata do edital de licitação): a comunicação é pelas **mensagens do sistema** (IN 67, art. 10 — item 6 abaixo). Por isso, na coluna lateral o bloco é **Mensagens e avisos** (e não "Impugnações e esclarecimentos").

### 5. Etapa de lances (IN SEGES 67/2021, art. 11)

Depois do fim do prazo de propostas vem a etapa de lances — **obrigatória antes do julgamento** (art. 15):

1. Na etapa atual, clique em **Abrir etapa de lances**.
2. Informe a **Duração (minutos)** — de 360 a 600 (6 a 10 horas); padrão 360.
3. Informe a **Prorrogação automática (minutos)**: "Lance nos últimos N minutos prorroga a janela por mais N, sucessivamente. 0 = encerra no horário (padrão IN 67)."
4. Clique em **Abrir lances**.

Durante a janela, a tabela mostra por item o **Menor valor atual** e o número de lances, atualizando sozinha. Os fornecedores dão lances pela sala deles; cada um só reduz o **próprio** valor e o menor valor aparece de forma anônima (os fornecedores não são identificados — art. 13).

### 6. Mensagens do processo (IN SEGES 67/2021, art. 10)

As mensagens ficam registradas no processo. As regras mudam com a fase (o servidor decide; o quadro mostra o nome do modo e a explicação):

| Fase | Órgão | Fornecedor |
|---|---|---|
| Aguardando publicação no PNCP | fechado | fechado |
| Prazo de propostas | **aviso formal**: **Assunto** + texto (mínimo 20 caracteres) | quem já enviou proposta pode perguntar; aparece sem identificação para os demais (sigilo até a abertura) |
| Etapa de lances | mensagens | com proposta válida; sem identificação (art. 13) |
| Fim do prazo / lances encerrados, antes do julgamento | mensagens | não envia |
| Depois do julgamento — **negociação** (art. 16) | escolhe em **Negociar com…** o vencedor | só o **vencedor**; os demais fornecedores **não leem nem escrevem** (sem acompanhamento) |
| Homologada | encerrado | encerrado |

Se o vencedor for desclassificado, use **desclassificar** + **Rejulgar**: a negociação segue com o próximo classificado, na ordem. O registro da negociação integra a **ata** anexada aos autos (art. 16, §2º) — antes da homologação só o órgão vê a ata com a negociação.

### 7. Julgar

1. Depois do fim do prazo de propostas e do encerramento da etapa de lances, clique em **Julgar propostas (menor preço)** na etapa atual. Enquanto não puder, o botão fica desabilitado e o motivo aparece escrito logo abaixo (vem do servidor).
2. O sistema adjudica, por item, o menor valor final (proposta ou lance). Havendo empate, aplica os critérios do art. 60 e, persistindo, **sorteio auditável** no próprio ato.
3. Se precisar tirar uma proposta, use **desclassificar** na linha dela (motivo obrigatório) e depois **Rejulgar (menor preço)**.

Depois do prazo, a tabela **Classificação por item** mostra, por item, cada fornecedor na ordem do valor final (proposta ou lance — a mesma regra do julgamento) e, depois de julgar, marca o vencedor. Julgado, a etapa atual vira **Julgamento e negociação com o vencedor** (a negociação é pelo quadro de mensagens, privada — art. 16) e aparece o link **Ata da sessão (PDF)**, gerada automaticamente dos registros (propostas, lances, mensagens e resultado).

> **Diferenças em relação ao pregão:** na dispensa não há etapa de aceitação da proposta adequada, nem desempate ME/EPP, nem sala de habilitação e recursos, nem acompanhamento da negociação pelos demais. O valor adjudicado é a melhor oferta final do fornecedor × quantidade.

> **Deserta ou fracassada (IN SEGES 67/2021, art. 22).** Pelo menu **Mais ações** (antes de caberem, ficam em "Bloqueadas" com o motivo). Sem nenhuma proposta, depois do fim do prazo: **Declarar deserta**. Com propostas, mas nenhuma aproveitável (todas desclassificadas): **Declarar fracassada**. Na janela do ato escolha a **providência** — fracassada: I — republicar; II — prazo para adequação da proposta ou da habilitação; III — contratar pela proposta da pesquisa de preços (menor preço, com a habilitação exigida). Deserta: só I ou III. A providência fica no histórico. (A execução automática das opções II e III ainda não existe no sistema — é feita pelos atos seguintes do órgão.)

### 8. Homologar e contratar

1. O cartão **Resultado** aparece. Clique em **Homologar** (veja a parte [04](04-sessao-publica-pregao-concorrencia.md#8-adjudicação-e-homologação-art-71-iv)). Na dispensa, a adjudicação já foi feita no julgamento; o termo único sai na homologação.
2. O contrato é gerado automaticamente ("Aguardando Assinatura"), com o prazo de entrega da proposta do vencedor.
3. No quadro **Contratos e atas** da etapa atual, clique em **Gerar termo e colher assinaturas**.
4. Quando todos assinarem, o contrato é publicado no PNCP.

### PNCP na dispensa

A aba **PNCP** mostra a tabela **Envios ao PNCP** — cada registro com a situação, o retorno da API (código e mensagem), as tentativas e **Reenviar agora** (veja a parte [11](11-pncp.md)); enquanto o aviso aguarda o PNCP, a mesma tabela aparece no checklist da etapa atual:

- publicação automática: aviso ao divulgar (a confirmação do PNCP abre o prazo); resultado ao homologar; contrato depois de assinado (art. 94 — 10 dias úteis na contratação direta);
- reenvio em caso de falha: **Reenviar ao PNCP** (checklist) ou **Reenviar agora** na linha do registro; na aba PNCP, **Enviar resultado** e **Enviar contratos**.
- aviso divulgado sem itens (processos anteriores à trava de itens): a fila não envia a compra e mostra "Compra não enviada ao PNCP: Cadastre pelo menos um item…" — o processo continua **Aguardando publicação no PNCP** (sem prazo). O checklist mostra a linha de itens em vermelho com **Cancelar publicação para corrigir** (o mesmo que **Mais ações** › **Cancelar publicação**): cadastre os itens e divulgue de novo.

## Inexigibilidade (art. 74)

1. Crie o processo escolhendo **Inexigibilidade** (pela demanda ou pelo assistente).
2. Complete a **instrução do art. 72** na tela do processo, como na dispensa. Inclua a justificativa da inexigibilidade e da escolha do contratado e do preço (art. 72, VI e VII).
3. Em **Mais ações**, clique em **Concluir instrução (art. 72)**.
4. Em **Mais ações**, clique em **Registrar resultado externo**. Na janela, para cada item escolha o **Fornecedor vencedor** (o contratado) e informe o **Vl. unitário (R$)**. Os campos de plataforma e número podem ficar vazios. Clique em **Salvar resultado**.
   - Fornecedor não aparece? "Cadastre-o primeiro" em **Gestão de Fornecedores** (dá para consultar pelo CNPJ) e reabra a janela.
5. No cartão **Resultado**, clique em **Homologar**. O contrato é gerado.
6. Colha as assinaturas como na dispensa.

> **Não disponível pela tela:** divulgação prévia própria da inexigibilidade (não há botão de divulgação para ela na tela do processo). Confira com a administração da plataforma a publicação no PNCP desses casos.

> Contratações por **credenciamento** também são inexigibilidade (art. 74, IV), mas seguem o painel próprio — parte [06](06-credenciamento.md).

## Seleção externa

Quando a disputa aconteceu em outra plataforma:

1. Use **Registrar resultado externo**, informando **Plataforma** (ex.: BLL, BNC, Compras.gov), **Nº na plataforma**, **Link (opcional)** e, por item, o vencedor e o valor unitário.
2. Homologue no cartão **Resultado**. O contrato é gerado e segue para a execução.

Enquanto não homologado, o botão vira **Editar resultado externo**. Para a BLL Compras, o cockpit também tem um cartão de troca de arquivos (integração BLL).
