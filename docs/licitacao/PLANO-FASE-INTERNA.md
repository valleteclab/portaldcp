# Plano — Fase interna simples, guiada e "feita aqui ou anexada"

> 26/09/2026 · Referência real: Câmara Municipal de Luís Eduardo Magalhães — autos da Dispensa 003/2025 (PA 005/2025) e das Inexigibilidades 004/2025 (PA 033/2025) e 008/2025 (PA 043/2025), e o regulamento próprio da Lei 14.133 (**Portaria 089/2024**).
> Status: **proposta — aguardando aprovação**. Nada foi implementado.

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

## 6. Riscos e cuidados

- Processos já criados pelo assistente **não podem perder dados**. A F2 só muda a navegação, e a F1 só acrescenta o caminho do anexo.
- Upload: só PDF, limite de tamanho, SHA-256, acesso só do órgão dono (`AcessoLicitacaoService`) e e2e de isolamento.
- Entidade nova ou coluna de tipo união precisa de `type:` explícito (synchronize em produção). Migração de dados só por boot idempotente, na fila única.
- Nenhuma regra de publicação é afrouxada. Sem itens com unidade e valor, e sem as peças obrigatórias (feitas ou anexadas), não publica.
