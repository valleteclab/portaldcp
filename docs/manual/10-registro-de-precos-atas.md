# 10 — Registro de preços e atas (SRP / ARP)

No **Sistema de Registro de Preços** (Lei 14.133/2021, arts. 82 a 86), a licitação não gera um contrato: gera uma **Ata de Registro de Preços (ARP)** com os preços e quantidades registrados. O órgão contrata depois, conforme precisar, até o saldo e a vigência da ata. O Decreto 11.462/2023 é usado como referência.

## Como a ata nasce

1. Na criação do processo, marque **Sistema de Registro de Preços (SRP)** (assistente, passo **Dados básicos**). O processo mostra o selo **SRP**.
2. Conduza a licitação normalmente.
3. Ao **Homologar**, o sistema gera **uma ata por fornecedor vencedor**, com:
   - os itens que ele venceu, pelo **preço homologado** (da proposta adequada aceita);
   - a quantidade do item como quantidade registrada;
   - situação **Aguardando assinatura**;
   - vigência provisória, recontada na assinatura (padrão 12 meses, máximo 12).

> **Atenção (art. 83).** O registro de preços **não obriga** a contratar.

Se a ata não foi gerada (por exemplo, licitação SRP homologada antes desta versão), use **Atas de Registro de Preços** › **Gerar Ata de Registro de Preços**, escolha a **Licitação (SRP)** e confirme. A geração é segura: se as atas já existem, o sistema devolve as existentes.

## Cadastro de reserva (art. 82, VII)

Junto com a ata, os demais licitantes de cada item (não excluídos) são convocados, **na ordem do ranking**, para dizer se aceitam fornecer ao **preço do vencedor**:

- prazo de **5 dias corridos** (padrão da plataforma);
- resposta pelo fornecedor: **Aderir ao preço do vencedor** ou **Recusar**;
- sem resposta no prazo: expirado.

A aba **Cadastro de reserva** da ata mostra licitante, ordem, oferta original e situação.

> **Atenção.** O termo da ata só pode ser gerado para assinatura **depois** que as convocações do cadastro de reserva terminarem (a reserva integra a ata).

## Tela da ata (órgão)

Menu **Atas de Registro de Preços** (`/orgao/atas`): lista com totais (**Atas Vigentes**, **A Vencer (30 dias)**, **Esgotadas**, **Valor Total Registrado**), busca e filtro por situação (Aguardando assinatura, Vigente, Esgotada, Vencida, Suspensa, Cancelada, Encerrada). Clique na ata para o detalhe (`/orgao/atas/<id>`), que tem:

| Seção | O que mostra / faz |
|---|---|
| **Itens e saldo** | Registrado, utilizado, saldo, adesões (autorizado/usado), limite total de adesões |
| **Contratar a partir da ata** | Gera contrato ou ordem de fornecimento/serviço consumindo o saldo |
| **Consumos do saldo** | Cada consumo com o contrato/ordem gerado |
| **Adesões (órgãos não participantes)** | Pedidos de carona para anuir/recusar/autorizar |
| **Cadastro de reserva** | Situação de cada convocado |
| **Assinatura da ata** | Gerar o termo e acompanhar assinaturas |
| **Prorrogação (art. 84)** | Prorrogar a vigência |
| **Cancelamento do registro** | Cancelar e convocar a reserva |

### Assinar a ata

1. Na seção **Assinatura da ata**, gere o termo em PDF (itens, preços, vigência, adesão, reserva, cancelamento, PNCP).
2. Assinam o usuário do órgão e o fornecedor (este pela tela dele, **Revisar e assinar**). Use **Abrir o Portal de Assinaturas** para assinar pelo órgão.
3. Com a última assinatura, a ata fica **Vigente**: a vigência conta da data da assinatura (horário de Brasília), a demanda/PCA é marcada como contratada e a ata vai ao **PNCP** com o termo assinado.

> Para assinar pelo órgão, prefira um **usuário** (Administrador) com e-mail: a conta geral do órgão precisa ter e-mail de login para assinar.

### Contratar a partir da ata

1. Seção **Contratar a partir da ata** (ou botão **Contratar** na lista).
2. Escolha o instrumento: **Contrato** ou **Ordem de fornecimento/serviço**.
3. Informe a quantidade de cada item e o **Prazo de execução (dias)**.
4. Confirme. O instrumento é criado em "Aguardando assinatura", com os itens da ata, e o consumo é registrado.

> **Atenção.** Quantidade acima do saldo é recusada. Dois pedidos ao mesmo tempo não conseguem consumir o mesmo saldo: um é aceito e o outro recusado. Com o saldo zerado, a ata fica **Esgotada**.

### Prorrogar (art. 84)

Seção **Prorrogação (art. 84)**: "Uma única vez, por até 12 meses, antes do fim da vigência, comprovado o preço vantajoso." Informe **Meses (1 a 12)** e o motivo. A prorrogação **não** renova as quantidades.

### Cancelar o registro

Seção **Cancelamento do registro** (Decreto 11.462, arts. 28–29): escolha a hipótese (descumprimento, não retirada do instrumento, preço superior ao de mercado, sanção impeditiva, caso fortuito/força maior, interesse público) e o motivo. Efeitos:

- a ata fica **Cancelada**; pedidos de adesão em andamento são recusados; termo não assinado é cancelado;
- para cada item com saldo, o **primeiro da reserva que aderiu** é convocado: uma **nova ata** é gerada com o saldo, ao preço registrado, até o fim da vigência original, aguardando assinatura.

### Vigência

Todo dia o sistema marca como **Vencida** a ata cujo prazo acabou e expira as convocações de reserva vencidas.

## Adesão — "carona" (art. 86)

Menu **Atas de Registro de Preços** › **Adesões (carona)** (`/orgao/atas/adesoes`), com três abas:

### Aba "aderir" — pedir adesão a ata de outro órgão

1. Busque ("Objeto, item, fornecedor ou órgão…") e clique em **Buscar**. Aparecem atas vigentes de outros órgãos que admitem adesão.
2. Clique em **Pedir adesão**, informe as quantidades por item e a **justificativa e demonstração da vantagem** (pesquisa de preços, compatibilidade com o mercado — art. 86, §2º, I e II; mínimo 20 caracteres).
3. Clique em **Enviar pedido de adesão**.

### Aba "recebidas" — o órgão gerenciador decide

Para cada pedido recebido: **Anuir** ou **Recusar** (com motivo). Depois da anuência, o **fornecedor** aceita ou recusa pela tela dele. Com o aceite do fornecedor, clique em **Autorizar**.

### Aba "minhas" — o órgão aderente contrata

Depois de **Autorizado**, o aderente usa **Contratar** (contrato do próprio órgão, consumindo a quantidade autorizada da adesão). O prazo para contratar é de **90 dias** da autorização, limitado à vigência da ata.

> **Atenção — limites (art. 86, §§ 4º e 5º).** Por item, a soma das adesões de **um órgão** não pode passar de **50%** do registrado; a soma de **todas** as adesões não pode passar do **dobro** do registrado. Pedidos em andamento já reservam a quantidade. O gerenciador não pode aderir à própria ata.

## Consulta pública

Em `/atas` o cidadão vê as atas assinadas (por padrão, só as vigentes), com filtro **Permite Adesão**, e o detalhe com itens, saldo, vigência e licitação de origem.

## Não disponível

- Órgãos participantes (IRP) com quantidades próprias.
- Envio automático ao PNCP da retificação da ata após prorrogação ou cancelamento.
