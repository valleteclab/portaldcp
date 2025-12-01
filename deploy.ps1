# ============================================
# LICITAFÁCIL - SCRIPT DE DEPLOY (Windows)
# ============================================

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  LICITAFÁCIL - Deploy para Produção" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# Verificar se Docker está instalado
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[X] Docker não encontrado. Instale o Docker Desktop primeiro." -ForegroundColor Red
    exit 1
}

# Verificar se .env existe
if (-not (Test-Path ".env")) {
    Write-Host "[!] Arquivo .env não encontrado. Copiando de .env.production..." -ForegroundColor Yellow
    Copy-Item ".env.production" ".env"
    Write-Host "[!] ATENÇÃO: Edite o arquivo .env com suas configurações antes de continuar!" -ForegroundColor Red
    exit 1
}

# 1. Parar containers existentes
Write-Host ""
Write-Host "1. Parando containers existentes..." -ForegroundColor Yellow
docker-compose down 2>$null
Write-Host "[OK] Containers parados" -ForegroundColor Green

# 2. Build das imagens
Write-Host ""
Write-Host "2. Construindo imagens Docker..." -ForegroundColor Yellow
docker-compose build --no-cache
if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] Erro ao construir imagens" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Imagens construídas" -ForegroundColor Green

# 3. Iniciar containers
Write-Host ""
Write-Host "3. Iniciando containers..." -ForegroundColor Yellow
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] Erro ao iniciar containers" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Containers iniciados" -ForegroundColor Green

# 4. Aguardar serviços
Write-Host ""
Write-Host "4. Aguardando serviços ficarem prontos..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# 5. Verificar status
Write-Host ""
Write-Host "5. Verificando status dos serviços..." -ForegroundColor Yellow
docker-compose ps

# 6. Exibir informações
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "Deploy concluído com sucesso!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "URLs de acesso:" -ForegroundColor Cyan
Write-Host "  - Frontend: http://localhost:3000"
Write-Host "  - Backend:  http://localhost:3001"
Write-Host "  - API:      http://localhost:3001/api"
Write-Host ""
Write-Host "Comandos úteis:" -ForegroundColor Cyan
Write-Host "  - Ver logs:     docker-compose logs -f"
Write-Host "  - Parar:        docker-compose down"
Write-Host "  - Reiniciar:    docker-compose restart"
Write-Host "  - Status:       docker-compose ps"
Write-Host ""
