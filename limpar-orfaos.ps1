# limpar-orfaos.ps1 — mata processos powershell.exe e cloudflared ORFAOS (pai morto)
# Rode como ADMINISTRADOR: botao direito no PowerShell > Executar como administrador
# Depois: powershell -ExecutionPolicy Bypass -File C:\SysMax\limpar-orfaos.ps1

$meu = $PID
$mata = @()

foreach ($nome in 'powershell','cloudflared') {
    Get-CimInstance Win32_Process -Filter "Name='$nome.exe'" | ForEach-Object {
        $paiVivo = Get-Process -Id $_.ParentProcessId -ErrorAction SilentlyContinue
        if (-not $paiVivo -and $_.ProcessId -ne $meu) { $mata += $_ }
    }
}

Write-Host "Orfaos encontrados: $($mata.Count)" -ForegroundColor Yellow
$mortos = 0
foreach ($p in $mata) {
    try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $mortos++ }
    catch { Write-Host "  falhou PID $($p.ProcessId): $($_.Exception.Message)" -ForegroundColor Red }
}
Write-Host "Encerrados: $mortos de $($mata.Count)" -ForegroundColor Green

$os = Get-CimInstance Win32_OperatingSystem
"RAM livre agora: {0:N0} MB de {1:N0} MB" -f ($os.FreePhysicalMemory/1024), ($os.TotalVisibleMemorySize/1024)
