# Plano de confiabilidade — Medição, OS e saldo

> **Origem:** auditorias feitas entre 01 e 20/08/2026 em 10 contratos reais, todas terminando em
> correção manual no banco. Incorpora o `PLANO-CORRECAO-MEDICAO-FORNECEDOR.md` (jul/2026), cuja
> PARTE 0 continua válida e não foi implementada.
> **Problema declarado pelo usuário:** "o sistema está perdendo a confiança".
> **Workflow:** branch `claude/...` → PR para `valleteclab/portaldcp` base `main`. Commits em português.

---

## 1. O diagnóstico em uma frase

**O mesmo número é calculado em vários lugares, com regras diferentes, e algumas cópias são congeladas.**

Não são dez bugs independentes: é uma causa com dez faces. Toda vez que duas telas — ou uma tela e um
PDF — discordam, o usuário perde a referência de qual acreditar. É isso que corrói a confiança, mais
do que o erro em si.

### As fontes concorrentes do mesmo valor

Para "até o período" e "a executar" existem hoje **quatro** caminhos:

| # | Fonte | Onde | Quando é usada |
|---|---|---|---|
| 1 | Cálculo ao vivo | `calcularExecucaoFinanceira*()` | telas do fornecedor e do órgão |
| 2 | Snapshot financeiro | `medicoes.execucao_financeira` (json) | boletim de medição **aprovada** |
| 3 | Snapshot temporal | `medicoes.execucao_fiscal` (json) | bloco "Execução Temporal" |
| 4 | Recomputação no PDF | `medicao-pdf-jspdf.ts` re-soma os itens | totais e quantidades impressas |

E o saldo do item tem outras duas: `itens_cronograma.quantidade_medida` — baseline que cresce a cada
aprovação e **não decresce** quando a medição é devolvida — e a soma das medições aprovadas.

### Como isso apareceu na prática

| Contrato | Sintoma relatado | Causa encontrada |
|---|---|---|
| 014/2025 | temporal certo, financeiro velho no mesmo boletim | dois snapshots, só um foi corrigido |
| 002/2026 | saldo dizia 6 meses, órgão dizia 5 | mês sem serviço + campos de migração amarrados |
| 004/2024 | contrato "sem saldo" | valor de migração recebeu o total executado |
| 058/2023 | 11ª dizia 15, 12ª dizia 20 | migração inferida, ligada/desligada por contexto |
| 033/2023 | 5 meses no sistema, 6 na contabilidade | migração zerada sem rastro em 22/07 |
| 012/2026 | saldo do teto **subiu** entre medições | total somava só os itens do boletim |
| 012/2026 | acumulado embaralhado | acumula por número, não por período |
| 013/2025 | acumulado zerou no meio do contrato | corte de ciclo no dia 11 corta o mês inteiro |
| 081/2021 | não consegue emitir OS | medição consumiu o saldo, sem volta |
| 040/2023 | R$ 6.200 em dobro | medição duplicada aprovada com a mesma NF |

**Dez contratos, dez correções manuais no banco.** Nenhuma tinha caminho pela tela.

---

## 2. Princípios da correção

1. **Uma fonte de verdade por número.** O cálculo ao vivo é a fonte; snapshot é cópia do documento
   emitido, não insumo de cálculo.
2. **Snapshot é fotografia, não cache.** Serve para reimprimir um boletim idêntico ao assinado. Nunca
   deve alimentar tela nem saldo.
3. **Toda alteração de valor deixa rastro:** quem, quando, de quanto para quanto.
4. **O sistema falha cedo, não tarde.** Bloquear enquanto ainda dá para corrigir, em vez de travar
   depois — caso 081/2021.
5. **Divergência é avisada, não escondida.** Quando duas fontes discordam, mostrar as duas e pedir
   decisão, em vez de escolher uma em silêncio.

---

## 3. Fases

### FASE 1 — Parar de sangrar (1 a 2 semanas)

Impede casos novos. Nenhuma mudança de cálculo: só travas e rastro.

**1.1 Rastro de alteração em item e migração.** `atualizarQuantidadeMedidaMigracao`
([medicao.service.ts:1301](../../backend/src/contratos/medicao.service.ts#L1301)) grava dois campos
sem registrar nada. `itens_cronograma` não tem `updated_by` e `historico_contratos` não cobre item.
→ Registrar em `historico_contratos`: usuário, campo, valor anterior, valor novo.
→ *Validação:* repetir "quem zerou a migração do 033/2023?" e ter resposta em segundos.

**1.2 Aviso ao alterar migração que está sendo contada.** Antes de salvar, mostrar o impacto: "isto
reduz o executado em 1 mês (R$ 15.644,64) e aumenta o saldo no mesmo valor".
→ Teria evitado o caso 033/2023 inteiro.

**1.3 Bloquear medição sem OS liberada** *(prioridade declarada pelo usuário)*. Em modalidade que
exige OS, não permitir criar medição sem OS vinculada com saldo. Hoje o sistema permite e depois não
deixa emitir a OS, porque a medição consumiu o saldo — e não há volta: `devolverMedicao` só aceita
SUBMETIDA/PARCIALMENTE_ATESTADA
([medicao.service.ts:3212](../../backend/src/contratos/medicao.service.ts#L3212)).
→ Complemento: permitir **OS retroativa** vinculada a medição aprovada, sem exigir saldo livre.

**1.4 Desamarrar valor × quantidade na migração.** Os dois campos se recalculam mutuamente na tela
(TabMedicao, caixa âmbar "Valor já consumido"), mas significam coisas diferentes: quantidade é o
total executado, valor é só a migração. A combinação correta é **impossível de digitar**.
→ Campos independentes, rótulos explícitos e a conta exibida: "2 migrados + 5 medidos = 7".
→ Estragou 002/2026, 004/2024 e 014/2025.

**1.5 Bloquear medição duplicada.** Impedir segunda medição aprovada com mesmo período e mesma nota
fiscal — caso 040/2023, R$ 6.200 pagos em dobro sobre a NF 40.

**1.6 Rascunhos órfãos.** Rascunho abandonado duplicando medição aprovada apareceu em 5 dos 10
contratos. Expirar automaticamente ou sinalizar na tela do fiscal.

### FASE 2 — Unificar o cálculo (3 a 4 semanas)

Elimina a divergência estrutural. É a fase que devolve a confiança.

**2.1 Uma função única de execução.** `calcularExecucaoFinanceira` passa a ser a única origem de "no
período / até o período / a executar", inclusive das quantidades. O PDF deixa de re-somar
([medicao-pdf-jspdf.ts](../../backend/src/assinaturas/medicao-pdf-jspdf.ts) recalcula hoje) e passa a
imprimir o que recebe.
→ Resolve 012/2026 (saldo do teto) e 058/2023 (quantidade divergente do valor) de uma vez.

**2.2 Snapshot vira documento, não cálculo.** `execucao_financeira` e `execucao_fiscal` passam a ser
gravados uma única vez, na emissão do boletim assinado, e usados apenas para reimprimir aquele PDF.
Telas e recálculos usam sempre a fonte ao vivo.
→ "Regenerar boletim" ganha dois modos explícitos: *reimprimir o assinado* ou *emitir novo com os
números atuais*. Hoje faz coisas diferentes conforme o status — o que confundiu o usuário em 014/2025
e 033/2023.

**2.3 Acumular por período, não por número.** `medicaoAteReferencia`
([medicao.service.ts:5873](../../backend/src/contratos/medicao.service.ts#L5873)) compara
`numero_medicao`. Medição criada fora de ordem cronológica embaralha tudo — caso 012/2026, com
boletim de julho somando serviço de agosto.
→ Ordenar por período, com número como desempate.
→ **Risco alto:** muda o cálculo de todos os contratos. Exige a régua da Fase 3 antes de subir.

**2.4 Corte de ciclo por competência.** `filtrarMedicoesPorCiclo`
([medicao.service.ts:1056](../../backend/src/contratos/medicao.service.ts#L1056)) usa
`periodo_inicio >= data_renovacao_ciclo`. Renovação no dia 11 descarta o mês inteiro — caso 013/2025,
em que o acumulado zerou no meio do contrato.
→ Comparar competência (mês/ano) em vez de data, ou avisar quando a renovação não cair em início de mês.

**2.5 Migração declarada, nunca inferida.** Para item não-MENSAL a migração é deduzida de
`quantidade_medida − aprovadas`, e essa dedução é **desligada** quando existe medição aprovada
posterior ([medicao.service.ts:7406](../../backend/src/contratos/medicao.service.ts#L7406)). O mesmo
contrato mostra 15 num boletim e 20 no seguinte — caso 058/2023.
→ Migração passa a ser registro explícito: quantidade, valor, competência e documento. Igual para
MENSAL e não-MENSAL. `quantidade_medida` deixa de ser fonte de migração.

### FASE 3 — Corrigir o passivo (paralela à Fase 2)

Os dados já gravados continuam errados mesmo com o código consertado.

**3.1 Régua de conferência.** Script que, por contrato, compara soma das medições aprovadas ×
`quantidade_medida` × snapshots × valor global × soma dos itens, e emite relatório de divergências.
→ Rodar **antes** de qualquer mudança da Fase 2, para ter linha de base.

**3.2 Mutirão de correção.** Tratar as divergências contrato a contrato, com o rito já usado: backup,
transação, verificação, rollback salvo.
→ Já conhecidos: 6 contratos com divergência real de conciliação (033/2023, 029/2023, 026/2023,
032/2023, 031/2023, 004/2025) e o boletim de fevereiro do 058/2023, que declara 261 unidades sem
explicação.

**3.3 Higiene de cadastro.** Contratos duplicados vazios — como `013/2025`, criado em 07/08 com zero
medições, sombra do `013/2025 1ºAD` — e rascunhos órfãos.

### FASE 4 — Não regredir (contínuo)

**4.1 Testes de regressão com os 10 casos reais.** Cada contrato desta auditoria vira caso de teste
com os números esperados. Nenhuma mudança de cálculo sobe sem passar por eles.

**4.2 Régua no ar.** A conferência da 3.1 roda periodicamente e avisa quando um contrato diverge, em
vez de esperar o órgão perceber.

**4.3 Painel de conciliação por contrato.** Mostrar as fontes lado a lado — medições, item, snapshot,
global — na própria tela. Divergência vira informação visível, não surpresa.

---

## 4. Ordem sugerida

| Ordem | Item | Esforço | Risco | Devolve confiança? |
|---|---|---|---|---|
| 1 | 1.1 rastro + 1.2 aviso | baixo | baixo | direto |
| 2 | 1.3 bloquear medição sem OS | baixo | baixo | direto |
| 3 | 1.4 desamarrar migração | baixo | baixo | direto |
| 4 | 3.1 régua de conferência | médio | nenhum | é o termômetro |
| 5 | 2.1 cálculo único + 2.2 snapshot como documento | alto | médio | **é a cura** |
| 6 | 2.4 corte por competência | baixo | médio | direto |
| 7 | 2.5 migração declarada | médio | médio | direto |
| 8 | 2.3 acumular por período | médio | **alto** | direto |
| 9 | 3.2 mutirão + 3.3 higiene | alto | baixo | direto |
| 10 | 4.1 testes + 4.2 régua no ar | médio | nenhum | sustenta |

A Fase 1 inteira cabe em uma a duas semanas e já muda a percepção: o sistema para de aceitar em
silêncio o que depois vira problema. A Fase 2 é a correção de verdade — e a régua (3.1) precisa
existir antes dela, senão não há como provar que melhorou.

---

## 5. Como saber que funcionou

- A régua (3.1) fecha zero divergências nos contratos ativos.
- Nenhuma correção nova precisa de acesso ao banco por 30 dias.
- Tela, boletim e contabilidade mostram o mesmo número para o mesmo contrato.
- Quando divergirem, o sistema avisa primeiro — não o órgão.
