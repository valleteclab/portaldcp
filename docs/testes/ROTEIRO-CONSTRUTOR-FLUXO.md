# Roteiro de teste prático — Construtor de fluxo (desenhar, ativar e seguir)

**Para:** o dono (ou o Claude Cowork) testando no navegador, em **https://www.portaldcp.com.br** (homologação), com o **órgão de teste**.
**Objetivo:** desenhar um fluxo de **dispensa** com uma etapa nova **"Secretário de Finanças aprova"** depois do parecer jurídico, **só quando o valor passar de R$ 50 mil**; ativar; abrir **dois processos pelo DFD consolidado** (R$ 60 mil e R$ 20 mil) e ver cada um seguir o seu caminho; testar a **devolução**.

Tempo estimado: 40 minutos. Nomeie o que criar com o prefixo **"TESTE CONSTRUTOR"** e a data.

---

## 0. Preparação

1. Entre como **administrador do órgão** (ou com o login do órgão).
2. **Configurações › Setores:** confirme que existe o setor **Finanças** (crie se não existir) e que há um usuário lotado nele (ex.: "Marta — Finanças"). Esse usuário será quem aprova.
3. **Configurações › Fase interna e tarefas:** anote o **modo** (Simples ou Por setor).
   - **Por setor:** a tarefa "Secretário de Finanças aprova" vai para o setor Finanças; entre com o usuário de Finanças para aprovar.
   - **Simples:** tudo fica com quem conduz o processo; o próprio agente vê **Aprovar / Devolver**.
4. Nessa mesma tela, clique em **Desenhar o fluxo**. **Esperado:** abre `/orgao/configuracoes/fluxo`, aba **Dispensa**, com o desenho da versão ativa e a frase "Você está vendo a versão ativa N."

## 1. Desenhar

1. Na aba **Dispensa**, localize as caixas **Parecer jurídico** e **Autorização** (role o desenho, se precisar — só o desenho rola, a página não). Várias setas chegam à Autorização (pesquisa, reserva, parecer…): é o modelo padrão.
2. Para abrir espaço, arraste a **Autorização** e a **Publicação** um pouco para a direita.
   **Esperado:** o topo passa a "Você está editando o rascunho; a versão ativa é a N." e, em instantes, "Rascunho salvo às HH:MM".
   - Opcional: clique na seta direta **Parecer jurídico → Autorização** (ela fica azul) e aperte **Delete**, para o caminho ficar só pela pergunta.
3. Arraste **Condição** da paleta para o desenho, à direita do parecer. No painel:
   - **Pergunta:** "Valor acima de R$ 50 mil?";
   - **Quem responde:** "O sistema, pelo valor total estimado";
   - **Condição:** "acima de"; **Valor (R$):** `50.000,00`.
   **Esperado:** a caixa mostra "valor estimado acima de R$ 50.000,00".
4. Arraste **Aprovação** para o desenho, acima e à direita da condição. No painel:
   - **Nome:** "Secretário de Finanças aprova";
   - **Quem aprova:** setor **Finanças**;
   - **Prazo:** 2 dias úteis;
   - **Peças que produz:** "Nenhuma — conclui com um despacho".
5. **Ligue** puxando a bolinha azul de uma caixa até a outra:
   - Parecer jurídico → Condição (seta normal);
   - Condição → Secretário de Finanças aprova (**Esperado:** a seta nasce "sim");
   - Condição → Autorização (**Esperado:** a seta nasce "não");
   - Secretário de Finanças aprova → Autorização (normal);
   - Secretário de Finanças aprova → **Pesquisa de preços** (**Esperado:** como a pesquisa vem antes, a seta nasce **"devolve"**, tracejada e laranja).
6. **Esperado na Conferência:** "Fluxo válido e conforme a lei", todos os requisitos com ✓ (inclusive "Parecer jurídico antes de Autorização", art. 53) e nenhum erro. Se aparecer erro, clique nele: a caixa com problema fica selecionada.
7. Recarregue a página (F5). **Esperado:** o desenho continua como você deixou (o rascunho foi salvo) e a versão ativa ainda é a anterior.

## 2. Testar antes de ativar

1. Clique em **Testar**. Em **Valor estimado**, deixe `60.000,00`; clique em **Recomeçar o teste**.
2. Vá clicando **Concluir** nos cartões ("Está com …"). **Esperado:** as caixas com alguém agora ficam azuis e as feitas, verdes; "O que aconteceu" registra cada passo.
3. Ao passar do parecer, **Esperado:** a condição é respondida sozinha ("sim") e aparece o cartão **"Secretário de Finanças aprova — Está com Finanças — Aprovar / Devolver"**.
4. Clique **Devolver**. **Esperado:** volta para **Pesquisa de preços**; ao concluir a pesquisa, o processo **volta direto** para "Secretário de Finanças aprova" (sem refazer reserva, minutas e parecer). Clique **Aprovar** e siga até **"Chegou ao fim do fluxo."**
5. Troque o valor para `20.000,00` e **Recomeçar o teste**. **Esperado:** depois do parecer, a condição responde "não" e o processo vai direto para a **Autorização** — Finanças não aparece.
6. Volte para **Desenhar**.

## 3. Ativar

1. Clique **Ativar**. **Esperado:** abre a janela "Ativar a versão N+1?" com a conferência (tudo ✓) e o aviso de que os processos em andamento continuam no fluxo em que começaram.
2. Confirme. **Esperado:** "Versão N+1 ativa — processos novos seguem este fluxo; os em andamento continuam no fluxo em que começaram." e o topo volta a "Você está vendo a versão ativa N+1."
3. Clique **Versões**. **Esperado:** a versão nova aparece como **ativa**, com o seu nome e a hora.

## 4. Dois processos pelo DFD consolidado

1. **Demandas:** crie duas demandas (setor requisitante), "TESTE CONSTRUTOR 60 mil" com um item de **R$ 60.000,00** no total e "TESTE CONSTRUTOR 20 mil" com um item de **R$ 20.000,00**. Envie e aprove as duas (Central de Aprovações › Demandas e DFD).
2. **Consolidação** (`/orgao/demandas/consolidacao`): monte **um DFD consolidado para cada demanda** e **abra o processo** de cada um como **Dispensa**.
   **Esperado:** os dois processos abrem com o quadro **Fluxo da fase interna** mostrando "fluxo: … (versão N+1)".
3. Nos dois processos, faça as etapas até o **parecer jurídico** concluir (peças feitas no sistema, anexadas ou "não se aplica" onde a lei deixa).
   - Se a pesquisa de preços mudar o valor estimado, confira que o de 60 mil continua acima de R$ 50 mil e o de 20 mil abaixo.

## 5. Cada um no seu caminho

**Processo de R$ 60 mil:**
1. Depois do parecer, **Esperado:** a caixa "Valor acima de R$ 50 mil?" aparece concluída com **"Sim — respondida pelo sistema: valor total estimado > R$ 50.000,00 (no processo: 60.000,00)"** e **"Secretário de Finanças aprova"** fica disponível.
2. Entre com o usuário de **Finanças** (modo por setor) ou continue como agente (modo simples). **Esperado:** botões **Aprovar** e **Devolver**.
3. **Devolver:** clique, escreva o motivo "Refazer a pesquisa com três cotações" e confirme.
   **Esperado:** a **Pesquisa de preços** volta para correção com o aviso "Devolvida por 'Secretário de Finanças aprova' … Corrigida, volta direto para …"; o despacho da devolução aparece nos autos; a autorização continua aguardando.
   - Tente devolver **sem motivo** (ou com menos de 10 letras). **Esperado:** o sistema não deixa.
   - Com um usuário que **não** é de Finanças nem conduz o processo, tente devolver. **Esperado:** recusa com a mensagem "Só quem conduz o processo ou o responsável pela aprovação devolve."
4. Corrija a pesquisa (altere ou anexe de novo a peça, se precisar) e clique **Concluir a revisão** na caixa da Pesquisa de preços. **Esperado:** o processo volta **direto** para "Secretário de Finanças aprova" (reserva, minutas e parecer **não** ficam "a revisar").
5. **Aprovar:** escreva um despacho curto ("De acordo. Aprovo o prosseguimento.") e confirme. **Esperado:** a etapa conclui, o despacho vira folha nos autos e a **Autorização** fica disponível.

**Processo de R$ 20 mil:**
1. Depois do parecer, **Esperado:** a condição aparece com **"Não — respondida pelo sistema …"**, a caixa **"Secretário de Finanças aprova" não aparece** e a **Autorização** fica disponível direto.

## 6. Pergunta manual (opcional)

1. Volte a **Desenhar o fluxo**, selecione a condição e troque **Quem responde** para **"Manual — quem conduz responde"**. Ative de novo.
2. Abra um terceiro processo. Depois do parecer, **Esperado:** o quadro mostra **"Pergunta: Valor acima de R$ 50 mil? — Sim / Não"** para quem conduz. Responda "Sim". **Esperado:** "Sim — respondida por <seu nome>" e Finanças fica disponível.
3. Os dois processos do item 4 **não mudam** (continuam na versão em que começaram).

## 7. Quem não é administrador

1. Entre com um usuário comum do órgão e abra **Configurações › Fluxo**.
   **Esperado:** aviso "Somente o administrador do órgão altera e ativa o fluxo. Você pode ver o desenho e testar."; sem paleta ativa, sem **Salvar rascunho** e sem **Ativar**; o **Testar** funciona.

## 8. Relatório

Para cada passo: **OK**, **Falhou** (print, URL, usuário e a mensagem exata) ou **Não verificado** (por quê). Ao final, volte o fluxo de Dispensa ao que era: **Começar de › Modelo padrão do sistema** e **Ativar** (ou carregue a versão anterior em **Versões** e ative).
