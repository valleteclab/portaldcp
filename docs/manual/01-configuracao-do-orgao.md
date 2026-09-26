# 01 — Configuração do órgão

Antes de publicar a primeira licitação, o órgão precisa deixar algumas coisas prontas: quem são os usuários, quem é a autoridade que homologa, quais são os feriados do município e os prazos padrão das sessões. Esta parte explica quem configura o quê.

## Quem configura o quê

| Configuração | Quem faz | Onde |
|---|---|---|
| Criar o órgão, liberar módulos, credencial e CNPJ do PNCP | Administrador da plataforma | Área administrativa da plataforma |
| Criar usuários do órgão e definir o papel (Administrador, Pregoeiro, Equipe de Apoio) | Administrador da plataforma (ver nota abaixo) | Área administrativa › **Usuários** |
| Dados do órgão, logo, setores | Conta do órgão ou Administrador do órgão | **Configurações** › abas **Dados do Orgao** e **Setores** |
| Parâmetros de licitação (tempos, prazos, percentuais, limites) | Conta do órgão ou Administrador do órgão | **Configurações** › **Parâmetros de licitação** |
| Autoridades e modo de formalização | **Somente** conta do órgão ou Administrador do órgão (o pregoeiro só consulta) | **Configurações** › **Parâmetros de licitação** › cartão **Adjudicação e homologação — autoridade e formalização** |
| Feriados municipais e pontos facultativos | Conta do órgão ou Administrador do órgão | **Configurações** › **Feriados** |
| Fluxos de aprovação dos documentos | Conta do órgão ou Administrador do órgão | **Configurações** › **Fluxos de aprovação** |
| Modelos de documento | Conta do órgão ou Administrador do órgão | **Configurações** › **Modelos de documento** |
| Pregoeiro de cada processo | Agente/equipe que edita o processo | Cockpit › **Editar dados** › aba **Configurações** |

> O menu **Configurações** só aparece para a conta do órgão e para usuários com papel **Administrador**.

## 1. Usuários e papéis

Os papéis disponíveis são **Administrador**, **Pregoeiro** e **Equipe de Apoio** (veja [Visão geral](00-visao-geral.md#quem-é-quem-papéis)).

**Hoje o cadastro de usuários é feito pela administração da plataforma.** A aba **Usuarios** de **Configurações** ainda não permite incluir pessoas (em breve). Para incluir, alterar papel ou desativar alguém, peça à administração da plataforma informando nome, CPF, e-mail, cargo e papel.

Um novo órgão que ainda não usa o portal pede acesso em `/solicitar-acesso`. O pedido fica pendente até a administração aprovar.

Cada servidor pode alterar os próprios dados de perfil (nome, CPF, telefone, cargo, matrícula, CREA) e a própria senha.

> **Atenção.** A comissão de julgamento técnico, a banca do concurso e a comissão do diálogo competitivo são escolhidas entre os **usuários ativos** do órgão. Se um servidor precisa integrar a banca, ele precisa ter um usuário.

## 2. Autoridades e modo de formalização

A adjudicação e a homologação são atos da **autoridade competente** (art. 71, IV). No dia a dia, quem opera o sistema é o agente de contratação: ele registra o ato, e o **termo sai com os dados da autoridade**.

### Cadastrar a autoridade

1. Vá em **Configurações** › **Parâmetros de licitação**.
2. Desça até o cartão **Adjudicação e homologação — autoridade e formalização**.
3. Em **Autoridades competentes**, clique em **Nova autoridade**.
4. Preencha **Nome**, **Cargo** (ex.: Prefeito Municipal), **CPF (opcional)**, **E-mail (assinatura eletrônica)** e, se houver delegação, **Ato de delegação (nº)** e **Data do ato de delegação**.
5. Salve. Use **Tornar padrão** na autoridade que normalmente homologa. Ela vem marcada nos diálogos de adjudicar e homologar.

Uma autoridade que deixou o cargo pode ser removida; os termos antigos continuam com os dados de quando foram gerados.

Se nenhuma autoridade estiver cadastrada, o sistema usa o responsável informado no cadastro do órgão e, na falta dele, o nome do órgão. **Nada é bloqueado** por falta de cadastro, mas o termo fica mais pobre. Cadastre.

### Escolher o modo de formalização

Em **Modo de formalização**, escolha uma das três opções:

| Modo | Como funciona | Quando usar |
|---|---|---|
| **Registro direto** (padrão) | O agente registra a adjudicação/homologação e o efeito é imediato; o termo é gerado com os dados da autoridade escolhida. | A autoridade assina o termo impresso ou em outro sistema, fora do portal. |
| **Assinatura eletrônica** | O ato fica **pendente** até a autoridade assinar o termo no assinador (link por e-mail com CPF + código, ou pelo Portal de Assinaturas). Só depois da assinatura o resultado vale e o contrato/ata é gerado. | A autoridade assina digitalmente pelo portal. Exige e-mail da autoridade. |
| **Termo externo** | O agente anexa o termo já assinado pela autoridade ou a publicação no Diário Oficial (PDF, PNG ou JPG, até 20 MB). O efeito acontece no envio do arquivo. | A autoridade assina em papel ou o ato é publicado no DO antes do registro. |

> **Atenção.** No modo **Assinatura eletrônica**, autoridade sem e-mail não pode ser escolhida (aparece "sem e-mail"). Autoridade com CPF assina pelo link externo; sem CPF, pelo Portal de Assinaturas interno.

## 3. Parâmetros de licitação

Em **Configurações** › **Parâmetros de licitação** ficam os valores usados nas sessões e prazos. Cada órgão pode ajustar dentro dos limites da lei. O botão **Restaurar padrão** volta aos valores de fábrica; **Salvar** grava.

**Tempos da disputa**

| Parâmetro | O que controla |
|---|---|
| Tempo de inatividade (encerramento) | Duração da etapa aberta sem lances antes de encerrar |
| Prorrogação automática a cada lance | Minutos acrescentados quando há lance no fim (modo aberto: 2 min) |
| Intervalo mínimo entre lances | Tempo mínimo entre dois lances do mesmo fornecedor (padrão 0 — não é exigência legal) |
| Tempo aleatório mínimo / máximo | Faixa do sorteio do encerramento no modo aberto-fechado (máximo 10 min) |
| Lance final fechado (modo aberto-fechado) | Prazo do lance fechado (padrão 5 min) |
| Etapa aberta (modos híbridos) | Duração da etapa aberta no aberto-fechado (padrão 15 min) |
| Cancelamento direto de lance (fornecedor) | Segundos em que o fornecedor pode cancelar o próprio lance (15 s — IN 73, art. 21, §3º) |

**Recursos**: Prazo de intenção de recurso (mínimo 10 min), Prazo recursal e Prazo de contrarrazões (3 dias úteis — art. 165).

**ME/EPP e proposta**: Empate ficto no pregão (5%), Empate ficto nas demais modalidades (10%), Cota reservada máxima ME/EPP (até 25%), Validade padrão da proposta, Prazo da proposta adequada ao último lance (**mínimo 2 horas** — IN 73, art. 29).

**Limites legais (dispensa por valor)**: os valores do art. 75, I e II, atualizados por decreto. Quando sair um novo decreto, clique em **Novo limite**, informe a chave, o valor, a vigência e a fonte (ex.: "Decreto 12.343/2024").

> **Atenção.** Valores fora da lei são recusados. Por exemplo, o prazo da proposta adequada nunca fica abaixo de 2 h, e a janela de intenção de recurso nunca abaixo de 10 min.

## 4. Feriados municipais

Todos os prazos em dias úteis (publicação, dispensa, impugnação, recursos, manifestação antes de revogar) descontam os dias sem expediente **no órgão** (art. 183, III). Por isso, cadastre os feriados do município.

1. Vá em **Configurações** › **Feriados** (tela **Calendário de feriados**).
2. Use as setas **Ano anterior** / **Próximo ano** para escolher o ano.
3. Os **nacionais** (incluindo Sexta-feira Santa, calculada pela Páscoa) já vêm prontos. Os **estaduais** são cadastrados pela administração da plataforma.
4. Para um feriado do município, clique em **Novo feriado do órgão**, escolha **Data fixa** ou **Data móvel (Páscoa)**, informe a descrição (ex.: "Aniversário do município") e, se quiser, a base legal (ex.: "Lei Municipal nº 123/1990").
5. **Pontos facultativos** (Segunda e Terça-feira de Carnaval, Corpus Christi, Dia do Servidor) só contam como dia sem expediente se o órgão **adotar**. Use o botão de adoção na linha do ponto facultativo; para desfazer, **Deixar de adotar**.

> **Atenção.** Um feriado cadastrado vale só para o seu órgão. Ele passa a valer imediatamente em todos os cálculos de prazo, inclusive na data mínima mostrada na publicação.

## 5. Fluxos de aprovação

Os documentos da fase interna (DFD, ETP, TR, etc.) podem passar por etapas de aprovação antes de valer.

1. Vá em **Configurações** › **Fluxos de aprovação**.
2. Clique em **Novo fluxo de aprovação**.
3. Dê um **Nome do fluxo** (ex.: "Fluxo padrão do TR") e escolha o **Tipo de documento** (ou **Genérico (todos os documentos)**).
4. Em **Etapas**, inclua cada etapa na ordem: nome (ex.: "Aprovação do Jurídico"), **Setor responsável** e, se quiser, um **Usuário (opcional)** específico.
5. Salve.

Quando um documento desse tipo for enviado para aprovação, ele percorre as etapas na ordem. Os aprovadores decidem no menu **Aprovações** (veja [Fase interna](02-fase-interna-e-criacao.md#aprovações)).

## 6. Modelos de documento

Em **Configurações** › **Modelos de documento** o órgão personaliza os textos padrão da fase interna.

- Cada modelo tem **Nome do modelo**, **Fundamento legal**, **Texto introdutório (exibido no editor)**, **Seções do documento** (com texto padrão de cada seção), **Cabeçalho** e **Rodapé** (aceitam variáveis `{{...}}`).
- Use **Duplicar** para partir de um modelo pronto e personalizar.
- O texto do modelo é pré-preenchido quando um novo documento é criado.

## 7. Integração com o PNCP

O envio ao PNCP é automático (veja [PNCP](11-pncp.md)). Para funcionar:

| Quem | O quê |
|---|---|
| **Órgão** | Estar cadastrado no PNCP com o seu CNPJ e autorizar a plataforma a publicar em nome dele (pelo gestor do órgão no próprio PNCP). |
| **Administração da plataforma** | Configurar a credencial da plataforma no PNCP, o ambiente (treinamento ou produção) e vincular o CNPJ do órgão no PNCP. |

A aba **PNCP** em **Configurações** mostra a situação: **Conectado** ou **Não Configurado**, ambiente, login configurado e CNPJ do órgão. Não há campos para o órgão preencher ali: "A credencial da plataforma no PNCP e o CNPJ do órgão no PNCP são definidos pelo administrador da plataforma."

> **Atenção.** O órgão só publica sob o **próprio CNPJ** no PNCP. Tentativas de publicar sob outro CNPJ são recusadas.

## 8. Fase interna e tarefas

Em **Configurações** › **Fase interna e tarefas** o administrador do órgão define como as tarefas da fase interna são distribuídas. Os outros usuários só consultam.

**Modo de trabalho**
- **Simples** (padrão): uma pessoa pode conduzir o processo inteiro. Todas as tarefas vão para o agente de contratação do processo. Se o processo não tiver agente, vão para quem o criou. Se não houver nenhum dos dois, vão para a caixa de quem tem o papel "Agente de contratação".
- **Por setor**: cada etapa vai para o papel ou setor escolhido na tabela. Quem tem o papel (ou está no setor) vê a tarefa e pode **assumi-la**. A etapa do agente vai direto para o agente do processo.

**Manifestação do controle interno.** Liga ou desliga a etapa de controle interno, que fica entre o parecer e a publicação. Por enquanto ela é só um **aviso**: não impede a publicação. Ao desligar, as tarefas abertas dessa etapa são canceladas.

**Responsável e prazo por etapa.** Para cada etapa, escolha o papel e, se quiser, o setor, e o prazo em **dias úteis** (vazio = sem prazo). Os dias úteis seguem o calendário do órgão (parte 4, Feriados). O botão **Modelo Portaria 089** preenche os valores da Câmara de LEM: Compras 30, Contabilidade 3, Autorização 3, Minutas 5, Jurídico 5, Controle interno 3 e Publicação 5 dias úteis.

**Papéis dos usuários.** Na mesma tela, marque os papéis de cada usuário (Requisitante, Compras, Contabilidade, Jurídico, Controle interno, Autoridade, Agente de contratação) e o setor em que ele está lotado. Um usuário pode ter vários papéis. Os papéis **não mudam as permissões de sistema** (Administrador, Pregoeiro, Equipe de apoio). Os setores são cadastrados na aba **Setores**.

> **Atenção.** Ao salvar, as tarefas abertas são ajustadas na hora: a troca de modo muda o responsável das tarefas que ninguém reatribuiu à mão.

