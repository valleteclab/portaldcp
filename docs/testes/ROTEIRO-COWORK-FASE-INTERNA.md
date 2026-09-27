# Roteiro de homologação — Nova fase interna do Portal DCP

**Para:** o Claude (Cowork) que vai testar o sistema pelo navegador.
**Objetivo:** percorrer uma **dispensa eletrônica** do início (DFD) até a publicação e os autos em PDF, conferindo cada etapa e registrando o que funcionou, o que falhou e o que ficou confuso.

> **Complemento:** este roteiro usa **um usuário só, com todos os papéis** — bom para conferir cada peça e cada tela. Para testar a **tramitação entre pessoas** (quem recebe, "Está com…", avançar/voltar, isolamento entre setores), use `docs/testes/ROTEIRO-COWORK-FLUXO-MULTIUSUARIO.md` (6 usuários, um papel cada).
>
> **O que mudou desde a última rodada (27/09/2026):**
> - A **aprovação da demanda** agora é o início do processo de compra: enquanto a demanda não for aprovada pela pessoa designada, a Demanda/DFD fica "aguardando aprovação" e as etapas seguintes (ETP, TR, Pesquisa) aparecem como "Aguardando: Demanda" — não abrem antes disso. Veja o passo 2 atualizado, abaixo.
> - "Portão A/B/C" na tela virou **"Trava da lei"** (com "?" explicando o que ela segura). O texto mudou; o código e as regras continuam os mesmos.
> - Uma peça feita no sistema (DFD, TR, pesquisa etc.) só conta como **pronta** depois de **gerada/emitida** ou **anexada** — salvar o rascunho sozinho não conclui mais a etapa.
> - O quadro **"Fluxo da fase interna"** ganhou uma **visão em colunas** (avançar/voltar, etapas independentes lado a lado, "a revisar" quando uma etapa anterior volta) e, na fase interna, o topo da tela do processo mostra **"Está com: …"** — a mesma tramitação testada no roteiro multiusuário.

---

## 0. Regras (leia antes de começar)

1. **Ambiente:** use só **https://www.portaldcp.com.br** (homologação). Não acesse outro endereço do Portal DCP.
2. **Dados:** use só o **órgão de teste** e os usuários que o dono informar no chat. **Não altere nada de outro órgão**, não exclua processos que você não criou, não mexa em contratos, medições ou almoxarifado.
3. **Senhas:** o dono passa no chat. Não escreva senhas no relatório.
4. **Não corrija nada no código nem no banco.** Seu papel é testar e relatar.
5. **Em caso de erro:** tire um print, anote a URL, o que você clicou e a mensagem exata, e **continue o roteiro** a partir do próximo passo possível. Não fique repetindo o mesmo clique.
6. **Não invente resultado.** Se não conseguiu verificar algo, escreva "não verificado" e o motivo.
7. Nomeie tudo o que criar com o prefixo **"TESTE COWORK"** e a data, para ser fácil de achar e limpar depois.

---

## 1. Preparação (Configurações do órgão)

Entre com o **administrador do órgão de teste**.

1. **Configurações › Fase interna e tarefas** (`/orgao/configuracoes/fase-interna`)
   - Modo: **Simples**.
   - Controle interno: **desligado** (primeira rodada).
   - Prazos: clique em **"Modelo Portaria 089"** e salve. **Esperado:** um quadro diz o que foi aplicado (DFD, ETP e TR sem prazo; Pesquisa 30; Reserva 3; Autorização 3; Minutas 5; Parecer 5; Controle interno 3; Publicação 5 dias úteis) e o que mudou — ou "nada mudou", se a configuração já seguia o modelo (é o padrão).
   - Padrão sugerido para novas dispensas: **com lances**.
   - Signatários da autorização: cadastre **um** usuário (o próprio administrador ou o usuário "autoridade" informado), com o papel **Autoridade**.
   - Papéis dos usuários: dê ao usuário de teste os papéis **Agente de contratação, Jurídico, Contabilidade e Autoridade** (um usuário pode ter vários).
   - **Esperado:** salva sem erro, com a confirmação na barra do fim da tela ("Configuração salva às HH:MM") e, nos papéis, "Salvo às HH:MM" na linha do usuário; ao recarregar, os valores continuam.
2. **Configurações › Orçamento** (`/orgao/configuracoes/orcamento`)
   - Cadastre **duas leis**, cada uma com o seu **tipo** (botão "Nova lei" ou os atalhos "Cadastrar LDO/LOA 2026" do quadro "O que a reserva orçamentária usa"):
     - **LDO 2026** (tipo LDO — ex.: "Lei nº 0001/2025"): **obrigatória na Reserva** (campo "Lei da LDO *");
     - **LOA 2026** (tipo LOA — ex.: "Lei nº 0000/2025"): citada na informação orçamentária e no despacho.
   - Cadastre **1 dotação** de 2026 (unidade orçamentária, programa, projeto/atividade, elemento 3.3.90.40, fonte 500, com saldo).
   - **Esperado:** aparecem nas listas, e o quadro "O que a reserva orçamentária usa" mostra LDO, LOA e dotação com ✔.

---

## 2. Criar a dispensa

1. **Fase interna › Novo processo** (assistente) ou a partir de uma demanda.
   - Objeto: "TESTE COWORK — licença de software de gestão de conteúdo (12 meses) + implantação".
   - Modalidade: **Dispensa**. Fundamento: **art. 75, II** (campo "Fundamento legal" nos dados básicos — já vem sugerido pela natureza; confira).
   - Itens: 2 itens: "Implantação e treinamento" (1 serviço) e "Licença mensal do software" (12 meses), com código **CATSER**, unidade e quantidade.
   - **Esperado:** ao clicar em **"Salvar e abrir o processo"** (Itens), o sistema abre a **tela do processo** (`/orgao/processos/[id]`) com o quadro **"Fluxo da fase interna"**, com as etapas e o responsável. O mesmo vale para "Criar a partir de demanda" e para a entrada "já foi feita fora".
   - **Aprovação da demanda (novo):** se o processo nasceu de uma demanda que ainda não está aprovada (ou se o modelo do órgão exige aprovação e você não conduz sozinho no modo simples), o quadro mostra o bloco **"Aguardando aprovação da demanda por [aprovador]"**, e as etapas seguintes (ETP, TR, Pesquisa) aparecem como **"Aguardando: Demanda"**, sem abrir. Aprove clicando em **"Aprovar a demanda"** (se o seu usuário for o aprovador designado) antes de seguir para o passo 3. Se o processo nasceu de demanda já aprovada, ou você conduz no modo simples, a aprovação já conta sozinha — confira a linha verde "Demanda aprovada".
2. Abra **Minhas tarefas** (`/orgao/fase-interna`).
   - **Esperado:** aparecem as tarefas desse processo, com prazo (inclusive a tarefa **"Aprovar a demanda"**, se aplicável). O botão da tarefa leva à tela da etapa.

---

## 3. Percorrer as etapas (dentro do processo)

Para **cada etapa**, confira três coisas: (a) a tela abre pelo quadro do processo e pela tarefa; (b) "← Voltar ao processo" funciona; (c) ao concluir a peça, a **tarefa some de "Para mim"** e aparece em "Concluídas".

| # | Etapa (rota) | O que fazer | O que deve acontecer |
|---|---|---|---|
| 1 | **DFD** (`…/fase-interna/dfd`) | Preencha necessidade, responsável, item do PCA **ou** justificativa de ausência. **Gerar DFD**. | PDF do DFD gerado; etapa concluída **só depois de gerado/emitido** (o rascunho salvo sozinho, sem gerar, não conclui). |
| 2 | **ETP** (`…/etp`) | Na dispensa, teste **"Não se aplica"** com justificativa. *(Opcional: gere uma seção com o assistente e escreva "similar ao ARION" para ver o alerta de marca.)* | "Não se aplica" aceito; alerta de marca aparece se testado. |
| 3 | **TR** (`…/tr`) | Gere o TR. Confira que o **fundamento** aparece como art. 75, II. | TR gerado, com os itens. |
| 4 | **Pesquisa** (`…/pesquisa`) | Marque os parâmetros do art. 23 (um deles "consultado sem retorno"). Lance **3 cotações** com CNPJ, validade e valores. Escolha o método (menor/média/mediana) e escreva a justificativa. **Emitir mapa e certidão**. | Cálculos corretos; **consumo do limite** aparece (ex.: "X% de R$ 65.492,11 — Dec. 12.807/2025", se o exercício for 2026); PDFs do mapa e da certidão. |
| 5 | **Reserva** (`…/reserva`) | Escolha a dotação; crie **2 linhas** (2026 e 2027). **Emitir**. | Informação orçamentária gerada. |
| 6 | **Autorização** (`…/autorizacao`) | Confira o resumo e o **checklist do art. 72**. **Gerar**, **Enviar para assinatura** e assine com o signatário. *(Opcional: abra no celular/tela estreita.)* | Só fica autorizada depois da assinatura; sem o art. 72 completo, o envio é **recusado** com mensagem clara. |
| 7 | **Minutas** (`…/minutas`) | Gere o relatório do agente, a minuta do aviso e a minuta do contrato. Confira que citam **o número deste processo**. Depois mude o fundamento em **Editar processo › Classificação** e volte. | Minutas **regeradas** com o novo fundamento (volte o fundamento para art. 75, II depois). |
| 8 | **Parecer** (`…/parecer`) | Abra **uma diligência** numa peça (ex.: TR). Corrija a peça (gere de novo) e **sane**. Depois **emita o parecer favorável** e assine. | A diligência cria tarefa; sanada, volta para o jurídico; o favorável só sai sem diligência aberta. |
| 9 | **Conformidade** (`…/conformidade`) | Clique em **Revisar agora**. Leia os achados. Justifique uma **atenção**. | Bloqueios impedem publicar; "Publicar — resolva N bloqueios" desabilitado enquanto houver bloqueio. |

**Teste do "anexar feito fora"** (faça em pelo menos uma etapa, de preferência a Reserva ou o Parecer): use **"Anexar PDF"** com um PDF qualquer, informe número e data do documento (não futura). **Esperado:** a peça conta como pronta, ganha folha e versão; a tarefa conclui.

---

## 4. Publicação

1. Em **Editar processo › Classificação** (ou no quadro do aviso), escolha **"Sem disputa de lances"** e salve.
   - **Esperado:** aparece "escolhida por [nome] em [data]" e a base legal (art. 75, §3º).
2. Na **Conformidade**, confira o quadro do aviso (datas, **mínimo de 3 dias úteis**, canais) e clique em **Publicar**.
   - **Esperado:** o processo vai para **"Aguardando publicação no PNCP"**; depois da confirmação, para publicado. Se o PNCP recusar, o **banner vermelho** mostra a mensagem da API (anote-a exatamente).
3. Tente mudar "com/sem lances" **depois** de publicar.
   - **Esperado:** recusado com mensagem clara.

---

## 5. Autos em PDF

1. No cabeçalho do processo, **Gerar autos (PDF)**.
2. Abra o PDF e confira:
   - capa, termo de abertura e **índice**;
   - peças na ordem lógica (DFD, ETP/justificativa, TR, pesquisa, reserva, autorização, minutas, parecer, publicação);
   - **carimbo "Fl. 000001…"** em todas as páginas, sem pular número;
   - a peça anexada entra com as páginas originais;
   - o termo com a justificativa da atenção que você justificou.

---

## 6. Relatório final (formato obrigatório)

Entregue um relatório com:

1. **Resumo em 5 linhas:** passou / não passou, e os 3 problemas mais graves.
2. **Tabela por passo:**

| Seção.Passo | Resultado (OK / FALHOU / PARCIAL / NÃO VERIFICADO) | O que aconteceu | URL | Print |
|---|---|---|---|---|

3. **Erros**, cada um com: URL, passos para reproduzir, mensagem exata, o que era esperado e o print.
4. **Confusões de uso:** telas ou textos em que um servidor da Câmara ficaria perdido (mesmo sem erro técnico).
5. **Dados criados:** número do processo e o que foi criado com "TESTE COWORK", para a limpeza depois.
