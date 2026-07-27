# UX da Fase Interna com IA — plano (referência: ContratAI)

> Origem: teste manual do usuário (26/07/2026) + análise do ContratAI (prints e frames do vídeo em `docs/framesvideo/`).
> Decisão de produto: **papéis separados como padrão** (requisitante → compras → autoridade), **com "modo solo" previsto** (órgão pequeno onde uma pessoa faz tudo).

## O que o ContratAI faz bem (extraído dos prints/frames)

1. **Documento derivado de perguntas, não editado.** O TR nasce de um formulário guiado em linguagem humana: "1.1 Qual o tipo de bem?" (radio), "1.3 Haverá SRP?" (sim/não + justificativa), "8.6.1 Haverá garantia?" — perguntas fechadas que **resolvem decisões jurídicas** e viram cláusulas. Botão verde fixo **"Gerar TR"** monta o documento completo no final.
2. **"Melhorar com IA" por campo.** Usuário escreve 1 linha (até "me ajude") → IA expande em texto formal fundamentado. Com "Mostrar raciocínio", "Sugerir alteração" e **ditado por voz** (microfone).
3. **"Orientações" por pergunta** — helper contextual discreto em cada item.
4. **Modo Conversacional** — o agente conduz: consolida o contexto ("Contexto consolidado" + "Lacunas que preciso validar"), propõe plano de trabalho, pede aprovação e então preenche o documento. Mantém contexto entre DFD → ETP → Preços → Riscos → TR (chips no topo do "Fluxo Planejamento").
5. **Análise de documento com score** — upload → % de conformidade + checklist por inciso com estados Crítico/Atenção/Sugestão/Conforme e explicação por item.
6. **Pesquisa de preços como relatório formal** — fontes do PNCP em tabela (órgão/UF, data, valores, fornecedor/CNPJ), exporta Word/PDF.
7. **Produto organizado por AGENTES** (sidebar: Agentes, Fluxo Planejamento, Pesquisa de Preços, Análise de Documentos, Parecer Jurídico) — não por módulos administrativos.

## Nosso posicionamento (a vantagem que eles NÃO têm)

ContratAI é uma ferramenta de **documentos** (entra texto, sai Word/PDF). O Portal DCP é o **processo**: o documento nasce dentro do processo eletrônico, com dados reais (demanda, PCA, itens de catálogo, pesquisa de preços com PNCP, limites vigentes) e segue SOZINHO para divulgação → disputa → contrato → PNCP. A meta não é copiar o ContratAI — é ter a MESMA facilidade de entrada com o processo inteiro por trás:

> **"Eles geram o documento. Nós geramos o documento e ele vira contratação."**

## Roadmap de incrementos

### UX-1 (FEITO 26/07/2026) — Correções do teste manual
Um assistente só por tela (Copiloto oculto onde há painel embutido); fix do pulo de scroll (4 chats); header do editor enxuto; **"Gerar documento com IA"** (todas as seções vazias de uma vez, com progresso).

### UX-2 (FEITO 26/07/2026) — "Melhorar com IA" por seção + Orientações
No editor seccionado: botão **"✨ Melhorar com IA"** em cada seção (expande texto curto/rascunho em texto formal fundamentado usando o contexto do processo; substitui o conteúdo da seção, auto-save) + **"? Orientações"** por seção (mostra o placeholder/orientação da seção como helper, não só como placeholder que some ao digitar).

### UX-3 — MODO ESTRUTURADO (paridade com o coração do ContratAI)
Roteiro de perguntas por tipo de documento (começar pelo TR, depois ETP/DFD):
- Schema de perguntas em `lib/fase-interna/roteiros/{tipo}.ts`: perguntas fechadas (radio/sim-não com cláusulas prontas parametrizáveis, ex.: % de comprovação técnica), abertas (com "Melhorar com IA") e condicionais (SRP=sim → sub-perguntas da ARP).
- Respostas salvas em `dados_estruturados.respostas` (novo namespace, coexiste com as seções).
- **"Gerar documento"**: deriva TODAS as seções das respostas (IA compõe usando respostas + dados do processo). O editor seccionado vira a tela de REVISÃO.
- Pré-preenchimento automático do que o sistema já sabe (objeto/itens/valores da demanda; SRP da licitação; modalidade).

### UX-4 — MODO CONVERSACIONAL (o agente conduz)
Chat que faz as perguntas do roteiro UMA A UMA (mesmo schema do UX-3 — dois modos, um roteiro), consolida contexto, aponta lacunas, propõe plano e preenche mediante aprovação. Mantém contexto entre documentos (DFD → ETP → PP → riscos → TR) — nosso "Fluxo Planejamento" é o próprio processo.

### UX-5 — Análise de conformidade com score visual
Já temos `buscarConformidade` (checklist por inciso). Elevar para o padrão ContratAI: análise POR IA do conteúdo (não só presença de campo), score %, estados Crítico/Atenção/Sugestão/Conforme com explicação, na aba Análise do painel e no PDF. Vale também para documentos ANEXADOS (upload → análise), útil para o parecer jurídico.

### UX-CO — MODO CO-WORK / COPILOTO (decisão do usuário 26/07/2026: "monta todo o processo e já deixa sugerido")
O "colega de trabalho digital": a partir da demanda aprovada (ou da porta única), o sistema **prepara o processo inteiro sozinho** e entrega tudo SUGERIDO para o humano revisar e aprovar — a responsabilidade continua com o servidor, mas o trabalho braçal some. Viável HOJE porque todas as peças existem:

1. **Criar o processo** da demanda (ponte já implementada: itens + vínculo + DFD automático);
2. **Pesquisa de preços automática**: `pesquisaPrecosAgentService.executar(licitacaoId, { autoAprovar: true })` — o agente já busca cotações REAIS no PNCP/Painel de Preços e monta o documento PP com fontes (obrigatório nº 2 do art. 72 pronto com dados de verdade — o ContratAI não tem isso dentro do processo);
3. **Rascunhos IA dos documentos**: ETP/TR/autorização gerados seção a seção (mesma lógica do "Gerar documento com IA", executada no backend via IaModule);
4. **Entrega no cockpit**: instrução do art. 72 ~100% rascunhada, com selo claro "🤖 SUGERIDO — revise e aprove" em cada item; a autoridade só revisa a autorização e aprova; o botão Divulgar acende quando o humano validar.

Fluxo assíncrono (a pesquisa de preços leva minutos): o modal "Iniciar contratação" ganha a opção "🤖 Preparar tudo automaticamente"; o cockpit mostra o progresso da preparação (preços → documentos → pronto p/ revisão) e notifica ao concluir. Papéis respeitados: no modo padrão o copiloto prepara e NOTIFICA cada papel para revisar sua parte; no modo solo, a mesma pessoa revisa tudo em sequência.

### UX-6 — Porta única "Iniciar uma contratação" + modo solo
Entrada única em linguagem humana ("O que você precisa? Quanto custa? Para quando?") que decide o caminho (demanda→processo, com PCA ou justificativa art. 12 §1º) — já temos a ponte demanda→processo; falta a entrada conversacional. **Papéis**: no modo padrão, cada etapa notifica o papel seguinte; no **modo solo** (config do órgão ou usuário com todos os papéis), a mesma pessoa avança tudo sem trocar de tela.

### UX-7 — Consolidação das 2 UIs de fase interna
Aposentar a navegação duplicada (dossiê × wizard) quando UX-3/4 estiverem no ar — o wizard de perguntas vira O caminho, o editor seccionado vira a revisão.

<<<<<<< Updated upstream
=======
## Benchmark: processo administrativo REAL (Câmara de Mansidão/BA — Dispensa 002/2026)

Usuário forneceu os autos completos de uma dispensa real (PDF, 2 partes; texto extraído em análise de 26/07/2026). Fluxo documental identificado e mapeamento:

1. **Capa/números/portarias de nomeação** → capa automática dos autos ✅; portarias adicionadas ao checklist art. 72 como opcional (tipo DP, Art. 8º) ✅
2. **DFD** (setor, necessidade, natureza, modalidade sugerida, gestor/fiscal, **campo "Necessidade do ETP: necessário/dispensado + hipóteses tipificadas do art. 75"**) → nosso DFD cobre o núcleo; enriquecer via Modelos de documento; **ACHADO: oferecer hipóteses prontas no "não se aplica" do ETP** (hoje é justificativa livre)
3. **Solicitação de pesquisa ao setor de compras** → tramitação/fluxos de aprovação (existentes e agora encaixados)
4. **Pesquisa de preços** (responsável, fontes, similares, metodologia, mapa, valor) → cobertura completa ✅ (agente PNCP)
5. **Justificativa de dispensa do ETP/riscos nos autos** → é exatamente o nosso "não se aplica" com justificativa ✅ (validação do desenho)
6. **TR** completo → ✅
7. **Disponibilidade orçamentária pelo setor contábil** → tipo DO no checklist + fluxo de aprovação com etapa "Setor Contábil"
8. **Aviso com TR anexo** → aviso+PNCP ✅; **pendência: anexar o TR como documento adicional da compra no PNCP**

Pendências deste benchmark: (a) hipóteses tipificadas no "não se aplica" do ETP; (b) TR anexo ao aviso no PNCP; (c) seções extras do DFD via modelo padrão (natureza, gestor/fiscal, avaliação do ETP).

### Parte 02 (fase externa → contrato → publicações) — analisada 27/07/2026

9. **Edital/Aviso com anexos** (modelo de proposta, declaração conjunta, minuta de contrato) → aviso ✅; anexos como modelos: parcial
10. **Publicação no DO do Legislativo** (3 dias úteis, proposta por e-mail) → nossa dispensa eletrônica é superior (proposta digital, sigilo, lances); PNCP ✅; DO municipal é externo — **pendência: gerar EXTRATO pronto p/ colar no DO** (dispensa+contrato, como no processo real)
11. **Declaração Conjunta do fornecedor** (8 declarações) → 6 já existiam na proposta digital; **custos trabalhistas (III) e responsabilidade pela proposta (IV) adicionadas em 27/07/2026** ✅ (obrigatórias no envio)
12. **Habilitação (certidões) nos autos** → cadastro/credenciamento do fornecedor ✅; anexar certidões do vencedor aos autos: parcial
13. **Despacho ao CONTROLE INTERNO + parecer de conformidade → ratificação** → mapear como fluxo de aprovação (etapa "Controle Interno") — o motor já suporta
14. **Termo de dispensa → ratificação → homologação/adjudicação → autorização** (atos da autoridade em PDF) → temos julgamento+homologação+ata; **pendência: gerar os ATOS FORMAIS em PDF nos autos** (termo de dispensa, homologação)
15. **Contrato com fiscal designado por portaria** → termo automático + assinatura eletrônica ✅ (superior); designação do fiscal na cláusula ✅ (fiscal_responsavel)
16. **Extrato de dispensa e de contrato no DO** → ver item 10

Pendências parte 02: (d) extrato DO pronto (dispensa+contrato); (e) atos formais em PDF (termo de dispensa/homologação); (f) certidões do vencedor anexadas aos autos; (g) anexos-modelo no aviso.

>>>>>>> Stashed changes
## Decisões de arquitetura

- **Um roteiro, dois modos**: o schema de perguntas do UX-3 alimenta tanto o formulário (estruturado) quanto o agente (conversacional). Nunca duplicar o conhecimento.
- **IA sempre com os dados do processo** no prompt (objeto, itens, valores, modalidade, demanda, PCA) — é a nossa vantagem sobre ferramenta de documento avulso.
- **Rascunho é rascunho**: toda geração marca revisão pendente; a responsabilidade é do servidor (aviso explícito, como já feito no UX-1).
