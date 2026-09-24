# Prepara o runtime portátil do agente (node.exe) para o sistema servir.
# O agente NAO precisa de Node instalado no PC do laboratório: o instalador
# baixa este node.exe do sistema (/lab-agent/node.exe) e roda agent.mjs com ele.
#
# Rode UMA vez na NOSSA maquina (que tem Node) para atualizar o binario servido:
#   .\build-exe.ps1
#
# (Tentativa de gerar um .exe unico via pkg exige toolchain MSVC/base pre-compilada
#  e nao e confiavel em qualquer maquina; por isso usamos o node.exe portatil, que
#  e um binario oficial do Node, MIT, e roda .mjs de forma autossuficiente.)
$ErrorActionPreference = 'Stop'
$node = (Get-Command node).Source
$dest = Join-Path $PSScriptRoot '..\public\lab-agent\node.exe'
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Force $node $dest
Write-Host ("[OK] node.exe copiado para public/lab-agent (" + [math]::Round((Get-Item $dest).Length/1MB,1) + " MB). Versao: " + (node -v)) -ForegroundColor Green
Write-Host "Faca deploy para o sistema servir em /lab-agent/node.exe." -ForegroundColor Cyan
