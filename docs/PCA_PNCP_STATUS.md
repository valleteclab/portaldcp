# Integração PCA com PNCP - Status Completo

**Data:** 02/12/2025  
**Versão:** 1.0

---

## ✅ O QUE FOI IMPLEMENTADO

### 1. Envio de PCA ao PNCP

#### Backend (`backend/src/pncp/pncp.service.ts`)
- **Método `enviarPCA`**: Envia PCA completo com todos os itens
- **Campos mapeados corretamente:**
  - `catalogo`: 2 (Outros/Próprio)
  - `classificacaoCatalogo`: 1 (Material) ou 2 (Serviço)
  - `classificacaoSuperiorCodigo`: código da classe (ex: 100, 200)
  - `classificacaoSuperiorNome`: nome da classe
  - `categoriaItemPca`: 1-8 conforme tipo do item
  - `valorUnitario`, `quantidade`, `valorTotal`, `valorOrcamentoExercicio`
  - `unidadeFornecimento`, `dataDesejada`, `grauPrioridade`, `renovacaoContrato`

#### Frontend (`frontend/src/app/orgao/pncp/page.tsx`)
- Botão "Enviar" para PCAs publicados
- Exibe sequencial PNCP após envio
- Atualização automática da lista após envio

### 2. Exclusão de PCA do PNCP

#### Backend (`backend/src/pncp/pncp.service.ts`)
- **Método `excluirPCA`**: Exclui PCA do PNCP com justificativa

#### Frontend
- Botão "Excluir" para PCAs enviados
- Solicita justificativa obrigatória
- **Desmarca automaticamente** o PCA como enviado no sistema local
- Atualização automática da lista

### 3. Gerenciamento de Itens do PCA no PNCP

#### Backend
- **`retificarItemPCA`**: Retifica item individual
- **`excluirItemPCA`**: Exclui item individual com justificativa

#### Frontend
- Modal "Gerenciar Itens" para PCAs enviados
- Lista todos os itens com valores
- Botões para retificar e excluir cada item

### 4. Tela de Listagem de PCAs

#### Frontend (`frontend/src/app/orgao/pca/page.tsx`)
- **Nova visualização em duas etapas:**
  1. Lista de todos os PCAs (2024, 2025, 2026...)
  2. Detalhes do PCA selecionado
- Cards com: Ano, Status, Quantidade de Itens, Valor Total
- Botões: Visualizar, Editar, Excluir
- Modal para criar novo PCA
- Botão "Voltar" para retornar à lista

### 5. Endpoints de Controle

#### Backend (`backend/src/pca/pca.controller.ts`)
- `PATCH /api/pca/:id/marcar-enviado-pncp` - Marca PCA como enviado
- `PATCH /api/pca/:id/desmarcar-enviado-pncp` - Desmarca PCA como enviado
- `DELETE /api/pca/:id` - Exclui PCA do sistema

### 6. Duplicação de PCA

#### Backend (`backend/src/pca/pca.service.ts`)
- **Corrigido para copiar todos os campos:**
  - `data_desejada_contratacao` (mantém dia/mês, altera ano)
  - `valor_unitario_estimado`
  - `valor_orcamentario_exercicio`
  - `codigo_grupo`, `nome_grupo`

### 7. Importação CSV

#### Frontend (`frontend/src/components/catalogo/ImportarCSVParaPCA.tsx`)
- **Detecção automática de encoding** (UTF-8 ou Latin-1/ISO-8859-1)
- Corrige caracteres especiais (ç, ã, é, etc.)

### 8. Link para PNCP

- URL correta: `https://treina.pncp.gov.br/app/pca/{CNPJ}/{ANO}/{SEQUENCIAL}`
- Exemplo: `https://treina.pncp.gov.br/app/pca/64435842000159/2025/5`

---

## 📋 CAMPOS DO PCA ENVIADOS AO PNCP

### Cabeçalho do PCA
| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| `anoPca` | Ano do exercício | 2025 |
| `codigoUnidade` | Código da unidade | "1" |
| `dataPublicacaoPncp` | Data de publicação | "2025-12-02" |

### Itens do PCA
| Campo | Descrição | Valores |
|-------|-----------|---------|
| `numeroItem` | Número sequencial | 1, 2, 3... |
| `categoriaItemPca` | Categoria do item | 1=Material, 2=Serviço, 3=Obra... |
| `catalogo` | Tipo de catálogo | 1=Compras.gov.br, 2=Outros |
| `classificacaoCatalogo` | Classificação | 1=Material, 2=Serviço |
| `classificacaoSuperiorCodigo` | Código da classe | "100", "200", "315" |
| `classificacaoSuperiorNome` | Nome da classe | "SERVIÇOS DE UTILIDADE PÚBLICA" |
| `descricao` | Descrição do item | Texto até 2000 chars |
| `unidadeRequisitante` | Unidade solicitante | "Secretaria de Saúde" |
| `valorUnitario` | Valor unitário | 1000.00 |
| `quantidade` | Quantidade estimada | 10 |
| `valorTotal` | Valor total | 10000.00 |
| `valorOrcamentoExercicio` | Orçamento do exercício | 10000.00 |
| `unidadeFornecimento` | Unidade de medida | "UNIDADE", "MES" |
| `dataDesejada` | Data desejada | "2025-06-01" |
| `grauPrioridade` | Prioridade | 1=Muito Alta, 5=Muito Baixa |
| `renovacaoContrato` | É renovação? | true/false |

---

## ⚠️ O QUE FALTA FAZER

### 1. Captura Automática do Sequencial
- [ ] Verificar formato exato da resposta do PNCP
- [ ] Testar extração do sequencial de diferentes formatos
- [ ] Adicionar log detalhado da resposta

### 2. Retificação de PCA (Cabeçalho)
- [ ] API do PNCP não suporta PUT no PCA inteiro
- [ ] Apenas itens podem ser retificados individualmente
- [ ] Documentar essa limitação

### 3. Adicionar Item ao PCA Enviado
- [ ] Implementar endpoint POST para adicionar novos itens
- [ ] Testar no ambiente de treinamento

### 4. Sincronização de Status
- [ ] Consultar status do PCA no PNCP periodicamente
- [ ] Atualizar status local se houver divergência

### 5. Ambiente de Produção
- [ ] Configurar variáveis de ambiente para produção
- [ ] Alterar URL de `treina.pncp.gov.br` para `pncp.gov.br`
- [ ] Testar credenciais de produção

### 6. Tratamento de Erros
- [ ] Melhorar mensagens de erro do PNCP
- [ ] Adicionar retry automático em caso de timeout
- [ ] Log de todas as requisições para auditoria

### 7. Validações Antes do Envio
- [ ] Validar campos obrigatórios antes de enviar
- [ ] Verificar se todos os itens têm data_desejada
- [ ] Alertar sobre itens sem código de classe

---

## 🔧 CONFIGURAÇÃO

### Variáveis de Ambiente (Backend)
```env
PNCP_API_URL=https://treina.pncp.gov.br/api/pncp/v1
PNCP_LOGIN=seu-uuid-aqui
PNCP_SENHA=sua-senha-aqui
PNCP_CNPJ_ORGAO=64435842000159
```

### Variáveis de Ambiente (Frontend)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## 📁 ARQUIVOS MODIFICADOS

### Backend
- `backend/src/pncp/pncp.service.ts` - Serviço principal PNCP
- `backend/src/pncp/pncp.controller.ts` - Endpoints PNCP
- `backend/src/pncp/pncp.module.ts` - Módulo com PCA repository
- `backend/src/pca/pca.service.ts` - Serviço PCA (excluir, desmarcar)
- `backend/src/pca/pca.controller.ts` - Endpoints PCA

### Frontend
- `frontend/src/app/orgao/pncp/page.tsx` - Página integração PNCP
- `frontend/src/app/orgao/pca/page.tsx` - Página PCA com listagem
- `frontend/src/lib/pncp.ts` - Serviço PNCP
- `frontend/src/components/catalogo/ImportarCSVParaPCA.tsx` - Importação CSV

### Documentação
- `docs/PNCP_API_INTEGRATION.md` - Guia de integração
- `docs/PNCP_FRONTEND_GUIDE.md` - Guia do frontend
- `docs/PCA_PNCP_STATUS.md` - Este documento

---

## 🧪 TESTES REALIZADOS

| Funcionalidade | Status | Observações |
|----------------|--------|-------------|
| Login PNCP | ✅ OK | Token válido por 1 hora |
| Enviar PCA | ✅ OK | Todos os itens enviados |
| Excluir PCA | ✅ OK | Requer justificativa |
| Retificar Item | ⚠️ Parcial | Testado via API direta |
| Excluir Item | ⚠️ Parcial | Testado via API direta |
| Capturar Sequencial | ⚠️ Parcial | Às vezes retorna null |
| Importar CSV | ✅ OK | Encoding corrigido |
| Duplicar PCA | ✅ OK | Data ajustada para novo ano |

---

## 📞 SUPORTE

Para dúvidas sobre a API do PNCP:
- Swagger: https://pncp.gov.br/api/pncp/swagger-ui/index.html
- Manual: https://www.gov.br/pncp/pt-br/pncp/integre-se-ao-pncp
- Ambiente de Treino: https://treina.pncp.gov.br
