# 🔍 Debug: Por que as notificações não estão chegando?

## Checklist de Verificação

### 1. ✅ Verificar se há usuários com permissão de aprovação

**No Admin Portal:**
- Acesse `/admin/usuarios`
- Verifique se há usuários com `pode_aprovar_requisicoes = true`
- Se não houver, marque pelo menos um usuário como aprovador

**Query SQL para verificar:**
```sql
SELECT id, email, role, pode_aprovar_requisicoes, ativo 
FROM usuario 
WHERE orgao_id = 'SEU_ORGAO_ID' 
  AND pode_aprovar_requisicoes = true 
  AND ativo = true;
```

### 2. ✅ Verificar se há configuração de aprovação

**No Admin Portal:**
- Acesse `/admin/configuracoes-aprovacao`
- Selecione o órgão
- Verifique se há configuração criada

**Se não houver configuração:**
- O sistema usa comportamento padrão: todos os usuários com `pode_aprovar_requisicoes=true` podem aprovar
- Mas se o solicitante for o único aprovador e `bloquear_auto_aprovacao=true`, nenhuma notificação será criada

### 3. ✅ Verificar logs do backend

Quando você envia uma requisição para aprovação, procure nos logs:

```
[NOTIFICAÇÃO] Enviando requisição REQ-0001/2025 para aprovação. Usuários do órgão recebidos: X
[NOTIFICAÇÃO] Aprovadores elegíveis encontrados: Y
[NOTIFICAÇÃO] Criando notificações para Y aprovadores
[NOTIFICAÇÃO] Notificações criadas com sucesso: Z notificações
```

**Possíveis problemas nos logs:**

#### Problema 1: "Usuários do órgão recebidos: 0"
**Causa:** Não há usuários com `pode_aprovar_requisicoes=true`
**Solução:** Marcar usuários como aprovadores no admin

#### Problema 2: "Aprovadores elegíveis encontrados: 0"
**Causa:** 
- Configuração muito restritiva (PERFIL_ESPECIFICO ou USUARIO_ESPECIFICO)
- Solicitante é o único aprovador e `bloquear_auto_aprovacao=true`
**Solução:** Ajustar configuração de aprovação ou criar outro usuário aprovador

#### Problema 3: "Notificações criadas com sucesso: 0"
**Causa:** Erro ao criar notificações no banco
**Solução:** Verificar logs de erro do NotificacoesService

### 4. ✅ Verificar se as notificações estão no banco

**Query SQL:**
```sql
SELECT 
  id, 
  usuario_id, 
  tipo, 
  titulo, 
  mensagem, 
  lida, 
  created_at 
FROM notificacao 
WHERE orgao_id = 'SEU_ORGAO_ID' 
ORDER BY created_at DESC 
LIMIT 10;
```

### 5. ✅ Verificar endpoint de notificações

**Teste manual:**
```bash
# Contar notificações não lidas
curl -X GET "https://portaldcp-production.up.railway.app/api/notificacoes/nao-lidas/count" \
  -H "Authorization: Bearer SEU_TOKEN"

# Listar notificações
curl -X GET "https://portaldcp-production.up.railway.app/api/notificacoes?limite=20" \
  -H "Authorization: Bearer SEU_TOKEN"
```

### 6. ✅ Verificar frontend

**No console do navegador:**
- Abra DevTools (F12)
- Vá para a aba Network
- Filtre por "notificacoes"
- Envie uma requisição para aprovação
- Verifique se há requisições para `/api/notificacoes/nao-lidas/count`
- Verifique o status code (deve ser 200)
- Verifique a resposta (deve ter `{ count: X }`)

## Cenários Comuns

### Cenário 1: Usuário único no órgão
**Problema:** Se você é o único usuário e tem `pode_aprovar_requisicoes=true`, mas `bloquear_auto_aprovacao=true`, nenhuma notificação será criada.

**Solução:** 
- Criar outro usuário com permissão de aprovação, OU
- Desabilitar `bloquear_auto_aprovacao` na configuração

### Cenário 2: Configuração muito restritiva
**Problema:** Configuração com `PERFIL_ESPECIFICO` ou `USUARIO_ESPECIFICO` que não inclui nenhum usuário.

**Solução:** Ajustar configuração para incluir usuários corretos

### Cenário 3: Notificações criadas mas não aparecem
**Problema:** Notificações estão no banco mas o frontend não está buscando corretamente.

**Verificar:**
- Token de autenticação está correto?
- `usuario_id` na notificação corresponde ao `user.sub` do JWT?
- `orgao_id` na notificação corresponde ao órgão do usuário logado?

## Logs Adicionados para Debug

Foram adicionados logs detalhados em:
- `RequisicaoService.enviarParaAutorizacao()` - Loga cada etapa do processo
- `ConfiguracaoAprovacaoService.listarAprovadores()` - Loga filtros aplicados

Procure por `[NOTIFICAÇÃO]` nos logs para rastrear o fluxo completo.
