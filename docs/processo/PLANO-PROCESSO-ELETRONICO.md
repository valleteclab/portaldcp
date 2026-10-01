# Processo eletrônico — a base

> 28/09/2026. Decisão do dono do produto: **"tudo é processo administrativo"**. Esta é a etapa 1 (a base, invisível ao usuário). Código: `backend/src/processo/**` (entidades `Processo`/`TipoProcessoRegistro`, `ProcessoService`, `ProcessoConteudoService`, `ProcessoTiposService`, `MigracaoProcessoBootService`, `ProcessosController`, regras puras em `processo-regras.ts`, contratos de tipo em `tipos/`).

## 1. Decisão e princípio

O Portal DCP tem, hoje, processos de fato — fase interna da licitação, aditivo, renovação, pagamento — cada um com seu próprio número, sua própria tramitação (quando tem) e seus próprios documentos, implementados separadamente. O dono decidiu que isso devia ser o contrário: existe **um conceito de processo administrativo eletrônico**, no estilo SEI —

- **autuação**: um número único por órgão, um objeto, uma situação (ABERTO/ENCERRADO);
- **autos**: folhas numeradas, juntadas na ordem;
- **tramitação**: com quem está, para onde vai, despacho a cada movimentação;
- **documentos**: feitos no próprio sistema ou anexados, cada um uma peça dos autos;
- **fluxo desenhado** (opcional — nem todo processo tem um; o construtor de fluxo, `docs/licitacao/PLANO-CONSTRUTOR-FLUXO.md`, é o editor dele);
- **tarefas**: o que falta fazer, com quem e até quando.

— e que **cada tipo de processo (contratação, aditivo, renovação, pagamento, avulso) é conteúdo dentro dessa casca**, não uma implementação própria de autuação/tramitação/documento. A licitação/contratação é o **primeiro tipo** a se apoiar nessa base, porque já tinha quase tudo isso implementado (fase interna) — o trabalho desta etapa foi extrair o que é genérico e religar a licitação como cliente dele, sem mudar o que o usuário vê.

Duas decisões de modelagem acompanham o princípio:

- **Aditivo e renovação serão processos NOVOS**, ligados ao contrato, não uma continuação do processo da licitação. O cadastro de aditivo que já existe continua a existir e passa a ser **o resultado** do processo de aditivo (o conteúdo), do mesmo jeito que `licitacoes` é o conteúdo do processo de CONTRATACAO.
- **Processo sem demanda é legal.** O art. 72, I da Lei 14.133/2021 exige o Documento de Formalização de Demanda (DFD) para iniciar o planejamento — não existe exigência de um "pedido" prévio de outro setor. Por isso a autuação não depende de haver uma demanda: ela pode nascer do assistente, de um DFD consolidado, de uma demanda, de uma fase interna feita fora do sistema, de uma importação ou de um credenciamento — ver §4.

## 2. O que NÃO muda

Restrição firme do dono: esta etapa não altera nada do que já funciona nestes módulos:

| Módulo | O que continua exatamente como está |
|---|---|
| Ordens de Serviço (OS) | Emissão, status, vínculo com medição |
| Medição | Telas, cálculo de saldo/execução, retratos congelados |
| Patrimônio | Inventário, QR/RFID, importador do legado |
| Cadastro de contrato | Campos, vigência, aditivos existentes |
| Almoxarifado | Estoque, movimentações |
| Frota | PWA, cota, WhatsApp |

Dentro da própria fase interna da licitação, também não muda nada que o usuário vê: as telas de autos, tramitação, fluxo e tarefas continuam sendo as mesmas, alimentadas pelos mesmos serviços (`JuntadaAutosService`, `TramitacaoService`, `TarefasService`, `ModeloFluxoService`). O módulo do processo não duplica esse código nem o substitui nesta etapa — ele **lê** esses serviços por adaptador (§8) e expõe o mesmo dado por uma rota nova, endereçada pelo processo em vez da licitação.

## 3. Modelo de dados

### `processos` — a autuação

Entidade: `backend/src/processo/entities/processo.entity.ts`.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `orgao_id` | uuid | |
| `tipo` | varchar(30) | `TipoProcesso`: CONTRATACAO, ADITIVO, RENOVACAO, PAGAMENTO, AVULSO. `varchar`, não enum do Postgres — a lista cresce sem recriar tipo |
| `numero` | varchar(60) | nº do processo administrativo (gerado ou digitado) |
| `objeto` | text | |
| `situacao` | varchar(20), default `ABERTO` | `ABERTO` \| `ENCERRADO` |
| `referencia_tipo` | varchar(30), nulo | hoje só `'LICITACAO'` (constante `REFERENCIA_LICITACAO`); nulo no AVULSO |
| `referencia_id` | uuid, nulo | id na tabela de conteúdo (`licitacoes.id` na CONTRATACAO) |
| `setor_origem_id` | uuid, nulo | lotação de quem abriu, quando conhecida |
| `aberto_por_id` / `aberto_por_nome` | varchar, nulo | usuário, órgão (login do órgão) ou sistema (migração/importação) |
| `origem` | varchar(30), nulo | como nasceu: `ASSISTENTE`, `DFD`, `DEMANDA`, `FEITA_FORA`, `IMPORTACAO`, `CREDENCIAMENTO`, `MIGRACAO`, `AVULSO` |
| `aberto_em` / `encerrado_em` / `motivo_encerramento` | | |
| `created_at` / `updated_at` | | |

Unicidade:
- `UQ_processos_orgao_numero`: um número por órgão (a mesma regra que já valia em `licitacoes.numero_processo`);
- `UQ_processos_referencia` (índice único parcial, só quando `referencia_id IS NOT NULL`): uma referência por processo — não existem dois `Processo` apontando para a mesma licitação;
- índice de apoio `IDX_processos_orgao_tipo_situacao` para a listagem.

### `tipos_processo` — o registro em dados de cada tipo

Entidade `TipoProcessoRegistro`, chave primária `codigo` (mesmo domínio de `TipoProcesso`). Guarda o que o órgão vê e o admin da plataforma liga/desliga: `rotulo`, `descricao`, `referencia_tipo`, `implementado`, `abertura_direta`, `ativo`, `ordem`. O "como" de cada tipo (catálogo de documentos, campos de condição, requisitos, ganchos) fica em código, em `tipos/` (§7) — a tabela não guarda lógica.

### `processo_id` nas 6 tabelas da fase interna

Coluna nova, `uuid` nulo, adicionada a cada uma (lista em `TABELAS_COM_PROCESSO_ID`, `processo.service.ts`):

| Tabela | Entidade |
|---|---|
| `tramitacoes_processo` | `fase-interna/entities/tramitacao-processo.entity.ts` |
| `juntadas_autos` | `fase-interna/entities/juntada-autos.entity.ts` |
| `documentos_fase_interna` | `fase-interna/entities/documento-fase-interna.entity.ts` |
| `despachos_fase_interna` | `fase-interna/entities/despacho-fase-interna.entity.ts` |
| `fluxos_processo_fase_interna` | `fase-interna/fluxo/modelo-fluxo.entities.ts` |
| `tarefas` | `fase-interna/tarefas/tarefa.entity.ts` |

É só uma **ligação adicional**: nenhuma dessas tabelas deixou de ter `licitacao_id`, e nenhuma consulta existente passou a depender de `processo_id` estar preenchido. Linhas antigas (antes desta etapa) ficam com `processo_id` nulo até a migração de boot preencher (§5); linhas novas, criadas depois desta etapa, já nascem ligadas (porque a licitação já existe dentro da transação de abertura — §4).

### Referência de conteúdo

O par `referencia_tipo` + `referencia_id` em `processos` é a ponte genérica para a tabela de conteúdo do tipo. Há dois valores de `referencia_tipo`: `'LICITACAO'` (CONTRATACAO) e `'TERMO_ADITIVO'` (ADITIVO, etapa 2; o id é o do termo cadastrado). A referência é o **resultado** do processo e é única (índice parcial). O **contrato** do processo de aditivo/renovação fica em coluna própria, `processos.contrato_id`: um contrato tem vários processos de aditivo, então o contrato não pode ser a referência única.

## 4. Como a licitação virou o 1º tipo

A autuação nasce **dentro da mesma transação** que grava a licitação, não antes nem depois. Isso vale para os 5 caminhos que criam uma licitação (CONTRATACAO):

| Caminho | Arquivo | `origem` gravada |
|---|---|---|
| Assistente | `licitacoes/licitacoes.service.ts` (`criar`) | `ASSISTENTE` |
| DFD consolidado (vários itens) | `licitacoes/licitacoes.service.ts` (`criar`, quando `opcoes.dfd_consolidado`) | `DFD` |
| DFD (planejamento, 1 DFD) | `fase-interna/fase-interna.service.ts` | `DFD` |
| Demanda | `licitacoes/licitacoes.service.ts` (`criar`, quando `opcoes.demanda_id`) | `DEMANDA` |
| Fase interna feita fora do sistema | `licitacoes/licitacoes.service.ts` (`criar`, quando `opcoes.fase_interna_externa`) | `FEITA_FORA` |
| Importação (de outro sistema) | `licitacoes/licitacoes.service.ts` (método de importação) | `IMPORTACAO` |
| Credenciamento | `credenciamento/credenciamento.service.ts` | `CREDENCIAMENTO` |

O padrão, em todos eles, é o mesmo:

```
m.transaction(async (m) => {
  // 1. abre o processo primeiro — consome o número (gerado ou digitado)
  const processo = await this.processos.abrirContratacao(m, { orgaoId, numeroDigitado, objeto, abertoPor, origem });
  // 2. a licitação recebe O MESMO número (licitacoes.numero_processo, mantido por compatibilidade)
  licitacao.numero_processo = processo.numero;
  // 3. grava a licitação; erro de duplicidade de número é traduzido para 409 com a mesma mensagem de antes
  const gravada = await m.getRepository(Licitacao).save(licitacao);
  // 4. liga a referência (referencia_tipo='LICITACAO', referencia_id=gravada.id)
  await this.processos.vincularReferencia(m, processo.id, REFERENCIA_LICITACAO, gravada.id);
});
```

Se a gravação da licitação falhar, a transação desfaz tudo — inclusive o número consumido (o mesmo contrato que `NumeroProcessoService` já tinha antes desta etapa).

**Renumeração.** Quando a licitação é editada e o número do processo muda, `licitacoes.service.ts` chama `processos.atualizarNumeroDaLicitacao(licitacaoId, numero)` — um `UPDATE` direto em `processos` pela referência, sem reabrir transação de criação.

**Objeto.** Da mesma forma, mudança no objeto da licitação aciona `processos.atualizarObjetoDaLicitacao(licitacaoId, objeto)`.

**Exclusão.** Licitação excluída (só é possível na fase interna) aciona `processos.aoExcluirLicitacao(licitacaoId, manager)` — `DELETE` do processo na mesma transação da exclusão da licitação.

**O gerador de número agora olha as duas tabelas.** `NumeroProcessoService` (em `backend/src/numero-processo/numero-processo.service.ts`) é o dono único da sequência por órgão/ano. Antes desta etapa, a verificação "este número já existe no órgão?" olhava só `licitacoes.numero_processo`; agora olha **as duas tabelas** (`existeNoOrgao` e `maiorSequencialExistente` fazem `UNION` entre `licitacoes` e `processos`). Isso é o que permite ao processo AVULSO (sem licitação) competir pelo mesmo espaço de numeração do órgão — dois processos do mesmo órgão nunca têm o mesmo número, seja qual for o tipo.

## 5. Migração de boot

`MigracaoProcessoBootService` (`backend/src/processo/migracao-processo-boot.service.ts`), rodando na fila única de migrações de boot (`executarMigracaoDeBoot`). Desligar com `PROCESSO_MIGRAR_NO_BOOT=false`. Idempotente: cada passo é um comando SQL em conjunto (não linha a linha), então roda em segundos mesmo com milhares de registros, e rodar de novo não duplica nada.

1. **Semeia `tipos_processo`** (`ProcessoTiposService.semear()`): um `INSERT ... ON CONFLICT (codigo) DO NOTHING` por tipo da ordem `ORDEM_TIPOS` — nunca sobrescreve o que o admin da plataforma já editou (rótulo, ativo, ordem), só insere o que falta.
2. **Cria um `Processo` de CONTRATACAO para cada licitação que ainda não tem um.** Um único `INSERT ... SELECT` a partir de `licitacoes`, pulando as que já têm processo (`NOT EXISTS`) e as que não têm `orgao_id` ou `numero_processo` (dado antigo inconsistente — ficam de fora, não travam a migração). `origem = 'MIGRACAO'`; situação derivada de `situacaoDoProcessoPelaLicitacao` (`ENCERRADO` se a licitação está em `REVOGADA`, `ANULADA`, `DESERTA`, `FRACASSADA` ou `CONCLUIDA`; `ABERTO` nos demais casos).
3. **Preenche `processo_id`** nas 6 tabelas da §3, linha a linha ainda sem ligação (`UPDATE ... FROM processos WHERE ... AND t.processo_id IS NULL`), casando por `t.licitacao_id` com o `referencia_id` do processo.

Falha em qualquer passo é registrada em log (`this.logger.error`) e não derruba o boot — a aplicação sobe mesmo se a migração falhar; ela tenta de novo no próximo boot.

`garantirDaLicitacao` (em `ProcessoService`) faz o mesmo trabalho dos passos 2 e 3, mas para **uma única licitação**, sob demanda: cobre licitação criada por um caminho que a migração ainda não alcançou dentro do mesmo boot (ex.: migração legada do credenciamento rodando antes desta) e é chamado também por `porReferencia` quando o processo de uma licitação antiga ainda não existe.

## 6. API `/api/processos`

Controller: `backend/src/processo/processos.controller.ts`. `@SomenteOrgao()`: anônimo recebe 401, fornecedor recebe 403. Em toda rota com `:id`, o processo é obtido por `ProcessoService.obter(ator, id)`, que aplica o isolamento: **processo de outro órgão responde 404**, como se não existisse (nunca 403 — não revela que o processo existe). O admin da plataforma enxerga qualquer órgão; demais atores só o próprio (`ator.orgaoId`), e `?orgao_id=` é ignorado para eles.

| Método | Rota | Devolve | Isolamento |
|---|---|---|---|
| GET | `/processos/tipos` | registro em dados + catálogo de documentos/campos de condição de cada tipo | sem dado de órgão |
| GET | `/processos` | lista do órgão do token (`?tipo=`, `?situacao=`, `?q=`, `?limit=`) | só do órgão do ator (admin: `?orgao_id=`) |
| POST | `/processos` | abre um processo SEM objeto de conteúdo (só AVULSO nesta etapa); CONTRATACAO recusa com 400 explicando que nasce pelo módulo de licitações | setor informado tem de ser do órgão |
| GET | `/processos/referencia/:tipo/:id` | processo pela referência de conteúdo (ex.: `LICITACAO`/id); cria sob demanda se a licitação já existe mas o processo ainda não (dado antigo) | licitação de outro órgão → 404 (não cria, não revela) |
| GET | `/processos/:id` | autuação + resumo do conteúdo (campos-chave da licitação, quando houver) | 404 fora do órgão |
| GET | `/processos/:id/autos` | regime e livro de juntadas (mesma leitura de `/fase-interna/:licitacaoId/autos`) | idem |
| GET | `/processos/:id/tramitacao` | com quem está, atual, movimentações, linha do tempo | idem |
| GET | `/processos/:id/fluxo` | retrato do fluxo + etapas calculadas (mesma leitura de `/fase-interna/:id/etapas`) | idem |
| GET | `/processos/:id/tarefas` | tarefas do processo | idem |
| GET | `/processos/:id/documentos` | peças (versão atual), com origem INTERNO ou ARQUIVO | idem |
| POST | `/processos/:id/encerrar` | encerra um processo sem conteúdo (AVULSO); CONTRATACAO recusa com 400 (encerra pelos atos da licitação) | idem |

Nenhuma rota aqui muda o comportamento das telas existentes — são rotas novas, de leitura (mais a abertura/encerramento do AVULSO), endereçando o mesmo dado pelo processo em vez da licitação.

## 7. Tipos de processo

Contrato `DefinicaoTipoProcesso` (`backend/src/processo/tipos/tipo-processo.ts`): cada tipo declara, em código, o que o motor genérico precisa saber para conduzir um processo daquele tipo —

- `catalogoDocumentos()`: o que uma etapa pode produzir;
- `camposCondicao()`: campos disponíveis para a condição do fluxo desenhado;
- `requisitosLegais()`: o que o fluxo não pode pular (assíncrono — pode consultar outro módulo);
- `aoConcluirUltimaEtapa(processo)`: o que acontece quando a última etapa do fluxo conclui.

Registrados em `ProcessoTiposService`:

| Tipo | `implementado` | `abertura_direta` | `tem_fluxo` | Como é hoje |
|---|---|---|---|---|
| CONTRATACAO | `true` | `false` (nasce do módulo de licitações) | `true` | `definicaoContratacao()` (`tipos/tipo-contratacao.ts`) delega tudo ao que já existe na fase interna: catálogo = peças de `CATALOGO_ETAPAS`; campos de condição = `CAMPOS_CONDICAO` do construtor de fluxo; requisitos = `requisitos_legais_fluxo` via `ModeloFluxoService` (resolvido por `ModuleRef` — import tardio, para não fechar ciclo de módulos); gancho da última etapa = nada (a conclusão continua pelo ato `CONCLUIR_FASE_INTERNA` da licitação, §8) |
| AVULSO | `true` | `true` | `false` | `definicaoAvulso()`: sem fluxo, sem conteúdo próprio; só autuação (abrir/obter/listar) — tramitação e juntada do avulso ficam para depois, porque as tabelas de autos/tramitação ainda exigem `licitacao_id` |
| ADITIVO | `false` | `false` | `true` | esqueleto (`esqueletoDeTipo`): toda operação recusa com mensagem clara; `referencia_tipo = 'CONTRATO'` já reservado |
| RENOVACAO | `false` | `false` | `true` | esqueleto; `referencia_tipo = 'CONTRATO'` |
| PAGAMENTO | `false` | `false` | `true` | esqueleto; `referencia_tipo = 'MEDICAO'` |

## 8. Acoplamentos por compatibilidade

Esta etapa deliberadamente **não** desfez alguns laços entre o processo e a licitação, para não arriscar nada do que já funciona. Ficam registrados aqui para as próximas etapas resolverem:

| Acoplamento | Onde | Por quê ficou | Como será desfeito |
|---|---|---|---|
| `licitacao_id` continua em todas as 6 tabelas (além do novo `processo_id`) | entidades da fase interna | nenhuma consulta existente foi tocada; reescrevê-las para usar só `processo_id` é trabalho de uma etapa própria, não desta fundação | quando a etapa 4 (tela do processo) estiver no ar e toda leitura passar pelo processo, `licitacao_id` pode virar só histórico |
| `ProcessoConteudoService` chama os serviços da fase interna por `ModuleRef` (`this.moduleRef.get(...)`, com `require()` tardio do módulo) em vez de injeção normal | `processo-conteudo.service.ts` | o `ProcessoModule` não pode importar o `FaseInternaModule` (é o `FaseInternaModule` que importa o `ProcessoModule` — o processo é a base) | quando autos/tramitação/fluxo tiverem implementação própria no módulo do processo (não mais "espelhada" da fase interna), o `ModuleRef` sai |
| `ModeloFluxoService` (requisitos legais da CONTRATACAO) também é resolvido por `ModuleRef`, dentro de `ProcessoTiposService.requisitosDaContratacao()` | `processo-tipos.service.ts` | mesmo motivo — evitar ciclo `FaseInternaModule ↔ ProcessoModule` | idem; ou os requisitos legais passam a viver no próprio módulo do processo |
| A conclusão da fase interna continua sendo o ato `CONCLUIR_FASE_INTERNA` da máquina de estados da **licitação**, não um gancho do processo | `fase-interna.service.ts`; `aoConcluirUltimaEtapa` da CONTRATACAO é um `no-op` | a máquina de estados da licitação já faz isso corretamente hoje; duplicar a regra no processo é risco sem ganho nesta etapa | quando o motor de fluxo genérico (etapa 4) tomar conta da condução de qualquer tipo, o gancho passa a disparar a conclusão (e a CONTRATACAO deixa de ser caso especial) |
| `licitacoes.numero_processo` continua existindo e sendo gravado (igual ao `processos.numero`) | entidade `Licitacao` | todo o resto do sistema (telas, relatórios, PDFs) lê esse campo | fica como está — é o espelho de compatibilidade, não algo a remover |

## 9. Próximas etapas, na ordem

1. **Esta base** (concluída) — invisível ao usuário.
2. **Processo de aditivo** (etapa 2 — backend, ver §11). Plano original: tipo `ADITIVO` implementado (`implementado: true`), com `referencia_tipo = 'CONTRATO'`; abertura ligada ao contrato (não à licitação); o cadastro de aditivo atual passa a ser gravado como o **resultado** do processo (como `licitacoes` é hoje da CONTRATACAO); decidir se autos/tramitação do aditivo reaproveitam as mesmas 6 tabelas (com `processo_id` preenchido e `licitacao_id` nulo) ou precisam de tabela própria, já que aditivo não tem `licitacao_id`.
3. **Renovação** (etapa 3 — backend, ver §12). Plano original: mesma mecânica do aditivo (`referencia_tipo = 'CONTRATO'`); decidir o que é específico da renovação (vigência, novo valor) versus o que reaproveita do aditivo.
4. **Tela do processo**, sobre a base pronta. Protótipo aprovado "Processo Passo a Passo": **Está com → Sua vez → Etapas → Linha do tempo → Detalhes**. Precisa: as rotas de `/api/processos` já cobrem os dados (autos, tramitação, fluxo, tarefas); falta a composição na tela e, nessa mesma etapa, o construtor de fluxo (hoje específico da fase interna — PRs #538/#539, `docs/licitacao/PLANO-CONSTRUTOR-FLUXO.md`) vira **genérico por tipo de processo**, usando `camposCondicao()` e `catalogoDocumentos()` de cada `DefinicaoTipoProcesso` em vez de ler direto o catálogo da licitação.

## 10. Roteiro de verificação desta etapa

Depois do deploy, confirmar que a migração rodou sem quebrar nada:

**1. Log do boot.** Procurar a linha do `MigracaoProcessoBootService`:
```
Processo eletrônico: N processo(s) criado(s) para licitações existentes; M linha(s) ligada(s) (tramitacoes_processo=…, juntadas_autos=…, documentos_fase_interna=…, despachos_fase_interna=…, fluxos_processo_fase_interna=…, tarefas=…)
```
Se não aparecer nenhuma linha, ou todas as licitações já tinham processo (rodou antes) ou `PROCESSO_MIGRAR_NO_BOOT=false`. Também checar que não há linha de erro (`Migração do processo eletrônico não executada: ...`).

**2. Contagens no banco.**
```sql
-- toda licitação com orgao_id e numero_processo deve ter processo
SELECT count(*) FROM licitacoes l
 WHERE l.orgao_id IS NOT NULL AND l.numero_processo IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM processos p WHERE p.referencia_tipo = 'LICITACAO' AND p.referencia_id = l.id);
-- esperado: 0

-- nenhuma tabela da fase interna deve ter processo_id nulo quando a licitação tem processo
SELECT count(*) FROM tarefas t
 JOIN licitacoes l ON l.id = t.licitacao_id
 JOIN processos p ON p.referencia_tipo = 'LICITACAO' AND p.referencia_id = l.id
 WHERE t.processo_id IS NULL;
-- esperado: 0 (repetir para tramitacoes_processo, juntadas_autos, documentos_fase_interna, despachos_fase_interna, fluxos_processo_fase_interna)

-- tipos_processo semeado
SELECT codigo, implementado, abertura_direta, ativo FROM tipos_processo ORDER BY ordem;
-- esperado: CONTRATACAO (implementado=true), AVULSO (implementado=true, abertura_direta=true), ADITIVO/RENOVACAO/PAGAMENTO (implementado=false)

-- unicidade por órgão não violada (não deve haver linha nenhuma)
SELECT orgao_id, numero, count(*) FROM processos GROUP BY orgao_id, numero HAVING count(*) > 1;
```

**3. Rotas.**
- `GET /api/processos/tipos` (autenticado como órgão) devolve os 5 tipos, com `documentos` e `campos_condicao` preenchidos para CONTRATACAO e vazios para os esqueletos.
- `GET /api/processos?tipo=CONTRATACAO&limit=5` devolve processos do órgão do token, mais recentes primeiro.
- `GET /api/processos/referencia/LICITACAO/:id` de uma licitação do próprio órgão devolve a autuação; da mesma rota com uma licitação de outro órgão devolve 404.
- `GET /api/processos/:id/autos`, `/tramitacao`, `/fluxo`, `/tarefas`, `/documentos` de um processo de CONTRATACAO batem com o que `/fase-interna/:licitacaoId/...` já devolve para a mesma licitação (é o mesmo dado, duas portas).
- `POST /api/processos` com `{ tipo: 'CONTRATACAO', objeto: '...' }` devolve 400 (nasce pelo módulo de licitações); com `{ objeto: '...' }` (AVULSO implícito) abre um processo novo.
- Criar uma licitação nova pelo assistente, pelo DFD, por demanda, por "fase interna feita fora" e por credenciamento: cada uma deve aparecer em `GET /api/processos` com a `origem` correspondente (`ASSISTENTE`, `DFD`, `DEMANDA`, `FEITA_FORA`, `CREDENCIAMENTO`) e o mesmo número que a tela da licitação mostra.
- Editar o número ou o objeto de uma licitação existente e confirmar que `GET /api/processos/:id` do processo dela reflete a mudança.
- Excluir uma licitação na fase interna (quando permitido) e confirmar que o processo correspondente desaparece de `GET /api/processos`.


## 11. Etapa 2 — processo de aditivo (backend, invisível)

**Decisão sobre as tabelas.** Autos, tramitação e peças da fase interna dependem da licitação em cerca de 90 pontos (repositório, notificações, permissões). Adaptar isso para processo sem licitação é o trabalho genérico da etapa 4, junto com a tela. Por isso esta etapa só faz a autuação e a ligação com o resultado; `licitacao_id` segue obrigatório e nada nas 6 tabelas muda.

**O que entra.**
- `TipoProcesso.ADITIVO` implementado, com abertura direta. Corpo de `POST /api/processos`: `{ tipo: 'ADITIVO', contrato_id, objeto, numero?, setor_origem_id? }`. O contrato precisa ser do órgão do token (outro órgão → 404).
- `processos.contrato_id` (coluna nova, nula nos demais tipos) e filtro `GET /api/processos?contrato_id=`.
- O cadastro do aditivo (`POST /api/contratos/:contratoId/termos`) aceita `processo_id` opcional. O processo é validado ANTES de criar o termo (ADITIVO, mesmo órgão e contrato, aberto, sem resultado). Depois de criado, o termo vira o resultado do processo. Sem `processo_id` nada muda: o cadastro e todos os efeitos no contrato seguem como sempre.
- Excluir o termo solta o resultado do processo; o processo continua aberto.
- `GET /api/processos/referencia/TERMO_ADITIVO/:termoId` devolve o processo de um termo; a visão do processo de aditivo traz o resumo do contrato e do termo.
- O registro `tipos_processo` passa a acompanhar o código nos campos `implementado`, `abertura_direta` e `referencia_tipo` (o boot atualiza o que já existia).

**Roteiro de verificação (depois do deploy).**
- `GET /api/processos/tipos`: ADITIVO com `implementado=true` e `abertura_direta=true`.
- `POST /api/processos` com ADITIVO sem `contrato_id` → 400; com contrato de outro órgão → 404; com contrato do órgão → abre, com `contrato_id` preenchido.
- `POST /api/contratos/:id/termos` com `processo_id` de outro contrato → 400, sem criar o termo; com o processo certo → termo criado e `GET /api/processos/:id` mostra o termo em `conteudo.termo`.
- Repetir com o mesmo `processo_id` → 409 e nenhum termo novo.
- Excluir o termo e conferir que o processo voltou a ficar sem resultado.


## 12. Etapa 3 — processo de renovação (backend, invisível)

A renovação, no cadastro atual, é um termo aditivo com `renovacao_ciclo = true`. Por isso o processo de RENOVACAO usa exatamente a mecânica do aditivo (§11): nasce com `contrato_id` e o termo cadastrado vira o resultado (`referencia_tipo = 'TERMO_ADITIVO'`).

**O que entra.**
- `TipoProcesso.RENOVACAO` implementado, com abertura direta (`POST /api/processos` com `tipo: 'RENOVACAO'` e `contrato_id`).
- `POST /api/contratos/:id/termos` com `processo_id` de um processo de renovação só aceita termo com `renovacao_ciclo = true`; senão 400, antes de criar o termo. Para o processo de ADITIVO nada mudou.
- A visão do processo traz o resumo do contrato e do termo (com `renovacao_ciclo`).

**Roteiro de verificação (depois do deploy).**
- `GET /api/processos/tipos`: RENOVACAO com `implementado=true` e `abertura_direta=true`.
- Abrir RENOVACAO sem `contrato_id` → 400; com contrato de outro órgão → 404; com contrato do órgão → abre.
- Cadastrar termo com esse `processo_id` sem `renovacao_ciclo` → 400, sem criar o termo; com `renovacao_ciclo: true` → criado e visível em `conteudo.termo` do processo.


## 13. Etapa 4a — tramitação genérica (backend)

**Decisão.** Os tipos sem licitação (ADITIVO, RENOVACAO, AVULSO) ganham tabelas próprias; a CONTRATACAO continua lendo as rotas da fase interna (unificar fica para depois). Nada nas 6 tabelas da fase interna muda. A tela (4b) e as peças geradas por IA (4c) vêm em PRs seguintes.

**Tabelas novas (synchronize).**
- `processo_movimentacoes`: uma linha por remessa (ABERTURA, ENVIO, DEVOLUCAO) com de/para (setor e pessoa), despacho e `recebida_em`. A última linha é a posse atual ("está com").
- `processo_pecas`: peça dos autos (texto feito no sistema e/ou arquivo enviado por `POST /api/uploads`), com número, folhas na ordem de juntada e a `etapa` que ela conclui.

**Regras.**
- Ao abrir o processo, quem abriu fica com ele, já recebido.
- Enviar/devolver/juntar/encerrar: só quem está com o processo (pessoa, lotado no setor, chefe do setor) ou o administrador do órgão. Enviar e juntar exigem ter recebido antes (o administrador do órgão dispensa).
- Destino (setor/pessoa) sempre do mesmo órgão; despacho obrigatório. Quem enviou não é avisado do próprio envio; o setor avisa todos os ativos + chefe (interno, e-mail, WhatsApp; link `/orgao/processo/:id`).
- Etapas padrão em código (`tipos/etapas-padrao.ts`): ADITIVO = Pedido → Reserva → Parecer → Autorização → Termo aditivo; RENOVACAO = Vantajosidade → Reserva → Parecer → Autorização → Termo de renovação. A etapa conclui quando uma peça é juntada com a chave dela (só a etapa ATUAL aceita); a última (resultado) conclui quando o termo é ligado ao processo. AVULSO não tem etapas.
- Cada etapa traz palavras para sugerir o setor que costuma fazê-la (`GET :id/destinos` → `sugerido`).

**Rotas novas** (`/api/processos`): `GET :id/destinos`, `POST :id/enviar`, `POST :id/receber`, `POST :id/devolver`, `POST :id/pecas`. `GET :id/tramitacao`, `/autos`, `/fluxo`, `/tarefas`, `/documentos` passam a responder com dados reais para esses três tipos (`tramitacao` traz também `pode_agir` e `pode_receber` para o usuário logado).

**Roteiro de verificação (depois do deploy).**
- Abrir um ADITIVO e conferir `GET :id/tramitacao`: `com_quem_esta` é quem abriu, `recebida: true`; `GET :id/fluxo` mostra PEDIDO como ATUAL.
- `POST :id/pecas` com `etapa: 'RESERVA'` → 400 (não é a atual); com `etapa: 'PEDIDO'` → folha 1 e a etapa seguinte vira ATUAL.
- `POST :id/enviar` para um setor do órgão; com setor de outro órgão → 400; por usuário de outro setor → 403; o destino recebe o aviso e `POST :id/receber` libera juntar peças.
- `POST :id/devolver` volta para quem enviou. Processo de outro órgão → 404 em todas as rotas.
