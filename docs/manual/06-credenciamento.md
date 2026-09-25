# 06 — Credenciamento

O credenciamento (Lei 14.133/2021, arts. 78, I, e 79) é um **procedimento auxiliar**: o órgão publica um edital de chamamento e **todos** os interessados que cumprirem as exigências são credenciados. Depois, cada demanda é distribuída entre os credenciados por uma regra objetiva e contratada por **inexigibilidade** (art. 74, IV).

No sistema, o credenciamento é um processo como os outros (fase interna, edital, cockpit, PNCP, histórico), com um **painel próprio**.

## Hipóteses e regras de distribuição (art. 79)

| Hipótese | Regras de distribuição permitidas |
|---|---|
| **Art. 79, I — paralela e não excludente**: contratações simultâneas em condições padronizadas | **Rodízio** (ordem do credenciamento), **Sorteio auditável a cada demanda** ou **Divisão igualitária** (menor valor já contratado) |
| **Art. 79, II — seleção a critério de terceiros**: o beneficiário escolhe o credenciado | **Escolha do beneficiário** |
| **Art. 79, III — mercados fluidos**: preço cotado no momento | **Cotação de mercado no momento** |

## Passo a passo do órgão

### 1. Criar o credenciamento

1. Menu **Credenciamentos** › **Novo credenciamento**.
2. Preencha: **Nº do processo** (gerado se vazio), **Objeto** (ex.: "credenciamento de clínicas para consultas especializadas"), **Hipótese (art. 79)**, **Distribuição da demanda**, **Tipo** (Compra, Serviço, Serviço de engenharia, Locação), **Início da vigência (inscrições)**, **Fim da vigência**, **Validade do credenciamento (meses)** (vazio = até o fim da vigência), **Aviso prévio da denúncia (dias — art. 79, par. único, VI)**, **Condições padronizadas de contratação** (art. 79, par. único, III).
3. Informe os **itens e valor da contratação**: descrição, quantidade estimada e valor unitário (tabela de remuneração fixada no edital; em mercados fluidos, valor de referência).
4. Salve. O processo é criado na fase interna.

> **Atenção.** Hipótese e regra incompatíveis são recusadas (ex.: rodízio em mercados fluidos).

### 2. Instrução, edital e exigências

Abra o credenciamento (**Abrir** na lista; tela `/orgao/credenciamentos/<id>`). O bloco **Edital e regras** mostra:

- **Instrução (art. 72)** — DFD, estimativa e autorização (pelo **Cockpit do processo**);
- **Edital** — **Anexar PDF** (ou **Substituir PDF** antes da publicação);
- **Regras do edital (art. 79)** — hipótese, distribuição, vigência/inscrições, validade, condições padronizadas, aviso prévio da denúncia, recurso;
- **Exigências de habilitação do edital** — "Documentos que cada interessado apresenta na inscrição (registro cadastral aproveitado — art. 70)".

### 3. Publicar

Clique em **Publicar edital de credenciamento**. O edital vai ao PNCP pela fila e a página pública passa a mostrar o chamamento. As inscrições abrem no início da vigência (automaticamente).

> **Atenção.** O credenciamento **não** tem prazo mínimo do art. 55 (não é modalidade de licitação), mas exige instrução completa, edital anexado, regras coerentes, vigência futura, condições padronizadas, aviso da denúncia de pelo menos 1 dia e itens com valor.

> **Não disponível:** retificar o edital de credenciamento já publicado. Para mudar regras publicadas, é preciso revogar e publicar de novo.

### 4. Analisar as inscrições

Na lista de inscrições, clique em **Analisar** em cada uma:

1. Para cada documento, **Atende** ou **Não atende** (com motivo), ou abra diligência ("motivo da diligência (art. 64)").
2. Decida:
   - **Deferir (credenciar)** — exige a documentação entregue e todas as exigências obrigatórias atendidas. O credenciado recebe a **ordem no rodízio** (quem se credencia depois entra no fim) e a **validade** (data do credenciamento + meses do edital, limitada ao fim da vigência);
   - **Indeferir** — motivo obrigatório (mínimo 10 caracteres). Abre o **prazo recursal de 3 dias úteis**.

### 5. Recurso do indeferimento (art. 165, I, "a", e §2º)

1. O interessado apresenta as razões pela tela dele, dentro do prazo (depois disso, é recusado).
2. O agente decide em 3 dias úteis: **Reconsiderar (dar provimento)** — credencia — ou **Manter e encaminhar à autoridade**.
3. A autoridade superior decide em 10 dias úteis: **Autoridade: dar provimento** ou **Autoridade: negar provimento** (nome, cargo e fundamentação). "Conta do órgão (informe nome e cargo) ou usuário administrador — não quem manteve a decisão."

Não há contrarrazões: o indeferimento de uma inscrição não afeta os outros interessados.

### 6. Distribuir uma demanda e contratar

No bloco **Contratações** ("Contratações só durante a vigência, com as inscrições abertas"):

1. Informe a **Descrição da demanda**, os itens e quantidades (**Item**, **Outro item**) e o prazo de execução.
2. Conforme a regra:
   - **Rodízio**: o sistema escolhe o próximo da fila, depois do último contratado;
   - **Sorteio**: sorteio auditável entre todos os aptos;
   - **Divisão igualitária**: quem tem o menor valor já contratado;
   - **Escolha do beneficiário**: informe **Beneficiário (quem escolheu)**, **Documento do beneficiário**, o credenciado escolhido e a **Justificativa / registro da escolha**;
   - **Cotação**: registre as cotações vigentes ("contrata-se a menor").
3. Clique em **Distribuir demanda e gerar contrato**.

O contrato nasce "Aguardando Assinatura", por inexigibilidade (art. 74, IV, com o inciso do art. 79), com os itens e valores da demanda. Vai ao PNCP depois da última assinatura. Se a geração falhar, use **Gerar contrato**.

**Conferir sorteio** refaz a conta publicamente ("Conferido: mesma ordem") — qualquer inscrito também pode conferir.

> **Atenção.** Só são aptos os credenciados dentro da validade e sem denúncia com efeito.

### 7. Descredenciar ou denunciar

- **Descredenciar (descumprimento)** — efeito imediato; sai do rodízio sem mudar a vez dos outros.
- **Denunciar (com aviso prévio)** — efeito depois do aviso prévio do edital.

### 8. Encerramento

No fim da vigência, o sistema encerra o credenciamento sozinho (situação **Concluída**) e arquiva as inscrições pendentes. Encerrar antes do fim não é possível — isso seria revogação (com a manifestação prévia dos inscritos — art. 71, §3º).

## O que o fornecedor faz

Veja a parte [12](12-fornecedor.md#credenciamento). Em resumo: encontra o chamamento em `/credenciamento`, clica para se inscrever (com login de fornecedor), envia os documentos das exigências, acompanha em **Meus Credenciamentos**, pode recorrer do indeferimento e denunciar o credenciamento.

## O que o público vê

Em `/credenciamento` e `/credenciamento/<id>`: objeto, condições de participação e contratação, valores, documentos exigidos, edital para download, link do PNCP e a **relação de credenciados** (razão social, CNPJ, data).
