# Sistema de Aprovação de Requisições - Almoxarifado

## Visão Geral

O sistema de aprovação de requisições do módulo Almoxarifado permite controle granular sobre quem pode autorizar pedidos de materiais e serviços, baseado em:

- **Valor da requisição** (alçadas por faixa de valor)
- **Perfil do usuário** (ADMIN, GESTOR, etc.)
- **Permissão individual** (campo `pode_aprovar_requisicoes`)
- **Regras configuráveis** por órgão

---

## Arquitetura do Sistema

### Entidades Envolvidas

```
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Usuario                      ConfiguracaoAprovacao             │
│  ├── id                       ├── id                            │
│  ├── nome                     ├── orgao_id                      │
│  ├── email                    ├── nivel                         │
│  ├── role                     ├── nome                          │
│  ├── orgao_id                 ├── valor_minimo                  │
│  ├── pode_aprovar_requisicoes ├── valor_maximo                  │
│  └── ...                      ├── tipo_aprovador                │
│                               ├── perfis_permitidos             │
│                               ├── bloquear_auto_aprovacao       │
│                               ├── exigir_justificativa_aprovacao│
│                               ├── notificar_email_aprovador     │
│                               └── ...                           │
│                                                                  │
│  Requisicao                   Notificacao                       │
│  ├── id                       ├── id                            │
│  ├── orgao_id                 ├── usuario_id                    │
│  ├── numero                   ├── tipo                          │
│  ├── status                   ├── titulo                        │
│  ├── valor_total_estimado     ├── mensagem                      │
│  ├── usuario_solicitante_id   ├── lida                          │
│  └── ...                      └── ...                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Arquivos Principais

| Arquivo | Descrição |
|---------|-----------|
| `backend/src/usuarios/entities/usuario.entity.ts` | Entidade com campo `pode_aprovar_requisicoes` |
| `backend/src/almoxarifado/entities/configuracao-aprovacao.entity.ts` | Níveis de aprovação por órgão |
| `backend/src/almoxarifado/configuracao-aprovacao.service.ts` | Lógica de verificação de permissões |
| `backend/src/notificacoes/notificacoes.service.ts` | Envio de notificações |
| `frontend/src/app/admin/configuracoes-aprovacao/page.tsx` | Tela de configuração (admin) |
| `frontend/src/app/orgao/almoxarifado/aprovacoes/page.tsx` | Tela de aprovações (usuário) |

---

## Fluxo de Aprovação

### 1. Criação da Requisição

```
┌─────────────────────────────────────────────────────────────────┐
│                    USUÁRIO CRIA REQUISIÇÃO                       │
│                                                                  │
│  1. Acessa: /orgao/almoxarifado/requisicoes/nova                │
│  2. Preenche dados (setor, justificativa, itens)                │
│  3. Salva como RASCUNHO                                         │
│  4. Envia para aprovação → Status: AGUARDANDO_AUTORIZACAO       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 SISTEMA NOTIFICA APROVADORES                     │
│                                                                  │
│  • Identifica aprovadores elegíveis baseado no valor            │
│  • Cria notificações no sistema (badge no header)               │
│  • Envia email (se configurado)                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Verificação de Permissão

Quando um usuário tenta aprovar uma requisição:

```
┌─────────────────────────────────────────────────────────────────┐
│              VERIFICAÇÃO DE PERMISSÃO DE APROVAÇÃO               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Usuário tem pode_aprovar_requisicoes = true?                │
│     └── NÃO → ❌ BLOQUEADO (não vê nem a página de aprovações) │
│     └── SIM → Continua...                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Busca configuração de nível aplicável ao valor              │
│                                                                  │
│     Exemplo: Requisição = R$ 15.000                             │
│     • Nível 1: R$ 0 - R$ 5.000 → Não se aplica                 │
│     • Nível 2: R$ 5.001 - R$ 50.000 → ✅ APLICA-SE             │
│                                                                  │
│     Se não encontrar nível → Usa regras padrão                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Verifica regras do nível encontrado                         │
│                                                                  │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ bloquear_auto_aprovacao = true?                         │ │
│     │   E usuário é o solicitante?                            │ │
│     │   └── SIM → ❌ "Você não pode aprovar sua própria       │ │
│     │              requisição"                                 │ │
│     └─────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ tipo_aprovador = PERFIL_ESPECIFICO?                     │ │
│     │   └── Verifica se perfil do usuário está na lista       │ │
│     │       └── NÃO → ❌ "Apenas GESTOR pode aprovar"         │ │
│     └─────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ tipo_aprovador = USUARIO_ESPECIFICO?                    │ │
│     │   └── Verifica se ID do usuário está na lista           │ │
│     │       └── NÃO → ❌ "Você não está autorizado"           │ │
│     └─────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ✅ APROVAÇÃO PERMITIDA                        │
└─────────────────────────────────────────────────────────────────┘
```

### 3. Resultado da Aprovação

```
┌─────────────────────────────────────────────────────────────────┐
│                      REQUISIÇÃO APROVADA                         │
│                                                                  │
│  1. Status muda para: AUTORIZADA                                │
│  2. Saldo é RESERVADO no contrato (quantidade_empenhada)        │
│  3. Registra autorizador e data                                 │
│  4. Notifica solicitante (sistema + email)                      │
│  5. Requisição fica pronta para gerar Ordem de Fornecimento     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      REQUISIÇÃO NEGADA                           │
│                                                                  │
│  1. Status muda para: NEGADA                                    │
│  2. Saldo NÃO é reservado                                       │
│  3. Registra autorizador, data e MOTIVO (obrigatório)          │
│  4. Notifica solicitante com o motivo                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Configuração de Níveis de Aprovação

### Acesso

**Apenas Superadmin** pode configurar níveis de aprovação.

```
Portal Admin → Config. Aprovações → Seleciona Órgão → Configura
```

### Campos da Configuração

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `nivel` | int | Ordem de prioridade (1, 2, 3...) |
| `nome` | string | Nome descritivo (ex: "Aprovação Gestor") |
| `descricao` | string | Descrição opcional |
| `valor_minimo` | decimal | Valor mínimo para este nível (R$) |
| `valor_maximo` | decimal | Valor máximo (null = sem limite) |
| `tipo_aprovador` | enum | Quem pode aprovar |
| `perfis_permitidos` | array | Lista de perfis (se tipo = PERFIL_ESPECIFICO) |
| `usuarios_aprovadores_ids` | array | Lista de IDs (se tipo = USUARIO_ESPECIFICO) |
| `bloquear_auto_aprovacao` | bool | Impede aprovar própria requisição |
| `exigir_justificativa_aprovacao` | bool | Obriga observação ao aprovar |
| `exigir_justificativa_negacao` | bool | Obriga motivo ao negar |
| `notificar_email_aprovador` | bool | Envia email quando há requisição pendente |
| `notificar_email_solicitante` | bool | Envia email sobre resultado |

### Tipos de Aprovador

| Tipo | Descrição |
|------|-----------|
| `QUALQUER_USUARIO` | Qualquer usuário com `pode_aprovar_requisicoes = true` |
| `PERFIL_ESPECIFICO` | Apenas usuários com perfil na lista `perfis_permitidos` |
| `USUARIO_ESPECIFICO` | Apenas usuários com ID na lista `usuarios_aprovadores_ids` |
| `GESTOR_SETOR` | Gestor do setor que fez a requisição (futuro) |

### Exemplo de Configuração

#### Órgão Grande (Múltiplos Aprovadores)

| Nível | Nome | Faixa de Valor | Tipo | Perfis | Auto-Aprov |
|-------|------|----------------|------|--------|------------|
| 1 | Aprovação Básica | R$ 0 - R$ 5.000 | QUALQUER_USUARIO | - | ❌ Bloqueado |
| 2 | Aprovação Gestor | R$ 5.001 - R$ 50.000 | PERFIL_ESPECIFICO | GESTOR_ALMOXARIFADO | ❌ Bloqueado |
| 3 | Ordenador Despesa | > R$ 50.000 | PERFIL_ESPECIFICO | ORDENADOR_DESPESA | ❌ Bloqueado |

#### Órgão Pequeno (1 Aprovador)

| Nível | Nome | Faixa de Valor | Tipo | Auto-Aprov |
|-------|------|----------------|------|------------|
| 1 | Aprovação Única | R$ 0 - Sem limite | QUALQUER_USUARIO | ✅ **Permitido** |

> **Nota**: Para órgãos com apenas 1 aprovador, desativar "Bloquear auto-aprovação" permite que a pessoa aprove suas próprias requisições.

---

## Permissão de Usuário

### Campo `pode_aprovar_requisicoes`

Localização: `Admin → Usuários → Editar Usuário`

```
┌────────────────────────────────────────────────────────────────┐
│  Permissão de Aprovação                                        │
│                                                                │
│  ☑️ Pode aprovar requisições                                   │
│     Habilita o acesso à página de aprovações do almoxarifado   │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

### Comportamento

| `pode_aprovar_requisicoes` | Resultado |
|---------------------------|-----------|
| `false` (padrão) | Usuário NÃO vê menu "Aprovações", NÃO pode acessar a página |
| `true` | Usuário VÊ menu "Aprovações", PODE aprovar (respeitando níveis) |

---

## Sistema de Notificações

### Tipos de Notificação

| Tipo | Quando | Para Quem |
|------|--------|-----------|
| `REQUISICAO_AGUARDANDO_APROVACAO` | Requisição enviada para aprovação | Aprovadores elegíveis |
| `REQUISICAO_APROVADA` | Requisição foi aprovada | Solicitante |
| `REQUISICAO_NEGADA` | Requisição foi negada | Solicitante |

### Canais

1. **Sistema (in-app)**: Badge no header com contador, popover com lista
2. **Email**: Enviado se configurado no nível de aprovação (preparado para integração futura)

### Interface de Notificações

```
┌─────────────────────────────────────────┐
│  🔔 (3)                                 │  ← Badge no header
├─────────────────────────────────────────┤
│  📋 Nova requisição aguardando          │
│     REQ-0015/2026 de João Silva         │
│     R$ 15.000,00                        │
│     há 5 minutos                        │
├─────────────────────────────────────────┤
│  ✅ Requisição aprovada                 │
│     REQ-0014/2026 foi aprovada          │
│     por Maria Santos                    │
│     há 1 hora                           │
├─────────────────────────────────────────┤
│  Marcar todas como lidas                │
└─────────────────────────────────────────┘
```

---

## Fluxo Completo - Diagrama

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   USUÁRIO    │     │   SISTEMA    │     │  APROVADOR   │
│ (Solicitante)│     │              │     │              │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │ Cria requisição    │                    │
       │───────────────────>│                    │
       │                    │                    │
       │ Envia p/ aprovação │                    │
       │───────────────────>│                    │
       │                    │                    │
       │                    │ Notifica aprovadores
       │                    │───────────────────>│
       │                    │                    │
       │                    │     Acessa página  │
       │                    │<───────────────────│
       │                    │                    │
       │                    │ Verifica permissão │
       │                    │<───────────────────│
       │                    │                    │
       │                    │    ✅ Aprova       │
       │                    │<───────────────────│
       │                    │                    │
       │                    │ Reserva saldo      │
       │                    │ Atualiza status    │
       │                    │                    │
       │  Notifica resultado│                    │
       │<───────────────────│                    │
       │                    │                    │
       ▼                    ▼                    ▼
```

---

## Endpoints da API

### Configuração de Aprovação (Admin)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/almoxarifado/configuracoes/aprovacao?orgaoId=X` | Lista configurações |
| POST | `/api/almoxarifado/configuracoes/aprovacao?orgaoId=X` | Cria nível |
| PUT | `/api/almoxarifado/configuracoes/aprovacao/:id?orgaoId=X` | Atualiza nível |
| DELETE | `/api/almoxarifado/configuracoes/aprovacao/:id?orgaoId=X` | Desativa nível |
| POST | `/api/almoxarifado/configuracoes/aprovacao/padrao?orgaoId=X` | Cria config padrão |

### Aprovação de Requisições

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/almoxarifado/requisicoes/pendentes` | Lista pendentes |
| POST | `/api/almoxarifado/requisicoes/:id/autorizar` | Aprova requisição |
| POST | `/api/almoxarifado/requisicoes/:id/negar` | Nega requisição |
| POST | `/api/almoxarifado/requisicoes/:id/verificar-permissao-aprovacao` | Verifica permissão |

### Notificações

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/notificacoes` | Lista notificações do usuário |
| GET | `/api/notificacoes/nao-lidas/count` | Conta não lidas |
| POST | `/api/notificacoes/:id/marcar-lida` | Marca como lida |
| POST | `/api/notificacoes/marcar-todas-lidas` | Marca todas como lidas |

---

## Considerações de Segurança

1. **Dupla verificação**: Frontend filtra menu + Backend verifica permissão
2. **Auditoria**: Toda aprovação/negação registra usuário e timestamp
3. **Isolamento por órgão**: Usuário só vê requisições do seu órgão
4. **Tokens JWT**: Todas as requisições são autenticadas

---

## Histórico de Decisões

| Data | Decisão | Motivo |
|------|---------|--------|
| 2026-01-20 | Permissão de aprovador por usuário (`pode_aprovar_requisicoes`) | Controle granular de quem pode aprovar |
| 2026-01-20 | Configuração de níveis apenas pelo admin | Garantir controle institucional das alçadas |
| 2026-01-20 | Opção de permitir auto-aprovação | Suportar órgãos pequenos com 1 aprovador |
| 2026-01-20 | Sistema de notificações in-app + email | Garantir que aprovadores sejam informados |

---

*Documentação gerada em: 2026-01-20*
*Versão: 1.0*
