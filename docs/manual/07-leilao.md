# 07 — Leilão

O leilão (Lei 14.133/2021, art. 31) serve para **vender** bens móveis ou imóveis da Administração. Vence o **maior lance**. O Decreto 11.461/2023 é usado como referência de procedimento.

No sistema, o leilão usa o mesmo processo (fase interna, edital, cockpit, sala, recursos, PNCP) com um painel próprio no cockpit: **Leilão**.

## Passo a passo do órgão

### 1. Criar o processo

Pelo **Novo processo**, escolha a modalidade **Leilão**. O assistente já escolhe o tipo de contratação **Alienação de Bens** e o critério **maior lance**, e mostra os campos próprios do leilão.

> **Atenção.** Leilão só com critério **maior lance**, tipo de contratação **Alienação** e com etapa de lances. Maior lance não é aceito em outra modalidade.

### 2. Condução, pagamento e visitação

No cockpit, painel do leilão, seção **Condução, pagamento e visitação** (editável só na fase interna):

- **Quem conduz o leilão**: **Servidor designado** (com **Ato de designação** — portaria nº/data) ou **Leiloeiro oficial** (nome, **CPF do leiloeiro**, **Matrícula na Junta Comercial**, **Comissão** em % sobre o arrematado, **Como foi selecionado** / **Processo de seleção do leiloeiro** — credenciamento ou pregão, art. 31, §1º);
- **Forma de pagamento** (à vista ou parcelado, **Parcelas**), **Prazo para pagar (dias úteis)**, **Condições de pagamento (texto do edital)**;
- **Visitação**: **Local de visitação** e **Período de visitação**.

Clique em **Salvar configuração**.

> Comissão do leiloeiro acima de 5% gera alerta.

### 3. Bens (art. 31, §2º)

Para cada item, seção **Bens**:

- **Tipo do bem** (móvel, veículo, semovente, imóvel), **Descrição e características**;
- **Valor da avaliação (R$)**, **Data da avaliação**, **Responsável/laudo da avaliação**;
- **Preço mínimo de arrematação (R$)** — vira o valor estimado do item;
- **Onde está o bem**, **Ônus, gravames ou pendências**;
- imóvel: **Matrícula e registros**, **Situação e divisas** e **Autorização legislativa (lei nº)** (art. 76, I);
- fotos (ficam públicas na página do leilão).

Clique em **Salvar bem**.

### 4. Publicar

O painel mostra **Para publicar o edital do leilão:** com o que falta. Depois, publique pelo cartão **Publicar edital** (parte [03](03-publicacao-e-prazos.md)).

> **Atenção (art. 55, III).** Prazo mínimo de **15 dias úteis** entre a divulgação e a sessão.

### 5. Propostas e lances

- A proposta do licitante é o **lance inicial**, sigiloso, **maior ou igual ao preço mínimo** ("Preço mínimo" aparece na tela de proposta).
- O arrematante pode ser pessoa física (cadastro de fornecedor com CPF).
- A disputa acontece na sala da sessão, no modo definido (normalmente aberto: 10 min + prorrogações de 2 min), com lances **acima** do próprio último e da melhor oferta.

### 6. Declarar arrematantes

Com os lances encerrados, a licitação vai para **Julgamento**. Na sala e no painel, seção **Arrematação e pagamento**:

1. Clique em **Declarar arrematantes (maior lance ≥ preço mínimo)**.
   - item sem lance → **deserto**;
   - todos os lances abaixo do mínimo → **fracassado**.
2. As arrematações ficam "Declarada (aguarda a fase recursal)".

No leilão **não há** aceitação de proposta adequada nem habilitação (art. 31, §4º). A sala mostra arrematação, recursos e resultado.

### 7. Recursos

Abra a janela de intenção e conduza os recursos como no pregão (parte [04](04-sessao-publica-pregao-concorrencia.md#7-recursos-art-165)).

### 8. Pagamento

Superada a fase recursal:

1. Clique em **Convocar para pagamento** (prazo em dias úteis no calendário do órgão). Situação: "Aguardando pagamento".
2. O arrematante envia o comprovante pela tela dele ("Pagamento informado"). Use **Ver comprovante**.
3. Clique em **Confirmar pagamento** — ou, vencido o prazo sem pagamento, **Declarar inadimplência** (com motivo). O inadimplente é desclassificado e o **lance imediatamente seguinte** é convocado (Dec. 11.461, art. 26, §3º).

### 9. Adjudicar, homologar e termo de arrematação

1. No cartão **Resultado**, **Adjudicar** (só as arrematações **pagas**, pelo valor do lance) e **Homologar**.
2. Clique em **Gerar termos de arrematação**. Em vez de contrato, o leilão gera o **Termo de arrematação** em PDF (visível ao órgão e ao arrematante).
3. **Concluir processo** exige os termos gerados.

O PNCP recebe o leilão com a categoria do item conforme o tipo do bem.

## O que o arrematante faz

Veja a parte [12](12-fornecedor.md#leilão-concurso-e-diálogo). Em resumo: envia o lance inicial pela proposta, dá lances na sala, acompanha **Minhas arrematações**, clica em **Enviar comprovante do pagamento (PDF/JPG/PNG)** no prazo e baixa o **Termo de arrematação**.
