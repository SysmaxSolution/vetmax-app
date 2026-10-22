# Remove o Agente-ponte (tarefa agendada). PowerShell como Administrador.
param([string]$InstallDir = 'C:\SysvetmaxLabAgent', [switch]$KeepFiles)
$ErrorActionPreference = 'SilentlyContinue'
Stop-ScheduledTask   -TaskName 'SysvetmaxLabAgent'
Unregister-ScheduledTask -TaskName 'SysvetmaxLabAgent' -Confirm:$false
Write-Host "[OK] Servico 'SysvetmaxLabAgent' removido." -ForegroundColor Green
if (-not $KeepFiles) { Remove-Item -Recurse -Force $InstallDir; Write-Host "[OK] Arquivos removidos de $InstallDir." -ForegroundColor Green }
