# Portal DCP — Documentação Completa de Funcionalidades

**Portal de Compras Públicas**  
Sistema de gestão de licitações, contratos e compras públicas conforme Lei 14.133/2021.

---

## 1. Visão Geral

| Aspecto | Tecnologia |
|---------|------------|
| **Backend** | NestJS 11, TypeORM, PostgreSQL |
| **Frontend** | Next.js 16, React 19, Tailwind 4, shadcn/ui |
| **Autenticação** | JWT (Admin, Órgão/Usuário, Fornecedor) |
| **Comunicação** | REST API, WebSocket (Sala de Disputa) |
| **Arquitetura** | Multi-tenant (órgão como tenant) |

---

## 2. Módulos do Sistema

### 2.1 Autenticação (Auth)

| Item | Descrição |
|------|-----------|
| **Propósito** | Login e geração de tokens JWT |
| **Funcionalidades** | Login Admin, Login Órgão, Login Fornecedor (CPF/CNPJ ou email), perfil do usuário, reset de senha |
| **Endpoints** | `POST /auth/login/admin`, `POST /auth/login/orgao`, `POST /auth/login/fornecedor`, `POST /auth/login/fornecedor/email`, `GET /auth/me` |
| **Páginas** | `/login`, `/orgao-login`, `/admin/login`, `/cadastro`, `/esqueci-senha`, `/resetar-senha/[token]` |

---

### 2.2 Órgãos (Orgaos)

| Item | Descrição |
|------|-----------|
| **Propósito** | Cadastro e gestão de órgãos públicos |
| **Funcionalidades** | CRUD de órgãos, login, registro, módulos habilitados, PNCP, setores, unidades, solicitações de acesso, logo, configuração de email (SMTP/IMAP), WhatsApp |
| **Entidades** | `Orgao`, `Setor`, `UnidadeOrgao`, `SolicitacaoAcesso` |
| **Endpoints** | `POST /orgaos`, `GET /orgaos`, `GET /orgaos/me`, `GET /orgaos/:id`, `PUT /orgaos/:id`, `GET /orgaos/:id/modulos`, `PUT /orgaos/:id/modulos`, `GET /orgaos/:id/setores`, `POST /orgaos/:id/logo` |
| **Páginas** | `/orgao/configuracoes`, `/admin/orgaos`, `/solicitar-acesso` |

---

### 2.3 Usuários (Usuarios)

| Item | Descrição |
|------|-----------|
| **Propósito** | Gestão de usuários dos órgãos |
| **Funcionalidades** | CRUD de usuários, módulos por usuário, permissões específicas |
| **Entidades** | `Usuario` |
| **Roles** | `ADMIN`, `PREGOEIRO`, `EQUIPE_APOIO` |
| **Permissões** | `pode_aprovar_requisicoes`, `pode_cancelar_estornar`, `pode_liberar_contratos`, `pode_excluir_medicao`, `eh_fiscal_contrato`, `pode_receber_patrimonio`, `pode_gerenciar_os` |
| **Endpoints** | `POST /usuarios`, `GET /usuarios`, `GET /usuarios/me`, `GET /usuarios/:id`, `PUT /usuarios/:id`, `PUT /usuarios/:id/modulos` |
| **Páginas** | `/admin/usuarios` |

---

### 2.4 Fornecedores

| Item | Descrição |
|------|-----------|
| **Propósito** | Cadastro e gestão de fornecedores |
| **Funcionalidades** | CRUD, consulta CNPJ, cadastro via CNPJ, documentos, habilitação, credenciamento, convites em massa |
| **Entidades** | `Fornecedor`, `FornecedorDocumento`, `FornecedorSocio`, `FornecedorAtividade` |
| **Endpoints** | `GET /fornecedores/consultar-cnpj/:cnpj`, `POST /fornecedores/cadastrar-cnpj`, `GET /fornecedores`, `GET /fornecedores/:id`, `PUT /fornecedores/:id`, `POST /fornecedores/:id/documentos`, `PUT /fornecedores/:id/aprovar`, `POST /fornecedores/registro`, `POST /fornecedores/login` |
| **Páginas** | `/cadastro`, `/fornecedor/cadastro-sicaf`, `/orgao/fornecedores`, `/admin/fornecedores` |

---

### 2.5 Licitações (Licitacoes)

| Item | Descrição |
|------|-----------|
| **Propósito** | Gestão de licitações conforme Lei 14.133/2021 |
| **Módulo** | `LICITACOES` |
| **Funcionalidades** | CRUD, fases (interna, edital, disputa), publicação de edital, início/encerramento de disputa |
| **Entidades** | `Licitacao` |
| **Endpoints** | `POST /licitacoes`, `GET /licitacoes`, `GET /licitacoes/:id`, `PUT /licitacoes/:id`, `PUT /licitacoes/:id/avancar-fase`, `PUT /licitacoes/:id/publicar-edital`, `PUT /licitacoes/:id/iniciar-disputa`, `PUT /licitacoes/:id/encerrar-disputa` |
| **Páginas** | `/orgao/licitacoes`, `/orgao/licitacoes/nova`, `/orgao/licitacoes/[id]`, `/licitacoes`, `/fornecedor/licitacoes` |

---

### 2.6 Itens de Licitação (Itens)

| Item | Descrição |
|------|-----------|
| **Propósito** | Itens/lotes da licitação |
| **Funcionalidades** | CRUD, adjudicação, homologação, importação do PCA |
| **Entidades** | `ItemLicitacao` |
| **Endpoints** | `POST /itens`, `GET /itens/licitacao/:licitacaoId`, `GET /itens/:id`, `PUT /itens/:id`, `PUT /itens/:id/adjudicar`, `PUT /itens/:id/homologar`, `POST /itens/importar-pca` |
| **Páginas** | Dentro de `/orgao/licitacoes/[id]` |

---

### 2.7 Propostas e Lances

| Item | Descrição |
|------|-----------|
| **Propósito** | Propostas comerciais e lances na disputa |
| **Funcionalidades** | Envio de propostas, classificação, desclassificação, vencedora; registro de lances em tempo real |
| **Entidades** | `Proposta`, `PropostaItem`, `Lance`, `MensagemChat` |
| **Páginas** | `/orgao/licitacoes/[id]/propostas`, `/fornecedor/propostas`, `/fornecedor/propostas/[id]`, sala de disputa |

---

### 2.8 Sessão e Disputa (Sessao / Disputa V2)

| Item | Descrição |
|------|-----------|
| **Propósito** | Controle da sessão de pregão e sala de disputa em tempo real |
| **Módulo** | `DISPUTA` |
| **Funcionalidades** | Criar sessão, iniciar, encerrar, lances em lote, adjudicação, habilitação, anonimização, chat, monitor técnico |
| **Entidades** | `SessaoDisputa`, `EventoSessao`, `MapeamentoAnonimo` |
| **Endpoints** | `POST /sessao/:licitacaoId`, `GET /sessao/:id`, `PUT /sessao/:id/iniciar`, `PUT /sessao/:id/encerrar`, `POST /sessao/:id/lance-lote`, `PUT /sessao/:id/adjudicar/:itemId`, `GET /disputa-v2/sessao/:sessaoId`, `POST /disputa-v2/sessao/:sessaoId/lance` |
| **Páginas** | `/orgao/licitacoes/[id]/sessao`, `/orgao/sala-disputa`, `/orgao/disputa`, `/fornecedor/sala-disputa`, `/fornecedor/disputa` |

---

### 2.9 Fase Interna

| Item | Descrição |
|------|-----------|
| **Propósito** | Documentos e aprovações da fase interna da licitação |
| **Funcionalidades** | Documentos, submissão, aprovação, importação de processo |
| **Entidades** | `DocumentoFaseInterna` |
| **Endpoints** | `POST /fase-interna/:licitacaoId/documento`, `GET /fase-interna/:licitacaoId/documentos`, `PUT /fase-interna/documento/:id/submeter`, `PUT /fase-interna/documento/:id/aprovar` |
| **Páginas** | `/orgao/licitacoes/nova/fase-interna`, `/orgao/licitacoes/[id]/fase-interna` |

---

### 2.10 Documentos

| Item | Descrição |
|------|-----------|
| **Propósito** | Documentos de licitação |
| **Funcionalidades** | Upload, listagem, download, publicação |
| **Entidades** | `DocumentoLicitacao` |
| **Endpoints** | `POST /documentos/licitacao/:licitacaoId`, `GET /documentos/licitacao/:licitacaoId`, `GET /documentos/:id/download` |
| **Páginas** | Dentro das páginas de licitação |

---

### 2.11 Esclarecimentos e Impugnações

| Item | Descrição |
|------|-----------|
| **Propósito** | Pedidos de esclarecimento e impugnações de licitação |
| **Funcionalidades** | Criar esclarecimento, responder, arquivar; criar impugnação, download |
| **Endpoints** | `GET /esclarecimentos/licitacao/:licitacaoId`, `POST /esclarecimentos`, `PUT /esclarecimentos/:id/responder`, `GET /impugnacoes/licitacao/:licitacaoId`, `POST /impugnacoes` |
| **Páginas** | `/orgao/licitacoes/[id]/esclarecimentos`, `/orgao/licitacoes/[id]/impugnacoes`, `/fornecedor/licitacoes/[id]/esclarecimentos`, `/fornecedor/licitacoes/[id]/impugnar` |

---

### 2.12 Lotes

| Item | Descrição |
|------|-----------|
| **Propósito** | Organização de itens em lotes na licitação |
| **Entidades** | `LoteLicitacao` |
| **Endpoints** | `POST /lotes`, `GET /lotes/licitacao/:licitacaoId`, `POST /lotes/:loteId/itens/:itemId`, `POST /lotes/:id/vincular-pca` |
| **Páginas** | Dentro de licitações |

---

### 2.13 PNCP (Integração Nacional)

| Item | Descrição |
|------|-----------|
| **Propósito** | Integração com o Portal Nacional de Contratações Públicas |
| **Módulo** | `PNCP` |
| **Funcionalidades** | Credenciais, envio de compras, contratos, PCA, atas, órgãos, sincronização |
| **Entidades** | `PncpSync` |
| **Endpoints** | `GET /pncp/credentials`, `POST /pncp/compras/:licitacaoId`, `POST /pncp/contratos`, `POST /pncp/pca/:pcaId`, `GET /pncp/status/:licitacaoId`, `GET /pncp/pendentes` |
| **Páginas** | `/orgao/pncp`, `/admin/pncp` |

---

### 2.14 Contratos

| Item | Descrição |
|------|-----------|
| **Propósito** | Gestão de contratos administrativos |
| **Módulo** | `CONTRATOS` |
| **Funcionalidades** | CRUD, importação (IA, Portal Transparência), liberação, termos aditivos, medições, atestações, licenças, ordens de serviço, cronograma de etapas |
| **Entidades** | `Contrato`, `TermoAditivo`, `HistoricoContrato`, `Medicao`, `ItemMedicao`, `AtestacaoMensal`, `LicencaControle`, `OrdemServicoContrato`, `ItemCronograma`, `EtapaCronograma`, `DocumentoContrato` |
| **Modalidades** | `ITEM_QUANTIDADE`, `MEDICAO`, `CONTINUADO`, `LICENCA`, `ORDEM_SERVICO` |
| **Endpoints** | `POST /contratos`, `GET /contratos`, `GET /contratos/:id`, `PUT /contratos/:id`, `POST /contratos/:id/liberar`, `GET /contratos/:contratoId/medicoes`, `POST /contratos/:contratoId/medicoes`, `PATCH /contratos/medicoes/:medicaoId/submeter`, `PATCH /contratos/medicoes/:medicaoId/atestar`, `POST /contratos/:contratoId/ordens-servico` |
| **Páginas** | `/orgao/contratos`, `/orgao/contratos/[id]`, `/orgao/contratos/novo`, `/orgao/contratos/importar-ia`, `/orgao/contratos/importar-portal-transparencia`, `/orgao/medicoes`, `/orgao/medicoes-v2`, `/fornecedor/contratos`, `/fornecedor/contratos/[id]`, `/contratos` |

---

### 2.15 Almoxarifado

| Item | Descrição |
|------|-----------|
| **Propósito** | Requisições, ordens de fornecimento e recebimentos |
| **Módulo** | `ALMOXARIFADO` |
| **Funcionalidades** | Itens de contrato, requisições (MATERIAL, SERVICO, ORDEM_SERVICO), ordens de fornecimento, recebimentos (NF, mapeamento IA, aceite almoxarifado/patrimônio), dossiê fiscal, configurações de aprovação |
| **Entidades** | `ItemContrato`, `Requisicao`, `ItemRequisicao`, `RequisicaoItemOS`, `OrdemFornecimento`, `Recebimento`, `NotaFiscalFornecedor`, `ConfiguracaoAprovacao`, `HistoricoOrdemFornecimento`, `DossieOrdem`, `DossieAnexo` |
| **Endpoints** | `GET /almoxarifado/contratos/:contratoId/itens`, `POST /almoxarifado/requisicoes`, `GET /almoxarifado/requisicoes`, `POST /almoxarifado/requisicoes/:id/autorizar`, `POST /almoxarifado/ordens/gerar`, `GET /almoxarifado/ordens`, `POST /almoxarifado/recebimentos`, `POST /almoxarifado/recebimentos/:id/conferir`, `POST /almoxarifado/recebimentos/:id/aceitar-almoxarifado`, `POST /almoxarifado/recebimentos/:id/aceitar-patrimonio`, `GET /almoxarifado/ordens/dossie-fiscal` |
| **Páginas** | `/orgao/almoxarifado`, `/orgao/almoxarifado/requisicoes`, `/orgao/almoxarifado/requisicoes/nova`, `/orgao/almoxarifado/ordens`, `/orgao/almoxarifado/recebimentos`, `/orgao/almoxarifado/aprovacoes`, `/orgao/aprovacoes`, `/orgao/fiscal/dossie`, `/fornecedor/ordens`, `/fornecedor/ordens/[id]` |

---

### 2.16 Demandas

| Item | Descrição |
|------|-----------|
| **Propósito** | Demandas de compras/serviços |
| **Módulo** | `DEMANDAS` |
| **Funcionalidades** | CRUD, fluxo de aprovação, consolidação com PCA |
| **Entidades** | `Demanda`, `ItemDemanda` |
| **Endpoints** | `GET /demandas`, `POST /demandas`, `GET /demandas/:id`, `PATCH /demandas/:id/enviar`, `PATCH /demandas/:id/aprovar`, `PATCH /demandas/:id/consolidar` |
| **Páginas** | `/orgao/demandas` |

---

### 2.17 PCA (Plano de Contratações Anual)

| Item | Descrição |
|------|-----------|
| **Propósito** | Plano de Contratações Anual |
| **Módulo** | `PCA` |
| **Funcionalidades** | CRUD, aprovação, publicação, envio PNCP, itens, consolidação de demandas |
| **Entidades** | `Pca` |
| **Endpoints** | `POST /pca`, `GET /pca`, `GET /pca/:id`, `PATCH /pca/:id/aprovar`, `PATCH /pca/:id/publicar`, `POST /pca/:pcaId/itens`, `POST /pca/:id/consolidar-demandas` |
| **Páginas** | `/orgao/pca` |

---

### 2.18 Atas de Registro de Preço

| Item | Descrição |
|------|-----------|
| **Propósito** | Atas de registro de preço |
| **Módulo** | `ATAS` |
| **Funcionalidades** | CRUD, itens, utilização |
| **Entidades** | `AtaRegistroPreco`, `ItemAta` |
| **Endpoints** | `POST /atas`, `GET /atas`, `GET /atas/:id`, `POST /atas/:ataId/itens`, `POST /atas/itens/:itemId/utilizar` |
| **Páginas** | `/orgao/atas`, `/atas`, `/atas/[id]` |

---

### 2.19 Credenciamento

| Item | Descrição |
|------|-----------|
| **Propósito** | Credenciamento de fornecedores |
| **Módulo** | `CREDENCIAMENTO` |
| **Funcionalidades** | CRUD, inscrições, análise de credenciados |
| **Entidades** | `Credenciamento` |
| **Endpoints** | `POST /credenciamento`, `GET /credenciamento`, `GET /credenciamento/publicos`, `POST /credenciamento/:id/inscrever`, `PATCH /credenciamento/credenciados/:credenciadoId/analisar` |
| **Páginas** | `/credenciamento` |

---

### 2.20 Contratação Direta

| Item | Descrição |
|------|-----------|
| **Propósito** | Dispensas e inexigibilidades |
| **Módulo** | `CREDENCIAMENTO` |
| **Funcionalidades** | CRUD, fluxo de aprovação, adjudicação, homologação |
| **Entidades** | `ContratacaoDireta`, `ItemContratacaoDireta` |
| **Endpoints** | `POST /contratacao-direta`, `GET /contratacao-direta`, `PATCH /contratacao-direta/:id/aprovar`, `PATCH /contratacao-direta/:id/adjudicar`, `PATCH /contratacao-direta/:id/homologar` |
| **Páginas** | `/contratacao-direta` |

---

### 2.21 Frota e Combustível

| Item | Descrição |
|------|-----------|
| **Propósito** | Controle de frota de veículos e consumo de combustível |
| **Módulo** | `FROTA` |
| **Funcionalidades** | Veículos, abastecimentos, manutenções, contratos de combustível, requisições de abastecimento, credenciais para posto/vereador, acesso público por token/slug |
| **Entidades** | `Veiculo`, `Abastecimento`, `Manutencao`, `FrotaContrato`, `FrotaRequisicao`, `FrotaCredencial`, `FrotaAcessoLog` |
| **Endpoints** | `GET /frota/veiculos`, `POST /frota/veiculos`, `GET /frota/abastecimentos`, `POST /frota/abastecimentos`, `GET /frota/contratos`, `POST /frota/contratos`, `POST /frota/contratos/importar/:contratoId`, `GET /frota/requisicoes`, `POST /frota/requisicoes`, `PUT /frota/requisicoes/:id/autorizar`, `GET /frota/public/posto/:slug`, `GET /frota/public/vereador/:slug`, `GET /frota/public/req/:token` |
| **Páginas** | `/orgao/frota`, `/orgao/frota/contratos`, `/orgao/frota/requisicoes`, `/orgao/frota/posto`, `/orgao/frota/credenciais`, `/frota/posto/[slug]`, `/frota/vereador`, `/frota/vereador/[slug]`, `/frota/req/[token]` |

---

### 2.22 Ordens de Serviço

| Item | Descrição |
|------|-----------|
| **Propósito** | Gestão de ordens de serviço (fluxo alternativo ao almoxarifado) |
| **Módulo** | `ORDENS_SERVICO` |
| **Funcionalidades** | CRUD de OS, etapas, medição por etapas |
| **Entidades** | `OrdemServicoContrato`, `RequisicaoEtapaOS` |
| **Páginas** | `/orgao/ordens-servico`, `/orgao/requisicoes-os` |

---

### 2.23 IA (Importação de Contratos e Medições)

| Item | Descrição |
|------|-----------|
| **Propósito** | Importação de contratos e medições via IA (PDF/imagem) |
| **Módulo** | `IA_CONTRATOS` |
| **Funcionalidades** | Extração de dados de contrato via LLM, criação de contrato e itens; extração de medição |
| **Endpoints** | `POST /contratos/importar-ia`, `POST /contratos/:contratoId/medicoes/importar-ia` |
| **Páginas** | `/orgao/contratos/importar-ia`, `/orgao/contratos/importar-medicao-ia`, `/admin/ia` |

---

### 2.24 Portal de Assinaturas

| Item | Descrição |
|------|-----------|
| **Propósito** | Assinatura digital de documentos (medições, documentos avulsos) |
| **Módulo** | `PORTAL_ASSINATURAS` |
| **Funcionalidades** | Link público para assinatura, OTP, QR Code de validação |
| **Entidades** | `AssinaturaDigital`, `DocumentoAssinatura` |
| **Páginas** | `/orgao/portal-assinaturas`, `/assinar-medicao/[token]`, `/assinar-documento/[token]`, `/validar-documento/[codigo]` |

---

### 2.25 Catálogo

| Item | Descrição |
|------|-----------|
| **Propósito** | Catálogo de materiais e serviços (compras.gov.br) |
| **Funcionalidades** | Classes, itens, unidades, sincronização, importação CSV, catálogo próprio do órgão |
| **Entidades** | `Catalogo`, `CatalogoProprio` |
| **Endpoints** | `GET /catalogo/classes`, `GET /catalogo/itens`, `GET /catalogo/itens/:codigo`, `POST /catalogo/sincronizar`, `POST /catalogo/importar-csv` |
| **Páginas** | `/admin/catalogo` |

---

### 2.26 Notificações

| Item | Descrição |
|------|-----------|
| **Propósito** | Notificações para órgão e fornecedor |
| **Funcionalidades** | Listar, marcar como lida, envio por email e WhatsApp |
| **Entidades** | `Notificacao` |
| **Endpoints** | `GET /notificacoes`, `GET /notificacoes/nao-lidas/count`, `POST /notificacoes/:id/marcar-lida`, `POST /notificacoes/marcar-todas-lidas` |
| **Páginas** | Usado em badge no header |

---

### 2.27 Relatórios

| Item | Descrição |
|------|-----------|
| **Propósito** | Relatórios gerenciais |
| **Funcionalidades** | Eficiência de licitações, financeiro de contratos, consumo de almoxarifado |
| **Endpoints** | `GET /relatorios/licitacoes/eficiencia`, `GET /relatorios/contratos/financeiro`, `GET /relatorios/almoxarifado/consumo` |
| **Páginas** | `/orgao/relatorios` |

---

### 2.28 WhatsApp

| Item | Descrição |
|------|-----------|
| **Propósito** | Integração com WhatsApp (Z-API, Meta/Chatwoot) |
| **Módulo** | `WHATSAPP_CHAT` |
| **Funcionalidades** | Webhook para mensagens, envio de notificações, conversas |
| **Entidades** | `WhatsappConversa` |
| **Endpoints** | `POST /webhooks/zapi` |
| **Páginas** | Configuração em `/orgao/configuracoes` ou `/admin/orgaos` |

---

### 2.29 Admin

| Item | Descrição |
|------|-----------|
| **Propósito** | Administração do sistema |
| **Funcionalidades** | Monitoramento de disputas, sessões ativas, órgãos, usuários, módulos, fornecedores, solicitações, PNCP, catálogo, convites em massa, configurações de aprovação |
| **Endpoints** | `GET /admin/monitoramento/sessoes-ativas`, `GET /admin/orgaos`, `GET /admin/usuarios`, `GET /admin/modulos`, `PUT /admin/orgaos/:id/modulos`, `GET /admin/fornecedores`, `POST /admin/convites` |
| **Páginas** | `/admin/login`, `/admin/monitoramento`, `/admin/orgaos`, `/admin/usuarios`, `/admin/modulos`, `/admin/fornecedores`, `/admin/solicitacoes`, `/admin/pncp`, `/admin/catalogo`, `/admin/convites`, `/admin/configuracoes-aprovacao`, `/admin/ia` |

---

## 3. Fluxos Principais

### 3.1 Licitação → Contrato → Requisição → OF → Recebimento

```
1. DEMANDA → PCA → LICITAÇÃO (fase interna, edital, sessão)
2. SESSÃO DE DISPUTA → Propostas → Lances → Adjudicação → Homologação
3. ATA → CONTRATO (criado a partir da licitação)
4. Liberação do contrato (pode_liberar_contratos)
5. REQUISIÇÃO (MATERIAL/SERVICO) → Aprovação (pode_aprovar_requisicoes)
6. ORDEM DE FORNECIMENTO (gerada a partir da requisição autorizada)
7. Fornecedor envia NF (XML/PDF) → Mapeamento IA → Aceite almoxarifado/patrimônio
8. Dossiê fiscal (OF + NF + Comprovação de Aceite) → Fiscal imprime e entrega ao financeiro
```

### 3.2 Contrato ORDEM_SERVICO (medição)

```
1. Contrato com modalidade ORDEM_SERVICO
2. Ordem de Serviço (OS) vinculada ao cronograma
3. Requisição tipo ORDEM_SERVICO → RequisicaoItemOS
4. Medição pelo fornecedor → Atestação pelo fiscal → Aprovação
```

### 3.3 Medição (obras/engenharia)

```
1. Contrato com modalidade MEDICAO
2. Etapas do cronograma
3. Fornecedor solicita medição → Preenche discriminações
4. Fiscal atesta ou devolve
5. Aprovação (se configurado)
```

### 3.4 Frota (combustível)

```
1. Contrato de combustível (importado do cadastro ou manual)
2. Requisição de abastecimento (veículo, quantidade, tipo)
3. Autorização pelo gestor
4. Posto/vereador acessa via credencial (slug/token) e registra abastecimento
```

---

## 4. Módulos por Órgão (Configuráveis)

| Módulo | Descrição |
|--------|-----------|
| `LICITACOES` | Gestão de Licitações |
| `CONTRATOS` | Gestão de Contratos |
| `ATAS` | Atas de Registro de Preços |
| `PCA` | Plano de Contratações Anual |
| `DEMANDAS` | Gestão de Demandas |
| `FORNECEDORES` | Cadastro de Fornecedores |
| `PNCP` | Integração PNCP |
| `USUARIOS` | Gestão de Usuários |
| `DISPUTA` | Sala de Disputa |
| `CREDENCIAMENTO` | Credenciamento |
| `ALMOXARIFADO` | Almoxarifado e Ordens de Fornecimento |
| `PORTAL_ASSINATURAS` | Portal de Assinaturas (Doc Avulso) |
| `ORDENS_SERVICO` | Gestão de Ordens de Serviço |
| `IA_CONTRATOS` | IA — Importação de Contratos |
| `WHATSAPP_CHAT` | WhatsApp Chat |
| `FROTA` | Controle de Frota e Combustível |

---

## 5. Páginas do Frontend (Resumo)

### Órgão
- `/orgao` — Dashboard
- `/orgao/demandas`, `/orgao/pca`, `/orgao/licitacoes`, `/orgao/contratos`, `/orgao/medicoes`, `/orgao/medicoes-v2`
- `/orgao/almoxarifado`, `/orgao/almoxarifado/requisicoes`, `/orgao/almoxarifado/ordens`, `/orgao/almoxarifado/recebimentos`, `/orgao/almoxarifado/aprovacoes`
- `/orgao/requisicoes-os`, `/orgao/aprovacoes`, `/orgao/fiscal/dossie`
- `/orgao/frota`, `/orgao/frota/contratos`, `/orgao/frota/requisicoes`, `/orgao/frota/posto`, `/orgao/frota/credenciais`
- `/orgao/ordens-servico`, `/orgao/relatorios`, `/orgao/pncp`, `/orgao/configuracoes`
- `/orgao/sala-disputa`, `/orgao/disputa`, `/orgao/portal-assinaturas`
- `/orgao/contratos/importar-ia`, `/orgao/contratos/importar-portal-transparencia`, `/orgao/contratos/importar-medicao-ia`

### Fornecedor
- `/fornecedor` — Dashboard
- `/fornecedor/licitacoes`, `/fornecedor/participacoes`, `/fornecedor/propostas`
- `/fornecedor/contratos`, `/fornecedor/ordens`, `/fornecedor/medicoes`
- `/fornecedor/cadastro-sicaf`, `/fornecedor/sala-disputa`, `/fornecedor/disputa`

### Admin
- `/admin/login`, `/admin/monitoramento`, `/admin/orgaos`, `/admin/usuarios`, `/admin/modulos`
- `/admin/fornecedores`, `/admin/solicitacoes`, `/admin/pncp`, `/admin/catalogo`, `/admin/convites`, `/admin/ia`, `/admin/configuracoes-aprovacao`

### Públicas
- `/` — Página principal
- `/login`, `/orgao-login`, `/cadastro`, `/solicitar-acesso`
- `/licitacoes`, `/contratos`, `/atas`, `/credenciamento`, `/contratacao-direta`
- `/frota/posto/[slug]`, `/frota/vereador`, `/frota/vereador/[slug]`, `/frota/req/[token]`
- `/assinar-medicao/[token]`, `/assinar-documento/[token]`, `/validar-documento/[codigo]`

---

*Documento gerado para apresentação do sistema Portal DCP. Atualizado conforme análise do código.*
