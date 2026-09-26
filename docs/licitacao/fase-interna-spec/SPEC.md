# PortalDCP — Módulo Fase Interna da Contratação Direta (Dispensa)

Especificação para implementação no PortalDCP. Base real: autos do PA 139/2025 / Dispensa 029/2025 da Câmara Municipal de Luís Eduardo Magalhães (184 folhas).

As telas de referência estão em `mockups/*.dc.html`. São **referência visual**, não código para copiar: usam um runtime próprio do canvas (`support.js`, `<sc-for>`, `{{ }}`). Leia o HTML para extrair layout, campos, textos e estados. Implemente no stack e nos componentes que o PortalDCP já usa.

---

## 0. Antes de codar

1. Leia o repositório: stack, estrutura de pastas, ORM/migrations, autenticação, perfis de usuário, integração PNCP existente e módulo de dispensa eletrônica existente.
2. Mapeie o que já existe contra as entidades da seção 2. Reaproveite. Não duplique Processo, Órgão, Fornecedor ou Usuário se já existirem.
3. Proponha um plano de migração curto (quais tabelas novas, quais colunas novas) e só então implemente.
4. Trabalhe em branch própria e por fases (seção 7). Rode os testes a cada fase.

---

## 1. Objetivo

Conduzir a fase interna de uma contratação direta por dispensa (Lei 14.133/2021, arts. 72 e 75) como uma **máquina de estados** em que:

- cada etapa produz um **documento** com responsável, data, número de folha e assinatura;
- a etapa seguinte só abre quando a anterior está assinada;
- três **portões** automáticos bloqueiam o avanço quando há problema;
- um **motor de conformidade** cruza as peças entre si antes da publicação no PNCP;
- cada pessoa entra no sistema e cai direto na **sua tarefa**.

---

## 2. Modelo de dados

Nomes sugeridos; adapte à convenção do repositório.

**Processo**
- id, orgao_id, numero_pa (ex. 139/2025), numero_dispensa (ex. 029/2025), exercicio
- objeto (texto), unidade_requisitante_id, agente_contratacao_id
- fundamento_legal (enum: `ART75_I`, `ART75_II`, … — **campo único**, fonte da verdade para todas as peças)
- valor_estimado (decimal), orcamento_sigiloso (bool), justificativa_sigilo (texto)
- item_pca_id
- etapa_atual (enum, seção 3), status (`rascunho` | `em_andamento` | `publicado` | `cancelado`)
- criado_em, atualizado_em

**ItemDemanda**
- id, processo_id, numero (01, 02…), descricao, unidade, quantidade, codigo_catser (obrigatório)

**Documento**
- id, processo_id, tipo (enum: `DFD`, `ETP`, `TR`, `PESQUISA_PRECOS`, `CI_ORCAMENTO`, `INFO_ORCAMENTARIA`, `DESPACHO_AUTORIZACAO`, `RELATORIO_AGENTE`, `MINUTA_AVISO`, `MINUTA_CONTRATO`, `PARECER_JURIDICO`, `AVISO_PUBLICADO`, …)
- versao, conteudo (JSON estruturado por seções + HTML renderizado), status (`rascunho` | `assinado` | `substituido` | `anulado`)
- folha_inicial, folha_final (numeração sequencial dos autos, atribuída na assinatura)
- data_documento (preenchida pelo sistema na assinatura, nunca digitada)
- substitui_documento_id (para versões; a anterior vira `substituido`, nunca some)

**Assinatura**
- id, documento_id, usuario_id, papel (ex. Presidente, 1º Secretário), assinado_em, hash_conteudo

**Tarefa**
- id, processo_id, documento_id (opcional), responsavel_usuario_id ou responsavel_setor_id
- tipo, titulo, descricao, prazo, status (`aberta` | `concluida` | `cancelada`), origem (`etapa` | `diligencia` | `achado` | `sistema`)

**Cotacao** (pesquisa de preços)
- id, processo_id, fornecedor_nome, cnpj, valor_mensal, valor_implantacao, valor_total, data_emissao, validade_ate, arquivo_id

**ParametroPesquisa** (art. 23, §1º)
- id, processo_id, inciso (I–V), consultado (bool), data_consulta, resultado (texto), evidencia_arquivo_id

**PesquisaPrecos** (resumo)
- processo_id, metodo (`MENOR` | `MEDIA` | `MEDIANA`), justificativa_metodo (obrigatória), justificativa_escolha_fornecedores (obrigatória quando houver cotação direta)

**ReservaOrcamentaria**
- id, processo_id, unidade_orcamentaria, programa, projeto_atividade, elemento_despesa, fonte, lei_ldo_id (FK para tabela única de leis)
- linhas por exercício: exercicio, valor, situacao (`reservado` | `previsao`)

**LimiteDispensa** (tabela por exercício)
- exercicio, inciso, valor, ato_normativo (ex. Decreto 12.343/2024 → inciso II = R$ 125.451,15 para 2025)

**Regra / Achado** (motor de conformidade)
- Regra: codigo, descricao, severidade (`BLOQUEIO` | `ATENCAO`), etapa_em_que_roda
- Achado: id, processo_id, regra_codigo, mensagem, evidencias (lista de {documento_id, folha, trecho}), status (`aberto` | `resolvido` | `justificado`), justificativa, resolvido_por, resolvido_em

**Diligencia**
- id, parecer_documento_id, documento_alvo_id, descricao, status; cria uma Tarefa para o responsável pelo documento-alvo

---

## 3. Máquina de estados

| # | Etapa | Responsável | Documento gerado | Condição para avançar |
|---|---|---|---|---|
| 1 | Demanda | Requisitante | DFD | DFD assinado; vínculo ao PCA; todos os itens com CATSER |
| 2 | ETP e riscos | Requisitante | ETP | Incisos obrigatórios do art. 18 §2º preenchidos (I, IV, VI, VIII, XIII); análise de riscos presente |
| 3 | Termo de Referência | Requisitante | TR | TR assinado |
| 4 | Pesquisa de preços | Compras | Mapa + certidão | Portão A (limite/fracionamento); ≥3 cotações válidas ou justificativa; método e escolha de fornecedores justificados |
| 5 | Reserva orçamentária | Contabilidade | Informação orçamentária | Reserva emitida para o exercício corrente |
| 6 | Autorização | Mesa Diretora | Despacho | Portão B (checklist art. 72); assinaturas exigidas pelo regimento |
| 7 | Minutas e parecer | Agente + Procuradoria | Relatório, minuta do aviso, minuta do contrato, parecer | Parecer assinado; diligências resolvidas |
| 8 | Conformidade e publicação | Agente | Aviso publicado | Portão C (zero achados `BLOQUEIO` abertos); prazo mínimo de divulgação |

Regras gerais:
- Ao concluir uma etapa, o sistema cria automaticamente as tarefas da próxima.
- Diligência do parecer devolve o processo para a etapa do documento-alvo **sem perder** o que já foi assinado depois; ao sanar, volta para a Procuradoria.
- Nenhuma data de documento é digitada: vem do momento da assinatura.
- Toda transição fica em log de auditoria (quem, quando, de/para).

---

## 4. Portões e regras do motor de conformidade

Implemente as regras como funções puras `(processo, documentos) -> Achado[]`, registradas numa lista, fáceis de testar isoladamente. Cada achado aponta evidências com documento e folha.

**Portão A — Limite e fracionamento (etapa 4)**
- `LIM-01` BLOQUEIO: soma das dispensas do mesmo órgão, mesmo exercício e mesmo ramo (classe CATSER) + esta dispensa > limite do inciso em `LimiteDispensa`.
- `LIM-02` ATENÇÃO: consumo acima de 80% do limite.

**Portão B — Autos completos para autorização (etapa 6)**
- `A72-I` a `A72-VIII`: cada inciso do art. 72 mapeado a documentos. V e VI ficam como "fase externa" e não bloqueiam.

**Portão C — Antes de publicar (etapa 8)** — casos reais encontrados nos autos da Dispensa 029/2025:
- `ENQ-01` BLOQUEIO: fundamento legal (art. 75, inciso) divergente entre documentos. Todos os modelos devem ler `processo.fundamento_legal`; a regra ainda varre o texto de peças editadas manualmente procurando "art. 75, inciso X" / "art. 75, X".
- `VINC-01` BLOQUEIO: minuta cita número de PA ou de dispensa diferente do processo (regex de `nº \d+/\d{4}` perto de "Processo Administrativo" / "Dispensa").
- `MARCA-01` BLOQUEIO: ETP ou TR contém "similar ou superior", "ou equivalente" ou nome de marca cadastrada sem justificativa marcada como art. 41, I.
- `PRECO-01` ATENÇÃO: valor estimado igual ao valor de uma única cotação e método ≠ mediana/média sem justificativa.
- `PRECO-02` ATENÇÃO: cotação com `validade_ate` anterior à data prevista de publicação.
- `PRECO-03` ATENÇÃO: cotação emitida há mais de 6 meses.
- `CRONO-01` ATENÇÃO: documento com data anterior ao documento que o solicitou (ex. informação orçamentária antes da CI).
- `LEI-01` ATENÇÃO: números de lei (LDO/LOA/PPA) diferentes entre despacho, informação orçamentária e parecer. Prevenção: usar sempre `lei_ldo_id`.
- `EXERC-01` ATENÇÃO: reserva do exercício N e publicação/contrato previstos para N+1 → cria tarefa para a Contabilidade.
- `DUP-01` ATENÇÃO: dois documentos do mesmo tipo ativos (ex. relatório do agente juntado duas vezes com textos diferentes).
- `ASS-01` BLOQUEIO: documento sem data ou com assinaturas faltantes.
- `PRAZO-01` BLOQUEIO: janela de propostas com menos de 3 dias úteis (art. 75, §3º). Usar calendário de feriados do órgão.

Achado `ATENÇÃO` pode ser marcado como "justificado" com texto obrigatório; a justificativa vai para os autos.

---

## 5. Telas (ver `mockups/`)

| Arquivo | Tela | Perfil |
|---|---|---|
| `Tarefas.dc.html` | Caixa de tarefas (tela inicial) | Todos; exemplo do agente |
| `DFD.dc.html` | Formulário do DFD | Requisitante |
| `ETP.dc.html` | Editor do ETP por seções do art. 18 + assistente de IA | Requisitante |
| `Pesquisa.dc.html` | Pesquisa de preços, parâmetros do art. 23, limite | Compras |
| `Reserva.dc.html` | Informação orçamentária por exercício | Contabilidade |
| `Autorizacao.dc.html` | Autorização no celular (390 px) | Mesa Diretora |
| `Parecer.dc.html` | Autos + roteiro de análise + diligências | Procuradoria |
| `Conformidade.dc.html` | Portão C e publicação | Agente |
| `Main.dc.html` | Painel do processo | Agente / gestão |
| `Fluxo.dc.html` | Diagrama de raias (documentação, não é tela) | — |

Pontos de UX obrigatórios:
- Tela inicial de cada usuário = suas tarefas abertas, ordenadas por prazo.
- Formulários com listas vindas de tabelas (dotação, lei, PCA, CATSER), sem digitação livre desses campos.
- Autosave em rascunho; versões com histórico.
- No parecer, clicar num achado ou diligência abre o documento na folha e destaca o trecho.
- Botão de publicar desabilitado com contagem de bloqueios.

---

## 6. Assistente de IA no ETP

- Entrada: DFD + seção atual do ETP.
- Funções: gerar rascunho da seção; detectar indicação de marca; checar coerência entre seções (cada requisito da necessidade aparece na solução e no TR); apontar incisos obrigatórios vazios.
- Sugestões nunca são aplicadas sem clique do usuário; o texto aceito fica registrado como editado pelo usuário.
- Use a integração de LLM que o PortalDCP já tiver. Se não houver, deixe atrás de uma interface (`AssistenteETP`) com implementação stub.

---

## 7. Ordem de implementação

1. **Modelo e máquina de estados**: entidades, migrations, transições com guardas, log de auditoria, testes das transições.
2. **Documentos e assinatura**: versões, numeração de folhas na assinatura, data automática, geração do PDF dos autos.
3. **Tarefas**: criação automática por etapa, caixa de tarefas.
4. **Telas por perfil**: DFD → ETP → TR → Pesquisa → Reserva → Autorização → Parecer.
5. **Motor de conformidade**: regras da seção 4 com testes unitários usando os casos do PA 139/2025 como fixtures (cada regra deve disparar com o dado real e não disparar com o dado corrigido).
6. **Publicação**: ligar a etapa 8 à integração PNCP existente.
7. **Assistente de IA** no ETP.

## 8. Critérios de aceite

- Não é possível publicar com achado `BLOQUEIO` aberto.
- Mudar `fundamento_legal` do processo atualiza todas as minutas geradas por modelo.
- Uma dispensa que ultrapasse o limite do ramo no exercício é barrada na etapa 4.
- O PDF dos autos sai com folhas numeradas na ordem de assinatura.
- Todos os casos da seção 4 têm teste automatizado.
