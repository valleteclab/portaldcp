# Deploy PortalDCP na VPS Hostinger

## Passo 1: Conectar na VPS via SSH

```bash
ssh root@72.60.4.218
```

## Passo 2: Executar script de deploy

```bash
# Baixar e executar script de deploy
curl -fsSL https://raw.githubusercontent.com/valleteclab/portaldcp/main/deploy-vps.sh -o deploy-vps.sh
chmod +x deploy-vps.sh
bash deploy-vps.sh
```

O script vai:
- ✅ Instalar Docker e Docker Compose
- ✅ Clonar o repositório
- ✅ Criar arquivo `.env` com configurações padrão
- ✅ Fazer build e subir todos os containers (PostgreSQL, Redis, Backend, Frontend)
- ✅ Verificar status

## Passo 3: Editar variáveis de ambiente (se necessário)

```bash
nano /opt/portaldcp/.env
```

Ajuste as URLs e credenciais conforme necessário.

## Passo 4: Configurar Deploy Automático (Opcional)

### 4.1. Instalar servidor webhook

```bash
# Instalar webhook
apt-get update
apt-get install -y webhook

# Criar configuração do webhook
mkdir -p /etc/webhook
cat > /etc/webhook/hooks.json << 'EOF'
[
  {
    "id": "portaldcp-deploy",
    "execute-command": "/opt/portaldcp/deploy-webhook.sh",
    "command-working-directory": "/opt/portaldcp",
    "response-message": "Deploy iniciado",
    "trigger-rule": {
      "match": {
        "type": "payload-hash-sha256",
        "secret": "SEU_SECRET_AQUI",
        "parameter": {
          "source": "header",
          "name": "X-Hub-Signature-256"
        }
      }
    }
  }
]
EOF

# Copiar script de webhook
cp /opt/portaldcp/deploy-webhook.sh /opt/portaldcp/
chmod +x /opt/portaldcp/deploy-webhook.sh

# Criar serviço systemd
cat > /etc/systemd/system/webhook.service << 'EOF'
[Unit]
Description=Webhook Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/webhook -hooks /etc/webhook/hooks.json -verbose -port 9000
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Iniciar webhook
systemctl daemon-reload
systemctl enable webhook
systemctl start webhook
```

### 4.2. Configurar webhook no GitHub

1. Vá em: https://github.com/valleteclab/portaldcp/settings/hooks
2. Clique em **Add webhook**
3. Configure:
   - **Payload URL**: `http://72.60.4.218:9000/hooks/portaldcp-deploy`
   - **Content type**: `application/json`
   - **Secret**: `SEU_SECRET_AQUI` (mesmo do hooks.json)
   - **Events**: Just the push event
4. Clique em **Add webhook**

## Verificação

Após o deploy, acesse:
- **Frontend**: http://72.60.4.218:3000
- **Backend**: http://72.60.4.218:3001/api/health

## Comandos Úteis

```bash
# Ver logs em tempo real
cd /opt/portaldcp
docker-compose -f docker-compose.coolify.yml logs -f

# Ver status dos containers
docker-compose -f docker-compose.coolify.yml ps

# Reiniciar tudo
docker-compose -f docker-compose.coolify.yml restart

# Parar tudo
docker-compose -f docker-compose.coolify.yml down

# Atualizar (pull + rebuild)
bash /opt/portaldcp/deploy-vps.sh

# Ver logs do webhook
tail -f /var/log/portaldcp-deploy.log
```

## Remover Coolify (se necessário)

```bash
# Parar Coolify
docker stop $(docker ps -a -q --filter name=coolify)
docker rm $(docker ps -a -q --filter name=coolify)

# Remover volumes do Coolify (CUIDADO: apaga dados)
docker volume rm $(docker volume ls -q --filter name=coolify)
```

## Troubleshooting

### Erro de autenticação PostgreSQL
Verifique se as variáveis no `.env` estão corretas:
```bash
cat /opt/portaldcp/.env | grep DB_
```

### Containers não sobem
```bash
# Ver logs de erro
docker-compose -f docker-compose.coolify.yml logs

# Rebuild forçado
docker-compose -f docker-compose.coolify.yml down
docker-compose -f docker-compose.coolify.yml up -d --build --force-recreate
```

### Porta já em uso
```bash
# Ver o que está usando a porta
netstat -tulpn | grep :3000
netstat -tulpn | grep :3001

# Matar processo se necessário
kill -9 <PID>
```
