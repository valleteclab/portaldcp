# 03 — Publicação e prazos

Esta parte explica como publicar o edital de pregão, concorrência, leilão, concurso e diálogo competitivo, como o sistema calcula os prazos mínimos, como responder impugnações e esclarecimentos, como retificar o edital e como suspender, revogar ou anular.

> A dispensa eletrônica tem divulgação própria (botão **Divulgar aviso da dispensa**) — veja a parte [05](05-dispensa-e-inexigibilidade.md). O credenciamento também tem publicação própria — parte [06](06-credenciamento.md).

## A tela do processo

Tudo desta parte acontece na tela do processo (**Processos** › o processo). Ela tem o mesmo desenho em todas as modalidades — muda só a área da etapa atual, o menu de ações e as etapas:

1. **Alerta do PNCP** (vermelho ou amarelo), só enquanto a publicação não foi confirmada — veja "Aviso NÃO publicado no PNCP" abaixo.
2. **Cabeçalho**: modalidade e número, a fase e a situação reais, o objeto e a linha com fundamento legal, critério, unidade e data de criação. À direita: **Editar dados**, **Baixar processo (PDF)** (os autos completos) e **Mais ações**.
3. **Cinco cartões de resumo**: Situação, Prazo de propostas (contagem regressiva quando o prazo está correndo; "Não iniciado" antes da publicação confirmada), Propostas (durante o recebimento só a **quantidade** — quem propôs e os valores ficam em sigilo, Lei 14.133/2021, art. 13, parágrafo único, I), Valor estimado com o número de itens (em vermelho se não houver item) e PNCP.
4. **Barra de etapas**: as etapas da modalidade (a dispensa tem Planejamento, Fase interna, Publicação, Propostas/lances, Julgamento, Habilitação, Homologação e Contrato; o pregão e a concorrência têm também Disputa e Recurso). Verde = concluída, azul = atual, vermelho = com erro ou encerrada, amarelo = com alerta, cinza = futura; cada uma traz uma linha de detalhe.
5. **Etapa atual** (coluna principal): o que fazer agora — checklist antes de publicar, recebimento de propostas, julgamento, sessão, resultado, contratos. Embaixo, a **próxima etapa** em um quadro tracejado dizendo quando libera.
6. **Coluna lateral**: Dados da contratação (modalidade, fundamento, critério, valor, unidade, agente, autoridade, nº PNCP), Prazos (horário de Brasília; a data final é recalculada quando o PNCP confirma) e Comunicação (impugnações e esclarecimentos nas licitações; mensagens e avisos na dispensa).
7. **Abas**: Itens, Documentos (uma lista só, com as peças da fase interna e os documentos do processo, indicando a origem), Propostas, PNCP (cada envio, situação, retorno da API e tentativas) e Histórico.

### Menu "Mais ações"

O botão **Mais ações** abre um menu com duas partes: **Disponíveis agora** e **Bloqueadas** — cada ação bloqueada traz, em letra pequena logo abaixo, o motivo (ex.: "Aviso/edital ainda não publicado no PNCP — o prazo de propostas não começou; só depois do fim do prazo de propostas, sem nenhuma proposta"). Quem decide o que está disponível é o servidor, pelas mesmas regras que executam o ato. No menu ficam: Suspender/Retomar, Retificar edital, Cancelar publicação, Registrar resultado externo, Revogar, Anular, Declarar deserta, Declarar fracassada, os atos simples da fase (ex.: **Concluir instrução (art. 72)**, **Devolver à etapa interna anterior**, **Concluir processo**) e, na fase interna, **Excluir processo**. Dá para usar pelo teclado: setas para navegar, Enter para escolher, Esc para fechar.

## Publicar o edital

Na fase interna, a etapa atual mostra o **checklist antes de publicar** (documentos da fase interna, autorização da autoridade, edital, itens com quantidade e valor, vínculo com o PCA e, se houver, o tratamento ME/EPP), cada pendência com o botão que resolve (**Abrir fase interna**, **Anexar edital**, **Cadastrar itens**, **Vincular ou justificar**). O vínculo com o PCA é recomendação (amarelo) e não impede a publicação. O cartão **Publicar edital** aparece logo abaixo quando a fase interna está concluída (fase **Aprovação Interna**) e o processo está ativo.

1. **Edital (PDF)** — clique em **Anexar PDF do edital** e escolha o arquivo. O sistema mostra a versão, a situação e o código de integridade (hash). Até a publicação você pode **Substituir PDF**; depois, só por retificação.
2. **Natureza do objeto** — aparece quando o prazo depende dela: escolha **Comum** ou **Especial** (bens/serviços comuns ou especiais têm prazos mínimos diferentes — art. 55, I e II). No pregão o objeto é sempre comum.
3. **Cronograma** — preencha:
   - **Limite para impugnação (opcional)** — vazio: 3 dias úteis antes da abertura (art. 164);
   - **Início do recebimento de propostas** — vazio: a partir da publicação;
   - **Fim do recebimento de propostas**;
   - **Abertura da sessão pública**.
   O botão **Usar data mínima** preenche a menor data permitida.
4. Confira o painel de prazos: dias exigidos, fundamento legal, **data mínima**, e a lista "Sem expediente no período (não contam)" com os feriados considerados.
5. Clique em **Publicar edital**.

Ao publicar, o edital vai para a fila do PNCP. **A divulgação oficial é a do PNCP** (arts. 54 e 174 da Lei 14.133/2021): por isso o processo passa primeiro para **Aguardando publicação no PNCP** — ainda não é público, não recebe propostas e **o prazo não começou**. Quando o PNCP devolve o número de controle da compra, o sistema:

1. registra a **divulgação oficial** (data, meio e número de controle) no histórico, em nome de "Sistema (PNCP)";
2. **reconfere o cronograma pela data confirmada**: se a confirmação atrasou e o prazo mínimo (art. 55; na dispensa, 3 dias úteis — art. 75, §3º) deixou de ser respeitado, as datas são **estendidas** até o mínimo legal (mesmo horário, no N-ésimo dia útil). O prazo mínimo é piso: estender protege a isonomia e nunca encurta o prazo de ninguém. O ajuste fica no histórico, o órgão recebe uma notificação e a compra é retificada no PNCP;
3. passa o processo para **Publicado** e, se a data de início já chegou, para **Recebendo propostas**.

### Aviso NÃO publicado no PNCP

Se o PNCP recusar ou não responder, a tela mostra no topo o alerta **"Aviso NÃO publicado no PNCP — prazo não iniciado"** com o retorno real da API (código HTTP, mensagem, tentativas, última tentativa e a próxima tentativa automática) e as **pendências detectadas**. **Ver detalhes** abre a aba PNCP; **Corrigir pendências** leva ao checklist da etapa atual, que também mostra a tabela **Envios ao PNCP** (registro, situação, retorno da API e tentativas) e o botão **Reenviar ao PNCP** — desabilitado, com o motivo escrito, enquanto houver pendência:

- falha temporária (PNCP fora do ar, rede): o reenvio é automático; use **Reenviar agora** para não esperar;
- recusa por dado (ex.: item, unidade, datas): nada foi divulgado — use **Cancelar publicação**, corrija na fase interna e publique de novo.

> **Órgão sem integração com o PNCP** (municípios que ainda não o adotaram — art. 176, parágrafo único): o alerta traz os campos **Data da publicação no diário oficial** e **Referência (edição, página ou link)** e o botão **Registrar publicação oficial**. Os prazos correm dessa data. Órgão integrado não usa este registro: a confirmação vem do PNCP.

### Prazos mínimos de divulgação (art. 55)

O sistema conta os dias úteis a partir da divulgação e aponta a data mínima de abertura:

| Objeto / critério | Prazo mínimo |
|---|---|
| Bens — menor preço ou maior desconto | 8 dias úteis |
| Bens — demais critérios | 15 dias úteis |
| Serviços comuns e obras/serviços comuns de engenharia (menor preço ou maior desconto) | 10 dias úteis |
| Serviços especiais e obras/serviços especiais de engenharia | 25 dias úteis |
| Contratação integrada | 60 dias úteis |
| Contratação semi-integrada e demais casos | 35 dias úteis |
| Técnica e preço, melhor técnica ou conteúdo artístico | 35 dias úteis |
| Leilão (maior lance) | 15 dias úteis |
| Diálogo competitivo (fase de propostas de interesse) | 25 dias úteis (art. 32, §1º, I) |
| Dispensa eletrônica | 3 dias úteis (art. 75, §3º) |

Como a contagem funciona (art. 183):

- o dia da divulgação **não conta**; conta-se N dias úteis no calendário do seu órgão;
- a abertura pode ocorrer **a partir das 00:00 do N-ésimo dia útil**. Exemplo: divulgação na segunda-feira, dia 01, com prazo de 8 dias úteis e sem feriados → abertura a partir do dia 11;
- se houver mais de uma hipótese, vale o **maior** prazo;
- feriados nacionais, estaduais, municipais e pontos facultativos adotados pelo órgão não contam.

### O que bloqueia a publicação

Se algo estiver faltando, o botão mostra a mensagem "Pendências para ..." com a lista. As mais comuns:

| Pendência | Como resolver |
|---|---|
| Edital (PDF) não anexado | Anexe o PDF no passo 1 (obrigatório em pregão, concorrência, leilão, concurso e diálogo) |
| Natureza do objeto não informada | Escolha Comum ou Especial no passo 2 |
| Data de abertura antes da data mínima | Use **Usar data mínima** ou escolha uma data posterior |
| Datas fora de ordem | Início < fim do recebimento ≤ abertura; limite de impugnação antes da abertura e depois da divulgação |
| Documentos da fase interna | Conclua a fase interna (parte [02](02-fase-interna-e-criacao.md)) |
| "Cadastre pelo menos um item com quantidade e valor estimado" | Aba **Itens** da tela do processo › **Editar itens** (ou **Cadastrar itens** no checklist) (ou a pesquisa de preços, que preenche o valor). Vale para todas as modalidades — também para concluir a fase interna |
| Item exclusivo ME/EPP acima de R$ 80.000 | Retire a exclusividade ou ajuste (LC 123, art. 48, I) |
| Item até R$ 80.000 sem exclusividade e sem justificativa | Registre a justificativa do art. 49 |
| "Gere o aviso de contratação direta (PDF)" (dispensa) | No **Divulgar aviso da dispensa**, clique em **Gerar aviso (PDF)** e confira — parte [05](05-dispensa-e-inexigibilidade.md) |

### Cancelar a publicação (antes de propostas)

Publicou com erro (ex.: sem itens), o PNCP recusou, ou ainda não há propostas? Use **Mais ações** › **Cancelar publicação** (também na fase **Aguardando publicação no PNCP**; só o órgão dono; motivo obrigatório, fica no histórico). Com proposta recebida, o item aparece bloqueado com o motivo. A compra sai do PNCP — ou da fila, se ainda não tinha sido enviada — e o processo volta à fase interna (aprovação interna): corrija (itens, documentos) e publique de novo. Com proposta recebida, o caminho é revogar ou anular (abaixo).

## Impugnações e esclarecimentos

Depois da publicação, o bloco **Impugnações e esclarecimentos** da coluna lateral mostra quantos pedidos existem e quantos estão pendentes, com links para as telas de resposta.

> **Dispensa eletrônica:** não há impugnação nem pedido de esclarecimento formal — a IN SEGES 67/2021 não os prevê e o art. 164 da Lei trata do edital de licitação. A comunicação é pelas mensagens do sistema (IN 67, art. 10) — veja a parte [05](05-dispensa-e-inexigibilidade.md). O sistema recusa o pedido formal na dispensa.

**Prazo (art. 164):** qualquer pessoa pode impugnar ou pedir esclarecimento até **3 dias úteis antes da abertura** da sessão (ou até a data-limite do edital, se informada). Depois disso, os botões somem para o fornecedor. O prazo corre junto com o recebimento de propostas.

### Responder um pedido de esclarecimento

1. Na coluna lateral, bloco **Impugnações e esclarecimentos** › **Pedidos de esclarecimento** (tela `/orgao/processos/<id>/esclarecimentos`).
2. As abas mostram **Pendentes**, **Respondidos** e **Arquivados**.
3. Abra o pedido, escreva em **Sua Resposta** e envie. A resposta fica pública, sem identificar quem perguntou.
4. Se o pedido não merece resposta (ex.: duplicado), use **Arquivar esclarecimento**: "O pedido sai da lista de pendentes e não recebe resposta publicada."

### Decidir uma impugnação

1. Cartão **Impugnações e esclarecimentos** › **Impugnações** (tela `/orgao/processos/<id>/impugnacoes`).
2. Abra a impugnação: veja o texto, o item impugnado, a fundamentação e o documento anexado.
3. Escolha a **Decisão**: **Deferida**, **Parcialmente Deferida** ou **Indeferida**, e escreva a **Resposta**.
4. Se a decisão muda o edital, marque **Altera o Edital** e descreva as alterações.

> **Atenção.** Impugnação acolhida que **altera o edital** bloqueia o início da disputa (e o julgamento da dispensa) até que você faça a **retificação** do edital. A retificação marca a impugnação como atendida.

## Retificar o edital (art. 55, §1º)

Depois da publicação, a aba **Documentos** traz o quadro **Edital**, que mostra a versão **Vigente**, a data em que foi divulgada, o motivo das versões anteriores e quantos licitantes foram notificados.

É possível retificar enquanto o processo está em Publicado, Recebendo Propostas ou Análise de Propostas (ativo ou suspenso).

1. Use **Mais ações** › **Retificar edital** (ou o botão do quadro Edital). Fora das fases em que cabe, o item aparece bloqueado com o motivo.
2. Preencha **Motivo** (ex.: "acolhimento da impugnação nº 1 quanto à exigência de atestado") e **O que foi alterado** (itens/cláusulas, como estavam e como ficaram).
3. Anexe o **PDF da nova versão do edital**.
4. Responda **A alteração afeta a formulação das propostas?**
   - **Sim** — informe o **Novo cronograma** (fim do recebimento e abertura). O prazo é **reaberto integralmente** e conferido de novo pelo art. 55, contado da retificação. As propostas já enviadas ficam **aguardando confirmação do licitante**.
   - **Não** — explique **Por que não afeta as propostas?** (ex.: "correção de erro material no endereço do órgão"). As datas só podem ser mantidas ou adiadas.
5. Confirme. A nova versão vira a vigente, a anterior fica como "substituída" (histórico público), os licitantes são avisados e o PNCP recebe a retificação.

> **Atenção.** Quando a retificação afeta as propostas, o licitante que **não confirmar** a proposta até o novo fim do recebimento tem a proposta **cancelada** automaticamente. A sessão não abre enquanto houver proposta aguardando confirmação dentro do prazo.

> **Não disponível:** retificar **itens ou lotes** (há propostas vinculadas a eles). Para mudar o objeto é preciso revogar e publicar de novo.

## Suspender e retomar

No menu **Mais ações**:

1. Clique em **Suspender**, informe o motivo (obrigatório, fica no histórico) e confirme.
2. O processo fica com a situação **Suspensa**: sala, prazos de ME/EPP e resultado ficam parados.
3. Para voltar, clique em **Retomar**. O processo volta exatamente para a fase em que estava.

O PNCP é avisado da suspensão e da retomada automaticamente.

## Revogar ou anular — em dois tempos (art. 71, §3º)

Antes de revogar (interesse público — art. 71, II) ou anular (ilegalidade — art. 71, III), a lei exige ouvir os licitantes. Tudo começa em **Mais ações** › **Revogar** / **Anular**: o sistema abre a intenção (com licitantes a ouvir) ou o ato direto (sem ninguém a ouvir), conforme a regra do servidor. Com a intenção aberta, a etapa atual mostra o quadro **Intenção de revogar/anular em curso** (prazo, motivo, manifestações, **Desistir** e o botão do ato):

**1º tempo — intenção**

1. Em **Mais ações**, escolha **Revogar: registrar a intenção (art. 71, §3º)** (ou **Anular: …**) — os licitantes são notificados e o prazo de manifestação abre.
2. Escreva o **Motivo / fundamentação** (ex.: "Fato superveniente, razões de interesse público…" ou "Ilegalidade identificada (insanável)…").
3. Informe o **Prazo para manifestação** em dias úteis (de 1 a 30; padrão 3).
4. Confirme. Os licitantes são avisados e cada um pode se manifestar uma vez (e alterar até o fim do prazo).

Durante o prazo, o quadro mostra as **Manifestações dos licitantes**. Se desistir, use **Desistir** (com motivo): "O processo segue normalmente; a desistência fica registrada no histórico."

**2º tempo — o ato**

5. Depois do fim do prazo, o botão **Revogar** / **Anular** do quadro fica disponível (antes disso, o motivo aparece escrito embaixo).
6. Fundamente o ato e, se houver, responda às manifestações. Confirme.

Sem licitantes (nenhuma proposta ou inscrição), não há a quem ouvir: o menu mostra **Revogar (sem interessados a ouvir — art. 71, II)** / **Anular (… art. 71, III)** e abre direto o ato. O art. 71, §3º não tem exceção — por isso o próprio ato registra, com texto automático e auditável, que "não havia interessados a ouvir".

**Fundamentação obrigatória** (mínimo 10 caracteres): na **revogação**, o fato superveniente, devidamente comprovado, pertinente e suficiente (art. 71, §2º); na **anulação**, a indicação expressa dos atos com vício insanável (art. 71, §1º).

A situação passa a **Revogada** ou **Anulada** e o PNCP é atualizado automaticamente.

## Deserta e fracassada

- **Declarar deserta** só depois do fim do prazo de propostas e sem nenhuma proposta.
- **Declarar fracassada** só quando houve propostas mas nenhuma é aproveitável — todas desclassificadas, ou julgamento feito sem vencedor. Sem proposta nenhuma, o caso é de deserta.
- Quando todos os itens ficam desertos ou fracassados durante a sessão, o sistema faz isso sozinho.
- No menu **Mais ações** elas ficam em **Bloqueadas**, com o motivo escrito logo abaixo, até cumprirem as condições (a regra é do servidor — a tela só mostra).
- Na **dispensa**, escolha também a providência do art. 22 da IN SEGES 67/2021 — veja a parte [05](05-dispensa-e-inexigibilidade.md).

## Histórico do processo

A aba **Histórico** é uma tabela (Data/hora, Evento, Detalhe, Responsável) com cada ato praticado: quem (o nome do servidor, do órgão ou do fornecedor; atos automáticos aparecem como "Sistema (PNCP)", "Sistema (relógio)" ou "Sistema (ajuste de dados)"), quando (horário de Brasília), de qual fase para qual (com os nomes das fases, não os códigos) e o motivo — além de um resumo do que o ato registrou (cronograma estendido, manifestação prévia, providência do art. 22 da IN 67). As **falhas de integração com o PNCP** aparecem na mesma tabela ("Falha na publicação (PNCP)", com o código e a mensagem da API; responsável "Integração PNCP" — a fila guarda a última falha de cada registro). É o registro oficial da tramitação.
