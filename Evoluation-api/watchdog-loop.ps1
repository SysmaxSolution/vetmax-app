# watchdog-loop.ps1 — Health-check em loop (60s) usando watchdog-checks.ps1
# Uso manual: alternativa ao agendamento do Task Scheduler.
# Mesmos checks de watchdog.ps1; apenas roda em loop infinito.

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$logFile   = "$scriptDir\watchdog.log"
$interval  = 60

. "$scriptDir\watchdog-checks.ps1"

Write-WdLog "[Watchdog-loop] Iniciado — ciclo a cada ${interval}s."

while ($true) {
    try {
        Invoke-WatchdogCycle | Out-Null
    } catch {
        Write-WdLog "[Watchdog-loop] ERRO inesperado no ciclo: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds $interval
}
