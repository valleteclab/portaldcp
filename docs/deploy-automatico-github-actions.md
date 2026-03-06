# Deploy Automático com GitHub Actions

Este guia configura deploy automático na VPS a cada `git push` usando GitHub Actions.

## Passo 1: Gerar Chave SSH na VPS

Execute na VPS (SSH):

```bash
# Gerar chave SSH (pressione Enter em todas as perguntas)
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions -N ""

# Adicionar chave pública ao authorized_keys
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# Mostrar chave PRIVADA (copie todo o conteúdo)
cat ~/.ssh/github_actions
```

**Copie toda a saída** do último comando (incluindo `-----BEGIN` e `-----END`).

## Passo 2: Adicionar Secret no GitHub

1. Vá em: https://github.com/valleteclab/portaldcp/settings/secrets/actions
2. Clique em **New repository secret**
3. Configure:
   - **Name**: `VPS_SSH_KEY`
   - **Value**: Cole a chave privada que você copiou
4. Clique em **Add secret**

## Passo 3: Fazer Commit do Workflow

O arquivo `.github/workflows/deploy-vps.yml` já foi criado. Faça commit:

```bash
git add .github/workflows/deploy-vps.yml
git commit -m "ci: adicionar deploy automático via GitHub Actions"
git push
```

## Passo 4: Testar Deploy Automático

Após fazer o push acima:

1. Vá em: https://github.com/valleteclab/portaldcp/actions
2. Você verá o workflow "Deploy to VPS Hostinger" rodando
3. Clique nele para ver os logs em tempo real

## Como Funciona

A cada `git push` na branch `main`:
1. GitHub Actions detecta o push
2. Conecta via SSH na VPS (72.60.4.218)
3. Executa:
   ```bash
   cd /opt/portaldcp
   git pull origin main
   docker-compose -f docker-compose.coolify.yml up -d --build --force-recreate
   ```
4. Mostra status dos containers

## Verificação

Após cada deploy automático, acesse:
- Frontend: http://72.60.4.218:3000
- Backend: http://72.60.4.218:3001/api/health

## Troubleshooting

### Erro: "Permission denied (publickey)"
- Verifique se a chave SSH foi adicionada corretamente ao secret `VPS_SSH_KEY`
- Certifique-se de que copiou a chave PRIVADA (não a pública)

### Erro: "docker-compose: command not found"
- Execute o script de deploy manual primeiro: `bash /opt/portaldcp/deploy-vps.sh`

### Deploy não inicia
- Verifique os logs em: https://github.com/valleteclab/portaldcp/actions
- Clique no workflow com erro para ver detalhes

## Desabilitar Deploy Automático

Se quiser desabilitar temporariamente:

1. Vá em: https://github.com/valleteclab/portaldcp/actions
2. Clique em "Deploy to VPS Hostinger" (lado esquerdo)
3. Clique nos 3 pontinhos → **Disable workflow**

Ou delete o arquivo `.github/workflows/deploy-vps.yml`
