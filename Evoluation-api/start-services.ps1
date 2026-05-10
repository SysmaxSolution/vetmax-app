# start-services.ps1 - Inicia Docker Desktop, Evolution API e Cloudflare Tunnel
# Pode ser chamado manualmente ou pelo watchdog

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$composeDir = $scriptDir
$logFile    = "$scriptDir\services.log"
$dockerExe  = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Resolucao robusta do cloudflared: tenta WinGet primeiro, depois PATH
$cfExe = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
if (-not (Test-Path $cfExe)) {
    $cfFound = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cfFound) { $cfExe = $cfFound.Source }
}

function Write-Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

# --- Docker Desktop ----------------------------------------------------------
Write-Log "[Docker] Verificando daemon..."
$dockerOk = $false
try {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $dockerOk = $true }
} catch {}

if (-not $dockerOk) {
    Write-Log "[Docker] Daemon nao esta rodando. Iniciando Docker Desktop..."
    if (Test-Path $dockerExe) {
        Start-Process $dockerExe
        Write-Log "[Docker] Aguardando daemon ficar disponivel (ate 120s)..."
        $waited = 0
        while ($waited -lt 120) {
            Start-Sleep -Seconds 5
            $waited += 5
            docker info 2>$null | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Log "[Docker] Daemon disponivel apos ${waited}s."
                $dockerOk = $true
                break
            }
            Write-Log "[Docker] Aguardando... (${waited}s / 120s)"
        }
        if (-not $dockerOk) {
            Write-Log "[Docker] ERRO: Docker daemon nao ficou disponivel em 120s. Abortando."
            exit 1
        }
    } else {
        Write-Log "[Docker] ERRO: Docker Desktop nao encontrado em $dockerExe"
        exit 1
    }
} else {
    Write-Log "[Docker] Daemon OK."
}

# --- Evolution API (Docker Compose) -----------------------------------------
Write-Log "[Evolution] Verificando containers..."
$apiRunning = docker ps --filter "name=evolution-api" --filter "status=running" -q 2>$null
if (-not $apiRunning) {
    Write-Log "[Evolution] Iniciando stack Docker (pode levar ~60s)..."
    Set-Location $composeDir
    docker compose up -d 2>&1 | ForEach-Object { Write-Log "[Evolution] $_" }

    Write-Log "[Evolution] Aguardando API responder na porta 8080..."
    $maxWait  = 120
    $waited   = 0
    $apiReady = $false
    while ($waited -lt $maxWait) {
        Start-Sleep -Seconds 5
        $waited += 5
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:8080/" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
            Write-Log "[Evolution] API respondeu (HTTP $($r.StatusCode)) apos ${waited}s."
            $apiReady = $true
            break
        } catch {
            Write-Log "[Evolution] Ainda iniciando... (${waited}s / ${maxWait}s)"
        }
    }
    if (-not $apiReady) {
        Write-Log "[Evolution] AVISO: API nao respondeu em ${maxWait}s - verifique logs do container."
        docker logs --tail 30 evolution-api 2>&1 | ForEach-Object { Write-Log "[Evolution-log] $_" }
    }
} else {
    Write-Log "[Evolution] Containers ja estao rodando - OK"
}

# --- Cloudflare Tunnel -------------------------------------------------------
Write-Log "[Cloudflared] Verificando processo..."
$cfRunning = Get-Process cloudflared -ErrorAction SilentlyContinue
if (-not $cfRunning) {
    if (-not (Test-Path $cfExe)) {
        Write-Log "[Cloudflared] ERRO: cloudflared.exe nao encontrado. Instale via: winget install Cloudflare.cloudflared"
    } else {
        Write-Log "[Cloudflared] Iniciando tunnel via start-cloudflared.ps1 (loop auto-restart)..."
        Start-Process -FilePath "powershell.exe" `
            -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptDir\start-cloudflared.ps1`"" `
            -WindowStyle Hidden
        Write-Log "[Cloudflared] Processo iniciado em background."
    }
} else {
    Write-Log "[Cloudflared] Ja esta rodando (PID $($cfRunning.Id)) - OK"
}

Write-Log "[SysMax] Inicializacao concluida."
