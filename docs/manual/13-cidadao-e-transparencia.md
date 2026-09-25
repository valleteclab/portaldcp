# 13 — Cidadão e transparência

Qualquer pessoa pode acompanhar as licitações dos órgãos que usam o Portal DCP, **sem login**. Esta parte mostra onde encontrar cada informação.

## Onde consultar

| O quê | Endereço |
|---|---|
| Licitações | `/licitacoes` (Portal de Licitações) |
| Detalhe de uma licitação | `/licitacoes/<id>` |
| Credenciamentos | `/credenciamento` |
| Atas de registro de preços | `/atas` |

Tudo o que é publicado aqui também vai ao **PNCP** (pncp.gov.br), o portal nacional.

## Encontrar uma licitação

Em `/licitacoes`:

1. Busque por objeto ou número do processo (a busca também encontra por órgão e edital).
2. Filtre por **Modalidade**, **Fase** (todas as fases públicas), **Situação** (ativa, suspensa, revogada, anulada, deserta, fracassada, concluída) e **UF**.
3. Clique na licitação.

Só aparecem licitações **já divulgadas**. Processos ainda na fase interna não são públicos.

## O que o detalhe mostra

No topo: objeto, modalidade, fase, situação, órgão e informações como critério de julgamento, modo de disputa, tipo de contratação e pregoeiro(a). Há uma orientação de como a modalidade funciona (leilão, concurso, diálogo, dispensa, credenciamento). O botão **Baixar Edital** sempre baixa a **versão vigente** (se houve retificação, a retificada).

Abas:

| Aba | Conteúdo |
|---|---|
| **Documentos** | Edital e anexos públicos; versões anteriores do edital; depois da homologação, os **termos de adjudicação e homologação** |
| **Itens** | Itens com quantidades e valores estimados (ou "Sigiloso", quando o orçamento é sigiloso — art. 24) |
| **Cronograma** | Publicação do edital, início e fim do acolhimento de propostas, **limite para impugnações** e abertura da sessão |
| **Esclarecimentos** | Esclarecimentos e impugnações **respondidos**, sem identificar quem perguntou |
| **Resultado** | Sessão e ata (depois do encerramento); depois da homologação, vencedor e valor por item, termos e contratos/atas já assinados |

> **Atenção — o que só aparece depois.** Durante a disputa, os participantes são anônimos. Vencedor e valores homologados só aparecem **depois da homologação**. Contratos e atas só aparecem **depois de assinados**.

> **Sigilo.** Não são públicos: as propostas antes da abertura, os lances fechados antes do fim do prazo, os documentos de habilitação, as soluções do diálogo competitivo, a autoria dos trabalhos do concurso antes do julgamento e as manifestações sobre revogação/anulação.

## Acompanhar a sessão

A ata da sessão (com o registro cronológico de lances, mensagens, negociação, habilitação e recursos) fica disponível na aba **Resultado** depois do encerramento. Recursos já decididos também são públicos.

## Credenciamentos

Em `/credenciamento` aparecem os chamamentos divulgados e ativos. O detalhe mostra objeto, condições de participação e contratação (condições padronizadas, distribuição da demanda, denúncia), valores, documentos de habilitação exigidos, edital para download e a **relação de credenciados** (razão social, CNPJ e data).

## Atas de registro de preços

Em `/atas` aparecem as atas assinadas (por padrão, apenas as vigentes), com o filtro **Permite Adesão**. O detalhe mostra itens, quantidade registrada, utilizado, **Saldo Disponível**, vigência, data de assinatura e a licitação de origem.

## Pedir esclarecimento ou impugnar como cidadão

A lei permite que qualquer pessoa impugne o edital ou peça esclarecimento até 3 dias úteis antes da abertura (art. 164).

> **Não disponível ainda:** formulário público sem cadastro. Hoje o pedido é feito pelo **Portal do Fornecedor** (é preciso criar uma conta em `/cadastro` e entrar em `/login`), no detalhe da licitação, pelos botões **Esclarecimentos** e **Impugnar Edital** — veja a parte [12](12-fornecedor.md#3-esclarecimentos-e-impugnação). Outra opção é procurar o órgão pelos contatos informados na página da licitação.
