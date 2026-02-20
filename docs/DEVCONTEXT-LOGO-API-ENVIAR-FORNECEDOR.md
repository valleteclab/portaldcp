# DevContext: Logo do Órgão, API URL e Enviar ao Fornecedor (2026-02-20)

## 1. Logo do Órgão

### Backend
- **Entidade Orgao**: campo `logo_url` (varchar 500)
- **Migration**: `1768400004000-AddLogoOrgao.ts`
- **Endpoint**: `POST /api/orgaos/:id/logo` (FileInterceptor, PNG/JPG max 2MB)
- **OrgaosService.uploadLogo**: salva em `uploads/logos/`, remove logo anterior, usa `UPLOAD_DIR` quando definido
- **PDFs**: logo no cabeçalho de OS e Boletim de Medição (GeradorPdfService.escreverCabecalho)
- **Requisicao findOne**: relation `orgao` para incluir logo nos PDFs

### Frontend
- **Configurações**: botão "Enviar Logo" funcional, upload via FormData, preview
- **getAssetUrl()**: em `@/lib/api` - URL correta para assets (API_URL ou window.location.origin)
- **Exibição**: Sidebar (área órgão), Header, Configurações
- **Fallback**: onError mostra ícone Building2 quando imagem falha ao carregar

### Arquivos
- backend/src/orgaos/entities/orgao.entity.ts
- backend/src/orgaos/orgaos.controller.ts
- backend/src/orgaos/orgaos.service.ts
- backend/src/assinaturas/gerador-pdf.service.ts
- frontend/src/app/orgao/configuracoes/page.tsx
- frontend/src/components/layout/navigation.tsx

---

## 2. Opção Enviar ao Fornecedor na Aprovação

### Backend
- **AutorizarRequisicaoDto**: `enviar_ao_fornecedor?: boolean` (default true)
- **autorizar()**: só chama notificarFornecedorOS quando `dto.enviar_ao_fornecedor !== false`
- PDF sempre gerado; envio opcional

### Frontend
- **Modal Autorizar**: checkbox "Enviar notificação ao fornecedor agora" (marcado por padrão)
- **handleAutorizar**: inclui `enviar_ao_fornecedor` no body
- **Mensagem de sucesso**: diferenciada quando usuário não envia (pode enviar depois)

---

## 3. Ação Enviar/Reenviar ao Fornecedor

### Backend
- **validarOrgaoRequisicao**: em RequisicaoService (valida orgao_id)
- **Endpoint**: `POST /api/almoxarifado/requisicoes/:id/enviar-ao-fornecedor`
- **EnviarAoFornecedorDto**: email_fornecedor, telefone_fornecedor opcionais

### Frontend
- **Botão**: ícone Send na coluna Ações (OS aprovadas com pdf_assinado_url)
- **Modal**: "Enviar ao Fornecedor" com email/telefone editáveis
- **Resultado**: alert com resultado de cada envio (email, notificação, WhatsApp)

---

## 4. API URL e APP_URL

### Problema
- API_URL usava `http://licitafacil.raywal.com.br/api` (errado)
- APP_URL deve ser `https://www.portaldcp.com.br`
- Sem NEXT_PUBLIC_API_URL, frontend fallback para localhost

### Solução
- **api.ts**: `getApiUrl()` - se NEXT_PUBLIC_API_URL não definido, usa `window.location.origin` no browser
- **Produção same-origin**: funciona sem variável (frontend e backend no mesmo domínio)
- **.env.production**: APP_URL e API_URL atualizados para https://www.portaldcp.com.br
- **frontend/.env.example**: NEXT_PUBLIC_API_URL=https://www.portaldcp.com.br

### Variáveis
- **Frontend**: NEXT_PUBLIC_API_URL (base URL, sem /api)
- **Backend**: APP_URL (para links em emails, validação, etc.)
