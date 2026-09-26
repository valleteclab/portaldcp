# Plano — Fase interna simples, guiada e "feita aqui ou anexada"

> 26/09/2026 · Referência real: Câmara Municipal de Luís Eduardo Magalhães — autos da Dispensa 003/2025 (PA 005/2025) e das Inexigibilidades 004/2025 (PA 033/2025) e 008/2025 (PA 043/2025), e o regulamento próprio da Lei 14.133 (**Portaria 089/2024**).
> Status: **Entrega 1 (Base) concluída** na branch `claude/fase-interna-e1` (ver §7). Entregas 2 a 7 pendentes.

## 1. O problema

- **O mesmo processo aparece em 4 telas**, e o usuário se perde entre elas:
  - o assistente (`fase-interna/processos/novo`);
  - o cockpit da fase interna (`fase-interna/processos/[id]`);
  - a tela do processo (`processos/[id]`);
  - o "Editar processo" (`processos/[id]/editar`).
- **Na prática, quem faz quase tudo é o setor de licitação**, informalmente. Pedido, estudo técnico, termo de referência, pesquisa e minutas saem do mesmo setor, muitas vezes em Word. O parecer vem assinado pelo procurador, e a autorização, pelo Presidente.
- **O sistema não aceita o documento feito fora.** O backend tem `importar-documento` (status IMPORTADO), mas recebe só JSON, nenhuma tela o usa e o upload que existe (`documentos_licitacao`) não conta no checklist.
- O botão "Importar Fase Interna" em Dados Básicos é **falso**: não grava nada.

## 2. Como a Câmara de LEM faz de verdade

Fluxo dos autos e da Portaria 089/2024 (arts. 40–43, 47–48, 52, 56, 79–87):

| # | Peça | Quem assina | Prazo (Portaria 089) |
|---|---|---|---|
| 0 | Verificação de estoque, contrato ou ata vigente | Licitação/Almoxarifado | 3 dias úteis |
| 1 | DFD (Documento de Formalização de Demanda) | Setor que pede | — |
| 2 | Pesquisa de preços e mapa (≥ 3 preços; média, mediana ou menor valor) | Compras | 30 dias úteis |
| 3 | Indicação da modalidade (depois da pesquisa) | Licitação | — |
| 4 | Estudo técnico e riscos ("se for o caso") e termo de referência | Diretoria Administrativa | — |
| 5 | Despacho autorizando o prosseguimento | Presidente da Mesa | — |
| 6 | Informação de dotação e reserva | Contabilidade | 3 dias úteis |
| 7 | Portaria de designação do agente e da equipe | Presidente (Diário Oficial) | — |
| 8 | Relatório do agente, minuta do aviso ou contrato, certidões do contratado | Agente de contratação | 5 dias úteis |
| 9 | Parecer jurídico (pode devolver) | Procuradoria | 5 dias úteis |
| 10 | Controle interno | Controladoria | 3 dias úteis |
| 11 | Publicação (Diário Oficial, site, PNCP) | Licitação | 5 dias úteis |
| — | Fase externa. Na dispensa: parecer nº 2, adjudicação e homologação, aviso de resultado, contrato, extrato | — | — |

**O que tiramos disso:**
- (a) **A ordem varia na prática.** No PA 033, o estudo técnico foi feito depois da pesquisa. Então valem as **dependências**, não a sequência rígida.
- (b) Quase todas as peças são **documentos assinados por alguém**, não formulários.
- (c) Os **autos são um PDF só, com folhas numeradas**.
- (d) A **modalidade sai da pesquisa de preços** (Portaria 089, art. 56).

### 2.1 Caso completo: PA 139/2025, Dispensa Eletrônica 029/2025 (software da TV Câmara, R$ 61.753,44, 184 folhas, feita na BLL)

**Sequência dos autos:**

| Etapa | Peças | Data |
|---|---|---|
| Abertura | Capa e DFD | 10/12 |
| Planejamento | ETP com matriz de riscos | 14/11 |
| Pesquisa de preços | Solicitação de cotação (17/11); certidão de pesquisa de Compras (painéis sem resultado, 3 cotações diretas, menor preço); CI à Contabilidade e informação orçamentária dividida por exercício | 10/12 |
| Termo de referência | TR | 10/12 |
| Autorização | **Despacho da Mesa Diretora** autorizando e fixando o **teto** | 10/12 |
| Instrução | Portaria de designação (a mesma para o ano todo); relatório do agente; minuta do aviso com anexos (TR em versão sigilosa, modelos, minuta do contrato) | — |
| Análise | CI à Procuradoria e **parecer nº 1**, que confere o art. 72, as cláusulas do art. 92 e o sigilo do art. 24 | 17/12 |
| Publicação | Diário Oficial do Legislativo e PNCP (**enviado pela BLL**) | 13/01 |
| Sessão (BLL) | Propostas de 14/01 a 20/01; uma única proposta, exatamente no valor estimado (sigiloso); pedido de redução recusado; habilitação em 24 h | 20/01 |
| Relatórios BLL | Ata de sessão (chat), relatório de lances, classificação, vencedores, propostas | — |
| Análise | **Parecer nº 2, da fase externa** | 23/01 |
| Dotação | **Renovada por mudança de exercício** (CI, CI, dotação 045/2026, dividida entre 2026 e 2027) | — |
| Encerramento | Adjudicação e homologação pela **Mesa (4 assinaturas)**; aviso de resultado; extrato; contrato; publicação no Diário Oficial | 30/01 a 03/02 |

**O que isso ensina para o sistema:**
1. **Os autos são montados no fim, não na ordem em que as coisas acontecem.** O ETP é de 14/11, a cotação de 17/11 e todo o resto de 10/12, incluindo o DFD, que já cita o valor da pesquisa. Isso confirma o "anexar feito fora": cada peça precisa guardar a data dela, e a ordem dos autos é lógica, não cronológica.
2. **Erros que o sistema evitaria**, porque os dados seriam digitados uma vez só e gerariam todas as peças:
   - O enquadramento aparece como "art. 75, **I**" no extrato, em uma das duas cópias do relatório e na minuta do aviso, mas como "**II**" no aviso publicado, no contrato e no parecer.
   - O relatório do agente cita o limite de R$ 125.451,15 (que é do inciso I) como se fosse do inciso II; o parecer usa o valor certo, R$ 62.725,59.
   - O contrato assinado vincula o "PA **115/2025** / Dispensa **025/2025**", um resto de outro processo.
   - O aviso de resultado diz "ocorrida em **18/12/2025**", mas a sessão foi em 20/01/2026.
   - A cotação usa a unidade "MESES", e o TR usa "Serviço – 12 meses".

   Isso vira a **conferência de consistência**: número do processo, inciso, valores e datas iguais em todas as peças. Nos PDFs enviados, a IA lê e aponta as divergências (etapa futura).
3. **Sinais que o sistema deveria alertar:**
   - O ETP pede solução "similar ou superior ao **ARION** (SNEWS)", uma **marca** (art. 41 I: a indicação de marca só cabe justificada).
   - 2 das 3 cotações são do mesmo produto: o fabricante e uma revenda SNEWS.
   - O ETP foi assinado por um servidor que também é pregoeiro suplente na portaria. Não é proibido, mas é um ponto de segregação de funções a registrar (art. 7º §1º).
   - O valor vencedor é idêntico ao estimado sigiloso.
4. **Dois pareceres:** o prévio e o da **fase externa**, antes da adjudicação. Os dois precisam existir como peças.
5. **Dotação por exercício e renovação na virada do ano**, o que acontece com frequência em contratações de dezembro.
6. **A autoridade pode ser colegiada:** a Mesa Diretora tem 4 signatários no despacho, na adjudicação e na homologação.
7. **Não há manifestação do controle interno nos autos**, embora a Portaria 089 (art. 85) exija. Na prática ele é pulado. Por isso o sistema deve **avisar** a falta, mas sem travar, até o órgão decidir tornar a peça obrigatória.
8. **Lances na dispensa:**
   - O aviso diz que "nos termos da Portaria 089 não há previsão de disputa de lances", só o cadastro de propostas.
   - O art. 75 da própria Portaria 089, porém, manda seguir a IN 67, que tem etapa de lances.
   - A Etapa A tornou a janela de lances de 6 a 10 h obrigatória.

   **Decisão pendente:** ter a configuração "dispensa sem etapa de lances", só para órgãos cujo regulamento local não adote a IN 67.
9. **O PNCP foi alimentado pela BLL** ("Fonte: BLL Compras"). O Portal DCP faz isso direto e ainda gera sozinho os relatórios que a BLL gera: ata, lances, classificação e vencedores.

## 3. Princípios do novo desenho

1. **Toda peça tem três caminhos**, e os três contam igual no checklist:
   - **Fazer aqui**: modelo + IA + editor, como já existe.
   - **Anexar feito fora**: PDF + número, data e quem assinou.
   - **Não se aplica**: com justificativa, só quando a lei permite. Exemplo: estudo técnico e riscos na contratação direta, "se for o caso" (art. 72, I).
2. **Uma pessoa pode fazer o processo inteiro.** Não há passagem obrigatória entre setores. Tramitação, caixa por setor e prazos são **opção do órgão**, desligada por padrão.
3. **Um processo, uma tela** (`processos/[id]`). A fase interna aparece na área "Etapa atual". Editor, pesquisa de preços e riscos abrem a partir dela e voltam para ela.
4. **O dado é digitado uma vez.** Os itens (descrição, unidade, quantidade, valor) vivem no editor de itens de "Editar processo" e alimentam as peças, o aviso ou edital e o PNCP. Com a pesquisa feita fora, o valor unitário é digitado no item: o PNCP exige esse dado.
5. **O checklist vem da lei, e o órgão pode acrescentar.**
   - Na contratação direta, as 8 peças do art. 72. Na licitação, as do art. 18.
   - O regulamento do órgão pode tornar peças obrigatórias. Exemplo: o controle interno na Câmara de LEM (Portaria 089, art. 85).
   - Cada linha do checklist cita o artigo.
6. **Reaproveitar, não recriar.** Continuam valendo:
   - o documento da fase interna (`documento_fase_interna`, com status IMPORTADO e origem ARQUIVO);
   - `getInstrucao` e `documentos-obrigatorios.ts`;
   - a pesquisa de preços com os agentes;
   - o editor e a derivação entre peças;
   - `pre-publicacao.ts`, a tramitação e as aprovações;
   - o `processo-pdf`.

## 4. Entregas

Cada entrega é uma PR separada, com testes e2e de isolamento (upload só pelo órgão dono; nada vaza entre órgãos ou processos).

### F1 — "Fazer aqui ou anexar" em todas as peças *(base de tudo)*
- **Backend:** `POST /fase-interna/:id/documentos/:tipo/anexo` com upload multipart (PDF, limite de tamanho, SHA-256).
  - Grava o documento como IMPORTADO/ARQUIVO, com metadados: número (ex.: "Parecer 013/2025"), data, signatário (nome e cargo) e observação.
  - Conta como OK no `getInstrucao` e no checklist de publicação.
  - Substituir o anexo gera nova versão, e a anterior fica no histórico.
- **Unificar o armazenamento:** o anexo de fase interna feito em `documentos_licitacao` passa a alimentar o mesmo checklist, ou migra para `documento_fase_interna`, em migração de boot idempotente. Acaba a situação "anexei e o sistema diz que falta".
- **Tela:** cada linha do checklist mostra o status e os botões **Fazer aqui · Anexar PDF · Não se aplica**. Esse último só aparece quando a lei permite.
- **Remover** o botão falso "Importar Fase Interna".

### F2 — Uma tela só por processo *(a navegação já proposta)*
- Na fase interna, a área "Etapa atual" de `processos/[id]` lista as peças agrupadas:
  - **Planejamento:** DFD, estudo técnico, riscos, termo de referência;
  - **Preço:** pesquisa e mapa;
  - **Orçamento:** dotação;
  - **Análise:** parecer e controle interno;
  - **Decisão:** autorização e designação.
- `fase-interna/processos/[id]` passa a redirecionar para `processos/[id]`. Tramitação, comentários e permissões viram abas dela.
- Editor, preços, riscos e "Editar processo" ganham um "← Voltar ao processo" que volta para a tela principal.
- O assistente fica só para **criar**: ao salvar ou sair, sempre abre `processos/[id]`.

### F3 — "Já tenho a fase interna pronta" *(feita fora, de uma vez)*
- Na criação, a primeira pergunta é **"Onde foi feita a fase interna?"**.
- Resposta **"Fora do sistema"** leva a 3 passos, no modelo das plataformas BLL, BBMNET e Licitanet:
  1. **Dados:** modalidade, objeto, fundamento, processo administrativo nº.
  2. **Itens:** o mesmo editor, com catálogo, planilha e digitação.
  3. **Documentos:** envio de vários PDFs de uma vez. Para cada arquivo, o usuário indica a peça (DFD, estudo técnico...).
- Etapa seguinte, opcional: a IA sugere a peça lendo o texto do PDF, e o usuário confirma.
- Termina na tela do processo com o checklist mostrando só o que falta.

### F4 — Checklist por modalidade, pela lei e pelo regulamento do órgão
- Uma tabela única de regras por modalidade (art. 72 e art. 18), com obrigatoriedade, possibilidade de "não se aplica" e artigo.
- A dispensa do parecer (art. 53 §5º) fica permitida quando o órgão tiver o ato que autoriza.
- Na **configuração do órgão**: peças extras obrigatórias (ex.: controle interno) e a exigência ou não de estudo técnico, conforme o regulamento local. Modelo pronto "Portaria 089/2024 — Câmara de LEM".

### F5 — Autos do processo em PDF
- `processo-pdf` junta todas as peças, **geradas e anexadas**, na ordem, com índice e **folhas numeradas**, como nos autos da Câmara.
- Depois da fase externa, entram também atas, resultado, contrato e publicações.

### F6 — Tramitação e prazos *(opcional por órgão, depois)*
- Ligar a tramitação que já existe como fluxo:
  - caixa de entrada por setor (hoje só o ADMIN vê a do órgão);
  - prazo por etapa, com os prazos da Portaria 089 como modelo;
  - devolução com despacho.
- Perfis:

  | Perfil | Função |
  |---|---|
  | Solicitante | Faz o pedido |
  | Compras | Pesquisa de preços |
  | Contabilidade | Dotação e reserva |
  | Jurídico | Parecer |
  | Controle interno | Análise de regularidade |
  | Autoridade | Autoriza e ratifica |

- Só para quem quiser. O modo simples continua sendo o padrão.

### F7 — Enquadramento assistido *(depois)*
- Antes de comprar, o sistema avisa se há contrato ou ata vigente do mesmo objeto, ou saldo no almoxarifado (Portaria 089, arts. 40–43).
- Depois da pesquisa, sugere a modalidade pelo valor (art. 75, I/II) e **soma o que já foi contratado do mesmo objeto no ano** (fracionamento, art. 75 §1º).
- Gera o **relatório do agente de contratação** (razão da escolha, justificativa do preço, enquadramento) a partir dos dados.

### Ajustes vindos do PA 139/2025 (§2.1)
- **F1:** cada peça anexada guarda a **data da peça**, que não é a data do envio.
- **F1:** peças novas no catálogo:
  - **parecer da fase externa**, depois da sessão e antes da adjudicação;
  - **relatório do agente**;
  - **portaria de designação**, anexada uma vez por ano e reaproveitada em todos os processos.
- **F4:**
  - **autoridade colegiada**, com vários signatários (Mesa Diretora);
  - **dotação por exercício**, com o ato "renovar dotação" na virada do ano;
  - o controle interno começa como **aviso**, e não como bloqueio.
- **F5:** os autos seguem a **ordem lógica** das peças, e não a ordem das datas.
- **F7:**
  - **conferência de consistência**: número do processo, inciso, valores e datas iguais em todas as peças, geradas ou anexadas (nas anexadas, com leitura por IA);
  - **alertas de risco**: marca no ETP, cotações do mesmo produto, segregação de funções, vencedor igual ao estimado sigiloso.
- **Etapa A (decisão pendente):** configuração por órgão "dispensa sem etapa de lances" (só propostas), para regulamentos locais que não adotem a IN 67.

**Ordem sugerida:** F1 → F2 → F3 → F4 → F5. F6 e F7 quando houver demanda.

## 5. Decisões para o dono

1. **Modo simples como padrão** (sem tramitação obrigatória)? *Recomendado: sim.*
2. **Pesquisa de preços feita fora:** basta anexar o mapa e digitar o valor unitário nos itens? *Recomendado: sim, porque o PNCP exige o valor por item.*
3. **Controle interno obrigatório para a Câmara de LEM** (Portaria 089, art. 85)? *Recomendado: sim, via configuração do órgão (F4).*
4. **IA para reconhecer as peças enviadas em PDF (F3):** fazer agora ou numa segunda etapa? *Recomendado: segunda etapa.*

### Decisões do dono (26/09/2026)

| # | Tema | Decisão |
|---|---|---|
| 1 | Modo de operação | **Modo simples é o padrão.** Mas alguns setores continuarão manuais: toda peça precisa aceitar o anexo feito fora, inclusive dentro do fluxo com tarefas. |
| 2 | Pesquisa de preços feita fora | Anexar o mapa e digitar o valor unitário nos itens. |
| 3 | Controle interno | Opção por órgão para **desativar**. |
| 4 | IA que reconhece os PDFs | Fica para a **segunda etapa**. |
| 5 | Lances na dispensa | O **órgão escolhe**: com etapa de lances (IN 67, padrão) ou sem etapa de lances (só propostas). |

## 5.1 SPEC da fase interna (docs/fase interna/…/SPEC.md + mockups)

O dono trouxe uma SPEC com 10 telas. Ela é a **referência principal**, e este plano a complementa.

**O que a SPEC acrescenta:**
- máquina de 8 etapas, cada uma com responsável e documento;
- **caixa de tarefas** por pessoa;
- **portões** A (limite e fracionamento), B (art. 72) e C (conformidade);
- **motor de conformidade** com regras testáveis e os casos do PA 139/2025 como fixtures;
- diligência do parecer que devolve o processo sem perder o que já foi feito;
- numeração de folhas na assinatura;
- autorização pelo celular.

### Correções à SPEC (lei e realidade)

1. **Limite do art. 75, II: a SPEC e o mockup de Pesquisa estão errados.**
   - O Decreto 12.343/2024 fixou para 2025: **inciso I = R$ 125.451,15** (obras e serviços de engenharia) e **inciso II = R$ 62.725,59** (outros serviços e compras). O parecer 167/2025 dos autos usa o valor certo.
   - Com isso, a Dispensa 029/2025 consome **98,4%** do limite (e não 49,2%), o que já dispara o `LIM-02` (acima de 80%).
   - A tabela `LimiteDispensa` precisa ser **por exercício**. A que existe (`parametros-licitacao`) ainda tem os valores de 2024 (119.812,02 e 59.906,02). O valor de 2026 depende do decreto do ano, a ser informado ou conferido.
2. **"Nenhuma data é digitada; vem da assinatura."**
   - Vale para as **peças geradas e assinadas no sistema**.
   - A **peça anexada** (decisão 1) guarda a data do documento, informada por quem anexa, e também a data do envio, registrada pelo sistema.
   - A regra `CRONO-01` passa a usar a data do documento.
3. **"A etapa seguinte só abre quando a anterior está assinada."**
   - Os autos reais mostram outra ordem: o ETP antes da pesquisa e quase tudo feito no mesmo dia.
   - A ordem das 8 etapas vira **sugestão**. O que trava são as **dependências**:
     - a autorização exige o portão B;
     - o parecer exige as minutas;
     - a publicação exige o portão C.
   - No modo simples, uma pessoa pode cumprir etapas de vários setores.
4. **`codigo_catser` obrigatório:** o certo é **CATMAT (bens) ou CATSER (serviços)**. O fracionamento usa a classe do código e a unidade gestora.
5. **`MARCA-01` como bloqueio por "ou equivalente": é rígido demais.**
   - O art. 41, I, "d" permite citar marca **apenas como referência**, e "ou similar/equivalente" é justamente a forma correta de fazer isso.
   - A regra fica assim:
     - marca cadastrada citada **sem** a marcação "apenas como referência" e sem justificativa do art. 41, I: **bloqueio**;
     - marca citada **com** "similar/equivalente": **atenção**, com justificativa obrigatória.
6. **Etapa 8 (publicação):** a publicação é confirmada pelo PNCP, pelo fluxo AGUARDANDO_DIVULGACAO da Etapa A. O `PRAZO-01` conta a partir da confirmação.
7. **Lances:** depende do que o órgão escolheu (decisão 5).
8. **Controle interno:** entra como etapa opcional entre o parecer e a publicação, desativável por órgão (decisão 3).

### O que se reaproveita (mapa SPEC → código atual)

| SPEC | Existe hoje | Ação |
|---|---|---|
| Processo, `fundamento_legal`, sigilo | `licitacoes` (`sigilo_orcamento`, fase/situação, `TransicoesService`) | Acrescentar `fundamento_legal` estruturado (fonte única) e a etapa da fase interna |
| ItemDemanda | itens da licitação (CATMAT/CATSER) + editor `ItensTab` | Reaproveitar |
| Documento, versão, status | `documento_fase_interna` (status, origem ARQUIVO/IMPORTADO, editor por seções, modelos, derivação) | Acrescentar versão/substitui, folhas, data do documento e upload multipart (F1) |
| Assinatura | módulos `assinaturas` e `portal-assinaturas` | Ligar à peça, com signatários múltiplos (Mesa) |
| Tarefa e caixa | `tramitacao` + `aprovacoes/caixa` (hoje só por setor/ADMIN) | Criar a **Tarefa**, que é nova, e manter a tramitação como histórico |
| Cotação, parâmetros do art. 23, método | pesquisa de preços (fontes, cotações com comprovante, metodologia, agentes) | Reaproveitar e acrescentar a evidência "consultado sem retorno" |
| ReservaOrcamentaria por exercício | só o documento DO (formulário) | Criar a estrutura, com linhas por exercício e renovação |
| LimiteDispensa | `parametros-licitacao` (valores de 2024) | Tabela por exercício, com valores atualizados |
| Regra/Achado (conformidade) | `documento-estruturado` com endpoint de conformidade, e `pre-publicacao.ts` | O motor de regras é novo, com os portões ligados às pré-condições dos atos |
| Diligência | devolução de tramitação | Nova, ligada à peça-alvo e gerando tarefa |
| Autos em PDF | `processo-pdf` | Numerar as folhas e ordenar as peças |

### Nova ordem de entregas (substitui F1–F7)

1. **Base:** `fundamento_legal` único e etapa da fase interna; `LimiteDispensa` por exercício; peça com versão, data e folhas; upload (fazer aqui ou anexar); assinatura com vários signatários.
2. **Tarefas e caixa de entrada** por pessoa e setor (modo simples: tudo pode cair para uma pessoa só).
3. **Telas por etapa**, seguindo os mockups: DFD → ETP (com a IA que já existe) → TR → Pesquisa → Reserva → Autorização (celular) → Parecer com diligências. Tudo dentro da tela única do processo.
4. **Motor de conformidade e portões** A, B e C, com as regras da SPEC já corrigidas e testes usando o PA 139/2025 como fixture.
5. **Publicação:** ligar ao AGUARDANDO_DIVULGACAO; opção por órgão de dispensa com ou sem lances; opção de controle interno.
6. **Autos em PDF** com folhas numeradas.
7. **Segunda etapa:** IA lendo os PDFs anexados (reconhecer a peça e conferir a consistência).

## 7. Entrega 1 — CONCLUÍDA (26/09/2026)

Branch `claude/fase-interna-e1`. Sem push/PR nesta etapa.

### 7.1 O que foi feito

**1. Fundamento legal único (fonte da verdade)**
- `licitacoes.fundamento_legal` (varchar 20, `type` explícito). Códigos em `backend/src/licitacoes/fundamento-legal.ts` (`FundamentoLegal`): `ART28_I…V`, `ART74_CAPUT`, `ART74_I…V` (com alíneas do III), `ART75_I…XVI` (com alíneas do III e IV), `ART78_I…III` — **um para um com a tabela "Amparo Legal" do PNCP** (ids 1 a 50).
- Funções puras: `fundamentoPadrao` (o mesmo que o sistema sempre deduzia), `fundamentosDaModalidade`, `motivoFundamentoInvalido`, `fundamentoEfetivo` (gravado se válido, senão o padrão), `textoDoFundamento`, `amparoPncpDoFundamento`, `incisoLimiteDoFundamento`, `fundamentoDoTexto` (lê "art. 75, inciso II" de texto livre).
- Quem lê o campo: `amparoLegalIdPncp` e `fundamentoLegalTexto` (PNCP e tela do processo), variáveis `{{licitacao.fundamento_legal}}` e `{{licitacao.fundamento_referencia}}` dos modelos (autorização e amparo da justificativa passaram a usá-las; modelos do sistema com o texto antigo são atualizados no boot), aviso de contratação direta (linha "Fundamento legal") e o consumo do limite.
- Criação grava o padrão (`@BeforeInsert` na entidade, cobre todos os caminhos de criação); edição valida contra a modalidade (400), volta ao padrão se a modalidade trocar e acompanha o tipo (75, I ↔ II) quando estava no padrão. Depois da publicação o campo é regra do edital (só por retificação), sem acusar processo antigo que devolve o próprio padrão.
- Migração de boot `MigracaoFundamentoLegalBootService` (fila única, `FUNDAMENTO_LEGAL_MIGRAR_NO_BOOT=false` desliga): só linhas com o campo NULL; lê o amparo da peça JC (seção `amparo_legal`) ou do contrato do processo; senão, o padrão.

**2. Limites da dispensa por exercício + consumo**
- Tabela oficial em `backend/src/parametros-licitacao/limites-dispensa.ts` com o ato normativo: 2021 (Lei 14.133: 100.000,00 / 50.000,00), 2022 (Dec. 10.922/2021: 108.040,82 / 54.020,41), 2023 (Dec. 11.317/2022: 114.416,65 / 57.208,33), 2024 (Dec. 11.871/2023: 119.812,02 / 59.906,02), 2025 (Dec. 12.343/2024: 125.451,15 / 62.725,59), 2026 (Dec. 12.807/2025: 130.984,20 / 65.492,11). 2023 e 2024 conferidos nas fontes oficiais (Planalto/Câmara); 2022 é de memória — conferir.
- `limiteDispensa(exercicio, inciso)` pura; sem o decreto do ano, devolve o do último exercício com `provisorio: true`.
- `limites_legais` ganhou `exercicio` (int). A semente antiga gravava os valores de **2024** rotulados como "2025, Dec. 12.343/2024" — a migração de boot (`LIMITES_DISPENSA_MIGRAR_NO_BOOT=false` desliga) reconhece o valor oficial, corrige o exercício/ato (ou apaga a cópia redundante) e cria os exercícios que faltam. Linhas de órgão não são tocadas.
- `consumoDoLimite(registros, orgao, exercicio, ramo, inciso)` pura; **ramo = classe CATMAT/CATSER + unidade gestora** (`ramoDoItem`: classe do catálogo `itens_catalogo.codigo_classe`, depois `itens_licitacao.classe_catalogo`; sem classe → o próprio código; sem código → "SEM_CODIGO" do tipo). Somam só dispensas do art. 75, I/II do mesmo órgão/exercício, fora as revogadas/anuladas/desertas/fracassadas e itens cancelados/desertos/fracassados; valor homologado quando houver, senão o estimado. `percentualDoLimite` trunca (98,45% → 98,4%).
- Todos os usos dos valores fixos trocados: frontend (`ClassificacaoTab` tinha 100 mil / 50 mil; processo e demandas usavam `limites/vigente`).

**3. Peça com versão, data e folhas + "fazer aqui ou anexar"**
- `documentos_fase_interna`: `data_documento`, `total_paginas`, `folha_inicial`, `folha_final`, `numero_peca`, `signatarios_informados` (jsonb nome/cargo), `observacao_anexo`, `documento_orgao_id`, `documento_assinatura_id`, `signatarios_exigidos`. Status novos: `AGUARDANDO_ASSINATURA`, `ASSINADO`, `SUBSTITUIDO`. **Decisão:** a "versão que esta substitui" (o `substitui_documento_id` da SPEC) reaproveita a coluna que já existia, `versao_anterior_id` — sem duplicar; a data do envio do anexo reaproveita `data_importacao`; a origem reaproveita `origem` (INTERNO × ARQUIVO).
- Regras puras em `backend/src/fase-interna/peca-regras.ts`: data da peça anexada obrigatória, não futura (hoje de Brasília), gravada ao meio-dia de Brasília; data da peça assinada = última assinatura; `planoNovaVersao`; `proximaFaixaDeFolhas`; `pecaContaComoPronta`. Folhas atribuídas em `folhas-autos.ts` com a linha da licitação travada (`FOR UPDATE`), em sequência por processo, quando a peça é anexada ou termina de ser assinada; versões substituídas guardam as suas.
- `POST /fase-interna/:licitacaoId/documentos/:tipo/anexo` (multipart `arquivo`; só PDF — mimetype, extensão, assinatura `%PDF-` e leitura das páginas com pdf-lib; limite `FASE_INTERNA_ANEXO_MAX_MB`, padrão 25; SHA-256; pasta privada `licitacoes/<licitacaoId>/`, cujo dono o `AcessoArquivosService` já resolve). Grava IMPORTADO/ARQUIVO como nova versão (a anterior vira SUBSTITUIDO; assinatura pendente da anterior é cancelada). Conta como pronta em `getInstrucao`, no gate dos atos e na pré-publicação. Recusa: tipo desconhecido, processo encerrado, e peça de fase interna depois da divulgação (409; o parecer da fase externa continua aceito).
- `GET /fase-interna/documento/:id/arquivo` (só o órgão dono). "Fazer aqui" sobre peça anexada/assinada/aguardando assinatura abre versão nova em elaboração.
- `getInstrucao` devolve por linha `pode_nao_se_aplicar` e o resumo `peca` (origem, nº, data, folhas, versão). Contratação direta ganhou as linhas "se for o caso": designação do agente (DP), relatório do agente (RAG) e minuta do contrato (MC).
- Catálogo (`CATALOGO_PECAS` em `documentos-obrigatorios.ts`): novos `RELATORIO_AGENTE` (RAG), `PARECER_FASE_EXTERNA` (PJE), `MINUTA_CONTRATO` (MC); equivalentes reaproveitados: DESPACHO_AUTORIZACAO = AA, INFO_ORCAMENTARIA = DO, PARECER_JURIDICO = PJ, PORTARIA_DESIGNACAO = DP, MINUTA_AVISO = ME.
- **Portaria de designação** como documento do órgão com vigência: entidade `documentos_orgao` (`DocumentoOrgao`: número, exercício, data, vigência, arquivo, hash, páginas, signatários, versão, `substitui_documento_id`, `ativo`). Endpoints `GET/POST /fase-interna/orgao/portarias` (órgão do token; admin com `?orgao_id=`), `GET /fase-interna/orgao/portarias/:id/arquivo`, `POST /fase-interna/:licitacaoId/portaria-designacao` (junta a portaria ativa do exercício, ou `portaria_id`, como peça DP que REFERENCIA o arquivo, com folhas).
- **Unificação "anexei e diz que falta" — decisão:** fonte única `documentos_fase_interna`. O anexo de fase interna feito pela aba Documentos (`documentos_licitacao`: ETP, TR, PB, pesquisa, parecer, riscos, autorização, dotação, minuta do contrato) é **espelhado** como peça anexada que aponta para o MESMO arquivo (`sistema_origem='documentos_licitacao'`, `id_externo` = id — chave de idempotência), no upload/vincular e em migração de boot (`FASE_INTERNA_ESPELHO_DOCUMENTOS_NO_BOOT=false` desliga). Só na fase interna e só se a peça ainda não conta como pronta (não sobrescreve trabalho feito). Preferido a "o checklist ler as duas tabelas" porque mantém um lugar só para versão, data, folhas e assinatura.
- Autos em PDF (`processo-pdf`) usam o arquivo da peça anexada/assinada em vez de gerar um PDF do texto.

**4. Assinatura com vários signatários**
- Reaproveita o `portal-assinaturas` (documento + signatários, "todos assinaram" → CONCLUIDO, ouvintes `registrarAoConcluir`). Extensão mínima: `signatarios_documento.papel` (varchar, opcional) — vai como cargo na assinatura digital registrada.
- `POST /fase-interna/:licitacaoId/documentos/:tipo/assinatura` `{ signatarios: [{ usuario_id, papel }] }`: só peça feita no sistema, não vazia; signatários = usuários ATIVOS do órgão do processo, com e-mail (senão 400). Gera o PDF da peça, abre o documento no portal e deixa a peça AGUARDANDO_ASSINATURA (no checklist: "aguardando assinaturas", não conta). `GET …/assinatura` mostra quem assinou.
- Quando o último assina: peça ASSINADA, `totalmente_assinado`, `data_documento` = última assinatura, arquivo e SHA-256 do PDF assinado, `assinaturas` (nome, cargo/papel, data, hash) e folhas.
- Bug corrigido no caminho: o gerador de PDF da fase interna (`GeradorDocumentoService.gerarPdf`) desenhava o rodapé abaixo da margem, o pdfkit abria página nova, que redesenhava o rodapé… até estourar a pilha e **derrubar o processo Node**. Agora cabeçalho/rodapé saem com a margem inferior zerada e o cursor volta para a área de texto.

**5. Removidos:** o botão falso "Importar Fase Interna" de Dados Básicos (e as props `modoImportacao`/`onToggleModo`) e o `POST /fase-interna/:id/importar-documento` (JSON, sem uso — o método do serviço continua, usado pelo `importar-processo`).

**6. Frontend mínimo**
- `processos/[id]`: `PecasFaseInterna` (substitui `InstrucaoArt72`, vale para todas as modalidades) com **Fazer aqui · Anexar PDF · Não se aplica** por linha (o último só com `pode_nao_se_aplicar`), diálogo `AnexarPecaDialog` (arquivo, número, data do documento — `max` = hoje, signatários nome/cargo, observação), metadados da peça e "ver PDF"; na DP, "Usar portaria do órgão".
- `ConsumoLimiteDispensa`: "98,4% de R$ 62.725,59 — Dec. 12.343/2024", barra, amarelo acima de 80%, vermelho acima de 100%.
- "Editar processo › Classificação": select **Fundamento legal** (opções da modalidade pela API) e limites do exercício pela API.

### 7.2 Endpoints novos

| Método e rota | Quem | Isolamento (e2e) |
|---|---|---|
| `POST /fase-interna/:licitacaoId/documentos/:tipo/anexo` | órgão dono | outro órgão 403, fornecedor 403, anônimo 401 |
| `GET /fase-interna/documento/:id/arquivo` | órgão dono | 404 / 403 / 401 |
| `POST /fase-interna/:licitacaoId/documentos/:tipo/assinatura` | órgão dono | 403 / 403 / 401 |
| `GET /fase-interna/:licitacaoId/documentos/:tipo/assinatura` | órgão dono | 404 / 403 / 401 |
| `GET /fase-interna/:licitacaoId/consumo-limite` | órgão dono | 404 / 403 / 401 |
| `GET /fase-interna/orgao/portarias`, `POST` idem | órgão do token | lista só do próprio órgão; fornecedor 403; anônimo 401 |
| `GET /fase-interna/orgao/portarias/:id/arquivo` | órgão do token | outro órgão 404, fornecedor 403 |
| `POST /fase-interna/:licitacaoId/portaria-designacao` | órgão dono | portaria de outro órgão 404; processo de outro órgão 403; fornecedor 403; anônimo 401 |
| `GET /parametros-licitacao/limites-dispensa[?exercicio=]`, `/tabela` | logado | anônimo 401 |
| `POST /parametros-licitacao/limites-dispensa` | admin da plataforma | órgão 403, fornecedor 403, anônimo 401 |
| `GET /parametros-licitacao/fundamentos-legais[?modalidade=&tipo_contratacao=]` | logado | anônimo 401 |

Removido: `POST /fase-interna/:licitacaoId/importar-documento`.

### 7.3 Migrações de boot (fila única `executarMigracaoDeBoot`, idempotentes)

| Serviço | Desligar | O que faz |
|---|---|---|
| `MigracaoFundamentoLegalBootService` | `FUNDAMENTO_LEGAL_MIGRAR_NO_BOOT=false` | preenche `fundamento_legal` NULL (texto da peça/contrato ou padrão) |
| `ParametrosLicitacaoService.migrarLimitesDispensa` | `LIMITES_DISPENSA_MIGRAR_NO_BOOT=false` | limites por exercício; corrige a semente antiga |
| `MigracaoEspelhoDocumentosBootService` | `FASE_INTERNA_ESPELHO_DOCUMENTOS_NO_BOOT=false` | espelha anexos de fase interna da aba Documentos |

Mais: `synchronize` cria `documentos_orgao`, as colunas novas e recria os enums de status/tipo de `documentos_fase_interna` (valores só acrescentados).

### 7.4 Testes

- Unitários novos: `fundamento-legal.spec.ts` (fundamento → PNCP, padrão, validação, leitura de texto), `limites-dispensa.spec.ts` (`limiteDispensa`, `consumoDoLimite` com ramo = classe + unidade, 98,4%), `peca-regras.spec.ts` (datas gerada × anexada, versões, folhas, signatários, PDF). Suíte unitária completa: 88 suítes / 1056 testes, todas passando.
- E2E novo `test/fase-interna-e1.e2e-spec.ts` (26 testes): anexar PDF libera a publicação quando é a única pendência; substituir cria versão; data futura, sem data, não-PDF e PDF falso recusados; folhas em sequência; consumo do limite (órgão, exercício, ramo, unidade, outra hipótese do art. 75); limites e cadastro pelo admin; migrações 2x; portaria; 4 signatários (só ASSINADA na 4ª); isolamento em todos os endpoints novos.
- E2E afetados rodados arquivo a arquivo, todos passando: dispensa-eletronica, transicoes-fase-interna-pncp, isolamento-dados-licitacao, limpeza-e9, cockpit-processo, assistente-itens, divulgacao-pncp, arquivos-privados, pncp-fila, publicacao-prazos, me-epp, credenciamento, formalizacao-resultado, ata-registro-precos, resultado-contrato, transicoes-licitacao, dispensa-motor-unico.
- Frontend: `npx tsc --noEmit` limpo e `next build` concluído sem erro.

### 7.5 Fica para as próximas entregas

- **Tela de assinatura da peça** (escolher signatários e papéis, acompanhar) — nesta entrega só a API e o e2e; as telas por etapa vêm na Entrega 3. Cadastro/listagem de portarias na tela de configuração do órgão (hoje: API + botão "Usar portaria do órgão").
- "Mudar o fundamento atualiza todas as minutas geradas por modelo" (critério de aceite da SPEC): as peças já geradas guardam o texto resolvido; resolver as variáveis na renderização (ou regenerar) fica para a Entrega 3/4, junto com a regra `ENQ-01`.
- Portão A (bloqueio por limite/fracionamento — `LIM-01`/`LIM-02`) usa `consumoDoLimite` na Entrega 4; nesta só leitura/aviso.
- Numeração de folhas nos autos em PDF (`processo-pdf` com índice e folhas carimbadas) — Entrega 6; aqui as folhas já são atribuídas e gravadas.
- Etapa da fase interna (máquina de 8 etapas da SPEC) e tarefas — Entregas 2 e 3.
- Conferir o valor de 2022 (Dec. 10.922/2021) na fonte oficial.
- O `marcarNaoSeAplica` ainda recebe o nome do autor do corpo (legado); o ator do JWT já é exigido pelo guard.

## 6. Riscos e cuidados

- Processos já criados pelo assistente **não podem perder dados**. A F2 só muda a navegação, e a F1 só acrescenta o caminho do anexo.
- Upload: só PDF, limite de tamanho, SHA-256, acesso só do órgão dono (`AcessoLicitacaoService`) e e2e de isolamento.
- Entidade nova ou coluna de tipo união precisa de `type:` explícito (synchronize em produção). Migração de dados só por boot idempotente, na fila única.
- Nenhuma regra de publicação é afrouxada. Sem itens com unidade e valor, e sem as peças obrigatórias (feitas ou anexadas), não publica.
