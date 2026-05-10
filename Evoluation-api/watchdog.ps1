# watchdog.ps1 — Monitora e reinicia Evolution API e Cloudflare Tunnel se caírem
# Executado pelo Task Scheduler a cada 5 minutos

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$startScript = "$scriptDir\start-services.ps1"
$logFile     = "$scriptDir\watchdog.log"

# Resolução robusta do cloudflared: tenta WinGet primeiro, depois PATH
$cfExe = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
if (-not (Test-Path $cfExe)) {
    $cfFound = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cfFound) { $cfExe = $cfFound.Source }
}

function Write-Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

# Mantém log com no máximo 5.000 linhas para não crescer indefinidamente
if (Test-Path $logFile) {
    $lines = Get-Content $logFile
    if ($lines.Count -gt 5000) {
        $lines | Select-Object -Last 4000 | Set-Content $logFile -Encoding UTF8
    }
}

$needsRestart = $false

# ── Checa Evolution API ──────────────────────────────────────────────────────
$apiRunning = docker ps --filter "name=evolution-api" --filter "status=running" -q 2>$null
if (-not $apiRunning) {
    Write-Log "[Watchdog] ALERTA: evolution-api nao esta rodando — reiniciando..."
    $needsRestart = $true
} else {
    # Checa se a API responde na porta 8080 (health check simples)
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:8080/" -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        Write-Log "[Watchdog] Evolution API OK (HTTP $($resp.StatusCode))"
    } catch {
        Write-Log "[Watchdog] ALERTA: Evolution API nao respondeu na porta 8080 — reiniciando stack..."
        docker compose -f "$scriptDir\docker-compose.yml" restart 2>$null
        $needsRestart = $true
    }
}

# ── Checa Cloudflare Tunnel ─────────────────────────────────────────────────
$cfRunning = Get-Process cloudflared -ErrorAction SilentlyContinue
if (-not $cfRunning) {
    Write-Log "[Watchdog] ALERTA: cloudflared nao esta rodando — reiniciando..."
    if (Test-Path $cfExe) {
        Start-Process -FilePath "powershell.exe" `
            -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptDir\start-cloudflared.ps1`"" `
            -WindowStyle Hidden
        Write-Log "[Watchdog] Cloudflared reiniciado via start-cloudflared.ps1."
    } else {
        Write-Log "[Watchdog] ERRO: cloudflared.exe nao encontrado. Instale via: winget install Cloudflare.cloudflared"
    }
} else {
    Write-Log "[Watchdog] Cloudflared OK (PID $($cfRunning.Id))"
}

# ── Reinicia stack completo se necessário ────────────────────────────────────
if ($needsRestart) {
    Write-Log "[Watchdog] Executando start-services.ps1..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startScript
    Write-Log "[Watchdog] Restart concluido."
}
