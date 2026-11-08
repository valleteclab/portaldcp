# Backup do motor antigo (um motor só, passo 3 — 11/2026)

Decisão do dono (08/11/2026): seguir só com o fluxo novo, apagar o código do
motor antigo que não roda mais e "sempre fazendo um backup, porque caso precise
restaurar, a gente já tem de onde começar".

## O que saiu

| Parte | O que fazia | O que fica no lugar |
|---|---|---|
| Construtor de fluxo antigo (desenho da fase interna) | Desenhava o fluxo da fase interna por tipo de processo | Configurações › Fluxos de processo |
| Fluxos de aprovação das peças | Minicircuito de aprovação dentro de uma peça (estilo SEI), ligado pela chave "aprovação interna" do modelo antigo | Etapa de **Aprovação** no fluxo do processo |
| Integração tramitação ↔ tarefas (envio automático, "Enviar o processo para…", sugestão de envio) | Movia o processo sozinho e sugeria o próximo setor pelo modelo antigo | O fluxo do processo diz a próxima etapa; o envio manual continua |
| Aba "Documentos do processo" da Central de Aprovações | Caixa dos fluxos de aprovação das peças | Aba "Etapas de processo" |

O que **não** saiu (ainda é usado pelas telas da fase interna): o modelo de
etapas da fase interna (`modelos_fluxo_fase_interna`, requisitos legais, travas,
planejamento, histórico de versões), o cálculo de etapas e o envio manual.

## Backup do código

Tudo o que foi apagado está no histórico do git. O último estado com o motor
antigo inteiro é o commit **`73f9bad8`** do `main` (merge da PR #647).

Para ver ou trazer de volta um arquivo:

```bash
git show 73f9bad8:backend/src/fase-interna/aprovacao.service.ts
git checkout 73f9bad8 -- backend/src/fase-interna/aprovacao.service.ts
```

Arquivos removidos:

- backend: `fase-interna/aprovacao.service.ts`, `aprovacao-pecas.service.ts`,
  `aprovacao-pecas-regras.ts` (+ spec), `entities/fluxo-aprovacao.entity.ts`,
  `fluxo/construtor-fluxo.controller.ts`, `fluxo/construtor-fluxo.service.ts`,
  `fluxo/ia-construtor-fluxo.ts` (+ spec), `fluxo/integracao-fluxo.controller.ts`,
  `fluxo/integracao-fluxo.service.ts`, entidade `RascunhoModeloFluxo`;
  `fluxo/modelos-prontos-fluxo.ts` virou fixture de teste
  (`modelos-prontos-fluxo.fixture.ts`).
- testes e2e: `construtor-fluxo-motor`, `fluxo-aprovacao-pecas`, `fluxo-integracao`.
- frontend: `components/fase-interna/construtor/*`, `AprovacaoEtapasPanel.tsx`,
  `CaixaDocumentosAprovacao.tsx`, `lib/fluxo/tela-construtor.ts`,
  `lib/fluxo/grafo-editor.ts` (+ testes). As páginas
  `/orgao/configuracoes/fluxo` e `/orgao/configuracoes/fluxos-aprovacao`
  viraram redirecionamentos para Fluxos de processo.

## Backup dos dados

Nenhuma tabela é apagada. No boot, `ArquivoMotorAntigoBootService` move as
tabelas aposentadas, **com todos os dados**, para o schema
`backup_motor_antigo` do mesmo banco:

- `rascunhos_modelo_fluxo`
- `fluxos_aprovacao_documento`
- `aprovacoes_documento`
- `modelos_fluxo_aprovacao`

As chaves estrangeiras dessas tabelas são retiradas, para o backup não impedir
nem sofrer a exclusão de um processo ou órgão. As peças paradas em
"aguardando aprovação" no fluxo antigo voltam para "em elaboração", senão
ficariam presas sem ninguém para decidir. O log do boot registra quantas linhas
cada tabela levou e quantas peças voltaram.

Desligar o arquivamento: `ARQUIVAR_MOTOR_ANTIGO=false`.

Restaurar uma tabela (depois de restaurar o código que a usa):

```sql
ALTER TABLE backup_motor_antigo.aprovacoes_documento SET SCHEMA public;
```

Conferir o que está guardado:

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'backup_motor_antigo';
```
