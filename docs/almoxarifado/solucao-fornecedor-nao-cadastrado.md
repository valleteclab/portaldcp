# Solução: Fornecedor Não Cadastrado - Acesso a Ordens de Fornecimento

## Problema Identificado

Dois cenários diferentes:

1. **Órgão usa TODO o sistema** (licitações + contratos + almoxarifado)
   - ✅ Fornecedor já está cadastrado (obrigatório para licitações)
   - ✅ Usa login normal (CNPJ/Email + Senha)

2. **Órgão usa APENAS almoxarifado** (licitações em outro sistema)
   - ❌ Fornecedor pode NÃO estar cadastrado
   - ❌ Precisa acessar ordens sem cadastro completo

## Solução Proposta: Cadastro Mínimo Automático

### Fluxo 1: Envio de Ordem para Fornecedor Não Cadastrado

```
┌─────────────────────────────────────────────────────────────┐
│  ÓRGÃO ENVIA ORDEM                                          │
│  → Sistema verifica se fornecedor existe                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────┴──────────────┐
        │                              │
        ▼                              ▼
┌───────────────┐            ┌──────────────────┐
│ FORNECEDOR    │            │ FORNECEDOR       │
│ CADASTRADO    │            │ NÃO CADASTRADO   │
└───────┬───────┘            └────────┬─────────┘
        │                              │
        │                              ▼
        │                    ┌─────────────────────────────┐
        │                    │ CRIAR CADASTRO MÍNIMO       │
        │                    │ - CNPJ (do contrato)        │
        │                    │ - Razão Social (do contrato)│
        │                    │ - Email (do contrato)       │
        │                    │ - Senha temporária gerada   │
        │                    │ - Status: CADASTRO_MINIMO   │
        │                    └────────┬────────────────────┘
        │                              │
        │                              ▼
        │                    ┌─────────────────────────────┐
        │                    │ ENVIAR EMAIL COM:           │
        │                    │ - Link de acesso           │
        │                    │ - CNPJ                     │
        │                    │ - Senha temporária         │
        │                    │ - Instruções para alterar  │
        │                    └────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  NOTIFICAR FORNECEDOR                                       │
│  → Email com link para acessar ordem                       │
│  → Instruções de login                                      │
└─────────────────────────────────────────────────────────────┘
```

### Fluxo 2: Fornecedor Tenta Acessar Ordem

```
┌─────────────────────────────────────────────────────────────┐
│  FORNECEDOR ACESSA LINK DA ORDEM                            │
│  → Tenta login com CNPJ                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────┴──────────────┐
        │                              │
        ▼                              ▼
┌───────────────┐            ┌──────────────────┐
│ FORNECEDOR    │            │ FORNECEDOR        │
│ CADASTRADO    │            │ NÃO CADASTRADO   │
│               │            │ OU CADASTRO_MINIMO│
└───────┬───────┘            └────────┬─────────┘
        │                              │
        │                              ▼
        │                    ┌─────────────────────────────┐
        │                    │ REDIRECIONAR PARA:          │
        │                    │ /fornecedor/cadastro-minimo │
        │                    │                             │
        │                    │ SOLICITAR:                  │
        │                    │ - CNPJ (já preenchido)      │
        │                    │ - Email                      │
        │                    │ - Senha                      │
        │                    │ - Confirmar senha            │
        │                    └────────┬────────────────────┘
        │                              │
        │                              ▼
        │                    ┌─────────────────────────────┐
        │                    │ CRIAR CADASTRO MÍNIMO       │
        │                    │ → Login automático          │
        │                    │ → Redirecionar para ordem    │
        │                    └─────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│  ACESSO À ORDEM                                              │
│  → Visualizar ordem                                          │
│  → Dar ciência de recebimento/entrega                        │
└─────────────────────────────────────────────────────────────┘
```

## Implementação Técnica

### 1. Novo Status de Cadastro

Adicionar ao enum `StatusCadastro`:
```typescript
CADASTRO_MINIMO = 'CADASTRO_MINIMO' // Apenas dados básicos para acessar ordens
```

### 2. Cadastro Mínimo Automático

**Quando:** Ordem é enviada e fornecedor não existe

**Dados mínimos necessários:**
- CNPJ (do contrato)
- Razão Social (do contrato)
- Email (do contrato ou informado pelo órgão)
- Senha temporária (gerada automaticamente)

**Campos opcionais (podem ser preenchidos depois):**
- Endereço completo
- Telefone
- Representante legal
- Documentos

### 3. Endpoint de Cadastro Mínimo

```
POST /api/fornecedores/cadastro-minimo
Body: {
  cnpj: string,
  email: string,
  senha: string,
  confirmar_senha: string
}
```

### 4. Endpoint de Verificação de Cadastro

```
GET /api/fornecedores/verificar-cadastro/:cnpj
Response: {
  existe: boolean,
  tem_cadastro_completo: boolean,
  status: StatusCadastro
}
```

### 5. Fluxo de Login Adaptado

**Se fornecedor tem `CADASTRO_MINIMO`:**
- Permite login normalmente
- Acesso limitado a:
  - Visualizar suas ordens
  - Dar ciência de recebimento/entrega
  - Completar cadastro (opcional)

**Se fornecedor não existe:**
- Redireciona para cadastro mínimo
- Após cadastro, login automático

## Interface do Usuário

### Tela de Cadastro Mínimo

```
┌─────────────────────────────────────────────────────────────┐
│  Cadastro Rápido - Acesso às Ordens                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Você recebeu uma ordem de fornecimento.                   │
│  Para acessá-la, precisamos de alguns dados básicos:       │
│                                                             │
│  CNPJ: [12345678000190] (já preenchido)                    │
│                                                             │
│  Email: [________________]                                 │
│                                                             │
│  Senha: [________________]                                 │
│                                                             │
│  Confirmar Senha: [________________]                       │
│                                                             │
│  [ ] Desejo completar meu cadastro agora (opcional)       │
│                                                             │
│  [Criar Cadastro e Acessar Ordem]                          │
│                                                             │
│  Já tem cadastro? [Fazer Login]                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Dashboard do Fornecedor com Cadastro Mínimo

```
┌─────────────────────────────────────────────────────────────┐
│  Bem-vindo, [Razão Social]                                  │
│                                                             │
│  ⚠️ Seu cadastro está incompleto                            │
│  Complete seu cadastro para participar de licitações        │
│  [Completar Cadastro]                                       │
│                                                             │
│  ────────────────────────────────────────────────────────  │
│                                                             │
│  📋 Ordens de Fornecimento                                 │
│                                                             │
│  [Card da Ordem]                                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Vantagens da Solução

1. ✅ **Flexível**: Funciona para ambos os cenários
2. ✅ **Automático**: Cria cadastro mínimo quando necessário
3. ✅ **Seguro**: Mantém autenticação por senha
4. ✅ **Escalável**: Fornecedor pode completar cadastro depois
5. ✅ **Não invasivo**: Não força cadastro completo imediatamente

## Decisões Técnicas

### Quando Criar Cadastro Mínimo?

**Opção A: Ao enviar ordem** (Recomendado)
- Prós: Fornecedor já recebe email com login pronto
- Contras: Pode criar cadastros não utilizados

**Opção B: Ao tentar acessar ordem** (Alternativa)
- Prós: Só cria quando realmente necessário
- Contras: Requer mais um passo

**Recomendação:** Opção A (ao enviar ordem)

### Dados do Contrato

Quando criar cadastro mínimo, usar dados do contrato:
- CNPJ do fornecedor
- Razão Social do fornecedor
- Email do fornecedor (se disponível no contrato)
- Se email não disponível, solicitar no envio da ordem

### Senha Temporária

- Gerar senha aleatória segura (12 caracteres)
- Fornecedor deve alterar no primeiro login
- Enviar por email junto com link de acesso

## Próximos Passos

1. ✅ Análise completa
2. ⏳ Adicionar status `CADASTRO_MINIMO`
3. ⏳ Criar endpoint de cadastro mínimo
4. ⏳ Modificar envio de ordem para criar cadastro automático
5. ⏳ Criar tela de cadastro mínimo no frontend
6. ⏳ Adaptar dashboard para cadastro mínimo
7. ⏳ Testes end-to-end
