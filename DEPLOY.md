# 🚀 LicitaFácil - Guia de Deploy para Servidor Raywal

## 📋 Pré-requisitos no Servidor

1. **Docker** (versão 20.10+)
2. **Docker Compose** (versão 2.0+)
3. **Git**
4. **Mínimo 4GB RAM** (recomendado 8GB)
5. **20GB de espaço em disco**

### Instalar Docker no Ubuntu/Debian:
```bash
# Atualizar pacotes
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Adicionar usuário ao grupo docker
sudo usermod -aG docker $USER

# Instalar Docker Compose
sudo apt install docker-compose-plugin -y

# Verificar instalação
docker --version
docker compose version
```

---

## 📦 Passo a Passo do Deploy

### 1. Clonar o Repositório
```bash
cd /opt
git clone https://github.com/seu-usuario/licitafacil.git
cd licitafacil
```

### 2. Configurar Variáveis de Ambiente
```bash
# Copiar arquivo de exemplo
cp .env.production .env

# Editar configurações
nano .env
```

**⚠️ IMPORTANTE: Altere as seguintes variáveis:**
```env
# Senhas seguras
DB_PASSWORD=SUA_SENHA_FORTE_AQUI
JWT_SECRET=SEU_SECRET_JWT_MUITO_LONGO_AQUI

# URLs do servidor
APP_URL=http://seu-dominio.com.br
API_URL=http://seu-dominio.com.br/api

# PNCP (se for usar)
PNCP_LOGIN=seu_login
PNCP_SENHA=sua_senha
PNCP_CNPJ_ORGAO=00000000000000
```

### 3. Executar Deploy
```bash
# Dar permissão ao script
chmod +x deploy.sh

# Executar deploy
./deploy.sh

# Ou manualmente:
docker-compose up -d --build
```

### 4. Verificar Status
```bash
# Ver containers rodando
docker-compose ps

# Ver logs
docker-compose logs -f

# Ver logs de um serviço específico
docker-compose logs -f backend
docker-compose logs -f frontend
```

---

## 🔒 Configurar SSL (HTTPS)

### Opção 1: Let's Encrypt com Certbot
```bash
# Instalar Certbot
sudo apt install certbot -y

# Gerar certificado
sudo certbot certonly --standalone -d licitafacil.raywal.com.br

# Copiar certificados para pasta do nginx
sudo cp /etc/letsencrypt/live/licitafacil.raywal.com.br/fullchain.pem ./nginx/ssl/
sudo cp /etc/letsencrypt/live/licitafacil.raywal.com.br/privkey.pem ./nginx/ssl/

# Editar nginx.conf e descomentar linhas de SSL
nano nginx/nginx.conf

# Reiniciar nginx
docker-compose restart nginx
```

### Opção 2: Certificado próprio
Coloque seus arquivos em `./nginx/ssl/`:
- `fullchain.pem` - Certificado + cadeia
- `privkey.pem` - Chave privada

---

## 🗄️ Backup do Banco de Dados

### Backup Manual
```bash
# Criar backup
docker-compose exec postgres pg_dump -U licitafacil licitafacil > backup_$(date +%Y%m%d_%H%M%S).sql

# Restaurar backup
docker-compose exec -T postgres psql -U licitafacil licitafacil < backup.sql
```

### Backup Automático (Cron)
```bash
# Editar crontab
crontab -e

# Adicionar linha para backup diário às 3h
0 3 * * * cd /opt/licitafacil && docker-compose exec -T postgres pg_dump -U licitafacil licitafacil > /opt/backups/licitafacil_$(date +\%Y\%m\%d).sql
```

---

## 🔧 Comandos Úteis

```bash
# Reiniciar todos os serviços
docker-compose restart

# Reiniciar serviço específico
docker-compose restart backend

# Parar tudo
docker-compose down

# Parar e remover volumes (CUIDADO: apaga dados!)
docker-compose down -v

# Ver uso de recursos
docker stats

# Acessar container
docker-compose exec backend sh
docker-compose exec postgres psql -U licitafacil

# Limpar imagens não usadas
docker system prune -a
```

---

## 🐛 Troubleshooting

### Erro: "Port already in use"
```bash
# Verificar o que está usando a porta
sudo lsof -i :3000
sudo lsof -i :3001

# Matar processo
sudo kill -9 <PID>
```

### Erro: "Cannot connect to database"
```bash
# Verificar se postgres está rodando
docker-compose ps postgres

# Ver logs do postgres
docker-compose logs postgres

# Reiniciar postgres
docker-compose restart postgres
```

### Erro: "Out of memory"
```bash
# Verificar memória
free -h

# Limpar cache do Docker
docker system prune -a
```

### Atualizar para nova versão
```bash
# Parar containers
docker-compose down

# Puxar atualizações
git pull origin main

# Rebuild e iniciar
docker-compose up -d --build
```

---

## 📊 Monitoramento

### Health Checks
- **Backend:** http://localhost:3001/api/health
- **Frontend:** http://localhost:3000
- **Nginx:** http://localhost/health

### Logs em tempo real
```bash
# Todos os serviços
docker-compose logs -f

# Apenas erros
docker-compose logs -f 2>&1 | grep -i error
```

---

## 📞 Suporte

Em caso de problemas:
1. Verifique os logs: `docker-compose logs -f`
2. Verifique o status: `docker-compose ps`
3. Reinicie os serviços: `docker-compose restart`

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                        NGINX                             │
│                    (Porta 80/443)                        │
│              Proxy Reverso + SSL + Cache                 │
└─────────────────┬───────────────────┬───────────────────┘
                  │                   │
                  ▼                   ▼
┌─────────────────────────┐ ┌─────────────────────────────┐
│       FRONTEND          │ │         BACKEND             │
│      (Next.js)          │ │        (NestJS)             │
│      Porta 3000         │ │        Porta 3001           │
└─────────────────────────┘ └──────────────┬──────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
          ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
          │   PostgreSQL    │    │     Redis       │    │    Uploads      │
          │   Porta 5432    │    │   Porta 6379    │    │    (Volume)     │
          └─────────────────┘    └─────────────────┘    └─────────────────┘
```
