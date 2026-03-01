# Implementação Resend API - Resumo

## ✅ Implementado

### Backend
1. **Entidade Orgao** - Novos campos:
   - `email_resend_api_key` (string, nullable)
   - `email_resend_from` (string, nullable)
   - `email_metodo` (enum: 'SMTP' | 'RESEND', default: 'SMTP')

2. **Migration** - `1772600000000-AddResendEmailConfig.ts`
   - Adiciona os 3 novos campos à tabela `orgaos`

3. **EmailService** - Atualizado para suportar ambos métodos:
   - `getResendConfig()` - obtém configuração Resend (órgão ou global)
   - `getEmailConfig()` - decide qual método usar
   - `enviar()` - roteia para SMTP ou Resend
   - `enviarResend()` - envio via API Resend
   - `enviarSmtp()` - envio via SMTP (refatorado)
   - `testarConexao()` - funciona com ambos métodos

4. **Suporte a Variáveis Globais**:
   - `RESEND_API_KEY` - API Key global (fallback)
   - `RESEND_FROM_EMAIL` - Email remetente global (fallback)
   - Configuração do órgão tem prioridade sobre global

5. **Dependência** - `resend` instalado via npm

### Frontend
1. **Modal Configurar Email** - Nova interface:
   - Tab "Método" para escolher SMTP vs Resend
   - Configuração Resend: API Key + Email From (opcionais)
   - Dica visual sobre configuração global
   - Validações específicas para cada método
   - Botão "Testar" dinâmico (Testar SMTP/Testar Resend)

2. **FormEmail State** - Campos adicionados:
   - `email_metodo`
   - `email_resend_api_key`
   - `email_resend_from`

3. **Validações e UX**:
   - Instruções passo a passo para Resend
   - Links para documentação
   - Vantagens destacadas (funciona em qualquer hospedagem)
   - Campos opcionais (usa variáveis globais se vazios)

## 📋 Como Configurar

### Opção 1: Variáveis Globais (Recomendado para Railway)

No Railway, configure as variáveis de ambiente:

```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxx
RESEND_FROM_EMAIL=contato@orgao.gov.br
```

**Vantagens:**
- ✅ Única configuração para todos os órgãos
- ✅ Não expõe a API Key no banco de dados
- ✅ Fácil de gerenciar e atualizar

### Opção 2: Configuração por Órgão

1. Criar conta em https://resend.com
2. Adicionar domínio verificado
3. Obter API Key
4. Configurar no admin do órgão:
   - Método: Resend API
   - API Key: re_xxxxxxxxxxxxxxxx
   - Email From: contato@orgao.gov.br

## 📋 Próximos Passos

### Para Rodar a Migration:
1. Iniciar PostgreSQL (Docker Desktop ou local)
2. `cd backend && npx ts-node src/data-source.ts`

### Para Testar:
1. Criar conta em https://resend.com
2. Rodar migration quando PostgreSQL estiver ativo
3. Configurar variáveis globais no Railway OU por órgão
4. Testar envio de email

## 🔧 Limitações Conhecidas

### Resend API:
- **Anexos**: Não suporta attachments na API básica (aviso no log)
- **Múltiplos destinatários**: Suporta apenas 1 por request (implementado)
- **Custo**: Gratuito até 100 emails/dia, depois pago

### SMTP:
- Continua funcionando como antes
- Bloqueado em algumas hospedagens (motivo da implementação)

## 📝 Notas de Implementação

- Senhas (SMTP e Resend) são criptografadas no banco
- Método padrão é SMTP (backwards compatibility)
- UI desabilita campos irrelevantes conforme método escolhido
- Teste envia email para o próprio usuário configurado
- **Prioridade**: Config órgão > Variáveis globais > Erro
