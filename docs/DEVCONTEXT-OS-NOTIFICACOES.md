# DevContext: OS Assinada e Notificacoes ao Fornecedor (2026-02-20)

## Resumo das Features Implementadas

### 1. OS Assinada - Notificacao ao Fornecedor
- Frontend: Removido download automatico do PDF
- Backend: Ao aprovar OS, envia email (com PDF), notificacao no sistema e WhatsApp
- Link: /fornecedor/contratos/contratoId

### 2. Correcao codigo_validacao varchar(16)
- Problema: codigo 19 chars nao cabia em varchar(16)
- Solucao: Armazenar sem hifens (16 chars)
- Arquivo: backend/src/assinaturas/assinaturas.service.ts

### 3. Validacao de Documento
- Rota alias: /api/assinaturas/validar/:codigo
- decodeURIComponent no parametro
- getApiBase() no frontend para mesma origem

### 4. Email e Telefone Editaveis + Resultado Detalhado
- Modal Autorizar OS: campos editaveis para email e telefone
- DTO: email_fornecedor e telefone_fornecedor opcionais
- Retorno: notificacoes_fornecedor com email, notificacao, whatsapp
- Alert pos-autorizar mostra o que foi enviado

## Arquivos Principais
- backend/src/almoxarifado/requisicao.service.ts
- backend/src/almoxarifado/dto/criar-requisicao.dto.ts
- backend/src/assinaturas/assinaturas.service.ts
- frontend/src/app/orgao/almoxarifado/requisicoes/page.tsx
