# Roteiro de homologação — Nova fase interna do Portal DCP

**Para:** o Claude (Cowork) que vai testar o sistema pelo navegador.
**Objetivo:** percorrer uma **dispensa eletrônica** do início (DFD) até a publicação e os autos em PDF, conferindo cada etapa e registrando o que funcionou, o que falhou e o que ficou confuso.

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
   - Prazos: clique em **"Modelo Portaria 089"** e salve.
   - Padrão sugerido para novas dispensas: **com lances**.
   - Signatários da autorização: cadastre **um** usuário (o próprio administrador ou o usuário "autoridade" informado), com o papel **Autoridade**.
   - Papéis dos usuários: dê ao usuário de teste os papéis **Agente de contratação, Jurídico, Contabilidade e Autoridade** (um usuário pode ter vários).
   - **Esperado:** salva sem erro; ao recarregar, os valores continuam.
2. **Configurações › Orçamento** (`/orgao/configuracoes/orcamento`)
   - Cadastre **1 lei** (ex.: "LOA 2026 — Lei nº 0000/2025") e **1 dotação** (unidade orçamentária, programa, projeto/atividade, elemento 3.3.90.40, fonte 500).
   - **Esperado:** aparecem nas listas.

---

## 2. Criar a dispensa

1. **Fase interna › Novo processo** (assistente) ou a partir de uma demanda.
   - Objeto: "TESTE COWORK — licença de software de gestão de conteúdo (12 meses) + implantação".
   - Modalidade: **Dispensa**. Fundamento: **art. 75, II**.
   - Itens: 2 itens: "Implantação e treinamento" (1 serviço) e "Licença mensal do software" (12 meses), com código **CATSER**, unidade e quantidade.
   - **Esperado:** ao salvar, o sistema abre a **tela do processo** (`/orgao/processos/[id]`) com o quadro **"Fluxo da fase interna"**, com as etapas e o responsável.
2. Abra **Minhas tarefas** (`/orgao/fase-interna`).
   - **Esperado:** aparecem as tarefas desse processo, com prazo. O botão da tarefa leva à tela da etapa.

---

## 3. Percorrer as etapas (dentro do processo)

Para **cada etapa**, confira três coisas: (a) a tela abre pelo quadro do processo e pela tarefa; (b) "← Voltar ao processo" funciona; (c) ao concluir a peça, a **tarefa some de "Para mim"** e aparece em "Concluídas".

| # | Etapa (rota) | O que fazer | O que deve acontecer |
|---|---|---|---|
| 1 | **DFD** (`…/fase-interna/dfd`) | Preencha necessidade, responsável, item do PCA **ou** justificativa de ausência. **Gerar DFD**. | PDF do DFD gerado; etapa concluída. |
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
