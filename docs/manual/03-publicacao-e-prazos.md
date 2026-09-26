# 03 — Publicação e prazos

Esta parte explica como publicar o edital de pregão, concorrência, leilão, concurso e diálogo competitivo, como o sistema calcula os prazos mínimos, como responder impugnações e esclarecimentos, como retificar o edital e como suspender, revogar ou anular.

> A dispensa eletrônica tem divulgação própria (botão **Divulgar aviso da dispensa**) — veja a parte [05](05-dispensa-e-inexigibilidade.md). O credenciamento também tem publicação própria — parte [06](06-credenciamento.md).

## Publicar o edital

O cartão **Publicar edital** aparece no cockpit quando a fase interna está concluída (fase **Aprovação Interna**) e o processo está ativo.

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

Se o PNCP recusar ou não responder, o cockpit mostra no topo o alerta **"Aviso NÃO publicado no PNCP — prazo não iniciado"** com o retorno real da API (código HTTP, mensagem, tentativas, última tentativa e a próxima tentativa automática) e uma lista "O que corrigir":

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
| "Cadastre pelo menos um item com quantidade e valor estimado" | Cartão **Itens da contratação** do cockpit › **Editar itens** (ou a pesquisa de preços, que preenche o valor). Vale para todas as modalidades — também para concluir a fase interna |
| Item exclusivo ME/EPP acima de R$ 80.000 | Retire a exclusividade ou ajuste (LC 123, art. 48, I) |
| Item até R$ 80.000 sem exclusividade e sem justificativa | Registre a justificativa do art. 49 |
| "Gere o aviso de contratação direta (PDF)" (dispensa) | No **Divulgar aviso da dispensa**, clique em **Gerar aviso (PDF)** e confira — parte [05](05-dispensa-e-inexigibilidade.md) |

### Cancelar a publicação (antes de propostas)

Publicou com erro (ex.: sem itens), o PNCP recusou, ou ainda não há propostas? No cockpit aparece o cartão **Cancelar publicação** (também na fase **Aguardando publicação no PNCP**) (só o órgão dono; motivo obrigatório, fica no histórico). A compra sai do PNCP — ou da fila, se ainda não tinha sido enviada — e o processo volta à fase interna (aprovação interna): corrija (itens, documentos) e publique de novo. Com proposta recebida, o caminho é revogar ou anular (abaixo).

## Impugnações e esclarecimentos

Depois da publicação, o cartão **Impugnações e esclarecimentos** do cockpit mostra quantos pedidos existem e quantos estão pendentes, com links para as telas de resposta.

> **Dispensa eletrônica:** não há impugnação nem pedido de esclarecimento formal — a IN SEGES 67/2021 não os prevê e o art. 164 da Lei trata do edital de licitação. A comunicação é pelas mensagens do sistema (IN 67, art. 10) — veja a parte [05](05-dispensa-e-inexigibilidade.md). O sistema recusa o pedido formal na dispensa.

**Prazo (art. 164):** qualquer pessoa pode impugnar ou pedir esclarecimento até **3 dias úteis antes da abertura** da sessão (ou até a data-limite do edital, se informada). Depois disso, os botões somem para o fornecedor. O prazo corre junto com o recebimento de propostas.

### Responder um pedido de esclarecimento

1. No cockpit, cartão **Impugnações e esclarecimentos** › **Pedidos de esclarecimento** (tela `/orgao/processos/<id>/esclarecimentos`).
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

O cartão **Retificar edital (art. 55, §1º)** aparece no cockpit depois da publicação. Ele mostra a versão **Vigente**, a data em que foi divulgada, o motivo das versões anteriores e quantos licitantes foram notificados.

É possível retificar enquanto o processo está em Publicado, Recebendo Propostas ou Análise de Propostas (ativo ou suspenso).

1. Clique em retificar.
2. Preencha **Motivo** (ex.: "acolhimento da impugnação nº 1 quanto à exigência de atestado") e **O que foi alterado** (itens/cláusulas, como estavam e como ficaram).
3. Anexe o **PDF da nova versão do edital**.
4. Responda **A alteração afeta a formulação das propostas?**
   - **Sim** — informe o **Novo cronograma** (fim do recebimento e abertura). O prazo é **reaberto integralmente** e conferido de novo pelo art. 55, contado da retificação. As propostas já enviadas ficam **aguardando confirmação do licitante**.
   - **Não** — explique **Por que não afeta as propostas?** (ex.: "correção de erro material no endereço do órgão"). As datas só podem ser mantidas ou adiadas.
5. Confirme. A nova versão vira a vigente, a anterior fica como "substituída" (histórico público), os licitantes são avisados e o PNCP recebe a retificação.

> **Atenção.** Quando a retificação afeta as propostas, o licitante que **não confirmar** a proposta até o novo fim do recebimento tem a proposta **cancelada** automaticamente. A sessão não abre enquanto houver proposta aguardando confirmação dentro do prazo.

> **Não disponível:** retificar **itens ou lotes** (há propostas vinculadas a eles). Para mudar o objeto é preciso revogar e publicar de novo.

## Suspender e retomar

No cartão **Atos do processo** do cockpit:

1. Clique em **Suspender**, informe o motivo (obrigatório, fica no histórico) e confirme.
2. O processo fica com a situação **Suspensa**: sala, prazos de ME/EPP e resultado ficam parados.
3. Para voltar, clique em **Retomar**. O processo volta exatamente para a fase em que estava.

O PNCP é avisado da suspensão e da retomada automaticamente.

## Revogar ou anular — em dois tempos (art. 71, §3º)

Antes de revogar (interesse público — art. 71, II) ou anular (ilegalidade — art. 71, III), a lei exige ouvir os licitantes. O cartão **art. 71, §3º — prévia manifestação dos licitantes** do cockpit conduz isso:

**1º tempo — intenção**

1. Clique em **Intenção de revogar** (ou **Intenção de anular**) — "Notifica os licitantes e abre o prazo de manifestação".
2. Escreva o **Motivo / fundamentação** (ex.: "Fato superveniente, razões de interesse público…" ou "Ilegalidade identificada (insanável)…").
3. Informe o **Prazo para manifestação** em dias úteis (de 1 a 30; padrão 3).
4. Confirme. Os licitantes são avisados e cada um pode se manifestar uma vez (e alterar até o fim do prazo).

Durante o prazo, o cartão mostra as **Manifestações dos licitantes**. Se desistir, use **Desistir da intenção** (com motivo): "O processo segue normalmente; a desistência fica registrada no histórico."

**2º tempo — o ato**

5. Depois do fim do prazo, o botão **Revogar** / **Anular** fica disponível ("Disponível depois do fim do prazo de manifestação").
6. Fundamente o ato e, se houver, responda às manifestações. Confirme.

Sem licitantes (nenhuma proposta ou inscrição), não há a quem ouvir: aparece **Revogar direto** / **Anular direto** ("Ato direto (sem licitantes a notificar)"). O art. 71, §3º não tem exceção — por isso o próprio ato registra, com texto automático e auditável, que "não havia interessados a ouvir".

**Fundamentação obrigatória** (mínimo 10 caracteres): na **revogação**, o fato superveniente, devidamente comprovado, pertinente e suficiente (art. 71, §2º); na **anulação**, a indicação expressa dos atos com vício insanável (art. 71, §1º).

A situação passa a **Revogada** ou **Anulada** e o PNCP é atualizado automaticamente.

## Deserta e fracassada

- **Declarar deserta** só depois do fim do prazo de propostas e sem nenhuma proposta.
- **Declarar fracassada** só quando houve propostas mas nenhuma é aproveitável — todas desclassificadas, ou julgamento feito sem vencedor. Sem proposta nenhuma, o caso é de deserta.
- Quando todos os itens ficam desertos ou fracassados durante a sessão, o sistema faz isso sozinho.
- Os botões ficam desabilitados com o motivo escrito logo abaixo (a regra é do servidor — a tela só mostra).
- Na **dispensa**, escolha também a providência do art. 22 da IN SEGES 67/2021 — veja a parte [05](05-dispensa-e-inexigibilidade.md).

## Histórico do processo

O cartão **Histórico** do cockpit lista cada ato praticado: quem (o nome do servidor, do órgão ou do fornecedor; atos automáticos aparecem como "Sistema (PNCP)", "Sistema (relógio)" ou "Sistema (ajuste de dados)"), quando (horário de Brasília), de qual fase para qual (com os nomes das fases, não os códigos) e o motivo — além de um resumo do que o ato registrou (cronograma estendido, manifestação prévia, providência do art. 22 da IN 67). É o registro oficial da tramitação.
