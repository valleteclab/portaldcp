# Plano — Fase interna simples, guiada e "feita aqui ou anexada"

> 26/09/2026 · Referência real: Câmara Municipal de Luís Eduardo Magalhães — autos da Dispensa 003/2025 (PA 005/2025) e das Inexigibilidades 004/2025 (PA 033/2025) e 008/2025 (PA 043/2025), e o regulamento próprio da Lei 14.133 (**Portaria 089/2024**).
> Status: **Entrega 1 (Base) concluída** (PR #507, ver §7). **Entrega 2 (Tarefas e caixa de entrada) concluída** (PR #508, ver §8). **Entrega 3A (telas por etapa: DFD, ETP, TR, pesquisa e reserva) concluída** (PR #509, ver §9). **Entrega 3B (autorização no celular, minutas e relatório do agente, parecer com diligências, controle interno opcional) concluída** (PR #510, ver §10). **Entrega 4 (motor de conformidade e portões A, B e C) concluída** (PR #511, ver §11). **Entrega 5 (publicação e dispensa com/sem lances) concluída** e **Entrega 6 (autos em PDF com folhas numeradas) concluída** na branch `claude/fase-interna-e5` (ver §12 e §13). Entrega 7 pendente.

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

   **Decidido (decisão 5 do dono) e feito na Entrega 5 (§12):** configuração por órgão "dispensa com etapa de lances" (IN 67, padrão) ou "sem etapa de lances" (só propostas), gravada no processo na publicação.
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
- **Etapa A:** configuração por órgão "dispensa sem etapa de lances" (só propostas), para regulamentos locais que não adotem a IN 67 — feita na Entrega 5 (§12).

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
- ~~Portão A (bloqueio por limite/fracionamento — `LIM-01`/`LIM-02`) usa `consumoDoLimite` na Entrega 4~~ — feito (§11).
- ~~Numeração de folhas nos autos em PDF (`processo-pdf` com índice e folhas carimbadas) — Entrega 6~~ — feito (§13); a folha da juntada passou a ser provisória (o PDF é a fonte).
- Etapa da fase interna (máquina de 8 etapas da SPEC) e tarefas — feito na Entrega 2 (§8).
- Conferir o valor de 2022 (Dec. 10.922/2021) na fonte oficial.
- O `marcarNaoSeAplica` ainda recebe o nome do autor do corpo (legado); o ator do JWT já é exigido pelo guard.

## 8. Entrega 2 — CONCLUÍDA (26/09/2026)

Branch `claude/fase-interna-e2` (a partir do main com a Entrega 1). Sem push/PR nesta etapa. Commits: `32332e7a` (backend), `6c240c67` (WIP do frontend), `aea63515` (frontend) e o desta atualização de documentação.

### 8.1 O que foi feito

**1. Configuração da fase interna por órgão** — entidade nova `configuracoes_fase_interna`. Há uma linha por órgão; sem linha, vale o padrão.
- `modo` varchar: `SIMPLES` (padrão, tudo para o responsável do processo) ou `POR_SETOR`.
- `controle_interno_ativo` boolean (padrão false).
- `responsaveis` jsonb: passo → `{ papel, setor_id }`.
- `prazos` jsonb: passo → dias úteis (null = sem prazo).
- `atualizado_por_*`.
- O padrão é o modelo da Portaria 089/2024: Compras 30, Contabilidade 3, Autorização 3, Minutas (agente) 5, Jurídico 5, Controle interno 3, Publicação 5 dias úteis. DFD, ETP e TR ficam sem prazo.
- **Decisão:** a configuração é por **passo**, e não por etapa, porque a etapa 7 da SPEC tem dois responsáveis: as minutas são do agente e o parecer é da procuradoria. Os passos são DFD, ETP, TR, PESQUISA, RESERVA, AUTORIZACAO, MINUTAS, PARECER, CONTROLE_INTERNO e PUBLICACAO.
- As regras puras ficam em `backend/src/fase-interna/tarefas/configuracao-fase-interna.ts`: `configEfetiva` e `validarConfiguracao` (setor de outro órgão é recusado).
- Tela: **Configurações › Fase interna e tarefas** (`/orgao/configuracoes/fase-interna`).
  - Alteram: o login do órgão, o usuário ADMIN e o admin da plataforma (com `?orgao_id=`).
  - Os demais só leem.

**2. Papéis funcionais e setor do usuário** — colunas novas `usuarios.papeis_fase_interna` (jsonb, lista) e `usuarios.setor_id` (uuid).
- As duas são nullable e sem default. Array com default faz o synchronize recriar a coluna.
- Papéis (`PapelFaseInterna`): REQUISITANTE, COMPRAS, CONTABILIDADE, JURIDICO, CONTROLE_INTERNO, AUTORIDADE, AGENTE_CONTRATACAO.
- Não substitui o `RoleUsuario`.
- A atribuição é feita na mesma tela de configuração: um checkbox por papel e o setor.

**3. Etapas da fase interna** — função pura `etapasDaFaseInterna(processo, pecas, config)` em `tarefas/etapas-fase-interna.ts`.
- Entrada: a instrução do processo (`getInstrucao().itens`) e a configuração.
- **Não há coluna de status por etapa.** A `etapa_atual` é derivada (`etapaAtual`).
- Peça pronta = status OK (anexada, assinada, aprovada ou com conteúdo) ou NAO_SE_APLICA.
- Situações do passo:
  - AGUARDANDO;
  - DISPONIVEL;
  - EM_ANDAMENTO;
  - CONCLUIDO;
  - NAO_REALIZADO: o processo foi divulgado sem a peça;
  - CANCELADO: revogado ou anulado na fase interna.
- A situação da etapa é a agregação da situação dos passos.
- As dependências definem **quando a tarefa nasce**. A peça pode ser feita antes e conta na hora.
  - **Contratação direta:** DFD → ETP, TR e pesquisa → reserva (precisa do valor) → autorização (portão B: art. 72, I, II e IV) → minutas → parecer → controle interno → publicação.
  - **Rito completo:** igual até a reserva. Depois: parecer (após ETP, TR e pesquisa) → autorização (após o parecer e a reserva) → controle interno → publicação.
- Os portões ficam marcados como gancho da Entrega 4 no campo `portao`: `B_ART72`, `MINUTAS_ANTES_DO_PARECER` e `C_CONFORMIDADE`. **Nada trava ato nesta entrega.**
- Integração com a máquina: não há máquina paralela.
  - Cada etapa informa a sua `fase_maquina` (PLANEJAMENTO … APROVACAO_INTERNA).
  - Os atos CONCLUIR_* e PUBLICAR não mudaram.
  - A mudança de fase ou de situação dispara a sincronização das tarefas.
- Peça nova no catálogo: `MANIFESTACAO_CONTROLE_INTERNO` ('MCI', `CATALOGO_PECAS.CONTROLE_INTERNO`).
  - Entra na instrução **só com o controle interno ativo**.
  - Não é obrigatória: é aviso, não bloqueio.
  - Não admite "não se aplica".
- **Histórico:** cada mudança de situação de etapa grava `ETAPA_ALTERADA` em `logs_fase_interna`, com de/para, comparando com o último registro. O log é histórico, não fonte.
- Também são gravados TAREFA_CRIADA, TAREFA_CONCLUIDA, TAREFA_CANCELADA e TAREFA_REATRIBUIDA.
- **Decisão:** usar o log da fase interna, e não `licitacao_transicoes`. Esta última é o histórico dos atos de fase e de situação, e é lida pelos e2e e pelos relatórios.

**4. Tarefas** — entidade nova `tarefas`.
- Colunas de identificação:
  - `orgao_id` e `licitacao_id` (FK, cascade);
  - `documento_id` e `tipo_peca`;
  - `etapa`, `passo` e `chave`;
  - `tipo`: PECA, PUBLICACAO, DILIGENCIA, ACHADO ou OUTRO;
  - `origem`: ETAPA, DILIGENCIA, ACHADO ou SISTEMA; `origem_id`;
  - `titulo` e `descricao`.
- Responsável: `responsavel_usuario_id` **ou** `responsavel_papel`/`responsavel_setor_id`, mais `atribuicao_manual`.
- Prazo: `prazo_dias_uteis` e `prazo`.
- Ciclo de vida: `status` (ABERTA, CONCLUIDA ou CANCELADA), `criada_por_*`, `concluida_por_*`, `concluida_em`, `cancelada_em`, `motivo_cancelamento` e timestamps.
- Toda coluna de tipo união tem `type:` explícito.
- **Idempotência no banco:** índice único parcial `(licitacao_id, chave) WHERE status='ABERTA'`, com insert `ON CONFLICT DO NOTHING`.
- `TarefasService.sincronizar(processo)` é a única rotina que cria, conclui, cancela e reatribui. Ela aplica o plano da função pura `planejarSincronizacao` (`tarefa-regras.ts`):
  - **cria** a tarefa do passo disponível;
  - **conclui** quando o passo conclui e registra quem cumpriu: o último signatário, quem marcou "não se aplica", quem anexou ou elaborou, ou quem publicou;
  - **cancela** quando a etapa deixa de se aplicar (ex.: controle interno desativado), quando a fase interna acaba sem a peça ou quando o processo é revogado ou anulado. Neste último caso cancela todas, inclusive diligências e achados;
  - **reatribui** quando o responsável calculado muda (modo ou agente), exceto se a tarefa foi reatribuída à mão.
- O prazo usa `fimDoPrazoEmDiasUteis`, a mesma função única de prazos da publicação, com o calendário do órgão.
- Responsável (`responsavelDoPasso`):
  - **SIMPLES:** o agente do processo (`pregoeiro_id`, se for usuário ativo do órgão). Sem agente, quem criou o processo (registro CRIAR). Sem nenhum dos dois, a caixa do papel AGENTE_CONTRATACAO.
  - **POR_SETOR:** o papel ou setor da configuração. O passo do agente vai direto para o agente do processo.
- **Gatilho:** `TarefasSubscriber` (TypeORM).
  - Toda gravação em `documentos_fase_interna`, e toda mudança de fase, situação, agente ou modalidade da licitação, agenda a sincronização **depois do commit**.
  - A agenda é coalescida por processo: nada roda em paralelo para o mesmo processo, e as leituras da caixa esperam as pendentes.
  - Os updates por QueryBuilder sem o id da licitação chamam `agendar` direto: envio para assinatura e conclusão da assinatura.
  - O espelho da aba Documentos (SQL cru) avisa via `aviso-tarefas.ts`.
  - A tela do processo também sincroniza (GET das etapas), e a troca de configuração re-sincroniza o órgão.
  - Chave geral: `FASE_INTERNA_TAREFAS=false` desliga tudo.
- **Reatribuir:** só para usuário ativo do mesmo órgão (outro órgão → 403). Podem reatribuir o responsável, quem é do papel ou setor, o agente do processo e o administrador do órgão.
- **Assumir:** vale para tarefa do meu papel ou setor, ou para o admin.
- Reatribuir e assumir vão para o histórico.
- Ganchos para as próximas entregas: origem DILIGENCIA (Entrega 3, parecer) e ACHADO (Entrega 4, conformidade), com `chave`/`origem_id` próprias. O cancelamento por revogação já cobre as duas.
- **Relação com a tramitação:**
  - A tramitação (`tramitacoes_processo`) continua sendo o despacho formal entre setores (estilo SEI), que vai para os autos.
  - A tarefa é o "o que eu tenho que fazer". Uma não cria a outra.
  - A caixa nova mostra só tarefas. A caixa de tramitação por setor continua como estava.
- "Não se aplica" passou a registrar o autor pelo JWT. Antes vinha do corpo (pendência da §7.5).

**5. Caixa de tarefas (frontend)**
- `/orgao/fase-interna` passou a ser a **caixa de tarefas**, a tela inicial da área. O painel antigo foi para `/orgao/fase-interna/painel`.
- Abas **Para mim**, **Aguardando outros** e **Concluídas**, ordenadas por prazo, com as atrasadas em destaque.
- Coluna **Prazos da semana**: tarefas e sessões públicas.
- Botões:
  - **Abrir peça**: leva a `processos/[id]#peca-TIPO` e destaca a linha da peça;
  - **Assumir**;
  - **Reatribuir**: diálogo com as pessoas do órgão.
- Menu principal: "Fase Interna IA" virou **Minhas tarefas**, com badge (laranja se há tarefa atrasada). O menu da fase interna ganhou o mesmo item com badge.
- Tela do processo: novo quadro **Fluxo da fase interna** (`FluxoFaseInterna.tsx`), na área da etapa atual (Etapa B). Mostra situação, responsável, prazo, passos e peças, dependências, quem concluiu e o histórico.

**6. Notificação** — reaproveita o `NotificacoesService`.
- Quando uma tarefa é criada ou reatribuída, o sistema:
  - cria uma notificação no sistema;
  - envia e-mail pelo SMTP do órgão;
  - envia WhatsApp com botão, se o órgão tiver WhatsApp configurado e o usuário tiver telefone.
- Tarefa de papel ou setor: avisa quem tem o papel ou está no setor (até 30 pessoas).
- Tipo `SISTEMA`, com `entidade_tipo='TAREFA'`.
- **Decisão:** não criar valor novo no enum de notificações, para o synchronize não reescrever a tabela `notificacoes`.
- A migração de boot não notifica.
- Desligar: `FASE_INTERNA_TAREFAS_NOTIFICAR=false`.

### 8.2 Endpoints novos

| Método e rota | Quem | Isolamento (e2e) |
|---|---|---|
| `GET /tarefas?aba=para-mim\|aguardando\|concluidas` | usuário/órgão (sempre o do token) | só as tarefas do usuário e do papel/setor dele; outro órgão não aparece; sem o papel não vê; fornecedor 403; anônimo 401 |
| `GET /tarefas/contagem` | idem (badge) | fornecedor 403; anônimo 401 |
| `POST /tarefas/:id/assumir` | quem tem o papel/setor | outro papel 403; outro órgão 403; fornecedor 403; anônimo 401 |
| `POST /tarefas/:id/reatribuir` `{ usuario_id, motivo? }` | responsável, agente do processo, admin do órgão | usuário de outro órgão 403; sem permissão 403; outro órgão 403; fornecedor 403; anônimo 401 |
| `GET /fase-interna/configuracao` | usuário do órgão | só o próprio órgão |
| `PUT /fase-interna/configuracao` | admin do órgão | não-admin 403; fornecedor 403; anônimo 401; admin de B só altera B |
| `GET /fase-interna/configuracao/usuarios` | usuário do órgão | só os usuários do órgão |
| `PUT /fase-interna/configuracao/usuarios/:usuarioId` `{ papeis, setor_id }` | admin do órgão | usuário de outro órgão 403; admin de B 403; não-admin 403; fornecedor 403 |
| `GET /fase-interna/:licitacaoId/etapas` | órgão dono | outro órgão 404; fornecedor 403; anônimo 401 |

### 8.3 Migração de boot

| Serviço | Desligar | O que faz |
|---|---|---|
| `MigracaoTarefasBootService` | `FASE_INTERNA_TAREFAS_NO_BOOT=false` (ou `FASE_INTERNA_TAREFAS=false`) | sincroniza os processos em fase interna (ativos/suspensos) e os que têm tarefa aberta: cria as tarefas abertas que faltam, sem notificar. Idempotente (e2e rodado 2x). |

O `synchronize` também:
- cria `tarefas` (com o índice único parcial) e `configuracoes_fase_interna`;
- cria as colunas novas de `usuarios`;
- recria os enums de `documentos_fase_interna.tipo` (+MCI, também em `modelos_documento` e `fluxos_aprovacao_documento`) e de `logs_fase_interna.acao` (+5 valores). Só foram acrescentados valores.

### 8.4 Testes

- **Unitários novos:**
  - `etapas-fase-interna.spec.ts`: dependências, ordem sugestão, "não se aplica", anexo e em assinatura, controle interno ativo/inativo, divulgado e revogado, rito completo × direta, fase da máquina.
  - `tarefa-regras.spec.ts`: prazo em dias úteis com feriado do órgão, tarefa atrasada, configuração padrão e validação, responsável SIMPLES × POR_SETOR, plano de sincronização idempotente, cancelamentos, reatribuição, quem cumpriu.
- **Suíte unitária completa:** 90 suítes / 1086 testes, todas passando.
- **E2E novo** `test/fase-interna-e2.e2e-spec.ts` (19 testes):
  - a tarefa nasce ao abrir o processo;
  - anexar, marcar "não se aplica" e concluir a assinatura concluem a tarefa, registrando quem cumpriu;
  - a peça reenviada para assinatura reabre a tarefa;
  - modo SIMPLES e modo POR_SETOR (tarefa no papel certo);
  - assumir e reatribuir;
  - controle interno ativo cria a etapa e a tarefa; desativado, cancela;
  - revogar cancela as tarefas;
  - caixa: ordem por prazo, atrasada, contagem e prazos da semana;
  - migração rodada 2x;
  - isolamento em todos os endpoints novos.
- **E2E afetados**, rodados arquivo a arquivo, todos passando: fase-interna-e1, dispensa-eletronica, transicoes-fase-interna-pncp, isolamento-dados-licitacao, limpeza-e9, cockpit-processo, assistente-itens, divulgacao-pncp, arquivos-privados, pncp-fila, publicacao-prazos, me-epp, credenciamento, formalizacao-resultado, ata-registro-precos, resultado-contrato, transicoes-licitacao, dispensa-motor-unico, infra, orgaos-pca-acesso.
- **Frontend:** `npx tsc --noEmit` limpo; `next build` concluído sem erro.

### 8.5 Fica para as próximas entregas

- ~~**Portões que travam atos** — Entrega 4~~ (feito, §11). Nesta entrega estavam só marcados no campo `portao`:
  - B (art. 72) na autorização;
  - minutas antes do parecer;
  - C (conformidade) antes de publicar.
- **Diligência** do parecer, que cria tarefa para o responsável da peça-alvo (origem DILIGENCIA) — Entrega 3.
- ~~**Achado** da conformidade (origem ACHADO) — Entrega 4~~ — feito (§11).
- **Telas por etapa** — Entrega 3. Hoje o botão da tarefa leva à linha da peça no quadro do processo.
- **Atos CONCLUIR_* automáticos** quando terminam as etapas de uma fase da máquina: não foi feito, porque mudaria o comportamento atual. O agente continua avançando pelo checklist, como antes.
- **Controle interno como bloqueio** (hoje é só aviso) e "não se aplica" para ele, quando o regulamento permitir — decisão do órgão, Entregas 4/5.
- **Requisitante como responsável direto** das etapas 1 a 3 no modo por setor (quem pediu, pela demanda): hoje a tarefa vai para a caixa do papel.
- **Lembrete de prazo vencendo** (cron): não existe. A tarefa atrasada aparece destacada na caixa e no badge.

## 9. Entrega 3A — CONCLUÍDA (26/09/2026)

Branch `claude/fase-interna-e3` (a partir do main com as Entregas 1 e 2). Sem push/PR nesta etapa. Commits: `f54b6329` (backend), `0af9125f` (DFD), `dde0b2e1` (ETP), `f94cc1f3` (TR), `b7fc9929` (pesquisa), `2321f1cc` (reserva), `db096b7b` (redirecionamentos e navegação) e o desta documentação.

**Um processo, uma tela por etapa.** Cada etapa com tela abre DENTRO do processo, pelo quadro "Fluxo da fase interna" ("Abrir a etapa →") ou pela tarefa da caixa (o `destino` da tarefa passou a ser a tela), sempre com "← Voltar ao processo" e a barra das 8 etapas:
`/orgao/processos/[id]/fase-interna/{dfd,etp,tr,pesquisa,reserva}`.
Em todas: o quadro comum da peça (`CaminhosDaPeca`) com **fazer aqui** (a própria tela, gerando pelo modelo) **ou anexar o PDF feito fora**, "não se aplica" onde a lei permite, **enviar para assinatura** (a tela que faltava da Entrega 1: vários signatários com papel), "ver PDF" e **versões** (histórico). A tarefa da Entrega 2 conclui sozinha quando a peça fica pronta (gerada, assinada, anexada ou "não se aplica") — conferido nos e2e.

### 9.1 O que mudou por tela

**1. DFD** (mockup DFD)
- Unidade requisitante (tabela `setores`), responsável e fiscal sugerido (usuários ativos do órgão), data pretendida, prioridade e **vínculo ao item do PCA** (`licitacoes.item_pca_id`) ou **justificativa de ausência** (`sem_pca`/`justificativa_sem_pca`, art. 12, §1º, mínimo 10 caracteres). Ids de outro órgão → 400.
- Necessidade (seção `demanda`, autosave), objeto (só na fase interna) e **itens com CATMAT/CATSER** pelo editor de itens existente (`ItensTab`, num diálogo; grava pelo mesmo `PUT /licitacoes/:id`).
- Checklist "antes de gerar" (PCA, necessidade, itens com código — "N itens sem código CATMAT/CATSER — necessário para somar o limite de dispensa" —, unidade e responsável, data, marca no objeto).
- **Gerar DFD**: completa só as seções vazias pela derivação (quantidades pelos itens com o código, previsão no PCA, data) e gera o PDF.
- Campos estruturados na própria peça: `documentos_fase_interna.dados_estruturados._dfd` (sem entidade nova); as seções `previsao` e `data` são derivadas deles.
- Criar o processo a partir de uma demanda continua igual e agora abre direto a tela do DFD.

**2. ETP** (mockup ETP)
- O editor por seções existente (`DocumentoSeccionado`), com o painel **Assistente do ETP** no lugar do chat: incisos do art. 18, §1º com ponto de situação (obrigatórios do §2º: I, IV, VI, VIII e XIII), marca, coerência, pendentes e "Pedir ao assistente".
- **Assistente** (`POST /etp/assistente`, IA existente — `IaService.chat`): `RASCUNHO` da seção a partir do DFD e dos itens (instrução de descrever pela função, sem marca), `REESCREVER_MARCA` do trecho, `ANALISAR` (sem IA). **Só sugere**: nada é gravado; "Aplicar na seção"/"Substituir o trecho" grava com `origem: IA_ACEITA` → `dados_estruturados._edicoes[secao] = { por_id, por_nome, origem, em }` + log `DOCUMENTO_EDITADO` ("sugestão aceita … texto registrado como editado pelo usuário"). Toda edição de seção passou a registrar o autor do JWT. A sugestão é mostrada como texto (nunca HTML cru da IA). IA indisponível → `disponivel: false` com a análise (sem erro).
- **Marca (art. 41, I)** — função pura `detectarIndicacaoMarca`: marca citada sem "apenas como referência/ou similar/equivalente" e sem justificativa = **BLOQUEIO**; com "similar/equivalente/superior" = **ATENÇÃO** (justificativa obrigatória); com a justificativa registrada (`PUT /etp/marca`, `_marca`) = **JUSTIFICADO**. Caso ARION (SNEWS) do PA 139/2025 é fixture.
- **Coerência** (`coerenciaEntreSecoes`): siglas técnicas e expressões em maiúsculas da necessidade que não aparecem na solução (VII) e no TR.
- Na contratação direta: "Não se aplica" com justificativa para ETP e riscos (art. 72, I). Riscos: a tela existente, com "← Voltar ao ETP".
- **Gerar ETP (PDF)** pelo modelo.

**3. TR**
- Editor por seções derivado do ETP (`derivacao.service`, estendido): `fundamentacao` começa com o **fundamento legal lido de `processo.fundamento_legal`**; `estimativa_valor_tr` respeita o **orçamento sigiloso** (art. 24 — texto sem o valor); `dotacao_orcamentaria_tr` vem da **reserva** (classificação + distribuição por exercício, sem valores no sigilo).
- Quadros: fundamento legal, dotação da reserva, situação do ETP, itens e valores (com aviso do sigilo). "Gerar TR (PDF)" não apaga o que foi escrito.

**4. Pesquisa de preços** (mockup Pesquisa)
- Dados no **documento PP** (mesmo lugar do módulo de pesquisa, do agente e do gerador do mapa — sem entidades novas; a SPEC `Cotacao`/`ParametroPesquisa`/`PesquisaPrecos` virou campos de `PesquisaPrecosDados`): `parametros_art23` (inciso, situação CONSULTADO/SEM_RETORNO/NAO_CONSULTADO, data, resultado, evidência com SHA-256), `metodo` (MENOR/MEDIA/MEDIANA ↔ `metodologia_geral`), `justificativa_metodo`, `justificativa_fornecedores`, `justificativa_menos_de_tres`, `solicitacao_enviada_em`, `publicacao_prevista`, `certidao`; cotação com `grupo_id`, `data_emissao`, `validade_ate`.
- **5 parâmetros do art. 23, §1º** com "consultado em [data]", resultado e evidência — **"consultado sem retorno" registrado** (e na certidão). Sem registro manual, o parâmetro conta como consultado quando há cotação de fonte daquele inciso (PAINEL→I, PNCP/contratos→II, mídia→III, fornecedor→IV, NF-e→V).
- **Cotações diretas como propostas**: fornecedor, CNPJ (dígitos conferidos), emissão (não futura), validade, valor por item e comprovante (PDF/PNG/JPG, pasta privada `licitacoes/<id>/`).
- Cálculo automático de **menor, média e mediana** (totais por método), **regra dos 3 preços** (ou justificativa), alertas **VENCE_ANTES_DA_PUBLICACAO**, **VENCIDA** e **EMITIDA_HA_MAIS_DE_6_MESES** (PRECO-02 e PRECO-03 da SPEC); cotação vencida ou com mais de 6 meses não entra no cálculo.
- **Consumo do limite** do art. 75 (componente da Entrega 1: "98,4% de R$ 62.725,59 — Dec. 12.343/2024").
- **Emitir mapa e certidão**: exige método, justificativa do método, justificativa dos fornecedores (com cotação direta) e 3 preços; aplica o método nos itens, gera o mapa (gerador-pp existente) e a **certidão** (novo `GeradorPpService.gerarCertidao`) e registra a peça (o valor de referência vira o valor dos itens).
- **Pesquisa feita fora** (decisão 2): anexo da peça PP + `PUT /pesquisa/valores-itens` (valor unitário de cada item; recalcula o total do processo). O anexo continua sendo a peça (sem versão nova só por ler/digitar valores); fazer aqui sobre peça anexada abre versão nova copiando os dados da última versão com a pesquisa.
- O módulo detalhado antigo (`[id]/precos`: itens, agentes PNCP/Painel/Fonte de Preços, CSV, estatística, outliers) virou o componente `PesquisaPrecosDetalhe`, embutido na tela ("Pesquisa detalhada por item"); "Consultar PNCP de novo" roda os agentes existentes.

**5. Reserva orçamentária** (mockup Reserva) — estrutura nova
- Entidades: `reservas_orcamentarias` (versão, `versao_atual`, `substitui_reserva_id`, status RASCUNHO/EMITIDA/DEVOLVIDA/SUBSTITUIDA, `exercicio_base`, `dotacao_id` + cópia da classificação, `lei_ldo_id`/`lei_loa_id`/`lei_ppa_id`, declarações LOA/LDO/PPA e LRF, motivos, `documento_id` da peça DO, emissão) e `reservas_orcamentarias_linhas` (exercício, valor, situação RESERVADO/PREVISAO, nº da reserva). Tabelas do órgão: `dotacoes_orcamentarias` (exercício, UO, programa, projeto/atividade, elemento, fonte, saldo, ativo) e `leis_orcamentarias` (tabela única LDO/LOA/PPA: número, exercício, fim do PPA, publicação, ementa, ativo). Toda coluna de união com `type:` explícito.
- **Linhas por exercício**: na emissão, a do exercício corrente vira RESERVADO e as futuras ficam PREVISAO; linha de exercício encerrado bloqueia (use "Renovar"); total ≠ valor estimado = aviso.
- **Emitir** gera a peça **DO (INFO_ORCAMENTARIA)** pelo **modelo** (modelo padrão novo "Informação orçamentária", variáveis `{{reserva.*}}` com a tabela por exercício e as leis da tabela única), nova versão da peça + PDF; a tarefa da etapa conclui.
- **Retificar** e **Renovar dotação** criam **versão nova** (a anterior vira SUBSTITUIDA, nunca some). A renovação (novo exercício > o da emissão) soma no novo exercício o valor do encerrado, volta tudo a PREVISAO, sugere a dotação equivalente (mesmo projeto/elemento/fonte) e a LDO do novo ano e **cria a tarefa do sistema "Renovar a informação orçamentária"** (origem SISTEMA, chave `sistema:renovar-dotacao`, passo RESERVA → Contabilidade no modo por setor; agente no simples). A emissão da nova versão, ou o anexo da DO feita fora, conclui a tarefa; o anexo da DO é aceito depois da divulgação só enquanto a renovação está pendente.
- **Devolver sem saldo** (motivo, volta a rascunho ao editar).
- Tela **Configurações › Orçamento** (dotações e leis, ativar/desativar) e **cadastro rápido** na própria tela da reserva.

### 9.2 Endpoints novos

| Método e rota | Quem | Isolamento (e2e) |
|---|---|---|
| `GET` / `PUT /fase-interna/:id/dfd` | órgão dono | outro órgão 404/403; fornecedor 403; anônimo 401 |
| `POST /fase-interna/:id/documentos/:tipo/gerar` (DFD, ETP, TR) | órgão dono | 403 / 403 / 401 |
| `GET /fase-interna/:id/etp`, `POST /etp/assistente`, `PUT /etp/marca` | órgão dono | 404 ou 403 / 403 / 401 |
| `GET /fase-interna/:id/tr` | órgão dono | 404 / 403 / 401 |
| `GET /fase-interna/:id/pesquisa` | órgão dono | 404 / 403 / 401 |
| `PUT /pesquisa/parametros/:inciso`, `POST /pesquisa/parametros/:inciso/evidencia` | órgão dono | 403 / 403 / 401 |
| `POST /pesquisa/propostas`, `DELETE /pesquisa/propostas/:grupo`, `POST /pesquisa/propostas/:grupo/comprovante` | órgão dono | 403 / 403 / 401 |
| `PUT /pesquisa/metodo`, `POST /pesquisa/emitir`, `PUT /pesquisa/valores-itens` | órgão dono | 403 / 403 / 401 |
| `GET /pesquisa/arquivos/:tipo/:chave` (evidência, comprovante, certidão) | órgão dono | 404 / 403 / 401 |
| `GET` / `PUT /fase-interna/:id/reserva`; `POST /reserva/{emitir,retificar,renovar,devolver}` | órgão dono | 404 ou 403 / 403 / 401 |
| `GET` / `POST /orcamento/dotacoes`, `PUT /orcamento/dotacoes/:id`; idem `/orcamento/leis` | órgão do token (admin: `?orgao_id=`) | lista só do próprio órgão; alterar a de outro órgão 403; dotação de outro órgão na reserva 400; fornecedor 403; anônimo 401 |

Alterados: `PATCH /fase-interna/:id/documentos/:tipo/secao/:secaoId` aceita `origem: USUARIO | IA_ACEITA` e registra o autor do JWT (chave interna `_…` → 400); `POST …/documentos/DO/anexo` conclui a renovação pendente; o `destino` da tarefa (caixa e notificação) leva à tela da etapa.

### 9.3 Entidades e colunas

Novas: `dotacoes_orcamentarias`, `leis_orcamentarias`, `reservas_orcamentarias`, `reservas_orcamentarias_linhas` (criadas pelo `synchronize`). **Nenhuma coluna nova em tabela existente** e **nenhuma migração de boot** (não há dado a converter: a reserva nasce na tela; os campos novos da pesquisa, do DFD e do ETP ficam no `jsonb` da peça). Modelo padrão novo de DO semeado no boot (idempotente, já existente). Nenhum valor novo em enum (os logs usam `DOCUMENTO_EDITADO`, `DOCUMENTO_VERSIONADO`, `DOCUMENTO_CRIADO`, `IA_INVOCADA`).

### 9.4 Decisões

- **Sem entidades duplicadas**: DFD, ETP e TR continuam em `documentos_fase_interna`; a pesquisa (parâmetros, propostas, método) no documento PP — onde o mapa, o agente e o relatório público já leem. Só a reserva e as tabelas orçamentárias são estruturas novas (não existiam).
- **"Pronta" continua a regra da Entrega 1/2** (anexada, assinada, aprovada ou com conteúdo). A tela gera a peça pelo modelo e oferece a assinatura; bloquear o avanço por incisos obrigatórios/marca é o **portão da Entrega 4** — aqui é aviso (vermelho para marca sem justificativa).
- **PDF por seções**: `GeradorDocumentoService` renderiza as seções do modelo com título (antes o DFD saía com o JSON bruto e o ETP do editor saía em branco).
- **Uma tela só por coisa**: o cockpit antigo, a rota `licitacoes/[id]/fase-interna`, `editor?tipo=DFD/ETP/AR/TR/PP/MCP/DO` e `…/precos` redirecionam; a tramitação virou aba da tela do processo; o editor avulso fica só para as peças sem tela (AA, PJ, ME, JC…), com "← Voltar ao processo".
- **Renovação no modo simples** vai para o agente do processo (como toda tarefa do modo simples); no modo por setor, para o papel/setor configurado para a RESERVA (Contabilidade).
- **Correções no caminho**: matriz de riscos gravava `{grau, nivel}` inteiro em `grau` (nível saía sempre BAIXO) e sem `id` (editar/remover não achavam o risco) — corrigido, com id "R-<n>" para os antigos; o editor por seções não mostrava o texto inserido pela IA/herança (a seção agora remonta); o botão "PDF" do editor apontava para rota inexistente.

### 9.5 Testes

- **Unitários novos** (`src/fase-interna/telas/`): `pesquisa-regras.spec.ts` (menor/média/mediana, método, regra dos 3 preços, vencida, vence antes da publicação, mais de 6 meses, parâmetros com "sem retorno", propostas agrupadas, pendências), `etp-analise.spec.ts` (incisos obrigatórios, marca ARION/SNEWS = atenção, "marca Dell modelo X" = bloqueio, justificado, coerência "Closed Caption/NDI"), `reserva-regras.spec.ts` (linhas, emissão, conferência, renovação preservando o total). Suíte unitária completa: 93 suítes / 1117 testes passando.
- **E2E novo** `test/fase-interna-e3a.e2e-spec.ts` (14 testes): DFD → gerar (tarefa conclui, caixa leva à tela) → ETP "não se aplica" na dispensa → TR gerado do processo (fundamento, sem apagar seção escrita) → pesquisa (sem retorno, evidência, 3 propostas, CNPJ/emissão recusados, alertas, método e justificativas obrigatórios, mapa + certidão, valores nos itens) → tabelas orçamentárias → reserva com 2 exercícios (emitida, peça DO com a LDO da tabela, sem "empenho") → renovar (versão, histórico, tarefa SISTEMA que a sincronização não mexe, emissão conclui); pesquisa feita fora (anexo + valores); assistente do ETP (marca, IA_ACEITA com autor e log, IA indisponível sem gravar nada); isolamento de todos os endpoints novos. Sem migração de boot nesta entrega.
- **E2E afetados** (arquivo a arquivo, todos passando): fase-interna-e2 (destino da tarefa atualizado para a tela), fase-interna-e1, dispensa-eletronica, cockpit-processo, assistente-itens, transicoes-fase-interna-pncp, isolamento-dados-licitacao, dispensa-motor-unico, divulgacao-pncp, arquivos-privados.
- **Frontend**: `npx tsc --noEmit` limpo; `next build` concluído sem erro (as 5 rotas novas e a de Configurações › Orçamento compiladas).

### 9.6 Fica para depois

- ~~**Entrega 3B**: autorização no celular, parecer com diligências (origem DILIGENCIA), relatório do agente e minutas~~ — feita (§10).
- ~~**Portões** (Entrega 4): marca sem justificativa (`MARCA-01`), limite (`LIM-01/02`), `PRECO-01..03`, `LEI-01`, `EXERC-01`~~ — feito (§11). Os incisos obrigatórios do ETP continuam como aviso na tela do ETP.
- **Cadastro de marcas** do órgão para a detecção por nome (a função já aceita a lista; hoje a detecção é pelo padrão do texto).
- Saldo da dotação integrado ao sistema contábil (hoje informado na tabela).
- Tela de assinatura com acompanhamento de quem falta (o envio já existe no quadro da peça; a situação continua em `GET …/assinatura`).

## 10. Entrega 3B — CONCLUÍDA (26/09/2026)

Branch `claude/fase-interna-e3b` (a partir do main com as Entregas 1, 2 e 3A). Sem push/PR nesta etapa. Commits: `8d903e41` (backend), `bb4a363c` (frontend), `8d91dbd6` (ajuste do histórico de devoluções) e o desta documentação.

Telas novas, no mesmo padrão da 3A (dentro do processo, com a barra das etapas, "← Voltar ao processo" e o quadro comum da peça — fazer aqui, anexar, "não se aplica", versões):
`/orgao/processos/[id]/fase-interna/{autorizacao,minutas,parecer,controle-interno}`. O `destino` das tarefas dos passos AUTORIZACAO, MINUTAS, PARECER e CONTROLE_INTERNO passou a ser a tela (o do parecer da fase externa: `parecer?fase=EXTERNA`).

### 10.1 O que mudou por item

**1. Autorização da autoridade (etapa 6; mockup Autorizacao, 390 px)**
- **Despacho (AA) gerado pelo modelo**, lendo o processo: objeto, `fundamento_legal`, **teto** (soma dos itens = valor estimado da pesquisa), dotação e leis da reserva (tabela única) e o nome da autoridade. O modelo do sistema foi atualizado pelo seed (o texto da Entrega 1 entrou em `TEXTOS_PADRAO_LEGADOS`; modelo próprio do órgão não é tocado).
- **Autoridade colegiada**: a configuração da E2 ganhou `signatarios_autorizacao` (usuário + papel; ex.: Presidente, Vice, 1º e 2º Secretários) e `autoridade_rotulo` ("Mesa Diretora"). Sem lista, recebem os usuários com o papel AUTORIDADE; o agente também pode escolher no envio. **Só fica AUTORIZADA quando todos assinam** (portal de assinaturas — Entrega 1).
- **Celular**: para o signatário, o cartão do mockup (objeto, teto, modalidade · fundamento, dotação, requisitante, peças do art. 72 conferidas, "Ler os documentos (N folhas)" → autos em PDF) com **Autorizar e assinar** (só o signatário designado, com o próprio login — o portal dispensa o código quando o signatário é o usuário logado) e **Devolver com observação**.
- **Devolver**: motivo obrigatório; o pedido de assinatura é cancelado no portal; o despacho fica **DEVOLVIDO** (status `REPROVADO`, já existente — não conta como pronto) com o histórico `_devolucoes`; nasce a **tarefa do agente** (origem SISTEMA, chave `sistema:autorizacao-devolvida`, com o motivo). Reenviar (versão nova do despacho) ou anexar o despacho assinado fora conclui a tarefa.
- **Portão B** (art. 72): quadro só de leitura — exigidos I, II e IV; III, VI e VII depois; VIII é a etapa. O bloqueio fica para a Entrega 4.
- A designação do agente (DP) aparece na mesma tela (a etapa 6 conclui com AA e DP prontos/"não se aplica").

**2. Minutas e relatório do agente (etapa 7, parte do agente)**
- Relatório do agente (**RAG**), minuta do aviso (**ME**) e minuta do contrato (**MC**) gerados pelo modelo. Modelos novos no seed: RAG (identificação, enquadramento com o **limite do inciso certo no exercício**, preço, escolha, orçamento, conclusão) e MC (cláusulas do art. 92, com a **vinculação** citando o número do PA e da dispensa lidos do processo). O preâmbulo da ME deixou de dizer só "licitação".
- Variáveis novas dos modelos (`ModeloDocumentoService.montarContextoVariaveis`, valem para todos os modelos): `licitacao.numero_dispensa`, `licitacao.teto`, `licitacao.valor_publico` (respeita o sigilo), `licitacao.sigilo`, `licitacao.limite_dispensa`, `reserva.dotacao`, `reserva.situacao`, `reserva.exercicios`, `reserva.leis`, `autoridade.nome`, `agente.nome`, `agente.cargo`, `portaria.designacao` (a peça DP do processo ou a portaria ativa do órgão no exercício).
- **Critério de aceite da SPEC — mudar o fundamento regera as minutas**: a peça gerada guarda a impressão do texto (`_gerado.hash`). O `MinutasSubscriber` (TypeORM, depois do commit) observa `fundamento_legal`, `numero_processo`, `numero_edital`, `sigilo_orcamento` e `objeto` da licitação: a peça **gerada e intocada é regerada** (sem versão nova se o texto não muda — idempotente); a **editada à mão, assinada, em assinatura ou aprovada** ganha `_desatualizada` ("O processo mudou… Regerar?"). Vale para RAG, ME, MC e o despacho AA. Desligar: `FASE_INTERNA_REGERAR_MINUTAS=false`.
- Conferência de **vinculação** (VINC-01 em leitura): número de PA/dispensa citado que não é o do processo aparece em vermelho na tela.
- **Sigilo do orçamento** (art. 24): decisão com justificativa (mínimo 20 caracteres) na própria tela; regera as minutas.
- A **minuta do aviso (ME)** entrou na instrução da contratação direta como "se for o caso" (art. 72 c/c art. 75, §3º).

**3. Parecer jurídico com diligências (etapa 7, Procuradoria; mockup Parecer)**
- À esquerda os **autos** (peças atuais na ordem das folhas; texto das feitas no sistema ou o PDF, que abre na folha); à direita o **roteiro**: art. 72 (I, II, IV, VI/VII, VIII), art. 75 (o mesmo inciso em todas as peças feitas no sistema), art. 41, I (marca), art. 24 (sigilo), art. 92 (cláusulas obrigatórias vazias na MC) e vinculação ao processo. Cada item tem a conferência automática; a marcação da Procuradoria prevalece; diligência aberta deixa o item em "Diligência".
- **Diligência** (entidade nova): ligada à análise (e à peça do parecer quando emitido), ao **documento-alvo** (a versão no momento), à descrição, ao item do roteiro, à folha e ao trecho. Cria a **tarefa** (origem `DILIGENCIA`, tipo `DILIGENCIA`, chave `diligencia:<id>`) para o **responsável pelo passo da peça-alvo** (modo por setor: o papel/setor; simples: o agente). O processo "volta" para a peça **sem desfazer nada**: nenhuma assinatura posterior é tocada; a peça ganha versão nova quando corrigida.
- **Sanar**: exige versão nova pronta da peça-alvo (ou "não há o que alterar" com o esclarecimento); quem pode: o responsável pela tarefa (usuário, papel ou setor), o agente do processo, o administrador do órgão ou o login do órgão. Sanada, a tarefa da diligência conclui e nasce a tarefa de **retorno à Procuradoria** (chave `parecer-retorno:<análise>`, passo PARECER). A Procuradoria pode **reabrir** (nova tarefa; a próxima correção precisa ser posterior à versão atual) ou **cancelar**.
- **Emissão**: favorável (bloqueada com diligência aberta), favorável com ressalvas (condicionado; exige ressalvas ou diligência aberta) ou desfavorável (exige fundamentação). O texto é montado do roteiro, das diligências e da conclusão (PJ; PJE na fase externa) e **assinado pelo próprio jurista** no portal (só quem tem o papel **JURÍDICO** — os demais 403). A tarefa da etapa conclui sozinha quando o parecer fica assinado; a de retorno e a da fase externa concluem na emissão (ou no anexo do parecer feito fora).
- **Parecer da fase externa (PJE)**: a mesma tela com `?fase=EXTERNA`, disponível nas fases JULGAMENTO, HABILITACAO e RECURSO (depois da sessão, antes da adjudicação). **Decisão**: não há gatilho automático no fluxo da fase externa (nem todo órgão exige o parecer nº 2, e criar a tarefa para todo pregão/dispensa seria ruído) — o agente **pede o parecer** (`POST …/parecer/fase-externa/solicitar`), que cria a tarefa da Procuradoria (chave `sistema:parecer-fase-externa`, tipo de peça PJE). Ligar a adjudicação ao PJE (exigência por órgão) fica para a Entrega 4/5.

**4. Controle interno (opcional por órgão)**
- Com `controle_interno_ativo`, a tela mostra a manifestação **favorável** ou **com apontamentos** (apontamentos obrigatórios), gerada e **assinada por quem tem o papel CONTROLE_INTERNO** (peça MCI, modelo novo), ou anexada. Desativado: a leitura responde `ativo: false` (a etapa não aparece) e a escrita 409. **Aviso, não bloqueio** (a MCI continua não obrigatória para publicar).

**Regra nova de "peça pronta"** (`pecaContaComoPronta`): peça gerada que **só vale assinada** (`dados_estruturados._exige_assinatura` — despacho AA, parecer PJ/PJE, manifestação MCI geradas pelas telas da 3B) não conta como pronta enquanto não é assinada (ou anexada). Peças antigas, sem a marca, seguem a regra de antes (texto basta) — nenhum fluxo existente muda.

**Gatilhos das tarefas conferidos nos e2e**: assinatura concluída (autorização na 4ª assinatura; parecer; controle interno), anexo (despacho, parecer, minuta), "não se aplica" (DP), diligência sanada (conclui a da diligência e cria a de retorno), emissão do parecer (conclui a da etapa, a de retorno e a da fase externa), reenvio da autorização (conclui a de devolução).

### 10.2 Endpoints novos

| Método e rota | Quem | Isolamento (e2e) |
|---|---|---|
| `GET /fase-interna/:id/autorizacao` | órgão dono | outro órgão 404; fornecedor 403; anônimo 401 |
| `POST /autorizacao/gerar`, `POST /autorizacao/enviar` `{ signatarios? }` | órgão dono | 403 / 403 / 401 |
| `POST /autorizacao/assinar` | **só o signatário designado** (403 aos demais, inclusive o login do órgão) | 403 / 403 / 401 |
| `POST /autorizacao/devolver` `{ motivo }` | signatário designado ou papel AUTORIDADE | 403 / 403 / 401 |
| `GET /fase-interna/:id/minutas` | órgão dono | 404 / 403 / 401 |
| `POST /minutas/:tipo/gerar` (RAG, ME, MC, TODAS), `PUT /minutas/sigilo` | órgão dono | 403 / 403 / 401 |
| `GET /fase-interna/:id/parecer?fase=PREVIA\|EXTERNA` | órgão dono | 404 / 403 / 401 |
| `PUT /parecer`, `POST /parecer/diligencias`, `…/diligencias/:id/reabrir`, `…/cancelar`, `POST /parecer/emitir` | **só o papel JURÍDICO** (403 aos demais) | 403 / 403 / 401; diligência de outro processo 404 |
| `POST /parecer/diligencias/:id/sanar` | responsável pela tarefa, agente, admin do órgão | 403 / 403 / 401; sem papel 403 |
| `POST /parecer/fase-externa/solicitar` | órgão dono | 403 / 403 / 401 |
| `GET /fase-interna/:id/controle-interno` | órgão dono | 404 / 403 / 401 |
| `POST /controle-interno/manifestar` | **só o papel CONTROLE_INTERNO** | 403 / 403 / 401 |

Alterados: `PUT /fase-interna/configuracao` aceita `signatarios_autorizacao` (usuário ativo do órgão + papel; outro órgão 400; só mudam quando enviados) e `autoridade_rotulo`; `POST …/documentos/AA/anexo` conclui a devolução pendente e `…/PJ|PJE/anexo`, o retorno à Procuradoria.

### 10.3 Entidades e colunas

- Novas: `analises_juridicas` (parecer em preparação: processo, fase PREVIA/EXTERNA — único por processo e fase —, marcações do roteiro, conclusão, fundamentação, ressalvas, peça emitida, quem/quando) e `diligencias` (análise, peça do parecer, tipo e versão da peça-alvo, folha, trecho, descrição, item do roteiro, status ABERTA/SANADA/CANCELADA, resposta, versão corrigida, quem abriu/sanou, histórico). Toda coluna de união com `type:` explícito.
- Colunas novas: `configuracoes_fase_interna.signatarios_autorizacao` (jsonb, nullable) e `autoridade_rotulo` (varchar, nullable).
- Nenhum valor novo em enum (logs reaproveitam `DOCUMENTO_CRIADO/VERSIONADO/REPROVADO/EDITADO`, `TRAMITACAO_DEVOLVIDA`, `PROCESSO_TRAMITADO`; devolução usa o status `REPROVADO`). Chaves internas novas no jsonb da peça: `_gerado`, `_desatualizada`, `_exige_assinatura`, `_devolucoes`, `_parecer`, `_manifestacao`.
- **Nenhuma migração de boot**: não há dado a converter (as colunas novas são nullable e as tabelas nascem vazias pelo `synchronize`; os modelos novos e o texto novo do despacho entram pelo seed idempotente que já existia).

### 10.4 Decisões

- **Rascunho do parecer fora da peça**: as marcações do roteiro ficam em `analises_juridicas`; a peça PJ só nasce na emissão (qualquer conteúdo na peça a faria contar como pronta).
- **Responsável da diligência** = o do passo da peça-alvo (mesma regra das tarefas da E2), e não o autor da peça.
- **Um retorno à Procuradoria por análise** (idempotente): várias diligências sanadas não multiplicam tarefas.
- **Parecer desfavorável** também é peça pronta (assinada) — o parecer é opinativo; a conclusão aparece na tela e no texto. Tratar o desfavorável como bloqueio é decisão do órgão (Entrega 4).
- **PJE por pedido** (ver item 3).
- A assinatura do parecer e do controle interno é feita pelo emissor no mesmo clique (enviar + assinar com o próprio usuário).

### 10.5 Testes

- **Unitários novos** (`src/fase-interna/telas/`): `minutas-regras.spec.ts` (regerar × desatualizada × ignorar; hash; VINC-01 com o "PA 115/2025"; incisos do art. 75 citados), `parecer-regras.spec.ts` (roteiro do art. 72/75/41/24/92/vinculação; marcações; diligência abre/sana/reabre/cancela; emissão; texto do parecer), `autorizacao-regras.spec.ts` (situação, portão B, colegiada "posso assinar", resumo do celular, validação dos signatários da configuração); `peca-regras.spec.ts` (peça que só vale assinada). Suíte unitária completa: **96 suítes / 1144 testes**, todas passando.
- **E2E novo** `test/fase-interna-e3b.e2e-spec.ts` (26 testes): configuração dos signatários (outro órgão 400, não-admin 403); despacho gerado (processo, fundamento, teto, autoridade) que não conta antes de assinado; **Mesa com 4 signatários — só AUTORIZADA na 4ª** e a tarefa da etapa conclui; quem não é signatário 403; **devolver com motivo cria a tarefa do agente** (e reenviar a conclui); despacho anexado autoriza; **minutas com o número e o fundamento do processo** (o outro processo continua com o dele); sigilo; **mudar o fundamento regera** (editada à mão fica desatualizada; idempotente); **diligência** (tarefa do responsável, favorável bloqueado, sanar 403/400, TR v2, **volta para o Jurídico sem perder a autorização assinada depois**, reabrir/cancelar); **parecer favorável conclui as tarefas**; PJE no julgamento; **controle interno ativo/inativo**; **isolamento de todos os endpoints novos**. Sem migração de boot a rodar 2x.
- **E2E afetados** (arquivo a arquivo, todos passando): fase-interna-e1 (26), fase-interna-e2 (19), fase-interna-e3a (14), dispensa-eletronica (45), cockpit-processo (8), isolamento-dados-licitacao (115), transicoes-fase-interna-pncp (12).
- **Frontend**: `npx tsc --noEmit` limpo; `next build` concluído sem erro (as 4 rotas novas compiladas).

### 10.6 Fica para depois

- ~~**Portões que travam** (Entrega 4): autorização sem o portão B, publicação sem o portão C; `ENQ-01`/`VINC-01` como bloqueio~~ — feito (§11). "Parecer sem as minutas" continua como aviso na tela do parecer.
- **PJE ligado à adjudicação** (exigir o parecer da fase externa por órgão) e gatilho automático da tarefa.
- **Destaque do trecho dentro do PDF anexado** (hoje o PDF abre na folha; o trecho é destacado só no texto das peças feitas no sistema).
- Edição do texto do parecer antes de assinar (hoje: roteiro + fundamentação + ressalvas; o texto completo pode ser anexado feito fora).
- Controle interno como bloqueio e "não se aplica" para ele (decisão do órgão).

## 11. Entrega 4 — CONCLUÍDA (26/09/2026)

Branch `claude/fase-interna-e4` (a partir do main com as Entregas 1 a 3B). Sem push/PR nesta etapa. Commits: `85b0a57f` (backend), `3467c024` (portões A e B sem ler o texto dos PDFs), `586f8f52` (frontend) e o desta documentação.

**Motor de conformidade e portões A, B e C.** O motor cruza as peças dos autos entre si e liga os três portões da SPEC aos atos que já existiam — **sem máquina paralela**: as pré-condições do `TransicoesService` (`definicoes.ts`), a pré-publicação (`pre-publicacao.ts`) e os serviços das peças perguntam ao motor.

### 11.1 O motor (`backend/src/fase-interna/conformidade/`)

- **Regras = funções puras** `(contexto) => AchadoCalculado[]`, registradas na lista `REGRAS` (`regras.ts`) com código, descrição, severidade (BLOQUEIO | ATENCAO), a **etapa em que roda** (PESQUISA | AUTORIZACAO | PUBLICACAO) e o **portão** (A | B | C). Cada regra pode dizer por que **não se aplica** agora (`aplicavel`), e o motor isola a regra que falha (as outras rodam; os achados dela não mudam).
- **Contexto montado uma vez** (`contexto.ts`, função pura sobre as linhas do banco — testável à mão): processo (fundamento legal efetivo da E1 e o inciso do art. 75, número do PA e da dispensa, sigilo, cronograma, exercício, data pretendida do DFD), instrução (`getInstrucao`), **peças ativas com o texto** (feita aqui: uma "página" por seção, na folha inicial; **anexada: o texto do PDF página a página, na folha certa** — folha inicial + página − 1), documentos da aba Documentos que não viraram a peça, pesquisa (itens, cotações, método, publicação prevista), reserva (exercício, linhas e as leis da tabela única), consumo do limite (`ConsumoLimiteService`, E1) e o calendário do órgão.
- **Texto dos PDFs** (`texto-pdf.ts`): com o `pdf-parse`, a biblioteca que o projeto já usa, **sem OCR** (PDF digitalizado fica "sem texto" — a IA sobre os PDFs é a Entrega 7). Cache em memória pela impressão (SHA-256) do arquivo. O `pdf-parse` 2.x carrega o worker do pdf.js por `import()` dinâmico; onde isso não existe (Jest), a mesma biblioteca roda num processo Node filho.
- **Conferências de texto numa implementação só** (`texto.ts`, `art72.ts`): número de outro processo (VINC-01), inciso do art. 75 nas três formas ("art. 75, inciso II", "art. 75, II", "inciso II do art. 75"), leis LDO/LOA/PPA classificadas pelo contexto, e o checklist do art. 72. **Movidas** de `minutas-regras.ts` e `autorizacao-regras.ts` (que as reexportam); as cláusulas do art. 92 saíram de `parecer-regras.ts` para a regra ART92-01.
- **Revisão idempotente** (`motor.ts` — `planejarRevisao`, pura): a ocorrência que continua (mesma regra + `chave`) não gera linha nova nem escrita; a que **deixa de ocorrer vira RESOLVIDO** (quem, quando e o motivo — "deixou de ocorrer" ou "a regra deixou de se aplicar"); a que reaparece é **REABERTA**; o **JUSTIFICADO persiste** enquanto a mesma ocorrência persistir e volta a ABERTO se virar bloqueio. Cada mudança vai para o `historico` do achado.
- **Quando roda:**
  - **sob demanda** — "Revisar agora" (`POST …/conformidade/revisar`) e na primeira abertura da tela (ou quando a última revisão ficou para trás de uma peça, item, reserva ou do processo);
  - **ao mudar uma peça** — na MESMA fila por processo das tarefas (gatilho pós-commit da E2): `TarefasService.registrarAntesDeSincronizar` roda a revisão e, em seguida, a sincronização das tarefas (que já lê o portão A). Os caminhos por SQL cru avisam (`avisarPecaAlterada`: valores dos itens da pesquisa feita fora, sigilo);
  - **antes dos atos protegidos** — em memória, com o ato que vai ser praticado (`ato_pretendido`), sem gravar nada dentro da transação do ato.
- Só roda na **fase interna**: processo divulgado fica com a conferência congelada (ver 11.6). Desligar tudo: `FASE_INTERNA_CONFORMIDADE=false` (nenhum portão bloqueia).

### 11.2 As regras

| Código | Sev. | Etapa · portão | O que confere | Caso real (PA 139/2025) |
|---|---|---|---|---|
| LIM-01 | BLOQUEIO | Pesquisa · A | Soma das dispensas do órgão no exercício, no mesmo ramo (classe CATMAT/CATSER + unidade gestora) + esta, dentro do limite do inciso (`limiteDispensa`/`consumoDoLimite`, E1) | variante: + R$ 1.500 no ramo → R$ 63.253,44 |
| LIM-02 | ATENÇÃO | Pesquisa · A | Acima de 80% do limite | **98,4% de R$ 62.725,59 — Dec. 12.343/2024** |
| A72-I, A72-II, A72-IV | BLOQUEIO | Autorização · B | Toda peça do inciso presente na instrução pronta ou "não se aplica" (DFD/ETP/AR/TR; PP; DO) — conferido **até a autorização** (e no ato de autorizar) | variante antes da autorização |
| A72-III, A72-VII | ATENÇÃO | Publicação · C | Parecer (III) e justificativa de preço — relatório/justificativa (VII), depois da autorização | variante |
| A72-V, A72-VI | — | fase externa | Habilitação e razão da escolha: **não bloqueiam** (não se aplicam à fase interna) | — |
| A72-VIII | BLOQUEIO | Publicação · C | Autorização pronta (garantida pela instrução obrigatória do PUBLICAR) | — |
| ENQ-01 | BLOQUEIO | Publicação · C | O inciso do art. 75 citado em cada peça (feitas aqui e **PDFs anexados**) é o de `fundamento_legal` | relatório (1ª via, fl. 14) e minuta do aviso (fl. 41) no inciso I × processo no II |
| VINC-01 | BLOQUEIO | Publicação · C | Despacho, informação orçamentária, relatório, minutas, parecer, controle interno e justificativa citam o número deste PA/dispensa | contrato com o "PA 115/2025 / Dispensa 025/2025" (fl. 63) |
| MARCA-01 | BLOQUEIO / ATENÇÃO | Publicação · C | Correção do plano §5.1: marca sem "apenas como referência/ou similar" e sem justificativa = BLOQUEIO; com "similar/equivalente" = ATENÇÃO **com justificativa obrigatória** (a do art. 41, I no ETP ou a do achado) — `detectarIndicacaoMarca` (E3A) | "similar ou superior ao ARION (SNEWS)" no ETP (fls. 5 e 10) e no TR |
| PRECO-01 | ATENÇÃO (exige justificativa) | Publicação · C | Valor estimado igual a uma única cotação, método ≠ média/mediana e sem justificativa do método | igual à proposta da DMNEWS |
| PRECO-02 | ATENÇÃO | Publicação · C | Cotação com validade anterior à publicação prevista (`alertasDaCotacao`, E3A) | Legado válida até 31/12/2025; publicação 13/01/2026 |
| PRECO-03 | ATENÇÃO | Publicação · C | Cotação emitida há mais de 6 meses | variante |
| CRONO-01 | ATENÇÃO | Publicação · C | Peça datada (`data_documento`, E1) antes da peça que a solicitou — pelas dependências das etapas (E2); a portaria anual fica fora | informação orçamentária (04/12) antes da pesquisa (10/12); ETP (14/11) antes do DFD (10/12) |
| LEI-01 | ATENÇÃO | Publicação · C | LDO/LOA/PPA com o mesmo número no despacho, na informação orçamentária e no parecer (e na tabela única da reserva) | LOA 1.141/2024 × 1.151/2024 |
| EXERC-01 | ATENÇÃO | Publicação · C | Reserva do exercício N com a publicação/o contrato previstos para N+1 → **tarefa da Contabilidade** (a mesma "Renovar dotação" da 3A) | reserva de 2025, publicação em 2026 |
| DUP-01 | ATENÇÃO | Publicação · C | Duas peças ativas do mesmo tipo com textos diferentes (inclusive o PDF da aba Documentos que não virou a peça) | relatório nas fls. 14–16 e 38–40 |
| ASS-01 | BLOQUEIO | Publicação · C | Peça nos autos sem data ou com assinaturas faltantes | despacho da Mesa sem data |
| PRAZO-01 | BLOQUEIO | Publicação · C | Janela de propostas com o mínimo de dias úteis (3 na dispensa; art. 55 nas demais), **no calendário do órgão** — a mesma `avaliarPrazosDePublicacao` da pré-condição do PUBLICAR | variante (fim 15/01) |
| MINUTA-DESAT | ATENÇÃO | Publicação · C | Minuta marcada "desatualizada" (E3B) | variante |
| SIGILO-01 | ATENÇÃO | Publicação · C | Orçamento sigiloso com a justificativa do art. 24 | variante |
| ART92-01 | ATENÇÃO | Publicação · C | Cláusulas do art. 92 preenchidas na minuta do contrato feita no sistema | variante |

**Fixtures** (`conformidade/fixtures/pa-139-2025.ts`): o processo real (folhas, datas, textos, cotações, reserva, consumo) e o mesmo processo **corrigido**. Cada regra dispara com o dado real (ou com a variante, quando o erro não estava nos autos) e não dispara com o corrigido — com o real, disparam LIM-02, ENQ-01, VINC-01, MARCA-01, PRECO-01, PRECO-02, CRONO-01, LEI-01, EXERC-01, DUP-01 e ASS-01; com o corrigido, nenhuma.

### 11.3 Achados e tarefas

- **Entidade `achados_conformidade`**: processo, regra, `chave` (a ocorrência — única por processo e regra), severidade, etapa, portão, título, mensagem, **evidências** (lista de {peça, tipo, título, folha, trecho}), `exige_justificativa`, tipo da peça responsável, ação, status **ABERTO | RESOLVIDO | JUSTIFICADO**, justificativa (quem/quando), resolução (quem/quando/motivo), primeira e última detecção, histórico. **`revisoes_conformidade`**: a última revisão do processo (quando, quem/gatilho, a situação de cada regra — o "N regras aprovadas").
- **Achado BLOQUEIO aberto → tarefa** (origem **ACHADO**, tipo ACHADO, chave `achado:<id>`) para o **responsável pela peça** (o do passo da peça — mesma regra das tarefas da E2), com o que falta e onde. **Conclui sozinha** quando o achado se resolve (registrando quem). Exceções: A72-* e PRAZO-01 não geram tarefa (a peça pendente já é a tarefa da etapa; o prazo é do publicar), nem "assinaturas faltantes" (o portal já avisa os signatários).
- **EXERC-01 → tarefa da Contabilidade** "Prever a renovação da dotação" com a **mesma chave** da 3A (`sistema:renovar-dotacao`, origem ACHADO): a emissão da nova versão/o anexo da DO a concluem (3A), e o motor a conclui se o achado se resolver.
- **Justificar** (só ATENÇÃO; texto ≥ 20 caracteres): o achado fica JUSTIFICADO, a justificativa vai para o log da fase interna (`DOCUMENTO_EDITADO`, `dados_depois.conformidade = true`) e para `ConformidadeService.justificativasParaAutos` — **disponível para o PDF dos autos (Entrega 6)**. BLOQUEIO não se justifica (409).
- Processo revogado/anulado: as tarefas dos achados são canceladas pela sincronização da E2; divulgado: canceladas pelo motor ("fase interna encerrada").

### 11.4 Portões ligados aos atos

- Ponte sem injeção de dependência (`conformidade/portoes.ts`, mesmo padrão do `aviso-tarefas.ts`): o `ConformidadeService` se registra ao subir; quem pratica o ato pergunta as pendências. Na máquina: nova consulta opcional `conformidade(portao)` em `ConsultasTransicao` (os testes unitários antigos seguem sem ela).
- **Portão A** (LIM-01): pré-condição `portaoALimite` no **CONCLUIR_PESQUISA_PRECOS**; **emitir o mapa e a certidão** (`POST …/pesquisa/emitir`) confere o limite **com o valor que a pesquisa vai adotar** (consumo simulado por item — `ConsumoLimiteService.consumoDoProcesso(…, { valores_itens })`); e o LIM-01 aberto **segura a conclusão do passo da pesquisa** nas etapas da E2 (`etapasDaFaseInterna(…, bloqueios)`: a pesquisa fica EM_ANDAMENTO com `bloqueio_portao`, a reserva e a autorização não abrem). Na pesquisa feita fora os valores são gravados (é o fato), mas a etapa não conclui.
- **Portão B** (art. 72, I, II e IV + o limite): **anexar o despacho** (AA) assinado fora, **enviar o despacho** para assinatura (tela da autorização e o envio genérico da E1) e **assinar** pela tela da autorização. A tela da autorização mostra o que impede (`portao_b_bloqueios`).
- **Portão C** (conformidade): pré-condição `portaoCConformidade` no **PUBLICAR** (e no PUBLICAR do credenciamento): recusa com achado **BLOQUEIO** aberto e com **ATENÇÃO que exige justificativa** sem ela (MARCA-01 "ou similar", PRECO-01). As mensagens dizem o que falta e **onde** (peça e folha): "Portão C (conformidade) — VINC-01: Minuta do contrato cita PA nº 115/2025… [Minuta do contrato, fl. 5]". O cronograma do pedido de publicação entra no contexto. A pré-publicação ganhou a linha **CONFORMIDADE** (ação `ABRIR_CONFORMIDADE`).
- Critério de aceite da SPEC — **"não é possível publicar com achado BLOQUEIO aberto"**: PRAZO-01 e A72-VIII são garantidos pelas pré-condições que o PUBLICAR já tinha (`prazosDePublicacao` com as datas do pedido e `instrucaoCompleta`), por isso o portão não os repete (uma mensagem só).

### 11.5 Tela e integrações

- **Conformidade** (`/orgao/processos/[id]/fase-interna/conformidade`, mockup Conformidade; a etapa 8 da barra): contagem de bloqueios, atenções e regras aprovadas; cada achado com a descrição, as **evidências clicáveis** (abrem a peça **na folha**, com o trecho — o **visor dos autos do parecer**, extraído para `VisorDosAutos`) e a ação (**Corrigir peça** → a tela da peça; **Justificar**; **Abrir**); resolvidos e a lista de regras por portão; quadro do **aviso** (publicação prevista, início/fim do recebimento, dias úteis de divulgação no calendário do órgão, canais); **"Publicar — resolva N bloqueios"** desabilitado com a contagem (liberado, leva ao checklist de publicação do processo); assinaturas das peças; justificativas nos autos; "Revisar agora".
- **Painel do processo**: o quadro "Fluxo da fase interna" mostra o resumo da conformidade (`GET …/conformidade/resumo`) e, no passo da pesquisa, o bloqueio do portão A. **Caixa de tarefas**: etiqueta "Conformidade" e "Abrir achado" (destino `…/conformidade#achado-<id>`); a tarefa da publicação leva à tela da conformidade.
- **Roteiro do parecer (E3B) lê o motor**: art. 75 ← ENQ-01, art. 41 ← MARCA-01, art. 24 ← SIGILO-01, art. 92 ← ART92-01, vinculação ← VINC-01, art. 72 ← a mesma função das regras A72 — agora também sobre o texto dos PDFs anexados. O detalhe do roteiro não cita mais "art. 75, I" (o parecer montado do roteiro não pode virar ele mesmo uma peça divergente).

### 11.6 Decisões

- **Processos em andamento — o portão vale para o ato que ainda vai ser praticado.**
  - Processo **já divulgado** (fora da fase interna): nenhum portão se aplica, o motor não reavalia (a conferência fica como estava na publicação; as tarefas dos achados são canceladas) e os atos seguintes seguem normalmente.
  - Portão B **superado**: com a autorização já dada (assinada ou anexada), A72-I/II/IV deixam de se aplicar ("a autorização já foi dada") — um processo autorizado antes desta entrega com ETP pendente não fica travado; a instrução obrigatória continua cobrada pelo PUBLICAR, como antes. Uma nova autorização (nova versão do despacho) passa pelo portão de novo.
  - Processo na fase interna que ainda vai **publicar** passa pelo portão C, inclusive os criados antes desta entrega (é o ato que falta). Achado de dado legado (ex.: anexo sem data vindo da aba Documentos) se resolve anexando de novo com a data.
- **Legado "só texto"**: o despacho criado pelo editor antigo (texto, sem assinatura) continua contando como antes (compatibilidade dos fluxos existentes); ASS-01 não o acusa. As vias de autorização da 3B (anexo, envio para assinatura, "Autorizar e assinar") passam pelo portão B; a assinatura pelo portal genérico, depois de um envio que já passou pelo portão, não é conferida de novo.
- **VINC-01** só nas peças que vinculam o ato ao processo (despacho, informação orçamentária, relatório, minutas, parecer, controle interno, justificativa): DFD/ETP/TR podem citar contratações anteriores legitimamente.
- **CRONO-01** usa as dependências das etapas (E2) como "quem solicitou quem"; a portaria de designação (anual) não entra.
- **SIGILO-01 e ART92-01 como ATENÇÃO** (como no roteiro da 3B): o sigilo já exige justificativa na tela das minutas; a minuta anexada não é lida por cláusula.
- **ATENÇÃO que exige justificativa** (MARCA-01 "ou similar", PRECO-01) segura a publicação até ser justificada — é o "com justificativa obrigatória" do plano §5.1; as demais atenções nunca bloqueiam.
- **Sem migração de boot**: não há dado a converter (as tabelas nascem vazias pelo `synchronize`); a primeira revisão de cada processo acontece na primeira gravação de peça, na abertura da tela ou no ato protegido. Nenhum valor novo em enum (log reaproveita `DOCUMENTO_EDITADO`; tarefa reaproveita a origem/tipo ACHADO da E2). jsonb sem default (o synchronize recriaria a coluna).

### 11.7 Endpoints novos

| Método e rota | Quem | Isolamento (e2e) |
|---|---|---|
| `GET /fase-interna/:id/conformidade` | órgão dono | outro órgão 404; fornecedor 403; anônimo 401 |
| `GET /fase-interna/:id/conformidade/resumo` | órgão dono | 404 / 403 / 401 |
| `POST /fase-interna/:id/conformidade/revisar` | órgão dono | outro órgão 403; fornecedor 403; anônimo 401 |
| `POST /fase-interna/:id/conformidade/achados/:achadoId/justificar` `{ justificativa }` | órgão dono (só ATENÇÃO; BLOQUEIO 409) | 403 / 403 / 401; achado de outro processo 404 |

Alterados: `GET /fase-interna/:id/autorizacao` devolve `portao_b_bloqueios`; `GET /fase-interna/:id/etapas` devolve `bloqueio_portao` e `portao: 'A_LIMITE'` na pesquisa; `GET /licitacoes/:id/conferencia-publicacao` ganhou a linha CONFORMIDADE; `POST …/pesquisa/emitir`, `POST …/documentos/AA/anexo`, `POST …/documentos/AA/assinatura`, `POST …/autorizacao/{enviar,assinar}` e os atos CONCLUIR_PESQUISA_PRECOS e PUBLICAR recusam (400, `pendencias`, `portao`) quando o portão não passa.

### 11.8 Testes

- **Unitários novos** (`src/fase-interna/conformidade/`): `regras.spec.ts` (**uma suíte por regra**, com o PA 139/2025 real, a variante e o corrigido), `motor.spec.ts` (idempotência: segunda revisão sem mudança; resolvido some e reabre; justificado persiste na mesma ocorrência e não cobre ocorrência nova; justificado que vira bloqueio reabre; regra que falha não resolve os achados dela; portões A/B/C e o que é garantido pelo ato; o botão "resolva N"; **montagem do contexto**), `texto.spec.ts` (incisos nas três formas, número de outro processo com a folha, leis classificadas, **texto de PDF página a página**). Ajustados: `parecer-regras.spec.ts` (roteiro sobre a avaliação do motor), `etapas-fase-interna.spec.ts` (portão A segura a pesquisa; divulgado não muda o passado), `tarefa-regras.spec.ts` (destino do achado e da publicação). Suíte unitária completa: **99 suítes / 1208 testes**, todas passando.
- **E2E novo** `test/fase-interna-e4.e2e-spec.ts` (17 testes): **publicar recusado com BLOQUEIO aberto** (VINC-01 lido do PDF anexado, com peça, folha e trecho) e **liberado depois de corrigir** (versão nova → achado resolvido sozinho, tarefa concluída, revisão idempotente); **ATENÇÃO justificado libera** (MARCA-01 "similar ou superior ao ARION", justificativa nos autos e no log; bloqueio não se justifica 409); **portão A com LIM-01** (CONCLUIR_PESQUISA_PRECOS e a emissão do mapa recusados; a etapa da pesquisa não conclui; reduzido o valor, LIM-02 e o ato passa); **portão B** sem o art. 72 completo (anexo, envio à autoridade e envio genérico recusados; completo, autorizado); **achado cria e conclui a tarefa**; **EXERC-01 cria e conclui a tarefa da Contabilidade**; **processo já publicado não é travado**; **isolamento** de todos os endpoints novos. Sem migração de boot a rodar 2x.
- **E2E afetados** (arquivo a arquivo): fase-interna-e1 (26), fase-interna-e2 (19), fase-interna-e3a (14), fase-interna-e3b (26), dispensa-eletronica (45), cockpit-processo (8), isolamento-dados-licitacao (115), divulgacao-pncp (11), transicoes-fase-interna-pncp (12), publicacao-prazos (36), credenciamento (30), transicoes-licitacao (22), dispensa-motor-unico (15) — todos passando. Ajustados para o portão B (o comportamento novo): `fase-interna-e3b` (enviar à Mesa sem o art. 72 é recusado; com a instrução, segue igual; despacho anexado idem), `fase-interna-e1` (assinatura da Mesa com a instrução pronta) e `fase-interna-e2` (despacho anexado depois do art. 72).
- **Frontend**: `npx tsc --noEmit` limpo; `next build` concluído sem erro (a rota nova `/orgao/processos/[id]/fase-interna/conformidade` compilada).

### 11.9 Fica para depois

- **IA lendo os PDFs** (Entrega 7): peças digitalizadas (sem texto) ficam fora das regras de texto — o motor as marca "sem texto".
- ~~**Autos em PDF com as justificativas** (Entrega 6)~~ — feito (§13, termo de justificativas).
- **Cadastro de marcas do órgão** para a MARCA-01 procurar por nome (a detecção segue pelo padrão do texto).
- Exigir o **parecer da fase externa** antes da adjudicação e o **controle interno como bloqueio** (decisões do órgão). A Entrega 5 manteve o controle interno como **aviso** (decisão 3) — ver §12.6.
- Regra para a **cotação do mesmo produto por fabricante e revenda** e para a **segregação de funções** (alertas de risco do §2.1) — não estavam no escopo desta entrega.
- "Parecer só depois das minutas" (gancho `MINUTAS_ANTES_DO_PARECER` da E2) e o **parecer desfavorável como bloqueio**: continuam como aviso (decisão do órgão).
- A assinatura pelo portal genérico de assinaturas (menu "Assinaturas pendentes") de um despacho já enviado não reconfere o portão B (o envio já passou por ele); a tela da autorização confere.

## 12. Entrega 5 — CONCLUÍDA (26/09/2026)

Branch `claude/fase-interna-e5` (a partir do main com as Entregas 1 a 4). Sem push/PR nesta etapa. Commits: `42bf517f` (Entrega 5), `aa245eae` (Entrega 6), `a0ed33b2` (documentação), `2684120d` (correção da corrida dos autos) e o do ajuste "escolha por processo" (§12.7).

**Publicação (etapa 8) ligada à divulgação que já existia (Etapa A) e dispensa com ou sem etapa de lances (decisão 5 do dono).** Sem máquina paralela: o ato é o PUBLICAR de sempre (portão C incluso) e o motor da janela/julgamento é o da Etapa A.

> **Ajuste do dono (26/09/2026, §12.7):** com ou sem lances passou a ser **escolha do agente no processo**; a configuração do órgão virou só o **padrão sugerido**. O texto abaixo descreve a primeira versão; onde divergir, vale o §12.7.

### 12.1 Dispensa com ou sem etapa de lances

- **Configuração por órgão** — `configuracoes_fase_interna.dispensa_com_lances` (boolean, `default: true` = IN 67). `PUT /fase-interna/configuracao` aceita o campo (booleano, senão 400; só muda quando enviado — o "Salvar" da tela o envia). Tela **Configurações › Fase interna e tarefas**, bloco "Dispensa eletrônica — disputa".
- **Gravado no processo no PUBLICAR e congelado** — coluna nova `licitacoes.dispensa_com_lances` (boolean, nullable, `type:` explícito). Efeito persistido do PUBLICAR (`congelarModoDisputaDispensaSql`, em `publicacao/publicacao.sql.ts`), o PRIMEIRO da transação — antes do aviso, que o imprime — e anotado nos dados do ato (`licitacao_transicoes.dados.dados.dispensa_com_lances`). Mudar a configuração depois não altera o processo publicado. CANCELAR_PUBLICACAO devolve à fase interna: o próximo PUBLICAR grava de novo (o do dia).
- **Regra pura única** — `licitacoes/modo-disputa-dispensa.ts`: `modoDisputaDaDispensa(processo, configuração)` (fase interna → a configuração; publicado → o gravado; **NULL = publicado antes desta entrega → com lances**, a regra que valia; a configuração nunca muda o passado), `dispensaSemLances`, `textoFormaDisputa` (aviso e minuta) e `vencedoresSemLances` (menor preço; **empate → a proposta registrada primeiro** — `COALESCE(data_envio, created_at)` —, como o aviso real da Câmara).
- **O motor existente respeita o modo:**
  - `janelaLancesDispensaEncerrada` (pré-condição do JULGAR_DISPENSA): sem lances, não exige a janela;
  - `abrirLancesDispensa`: sem lances → 409 ("publicada SEM etapa de lances…");
  - `julgarDispensa`: sem lances, ignora lances e usa `vencedoresSemLances` (sem sorteio — o regulamento decide pelo registro); com lances, igual a antes (menor entre proposta e lances; art. 60 + sorteio). O modo vai para o registro do ato e para a resposta (`com_lances`);
  - classificação por item (`GET …/dispensa/classificacao`) e regras do chat (texto) acompanham;
  - **negociação com o vencedor (IN 67, art. 16) nos dois modos** (o chat NEGOCIACAO não depende da janela).
- **Aviso e telas refletem o modo:** o aviso de contratação direta (`aviso-dispensa-pdf.ts`) ganhou a linha **Disputa** ("Com etapa de lances de 6 a 10 horas… (IN SEGES 67/2021, arts. 11 e 15)" ou "Sem disputa de lances, apenas cadastro de propostas (regulamento do órgão)"), o critério com o desempate e o parágrafo final pela `textoFormaDisputa`; a prévia usa a configuração, a versão publicada o valor gravado. A **minuta do aviso** (ME) ganhou `{{licitacao.forma_disputa}}` na seção "Critério de julgamento" (modelo do sistema atualizado pelo seed, só onde o texto estava vazio). `processo-completo.licitacao.modo_disputa_dispensa` alimenta a etapa atual da dispensa (sem o botão "Abrir etapa de lances" no modo sem lances; "com etapa de lances de X a Y" com as datas da janela, ou a descrição do modo, e a **referência legal**: IN 67 ou "regulamento do órgão").

### 12.2 Etapa 8 ligada à divulgação existente

- **Publicar na tela da conformidade** (dispensa): quadro do aviso com o **fim do recebimento** (data mínima sugerida no calendário do órgão, painel de dias úteis e feriados — art. 75, §3º, mínimo de 3), **Gerar aviso (PDF)**/**Conferir**, o modo da disputa, os **canais** e **Publicar** — que pratica o PUBLICAR existente (`PUT /licitacoes/:id/publicar-edital`) pelo **mesmo hook** do diálogo "Divulgar aviso" do processo (`useDivulgacaoAviso.ts`, extraído — sem duplicar). Nas modalidades com edital o botão continua levando ao cartão "Publicar edital" do processo.
- **Todos os caminhos do PUBLICAR passam pelo portão C** (conferido): `PUBLICAR` (FLUXO_COMPETITIVO, FLUXO_DISPENSA, FLUXO_INEXIGIBILIDADE e os especiais — leilão/concurso/diálogo herdam a definição por `comPendencia`), `PUBLICAR_CREDENCIAMENTO`, `publicarEdital`, `PncpService` e `PncpFilaService` (verificar/executar o mesmo ato); `POST atos/PUBLICAR` é recusado (exige o cronograma). Não há caminho que grave a fase PUBLICADO/AGUARDANDO fora da máquina (fora scripts de semente e a migração da Etapa A).
- **Canais com a situação real** (`PublicacaoTelaService.quadro`, `GET /fase-interna/:id/publicacao` e dentro da tela da conformidade): **PNCP** (aguardando a conformidade / envio automático ao publicar / na fila / recusado com o HTTP e a mensagem / publicado com o número de controle / "sem PNCP — Diário Oficial"), **sítio oficial** (portal público, após a confirmação), **Diário Oficial do órgão** (pendente / nº, data e página) e **plataforma** (propostas até…, com ou sem lances).
- **A confirmação do PNCP conclui a etapa 8 e fecha a tarefa** — gatilho conferido: em `etapasDaFaseInterna` o passo PUBLICACAO fica **EM_ANDAMENTO em AGUARDANDO_DIVULGACAO** (antes, concluía já no PUBLICAR) e CONCLUIDO só com a divulgação confirmada; a mudança de fase do CONFIRMAR_DIVULGACAO dispara a sincronização (subscriber da E2), que conclui a tarefa em nome de quem publicou. Revogado/anulado enquanto aguarda: cancelada. No órgão sem PNCP, o registro do Diário Oficial confirma (abaixo) e fecha do mesmo jeito.
- **Registro no Diário Oficial do órgão = peça da publicação** — tipo novo `PUBLICACAO_DIARIO_OFICIAL` ('PDO', só acrescentado ao enum). `POST /fase-interna/:id/publicacao/diario-oficial` (multipart: `numero_edicao` obrigatório, `data_publicacao` não futura e não anterior ao ato de publicação, `pagina`, `link`, `observacao`, `arquivo` PDF opcional — com folhas nos autos). Versões como qualquer peça; só depois de publicar (409 antes; também pelo anexo genérico). **Reaproveita o registro da Etapa A:** no órgão SEM integração ao PNCP e aguardando a divulgação, o registro chama `confirmarDivulgacaoOficial` (meio DIARIO_OFICIAL, referência "Diário Oficial nº X, p. Y") — é a divulgação oficial (art. 176, par. único); no órgão integrado, só a peça.

### 12.3 Controle interno (decisão 3)

Conferido: com a etapa ativa, a manifestação aparece **antes da publicação como aviso**, sem bloquear — linha nova **CONTROLE_INTERNO** (ALERTA, `bloqueia: false`, ação `ABRIR_CONTROLE_INTERNO`) na conferência de pré-publicação e o aviso no quadro da conformidade. (Com o controle interno ativo e sem manifestação, a tarefa da publicação só nasce depois de publicar — a dependência da E2 continua; o ato não depende dela.)

### 12.4 Entidades, colunas e endpoints

- Colunas novas: `licitacoes.dispensa_com_lances` (boolean, nullable), `configuracoes_fase_interna.dispensa_com_lances` (boolean, default true). Valor novo no enum `documentos_fase_interna.tipo` (e nos das tabelas que o reusam): `PDO`.
- **Nenhuma migração de boot**: não há dado a converter (NULL no processo = regra da época, com lances; a configuração nasce true).

| Método e rota | Quem | Isolamento (e2e) |
|---|---|---|
| `GET /fase-interna/:id/publicacao` | órgão dono | outro órgão 404; fornecedor 403; anônimo 401 |
| `POST /fase-interna/:id/publicacao/diario-oficial` | órgão dono | outro órgão 403; fornecedor 403; anônimo 401 (nada gravado) |

Alterados: `PUT /fase-interna/configuracao` (+`dispensa_com_lances`; B não muda A), `GET /fase-interna/:id/conformidade` (+`publicacao`, `aviso.modo_disputa`, canais com `chave`/`ok`), `GET /licitacoes/:id/processo-completo` (+`modo_disputa_dispensa`), `GET /licitacoes/:id/conferencia-publicacao` (+CONTROLE_INTERNO), `POST /licitacoes/:id/julgar-dispensa` (+`com_lances`), `POST …/dispensa/abrir-lances` (409 sem lances), `GET /fase-interna/:id/etapas` (publicação EM_ANDAMENTO aguardando o PNCP).

### 12.5 Testes

- Unitários: `modo-disputa-dispensa.spec.ts` (padrão da configuração, fase interna × congelado, legado NULL, textos, julgamento sem lances com empate pela ordem de registro — em qualquer ordem da lista —, lances ignorados); `etapas-fase-interna.spec.ts` (publicação EM_ANDAMENTO aguardando o PNCP; revogado aguardando = cancelada).
- E2E novo `test/fase-interna-e5.e2e-spec.ts` (16): configuração (padrão, 400, só o órgão do token); fase interna mostra o modo da configuração e a minuta do aviso o reflete; **publicar grava e congela** (processo, histórico, aviso "sem disputa de lances"); **mudar a configuração depois não altera** os dois processos; **sem lances**: janela 409, julgar sem janela, empate → a registrada primeiro, negociação; **com lances continua exigindo a janela**; **publicar pela conformidade com o portão C** (quadro, canais, recusa com VINC-01, corrigido publica); **etapa 8 EM ANDAMENTO → confirmação do PNCP conclui a etapa e a tarefa** (quem cumpriu = quem publicou); Diário Oficial no órgão integrado (peça com folhas, sem mudar a divulgação; data futura e sem número 400) e no **órgão sem PNCP** (confirma a divulgação, etapa e tarefa concluídas); **controle interno ativo = aviso**; isolamento.

### 12.6 Decisões e o que ficou de fora

- **NULL = com lances** para processo publicado antes: nenhuma migração e nenhum processo muda de regra.
- **Empate sem lances sem sorteio**: o regulamento local (Câmara de LEM) decide pela ordem de registro; com lances, os critérios do art. 60 e o sorteio de antes.
- **Controle interno continua aviso** (decisão 3); "bloqueio" fica como opção futura do órgão.
- **Sítio oficial** = o portal público do próprio Portal DCP (não há integração com o site do órgão).
- A publicação pelo quadro da conformidade é da **dispensa** (aviso gerado pelo sistema); nas licitações o edital continua sendo anexado no cartão "Publicar edital" do processo.

### 12.7 Ajuste — a disputa é escolha do agente no processo (pedido do dono)

A Lei 14.133 (art. 75, §3º) admite a dispensa sem disputa de lances (aviso por no mínimo 3 dias úteis para propostas adicionais, escolhida a mais vantajosa). Por isso:

- **Escolha no processo:** `licitacoes.dispensa_com_lances` é definida pelo agente, na fase interna, em **Editar processo › Classificação** (e no quadro do aviso da conformidade), com duas opções: **"Com disputa de lances (sessão de lances em tempo real)"** e **"Sem disputa de lances (só recebimento de propostas no prazo do aviso)"**, cada uma com a linha de explicação e a base. Rota própria `PUT /fase-interna/:id/modo-disputa` `{ com_lances }` (DonoFaseInternaGuard): não booleano 400; outra modalidade 400; processo encerrado 409; **depois de publicar 409** ("congelada na publicação…"). Grava pela entidade (as minutas geradas se atualizam — `dispensa_com_lances` entrou nas colunas do `MinutasSubscriber`; tarefas e conformidade revisam) e registra **quem escolheu** no histórico da fase interna (`logs_fase_interna`, `DOCUMENTO_EDITADO`, `dados_antes/dados_depois.dispensa_com_lances`, autor do JWT). O `PUT /licitacoes/:id` genérico ignora o campo (não há atalho que pule a fase).
- **Padrão sugerido:** `configuracoes_fase_interna.dispensa_com_lances` só vale enquanto o agente não escolheu (NULL na fase interna — nenhum caminho de criação precisou mudar). Rótulo na tela: **"Padrão sugerido para novas dispensas"**.
- **Congelamento:** o PUBLICAR grava o efetivo (`modoParaCongelar`: a escolha; sem escolha, o padrão; sem configuração, com lances) e anota a origem (`dispensa_modo_origem`: ESCOLHA_DO_PROCESSO | PADRAO_SUGERIDO_DO_ORGAO). Processo publicado antes (NULL) = com lances.
- **Base legal na tela e no aviso:** "com lances — IN SEGES nº 67/2021, quando adotada pelo órgão"; "sem lances — Lei nº 14.133/2021, art. 75, §3º (aviso de 3 dias úteis para propostas adicionais)". Textos do aviso, da minuta (`{{licitacao.forma_disputa}}`), da etapa atual e das mensagens ajustados.
- **Conformidade — DISP-01 (ATENÇÃO, não bloqueia, não exige justificativa):** processo sem lances num órgão cujo regulamento local **adota a IN 67**. Campo novo na configuração: `configuracoes_fase_interna.regulamento_adota_in67` (boolean, default false — sem aviso). A quantidade de regras passou a 26.
- **Quadro:** `modo_disputa` ganhou `fonte` (ESCOLHA | SUGERIDO | PROCESSO | LEGADO), `editavel`, `opcoes`, `padrao_do_orgao` e `escolhido_por` (nome e quando).
- **Testes:** `modo-disputa-dispensa.spec.ts` (escolha sobrepõe o padrão; sem escolha, o sugerido; congelamento), `regras.spec.ts` (DISP-01 com o PA 139/2025) e o e2e `fase-interna-e5` (19): escolha sobrepõe o padrão do órgão e vai para o histórico com o nome; PUT genérico não muda; publicar congela a escolha (origem no ato); depois de publicar 409; outra modalidade 400; DISP-01 aparece como atenção sem bloquear; isolamento do `PUT …/modo-disputa` (outro órgão 403, fornecedor 403, anônimo 401, nada gravado).
- **Colunas novas deste ajuste:** `configuracoes_fase_interna.regulamento_adota_in67`. Nenhuma migração de boot.

**Correção (CI):** a situação PRONTO dos autos vinha do arquivo `.json` gravado antes da notificação "Autos em PDF prontos" — corrida no e2e. Agora a montagem grava o PDF e as folhas nas peças, quem agendou grava a notificação e só então o `.json` que marca PRONTO (`fase-interna-e6` rodado 5 vezes seguidas, todas verdes).

## 13. Entrega 6 — CONCLUÍDA (26/09/2026)

Mesma branch (`claude/fase-interna-e5`), commit `aa245eae`.

**Autos em PDF com folhas numeradas** — evolução do `processo-pdf` que existia (`ProcessoPdfService`, mesma rota), sem criar outro.

### 13.1 O que sai no PDF

- **Capa** (órgão, PA, modalidade e número da dispensa/licitação, objeto, **interessado** — unidade requisitante do DFD, senão a da demanda, senão a unidade compradora —, autuação e o total de folhas), **termo de abertura** e **índice** (peça, folhas, data do documento, origem — gerada, assinada, anexada, documento do processo, termo —, signatários — assinaturas do portal ou os informados no anexo — e "substitui a versão X"); **termo de encerramento** (total de folhas, de 000001 a N, peças fora da montagem e a impressão SHA-256).
- **Peças na ORDEM LÓGICA dos autos** (`licitacoes/autos/autos-regras.ts`, `ORDEM_LOGICA_AUTOS`), nunca pela data: DFD; ETP, riscos; TR (PB/PE); pesquisa (mapa **e a certidão**); informação orçamentária; despacho de autorização; portaria de designação; relatório do agente; justificativa; minuta do aviso e anexos; minuta do contrato; parecer técnico e jurídico; controle interno; **termo de justificativas**; aviso publicado; **registro das publicações**; Diário Oficial; na fase externa: respostas a impugnações/esclarecimentos, ata (a da dispensa é gerada dos registros, depois do julgamento), relatório de julgamento, habilitação, recursos e decisões, parecer da fase externa, adjudicação, homologação, ata de registro de preços e contratos (extrato: não há gerador no sistema — entra quando anexado como documento).
- **Peça anexada** entra com o PDF original (páginas reais); **gerada**, com o PDF gerado (reaproveitado se o conteúdo não mudou) ou o **assinado**. **Só a versão ativa** — as substituídas ficam fora e o índice cita "substitui a versão X". Peça que ainda não é ato (em elaboração, aguardando assinatura) não entra; "não se aplica" vai para o termo de justificativas.
- **Justificativas dos achados** (E4 — `justificativasParaAutos`) e as peças "não se aplica" (com a justificativa e quem registrou) formam o **termo de justificativas**.
- **Carimbo "Fl. 000123"** no canto superior direito **visível** de todas as folhas (respeita `/Rotate` e a CropBox), numeração **contínua** da capa ao encerramento. O antigo rodapé "fl. i/total" saiu.

### 13.2 Folhas: o PDF é a fonte (regra)

As folhas da E1 são dadas na **juntada** (sequência de finalização — assinatura ou anexo), por isso não coincidem com a ordem lógica dos autos, que é montada no fim (como no PA 139/2025). **Decisão:** a folha da juntada é **provisória**; a montagem dos autos é a **fonte**: a cada montagem, as peças ATIVAS recebem as folhas do PDF (`folha_inicial`, `folha_final`, `total_paginas`) — SQL direto, só o que mudou (idempotente), sem mexer em `updated_at` nem disparar as rotinas de gravação de peça. Versões substituídas guardam as folhas da juntada. Peça nova depois da montagem recebe folha provisória (depois da última) até a próxima montagem. **Sem migração de boot**: numerar exige as páginas das peças geradas (que só existem gerando o PDF) — fazê-lo no boot para todos os processos seria caro; a regra acima cobre os antigos na primeira montagem. Evidência antiga de achado/diligência pode citar a folha provisória (registro histórico).

### 13.3 Desempenho, cache e segundo plano

- **Montagem peça a peça** numa **fila única** (um processo por vez): passo 1 materializa cada peça em arquivo (gerada → PDF; termos → arquivo temporário) e conta as páginas; passo 2 copia uma peça por vez para o documento final e carimba. O arquivo final vai para o disco (`licitacoes/<id>/autos/`, pasta privada) e é **servido por stream** (`createReadStream`). Processo de 204 folhas montado em ~3 s no e2e.
- **Cache pela impressão** (SHA-256 do leiaute, dos dados da capa e, por peça, id, versão, status e o hash do arquivo — ou o `md5` do conteúdo da peça gerada): nada mudou → o PDF guardado é entregue na hora; mudou → `DESATUALIZADO` e nova montagem (a antiga é apagada). Gravar as folhas não muda a impressão.
- **Segundo plano:** `POST /licitacoes/:id/processo-pdf/gerar` põe na fila e responde já (`GERANDO`/`PRONTO`); `GET …/processo-pdf/situacao` acompanha; ao terminar, **notificação** do sistema para quem pediu ("Autos em PDF prontos — N folhas", link do processo) — o mecanismo de notificações que já existia. O `GET …/processo-pdf` continua funcionando (serve do cache ou monta pela fila e espera) — é o link do celular da autorização.
- **Botão "Gerar autos (PDF)"** (`BotaoGerarAutos.tsx`) no cabeçalho do processo (painel — mockup Main; substitui o "Baixar processo (PDF)") e na tela da conformidade: pede, acompanha e baixa; se a montagem demorar, avisa que a notificação chegará.

### 13.4 Endpoints

| Método e rota | Quem | Isolamento (e2e) |
|---|---|---|
| `GET /licitacoes/:id/processo-pdf` (alterado: cache + stream; cabeçalhos `X-Autos-Folhas`, `X-Autos-Impressao`) | órgão dono | outro órgão 404; fornecedor 403; anônimo 401 |
| `GET /licitacoes/:id/processo-pdf/situacao` | órgão dono | 404 / 403 / 401 |
| `POST /licitacoes/:id/processo-pdf/gerar` | órgão dono | outro órgão 403; fornecedor 403; anônimo 401 |

Os autos completos são do órgão dono; **não existe versão pública dos autos** (nada foi exposto — sigilo do orçamento e propostas continuam só nas telas próprias). Nenhuma entidade ou coluna nova; nenhuma migração de boot.

### 13.5 Testes

- Unitários: `autos-regras.spec.ts` — ordem lógica (caso PA 139/2025: ETP de 14/11 depois do DFD de 10/12), desconhecido antes do encerramento, ordem dentro da mesma chave; **numeração contínua com anexadas de várias páginas**; páginas do índice; carimbo de 6 dígitos; posição com rotação 0/90/180/270 e CropBox deslocada; impressão estável/alterada; texto seguro para as fontes padrão; data por extenso em Brasília.
- E2E novo `test/fase-interna-e6.e2e-spec.ts` (9): gerar em segundo plano (NAO_GERADO → GERANDO → PRONTO + notificação); **capa, termo de abertura, índice, encerramento e carimbo contínuo em todas as folhas** (texto de cada página extraído); **ordem lógica** com o ETP mais antigo depois do DFD; **anexada com as páginas reais** (inclusive página girada); peça **gerada** presente; **versão substituída fora** e "substitui a versão 1" no índice; termo de justificativas (MARCA-01 justificado + "não se aplica"); folhas gravadas nas peças (a substituída guarda as suas); **cache** (mesma impressão; peça nova → DESATUALIZADO e nova montagem); depois de publicar: aviso, registro das publicações e a página do Diário Oficial; **204 folhas**; isolamento.
- E2E afetados (arquivo a arquivo): ver §13.6.
- Frontend: `npx tsc --noEmit` limpo; `next build` concluído sem erro.

### 13.6 E2E afetados (Entregas 5 e 6)

fase-interna-e1 (26), fase-interna-e2 (19), fase-interna-e3a (14), fase-interna-e3b (26), fase-interna-e4 (17), dispensa-eletronica (45), dispensa-motor-unico (15), divulgacao-pncp (11), cockpit-processo (8), isolamento-dados-licitacao (115), publicacao-prazos (36), pncp-fila (15), transicoes-fase-interna-pncp (12), credenciamento (30), transicoes-licitacao (22), resultado-contrato (17), além das novas fase-interna-e5 (16) e fase-interna-e6 (9) — todos passando. Suíte unitária completa: **101 suítes / 1229 testes**.

### 13.7 Fica para depois

- **Entrega 7**: IA lendo os PDFs anexados (reconhecer a peça, conferir a consistência).
- **Assinatura dos termos** (abertura/encerramento) pelo agente no portal de assinaturas — hoje são termos do sistema, sem assinatura.
- **Volumes** (autos acima de ~200 folhas divididos em volumes com termos próprios) — o PDF é único.
- **Extrato do contrato** gerado pelo sistema (não existe gerador; entra quando anexado).
- Fila **persistente** (a montagem em segundo plano vive na memória do processo Node; se o servidor reiniciar no meio, a próxima solicitação monta de novo — o cache em disco sobrevive).

## 6. Riscos e cuidados

- Processos já criados pelo assistente **não podem perder dados**. A F2 só muda a navegação, e a F1 só acrescenta o caminho do anexo.
- Upload: só PDF, limite de tamanho, SHA-256, acesso só do órgão dono (`AcessoLicitacaoService`) e e2e de isolamento.
- Entidade nova ou coluna de tipo união precisa de `type:` explícito (synchronize em produção). Migração de dados só por boot idempotente, na fila única.
- Nenhuma regra de publicação é afrouxada. Sem itens com unidade e valor, e sem as peças obrigatórias (feitas ou anexadas), não publica.
