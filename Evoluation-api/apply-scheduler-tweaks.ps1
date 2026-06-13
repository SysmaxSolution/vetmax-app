# apply-scheduler-tweaks.ps1 — Aplica todos os ajustes recomendados no Task Scheduler
# para que SysMax-Watchdog garanta uptime maximo enquanto o PC esta ligado.
#
# REQUER EXECUCAO ELEVADA (Run as Administrator).
# Como rodar:
#   1) Win+X -> Terminal (Admin)  ou  PowerShell (Admin)
#   2) cd C:\SysMax\Evoluation-api
#   3) powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\apply-scheduler-tweaks.ps1
#
# Ou: clique direito no arquivo .bat companheiro -> Executar como administrador

#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'
$watchdogScript = "C:\SysMax\Evoluation-api\watchdog.ps1"
$startupScript  = "C:\SysMax\Evoluation-api\start-services.ps1"

if (-not (Test-Path $watchdogScript)) { throw "Nao encontrado: $watchdogScript" }
if (-not (Test-Path $startupScript))  { throw "Nao encontrado: $startupScript" }

Write-Host ""
Write-Host "==> Aplicando ajustes em SysMax-Watchdog..." -ForegroundColor Cyan

# ------------------------------------------------------------------------------
# 1) SysMax-Watchdog — checagem em loop (1 min, AtStartup, S4U)
# ------------------------------------------------------------------------------
Unregister-ScheduledTask -TaskName "SysMax-Watchdog" -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogScript`""

# Trigger AtStartup com 30s de atraso (deixa Docker subir antes)
$trigStartup = New-ScheduledTaskTrigger -AtStartup
$trigStartup.Delay = "PT30S"

# Trigger periodico: 1 min, indefinidamente, comecando agora
$trigTime = New-ScheduledTaskTrigger -Once -At (Get-Date)
$repClass = Get-CimClass -Namespace 'Root/Microsoft/Windows/TaskScheduler' -ClassName MSFT_TaskRepetitionPattern
$trigTime.Repetition = New-CimInstance -CimClass $repClass -ClientOnly -Property @{
    Interval          = 'PT1M'
    StopAtDurationEnd = $false
}

# S4U: roda sem login interativo + sem armazenar senha
$principal = New-ScheduledTaskPrincipal -UserId "djham" -LogonType S4U -RunLevel Limited

# Settings completas
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName "SysMax-Watchdog" `
    -Action $action `
    -Trigger @($trigStartup, $trigTime) `
    -Principal $principal `
    -Settings $settings `
    -Description "Health-check da stack Evolution (Docker + 3 containers + Cloudflare Tunnel). Auto-restart escalonado se algo falhar." | Out-Null

Write-Host "  [OK] SysMax-Watchdog: 1 min interval + AtStartup + S4U + StartWhenAvailable + sem restricao bateria + 3x retry" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 2) SysMax-Startup — sobe Docker/Evolution/Cloudflared no boot do Windows
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Criando SysMax-Startup..." -ForegroundColor Cyan

Unregister-ScheduledTask -TaskName "SysMax-Startup" -Confirm:$false -ErrorAction SilentlyContinue

$startupAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startupScript`""

$trigBoot = New-ScheduledTaskTrigger -AtStartup
$trigBoot.Delay = "PT60S"

$startupSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName "SysMax-Startup" `
    -Action $startupAction `
    -Trigger $trigBoot `
    -Principal $principal `
    -Settings $startupSettings `
    -Description "Sobe Docker Desktop, Evolution stack e Cloudflare Tunnel no boot do Windows (antes do watchdog assumir)." | Out-Null

Write-Host "  [OK] SysMax-Startup: AtStartup + 60s delay + S4U + sem restricao bateria" -ForegroundColor Green

# ------------------------------------------------------------------------------
# 3) Verificacao final
# ------------------------------------------------------------------------------
Write-Host ""
Write-Host "==> Verificacao:" -ForegroundColor Cyan
foreach ($name in @('SysMax-Watchdog','SysMax-Startup')) {
    $t = Get-ScheduledTask -TaskName $name
    $info = Get-ScheduledTaskInfo -TaskName $name
    $triggers = $t.Triggers | ForEach-Object {
        $type = $_.CimClass.CimClassName -replace 'MSFT_Task',''
        if ($_.Repetition.Interval) { "$type(every=$($_.Repetition.Interval))" } else { $type }
    }
    Write-Host ""
    Write-Host "  $name" -ForegroundColor Yellow
    Write-Host "    Triggers     : $($triggers -join ', ')"
    Write-Host "    LogonType    : $($t.Principal.LogonType)"
    Write-Host "    RunLevel     : $($t.Principal.RunLevel)"
    Write-Host "    Battery OK   : $(-not $t.Settings.DisallowStartIfOnBatteries)"
    Write-Host "    StartWhenAvail: $($t.Settings.StartWhenAvailable)"
    Write-Host "    RestartCount : $($t.Settings.RestartCount)"
    Write-Host "    NextRun      : $($info.NextRunTime)"
}

Write-Host ""
Write-Host "==> Pronto. Mudancas aplicadas." -ForegroundColor Green
Write-Host ""
Write-Host "OBS: Para que o watchdog funcione tambem sem ninguem logado, o Docker Desktop" -ForegroundColor Yellow
Write-Host "     precisa estar configurado para iniciar como servico no boot. Por padrao" -ForegroundColor Yellow
Write-Host "     o 'Docker Desktop Service' (Windows Service) ja roda no boot — verifique" -ForegroundColor Yellow
Write-Host "     com: Get-Service 'com.docker.service'" -ForegroundColor Yellow
