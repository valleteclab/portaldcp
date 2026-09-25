# 11 — PNCP (Portal Nacional de Contratações Públicas)

A divulgação no PNCP é obrigatória (Lei 14.133/2021, arts. 54 e 94) e, para contratos, é **condição de eficácia**. O Portal DCP envia tudo **automaticamente**: você não precisa digitar nada no PNCP. Esta parte explica o que é enviado, quando, e como acompanhar.

## O que o órgão precisa ter feito antes

| Quem | O quê |
|---|---|
| Órgão | Estar cadastrado no PNCP com o próprio CNPJ e autorizar a plataforma (o sistema integrador) a publicar em nome dele, pelo gestor do órgão no PNCP. |
| Administração da plataforma | Configurar a credencial da plataforma, o ambiente (treinamento ou produção) e vincular o CNPJ do órgão. |

A situação aparece em **Configurações** › aba **PNCP** (**Conectado** / **Não Configurado**, ambiente, login configurado, CNPJ do órgão).

> **Atenção.** O órgão só publica sob o **próprio CNPJ** no PNCP.

## O que é enviado e quando

| Quando acontece no sistema | O que vai ao PNCP |
|---|---|
| **Publicar edital** / **Divulgar aviso da dispensa** / publicar credenciamento | A compra (com o edital real em PDF, o aviso e o ato de autorização) e os itens |
| **Retificar edital** | O arquivo do edital retificado e a retificação da compra/itens |
| **Suspender** / **Retomar** / **Revogar** / **Anular** | A situação da compra (suspensa, divulgada, revogada, anulada) |
| Item/licitação **deserta** ou **fracassada** | A situação dos itens |
| **Homologar** | O resultado de cada item (com ordem de classificação, benefício ME/EPP, critério de desempate do art. 60 aplicado, porte do fornecedor) e o **Termo de Adjudicação e Homologação** |
| **Ata** assinada por todos | A ata de registro de preços com o termo assinado |
| **Contrato** assinado por todos | O contrato com o termo assinado — **só depois da última assinatura** (art. 94) |
| Diálogo: abrir fase competitiva | O edital da fase competitiva e a retificação da compra |

> **Atenção.** O contrato **não** vai ao PNCP antes de assinado. Contratos antigos enviados antes da assinatura são corrigidos por retificação.

> **Atenção.** Ata e contrato só vão à fila quando a compra foi publicada no PNCP por esta plataforma.

## A fila de envio

Cada envio vira uma linha de uma **fila**. Um robô processa a fila a cada minuto, na ordem certa (compra → itens → documentos → retificação → situação → resultados → ata → contrato). Se uma etapa depende de outra ainda não enviada, ela espera sem gastar tentativa.

### Onde acompanhar

- **Pregão, concorrência e demais**: no cockpit, cartão **PNCP**.
- **Dispensa**: na linha do tempo, abaixo do painel da seleção.
- **Credenciamento**: no painel do credenciamento.
- Visão geral do órgão: menu **Integração PNCP** (abas PCA, Compras, Enviadas, Resultados, Atas, Contratos, Erros, Config).

Cada operação aparece como uma etiqueta. Clique nela para ver o detalhe (mensagem do PNCP, nº de controle, última atualização, link).

| Etiqueta | Significado | O que fazer |
|---|---|---|
| **na fila** / "envio às HH:MM" | Aguardando o robô | Nada — aguarde |
| **enviando…** | Em envio | Nada |
| **enviado** (com data) | Publicado no PNCP. Mostra o **Nº de controle PNCP** | Nada |
| **nova tentativa às HH:MM (n)** | Erro temporário (PNCP fora do ar, lentidão). O sistema tenta de novo sozinho, com intervalos crescentes (1, 2, 4… minutos, até 6 h; no máximo 8 tentativas) | Aguarde; se quiser, **Reenviar agora** |
| **erro definitivo — corrija e reenvie** | O PNCP recusou por regra (dado inválido) ou as tentativas acabaram. Mostra a **Mensagem do PNCP** | Corrija o dado indicado e clique em **Reenviar agora** |
| **excluído** | A compra foi excluída no PNCP | — |

> Um retorno do PNCP do tipo "já existe" ou "número já utilizado" é tratado como sucesso: o sistema apenas vincula o registro.

### Reenviar agora

1. Clique na etiqueta com erro (ou pendente).
2. Leia a **Mensagem do PNCP**.
3. Se for dado do processo, corrija (ex.: cadastro do item, datas do cronograma).
4. Clique em **Reenviar agora**. O pacote é montado **na hora**, com os dados atuais.

Na dispensa, os botões **Publicar aviso no PNCP** / **Reenviar aviso**, **Enviar resultado** e **Enviar contratos** servem para reenvio em caso de falha.

## Erros comuns

| Mensagem / situação | Causa provável | Solução |
|---|---|---|
| Etiqueta parada em "na fila" por muito tempo | Depende de uma operação anterior ainda não enviada | Veja se a compra foi enviada; resolva o erro dela primeiro |
| Recusa por falta de data | Cronograma sem data de recebimento/abertura | Não há data "inventada": complete o cronograma (via retificação, se já publicado) e reenvie |
| Recusa de autorização / credencial | Plataforma não autorizada pelo órgão no PNCP, ou CNPJ não vinculado | Autorize a plataforma no PNCP e peça à administração da plataforma para conferir o vínculo |
| Contrato não aparece no PNCP | Ainda falta assinatura | Conclua as assinaturas; o envio é automático |

## Não disponível

- Retificação automática da ata no PNCP depois de prorrogação ou cancelamento.
- Órgãos participantes (IRP).
