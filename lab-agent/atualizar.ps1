# SYSVETMAX - Atualiza o Agente-ponte JA INSTALADO, sem reinstalar nada.
#
# O que faz, em ordem:
#   1. para a tarefa agendada 'SysvetmaxLabAgent'
#   2. guarda uma copia do agent.mjs atual (agent.mjs.bak-AAAAMMDD-HHMM)
#   3. copia o agent.mjs novo (o que esta NESTA pasta) para a instalacao
#   4. religa a tarefa e confere se voltou a escutar na porta
#
# NAO mexe em config.json: token, URL e porta continuam os mesmos.
# NAO baixa node.exe: o runtime que ja esta instalado e reaproveitado.
#
# Uso (PowerShell como Administrador, dentro da pasta do pacote):
#   .\atualizar.ps1
# ou duplo-clique em ATUALIZAR.bat (ele eleva sozinho).

param(
  [string]$InstallDir = 'C:\SysvetmaxLabAgent',
  [string]$TaskName   = 'SysvetmaxLabAgent'
)

$ErrorActionPreference = 'Stop'
function Info($m){ Write-Host "[SYSVETMAX] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[OK] $m" -ForegroundColor Green }
function Err($m){ Write-Host "[ERRO] $m" -ForegroundColor Red }

$novo = Join-Path $PSScriptRoot 'agent.mjs'
if (-not (Test-Path $novo))                           { Err "Nao achei agent.mjs nesta pasta: $PSScriptRoot"; exit 1 }
if (-not (Test-Path $InstallDir))                     { Err "Nao achei a instalacao em $InstallDir"; exit 1 }
if (-not (Test-Path (Join-Path $InstallDir 'config.json'))) { Err "Falta config.json em $InstallDir - use install.ps1, nao este script."; exit 1 }

# 1) Parar
Info "Parando $TaskName ..."
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2) Backup
$atual = Join-Path $InstallDir 'agent.mjs'
if (Test-Path $atual) {
  $bak = "$atual.bak-$(Get-Date -Format 'yyyyMMdd-HHmm')"
  Copy-Item -Force $atual $bak
  Ok "Backup: $bak"
}

# 3) Trocar o agente (e o simulador, se vier no pacote)
Copy-Item -Force $novo $atual
Ok "agent.mjs atualizado."
$sim = Join-Path $PSScriptRoot 'simulate.mjs'
if (Test-Path $sim) { Copy-Item -Force $sim (Join-Path $InstallDir 'simulate.mjs') }

# 4) Religar e conferir
Info "Religando $TaskName ..."
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 5

$porta = 9100
try { $porta = [int](Get-Content (Join-Path $InstallDir 'config.json') -Raw | ConvertFrom-Json).port } catch {}
$escuta = Get-NetTCPConnection -State Listen -LocalPort $porta -ErrorAction SilentlyContinue
if ($escuta) { Ok "Agente no ar, escutando na porta $porta." }
else {
  Err "Nao esta escutando na porta $porta. Veja o log rodando a mao:"
  Write-Host "    cd $InstallDir" -ForegroundColor Yellow
  Write-Host "    .\node.exe agent.mjs" -ForegroundColor Yellow
  Write-Host "  Para voltar a versao anterior: copie o .bak sobre agent.mjs e rode Start-ScheduledTask -TaskName $TaskName" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Yellow
Write-Host " Pronto. O agente passou a enviar os resultados" -ForegroundColor Yellow
Write-Host " comprimidos (gzip). Nao e preciso mexer no aparelho." -ForegroundColor Yellow
Write-Host " Proximo exame: confira na fila de Exames do sistema." -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Yellow
