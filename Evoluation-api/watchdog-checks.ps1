# watchdog-checks.ps1 — Helpers compartilhados de health-check da stack Evolution
# Dot-source este arquivo a partir de watchdog.ps1 / watchdog-loop.ps1:
#   $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
#   $logFile   = "$scriptDir\watchdog.log"
#   . "$scriptDir\watchdog-checks.ps1"
#   Invoke-WatchdogCycle

# ============================================================================
# Constantes
# ============================================================================
$script:DockerExe      = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
$script:LocalApiUrl    = "http://localhost:8080/"
$script:LocalAuthUrl   = "http://localhost:8080/instance/fetchInstances"
$script:TunnelUrl      = "https://wpp.sysmaxsolutions.com/"
$script:TunnelAuthUrl  = "https://wpp.sysmaxsolutions.com/instance/fetchInstances"
$script:HttpTimeout    = 8
$script:ComposeFile    = $null   # resolvido on-demand
$script:CachedApiKey   = $null

function Get-ComposeFile {
    if (-not $script:ComposeFile) { $script:ComposeFile = Join-Path $script:scriptDir 'docker-compose.yml' }
    return $script:ComposeFile
}

function Get-CloudflaredPath {
    $p = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
    if (Test-Path $p) { return $p }
    $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

# ============================================================================
# Logging — verbose em falhas, summary em sucesso
# ============================================================================
function Write-WdLog {
    param([string]$msg)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Write-Host $line
    if ($script:logFile) {
        try { Add-Content -Path $script:logFile -Value $line -Encoding UTF8 -ErrorAction Stop } catch {}
    }
}

function Trim-WdLog {
    if (-not $script:logFile -or -not (Test-Path $script:logFile)) { return }
    $lines = Get-Content $script:logFile
    if ($lines.Count -gt 5000) {
        $lines | Select-Object -Last 4000 | Set-Content $script:logFile -Encoding UTF8
    }
}

# ============================================================================
# Docker daemon
# ============================================================================
function Test-DockerDaemon {
    docker info 2>$null | Out-Null
    return ($LASTEXITCODE -eq 0)
}

function Start-DockerDaemon {
    Write-WdLog "[Docker] Daemon parado — iniciando Docker Desktop..."
    if (-not (Test-Path $script:DockerExe)) {
        Write-WdLog "[Docker] ERRO: $($script:DockerExe) nao encontrado."
        return $false
    }
    Start-Process $script:DockerExe
    $waited = 0
    while ($waited -lt 120) {
        Start-Sleep -Seconds 5
        $waited += 5
        if (Test-DockerDaemon) {
            Write-WdLog "[Docker] Daemon disponivel apos ${waited}s."
            return $true
        }
    }
    Write-WdLog "[Docker] ERRO: Daemon nao ficou disponivel em 120s."
    return $false
}

# ============================================================================
# Containers
# ============================================================================
function Get-ContainerInfo {
    param([string]$Name)
    $fmt = '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}'
    $raw = docker inspect --format $fmt $Name 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $raw) {
        return [pscustomobject]@{ Status='missing'; Health='none'; RestartCount=0 }
    }
    $parts = $raw -split '\|'
    return [pscustomobject]@{
        Status       = $parts[0]
        Health       = $parts[1]
        RestartCount = [int]$parts[2]
    }
}

# Retorna $true se container saudavel. Loga apenas em falha.
function Test-Container {
    param([string]$Name)
    $info = Get-ContainerInfo $Name
    if ($info.Status -eq 'missing') {
        Write-WdLog "[Container/$Name] AUSENTE"
        return $false
    }
    if ($info.Status -ne 'running') {
        Write-WdLog "[Container/$Name] FALHA: state=$($info.Status) (restarts=$($info.RestartCount))"
        return $false
    }
    if ($info.Health -eq 'unhealthy') {
        Write-WdLog "[Container/$Name] FALHA: health=unhealthy (restarts=$($info.RestartCount))"
        return $false
    }
    if ($info.RestartCount -gt 10) {
        Write-WdLog "[Container/$Name] AVISO: possivel loop de restart (RestartCount=$($info.RestartCount))"
    }
    return $true
}

function Restart-Container {
    param([string]$Name)
    Write-WdLog "[Container/$Name] Reiniciando via docker compose restart..."
    $out = docker compose -f (Get-ComposeFile) restart $Name
    foreach ($l in ($out -split "`n")) { if ($l.Trim()) { Write-WdLog "[Container/$Name] $($l.Trim())" } }
}

# ============================================================================
# API key — lida do container em runtime, nunca hardcoded
# ============================================================================
function Get-EvolutionApiKey {
    if ($script:CachedApiKey) { return $script:CachedApiKey }
    $envs = docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' evolution-api 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $envs) { return $null }
    $match = ($envs -split "`n") | Where-Object { $_ -match '^AUTHENTICATION_API_KEY=' } | Select-Object -First 1
    if (-not $match) { return $null }
    $script:CachedApiKey = ($match -split '=', 2)[1].Trim()
    return $script:CachedApiKey
}

# ============================================================================
# HTTP probes
# ============================================================================
function Invoke-HttpProbe {
    param(
        [string]$Uri,
        [hashtable]$Headers = @{},
        [int]$TimeoutSec = $script:HttpTimeout
    )
    try {
        $resp = Invoke-WebRequest -Uri $Uri -Headers $Headers -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction Stop
        return [pscustomobject]@{ Ok=$true; Status=[int]$resp.StatusCode; Error=$null }
    } catch {
        $status = $null
        if ($_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch {}
        }
        return [pscustomobject]@{ Ok=$false; Status=$status; Error=$_.Exception.Message }
    }
}

function Test-EvolutionLocal {
    $r = Invoke-HttpProbe -Uri $script:LocalApiUrl
    if (-not $r.Ok) {
        Write-WdLog "[Evolution/local] FALHA: $($r.Error)"
        return $false
    }
    return $true
}

function Test-EvolutionLocalAuth {
    $key = Get-EvolutionApiKey
    if (-not $key) {
        Write-WdLog "[Evolution/local-auth] PULADO: apikey indisponivel (container ausente?)"
        return $true
    }
    $r = Invoke-HttpProbe -Uri $script:LocalAuthUrl -Headers @{ apikey = $key }
    if (-not $r.Ok) {
        Write-WdLog "[Evolution/local-auth] FALHA: HTTP $($r.Status) — $($r.Error)"
        return $false
    }
    return $true
}

function Test-EvolutionTunnel {
    $r = Invoke-HttpProbe -Uri $script:TunnelUrl
    if (-not $r.Ok) {
        Write-WdLog "[Evolution/tunnel] FALHA: $($r.Error)"
        return $false
    }
    return $true
}

function Test-EvolutionTunnelAuth {
    $key = Get-EvolutionApiKey
    if (-not $key) {
        Write-WdLog "[Evolution/tunnel-auth] PULADO: apikey indisponivel"
        return $true
    }
    $r = Invoke-HttpProbe -Uri $script:TunnelAuthUrl -Headers @{ apikey = $key }
    if (-not $r.Ok) {
        Write-WdLog "[Evolution/tunnel-auth] FALHA: HTTP $($r.Status) — $($r.Error)"
        return $false
    }
    return $true
}

# ============================================================================
# Cloudflared
# ============================================================================
function Test-Cloudflared {
    $proc = Get-Process cloudflared -ErrorAction SilentlyContinue
    if (-not $proc) {
        Write-WdLog "[Cloudflared] FALHA: processo nao encontrado"
        return $false
    }
    return $true
}

function Start-CloudflaredTunnel {
    $cf = Get-CloudflaredPath
    if (-not $cf) {
        Write-WdLog "[Cloudflared] ERRO: cloudflared.exe nao encontrado. winget install Cloudflare.cloudflared"
        return $false
    }
    Write-WdLog "[Cloudflared] Iniciando via start-cloudflared.ps1..."
    Start-Process -FilePath "powershell.exe" `
        -ArgumentList "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script:scriptDir\start-cloudflared.ps1`"" `
        -WindowStyle Hidden
    return $true
}

function Restart-CloudflaredTunnel {
    Write-WdLog "[Cloudflared] Encerrando processos existentes..."
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    return (Start-CloudflaredTunnel)
}

# ============================================================================
# Stack — remediacao escalada final
# ============================================================================
function Restart-EvolutionStack {
    Write-WdLog "[Stack] docker compose restart (forca restart mesmo se containers reportam running)..."
    $out = docker compose -f (Get-ComposeFile) restart
    foreach ($l in ($out -split "`n")) { if ($l.Trim()) { Write-WdLog "[Stack] $($l.Trim())" } }
    Start-Sleep -Seconds 5
    Write-WdLog "[Stack] Executando start-services.ps1 para garantir Docker/Cloudflared..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$script:scriptDir\start-services.ps1"
}

# ============================================================================
# Ciclo completo com remediacao escalonada
# ============================================================================
function Invoke-WatchdogCycle {
    Trim-WdLog
    $issues = @()

    # 1. Docker daemon
    if (-not (Test-DockerDaemon)) {
        if (-not (Start-DockerDaemon)) {
            Write-WdLog "[Watchdog] ABORT: Docker daemon indisponivel."
            return $false
        }
    }

    # 2. Containers (postgres e redis primeiro — dependencias do api)
    $containerOk = $true
    foreach ($name in @('evolution-postgres','evolution-redis','evolution-api')) {
        $info = Get-ContainerInfo $name
        if ($info.Status -eq 'missing') {
            $issues += "container/$name=missing"
            $containerOk = $false
            continue
        }
        if (-not (Test-Container $name)) {
            $issues += "container/$name=$($info.Status)/$($info.Health)"
            Restart-Container $name
            Start-Sleep -Seconds 8
            if (-not (Test-Container $name)) {
                Write-WdLog "[Container/$name] Restart isolado nao resolveu."
                $containerOk = $false
            }
        }
    }
    if (-not $containerOk) {
        Restart-EvolutionStack
        Start-Sleep -Seconds 15
        # Reset cache da apikey (container pode ter sido recriado)
        $script:CachedApiKey = $null
    }

    # 3. Evolution API local — HTTP + autenticado
    $apiLocalOk = Test-EvolutionLocal
    if (-not $apiLocalOk) {
        $issues += "api/local=down"
        Restart-Container 'evolution-api'
        Start-Sleep -Seconds 15
        $apiLocalOk = Test-EvolutionLocal
        if (-not $apiLocalOk) {
            Write-WdLog "[Evolution/local] Persiste apos restart — restart stack completo"
            Restart-EvolutionStack
            Start-Sleep -Seconds 15
            $script:CachedApiKey = $null
        }
    }
    if ($apiLocalOk -and -not (Test-EvolutionLocalAuth)) {
        $issues += "api/local-auth=fail"
        Write-WdLog "[Evolution/local-auth] Reiniciando container evolution-api..."
        Restart-Container 'evolution-api'
        Start-Sleep -Seconds 12
    }

    # 4. Cloudflared (processo)
    if (-not (Test-Cloudflared)) {
        $issues += "cloudflared=down"
        Start-CloudflaredTunnel
        Start-Sleep -Seconds 8
    }

    # 5. Tunnel externo (end-to-end + autenticado)
    if (-not (Test-EvolutionTunnel)) {
        $issues += "tunnel/ext=down"
        Write-WdLog "[Evolution/tunnel] Reiniciando cloudflared..."
        Restart-CloudflaredTunnel
        Start-Sleep -Seconds 10
        if (-not (Test-EvolutionTunnel)) {
            Write-WdLog "[Evolution/tunnel] Persiste falha apos restart cloudflared."
        }
    } elseif (-not (Test-EvolutionTunnelAuth)) {
        $issues += "tunnel/ext-auth=fail"
    }

    if ($issues.Count -eq 0) {
        Write-WdLog "[Watchdog] OK — docker, postgres, redis, api(local+auth), cloudflared, tunnel(ext+auth) — pronto para vincular WhatsApp."
        return $true
    } else {
        Write-WdLog "[Watchdog] Ciclo concluido com problemas: $($issues -join ', ')"
        return $false
    }
}
