# watchdog.ps1 — Health-check completo da stack Evolution + Cloudflare Tunnel
# Executado pelo Task Scheduler a cada 5 minutos (SysMax-Watchdog).
#
# Verifica em camadas, com remediacao escalonada:
#   1. Docker daemon                  -> start Docker Desktop se parado
#   2. Containers postgres/redis/api  -> docker compose restart <name>; se falhar, stack restart
#   3. Evolution API local            -> HTTP 200 em :8080 + apikey em /instance/fetchInstances
#   4. Cloudflared (processo)         -> start-cloudflared.ps1
#   5. Tunnel externo end-to-end      -> HTTPS wpp.sysmaxsolutions.com + autenticado
#
# Toda logica concreta vive em watchdog-checks.ps1 (compartilhado com watchdog-loop.ps1).

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$logFile   = "$scriptDir\watchdog.log"

. "$scriptDir\watchdog-checks.ps1"

try {
    $ok = Invoke-WatchdogCycle
    if ($ok) { exit 0 } else { exit 0 }   # nunca exit != 0: Task Scheduler nao retenta corretamente
} catch {
    Write-WdLog "[Watchdog] ERRO inesperado: $($_.Exception.Message)"
    exit 0
}
