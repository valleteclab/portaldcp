# 05 — Dispensa e inexigibilidade (contratação direta)

A contratação direta não passa pelo rito completo de licitação, mas exige a **instrução do processo** (art. 72). Na **dispensa eletrônica** (art. 75, §3º; IN SEGES 67/2021 — e não a IN 73, que trata da licitação) há ainda a divulgação de um aviso no PNCP, prazo de propostas, etapa de lances, julgamento e negociação com o vencedor. Tudo é feito no **cockpit do processo**, na **Linha do tempo da contratação**.

## Dispensa eletrônica — passo a passo

### 1. Criar o processo

Pela demanda aprovada (**Iniciar contratação** › **Dispensa Eletrônica**) ou pelo **Novo processo** escolhendo **Dispensa Eletrônica** (veja a parte [02](02-fase-interna-e-criacao.md)). Na dispensa, o critério fica fixado em **Menor Preço** e o modo em **Aberto**.

> **Atenção — limite de valor.** Se o valor estimado passar do limite vigente da dispensa (art. 75, I para obras e serviços de engenharia; art. 75, II para compras e demais serviços), o cockpit mostra um alerta: "excede o limite vigente de dispensa... Verifique o enquadramento legal antes de prosseguir." Os limites são mantidos em **Configurações** › **Parâmetros de licitação** › **Limites legais**.

### 2. Instrução (art. 72)

Na linha do tempo, etapa **Fase interna (documentos)**, bloco **Instrução do processo — contratação direta (Art. 72)**:

1. Complete os obrigatórios: **Formalização da demanda (DFD)**, **Estimativa de despesa (pesquisa de preços)** e **Autorização da autoridade competente** — e os **itens** (pelo menos um com quantidade e valor estimado; sem eles a instrução não conclui e o aviso não é divulgado). No assistente, ETP, riscos, TR, dotação, aviso e parecer são **facultativos** (Pular etapa ou Não se aplica — justificar).
2. Para os demais (ETP, TR, riscos, parecer, compatibilidade orçamentária, justificativa da contratação direta), elabore ou marque **não se aplica** com justificativa.
3. Se quiser ajuda, clique em **Preparar automaticamente** (copiloto).

### 3. Divulgar o aviso

1. Clique em **Divulgar aviso da dispensa** (fica desabilitado enquanto houver pendência).
2. Na janela **Divulgar aviso da dispensa**, o campo **Receber propostas até** já vem com a data mínima sugerida: "Mínimo de 3 dias úteis a partir de agora (art. 75, §3º), descontados os feriados do órgão".
3. Clique em **Gerar aviso (PDF)** e depois em **Conferir aviso vN**. O aviso de contratação direta é **gerado pelo sistema e guardado no processo** (versão e código de integridade). Sem ele, a divulgação é recusada com a pendência "Gere o aviso de contratação direta (PDF)".
4. Confira o painel de prazos e clique em **Divulgar agora**.

A divulgação conclui a instrução e envia ao **PNCP** o aviso guardado (a versão divulgada é gerada de novo com o cronograma final; as anteriores ficam como histórico). O processo fica em **Aguardando publicação no PNCP**: **o prazo de 3 dias úteis só corre da divulgação no PNCP** (IN SEGES 67/2021, arts. 6º, parágrafo único, e 7º). Quando o PNCP confirma, o processo passa a **Recebendo propostas**; se a confirmação atrasar, o fim do recebimento é estendido até o mínimo legal (fica no histórico e você recebe uma notificação). Se o PNCP recusar, o alerta vermelho no topo mostra o código e a mensagem do PNCP e o que corrigir — veja a parte [03](03-publicacao-e-prazos.md#aviso-não-publicado-no-pncp).

> **Atenção.** Data anterior ao mínimo legal é recusada, com a data mínima indicada. Antes da confirmação do PNCP o fornecedor não consegue enviar proposta.

### 4. Recebimento de propostas

Na etapa **Seleção (dispensa eletrônica)** o painel mostra "Recebendo propostas" e a quantidade recebida.

> **Atenção — sigilo.** "valores sigilosos até o fim do prazo": ninguém vê os valores (nem o órgão) enquanto o prazo está aberto.

Na dispensa **não há impugnação nem pedido de esclarecimento formal** (a IN SEGES 67/2021 não prevê; o art. 164 da Lei trata do edital de licitação): a comunicação é pelas **mensagens do sistema** (IN 67, art. 10 — item 6 abaixo).

### 5. Etapa de lances (IN SEGES 67/2021, art. 11)

Depois do fim do prazo de propostas vem a etapa de lances — **obrigatória antes do julgamento** (art. 15):

1. Clique em **Abrir fase de lances**.
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

1. Depois do fim do prazo de propostas e do encerramento da etapa de lances, clique em **Julgar propostas (menor preço)**. Enquanto não puder, o botão fica desabilitado e o motivo aparece escrito logo abaixo (vem do servidor).
2. O sistema adjudica, por item, o menor valor final (proposta ou lance). Havendo empate, aplica os critérios do art. 60 e, persistindo, **sorteio auditável** no próprio ato.
3. Se precisar tirar uma proposta, use **desclassificar** na linha dela (motivo obrigatório) e depois **Rejulgar (menor preço)**.

A tabela de itens passa a mostrar vencedor, valor unitário e total. O botão **Ata da sessão (PDF)** aparece no cabeçalho: "Ata da sessão gerada automaticamente dos registros (propostas, lances, chat e resultado)".

> **Diferenças em relação ao pregão:** na dispensa não há etapa de aceitação da proposta adequada, nem desempate ME/EPP, nem sala de habilitação e recursos, nem acompanhamento da negociação pelos demais. O valor adjudicado é a melhor oferta final do fornecedor × quantidade.

> **Deserta ou fracassada (IN SEGES 67/2021, art. 22).** Sem nenhuma proposta, depois do fim do prazo: **Declarar deserta**. Com propostas, mas nenhuma aproveitável (todas desclassificadas): **Declarar fracassada**. Na janela do ato escolha a **providência** — fracassada: I — republicar; II — prazo para adequação da proposta ou da habilitação; III — contratar pela proposta da pesquisa de preços (menor preço, com a habilitação exigida). Deserta: só I ou III. A providência fica no histórico. (A execução automática das opções II e III ainda não existe no sistema — é feita pelos atos seguintes do órgão.)

### 8. Homologar e contratar

1. O cartão **Resultado** aparece. Clique em **Homologar** (veja a parte [04](04-sessao-publica-pregao-concorrencia.md#8-adjudicação-e-homologação-art-71-iv)). Na dispensa, a adjudicação já foi feita no julgamento; o termo único sai na homologação.
2. O contrato é gerado automaticamente ("Aguardando Assinatura"), com o prazo de entrega da proposta do vencedor.
3. Na etapa **Homologação e contratos**, clique em **Gerar termo e colher assinaturas**.
4. Quando todos assinarem, o contrato é publicado no PNCP.

### PNCP na dispensa

Abaixo do painel da seleção há uma linha **PNCP** com a situação de cada envio (veja a parte [11](11-pncp.md)):

- publicação automática: aviso ao divulgar (a confirmação do PNCP abre o prazo); resultado ao homologar; contrato depois de assinado (art. 94 — 10 dias úteis na contratação direta);
- botões para reenvio em caso de falha: **Publicar aviso no PNCP** / **Reenviar aviso**, **Enviar resultado**, **Enviar contratos**.
- aviso divulgado sem itens (processos anteriores à trava de itens): a fila não envia a compra e mostra "Compra não enviada ao PNCP: Cadastre pelo menos um item…" — o processo continua **Aguardando publicação no PNCP** (sem prazo). Use **Cancelar publicação** no cockpit, cadastre os itens e divulgue de novo.

## Inexigibilidade (art. 74)

1. Crie o processo escolhendo **Inexigibilidade** (pela demanda ou pelo assistente).
2. Complete a **instrução do art. 72** no cockpit, como na dispensa. Inclua a justificativa da inexigibilidade e da escolha do contratado e do preço (art. 72, VI e VII).
3. Em **Atos do processo**, clique em **Concluir instrução (art. 72)**.
4. No cabeçalho do cockpit, clique em **Registrar resultado externo**. Na janela, para cada item escolha o **Fornecedor vencedor** (o contratado) e informe o **Vl. unitário (R$)**. Os campos de plataforma e número podem ficar vazios. Clique em **Salvar resultado**.
   - Fornecedor não aparece? "Cadastre-o primeiro" em **Gestão de Fornecedores** (dá para consultar pelo CNPJ) e reabra a janela.
5. No cartão **Resultado**, clique em **Homologar**. O contrato é gerado.
6. Colha as assinaturas como na dispensa.

> **Não disponível pela tela:** divulgação prévia própria da inexigibilidade (não há botão de divulgação para ela no cockpit). Confira com a administração da plataforma a publicação no PNCP desses casos.

> Contratações por **credenciamento** também são inexigibilidade (art. 74, IV), mas seguem o painel próprio — parte [06](06-credenciamento.md).

## Seleção externa

Quando a disputa aconteceu em outra plataforma:

1. Use **Registrar resultado externo**, informando **Plataforma** (ex.: BLL, BNC, Compras.gov), **Nº na plataforma**, **Link (opcional)** e, por item, o vencedor e o valor unitário.
2. Homologue no cartão **Resultado**. O contrato é gerado e segue para a execução.

Enquanto não homologado, o botão vira **Editar resultado externo**. Para a BLL Compras, o cockpit também tem um cartão de troca de arquivos (integração BLL).
