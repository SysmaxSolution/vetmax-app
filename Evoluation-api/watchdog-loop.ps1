# watchdog-loop.ps1 - Monitora Evolution API e Cloudflare a cada 60s
# Derruba e sobe novamente se qualquer servico falhar

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Definition
$startScript = "$scriptDir\start-services.ps1"
$logFile     = "$scriptDir\watchdog.log"
$checkUrl    = "http://localhost:8080/"
$interval    = 60
$dockerExe   = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# Resolucao robusta do cloudflared
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

function Trim-Log {
    if (Test-Path $logFile) {
        $lines = Get-Content $logFile
        if ($lines.Count -gt 5000) {
            $lines | Select-Object -Last 4000 | Set-Content $logFile -Encoding UTF8
        }
    }
}

function Ensure-Docker {
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Log "[Watchdog] Docker daemon parado - iniciando Docker Desktop..."
        if (Test-Path $dockerExe) {
            Start-Process $dockerExe
            $waited = 0
            while ($waited -lt 120) {
                Start-Sleep -Seconds 5
                $waited += 5
                docker info 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    Write-Log "[Watchdog] Docker daemon disponivel apos ${waited}s."
                    return $true
                }
            }
            Write-Log "[Watchdog] ERRO: Docker daemon nao ficou disponivel em 120s."
            return $false
        }
        Write-Log "[Watchdog] ERRO: Docker Desktop nao encontrado."
        return $false
    }
    return $true
}

function Restart-Evolution {
    Write-Log "[Watchdog] Derrubando stack Docker..."
    docker compose -f "$scriptDir\docker-compose.yml" down 2>&1 | Out-Null
    Start-Sleep -Seconds 3
    Write-Log "[Watchdog] Subindo stack via start-services.ps1..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startScript
}

function Restart-Cloudflared {
    Write-Log "[Watchdog] Encerrando processos cloudflared existentes..."
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    if (Test-Path $cfExe) {
        Write-Log "[Watchdog] Reiniciando cloudflared via start-cloudflared.ps1..."
        Start-Process -FilePath "powershell.exe" `
            -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptDir\start-cloudflared.ps1`"" `
            -WindowStyle Hidden
    } else {
        Write-Log "[Watchdog] ERRO: cloudflared.exe nao encontrado."
    }
}

Write-Log "[Watchdog] Iniciado - verificando a cada ${interval}s."

while ($true) {
    Trim-Log

    # --- Checa Docker daemon -------------------------------------------------
    $dockerOk = Ensure-Docker
    if (-not $dockerOk) {
        Write-Log "[Watchdog] Docker indisponivel - aguardando proximo ciclo."
        Start-Sleep -Seconds $interval
        continue
    }

    # --- Checa Evolution API (container + porta 8080) ------------------------
    $apiContainer = docker ps --filter "name=evolution-api" --filter "status=running" -q 2>$null
    if ($apiContainer) {
        try {
            $r = Invoke-WebRequest -Uri $checkUrl -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
            Write-Log "[Watchdog] Evolution API OK (HTTP $($r.StatusCode))"
        } catch {
            Write-Log "[Watchdog] FALHA: container rodando mas porta 8080 nao responde - reiniciando stack..."
            Restart-Evolution
        }
    } else {
        Write-Log "[Watchdog] FALHA: container evolution-api parado - reiniciando stack..."
        Restart-Evolution
    }

    # --- Checa Cloudflare Tunnel ---------------------------------------------
    $cfProc = Get-Process cloudflared -ErrorAction SilentlyContinue
    if ($cfProc) {
        Write-Log "[Watchdog] Cloudflared OK (PID $($cfProc.Id))"
    } else {
        Write-Log "[Watchdog] FALHA: cloudflared parado - reiniciando..."
        Restart-Cloudflared
    }

    Start-Sleep -Seconds $interval
}
