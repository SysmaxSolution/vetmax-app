# start-cloudflared.ps1 — Inicia o tunnel Cloudflare com loop de auto-restart

# Resolução robusta do cloudflared: tenta WinGet primeiro, depois PATH
$cfExe = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
if (-not (Test-Path $cfExe)) {
    $cfFound = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($cfFound) {
        $cfExe = $cfFound.Source
    } else {
        Write-Host "[cloudflared] ERRO: cloudflared.exe nao encontrado. Instale via: winget install Cloudflare.cloudflared"
        exit 1
    }
}

Write-Host "[cloudflared] Usando: $cfExe"
Write-Host "[cloudflared] Iniciando tunnel wpp.sysmaxsolutions.com -> localhost:8080 (HTTP/2, auto-restart)..."

while ($true) {
    & $cfExe tunnel --protocol http2 --no-autoupdate run
    $exitCode = $LASTEXITCODE
    Write-Host "[cloudflared] Processo encerrado (exit $exitCode). Reiniciando em 5s..."
    Start-Sleep -Seconds 5
}
