# SYSVETMAX — Instalador do Agente-ponte de Laboratório (Windows)
# Instala o agente como TAREFA AGENDADA que roda no boot (sempre ligado, oculto).
# Uso (PowerShell como Administrador):
#   .\install.ps1                        -> modo interativo (pergunta ambiente/token/porta)
#   .\install.ps1 -Env dev -Token lab_xxx -Port 9100
param(
  [ValidateSet('dev','prod')][string]$Env,
  [string]$Token,
  [int]$Port = 9100,
  [string]$InstallDir = 'C:\SysvetmaxLabAgent'
)

$ErrorActionPreference = 'Stop'
function Info($m){ Write-Host "[SYSVETMAX] $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "[OK] $m" -ForegroundColor Green }
function Err($m){ Write-Host "[ERRO] $m" -ForegroundColor Red }

# Defaults a partir de um config.json que veio no pacote (instalador baixado do
# sistema). Assim o duplo-clique instala sem perguntar nada.
$bundledCfg = Join-Path $PSScriptRoot 'config.json'
if (Test-Path $bundledCfg) {
  try {
    $c = Get-Content $bundledCfg -Raw | ConvertFrom-Json
    if (-not $Env   -and $c.environment) { $Env = "$($c.environment)" }
    if (-not $Token -and $c.token)       { $Token = "$($c.token)" }
    if ($c.port)                          { $Port = [int]$c.port }
    $script:BundledUrl = "$($c.url)"
  } catch {}
}

# 1) (O runtime Node é resolvido no passo 4b — usamos um node.exe portátil,
#     baixado do sistema, para NAO exigir Node instalado no PC do laboratório.)

# 2) Perguntas (modo interativo)
if (-not $Env)   { $Env = Read-Host 'Ambiente [dev/prod]'; if ($Env -notin @('dev','prod')) { Err 'Ambiente invalido.'; exit 1 } }
if (-not $Token) { $Token = Read-Host 'Cole o codigo de pareamento (token gerado no sistema, no MESMO ambiente)' }
if (-not $Token) { Err 'Token obrigatorio.'; exit 1 }

# 3) Copia os arquivos do agente para a pasta de instalacao
Info "Instalando em $InstallDir ..."
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'agent.mjs')    (Join-Path $InstallDir 'agent.mjs')
Copy-Item -Force (Join-Path $PSScriptRoot 'simulate.mjs')  (Join-Path $InstallDir 'simulate.mjs')  -ErrorAction SilentlyContinue
Copy-Item -Force (Join-Path $PSScriptRoot 'package.json')  (Join-Path $InstallDir 'package.json')  -ErrorAction SilentlyContinue

# 4) config.json (ambiente + token + porta + url ficam aqui)
$cfgObj = @{ environment = $Env; token = $Token; port = $Port }
if ($script:BundledUrl) { $cfgObj.url = $script:BundledUrl }
$cfg = $cfgObj | ConvertTo-Json
Set-Content -Path (Join-Path $InstallDir 'config.json') -Value $cfg -Encoding UTF8
Ok "config.json gravado (ambiente=$Env, porta=$Port)"

# 4b) Runtime Node portátil (node.exe) — sem depender de Node instalado.
$destNode = Join-Path $InstallDir 'node.exe'
$nodeExe  = $null
if (Test-Path (Join-Path $PSScriptRoot 'node.exe')) {
  Copy-Item -Force (Join-Path $PSScriptRoot 'node.exe') $destNode
  $nodeExe = $destNode
} else {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $sources = @()
  if ($script:BundledUrl) { $sources += "$script:BundledUrl/lab-agent/node.exe" }
  $sources += 'https://nodejs.org/dist/v22.13.1/win-x64/node.exe'   # fallback oficial
  foreach ($srcUrl in $sources) {
    try {
      Info "Baixando o runtime (node.exe, ~80 MB, uma vez) de $srcUrl ..."
      Invoke-WebRequest -Uri $srcUrl -OutFile $destNode -UseBasicParsing
      if ((Get-Item $destNode).Length -gt 1000000) { $nodeExe = $destNode; Ok "Runtime baixado."; break }
    } catch { Info "Falhou ($($_.Exception.Message)); tentando proxima origem." }
  }
}
if (-not $nodeExe) {
  $sys = (Get-Command node -ErrorAction SilentlyContinue)
  if ($sys) { $nodeExe = $sys.Source; Info "Usando o Node do sistema: $((node -v))" }
  else { Err "Sem runtime: nao veio node.exe no pacote, o download falhou e nao ha Node instalado."; exit 1 }
}

# 5) Tarefa agendada (roda no boot, como SYSTEM, oculto, reinicia se cair)
$taskName = 'SysvetmaxLabAgent'
$action   = New-ScheduledTaskAction -Execute $nodeExe -Argument 'agent.mjs' -WorkingDirectory $InstallDir
$trigger  = New-ScheduledTaskTrigger -AtStartup
$principal= New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Start-ScheduledTask -TaskName $taskName
Ok "Servico '$taskName' instalado e iniciado."

# 6) Mostra o IP/porta para configurar no aparelho
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*' } | Select-Object -First 1).IPAddress
Write-Host ""
Write-Host "=======================================================" -ForegroundColor Yellow
Write-Host " Aponte cada aparelho (URIT / BK-200) para:" -ForegroundColor Yellow
Write-Host "     IP do host/LIS : $ip" -ForegroundColor Yellow
Write-Host "     Porta          : $Port" -ForegroundColor Yellow
Write-Host " e ligue 'Transmitir para o host/LIS' (ver INSTALACAO.md)." -ForegroundColor Yellow
Write-Host "=======================================================" -ForegroundColor Yellow
Info "Logs: a tarefa roda oculta. Para ver ao vivo, rode manualmente:"
Info "   cd $InstallDir ; .\node.exe agent.mjs"
