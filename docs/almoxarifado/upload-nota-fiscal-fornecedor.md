# Upload de Nota Fiscal pelo Fornecedor

## Contexto

Fornecedores precisam enviar notas fiscais ao órgão após entrega de materiais/serviços. Atualmente isso é feito via WhatsApp ou email externo, gerando trabalho manual e risco de perda de documentos.

## Objetivo

Permitir que fornecedores anexem notas fiscais diretamente no sistema ao dar ciência de entrega, com suporte diferenciado para contratos de serviço (que requerem planilha de controle de saldo).

## Funcionalidades

### 1. Upload de Nota Fiscal

**Para Contratos de FORNECIMENTO (materiais):**
- Fornecedor anexa Nota Fiscal (NF) ao dar ciência de entrega
- Formatos aceitos: PDF, imagem (JPG, PNG)
- Validação: verificar se arquivo é válido

**Para Contratos de SERVIÇO:**
- Fornecedor anexa:
  1. Nota Fiscal de Serviço (NFS) - obrigatório
  2. Planilha de Controle de Saldo de Serviço - obrigatório
- Formatos aceitos: PDF, Excel (XLSX), CSV
- Validação: verificar se arquivos são válidos

### 2. Configuração por Órgão

**Opção no cadastro do órgão:**
```
☑️ Usar sistema para envio de ordens de fornecimento
   Se marcado: Fornecedor acessa portal, anexa NF, dá ciência
   Se desmarcado: Ordem enviada apenas por email, fornecedor envia NF externamente
```

**Comportamento:**
- Se `usar_sistema_ordens = true`:
  - Ordem é enviada via sistema
  - Fornecedor acessa portal
  - Fornecedor pode anexar NF ao dar ciência
  - Notificações no sistema

- Se `usar_sistema_ordens = false`:
  - Ordem é enviada apenas por email
  - Fornecedor não precisa acessar portal
  - Fornecedor envia NF por WhatsApp/email externo
  - Processo manual no órgão

## Fluxo Completo

### Fluxo 1: Contrato de FORNECIMENTO (com sistema)

```
┌─────────────────────────────────────────────────────────────┐
│  1. FORNECEDOR RECEBE ORDEM                                  │
│     → Acessa portal /fornecedor/ordens                      │
│     → Visualiza ordem pendente                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  2. FORNECEDOR DÁ CIÊNCIA DE RECEBIMENTO                     │
│     → Clica "Recebi a ordem"                                │
│     → Status: EM_ATENDIMENTO                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  3. FORNECEDOR ENTREGA MATERIAIS                             │
│     → Clica "Dar ciência de entrega"                        │
│     → Abre modal para anexar NF                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  4. FORNECEDOR ANEXA NOTA FISCAL                             │
│     → Upload de arquivo (PDF/imagem)                         │
│     → Informa número da NF                                   │
│     → Informa data de emissão                               │
│     → Informa data de entrega                               │
│     → [Confirmar Entrega]                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  5. SISTEMA PROCESSA                                         │
│     → Status ordem: ATENDIDA                                 │
│     → NF salva no sistema                                   │
│     → Notifica órgão                                        │
│     → Órgão pode visualizar e validar NF                    │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo 2: Contrato de SERVIÇO (com sistema)

```
┌─────────────────────────────────────────────────────────────┐
│  1. FORNECEDOR RECEBE ORDEM MENSAL                           │
│     → Acessa portal                                          │
│     → Visualiza ordem de serviço                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  2. FORNECEDOR DÁ CIÊNCIA DE ENTREGA                         │
│     → Clica "Dar ciência de entrega"                         │
│     → Abre modal com 2 uploads:                              │
│       1. Nota Fiscal de Serviço (NFS)                        │
│       2. Planilha de Controle de Saldo                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  3. FORNECEDOR ANEXA DOCUMENTOS                              │
│     → Upload NFS (PDF)                                       │
│     → Upload Planilha (Excel/PDF)                             │
│     → Informa número da NFS                                  │
│     → Informa período de serviço                             │
│     → Informa saldo de serviço executado                    │
│     → [Confirmar Entrega]                                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  4. SISTEMA PROCESSA                                         │
│     → Status ordem: ATENDIDA                                 │
│     → NFS e planilha salvos                                  │
│     → Notifica órgão                                        │
│     → Órgão valida documentos                                │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo 3: Sem Sistema (apenas email)

```
┌─────────────────────────────────────────────────────────────┐
│  1. ÓRGÃO ENVIA ORDEM POR EMAIL                             │
│     → PDF da ordem enviado ao fornecedor                     │
│     → Fornecedor não precisa acessar portal                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  2. FORNECEDOR ENTREGA E ENVIA NF EXTERNAMENTE               │
│     → Envia NF por WhatsApp/Email                            │
│     → Processo manual no órgão                               │
└─────────────────────────────────────────────────────────────┘
```

## Estrutura de Dados

### OrdemFornecimento - Novos Campos

```typescript
// Upload de documentos
@Column({ default: false })
nota_fiscal_anexada: boolean;

@Column({ type: 'varchar', nullable: true })
arquivo_nota_fiscal: string | null; // Caminho do arquivo

@Column({ type: 'varchar', nullable: true })
numero_nota_fiscal: string | null;

@Column({ type: 'date', nullable: true })
data_emissao_nf: Date | null;

@Column({ type: 'timestamp', nullable: true })
data_upload_nota: Date | null;

// Para serviços
@Column({ type: 'varchar', nullable: true })
arquivo_planilha_controle: string | null;

@Column({ type: 'varchar', nullable: true })
periodo_servico: string | null; // Ex: "01/2026"

@Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
saldo_servico_executado: number | null;
```

### Orgao - Novo Campo

```typescript
@Column({ default: true })
usar_sistema_ordens: boolean; // Se false, envia apenas por email
```

## Interface do Usuário

### Modal de Ciência de Entrega - FORNECIMENTO

```
┌─────────────────────────────────────────────────────────────┐
│  Dar Ciência de Entrega - OF-001/2026                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Informe os dados da entrega:                               │
│                                                             │
│  Data de Entrega: [__/__/____]                             │
│                                                             │
│  Nota Fiscal:                                               │
│  [Escolher arquivo] arquivo.pdf                            │
│  Formatos aceitos: PDF, JPG, PNG                            │
│                                                             │
│  Número da NF: [________________]                          │
│                                                             │
│  Data de Emissão: [__/__/____]                             │
│                                                             │
│  Observações:                                               │
│  [________________________________]                        │
│                                                             │
│  [Cancelar]  [Confirmar Entrega]                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Modal de Ciência de Entrega - SERVIÇO

```
┌─────────────────────────────────────────────────────────────┐
│  Dar Ciência de Entrega - OS-001/2026                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Informe os dados da prestação de serviço:                  │
│                                                             │
│  Período de Serviço: [01/2026]                              │
│                                                             │
│  Saldo Executado: [R$ ________]                             │
│                                                             │
│  Nota Fiscal de Serviço (NFS):                              │
│  [Escolher arquivo] nfs.pdf                                 │
│  Formatos aceitos: PDF                                       │
│                                                             │
│  Número da NFS: [________________]                          │
│                                                             │
│  Data de Emissão: [__/__/____]                             │
│                                                             │
│  Planilha de Controle de Saldo:                            │
│  [Escolher arquivo] controle.xlsx                           │
│  Formatos aceitos: Excel (XLSX), PDF, CSV                   │
│                                                             │
│  Observações:                                               │
│  [________________________________]                        │
│                                                             │
│  [Cancelar]  [Confirmar Entrega]                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Página do Órgão - Visualizar NF Anexada

```
┌─────────────────────────────────────────────────────────────┐
│  Ordem OF-001/2026 - Detalhes                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Status: ✅ ATENDIDA                                        │
│                                                             │
│  ────────────────────────────────────────────────────────  │
│                                                             │
│  📄 Nota Fiscal Anexada                                     │
│                                                             │
│  Arquivo: nf_001.pdf                                        │
│  Número: 123456                                             │
│  Data Emissão: 15/01/2026                                   │
│  Data Upload: 16/01/2026 14:30                              │
│                                                             │
│  [📥 Download NF]  [👁️ Visualizar]                        │
│                                                             │
│  ────────────────────────────────────────────────────────  │
│                                                             │
│  Para serviços:                                             │
│  📊 Planilha de Controle                                    │
│  [📥 Download Planilha]                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Endpoints da API

### Fornecedor

```
POST /api/fornecedores/ordens/:id/ciencia-entrega
Body: FormData {
  data_entrega: Date,
  arquivo_nota_fiscal: File,
  numero_nota_fiscal: string,
  data_emissao_nf: Date,
  // Para serviços:
  arquivo_planilha_controle?: File,
  periodo_servico?: string,
  saldo_servico_executado?: number,
  observacoes?: string
}
```

### Órgão

```
GET /api/almoxarifado/ordens/:id/nota-fiscal
→ Download do arquivo da NF

GET /api/almoxarifado/ordens/:id/planilha-controle
→ Download da planilha (se serviço)

PUT /api/orgaos/:id/configuracoes
Body: {
  usar_sistema_ordens: boolean
}
```

## Validações

### Upload de Arquivo

- Tamanho máximo: 10MB por arquivo
- Formatos aceitos:
  - NF: PDF, JPG, PNG
  - Planilha: XLSX, PDF, CSV
- Validação de tipo MIME
- Validação de extensão

### Dados Obrigatórios

**Fornecimento:**
- ✅ Arquivo NF
- ✅ Número da NF
- ✅ Data de emissão
- ✅ Data de entrega

**Serviço:**
- ✅ Arquivo NFS
- ✅ Arquivo Planilha
- ✅ Número da NFS
- ✅ Período de serviço
- ✅ Saldo executado

## Armazenamento

- Arquivos salvos em: `/uploads/ordens/{ordem_id}/`
- Estrutura:
  ```
  uploads/
    ordens/
      {ordem_id}/
        nota_fiscal.pdf
        planilha_controle.xlsx
  ```
- Backup automático
- Limpeza de arquivos antigos (após 5 anos)

## Notificações

- **Ao fornecedor anexar NF:**
  - Notifica órgão: "NF anexada na ordem OF-001/2026"
  - Email ao responsável do órgão

- **Ao órgão validar NF:**
  - Notifica fornecedor: "NF validada"
  - Status da ordem pode mudar para "NF VALIDADA"

## Próximos Passos

1. ✅ Documentação criada
2. ⏳ Adicionar campos na entidade OrdemFornecimento
3. ⏳ Adicionar campo `usar_sistema_ordens` no Orgao
4. ⏳ Criar endpoint de upload de NF
5. ⏳ Criar endpoint de download de NF
6. ⏳ Criar modal de upload no frontend
7. ⏳ Criar página de visualização no órgão
8. ⏳ Implementar validações
9. ⏳ Testes end-to-end
