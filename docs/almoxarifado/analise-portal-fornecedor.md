# Análise: Portal do Fornecedor - Ordens de Fornecimento

## Contexto

Após aprovação de requisição, o sistema deve:
1. Gerar ordem de fornecimento automaticamente
2. Permitir envio da ordem ao fornecedor
3. Fornecedor visualizar ordens recebidas
4. Fornecedor dar ciência de recebimento/entrega

## Análise do Sistema Atual

### Autenticação de Fornecedores

O sistema já possui:
- ✅ Login por CNPJ + Senha (`/api/auth/login/fornecedor`)
- ✅ Login por Email + Senha (`/api/auth/login/fornecedor/email`)
- ✅ JWT para autenticação de fornecedores
- ✅ Portal do fornecedor em `/fornecedor`
- ✅ Controle de acesso baseado em JWT

### Entidades Existentes

- ✅ `OrdemFornecimento` - Já implementada
- ✅ `StatusOrdemFornecimento` - Enum com todos os status necessários
- ✅ Relacionamento com `Fornecedor`, `Contrato`, `Requisicao`

## Recomendações

### 1. Autenticação do Fornecedor

**✅ RECOMENDAÇÃO: Manter sistema atual (CNPJ/Email + Senha)**

**Justificativa:**
- Sistema já implementado e funcional
- Segurança adequada com JWT
- Fornecedores já cadastrados podem usar
- Não requer mudanças na infraestrutura

**Alternativa para fornecedores não cadastrados:**
- Criar endpoint público para consultar ordem por CNPJ + Token único
- Token enviado por email quando ordem é enviada
- Acesso limitado apenas à ordem específica (sem acesso ao portal completo)

### 2. Geração Automática de Ordem

**Implementação:**
- Modificar método `autorizar()` em `RequisicaoService`
- Após aprovar requisição, chamar `gerarOrdem()` automaticamente
- Status inicial: `EMITIDA` (aguardando envio)
- Atualizar status da requisição para `ORDEM_GERADA`

**Fluxo:**
```
Aprovar Requisição
  ↓
Gerar Ordem Automaticamente (status: EMITIDA)
  ↓
Atualizar Requisição (status: ORDEM_GERADA)
  ↓
Notificar solicitante que ordem foi gerada
```

### 3. Envio da Ordem ao Fornecedor

**Implementação:**
- Criar endpoint `POST /api/almoxarifado/ordens/:id/enviar`
- Atualizar status para `ENVIADA`
- Registrar data de envio
- Enviar email ao fornecedor (se configurado)
- Criar notificação no sistema para o fornecedor

**Fluxo:**
```
Ordem EMITIDA
  ↓
Usuário clica "Enviar ao Fornecedor"
  ↓
Status muda para ENVIADA
  ↓
Notifica fornecedor (email + sistema)
```

### 4. Portal do Fornecedor - Visualização de Ordens

**Estrutura:**
```
/fornecedor/ordens
  ├── Lista de ordens (pendentes, em atendimento, atendidas)
  ├── Detalhes da ordem
  ├── Itens da ordem
  └── Ações disponíveis
```

**Endpoints necessários:**
- `GET /api/fornecedores/ordens` - Lista ordens do fornecedor logado
- `GET /api/fornecedores/ordens/:id` - Detalhes da ordem
- `POST /api/fornecedores/ordens/:id/ciencia-recebimento` - Dar ciência de recebimento
- `POST /api/fornecedores/ordens/:id/ciencia-entrega` - Dar ciência de entrega

### 5. Ciência de Recebimento/Entrega

**Ciência de Recebimento:**
- Fornecedor confirma que recebeu a ordem
- Status muda para `EM_ATENDIMENTO`
- Fornecedor pode informar data prevista de entrega
- Notifica órgão que ordem foi recebida

**Ciência de Entrega:**
- Fornecedor informa que entregou os materiais
- Informa data de entrega realizada
- Status muda para `ATENDIDA` (se total) ou `ATENDIDA_PARCIAL`
- Notifica órgão que entrega foi realizada

## Fluxo Completo Proposto

```
┌─────────────────────────────────────────────────────────────┐
│  1. REQUISIÇÃO APROVADA                                      │
│     → Gera ordem automaticamente (EMITIDA)                  │
│     → Status requisição: ORDEM_GERADA                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  2. ÓRGÃO ENVIA ORDEM AO FORNECEDOR                          │
│     → Status ordem: ENVIADA                                  │
│     → Notifica fornecedor (email + sistema)                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  3. FORNECEDOR ACESSA PORTAL                                 │
│     → Login com CNPJ/Email + Senha                           │
│     → Visualiza ordens recebidas                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  4. FORNECEDOR DÁ CIÊNCIA DE RECEBIMENTO                     │
│     → Status ordem: EM_ATENDIMENTO                           │
│     → Informa data prevista de entrega                       │
│     → Notifica órgão                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  5. FORNECEDOR DÁ CIÊNCIA DE ENTREGA                         │
│     → Status ordem: ATENDIDA                                 │
│     → Informa data de entrega realizada                      │
│     → Notifica órgão                                         │
└─────────────────────────────────────────────────────────────┘
```

## Implementação Técnica

### Backend

1. **Modificar `RequisicaoService.autorizar()`**
   - Após aprovar, chamar `OrdemFornecimentoService.gerarOrdem()`
   - Usar dados da requisição para gerar ordem

2. **Criar endpoints para fornecedor**
   - `GET /api/fornecedores/ordens` - Lista ordens
   - `GET /api/fornecedores/ordens/:id` - Detalhes
   - `POST /api/fornecedores/ordens/:id/ciencia-recebimento`
   - `POST /api/fornecedores/ordens/:id/ciencia-entrega`

3. **Adicionar campos na entidade `OrdemFornecimento`**
   - `data_ciencia_recebimento: Date | null`
   - `data_ciencia_entrega: Date | null`
   - `fornecedor_observacoes: string | null`

### Frontend

1. **Página de Ordens do Fornecedor**
   - `/fornecedor/ordens` - Lista de ordens
   - `/fornecedor/ordens/:id` - Detalhes da ordem
   - Cards com status, número, data, valor
   - Botões de ação conforme status

2. **Componentes**
   - Lista de ordens com filtros (status, data)
   - Card de ordem com informações principais
   - Modal para ciência de recebimento
   - Modal para ciência de entrega

## Segurança

- ✅ Autenticação JWT obrigatória para todas as rotas
- ✅ Fornecedor só vê suas próprias ordens (filtro por `fornecedor_id`)
- ✅ Validação de status antes de permitir ações
- ✅ Auditoria de todas as ações (quem, quando, o quê)

## Notificações

- Email ao fornecedor quando ordem é enviada
- Notificação no sistema quando ordem é recebida pelo fornecedor
- Notificação ao órgão quando fornecedor dá ciência de recebimento/entrega

## Próximos Passos

1. ✅ Feature criada no DevContext
2. ⏳ Implementar geração automática de ordem
3. ⏳ Criar endpoints para fornecedor
4. ⏳ Criar páginas no frontend
5. ⏳ Implementar notificações
6. ⏳ Testes end-to-end
