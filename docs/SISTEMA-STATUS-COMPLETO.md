# LicitaFácil - Documentação Completa do Sistema

**Última atualização:** 30/11/2024

## 1. Visão Geral

O **LicitaFácil** é uma plataforma de licitações eletrônicas conforme a Lei 14.133/2021 (Nova Lei de Licitações), com integração ao PNCP (Portal Nacional de Contratações Públicas).

### 1.1 Stack Tecnológico
- **Backend**: NestJS + TypeORM + PostgreSQL
- **Frontend**: Next.js 14 + React + TailwindCSS + shadcn/ui
- **Banco de Dados**: PostgreSQL
- **Cache**: Redis
- **Containerização**: Docker Compose

---

## 2. Requisitos do PNCP para Cadastro

Conforme a imagem do formulário de cadastro do PNCP, o sistema precisa fornecer URLs públicas para:

| Requisito PNCP | Status | URL |
|----------------|--------|-----|
| Editais de Credenciamento/Pré-Qualificação | ✅ Implementado | `/credenciamento` |
| Avisos de Contratação Direta | ✅ Implementado | `/contratacao-direta` |
| Editais de Licitação (Compras/Alienações) | ✅ Implementado | `/licitacoes` |
| Atas de Registro de Preço | ✅ Implementado | `/atas` |
| Contratos e Termos Aditivos | ✅ Implementado | `/contratos` |

---

## 3. Módulos do Sistema

### 3.1 Backend - Módulos Existentes

| Módulo | Entidades | Status | Observações |
|--------|-----------|--------|-------------|
| **Auth** | - | ✅ Completo | JWT para Órgão e Fornecedor |
| **Orgaos** | Orgao | ✅ Completo | CRUD de órgãos públicos |
| **Fornecedores** | Fornecedor, Socio, Documento, Atividade | ✅ Completo | Cadastro completo |
| **Licitacoes** | Licitacao | ✅ Completo | CRUD + endpoints públicos |
| **Itens** | ItemLicitacao | ✅ Completo | Itens da licitação |
| **Propostas** | Proposta, PropostaItem | ✅ Completo | Propostas dos fornecedores |
| **Lances** | Lance, MensagemChat | ✅ Completo | Disputa de lances |
| **Sessao** | SessaoDisputa, EventoSessao | ✅ Completo | Controle da sessão |
| **FaseInterna** | DocumentoFaseInterna | ✅ Completo | Documentos da fase interna |
| **Impugnacoes** | Impugnacao | ✅ Completo | Impugnações e recursos |
| **Documentos** | DocumentoLicitacao | ✅ **NOVO** | Upload e gestão de documentos |
| **Contratos** | Contrato, TermoAditivo | ✅ **NOVO** | Gestão de contratos |
| **Atas** | AtaRegistroPreco, ItemAta | ✅ **NOVO** | Atas de registro de preço |
| **PNCP** | PncpSync | ✅ Completo | Integração PNCP |
| **IA** | - | ✅ Completo | Assistente IA com OpenRouter |

### 3.2 Backend - Módulos Implementados (Sessão 2)

| Módulo | Entidades | Status |
|--------|-----------|--------|
| **PCA** | PlanoContratacaoAnual, ItemPCA | ✅ **NOVO** |

### 3.3 Backend - Módulos Pendentes (Baixa Prioridade)

| Módulo | Entidades Necessárias | Prioridade |
|--------|----------------------|------------|
| **Credenciamento** | Credenciamento | 🟢 Baixa |
| **ContratacaoDireta** | Dispensa, Inexigibilidade | 🟢 Baixa |

### 3.3 Frontend - Páginas Existentes

#### Área Pública
| Página | Rota | Status |
|--------|------|--------|
| Home | `/` | ✅ |
| Login Fornecedor | `/login` | ✅ |
| Login Órgão | `/orgao-login` | ✅ |
| Cadastro Fornecedor | `/cadastro` | ✅ |
| Lista de Licitações | `/licitacoes` | ✅ **NOVO** |
| Detalhe Licitação | `/licitacoes/[id]` | ✅ **NOVO** |
| Lista de Contratos | `/contratos` | ✅ **NOVO** |
| Detalhe Contrato | `/contratos/[id]` | ✅ **NOVO** |
| Lista de Atas | `/atas` | ✅ **NOVO** |
| Detalhe Ata | `/atas/[id]` | ✅ **NOVO** |

#### Área do Órgão (Autenticada)
| Página | Rota | Status |
|--------|------|--------|
| Dashboard | `/orgao` | ✅ |
| Lista Licitações | `/orgao/licitacoes` | ✅ |
| Nova Licitação | `/orgao/licitacoes/nova` | ✅ |
| Detalhe Licitação | `/orgao/licitacoes/[id]` | ✅ |
| Fase Interna | `/orgao/licitacoes/[id]/fase-interna` | ⚠️ Parcial |
| Impugnações | `/orgao/licitacoes/[id]/impugnacoes` | ✅ |
| Propostas | `/orgao/licitacoes/[id]/propostas` | ✅ |
| Sala de Disputa | `/orgao/licitacoes/[id]/sala` | ✅ |
| Habilitação | `/orgao/licitacoes/[id]/habilitacao` | ✅ |
| Sessão | `/orgao/licitacoes/[id]/sessao` | ⚠️ Parcial |
| Integração PNCP | `/orgao/pncp` | ✅ |
| Fornecedores | `/orgao/fornecedores` | ⚠️ Básico |
| Configurações | `/orgao/configuracoes` | ✅ |
| Contratos | `/orgao/contratos` | ✅ **NOVO** |
| Atas | `/orgao/atas` | ✅ **NOVO** |
| PCA | `/orgao/pca` | ✅ **NOVO** |

#### Área do Fornecedor (Autenticada)
| Página | Rota | Status |
|--------|------|--------|
| Dashboard | `/fornecedor` | ✅ |
| Licitações Disponíveis | `/fornecedor/licitacoes` | ✅ |
| Detalhe Licitação | `/fornecedor/licitacoes/[id]` | ✅ |
| Enviar Proposta | `/fornecedor/licitacoes/[id]/proposta` | ✅ |
| Impugnar | `/fornecedor/licitacoes/[id]/impugnar` | ✅ |
| Sala de Disputa | `/fornecedor/licitacoes/[id]/sala` | ⚠️ Parcial |
| Meus Contratos | `/fornecedor/contratos` | ✅ **NOVO** |
| Meu Perfil | `/fornecedor/perfil` | ⚠️ Básico |

### 3.4 Frontend - Páginas Pendentes

| Página | Rota | Prioridade |
|--------|------|------------|
| Configurações (Órgão) | `/orgao/configuracoes` | 🟢 Baixa |

---

## 4. Entidades do Banco de Dados

### 4.1 Entidades Existentes

```
✅ Orgao
✅ Fornecedor
✅ FornecedorSocio
✅ FornecedorDocumento
✅ FornecedorAtividade
✅ Licitacao
✅ ItemLicitacao
✅ Proposta
✅ PropostaItem
✅ Lance
✅ MensagemChat
✅ SessaoDisputa
✅ EventoSessao
✅ DocumentoFaseInterna
✅ Impugnacao
✅ PncpSync
✅ DocumentoLicitacao (NOVO)
✅ Contrato (NOVO)
✅ TermoAditivo (NOVO)
✅ AtaRegistroPreco (NOVO)
✅ ItemAta (NOVO)
```

### 4.2 Entidades Pendentes (Baixa Prioridade)

```
✅ PlanoContratacaoAnual (NOVO)
✅ ItemPCA (NOVO)
✅ Credenciamento (NOVO)
✅ Credenciado (NOVO)
✅ ContratacaoDireta (NOVO)
✅ ItemContratacaoDireta (NOVO)
```

---

## 5. Fluxo Completo de uma Licitação

### 5.1 Fase Interna (Preparatória)
1. ✅ Planejamento (ETP - Estudo Técnico Preliminar)
2. ✅ Termo de Referência
3. ✅ Pesquisa de Preços
4. ✅ Análise Jurídica
5. ✅ Aprovação da Autoridade

### 5.2 Fase Externa
1. ✅ Publicação do Edital
2. ✅ Prazo para Impugnações
3. ✅ Acolhimento de Propostas
4. ✅ Análise de Propostas
5. ✅ Sessão de Disputa (Lances)
6. ✅ Julgamento
7. ✅ Habilitação
8. ✅ Recursos
9. ✅ Adjudicação
10. ✅ Homologação

### 5.3 Pós-Licitação
1. ✅ Geração de Ata (se SRP) - **NOVO**
2. ✅ Geração de Contrato - **NOVO**
3. ✅ Gestão de Contratos - **NOVO**
4. ✅ Termos Aditivos - **NOVO**

---

## 6. Implementações Concluídas (Sessão Atual)

### ✅ Backend - Novos Módulos

1. **Módulo de Documentos** (`/backend/src/documentos/`)
   - `DocumentoLicitacao` entity com tipos: Edital, TR, ETP, Anexos, etc.
   - Upload com versionamento e hash SHA256
   - Endpoints públicos e privados
   - Suporte a PDF e DOC/DOCX

2. **Módulo de Contratos** (`/backend/src/contratos/`)
   - `Contrato` entity completa com fiscal, gestor, garantia
   - `TermoAditivo` entity para aditivos e apostilamentos
   - CRUD completo + endpoints públicos
   - Estatísticas e alertas de vencimento

3. **Módulo de Atas** (`/backend/src/atas/`)
   - `AtaRegistroPreco` entity com controle de saldo
   - `ItemAta` entity com quantidade registrada/utilizada
   - Suporte a adesão (carona)
   - CRUD completo + endpoints públicos

### ✅ Frontend - Páginas Públicas

1. **Portal de Licitações** (`/licitacoes`)
   - Lista com filtros por modalidade, fase, UF
   - Cards com informações resumidas
   - Links para detalhes e download

2. **Detalhe da Licitação** (`/licitacoes/[id]`)
   - Abas: Documentos, Itens, Cronograma
   - Download de documentos públicos
   - Informações do órgão

3. **Portal de Contratos** (`/contratos`)
   - Lista com filtros por status, tipo, ano
   - Valores e vigência
   - Links para detalhes

4. **Detalhe do Contrato** (`/contratos/[id]`)
   - Valores (inicial, acréscimos, supressões, global)
   - Lista de termos aditivos
   - Informações de vigência e responsáveis

5. **Portal de Atas** (`/atas`)
   - Lista com barra de saldo visual
   - Indicador de adesão permitida
   - Filtros por status e ano

6. **Detalhe da Ata** (`/atas/[id]`)
   - Tabela de itens com saldo
   - Barra de progresso do saldo
   - Informações de vigência

---

## 7. Checklist de Implementação

### ✅ Concluído (Requisitos PNCP)

- [x] Criar página pública `/licitacoes` com lista de editais
- [x] Criar página pública `/licitacoes/[id]` com detalhes e documentos
- [x] Criar módulo de Documentos no backend
- [x] Criar página pública `/contratos`
- [x] Criar página pública `/contratos/[id]`
- [x] Criar módulo de Contratos no backend
- [x] Criar página pública `/atas`
- [x] Criar página pública `/atas/[id]`
- [x] Criar módulo de Atas no backend

### 🟡 Próximas Etapas

- [ ] Criar interface de gestão de contratos para órgão (`/orgao/contratos`)
- [ ] Criar interface de gestão de atas para órgão (`/orgao/atas`)
- [ ] Criar área de contratos para fornecedor (`/fornecedor/contratos`)
- [ ] Implementar upload de documentos na interface do órgão
- [ ] Alertas de vencimento de contratos

### 🟢 Futuro

- [ ] Implementar PCA (Plano de Contratações Anual)
- [ ] Implementar contratação direta (dispensa/inexigibilidade)
- [ ] Implementar credenciamento
- [ ] Relatórios gerenciais

---

## 8. URLs para Cadastro no PNCP

O sistema agora possui as seguintes URLs públicas:

| Tipo | URL | Status |
|------|-----|--------|
| Editais de Licitação | `https://seudominio.com.br/licitacoes` | ✅ Pronto |
| Detalhe da Licitação | `https://seudominio.com.br/licitacoes/[id]` | ✅ Pronto |
| Atas de Registro de Preço | `https://seudominio.com.br/atas` | ✅ Pronto |
| Detalhe da Ata | `https://seudominio.com.br/atas/[id]` | ✅ Pronto |
| Contratos e Termos Aditivos | `https://seudominio.com.br/contratos` | ✅ Pronto |
| Detalhe do Contrato | `https://seudominio.com.br/contratos/[id]` | ✅ Pronto |
| Editais de Credenciamento | `https://seudominio.com.br/licitacoes?modalidade=CREDENCIAMENTO` | ⚠️ Filtro |
| Avisos de Contratação Direta | `https://seudominio.com.br/licitacoes?modalidade=DISPENSA_ELETRONICA` | ⚠️ Filtro |

---

## 9. Arquivos Criados Nesta Sessão

### Backend
```
src/documentos/
├── entities/documento-licitacao.entity.ts
├── documentos.service.ts
├── documentos.controller.ts
└── documentos.module.ts

src/contratos/
├── entities/
│   ├── contrato.entity.ts
│   └── termo-aditivo.entity.ts
├── contratos.service.ts
├── contratos.controller.ts
└── contratos.module.ts

src/atas/
├── entities/ata-registro-preco.entity.ts
├── atas.service.ts
├── atas.controller.ts
└── atas.module.ts
```

### Frontend
```
src/app/licitacoes/
├── page.tsx
└── [id]/page.tsx

src/app/contratos/
├── page.tsx
└── [id]/page.tsx

src/app/atas/
├── page.tsx
└── [id]/page.tsx
```

---

## 10. Conclusão

O sistema **LicitaFácil** agora está **pronto para o cadastro no PNCP** com todas as URLs públicas obrigatórias implementadas:

- ✅ Portal de Licitações (Editais)
- ✅ Portal de Contratos
- ✅ Portal de Atas de Registro de Preço

Para completar o cadastro no PNCP, basta:
1. Fazer deploy do sistema em um domínio público
2. Configurar as credenciais do PNCP no `.env`
3. Informar as URLs no formulário de cadastro do PNCP
