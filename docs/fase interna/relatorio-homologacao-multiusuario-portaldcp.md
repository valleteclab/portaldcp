# Relatório — Homologação da fase interna com vários usuários (Portal DCP)

Ambiente: https://www.portaldcp.com.br (homologação) · Órgão de teste (CNPJ 62.203.670/0001-62) · Data: 27/09/2026 · Executor: Claude (Cowork), com o dono fazendo cada login.

Usuários de teste (um papel cada): Rita (Requisitante/Comunicação), Carlos (Compras), Diana (Planejamento/Diretoria), Caio (Contabilidade), Júlia (Jurídico), Paulo (Autoridade/Presidência), Ana (Agente de contratação/Licitações).

## 1. Resumo

1. O fluxo completo funcionou de ponta a ponta entre 7 usuários: 3 demandas → aprovação (Paulo) → DFD consolidado nº 7/2026 (Diana) → processo 2026/00033 → Compras → Contabilidade → Presidência → Licitações → Jurídico (com diligência) → publicação no PNCP treina (62203670000162-1-000009/2026).
2. A tramitação está sólida: "Está com", Recebi/Enviar/Devolver, despacho como folha, prazo em dias úteis, "Aconteceu em" com trava de data futura e anterior. Recebi e Enviar recusam, com mensagem clara, quem não está com o processo.
3. **Falha principal:** o isolamento vale para a tramitação, mas não para as peças. Quem não está com o processo consegue anexar, gerar e registrar peças:
   - Caio anexou o TR de Compras;
   - Ana gerou as minutas com o processo na Presidência;
   - Carlos registrou pesquisa com a demanda não aprovada.
4. **Falhas sérias:**
   - o TR enviado para assinatura não tem onde ser assinado;
   - a publicação é liberada logo depois da autorização, antes das minutas e do parecer;
   - os autos não intercalam os despachos na ordem cronológica e não trazem o despacho nº 1;
   - o fluxo não sugere o Jurídico;
   - a LIM-01 soma todos os itens sem CATMAT/CATSER num único "ramo".
5. **Não verificado:**
   - Painel TV (o testador não achou o link);
   - seção 11 até a reserva;
   - seção 3.4, a 2ª aprovação do DFD.

## 2. Resultado por passo

### 1 · Preparação
- **Quem / resultado:** Admin (teste05) · OK, com ajustes.
- **O que aconteceu:**
  - 7 setores e papéis já existiam.
  - Tirei os papéis de fase interna do TESTE, porque geravam aviso de segregação.
  - Modo "Por setor"; ETP/TR com papel Compras; signatário da autorização = Paulo; aprovador da demanda = Papel Autoridade.
  - O modelo salvo ficou na versão 3.
  - No modelo, a Autorização (passo 4) vem ANTES de Minutas/Parecer, e a Pesquisa não depende do TR.
  - Cidade do órgão: "A definir".

### 3.1 · Demandas
- **Quem / resultado:** Rita, Carlos, Caio · OK, com falhas.
- **O que aconteceu:**
  - 3 demandas enviadas: aparece "Demanda — [setor]" e o status Enviada.
- **Falhas:**
  - o modal "Nova demanda" é lento;
  - setor e responsável não vêm preenchidos;
  - "Para quando" aparece como "undefined/undefined/undefined" na tela da demanda (mas salvou);
  - o trimestre vem 1º por padrão;
  - o painel da Rita mostra valores do órgão inteiro e as demandas de outros setores.

### 3.2 · Aprovação
- **Quem / resultado:** Paulo · OK, com falhas.
- **O que aconteceu:**
  - A Central abre na aba de contratos; é preciso clicar em "Demandas e DFD".
  - Devolvi a demanda do Carlos com motivo. Ele viu o aviso vermelho e "Voltar para rascunho", mas o rascunho **não tem campo de data** para corrigir.
  - Aprovei as 3.
  - "Aprovada por" não aparece na demanda, só no DFD.
  - Caio e Júlia não veem nada pendente (✔).

### 3.3 · DFD consolidado
- **Quem / resultado:** Diana · OK, com falhas.
- **O que aconteceu:**
  - O DFD nº 7/2026 somou 5 UN (Compras 2 + Comunicação 3) e alertou para objeto parecido.
  - Ajustei a quantidade para 4, com justificativa; o PDF ficou ok.
  - A página tem rolagem horizontal.
  - Ao abrir o processo, **2026/00033** nasceu "Está com: COMUNICAÇÃO".

### 3.3 · Travas
- **Quem / resultado:** Rita · OK.
- **O que aconteceu:**
  - A demanda ficou "Em contratação · DFD nº 7/2026", sem edição.
  - Rita vê o DFD consolidado só para leitura.
  - O DFD do processo saiu "Pronta v1", com órgão/CNPJ/nº preenchidos (o placeholder está corrigido).

### 4 · Processo sem demanda
- **Quem / resultado:** Rita · OK, com falhas.
- **O que aconteceu:**
  - Assistente → **202609.91299** (papel A4, R$ 300).
  - Aparece "Aguardando aprovação da demanda por Papel Autoridade" (✔).
- **Falhas:**
  - dois números (202609.91299 × 2026/00033);
  - "Área demandante" é texto livre, não uma lista de setores;
  - **LIM-01 falso**: 119,1%, porque todas as compras sem código somam num ramo único;
  - o DFD não vem pré-preenchido, e a tela recarregou apagando o que estava marcado.

### 4 · Isolamento
- **Quem / resultado:** Carlos · **FALHA**.
- **O que aconteceu:**
  - Com a demanda não aprovada e o processo "Está com: COMUNICAÇÃO", Carlos recebeu a tarefa da LIM-01.
  - Ele **conseguiu registrar consulta na Pesquisa** (inciso I).

### 4 · Aprovação
- **Quem / resultado:** Paulo · OK, com falha.
- **O que aconteceu:**
  - Antes do DFD, o processo não aparecia na Central.
  - Na tela do processo, "Aprovar a demanda" deixava abrir e só no fim recusava: "Formalize a demanda (DFD) antes de aprovar".
  - Depois do DFD, apareceu na Central; aprovei → "Demanda aprovada por Paulo Presidente em 27/09/2026, 17:06" (✔).

### 5 · Tramitação Rita → Compras
- **Quem / resultado:** Rita, Carlos · OK, com falhas.
- **O que aconteceu:**
  - Enviar para COMPRAS, com despacho e prazo de 30 d.u. → "Está com: COMPRAS · prazo 10/11/2026".
  - A barra só atualiza com F5.
  - Rita tentou "Recebi" → 403 "Só quem está com o processo (COMPRAS)…" (✔).
  - Carlos: Recebi (✔); ETP, TR e Pesquisa aparecem "lado a lado, Pode começar" (✔).
  - **O 1º clique em Recebi grava, mas a tela não atualiza.** O 2º dá "Esta tramitação não está pendente de recebimento".

### 5.3 · ETP
- **Quem / resultado:** Carlos · OK.
- **O que aconteceu:** ETP e Análise de riscos em "Não se aplica"; a justificativa é obrigatória (✔).

### 5.4 · TR
- **Quem / resultado:** Carlos · **FALHA**.
- **O que aconteceu:**
  - "Gerar TR (PDF)" completou as seções pelo ETP e pela reserva, mas deixou d, e, g e j vazias e ficou "Rascunho".
  - "Enviar para assinatura" (signatário Carlos) → "Aguardando assinaturas", mas **não existe lugar para assinar**: não há botão, tarefa nem notificação.
  - O PDF do TR sai com as seções 2+ espremidas numa coluna estreita.

### 5.5 · Pesquisa
- **Quem / resultado:** Carlos · OK.
- **O que aconteceu:**
  - 4 fontes "sem retorno" + 3 cotações; mediana; "Emitir mapa e certidão" → Pronta (✔).
  - Limite: 9,1% de R$ 65.492,11.
  - A justificativa do método só "pegou" depois de sair do campo.

### 6 · Voltar
- **Quem / resultado:** Carlos · Não verificado.
- **O que aconteceu:**
  - Não há "Voltar etapa" com motivo.
  - "Desfazer não se aplica" do ETP reabre **sem pedir motivo** e sem marcar os dependentes "a revisar".

### 7 · Aconteceu em
- **Quem / resultado:** Carlos · OK.
- **O que aconteceu:**
  - Data futura é recusada, e data anterior à movimentação anterior também (✔).
  - Hoje → "lançado depois" (fl. 2).

### 5.6 · Reserva
- **Quem / resultado:** Caio · OK.
- **O que aconteceu:**
  - Recebi (o 1º clique não mostra efeito).
  - Emitir e reservar → Pronta (✔).
  - O fluxo sugeriu devolver a COMPRAS (TR pendente); enviado (fl. 3).

### 8 · Isolamento (tramitação)
- **Quem / resultado:** Carlos, Caio, Júlia · OK.
- **O que aconteceu:** recebimentos e envios fora da vez foram recusados, com mensagem (✔).

### 8 · Isolamento (peças)
- **Quem / resultado:** Caio · **FALHA**.
- **O que aconteceu:**
  - Com o processo em COMPRAS, Caio (Contabilidade) viu "Anexar feito fora: Termo de Referência".
  - Anexou um PDF e **foi aceito**: "TR: PDF anexado (versão 2, fls. 4–4)".
  - A tela do TR **não mostra que foi o Caio**.

### 5.7 · Autorização
- **Quem / resultado:** Paulo · OK, com falha.
- **O que aconteceu:**
  - Autorizar e assinar → processo autorizado (✔).
- **Falhas:**
  - Logo depois, **"Gerar aviso e divulgar" ficou liberado**, sem minutas nem parecer.
  - O fluxo **não sugeriu o destino seguinte**.
  - Ao escolher o setor, o texto automático do despacho se misturou com o que eu tinha digitado.

### 5.8 · Devolver
- **Quem / resultado:** Ana · OK.
- **O que aconteceu:** sem motivo o botão fica desabilitado; com motivo, devolve (✔).

### 8 · Isolamento (peças)
- **Quem / resultado:** Ana · **FALHA**.
- **O que aconteceu:** com o processo devolvido à Presidência, Ana **gerou o relatório, a minuta do aviso e a minuta do contrato**.

### 5.8 · Agente
- **Quem / resultado:** Paulo · OK.
- **O que aconteceu:**
  - Editar › Responsáveis › Agente = Ana → salvo (o 500 não se repetiu).
  - Não havia portaria de designação cadastrada; anexei a portaria (fl. 10).
  - O fluxo sugeriu "LICITAÇÕES · Ana" (✔).

### 5.9 · Envio ao Jurídico
- **Quem / resultado:** Ana · OK, com falha.
- **O que aconteceu:** o fluxo **não sugeriu o JURÍDICO** (7b); escolhi à mão (fl. 12).

### 5.10 · Diligência
- **Quem / resultado:** Júlia · OK.
- **O que aconteceu:**
  - "Devolver com diligência" sobre o TR → "Há 1 diligência aberta…" e Assinar parecer desabilitado (✔).
  - A coluna "Roteiro de análise" fica espremida.

### 5.10 · Sanar
- **Quem / resultado:** Carlos · OK, com falhas.
- **O que aconteceu:**
  - A tarefa "Diligência do parecer — TR" leva ao TR, **sem banner nem botão Sanar**. O Sanar só existe na tela do Parecer.
  - **As seções do TR v1 sumiram depois do anexo v2.**
  - Anexei a v4 → Sanar reconheceu a versão nova → "Diligência sanada" (✔).

### 5.10 · Parecer
- **Quem / resultado:** Júlia · OK.
- **O que aconteceu:**
  - Parecer assinado, favorável (fls. 14–16).
  - O fluxo sugeriu "LICITAÇÕES · Ana" (✔).
  - Alerta art. 92: cláusulas da minuta do contrato vazias.

### 9 · Publicação
- **Quem / resultado:** Ana · OK.
- **O que aconteceu:**
  - Publicado 62203670000162-1-000009/2026 (✔).
  - A barra "Está com" some depois de publicar.

### 9 · Autos
- **Quem / resultado:** Ana · PARCIAL.
- **O que aconteceu:**
  - 31 folhas contínuas (✔); a anotação de lançamento posterior está presente (✔).
- **Falhas:**
  - **os despachos não ficam na ordem cronológica** (peças nas fls. 4–11, despachos a partir da fl. 12);
  - **o despacho nº 1 não aparece**;
  - as folhas dos autos são diferentes das da tela (TR fl. 13 → 5; parecer 14–16 → 24–26);
  - cidade "A definir/SP";
  - várias peças com data "—" no índice;
  - o status do PDF aparece "DESATUALIZADO" ao gerar.

### 10 · Painel TV
- **Quem / resultado:** Ana · Não verificado (não achei o link).

### 11 · Modo Simples
- **Quem / resultado:** Admin, Ana · PARCIAL.
- **O que aconteceu:**
  - A troca gravou, mas o botão ficou em "Salvando…" por mais de 30 s.
  - Processo 202609.06110: as 9 etapas com a Ana (✔).
  - As tarefas da Ana subiram para 24–26, com processos antigos.
  - Modo restaurado para "Por setor".

## 3. Erros

- **E1 — TR sem lugar para assinar.** Depois de "Enviar para assinatura" (signatário Carlos), o TR fica "Aguardando assinaturas" e não aparece botão, tarefa nem notificação. A conformidade acusa "ASS-01 Termo de referência: assinaturas faltantes (bloqueio)".
- **E2 — Peças editáveis fora da vez.**
  - Caio anexou o TR de Compras com o processo em Compras.
  - Ana gerou as 3 minutas com o processo na Presidência.
  - Carlos registrou consulta na Pesquisa com a demanda não aprovada e o processo com COMUNICAÇÃO.
- **E3 — Publicação liberada cedo.** Logo depois da autorização, "Gerar aviso e divulgar" ficou habilitado, sem minutas nem parecer.
- **E4 — Autos fora de ordem.** Os despachos vêm depois das peças; o despacho nº 1 não aparece; a numeração das folhas nos autos é diferente da tela.
- **E5 — TR perdeu conteúdo.** As seções da v1 somem depois que uma nova versão é anexada (o progresso caiu de 60% para 10–20%).
- **E6 — LIM-01 indevido.** "Limite da dispensa ultrapassado no ramo (fracionamento) (bloqueio)" para R$ 300 em papel: "R$ 78.030,00 no ramo (bens, sem código CATMAT/CATSER): R$ 300,00 deste processo + R$ 77.730,00 de 11 outra(s) dispensa(s)".
- **E7 — Recebi não atualiza a tela.** O 1º clique grava; o 2º devolve "Esta tramitação não está pendente de recebimento". A barra "Está com" também não atualiza depois do Enviar (só com F5).
- **E8 — Data da demanda.** O campo "Para quando" aparece como "undefined/undefined/undefined".
- **E9 — Salvar configuração.** Fica em "Salvando…" indefinidamente, embora grave.

## 4. Confusões

- **Sugestão de destino:** o fluxo não sugere o destino depois da Autorização, nem o Jurídico (7b).
- **Diligência:** vira tarefa, mas "Abrir peça" leva ao TR, e o Sanar fica só na tela do Parecer.
- **Aprovar a demanda:** fica habilitado antes do DFD e só recusa no fim; a Central não mostra o que falta.
- **Numeração:** dois formatos de número de processo no mesmo órgão (2026/00033 × 202609.xxxxx).
- **Área demandante:** no assistente é texto livre.
- **Demanda devolvida:** o rascunho não tem o campo de data que a devolução pediu.
- **Painel da Requisitante:** mostra valores do órgão inteiro.
- **Despacho no "Enviar":** ao escolher o setor, o texto automático se mistura ao que foi digitado.
- **Versões anexadas:** a tela do TR não diz quem anexou cada versão.
- **Layout:**
  - coluna "Roteiro de análise" espremida no Parecer;
  - PDF do TR com as seções numa coluna estreita;
  - página do DFD consolidado com rolagem horizontal.
- **Autoridade no painel do processo:** aparece "LOAME AZEVEDO DA SILVA / PREFEITO", embora o signatário configurado seja Paulo.
- **Mais ações:** Compras vê "Excluir processo…", "Revogar" e "Anular".

## 5. Isolamento — lista

| Tentativa | Quem | Situação | Resultado |
|---|---|---|---|
| Recebi | Rita | processo com COMPRAS | recusado ✔ |
| Enviar para | Diana | processo com COMUNICAÇÃO | bloqueado ✔ |
| Recebi | Carlos | processo com CONTABILIDADE | recusado ✔ |
| Enviar para | Caio | processo com COMPRAS | bloqueado ✔ |
| Recebi | Júlia | processo com LICITAÇÕES | recusado ✔ |
| Central | Caio, Júlia | — | nada pendente ✔ |
| DFD consolidado | Rita | — | só leitura ✔ |
| Anexar TR | Caio | processo com COMPRAS | **aceito ✘** |
| Gerar minutas | Ana | processo com PRESIDÊNCIA | **aceito ✘** |
| Registrar pesquisa | Carlos | demanda não aprovada | **aceito ✘** |
| Tarefa LIM-01 | Carlos | demanda não aprovada | **criada ✘** |

## 6. Dados criados

- **Demandas:** Rita, Carlos, Caio.
- **DFD consolidado:** nº 7/2026.
- **Processo 2026/00033:** publicado no PNCP treina (62203670000162-1-000009/2026).
- **Processo 202609.91299:** sem demanda.
- **Processo 202609.06110:** modo simples.
- **Configurações:**
  - modo **Por setor**;
  - modelo "Câmara — Portaria 089" v3;
  - aprovador da demanda = Papel Autoridade;
  - signatário da autorização = Paulo.
