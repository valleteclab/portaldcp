# 00 — Visão geral

## O que o Portal DCP faz

O Portal DCP é uma **plataforma de compras públicas** (Lei 14.133/2021, art. 175, §1º). No módulo de licitações, o órgão conduz todo o processo de contratação em um só lugar:

- planeja a compra (demanda, PCA) e monta a **fase interna** com os documentos exigidos em lei (DFD, ETP, TR, pesquisa de preços, parecer, autorização);
- **publica** o edital ou o aviso respeitando os prazos mínimos da lei e os feriados do município;
- recebe **propostas** dos fornecedores pela internet;
- conduz a **sessão pública** (lances, julgamento, desempate de ME/EPP, negociação, habilitação, recursos);
- registra a **adjudicação** e a **homologação** em nome da autoridade competente;
- gera o **contrato** ou a **ata de registro de preços**, colhe as assinaturas eletrônicas;
- envia tudo automaticamente ao **PNCP** (Portal Nacional de Contratações Públicas).

Modalidades e procedimentos disponíveis:

| Modalidade / procedimento | Base legal | Parte do manual |
|---|---|---|
| Pregão eletrônico | art. 29; IN SEGES 73/2022 | [04](04-sessao-publica-pregao-concorrencia.md) |
| Concorrência eletrônica | art. 29; IN SEGES 73/2022 | [04](04-sessao-publica-pregao-concorrencia.md) |
| Dispensa eletrônica | art. 75, §3º; IN SEGES 67/2021 | [05](05-dispensa-e-inexigibilidade.md) |
| Inexigibilidade | art. 74 | [05](05-dispensa-e-inexigibilidade.md) |
| Credenciamento | arts. 78, I, e 79 | [06](06-credenciamento.md) |
| Leilão | art. 31 | [07](07-leilao.md) |
| Concurso | art. 30 | [08](08-concurso.md) |
| Diálogo competitivo | art. 32 | [09](09-dialogo-competitivo.md) |
| Sistema de registro de preços (SRP) | arts. 82 a 86 | [10](10-registro-de-precos-atas.md) |

> **Atenção — liberação gradual.** O sistema está pronto para todas as modalidades, mas a liberação para uso real segue a ordem: dispensa → pregão → concorrência → credenciamento → leilão → concurso → diálogo competitivo. Confirme com a administração da plataforma quais modalidades já estão liberadas para o seu órgão.

Há também a **seleção externa**: quando a disputa aconteceu em outra plataforma (BLL, BNC, Compras.gov etc.), o órgão registra o resultado no Portal DCP e segue com homologação, contrato e execução por aqui.

## Quem é quem (papéis)

| Papel | Quem é | O que faz no sistema |
|---|---|---|
| **Conta do órgão** | O login principal do órgão (entra em `/orgao-login`) | Acesso total ao órgão, inclusive Configurações. Pode registrar atos como autoridade (informando nome e cargo). |
| **Administrador do órgão** | Usuário com papel **Administrador** (ADMIN) | Vê o menu **Configurações**: parâmetros, feriados, autoridades, fluxos de aprovação, modelos. Pode decidir recursos como autoridade superior. |
| **Agente de contratação / pregoeiro** | Usuário com papel **Pregoeiro** | Conduz o processo e a sessão pública: publica, abre a sala, julga, habilita, decide admissibilidade e reconsideração de recursos, registra adjudicação e homologação (em nome da autoridade). |
| **Equipe de apoio** | Usuário com papel **Equipe de Apoio** | Ajuda na preparação e acompanha. **Não** registra adjudicação nem homologação (o sistema recusa). |
| **Comissão / banca** | Usuários ativos do órgão designados no processo (mínimo 3 — art. 37, §1º) | Atribuem notas técnicas (técnica e preço, melhor técnica, concurso) ou conduzem o diálogo competitivo, cada um com o próprio login. |
| **Autoridade superior / competente** | Prefeito(a), secretário(a) com delegação etc. | Pratica a adjudicação e a homologação (art. 71, IV). No sistema ela é **cadastrada** (nome, cargo, CPF, e-mail, ato de delegação); o agente registra o ato e o termo sai em nome dela. Conforme a configuração, ela assina eletronicamente. |
| **Administrador da plataforma** | Equipe que opera o Portal DCP | Cria órgãos e usuários, habilita módulos, configura a credencial do PNCP e o CNPJ do órgão no PNCP, cadastra feriados estaduais. |
| **Fornecedor** | Empresa ou pessoa física cadastrada (entra em `/login`) | Mantém o cadastro e os documentos, envia propostas, dá lances, envia documentos de habilitação, recorre, assina contratos e atas. |
| **Cidadão** | Qualquer pessoa, sem login | Consulta licitações, documentos, esclarecimentos respondidos, resultados, atas e credenciamentos. |

> **Atenção — segregação de funções (art. 7º, §1º).** Na decisão de recurso, quem manteve a decisão (o agente) **não pode** decidir como autoridade superior. O sistema bloqueia.

## O caminho de um processo

```
Demanda (DFD) ─► PCA ─► Fase interna (documentos + aprovações)
   ─► Publicação do edital/aviso (prazos do art. 55, feriados)
   ─► Impugnações e esclarecimentos (até 3 dias úteis antes da abertura — art. 164)
   ─► Recebimento de propostas
   ─► Sessão pública: lances ─► desempate ME/EPP ─► aceitação da proposta
        ─► negociação ─► habilitação ─► intenção de recurso
   ─► Recursos (razões, contrarrazões, reconsideração, autoridade)
   ─► Adjudicação ─► Homologação (autoridade competente)
   ─► Contrato (ou Ata de Registro de Preços no SRP) com assinaturas eletrônicas
   ─► PNCP (automático em cada etapa) ─► Execução (medições, ordens)
```

Cada passo é um **ato** registrado no **Histórico** do processo (quem fez, quando, de qual fase para qual, motivo). O sistema só oferece o ato quando ele é possível; quando falta algo, ele mostra a lista de **pendências**.

### Onde cada coisa acontece

| Etapa | Tela |
|---|---|
| Demanda e PCA | Menus **Demandas**, **Consolidação DFD** e **PCA** |
| Criar o processo | Menu **Novo processo** (assistente) ou botão **Iniciar contratação** na demanda aprovada |
| Documentos da fase interna | **Fase Interna IA** e o dossiê do processo (botão **Fase interna** no cockpit) |
| Tudo o mais | **Cockpit do processo**: menu **Processos** › clique no processo (endereço `/orgao/processos/<id>`) |
| Sessão pública | Botão **Abrir sala da sessão** no cartão **Sessão pública** do cockpit |
| Adjudicação e homologação | Cartão **Resultado** no cockpit (também aparece na sala) |
| Atas SRP | Menu **Atas de Registro de Preços** |
| Credenciamento | Menu **Credenciamentos** |

O **cockpit** (tela do processo) é a "casa" do processo. De cima para baixo: o alerta do PNCP (quando a publicação não foi confirmada), o cabeçalho (fase, situação, fundamento, **Editar dados**, **Baixar processo (PDF)** e o menu **Mais ações**, com as ações disponíveis e as bloqueadas com o motivo), cinco cartões de resumo (situação, prazo, propostas, valor estimado, PNCP), a barra de etapas da modalidade, a **etapa atual** (o que fazer agora) com a próxima etapa, a coluna lateral (dados da contratação, prazos, comunicação) e as abas **Itens**, **Documentos**, **Propostas**, **PNCP** e **Histórico**. Detalhes na parte [03](03-publicacao-e-prazos.md#a-tela-do-processo).

## Fase e situação

Todo processo tem uma **fase** (em que etapa está) e uma **situação** (se está andando normalmente).

Fases mais comuns: Planejamento, Termo de Referência, Pesquisa de Preços, Análise Jurídica, Aprovação Interna (fase interna) → Publicado → Recebendo Propostas → Análise de Propostas → Em Disputa → Julgamento → Habilitação → Recurso → Adjudicação → Homologação.

Situações: **Ativa**, **Suspensa**, **Revogada**, **Anulada**, **Deserta**, **Fracassada**, **Concluída**. Com a situação diferente de Ativa, a sala e o resultado ficam bloqueados até retomar.

## Glossário

| Termo | Significado |
|---|---|
| **Adjudicação** | Ato que atribui o objeto (cada item ou lote) ao vencedor habilitado. |
| **Agente de contratação** | Servidor que conduz a licitação; no pregão, é o pregoeiro (art. 8º). |
| **ARP — Ata de Registro de Preços** | Documento que registra preços, fornecedores e quantidades para contratações futuras (art. 82). |
| **Aceitação da proposta** | Etapa em que o 1º colocado envia a proposta ajustada ao último lance e o agente aceita ou recusa (IN 73, art. 29). |
| **Autoridade competente / superior** | Quem adjudica e homologa (art. 71, IV) e decide recursos mantidos pelo agente (art. 165, §2º). |
| **Cadastro de reserva** | Licitantes que aceitam fornecer ao preço do vencedor da ata, na ordem de classificação (art. 82, VII). |
| **Carona (adesão)** | Uso da ata por órgão que não participou do registro, com limites (art. 86). |
| **Cockpit** | Painel principal de cada processo no sistema. |
| **Cota reservada** | Parte (até 25%) de um item reservada a ME/EPP (LC 123, art. 48, III). |
| **Diligência** | Pedido de complemento ou esclarecimento de documento já entregue, sem trocar o documento (art. 64). |
| **Dias úteis** | Dias com expediente no órgão. O sistema exclui o dia do início, inclui o do vencimento e desconta feriados nacionais, estaduais e municipais (art. 183). |
| **Deserta** | Licitação ou item sem propostas. |
| **Empate ficto** | Quando a proposta de ME/EPP está até 5% (pregão) ou 10% (demais) acima da melhor; a ME/EPP pode cobrir (LC 123, arts. 44 e 45). |
| **Fracassada** | Licitação ou item com propostas, mas nenhuma aceitável/habilitada. |
| **Habilitação** | Verificação dos documentos jurídicos, fiscais, trabalhistas, técnicos e econômicos do vencedor (arts. 62 a 70). |
| **Homologação** | Ato final da autoridade que confirma o resultado; gera o contrato ou a ata. |
| **Impugnação** | Questionamento formal ao edital, até 3 dias úteis antes da abertura (art. 164). |
| **Intenção de recurso** | Manifestação imediata, na sala, de que o licitante vai recorrer; sem ela, perde o direito (preclusão — art. 165, §1º, I). |
| **Inversão de fases** | Habilitação antes do julgamento (só concorrência — art. 17, §1º). |
| **Lance fechado** | Lance sigiloso, dado uma única vez, no modo aberto-fechado (IN 73, art. 24). |
| **Lote** | Grupo de itens disputado pelo valor global. |
| **ME/EPP** | Microempresa e empresa de pequeno porte (inclui MEI). |
| **PCA** | Plano de Contratações Anual. |
| **PNCP** | Portal Nacional de Contratações Públicas, onde tudo precisa ser divulgado (art. 54 e 94). |
| **Preclusão** | Perda do direito por não agir no prazo. |
| **Proposta adequada** | Proposta reajustada ao valor do último lance/negociação, enviada pelo convocado na aceitação. |
| **Registro cadastral** | Documentos do fornecedor já guardados no cadastro, reaproveitados na habilitação (art. 70). |
| **Retificação** | Alteração do edital já publicado, com nova versão e, se afetar as propostas, prazo reaberto (art. 55, §1º). |
| **Sala da sessão** | Tela onde acontece a sessão pública (uma do órgão e uma do fornecedor). |
| **SRP** | Sistema de Registro de Preços. |
| **Tempo aleatório** | Período sorteado, de até 10 minutos, em que a etapa aberta pode terminar a qualquer momento (modo aberto-fechado). |
| **Termo de Adjudicação e Homologação** | Documento gerado pelo sistema com os dados da autoridade, publicado no Diário Oficial e no PNCP. |
| **Unidade** | O que é disputado: um item, ou um lote (quando a disputa é por lote). |
