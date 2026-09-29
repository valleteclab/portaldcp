# Construtor de fluxo da fase interna

> 28/09/2026. PR 1 de 2: **o motor** (backend). A PR 2 faz a tela de arrastar e soltar sobre esta API.
> Base: o protótipo aprovado pelo dono (`referencia-construtor.html`: desenho, conferência da lei e teste), o plano da tramitação (`PLANO-FLUXO-TRAMITACAO.md`, §5 e §12) e a análise de especialista de 28/09.

## 1. O que muda, em uma frase

O modelo de fluxo da fase interna deixa de ser uma lista fixa de etapas e vira um **desenho (grafo)** que o órgão monta: caixas e setas, com etapas criadas pelo próprio órgão ("Secretário de Finanças aprova"), perguntas que o sistema responde sozinho ("valor acima de R$ 50 mil?") e devolução para correção.

**Nada muda para o que já existe.** Cada modelo e cada processo em andamento ganha o desenho equivalente ao caminho que já tinha, e o motor de sempre (etapas, tarefas, com quem está, sugestão de envio, travas e permissão por etapa) continua lendo a mesma lista de etapas. Agora essa lista é **a projeção do desenho**.

## 2. O desenho (grafo)

Código: `backend/src/fase-interna/fluxo/grafo-fluxo.ts` (tipos, normalização, conversão e projeção) e `motor-grafo.ts` (execução, conferência e simulação). As duas são funções puras, testadas em `*.spec.ts`.

### Caixas (nós)

| Tipo | O que é | Como conclui no processo |
|---|---|---|
| `inicio` | onde começa (um só) | — |
| `etapa` | um setor faz. Produz de 0 a *n* peças do catálogo (`pecas`, com os códigos reais: `DFD`, `ETP`, `TR`, `PP`, `DO`, `RAG`, `PJ`, `MCI`, `AA`…) | com peças: todas prontas; sem peça: **despacho** (vira folha nos autos) |
| `aprovacao` | alguém aprova ou **devolve**. Pode produzir peça (parecer, autorização) | igual à etapa. Também pode devolver |
| `condicao` | pergunta com saídas `sim` e `não` | o sistema responde ao chegar; se for `manual`, quem conduz responde |
| `fim` | onde termina | — |

Campos de uma caixa de etapa ou aprovação:
- `nome`;
- `responsavel` (`{ papel, setor_id, usuario_id }`, o mesmo que o modelo já usava);
- `prazo_dias_uteis`;
- `pecas`;
- `ia_rascunho`, `aprovacao_interna` e `dispensavel_por_ato` (parecer);
- `x` e `y`, a posição no desenho.

Uma caixa com peças do catálogo vira a etapa do sistema daquelas peças: a tela da etapa, as travas da lei e o fundamento vêm junto. Cada etapa do sistema entra **uma vez só** no desenho. Uma caixa **sem peça** é uma etapa criada pelo órgão, com código `U_…`, e conclui por despacho registrado, pelo mesmo mecanismo das etapas de registro da F1/F3a.

### Setas (arestas)

| Rótulo | Uso |
|---|---|
| `normal` | segue |
| `sim` / `nao` | saídas da condição (a entrada aceita "não") |
| `devolve` | da aprovação para quem corrige |

### Condição

A condição é uma expressão simples sobre os dados do processo, ou `manual`:

| `campo` | `operador` | valor |
|---|---|---|
| `valor_total_estimado` | `>`, `>=`, `<`, `<=`, `entre` | `valor` (e `valor_ate` no `entre`) |
| `tipo_contratacao` | `igual`, `diferente`, `em` | `valor` ou `valores` (COMPRA, SERVICO, OBRA…) |
| `modalidade` | `igual`, `diferente`, `em` | idem |
| `fundamento_legal` | `contem`, `igual` | texto |
| `manual` | — | quem conduz responde sim ou não |

A condição é avaliada **quando o processo chega a ela**. A resposta é gravada no estado do fluxo e no histórico, e **não muda mais** se o dado mudar depois. Para refazer a pergunta, volta-se a etapa, com motivo. Sem o dado (por exemplo, sem valor estimado ainda), a pergunta fica disponível para quem conduz responder.

## 3. Como o processo anda

É a mesma regra do protótipo:
- **Paralelo e junção.** Uma caixa fica disponível quando alguma seta normal chega nela e não há caixa anterior ainda pendente que possa chegar. O paralelo espera todas; a saída não escolhida de uma condição não bloqueia.
- **Condição.** Só a saída da resposta segue. As caixas que só a outra saída alcançava **saem do processo**, como uma etapa desligada.
- **Devolve.** A aprovação devolve à caixa-alvo. A etapa devolvida reabre, **sem** marcar "a revisar" o que está no meio. Quando ela conclui de novo, o processo **volta direto para quem devolveu**. Sem seta `devolve`, a aprovação devolve às caixas imediatamente anteriores (as condições no caminho são atravessadas).

Implementação:
- **Processo real (derivado).** `etapasVivas` e a extensão de `etapasDaFaseInterna` (condição, ramo, devolução) calculam o estado a partir das peças, dos despachos, das respostas e das devoluções.
- **Teste do editor (por eventos).** `simular` aplica a mesma regra no desenho.
- **Equivalência.** O teste de equivalência (`motor-grafo.spec.ts`) percorre os dois lados passo a passo e compara o que está disponível. Ele achou um defeito do protótipo: conforme a ordem das setas, a autorização começava antes do parecer. A simulação passou a usar o mesmo critério do processo real: uma caixa anterior ainda pode chegar se ainda é alcançável a partir do início.

Estado novo no processo (`fluxos_processo_fase_interna`), gravado por delta atômico como as demais marcas (padrão da #535):
- `decisoes`: as respostas das condições;
- `retornos`: as devoluções em curso.

A devolução se encerra quando quem devolveu conclui.

## 4. Conferência (`conferirGrafo`)

Os **erros** bloqueiam o "Ativar". Os **avisos** não bloqueiam.
- **Estrutura:**
  - um início e ao menos um fim;
  - tudo alcançável a partir do início;
  - toda caixa tem para onde ir;
  - a condição tem saída `sim` e saída `não`, e só elas;
  - `devolve` só sai de aprovação;
  - não há ciclo nas setas normais (para voltar e corrigir, usa-se `devolve`);
  - a etapa criada pelo órgão tem quem faz. Na etapa do sistema sem responsável, é só aviso: no modo simples, quem conduz faz.
- **Lei** (`requisitos_legais_fluxo`, pela validação de sempre sobre a projeção):
  - peças exigidas;
  - dependências mínimas por ancestrais, ignorando `devolve` (pesquisa, reserva e parecer antes da autorização; autorização antes do aviso; o que já valia para a licitação);
  - dispensa por ato;
  - aprovação da demanda;
  - **ramo a ramo** (até 8 perguntas): em cada combinação de respostas, a etapa exigida não pode ser pulada, e a anterior exigida acontece sempre que a posterior acontece. Exemplo: "Quando 'Tem cotação?' = não, o processo pula 'Pesquisa de preços'".
- **Quadro da lei** (`lei[]`): cada requisito com ✓ ou ✗, para a tela.

## 5. Rascunho × versão ativa

| Tabela | Para quê |
|---|---|
| `modelos_fluxo_fase_interna.grafo` | o desenho da **versão ativa**. `modelos_fluxo_etapas` continua sendo gravada, como projeção |
| `rascunhos_modelo_fluxo` | um rascunho por órgão e tipo (`orgao_id` nulo = o do sistema). Pode ficar inválido: a conferência aponta o que falta |
| `versoes_modelo_fluxo` | histórico: cada versão ativada, com o desenho, quem ativou, quando e a origem (`CONSTRUTOR`, `TELA_ANTIGA`, `RESTAURAR`, `CONFIGURACAO`, `MIGRACAO`) |

- O **"Ativar"** confere e publica a nova versão.
- **Processos novos** usam a versão ativa. **Processos em andamento** mantêm o retrato (como hoje). Quem faz, prazo, IA, aprovação interna e o liga/desliga das opcionais seguem o modelo vigente, como desde a F1.
- **Restaurar o modelo padrão** e **modelos prontos** carregam o **rascunho**. Nada é ativado sozinho.
- **Modelos prontos** (`modelos-prontos-fluxo.ts`):
  - "Câmara — Portaria 089" (o do sistema);
  - "Câmara — Portaria 089, com controle interno";
  - "Prefeitura — Finanças aprova acima de R$ 50 mil" (contratação direta: condição de valor, aprovação de Finanças e devolução à pesquisa).
- **A tela antiga** (`/orgao/configuracoes/fluxo`) continua funcionando: o PUT de etapas é aplicado no desenho. Os campos vão para a caixa do mesmo código. Uma dependência trocada reescreve as setas, e a seta que sai de uma condição mantém o sim/não. Quem ficou sem saída vai ao fim. Cada gravação vira uma versão.

## 6. Compatibilidade (migração de boot, idempotente)

`ModeloFluxoService.migrarParaGrafo`, na fila única de migrações (`executarMigracaoDeBoot`):
1. Cada modelo sem grafo (do sistema e dos órgãos) ganha o **grafo equivalente**:
   - cada etapa vira caixa;
   - cada dependência vira seta, na mesma ordem;
   - a etapa sem dependência sai do início, e a que ninguém espera vai ao fim;
   - a diligência do parecer vira `devolve` para quem fez as peças que ele examina, e a devolução da autorização vira `devolve` para as minutas;
   - as etapas desligadas continuam como caixas desligadas.

   A versão atual entra no histórico. **A versão não muda.**
2. O retrato de cada processo ganha o grafo equivalente. **As etapas do retrato não são tocadas.** Etapa sem `raiz` é tratada como no modelo antigo, sempre alcançável, e o motor calcula exatamente o que calculava.

`projetarGrafo(grafoDeEtapas(etapas))` devolve as mesmas etapas, e o motor dá o mesmo resultado com o modelo antigo e com o convertido. Isso é provado em `grafo-fluxo.spec.ts` e, de ponta a ponta, pelas e2e da fase interna rodando sem mudança.

## 7. API (para a PR 2)

Base: `/api/fluxo-fase-interna/construtor`. O órgão vem sempre do token. `:tipo` = `DISPENSA`, `INEXIGIBILIDADE` ou `LICITACAO`.

**Permissões:**
- Leitura, conferência e teste: qualquer usuário do órgão.
- Escrita (rascunho, ativar, restaurar, modelos prontos, IA): administrador do órgão ou login do órgão. Os demais recebem 403.
- `?orgao_id=` de outro órgão: **404**.
- Fornecedor: 403. Anônimo: 401.
- Admin da plataforma: `?orgao_id=` ou `?sistema=true` (o modelo do sistema).

| Método e rota | O que faz |
|---|---|
| `GET /:tipo` | tela: `ativo` (versão, grafo, quem ativou), `rascunho` (ou `null`), `conferencia` (do que está em edição), `catalogo` (etapas e peças, campos de condição), `requisitos`, `papeis`, `setores`, `usuarios`, `modelos_prontos`, `processos_em_andamento`, `ia_disponivel` |
| `PUT /:tipo/rascunho` | salva o rascunho: `{ grafo, nome?, descricao?, aprovacao_demanda?, exigir_posse_pecas? }`. Devolve a tela e `ajustes` (o que a normalização corrigiu) |
| `DELETE /:tipo/rascunho` | descarta o rascunho |
| `POST /:tipo/conferir` | confere sem gravar (corpo como o do PUT; sem corpo, o rascunho): `{ ok, erros, avisos, lei, ajustes }` |
| `POST /:tipo/ativar` | ativa o rascunho. **400** com `erros`, `avisos` e `lei` quando não confere; 409 sem rascunho |
| `GET /:tipo/versoes` | histórico `[{ versao, nome, origem, ativado_por_nome, ativado_em, ativa }]` |
| `GET /:tipo/versoes/:versao` | uma versão, com o grafo |
| `POST /:tipo/restaurar` | rascunho = modelo do sistema |
| `GET /modelos-prontos?tipo=` | lista |
| `POST /:tipo/modelos-prontos/:codigo` | rascunho = modelo pronto |
| `POST /:tipo/simular` | "Testar": `{ grafo?, estado?, acao, dados? }` e devolve `{ estado, log, erro, ativos, fim }`. Nada é gravado |
| `POST /:tipo/gerar-com-ia` | `{ descricao, salvar? }`: a IA monta o grafo, que vira **rascunho** e nunca é ativado. Devolve a tela, `ia: { modelo, ajustes, grafo, conferencia }` e 503 sem IA |

**No processo** (`/api/fase-interna/:licitacaoId/...`; outro órgão recebe 403):

| Rota | O que faz |
|---|---|
| `POST etapas/:codigo/concluir` | igual a antes. Na **condição**: `{ resposta: "sim" \| "nao", texto? }` |
| `POST etapas/:codigo/devolver` | só aprovação: `{ motivo, para?: [códigos] }` (padrão: as setas `devolve`; sem elas, as anteriores). Quem conduz ou o responsável pela aprovação. O despacho vai aos autos |
| `POST etapas/:codigo/reabrir` | na condição, desfaz a resposta |
| `GET etapas` | cada passo ganha `tipo_no`, `decisao` (condição) e `retorno` (devolvida por…) quando o modelo veio do desenho |

### Exemplos

Salvar um rascunho com a condição e a etapa criada pelo órgão:

```json
PUT /api/fluxo-fase-interna/construtor/DISPENSA/rascunho
{
  "grafo": {
    "nos": [
      { "id": "inicio", "tipo": "inicio", "nome": "Início", "x": 40, "y": 40 },
      { "id": "PESQUISA", "tipo": "etapa", "nome": "Pesquisa de preços", "pecas": ["PP"], "x": 520, "y": 280 },
      { "id": "q_valor", "tipo": "condicao", "nome": "Valor acima de R$ 50 mil?", "x": 760, "y": 280,
        "condicao": { "campo": "valor_total_estimado", "operador": ">", "valor": 50000 } },
      { "id": "fin", "tipo": "aprovacao", "nome": "Secretário de Finanças aprova", "x": 1000, "y": 160,
        "pecas": [], "responsavel": { "setor_id": "<id do setor Finanças>" }, "prazo_dias_uteis": 2 },
      { "id": "RESERVA", "tipo": "etapa", "nome": "Reserva orçamentária", "pecas": ["DO"], "x": 1240, "y": 280 }
    ],
    "arestas": [
      { "de": "PESQUISA", "para": "q_valor" },
      { "de": "q_valor", "para": "fin", "rotulo": "sim" },
      { "de": "q_valor", "para": "RESERVA", "rotulo": "não" },
      { "de": "fin", "para": "RESERVA" },
      { "de": "fin", "para": "PESQUISA", "rotulo": "devolve" }
    ]
  }
}
```

A normalização completa a caixa "fin" com `codigo: "U_FIN"` e `conclusao: "REGISTRO"`, e a pergunta com `codigo: "C_Q_VALOR"`. A pesquisa ganha as peças da etapa (`PP`, `MCP`), a tela e o fundamento.

Testar (a cada clique, o editor manda o `estado` devolvido na ação anterior):

```json
POST /api/fluxo-fase-interna/construtor/DISPENSA/simular
{ "acao": { "tipo": "iniciar" }, "dados": { "valor_total_estimado": 80000 } }
→ { "estado": { "ativos": ["DFD"], "feitos": ["inicio"], "retornos": {}, "decisoes": {}, "fim": false },
    "log": ["Começou: Início", "Chegou para Requisitante: Formalizar a demanda (DFD)"],
    "ativos": [{ "id": "DFD", "nome": "…", "tipo": "etapa", "quem": "Requisitante", "pode_devolver": false }] }

{ "estado": { … }, "acao": { "tipo": "devolver", "no": "fin" } }
→ log: ["Finanças devolveu: Secretário de Finanças aprova", "Voltou para Compras: Pesquisa de preços e mapa"]
```

Ações: `iniciar`, `concluir { no }`, `responder { no, resposta }` e `devolver { no, para? }`. Uma ação inválida devolve `erro` e o estado inalterado. Um desenho com erro de estrutura devolve `erro: "Ajuste o desenho antes de testar"`.

Devolver no processo:

```json
POST /api/fase-interna/:id/etapas/U_FIN/devolver
{ "motivo": "Refazer a pesquisa com três cotações", "para": ["PESQUISA"] }
```

## 8. Decisões

- **Projeção em vez de motor novo.** O grafo é a fonte, e as etapas projetadas são o que o motor executa. Assim, `etapasDaFaseInterna`, tarefas, `proximo-destino`, sugestão de envio, posse, travas e permissão por etapa passaram a ler o grafo sem ser reescritos. Isso reduz o risco para o que já funciona.
- **Uma etapa do sistema por caixa.** Peças de duas etapas numa caixa (ETP e TR, por exemplo) viram ajuste: fica a primeira, e o órgão separa em duas caixas. Cada etapa do sistema tem tela, trava e tarefa próprias.
- **A condição vira passo** (`conclusao: CONDICAO`). Assim a pergunta manual ganha tarefa para quem conduz, e a automática aparece concluída, com a resposta, na linha do tempo.
- **A diligência do parecer e a devolução da autorização continuam** com os mecanismos de sempre (tabela `diligencias` e devolução ao agente). As setas `devolve` convertidas as descrevem no desenho. O novo "devolver" serve a qualquer aprovação desenhada, e às do sistema também.
- **O despacho de devolução** vai aos autos como folha ("Devolva-se a … para correção: …").
- **Responsável "chefe do setor requisitante"**: não entrou nesta PR. Fica pendente, porque depende de o processo guardar o setor requisitante.

## 9. Testes

- Unitários (`grafo-fluxo.spec.ts`, `motor-grafo.spec.ts`):
  - conversão equivalente, nos três tipos e em modelo editado;
  - o mesmo resultado do motor com o modelo antigo e com o grafo;
  - normalização;
  - tela antiga sobre o grafo;
  - condição automática e manual;
  - paralelo e junção;
  - devolução e retorno;
  - conferência de estrutura e de lei, ramo a ramo;
  - **equivalência simulação × processo real**.
- E2E novo `test/construtor-fluxo-motor.e2e-spec.ts`: rascunho → conferir → ativar → processo novo com "Finanças aprova" e condição por valor → devolução e retorno; processo antigo inalterado, inclusive o retrato legado migrado; condição manual; simular sem gravar; IA mockada; isolamento de cada endpoint.
- E2E existentes da fase interna, rodadas uma por vez (lista na PR).
