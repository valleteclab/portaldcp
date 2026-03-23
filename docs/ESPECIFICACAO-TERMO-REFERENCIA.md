# ESPECIFICAÃ‡ÃƒO TÃ‰CNICA E FUNCIONAL DO SISTEMA
## Portal DCP â€” Plataforma de GestÃ£o de Compras PÃºblicas
**Documento para elaboraÃ§Ã£o de Termo de ReferÃªncia (TR) e Edital**
**AderÃªncia Ã  Lei nÂº 14.133/2021 â€” Nova Lei de LicitaÃ§Ãµes e Contratos**

---

# 1. APRESENTAÃ‡ÃƒO E VISÃƒO GERAL

O sistema Ã© uma plataforma web completa para gestÃ£o de compras pÃºblicas, licitaÃ§Ãµes, contratos e execuÃ§Ã£o orÃ§amentÃ¡ria, construÃ­da em estrita conformidade com a **Lei nÂº 14.133/2021**. Opera em modelo SaaS multi-tenant, onde cada Ã³rgÃ£o pÃºblico possui ambiente de dados completamente isolado, com configuraÃ§Ãµes, usuÃ¡rios, mÃ³dulos e permissÃµes prÃ³prias, acessÃ­veis pela internet sem necessidade de instalaÃ§Ã£o local.

A plataforma atende trÃªs perfis distintos de usuÃ¡rios, cada um com painel exclusivo:

| Painel | Quem usa | O que faz |
|--------|----------|-----------|
| Painel do Ã“rgÃ£o | Servidores pÃºblicos (pregoeiro, gestor, fiscal, almoxarife) | Conduz todo o ciclo de compras: planejamento, licitaÃ§Ã£o, contrato, execuÃ§Ã£o |
| Painel do Fornecedor | Empresas e profissionais liberais | LicitaÃ§Ãµes, propostas, contratos, ordens de fornecimento |
| Painel Admin | Administrador da plataforma | Ã“rgÃ£os, mÃ³dulos, catÃ¡logo e integraÃ§Ãµes |

---

# 2. STACK TECNOLÃ“GICA

| Componente | Tecnologia |
|------------|------------|
| Backend | Node.js 22 + NestJS 11 (TypeScript) |
| Frontend | Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui |
| Banco de Dados | PostgreSQL (multi-tenant por coluna orgao_id) |
| ORM | TypeORM com migrations versionadas |
| AutenticaÃ§Ã£o | JWT â€” 3 escopos: Admin, Ã“rgÃ£o/UsuÃ¡rio, Fornecedor |
| Tempo Real | WebSocket (Socket.IO) â€” Sala de Disputa EletrÃ´nica |
| InteligÃªncia Artificial | OpenAI GPT-4o / Anthropic Claude (configurÃ¡vel) |
| Email | SMTP prÃ³prio por Ã³rgÃ£o ou Resend |
| WhatsApp | Z-API / Chatwoot |
| Deploy | Cloud (Railway, VPS, Docker) |

---

# 3. MÃ“DULOS â€” FUNCIONALIDADES DETALHADAS

## 3.1. AUTENTICAÃ‡ÃƒO E SEGURANÃ‡A
- Login multiportal (Ã“rgÃ£o, Fornecedor, Admin) com JWT tipado e escopos distintos
- Login social Google (OAuth2) para fornecedores com seleÃ§Ã£o de Ã³rgÃ£o
- Reset de senha por e-mail com token de uso Ãºnico (1 hora de validade)
- Bloqueio por Ã³rgÃ£o: usuÃ¡rio de um Ã³rgÃ£o nÃ£o acessa dados de outro (multi-tenant)
- Guards por mÃ³dulo: decorator @RequireModule verifica se mÃ³dulo estÃ¡ habilitado para o Ã³rgÃ£o antes de qualquer endpoint
- Dupla verificaÃ§Ã£o: frontend filtra menus, backend rejeita requisiÃ§Ãµes nÃ£o autorizadas

**PÃ¡ginas:** /login, /orgao-login, /admin/login, /cadastro, /esqueci-senha, /resetar-senha/[token], /auth/google/*

---

## 3.2. Ã“RGÃƒOS E CONFIGURAÃ‡Ã•ES
- CRUD de Ã³rgÃ£os: nome, CNPJ, esfera (Municipal/Estadual/Federal), tipo (Prefeitura, CÃ¢mara, Autarquia), endereÃ§o, logotipo
- Setores e unidades: estrutura organizacional â€” departamentos e unidades orÃ§amentÃ¡rias
- Licenciamento modular: admin habilita/desabilita mÃ³dulos por Ã³rgÃ£o
- SMTP prÃ³prio por Ã³rgÃ£o: e-mail institucional para notificaÃ§Ãµes
- WhatsApp via Z-API com nÃºmero oficial do Ã³rgÃ£o
- CNPJ do Ã³rgÃ£o para integraÃ§Ã£o PNCP
- FormulÃ¡rio pÃºblico de solicitaÃ§Ã£o de acesso

**PÃ¡ginas:** /orgao/configuracoes, /admin/orgaos, /solicitar-acesso

---

## 3.3. USUÃRIOS E PERMISSÃ•ES (RBAC)

**Perfis:** ADMIN, PREGOEIRO, EQUIPE_APOIO

**PermissÃµes individuais granulares:**
- pode_aprovar_requisicoes â€” acesso Ã  fila de aprovaÃ§Ã£o do almoxarifado
- pode_cancelar_estornar â€” cancelar/estornar OFs e recebimentos
- pode_liberar_contratos â€” autorizar contratos aguardando liberaÃ§Ã£o
- pode_excluir_medicao â€” excluir boletins de mediÃ§Ã£o
- eh_fiscal_contrato â€” fiscal de contratos (acesso ao dossiÃª fiscal)
- pode_receber_patrimonio â€” aceite de bens permanentes no recebimento
- pode_gerenciar_os â€” gerenciar ordens de serviÃ§o

**Convites em massa:** admin envia convites por e-mail para mÃºltiplos usuÃ¡rios em lote.

---

## 3.4. FORNECEDORES â€” INTEGRAÃ‡ÃƒO RECEITA FEDERAL (CNPJ)

### Busca AutomÃ¡tica de CNPJ
Ao digitar o CNPJ, o sistema consulta automaticamente e preenche:
- RazÃ£o Social, Nome Fantasia
- SituaÃ§Ã£o Cadastral (Ativa, Baixada, Inapta, Nula, Suspensa), data de abertura
- EndereÃ§o completo (logradouro, nÃºmero, complemento, CEP, municÃ­pio, UF)
- CNAE principal + todos os CNAEs secundÃ¡rios
- Quadro de SÃ³cios e Administradores (QSA) â€” nome, CPF, qualificaÃ§Ã£o
- Porte (MEI, ME, EPP, Demais), capital social

**Bloqueio preventivo:** impede cadastro de empresas com CNPJ baixado, inapto ou nulo.
**Suporte a CPF:** fornecedores pessoa fÃ­sica (autÃ´nomos, profissionais liberais).

### Portal de Auto-Cadastro
- Registro pÃºblico com preenchimento automÃ¡tico por CNPJ
- NÃ­veis progressivos: NÃ­vel I (bÃ¡sico), NÃ­vel II (completo), NÃ­vel III (habilitaÃ§Ã£o SICAF)
- GestÃ£o de certidÃµes com controle de validade e alertas automÃ¡ticos

**PÃ¡ginas:** /cadastro, /fornecedor/cadastro-sicaf, /orgao/fornecedores, /admin/fornecedores

---

## 3.5. PLANEJAMENTO â€” DEMANDAS (DFD) E PCA

### Demandas (DFD)
- Documento de FormalizaÃ§Ã£o de Demanda por setor: descriÃ§Ã£o, justificativa, quantidade/valor estimado, prazo
- Fluxo: Rascunho â†’ Enviado â†’ Aprovado â†’ Consolidado no PCA

### PCA â€” Plano de ContrataÃ§Ãµes Anual
- CriaÃ§Ã£o anual com importaÃ§Ã£o de demandas aprovadas
- Itens com CATMAT/CATSER, unidade, quantidade, valor estimado
- ImportaÃ§Ã£o via CSV no formato padrÃ£o PNCP
- Fluxo: Rascunho â†’ Aprovado â†’ Publicado
- **Envio ao PNCP:** formataÃ§Ã£o e envio via API; controle de status (PENDENTE/ENVIADO/ERRO); reenvio automÃ¡tico em falha

**PÃ¡ginas:** /orgao/demandas, /orgao/pca

---

## 3.6. LICITAÃ‡Ã•ES

### Dados e ConfiguraÃ§Ã£o
- Modalidades: PregÃ£o EletrÃ´nico, ConcorrÃªncia, Dispensa, Inexigibilidade, PregÃ£o Presencial
- CritÃ©rios de julgamento: Menor PreÃ§o, Maior Desconto, Melhor TÃ©cnica e PreÃ§o
- Modos de disputa: Aberto, Fechado, Aberto-Fechado
- Tipo de disputa: Por item ou Por lote
- VÃ­nculo com PCA: itens importados do PCA aprovado

### Fase Interna e ElaboraÃ§Ã£o de Documentos
Upload e organizaÃ§Ã£o de documentos da fase interna:
- ETP (Estudo TÃ©cnico Preliminar)
- DFD (Documento de FormalizaÃ§Ã£o de Demanda)
- Pesquisa de PreÃ§os (mapa de preÃ§os)
- Edital e Minuta de Contrato
- Termo de ReferÃªncia (TR)
- Pareceres JurÃ­dicos
Fluxo de aprovaÃ§Ã£o interna antes da publicaÃ§Ã£o do edital.

### PublicaÃ§Ã£o e PNCP â€” INTEGRAÃ‡ÃƒO PNCP
- PublicaÃ§Ã£o no portal pÃºblico com transparÃªncia ativa
- Envio automÃ¡tico ao PNCP: dados da compra, itens, documentos, fases e resultados

### Esclarecimentos e ImpugnaÃ§Ãµes ao Edital
- Fornecedores registram pedidos; pregoeiro responde no prazo legal
- Respostas publicadas e notificadas automaticamente

### Propostas Comerciais
- Fornecedor envia valor unitÃ¡rio/total por item + documentos
- ClassificaÃ§Ã£o automÃ¡tica por menor preÃ§o; desclassificaÃ§Ã£o com justificativa

### Sala de Disputa EletrÃ´nica â€” TEMPO REAL (WebSocket)
Implementada com Socket.IO para comunicaÃ§Ã£o bidirecional em tempo real.

**Eventos WebSocket:**
| Evento | DescriÃ§Ã£o |
|--------|-----------|
| entrar_sessao | Participante recebe estado atual + histÃ³rico completo |
| iniciar_sessao | Pregoeiro abre a sessÃ£o pÃºblica |
| iniciar_disputa | AvanÃ§a para etapa de lances |
| iniciar_item | CronÃ´metro para item especÃ­fico |
| iniciar_todos_itens | Inicia todos os itens/lotes simultaneamente |
| iniciar_itens_selecionados | Pregoeiro seleciona quais itens iniciar |
| lance | Lance validado e ranking retransmitido em tempo real |
| mensagem_chat | ComunicaÃ§Ã£o pregoeiro â†” licitantes |
| encerrar_item | Encerra disputa com cronÃ´metro |
| encerrar_sessao | Encerra a sessÃ£o completa |

**Funcionalidades avanÃ§adas:**
- AnonimizaÃ§Ã£o total (Licitante 1, 2, 3...) â€” art. 17 da Lei 14.133/2021
- Alerta automÃ¡tico de 5% (regra de desempate â€” art. 61)
- ProrrogaÃ§Ã£o automÃ¡tica se houver lance nos Ãºltimos minutos
- Chat integrado para perguntas, convocaÃ§Ãµes e negociaÃ§Ãµes
- Monitor tÃ©cnico: conexÃµes, latÃªncia e status dos participantes
- CronÃ´metro independente por item ou por lote
- Descortinar identidade individual pelo pregoeiro

### Julgamento, HabilitaÃ§Ã£o, AdjudicaÃ§Ã£o e HomologaÃ§Ã£o
- Aceitabilidade de proposta; habilitaÃ§Ã£o documental; inabilitaÃ§Ã£o com convocaÃ§Ã£o do prÃ³ximo
- AdjudicaÃ§Ã£o e homologaÃ§Ã£o por item, lote ou global com registro de responsÃ¡vel e timestamp
- Resultado enviado ao PNCP automaticamente

**PÃ¡ginas:** /orgao/licitacoes/*, /orgao/sala-disputa, /orgao/disputa, /fornecedor/licitacoes, /fornecedor/sala-disputa, /licitacoes (pÃºblico)

---

## 3.7. CONTRATAÃ‡ÃƒO DIRETA (DISPENSAS E INEXIGIBILIDADES)
- Dispensa (art. 74) e Inexigibilidade (art. 74, I a VIII)
- Campos: fundamentaÃ§Ã£o legal, objeto, fornecedor, valor, justificativa, documentos de comprovaÃ§Ã£o
- Fluxo: CriaÃ§Ã£o â†’ AprovaÃ§Ã£o â†’ AdjudicaÃ§Ã£o â†’ HomologaÃ§Ã£o
- Envio ao PNCP quando exigido legalmente

---

## 3.8. CREDENCIAMENTO
- Editais para contrataÃ§Ãµes onde qualquer fornecedor que atenda requisitos pode ser contratado
- InscriÃ§Ã£o contÃ­nua; anÃ¡lise documental; aprovaÃ§Ã£o com geraÃ§Ã£o de contrato automÃ¡tica

---

## 3.9. ATAS DE REGISTRO DE PREÃ‡OS
- CriaÃ§Ã£o vinculada Ã  licitaÃ§Ã£o homologada; itens com saldos em litros/unidades/R$
- Controle de utilizaÃ§Ã£o por adesÃ£o (carona); vigÃªncia mÃ¡xima 1+1 ano (art. 84)
- Envio ao PNCP automaticamente

**PÃ¡ginas:** /orgao/atas, /atas, /atas/[id] (pÃºblico)

---

## 3.10. GESTÃƒO DE CONTRATOS

### CriaÃ§Ã£o Manual
- Tipo: Contrato, Nota de Empenho, Carta Contrato, Ordem de ServiÃ§o, Termo de AdesÃ£o, ARP
- Categoria: Compras, ServiÃ§os, Obras, ServiÃ§os de Engenharia, LocaÃ§Ã£o, AlienaÃ§Ã£o
- NumeraÃ§Ã£o automÃ¡tica: NNN/AAAA por Ã³rgÃ£o e ano
- Fluxo de liberaÃ§Ã£o: AGUARDANDO_LIBERACAO â†’ notificaÃ§Ã£o automÃ¡tica â†’ VIGENTE â†’ CONCLUIDO/RESCINDIDO
- HistÃ³rico completo: cada aÃ§Ã£o registrada com usuÃ¡rio, data e descriÃ§Ã£o

### ImportaÃ§Ã£o de Contratos via IA (PDF/Imagem) â€” INTEGRAÃ‡ÃƒO IA

Processo em 5 etapas:

**Etapa 1 â€” ExtraÃ§Ã£o de Texto do PDF:**
- Motor primÃ¡rio: pdfjs-dist (Mozilla PDF.js) â€” suporta PDFs complexos
- Fallback automÃ¡tico: pdf-parse
- ExtraÃ§Ã£o pÃ¡gina a pÃ¡gina

**Etapa 2 â€” AnÃ¡lise pelo LLM (GPT-4o / Claude):**
Prompt especializado em contratos administrativos pÃºblicos extrai automaticamente:
- Objeto do contrato ("tem por objeto...")
- CNPJ e RazÃ£o Social da empresa contratada
- Tipo do documento (CONTRATO, NOTA_EMPENHO, ORDEM_SERVICO, CARTA_CONTRATO etc.)
- Categoria (COMPRAS, SERVICOS, OBRAS, SERVICOS_ENGENHARIA, LOCACAO, ALIENACAO)
- Modalidade de execuÃ§Ã£o (ITEM_QUANTIDADE ou MEDICAO)
- Valor inicial e valor global
- Datas de assinatura e vigÃªncia (formato YYYY-MM-DD)
- NÃºmero do processo licitatÃ³rio e amparo legal
- TODOS os itens com: descriÃ§Ã£o (incluindo localizaÃ§Ã£o/destino), unidade, quantidade, valor unitÃ¡rio, meses e valor total
- Regras anti-alucinaÃ§Ã£o: IA retorna null para campos ausentes; nunca inventa dados

**Etapa 3 â€” Tratamento Robusto do JSON:**
- 3 estratÃ©gias em cascata para corrigir JSONs malformados pelo LLM
- ExtraÃ§Ã£o por regex como fallback final

**Etapa 4 â€” ValidaÃ§Ã£o de CNPJ:**
- CNPJ nÃ£o cadastrado? Consulta automÃ¡tica Ã  Receita Federal
- Oferece prÃ©-cadastro do fornecedor com dados jÃ¡ preenchidos

**Etapa 5 â€” RevisÃ£o e ConfirmaÃ§Ã£o:**
- FormulÃ¡rio editÃ¡vel com todos os dados extraÃ­dos
- UsuÃ¡rio revisa/corrige e confirma

### ImportaÃ§Ã£o via Portal da TransparÃªncia â€” INTEGRAÃ‡ÃƒO EXTERNA
- Importa contratos publicados no Portal da TransparÃªncia do Governo Federal
- Busca por chave PNCP ou nÃºmero; importa itens e fornecedor

### Modalidades de ExecuÃ§Ã£o Contratual

**ITEM_QUANTIDADE â€” Compras de Materiais:**
- Saldo por item: contratada âˆ’ empenhada âˆ’ entregue = disponÃ­vel
- Fluxo: RequisiÃ§Ã£o â†’ AprovaÃ§Ã£o â†’ OF â†’ Recebimento com NF â†’ Aceite
- FundamentaÃ§Ã£o: Art. 140

**MEDICAO â€” Obras e Engenharia:**
- Entidade EtapaCronograma: nÃºmero, descriÃ§Ã£o, percentual fÃ­sico, valor previsto, datas, percentual executado
- Entidade Medicao (Boletim): nÃºmero, perÃ­odo, valor medido/acumulado, percentual fÃ­sico, fiscal, aprovador, fotos, documentos
- Entidade ItemMedicao: percentual executado anterior/atual/acumulado por etapa
- Saldo = valor global âˆ’ valor medido acumulado aprovado
- FundamentaÃ§Ã£o: Art. 134 (cronograma) + Art. 140, I

**CONTINUADO â€” ServiÃ§os ContÃ­nuos:**
- Entidade AtestacaoMensal: mÃªs de referÃªncia, valor contratado, valor atestado, glosa, valor lÃ­quido, nota IMR (0-100), critÃ©rios IMR (JSON)
- IMR: critÃ©rios de qualidade configurÃ¡veis com glosa percentual por nÃ£o conformidade
- Unicidade: uma atestaÃ§Ã£o por contrato por mÃªs
- FundamentaÃ§Ã£o: Art. 106 Â§3Âº + IN SEGES nÂº 5/2017

**LICENCA â€” Software e Assinaturas:**
- Entidade LicencaControle: tipo (USUARIO, DISPOSITIVO, SITE, VOLUME, ASSINATURA), quantidade contratada vs. ativa, chave, URL do painel admin, data de expiraÃ§Ã£o
- Alertas automÃ¡ticos de expiraÃ§Ã£o
- FundamentaÃ§Ã£o: Art. 75, XVI

**ORDEM_SERVICO â€” Consultoria e TI:**
- Entidade OrdemServicoContrato: nÃºmero, escopo, mÃ©trica (UST/HORA/PF/UNIDADE), SLA, nota de qualidade
- Entidade BancoMetricas: total âˆ’ consumido âˆ’ reservado = disponÃ­vel
- Fluxo: ABERTA â†’ EM_EXECUCAO â†’ ENTREGUE â†’ EM_ACEITE â†’ ACEITA/REJEITADA
- FundamentaÃ§Ã£o: IN SGD/ME 94/2022 + Art. 75, IV "h"

### Termos Aditivos
- Tipos: PRORROGACAO, ACRESCIMO, SUPRESSAO, REAJUSTE, APOSTILAMENTO, RESCISAO, SUSPENSAO, OUTROS
- AtualizaÃ§Ã£o automÃ¡tica do valor global e datas do contrato
- Envio ao PNCP quando aplicÃ¡vel

### IntegraÃ§Ã£o PNCP â€” ServiÃ§o Especializado
- AutenticaÃ§Ã£o automÃ¡tica com renovaÃ§Ã£o de token em cache
- Credenciais configurÃ¡veis pelo admin (banco tem prioridade sobre variÃ¡veis de ambiente)
- Entidades sincronizadas: PCA, Compras, Contratos, Atas, Aditivos, Resultados
- Tabela PncpSync: registra status (PENDENTE/ENVIADO/ERRO), mensagem e dados transmitidos
- Mapeamento automÃ¡tico de modalidades e fases do sistema para os cÃ³digos PNCP
- Reprocessamento manual de erros; painel de monitoramento no admin

### Agente IA Analisador de Contratos â€” INTEGRAÃ‡ÃƒO IA
- Chatbot contextualizado com o contrato especÃ­fico
- Fiscal digita pergunta em linguagem natural â†’ IA responde com base nas clÃ¡usulas reais
- Exemplos: "Qual o prazo de entrega?", "Penalidades por atraso?", "Permite subcontrataÃ§Ã£o?"

**PÃ¡ginas:** /orgao/contratos/*, /orgao/contratos/importar-ia, /orgao/contratos/importar-portal-transparencia, /orgao/analisar-contrato, /orgao/agente-contratos, /fornecedor/contratos, /contratos (pÃºblico)

---

## 3.11. MEDIÃ‡Ã•ES DE CONTRATOS
- ImportaÃ§Ã£o de MediÃ§Ã£o via IA: upload de planilha/PDF â†’ IA extrai etapas, percentuais e valores automaticamente
- SolicitaÃ§Ã£o pelo fornecedor com perÃ­odo e documentos; atestaÃ§Ã£o ou devoluÃ§Ã£o pelo fiscal
- Assinatura digital integrada com Portal de Assinaturas
- HistÃ³rico completo de versÃµes (devoluÃ§Ãµes e revisÃµes)

**PÃ¡ginas:** /orgao/medicoes, /orgao/medicoes-v2, /fornecedor/medicoes, /assinar-medicao/[token]

---

## 3.12. ALMOXARIFADO E ORDENS DE FORNECIMENTO

### Itens do Contrato
- Tipo CONSUMO ou PERMANENTE; saldos em tempo real:
  - quantidade_contratada, quantidade_empenhada, quantidade_entregue, saldo_disponivel
- API de resumo financeiro e quantitativo por contrato

### RequisiÃ§Ãµes Internas
- Tipos: MATERIAL, SERVICO, ORDEM_SERVICO
- Reserva imediata de saldo ao criar a requisiÃ§Ã£o (impede dupla reserva concorrente)
- Status: RASCUNHO â†’ AGUARDANDO_AUTORIZACAO â†’ AUTORIZADA/NEGADA/DEVOLVIDA

### Sistema de AprovaÃ§Ã£o com Controle de AlÃ§adas
ConfiguraÃ§Ã£o de NÃ­veis (somente Admin da plataforma):

| Campo | DescriÃ§Ã£o |
|-------|-----------|
| nivel | NÃºmero de ordem (1, 2, 3...) |
| nome | Nome descritivo ("AprovaÃ§Ã£o Gestor") |
| valor_minimo / valor_maximo | Faixa de valor para este nÃ­vel |
| tipo_aprovador | QUALQUER_USUARIO / PERFIL_ESPECIFICO / USUARIO_ESPECIFICO |
| perfis_permitidos | Lista de perfis autorizados |
| usuarios_aprovadores_ids | IDs especÃ­ficos autorizados |
| bloquear_auto_aprovacao | Impede solicitante de aprovar prÃ³pria requisiÃ§Ã£o |
| exigir_justificativa_aprovacao | Obriga observaÃ§Ã£o ao aprovar |
| exigir_justificativa_negacao | Obriga motivo ao negar |
| notificar_email_aprovador | E-mail para aprovadores com requisiÃ§Ã£o pendente |

Fluxo: criaÃ§Ã£o (saldo reservado) â†’ notificaÃ§Ã£o ao aprovador â†’ verificaÃ§Ã£o de permissÃ£o por alÃ§ada â†’ aprovaÃ§Ã£o/negaÃ§Ã£o â†’ se aprovada: OF gerada automaticamente.

### Ordens de Fornecimento (OF)
- PDF gerado automaticamente com assinatura digital
- Envio ao fornecedor: e-mail automÃ¡tico + portal + WhatsApp (opcional)
- Status: GERADA â†’ ENVIADA â†’ EM_ATENDIMENTO â†’ ATENDIDA_PARCIAL/ATENDIDA â†’ CANCELADA
- EdiÃ§Ã£o, reenvio, estorno e cancelamento com controle de permissÃ£o

### Recebimento â€” Processo Completo em 5 Etapas

**Etapa 1 â€” Nota Fiscal enviada pelo Fornecedor:**
- Upload de XML de NF-e e/ou PDF no portal do fornecedor
- Para XML: extraÃ§Ã£o automÃ¡tica de produtos, valores, chave de acesso, datas, CNPJs
- Suporte a mÃºltiplas NFs por OF (entregas parciais ou separaÃ§Ã£o CONSUMO/PERMANENTE)

**Etapa 2 â€” Mapeamento Inteligente por IA â€” INTEGRAÃ‡ÃƒO IA:**
- MatchingIaService envia ao LLM os produtos do XML e os itens da OF
- IA retorna para cada produto: item_contrato_id correspondente, confianca (0-100%), justificativa textual
- ValidaÃ§Ã£o de valor: descarta correspondÃªncias com razÃ£o fora de 0,2x a 5x
- Filtragem: apenas itens com saldo pendente sÃ£o candidatos
- Fallback: se IA indisponÃ­vel, retorna mapeamento vazio para preenchimento manual
- Resultado salvo em mapeamento_ai para auditoria completa

**Etapa 3 â€” ConferÃªncia pelo Almoxarife:**
- RevisÃ£o do mapeamento sugerido (pode corrigir); quantidade conferida por item
- Aceite parcial ou registro de divergÃªncias

**Etapa 4a â€” Aceite do Almoxarifado (Recebimento ProvisÃ³rio):**
- Registro: nome, data, observaÃ§Ãµes
- Saldo: quantidade_entregue aumenta, quantidade_empenhada diminui

**Etapa 4b â€” Aceite do PatrimÃ´nio (bens permanentes):**
- SeparaÃ§Ã£o de responsabilidade: almoxarife = aceite quantitativo; responsÃ¡vel patrimÃ´nio = tombamento
- Campos: nÃºmero de tombamento, plaqueta, localizaÃ§Ã£o do bem
- Exige permissÃ£o pode_receber_patrimonio
- Aceite duplo obrigatÃ³rio para itens PERMANENTE

**Etapa 5 â€” Cancelamento e Estorno:**
- Cancelar (antes do aceite): reverte saldo empenhado; permite substituiÃ§Ã£o de NF
- Estornar (apÃ³s aceite): reverte baixa definitiva; retorna saldo; exige permissÃ£o especÃ­fica

### DossiÃª Fiscal â€” Pacote para Pagamento
Gerado automaticamente apÃ³s aceite concluÃ­do:
1. OF em PDF com assinatura digital
2. Nota(s) Fiscal(is) â€” XML e/ou PDF
3. Comprovante de Aceite â€” documento gerado automaticamente com dados do aceite e assinatura
4. Anexos do fiscal â€” laudos, fotos, relatÃ³rios adicionais (upload pelo fiscal)

Painel do fiscal: lista OFs por contratos onde Ã© fiscal; status dos documentos; download ZIP; notificaÃ§Ã£o automÃ¡tica.

**PÃ¡ginas:** /orgao/almoxarifado/*, /orgao/fiscal/dossie, /fornecedor/ordens, /admin/configuracoes-aprovacao

---

## 3.13. ORDENS DE SERVIÃ‡O (CONTRATOS DE TI E CONSULTORIA)
- OS vinculadas a contratos ORDEM_SERVICO com etapas de execuÃ§Ã£o
- MÃ©tricas: UST, Horas, Pontos de FunÃ§Ã£o, Demanda Fixa
- SLA em dias com alerta de extrapolaÃ§Ã£o; nota de qualidade (0-100) no aceite

**PÃ¡ginas:** /orgao/ordens-servico, /orgao/requisicoes-os

---

## 3.14. CONTROLE DE FROTA E COMBUSTÃVEL

### Cadastro de VeÃ­culos
Placa, modelo, marca, ano, cor, chassi, hodÃ´metro, tipo de combustÃ­vel, lotaÃ§Ã£o (setor responsÃ¡vel).

### Contratos de CombustÃ­vel
- MÃºltiplos itens por tipo: Diesel Comum, Diesel S-10, Gasolina Aditivada, Etanol
- PreÃ§o por litro, quantidade contratada em litros, saldo em litros e em R$
- ImportaÃ§Ã£o automÃ¡tica de contratos cadastrados no mÃ³dulo de Contratos (itens em LITRO)

### RequisiÃ§Ãµes e AutorizaÃ§Ãµes
- Gestor cria autorizaÃ§Ã£o: veÃ­culo, combustÃ­vel, quantidade, posto, validade
- Token Ãºnico e QR Code gerados para cada autorizaÃ§Ã£o

### Portal do Posto â€” Acesso por Credencial (Sem Login com Senha)
- Frentista acessa link seguro (slug Ãºnico do posto) pelo celular
- Visualiza autorizaÃ§Ãµes pendentes para o posto
- Preenche hodÃ´metro, litros efetivos, tipo de combustÃ­vel
- Tira foto do comprovante pela cÃ¢mera â†’ confirma â†’ baixa automÃ¡tica no saldo

### Portal do Servidor/Vereador â€” Acesso por Credencial (Sem Login)
- Acesso via slug personalizado para consultar saldo e histÃ³rico do veÃ­culo

**PÃ¡ginas:** /orgao/frota/*, /frota/posto/[slug], /frota/vereador, /frota/vereador/[slug], /frota/req/[token]

---

## 3.15. PORTAL DE ASSINATURAS DIGITAIS
- Documentos: OF, Contratos, MediÃ§Ãµes, Documentos Avulsos
- Fluxo: link de assinatura â†’ OTP por e-mail â†’ assinatura registrada com nome, e-mail, IP, data/hora
- MÃºltiplos signatÃ¡rios em cadeia (fiscal â†’ gestor â†’ contratada)
- QR Code no rodapÃ© + pÃ¡gina pÃºblica /validar-documento/[codigo] para verificaÃ§Ã£o por terceiros

**PÃ¡ginas:** /orgao/portal-assinaturas, /assinar-medicao/[token], /assinar-documento/[token], /validar-documento/[codigo]

---

## 3.16. CATÃLOGO DE MATERIAIS E SERVIÃ‡OS
- SincronizaÃ§Ã£o CATMAT/CATSER do Governo Federal (compras.gov.br)
- CatÃ¡logo prÃ³prio do Ã³rgÃ£o para padronizaÃ§Ã£o interna
- ImportaÃ§Ã£o via CSV em massa

**PÃ¡ginas:** /admin/catalogo

---

## 3.17. NOTIFICAÃ‡Ã•ES MULTICANAL
- In-app: badge com contador no header; painel com lista; marcar como lida
- Eventos notificados: contrato criado/liberado/prÃ³ximo vencimento, requisiÃ§Ã£o aprovada/negada, OF gerada, recebimento aceito, mediÃ§Ã£o aprovada, OS aceita
- E-mail: SMTP do Ã³rgÃ£o ou Resend
- WhatsApp: Z-API com nÃºmero do Ã³rgÃ£o

---

## 3.18. RELATÃ“RIOS E DASHBOARDS GERENCIAIS

### Dashboard Principal
Contratos por status, prÃ³ximos do vencimento (30/60/90 dias), requisiÃ§Ãµes pendentes, licitaÃ§Ãµes em andamento, OFs em aberto.

### RelatÃ³rio de EficiÃªncia de LicitaÃ§Ãµes
NÃºmero e taxa de fracasso/deserÃ§Ã£o, economia gerada (estimado âˆ’ homologado), tempo mÃ©dio por fase.

### RelatÃ³rio Financeiro de Contratos
Curva de execuÃ§Ã£o financeira, comparativo contratado vs. executado vs. saldo, por categoria e fornecedor.

### RelatÃ³rio de Almoxarifado
Consumo por perÃ­odo/setor/contrato, Curva ABC de materiais, saldo por item.

**PÃ¡ginas:** /orgao/relatorios

---

## 3.19. INTEGRAÃ‡ÃƒO WHATSAPP E CHAT
- Credenciais Z-API configuradas por Ã³rgÃ£o
- NotificaÃ§Ãµes automÃ¡ticas para fornecedores e servidores
- Webhook para recebimento de mensagens; registro de conversas
- IntegraÃ§Ã£o Chatwoot para atendimento complexo

---

## 3.20. ADMINISTRAÃ‡ÃƒO DA PLATAFORMA (ADMIN)
- GestÃ£o de Ã³rgÃ£os: CRUD, ativaÃ§Ã£o, mÃ³dulos habilitados
- Monitoramento em tempo real: painel de sessÃµes de disputa ativas em todos os Ã³rgÃ£os
- ConfiguraÃ§Ã£o de alÃ§adas de aprovaÃ§Ã£o por Ã³rgÃ£o
- PNCP: credenciais e monitoramento de sincronizaÃ§Ãµes
- CatÃ¡logo: CATMAT/CATSER; sincronizaÃ§Ã£o e importaÃ§Ã£o
- Convites em massa para fornecedores
- IA: seleÃ§Ã£o de provider (OpenAI/Anthropic), modelo e chave de API

**PÃ¡ginas:** /admin/login, /admin/monitoramento, /admin/orgaos, /admin/usuarios, /admin/modulos, /admin/fornecedores, /admin/solicitacoes, /admin/pncp, /admin/catalogo, /admin/convites, /admin/ia, /admin/configuracoes-aprovacao

---

# 4. INTEGRAÃ‡Ã•ES EXTERNAS â€” RESUMO CONSOLIDADO

| IntegraÃ§Ã£o | Finalidade | MÃ³dulos que utilizam |
|------------|------------|----------------------|
| Receita Federal / API CNPJ | Consulta automÃ¡tica: razÃ£o social, endereÃ§o, QSA, CNAE, situaÃ§Ã£o cadastral | Fornecedores, ImportaÃ§Ã£o de Contratos IA |
| PNCP â€” Portal Nacional de ContrataÃ§Ãµes | Envio obrigatÃ³rio de PCA, licitaÃ§Ãµes, contratos, atas e aditivos | LicitaÃ§Ãµes, Contratos, Atas, PCA |
| OpenAI GPT-4o / Anthropic Claude | ExtraÃ§Ã£o de PDFs, matching de NFs, anÃ¡lise de contratos, extraÃ§Ã£o de mediÃ§Ãµes | ImportaÃ§Ã£o de Contratos IA, Matching NF, MediÃ§Ãµes IA, Agente Analisador |
| Portal da TransparÃªncia (Gov. Federal) | ImportaÃ§Ã£o de contratos jÃ¡ publicados | Contratos |
| Z-API / Chatwoot (WhatsApp Business) | NotificaÃ§Ãµes e chat com fornecedores e servidores | NotificaÃ§Ãµes, Chat |
| Resend / SMTP institucional | NotificaÃ§Ãµes, convites, OTPs, reset de senha | Todos os mÃ³dulos |
| CATMAT/CATSER (compras.gov.br) | CatÃ¡logo padronizado de materiais e serviÃ§os | CatÃ¡logo, Itens de licitaÃ§Ã£o |
| Google OAuth2 | Login social para fornecedores | AutenticaÃ§Ã£o |
| pdfjs-dist + pdf-parse | ExtraÃ§Ã£o de texto de PDFs para a IA | ImportaÃ§Ã£o via IA |

---

# 5. FLUXOS DE TRABALHO COMPLETOS

## 5.1. PregÃ£o EletrÃ´nico â€” Fluxo Completo

```
PLANEJAMENTO
  DFD aprovado â†’ PCA â†’ envio ao PNCP
FASE INTERNA
  CriaÃ§Ã£o da licitaÃ§Ã£o â†’ upload ETP/TR/Edital/Pesquisa de PreÃ§os â†’ aprovaÃ§Ã£o interna
PUBLICAÃ‡ÃƒO
  PublicaÃ§Ã£o â†’ envio automÃ¡tico ao PNCP â†’ prazo para impugnaÃ§Ãµes e esclarecimentos
PROPOSTA
  Fornecedores enviam propostas â†’ classificaÃ§Ã£o por menor preÃ§o
DISPUTA EM TEMPO REAL (WebSocket)
  SessÃ£o aberta â†’ licitantes conectados (anonimizados) â†’ lances em tempo real
  â†’ prorrogaÃ§Ã£o automÃ¡tica â†’ chat â†’ monitor tÃ©cnico â†’ negociaÃ§Ã£o pÃ³s-disputa
JULGAMENTO
  Aceitabilidade â†’ habilitaÃ§Ã£o â†’ adjudicaÃ§Ã£o e homologaÃ§Ã£o â†’ PNCP
CONTRATAÃ‡ÃƒO
  Contrato criado automaticamente â†’ liberaÃ§Ã£o â†’ vigÃªncia iniciada
```

## 5.2. ExecuÃ§Ã£o Contratual â€” Compras (ITEM_QUANTIDADE)

```
REQUISIÃ‡ÃƒO
  Setor preenche requisiÃ§Ã£o â†’ saldo reservado imediatamente no contrato
APROVAÃ‡ÃƒO
  NotificaÃ§Ã£o ao aprovador elegÃ­vel (por faixa de valor) â†’ aprovaÃ§Ã£o/negaÃ§Ã£o
ORDEM DE FORNECIMENTO
  OF gerada automaticamente â†’ PDF â†’ envio ao fornecedor (e-mail + portal + WhatsApp)
RECEBIMENTO
  Fornecedor envia NF-e (XML) â†’ IA extrai produtos â†’ IA faz matching com itens da OF
  â†’ almoxarife revisa mapeamento â†’ aceite almoxarifado â†’ aceite patrimÃ´nio (se PERMANENTE)
  â†’ saldo definitivamente baixado no contrato
DOSSIE FISCAL
  DossiÃª gerado automaticamente (OF + NF + Comprovante de Aceite)
  â†’ notificaÃ§Ã£o ao fiscal â†’ download ZIP â†’ encaminha ao financeiro
```

## 5.3. ImportaÃ§Ã£o de Contrato via IA

```
UPLOAD â†’ pdfjs-dist extrai texto â†’ LLM analisa com prompt especializado
â†’ JSON estruturado (objeto, CNPJ, valores, datas, TODOS os itens)
â†’ Parser corrige JSON malformado
â†’ CNPJ nÃ£o cadastrado? Consulta Receita Federal â†’ prÃ©-cadastro automÃ¡tico
â†’ FormulÃ¡rio editÃ¡vel para revisÃ£o â†’ ConfirmaÃ§Ã£o â†’ Contrato + itens criados
```

## 5.4. Controle de Frota â€” Abastecimento

```
Gestor cria autorizaÃ§Ã£o (veÃ­culo, combustÃ­vel, quantidade, posto) â†’ QR Code gerado
Frentista acessa portal via QR Code no celular (sem login com senha)
â†’ preenche hodÃ´metro/litros/tipo â†’ tira foto do comprovante â†’ confirma
â†’ saldo do contrato atualizado automaticamente
```

---

# 6. SEGURANÃ‡A E CONTROLES

| Controle | DescriÃ§Ã£o |
|----------|-----------|
| Multi-tenant | Isolamento total por orgao_id; verificado no backend em todas as requisiÃ§Ãµes |
| JWT tipado | Tokens distintos por tipo de usuÃ¡rio com orgao_id no payload |
| Guards por mÃ³dulo | @RequireModule verifica habilitaÃ§Ã£o do mÃ³dulo para o Ã³rgÃ£o |
| RBAC granular | PermissÃµes individuais alÃ©m dos perfis |
| Anti-auto-aprovaÃ§Ã£o | ConfigurÃ¡vel por Ã³rgÃ£o â€” impede que solicitante aprove sua prÃ³pria requisiÃ§Ã£o |
| Reserva imediata de saldo | Saldo empenhado na criaÃ§Ã£o, impedindo dupla reserva concorrente |
| Auditoria completa | HistÃ³rico de contratos, OFs e recebimentos com usuÃ¡rio + timestamp |
| OTP para assinatura | CÃ³digo de uso Ãºnico para validar identidade na assinatura digital |
| Senhas hash | bcrypt |
| HTTPS | ComunicaÃ§Ã£o criptografada em trÃ¢nsito |

---

# 7. REQUISITOS TÃ‰CNICOS NÃƒO FUNCIONAIS

| Requisito | EspecificaÃ§Ã£o |
|-----------|---------------|
| Disponibilidade | 24/7 em ambiente Cloud de alta disponibilidade |
| Responsividade | Desktop, Tablet e Smartphone; Mobile-First para portais de fornecedor e frentista |
| Tempo Real | WebSocket para sala de disputa; atualizaÃ§Ãµes de lance em tempo real |
| Escalabilidade | Backend stateless; banco com Ã­ndices otimizados; arquitetura horizontal |
| Manutenibilidade | TypeScript com tipagem estrita; migrations versionadas |
| Backup | PostgreSQL com backup automÃ¡tico em nuvem |
| InternacionalizaÃ§Ã£o | PortuguÃªs Brasileiro; datas no fuso de BrasÃ­lia |
| Conformidade legal | Lei 14.133/2021; IN SEGES nÂº 5/2017; IN SGD/ME nÂº 94/2022 |

---

*Documento gerado para fins de elaboraÃ§Ã£o de Termo de ReferÃªncia.*
*Baseado em anÃ¡lise completa do cÃ³digo-fonte do sistema Portal DCP.*
