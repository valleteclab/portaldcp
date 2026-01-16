# Auditoria de Segurança - Endpoints

**Data:** 13/01/2026
**Auditor:** Cascade AI

## Princípios de Segurança para Licitações Públicas

### Transparência (Lei 14.133/2021)
Licitações públicas exigem **transparência total** em:
- Editais e documentos da licitação
- Propostas apresentadas (após abertura)
- Lances em sessões públicas
- Resultados e classificações
- Atas e contratos

### O que deve ser PÚBLICO (sem autenticação)
- Consulta de licitações
- Visualização de propostas (após abertura)
- Acompanhamento de sessões de disputa
- Download de documentos públicos
- Rankings e resultados

### O que deve ser PROTEGIDO (requer autenticação)
- **Ações de escrita** (criar, editar, excluir)
- **Dados cadastrais** do fornecedor (CNPJ, endereço, representante)
- **Senhas e tokens**
- **Operações administrativas**

---

## Resumo

Total de controllers: 30
Endpoints com @Public(): 51

## Classificação de Endpoints Públicos

### ✅ PÚBLICOS - Transparência (Lei 14.133/2021)

| Controller | Endpoint | Justificativa |
|------------|----------|---------------|
| **Autenticação** | | |
| auth | POST /login/* | Login não requer autenticação prévia |
| fornecedores | POST /registro, /login | Cadastro e login |
| orgaos | POST /login, /registro | Cadastro e login |
| usuarios | POST /login | Login |
| **Consultas Públicas** | | |
| licitacoes | GET /, GET /:id, GET /publicas | Transparência - qualquer cidadão pode consultar |
| propostas | GET /licitacao/:id, GET /ranking/item/:id | Transparência - propostas são públicas após abertura |
| sessao | GET /:id, GET /licitacao/:id, GET /:id/eventos | Transparência - sessões são públicas |
| sessao | GET /:sessaoId/mensagens | Transparência - chat da sessão é público |
| sessao | GET /item/:id/lances/* | Transparência - lances são públicos |
| documentos | GET /publicos/*, GET /licitacao/:id/publicos | Documentos públicos da licitação |
| esclarecimentos | GET /licitacao/:id | Transparência - esclarecimentos são públicos |
| impugnacoes | GET /licitacao/:id | Transparência - impugnações são públicas |
| atas | GET /licitacao/:id | Transparência - atas são públicas |
| contratos | GET /licitacao/:id | Transparência - contratos são públicos |
| **Utilitários** | | |
| health | GET /health | Health check do sistema |
| fornecedores | GET /consultar-cnpj/:cnpj | Consulta API externa (ReceitaWS) |
| fornecedores | GET /verificar-cnpj/:cnpj | Verificação de duplicidade |

### � PROTEGIDOS - Requerem JWT

| Controller | Endpoint | Motivo |
|------------|----------|--------|
| **Dados Cadastrais** | | |
| fornecedores | GET /por-email/:email | Dados sensíveis do fornecedor |
| fornecedores | PUT /:id | Alteração de dados |
| fornecedores | PUT /:id/* (abas) | Alteração de documentos |
| **Ações de Escrita** | | |
| propostas | POST / | Criar proposta |
| propostas | PUT /:id | Editar proposta |
| propostas | DELETE /:id | Excluir proposta |
| esclarecimentos | POST / | Enviar esclarecimento |
| impugnacoes | POST / | Enviar impugnação |
| documentos | POST /upload | Upload de documentos |
| **Operações Administrativas** | | |
| licitacoes | POST /, PUT /:id, DELETE /:id | CRUD de licitações |
| sessao | POST /*, PUT /* | Controle de sessão (pregoeiro) |
| usuarios | POST /, PUT /:id | Gestão de usuários |
| orgaos | PUT /:id | Alteração de órgão |

## Vulnerabilidades Corrigidas Nesta Sessão

1. ✅ **Senha hash removida** de todos os retornos de API (FornecedorSemSenha)
2. ✅ **Token JWT padronizado** (access_token em vez de token)
3. ✅ **Frontend migrado** para usar authFetch (13 arquivos + 2 componentes)
4. ✅ **Endpoint por-email protegido** - requer JWT
5. ✅ **Validação de ownership** - fornecedor só acessa seus próprios dados
6. ✅ **Rate limiting global** - 100 req/min por IP (@nestjs/throttler)
7. ✅ **Logs de auditoria** - AuditService para ações sensíveis

## Arquivos Criados/Modificados

### Novos Arquivos
- `backend/src/auth/ownership.guard.ts` - Guard para validação de ownership
- `backend/src/audit/audit.service.ts` - Serviço de auditoria

### Arquivos Modificados
- `backend/src/app.module.ts` - ThrottlerModule para rate limiting
- `backend/src/auth/auth.module.ts` - Export do OwnershipGuard
- `backend/src/fornecedores/fornecedores.controller.ts` - Validação de ownership + auditoria
- `backend/src/fornecedores/fornecedores.service.ts` - FornecedorSemSenha
- `backend/src/audit/audit.module.ts` - Global module

## Próximos Passos Recomendados

### Prioridade Média
1. Implementar **CORS** restritivo em produção
2. Adicionar **headers de segurança** (CSP, HSTS, etc.)
3. Persistir logs de auditoria no banco de dados

### Prioridade Baixa
1. Implementar **refresh token** para melhor UX (não prioritário - tokens de 7 dias são suficientes)

