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
| Painel para TV (links da TV e prazo dos contratos vencendo) | **Somente** conta do órgão ou Administrador do órgão | **Configurações** › aba **Painel para TV** |
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

**Manifestação do controle interno.** Liga ou desliga a etapa de controle interno, que fica entre o parecer e a publicação. Por enquanto ela é só um **aviso**: não impede a publicação (aparece como alerta amarelo no checklist antes de publicar e na tela da conformidade). Ao desligar, as tarefas abertas dessa etapa são canceladas.

**Dispensa eletrônica — padrão sugerido para novas dispensas.** Quem decide se a dispensa tem ou não disputa de lances é o **agente, em cada processo** (parte [02](02-fase-interna-e-criacao.md#publicar-pela-tela-da-conformidade-etapa-8)). Aqui fica só o valor que já vem marcado:
- **Com disputa de lances** (sessão de lances em tempo real, de 6 a 10 horas, depois do prazo de propostas — IN SEGES nº 67/2021, quando adotada pelo órgão);
- **Sem disputa de lances** (só recebimento de propostas no prazo do aviso — Lei nº 14.133/2021, art. 75, §3º); vence o menor preço e, no empate, a proposta **registrada primeiro**.

**O regulamento local adota a IN SEGES nº 67/2021.** Marque se o regulamento do órgão adota a IN 67: a conformidade passa a avisar (atenção, sem bloquear) a dispensa definida sem disputa de lances. Desmarcado (padrão), não há aviso.

**Autorização — quem assina.** Escolha os usuários que assinam o despacho de autorização e o papel de cada um no ato, além do **nome da autoridade** usado nos despachos (ex.: "Mesa Diretora"). O botão **Modelo Mesa Diretora (4)** cria as linhas Presidente, Vice-Presidente, 1º Secretário e 2º Secretário, para você escolher as pessoas. A autorização só vale quando **todos** assinam. Sem ninguém na lista, o despacho vai para os usuários com o papel **Autoridade**.

**Responsável e prazo por etapa.** Para cada etapa, escolha o papel e, se quiser, o setor, e o prazo em **dias úteis** (vazio = sem prazo). Os dias úteis seguem o calendário do órgão (parte 4, Feriados). O botão **Modelo Portaria 089** preenche os valores da Câmara de LEM: Compras 30, Contabilidade 3, Autorização 3, Minutas 5, Jurídico 5, Controle interno 3 e Publicação 5 dias úteis.

**Papéis dos usuários.** Na mesma tela, marque os papéis de cada usuário (Requisitante, Compras, Contabilidade, Jurídico, Controle interno, Autoridade, Agente de contratação e **Planejamento** — a unidade que monta o DFD consolidado e abre o processo) e o setor em que ele está lotado. Um usuário pode ter vários papéis. Os papéis **não mudam as permissões de sistema** (Administrador, Pregoeiro, Equipe de apoio). Mas alguns atos da fase interna exigem o papel: só o **Jurídico** abre diligência e assina o parecer, e só o **Controle interno** assina a manifestação do controle interno. Os setores são cadastrados na aba **Setores**.

> **Atenção.** Ao salvar, as tarefas abertas são ajustadas na hora: a troca de modo muda o responsável das tarefas que ninguém reatribuiu à mão.

### Chefe do setor

Na aba **Setores**, cada setor pode ter um **chefe** (um dos usuários do órgão). O chefe não precisa estar diretamente na tarefa: quando um processo **chega ao setor** (pela tramitação), tanto quem tem o papel do setor quanto o **chefe** são avisados e podem **receber** o processo em nome do setor. Sem chefe cadastrado, só quem tem o papel do setor recebe o aviso e a tarefa.

### Configurar o fluxo (Configurações › Fluxo)

Em **Configurações › Fluxo** (`/orgao/configuracoes/fluxo`) o administrador desenha, **por tipo de processo** (Dispensa, Inexigibilidade, Licitação), o caminho que a fase interna percorre — é a evolução do quadro "Responsável e prazo por etapa" acima, agora com a **ordem, as dependências entre etapas e o desenho** visíveis:

- Escolha o **tipo** no topo (Dispensa, Inexigibilidade ou Licitação). Cada tipo tem o seu modelo.
- Para cada etapa: **quem faz** (um papel, um setor ou uma pessoa), o **prazo em dias úteis**, se a etapa está **ligada** (só as opcionais podem ser desligadas — ex.: "autorização de início" e "indicação da modalidade", que a lei não exige), se a **IA prepara o rascunho** quando o processo chega, se pede **aprovação interna** antes de enviar adiante, se é **dispensável por ato** (só no Parecer, art. 53, §5º) e **de quais outras etapas ela depende**.
- **Antes do processo: demandas e DFD** (quadro no alto da tela, vale para todos os tipos de processo):
  - **Quem aprova a demanda** (o pedido do setor, na Central de Aprovações): por padrão, quem tem a permissão "aprovar demandas" (e o login do órgão); pode ser um papel, um setor ou uma pessoa.
  - **Quem monta o DFD e abre o processo** (a unidade de planejamento): por padrão, o papel **Planejamento**; o administrador do órgão sempre pode.
  - **2ª aprovação do DFD consolidado**: desligada por padrão. Ligada, escolha quem aprova (papel, setor, pessoa ou "aprovar demandas"); o processo só abre depois dela.
  - **Restaurar padrão** volta às regras do sistema.
- **A aprovação da demanda** (dentro do processo): escolha quem aprova — por padrão, quem tem a permissão "pode aprovar demandas", mas pode ser um papel, um setor ou uma pessoa específica. Enquanto ninguém aprovar, o processo não avança para as etapas seguintes (veja "Aprovação da demanda", na parte [02](02-fase-interna-e-criacao.md#aprovação-da-demanda)).
- O quadro mostra o **desenho** do fluxo (colunas por nível de dependência — etapas na mesma coluna podem andar ao mesmo tempo).
- **Salvar modelo** valida pela Lei 14.133 antes de gravar: uma etapa obrigatória não pode ser desligada, a autorização não pode vir antes da pesquisa e da reserva, e ciclos nas dependências são recusados — o erro sempre cita o artigo (ex.: "Falta a autorização da autoridade competente, art. 72, VIII"). Um aviso (não bloqueia) aparece quando a mesma pessoa está em duas funções que deveriam se controlar (ex.: quem faz a pesquisa também autoriza — art. 7º, §1º).
- **Restaurar modelo padrão** aplica de volta o modelo pronto **"Câmara — Portaria 089"**, perdendo os ajustes que o órgão tiver feito naquele tipo.
- Processos **já em andamento não mudam de caminho** quando o modelo é editado depois: cada processo guarda o retrato (o "instantâneo") do modelo no momento em que nasceu. Só quem faz, o prazo, a IA e o liga/desliga das etapas opcionais seguem o modelo mais recente.

## 9. Orçamento (dotações e leis)

Em **Configurações** › **Orçamento** o órgão mantém as tabelas que a **reserva orçamentária** dos processos usa — sem digitação livre na reserva:

- **Dotações orçamentárias**, por exercício: unidade orçamentária, programa (opcional), projeto/atividade, elemento de despesa, fonte de recurso e, se quiser, o saldo disponível (QDD). Em cada campo, código e nome (ex.: "3.3.90.40 — Serviços de TIC — PJ").
- **Leis orçamentárias** — tabela única de **LDO**, **LOA** e **PPA** (número, exercício ou quadriênio, publicação e ementa). Despacho, informação orçamentária e parecer citam sempre o mesmo número.

**Nova dotação**, **Nova lei**, editar (lápis) e **Desativar**/**Reativar** (a desativada some das listas, mas continua nas reservas já feitas). Qualquer servidor do órgão pode cadastrar; a Contabilidade também cadastra pelo **cadastro rápido** da tela da reserva.

## 10. Painel para TV

O **Painel para TV** é um quadro do setor de licitação para ficar ligado numa TV da sala. Ele mostra os processos em andamento por etapa, com quem cada um está e há quantos dias, o que está atrasado, as próximas sessões e os contratos que vão vencer. É **só leitura**, não pede login e se atualiza sozinho a cada minuto.

Quem configura: **somente** a conta do órgão ou um usuário **Administrador** do órgão, em **Configurações** › aba **Painel para TV**.

### O que aparece na TV

- **Números do topo:**
  - processos em andamento;
  - **atrasados** — tarefa com prazo vencido, ou etapa parada além do prazo configurado em **Fase interna e tarefas**;
  - publicados nos últimos 7 dias;
  - sessões e fins de prazo de propostas, hoje e nos próximos 7 dias;
  - contratos que vencem em até 30, 60 e 90 dias.
- **Quadro por etapa:** Demanda (DFD) · Planejamento (ETP/TR) · Pesquisa de preços · Reserva orçamentária · Autorização · Minutas e parecer · Publicação (inclusive "aguardando PNCP") · Recebendo propostas · Julgamento e habilitação · Recurso · Homologação · Contrato (formalização).
  - Na fase interna, a etapa é a mesma do quadro "Fluxo da fase interna" do processo. Depois da publicação, é a fase do processo.
  - Processos suspensos aparecem com a etiqueta **Suspenso**.
  - Processos concluídos, revogados, anulados, desertos e fracassados não aparecem.
- **Cartão do processo:**
  - PA e número da modalidade, objeto resumido e modalidade;
  - **com quem está**: a pessoa da tarefa aberta, ou o papel/setor; sem tarefa, o agente do processo;
  - **dias na etapa**;
  - **cor do prazo**: verde no prazo, amarelo vencendo em até 2 dias úteis, vermelho atrasado. Os dias úteis seguem o calendário de feriados do órgão (parte 4);
  - ícone vermelho com um número: quantidade de **achados de bloqueio abertos** na conformidade (o texto do achado não aparece);
  - na fase externa, a data e a hora da sessão ou do fim do prazo de propostas.
- **Contratos vencendo:** contratos **vigentes** com o fim da vigência dentro do prazo escolhido (padrão: 90 dias). Cada cartão mostra:
  - o contratado, o objeto e o fim da vigência;
  - os **dias restantes** (vermelho até 30, amarelo até 60);
  - o gestor do contrato (ou o fiscal, se não houver gestor);
  - quando o contrato informa: "Serviço contínuo — pode prorrogar (art. 107)", ou "Não prorrogável" (serviço contínuo que já chegou a 10 anos);
  - "Aditivo de prazo em andamento", quando há termo aditivo de prazo registrado cuja vigência ainda vai começar.
- **Rodapé:** próximas sessões e fins de prazo de propostas, publicações confirmadas no PNCP nas últimas 24 horas e contratos que vencem nos próximos 7 dias.

Quando não cabe tudo, a TV **troca de página sozinha a cada 25 segundos**. A coluna com muitos processos continua na página seguinte, e a última página é a dos contratos.

O canto superior direito mostra o relógio, a data, "atualizado às HH:MM" e a página atual. Se a internet cair, a TV continua com os últimos dados e mostra **"sem conexão desde HH:MM"** em vermelho até a conexão voltar.

> **O que a TV nunca mostra.** A tela fica à vista de quem passa, por isso ela não mostra, mesmo sendo de uso interno:
> - valor estimado de processo (nem o de orçamento sigiloso, art. 24);
> - fornecedores, quantidade ou valores de propostas;
> - texto de pareceres, diligências ou achados;
> - CPF, e-mail e telefone.
>
> Aparecem o valor e o contratado dos contratos vigentes (informação pública) e o nome dos servidores responsáveis.

### Gerar o link da TV

1. Em **Configurações** › **Painel para TV**, digite o **nome da TV** (ex.: "TV da sala de licitações") e clique em **Gerar link**.
2. **Copie o link na hora** (botão **Copiar**). Por segurança, o sistema guarda só uma "impressão" do link, e ele **não é mostrado de novo**. Se perder, revogue e gere outro.
3. Pode haver vários links ativos (uma TV por setor). A lista mostra o nome, quem criou e o **último acesso** de cada um. O último acesso ajuda a saber se a TV está ligada. O lápis renomeia o link.
4. **Revogar** desliga o link. Na próxima atualização (em até 1 minuto), a TV passa a mostrar "Painel indisponível". Para voltar, gere um link novo e troque na TV.
5. Em **Contratos vencendo**, escolha 30, 60, 90 ou 120 dias.
6. **Abrir pré-visualização** abre o painel numa aba do navegador, com o seu login, para conferir antes de levar à TV.

> **Atenção.** Trate o link como uma chave: quem o tiver vê o painel do órgão. Não publique o link em grupos abertos nem em sites. Se ele vazar, revogue.

### Ligar numa TV (passo a passo)

O painel funciona em qualquer navegador atual. Depois de aberto, não precisa de mouse nem de teclado. Escolha uma das formas:

- **Smart TV com navegador** (Samsung, LG, Android TV/Google TV):
  1. Abra o navegador da TV.
  2. Digite ou cole o link. Um jeito prático é salvar o link como favorito na TV.
  3. Ative a **tela cheia** do navegador.
- **Chromecast / Google TV com controle:**
  1. Instale um navegador na TV (ex.: Chrome ou "TV Bro").
  2. Abra o link e deixe em tela cheia.

  Também dá para **transmitir uma aba do Chrome** de um computador, mas o computador precisa ficar ligado com a aba aberta.
- **Mini-PC ou notebook ligado na TV (HDMI):** abra o Chrome ou o Edge em **modo quiosque**, que já abre em tela cheia e sem barras:
  - Chrome: `chrome --kiosk --noerrdialogs --disable-session-crashed-bubble "https://www.portaldcp.com.br/painel-tv/SEU-LINK"`
  - Edge: `msedge --kiosk "https://www.portaldcp.com.br/painel-tv/SEU-LINK" --edge-kiosk-type=fullscreen`

  Coloque o comando na inicialização do Windows para a TV voltar sozinha depois de uma queda de energia. Sem modo quiosque, aperte **F11** (ou dê **dois cliques** na tela) para a tela cheia.

Dicas:
- Desligue a **economia de energia** e o **descanso de tela** da TV ou do mini-PC, senão a tela apaga.
- O painel se ajusta sozinho a TVs **Full HD (1920×1080)** e **4K**. Em 4K, tudo fica proporcionalmente maior. Se o navegador estiver com zoom, volte para 100%.
- Não precisa recarregar a página: ela se atualiza a cada minuto. Depois de muitas horas ligada, ela se recarrega sozinha de madrugada.
