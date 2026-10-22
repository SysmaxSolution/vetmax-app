<#
  Registra a Tarefa Agendada "SysMax Deep Clean".
  RODE COMO ADMINISTRADOR (PowerShell elevado).

  Agenda: diaria as 03:00, como SYSTEM (privilegio maximo).
  O proprio script so limpa se o C: estiver abaixo do gatilho (< 20 GB),
  entao rodar todo dia e barato: nos dias com espaco sobrando ele sai na hora.
#>
[CmdletBinding()]
param(
    [string]$TaskName = 'SysMax Deep Clean',
    [string]$At       = '03:00'
)

$scriptPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'Deep-Clean.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Nao achei $scriptPath" }

# exige elevacao
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
          ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { throw "Rode este instalador em um PowerShell COMO ADMINISTRADOR." }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f $scriptPath)

$trigger = New-ScheduledTaskTrigger -Daily -At $At

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings `
    -Description 'Limpeza profunda do C: quando o espaco livre cai abaixo de 20 GB (caches + arquivos nao usados ha +1 ano).' `
    -Force | Out-Null

Write-Host "OK -> Tarefa '$TaskName' registrada (diaria as $At, como SYSTEM)." -ForegroundColor Green
Write-Host "Testar agora:  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Remover:       Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
