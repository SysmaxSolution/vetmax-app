<#
================================================================================
  SysMax Deep Clean  -  Limpeza profunda do disco C:
--------------------------------------------------------------------------------
  Dispara quando o C: fica com menos de -MinFreeGB livres.
  Remove PERMANENTEMENTE (modo escolhido pelo diretor):
    * Caches/temp do sistema e dos navegadores  (qualquer idade)
    * Arquivos em Downloads/Desktop/Documentos NAO usados ha +MaxAgeDays dias
  Tudo e registrado em maintenance\logs\ para auditoria.

  USO:
    .\Deep-Clean.ps1 -DryRun          # SIMULACAO: mostra o que removeria, sem apagar
    .\Deep-Clean.ps1                  # execucao real (so se free < MinFreeGB)
    .\Deep-Clean.ps1 -Force           # ignora o gatilho de espaco e roda mesmo assim
================================================================================
#>
[CmdletBinding()]
param(
    [double]$MinFreeGB  = 20,      # gatilho: so limpa se o C: tiver menos que isso livre
    [int]   $MaxAgeDays = 365,     # "nao usado ha +1 ano"
    [switch]$DryRun,               # simula, nao apaga nada
    [switch]$Force                 # roda mesmo com espaco de sobra
)

# ------------------------------------------------------------------ Config ----
# Pastas do usuario limpas por IDADE (arquivos com +MaxAgeDays sem uso).
# 'Documents' foi retirado por decisao do diretor (alvo mais sensivel).
$UserAgedFolders = @('Downloads', 'Desktop')

# --- Builds/caches de projeto (regeneraveis) ---
# Apaga a PASTA inteira se ela nao foi escrita ha +MaxAgeDays (projeto parado).
# Projetos ativos (ex.: Mozart) tem LastWriteTime recente -> preservados.
$BuildDirNames = @('node_modules', '.next', 'dist', 'build', '__pycache__', '.turbo', '.nuxt', '.svelte-kit', '.parcel-cache')
# Nunca descer nessas ao procurar (evita quebrar ferramentas/extensoes):
$BuildScanPrune = @('.git', '.vscode', '.vs', 'AppData')
# RAIZES onde procurar projetos PARADOS. VAZIO por padrao de proposito: varrer a monorepo
# ATIVA (C:\Sysmax) nao acha nada (projetos em uso) e pendura sob SYSTEM. Coloque aqui
# APENAS pastas de projetos arquivados/abandonados, ex.: @('D:\Arquivo\projetos-antigos').
$ProjectScanRoots = @()

# Pastas de CACHE limpas por completo (qualquer idade) dentro de cada perfil.
$UserCacheFolders = @(
    'AppData\Local\Temp',
    'AppData\Local\Google\Chrome\User Data\Default\Cache',
    'AppData\Local\Google\Chrome\User Data\Default\Code Cache',
    'AppData\Local\Microsoft\Edge\User Data\Default\Cache',
    'AppData\Local\Microsoft\Edge\User Data\Default\Code Cache',
    'AppData\Local\Microsoft\Windows\INetCache',
    'AppData\Local\Microsoft\Windows\Explorer',            # thumbnails
    'AppData\Local\CrashDumps',
    'AppData\Local\Temp\chrome_BITS'
)

# Caches de sistema (fora dos perfis) limpos por completo.
$SystemCacheFolders = @(
    'C:\Windows\Temp',
    'C:\Windows\SoftwareDistribution\Download',            # cache do Windows Update
    'C:\ProgramData\Microsoft\Windows\WER\ReportQueue',
    'C:\ProgramData\Microsoft\Windows\WER\ReportArchive'
)

# NUNCA tocar (guarda dura, alem da idade).
$HardExclude = @('C:\', 'C:\Windows', 'C:\Program Files', 'C:\Program Files (x86)',
                 'C:\Users', 'C:\ProgramData', 'C:\Sysmax')

# Caminhos protegidos por padrao (qualquer arquivo/pasta cujo caminho contenha isto e
# preservado, mesmo dentro de %TEMP%). Protege sessoes ATIVAS do Claude Code (VS Code/cmd)
# E a INSTALACAO do Claude Code (incidente 2026-07-15: o binario foi apagado e teve
# que ser reinstalado). Cobre instalador nativo (.local), WinGet, npm global e config.
$SkipPathContains = @(
    '\claude\', '\.claude\', '\Code\User\workspaceStorage\',
    '\.local\bin\',                  # binario do instalador nativo (claude.exe)
    '\.local\share\claude',          # versoes instaladas do Claude Code
    '\.local\state\claude',          # locks/estado do Claude Code
    '\Microsoft\WinGet\',            # pacotes e links do WinGet (inclui Anthropic.ClaudeCode)
    '\claude-code',                  # instalacao via npm (@anthropic-ai/claude-code)
    '\@anthropic-ai\',
    '\Anthropic.ClaudeCode'
)

# Nomes de arquivo NUNCA removidos, em qualquer pasta (ate dentro de caches/Temp).
$SkipFileNames = @('claude.exe', 'claude.cmd', 'claude.ps1', 'claude')

# ------------------------------------------------------------- Infra / log ----
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir    = Join-Path $ScriptDir 'logs'
if (-not (Test-Path -LiteralPath $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
$Stamp   = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$LogFile = Join-Path $LogDir "deep-clean_$Stamp.log"

$script:TotalFreed    = 0L
$script:FilesDeleted  = 0
$script:DirsDeleted   = 0
$script:ErrorCount    = 0
$script:SkippedLocked = 0

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = "{0} [{1}] {2}" -f (Get-Date -Format 'HH:mm:ss'), $Level, $Message
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
    switch ($Level) {
        'WARN'  { Write-Host $line -ForegroundColor Yellow }
        'ERROR' { Write-Host $line -ForegroundColor Red }
        'DONE'  { Write-Host $line -ForegroundColor Green }
        default { Write-Host $line }
    }
}

function Get-FreeGB {
    $v = Get-Volume -DriveLetter C -ErrorAction SilentlyContinue
    if ($v) { return [math]::Round($v.SizeRemaining / 1GB, 2) }
    return -1
}

function Test-SkipFile {
    param($f)
    # pula placeholders de nuvem (OneDrive), junctions e arquivos de sistema
    if (([int]($f.Attributes -band [IO.FileAttributes]::ReparsePoint)) -ne 0) { return $true }
    if (([int]($f.Attributes -band [IO.FileAttributes]::Offline))      -ne 0) { return $true }
    if (([int]($f.Attributes -band [IO.FileAttributes]::System))       -ne 0) { return $true }
    return $false
}

function Test-Protected {
    param([string]$FullPath)
    foreach ($pat in $SkipPathContains) { if ($FullPath -like "*$pat*") { return $true } }
    $leaf = Split-Path -Leaf $FullPath
    foreach ($name in $SkipFileNames) { if ($leaf -ieq $name) { return $true } }
    return $false
}

function Test-FileFree {
    # tenta abrir com exclusividade: se travado/sem permissao, retorna $false RAPIDO
    # (nunca chama Remove-Item em arquivo travado -> evita o Warsaw/GAS PENDURAR a exclusao)
    param([string]$Path)
    $fs = $null
    try {
        $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open,
                                     [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        return $true
    } catch { return $false }
    finally { if ($fs) { $fs.Close(); $fs.Dispose() } }
}

function Remove-FileSafe {
    param($f)
    if (Test-Protected $f.FullName) { return }   # sessao ativa / caminho protegido
    $size = $f.Length
    if ($DryRun) {
        Write-Log ("[SIMULA] {0:N1} MB  {1}" -f ($size/1MB), $f.FullName)
        $script:TotalFreed   += $size
        $script:FilesDeleted += 1
        return
    }
    if (-not (Test-FileFree $f.FullName)) { $script:SkippedLocked += 1; return }  # em uso -> pula
    try {
        Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
        $script:TotalFreed   += $size
        $script:FilesDeleted += 1
    } catch {
        $script:ErrorCount += 1
        Write-Log ("Falha ao remover {0} -> {1}" -f $f.FullName, $_.Exception.Message) 'WARN'
    }
}

function Invoke-Cleanup {
    param([string]$Path, [string]$Label, [int]$AgeDays = 0)

    if (-not (Test-Path -LiteralPath $Path -ErrorAction SilentlyContinue)) { return }
    $full = (Resolve-Path -LiteralPath $Path -ErrorAction SilentlyContinue).Path
    if (-not $full) { return }
    if ($HardExclude -contains ($full.TrimEnd('\'))) {
        Write-Log "IGNORADO (guarda dura): $full" 'WARN'; return
    }

    $before = $script:FilesDeleted
    Write-Log "==> $Label : $full  (idade minima: $([string]::Format('{0}', $(if($AgeDays -gt 0){"$AgeDays dias"}else{'qualquer'})) ))"

    $cutoff = (Get-Date).AddDays(-$AgeDays)
    Get-ChildItem -LiteralPath $full -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $f = $_
        if (Test-SkipFile $f) { return }
        if ($AgeDays -gt 0) {
            $lastUse = $f.LastWriteTime
            if ($f.LastAccessTime -gt $lastUse) { $lastUse = $f.LastAccessTime }
            if ($lastUse -ge $cutoff) { return }   # usado recentemente -> preserva
        }
        Remove-FileSafe $f
    }

    # remove subpastas que ficaram vazias (nunca a raiz $full)
    Get-ChildItem -LiteralPath $full -Recurse -Directory -Force -ErrorAction SilentlyContinue |
        Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
            $d = $_
            if (([int]($d.Attributes -band [IO.FileAttributes]::ReparsePoint)) -ne 0) { return }
            if (Test-Protected $d.FullName) { return }
            $empty = -not (Get-ChildItem -LiteralPath $d.FullName -Force -ErrorAction SilentlyContinue)
            if ($empty) {
                if ($DryRun) { $script:DirsDeleted += 1; return }
                try { Remove-Item -LiteralPath $d.FullName -Force -ErrorAction Stop; $script:DirsDeleted += 1 } catch {}
            }
        }

    $n = $script:FilesDeleted - $before
    if ($n -gt 0) { Write-Log "    $n arquivo(s) tratado(s) em $Label" }
}

function Get-BuildDirs {
    # walk iterativo com poda + limite de profundidade (pastas de build ficam perto da raiz).
    param([string]$Root, [int]$MaxDepth = 7)
    $results = New-Object System.Collections.ArrayList
    if (-not (Test-Path -LiteralPath $Root -ErrorAction SilentlyContinue)) { return $results }
    $stack = New-Object System.Collections.Stack; $stack.Push(@($Root, 0))
    while ($stack.Count -gt 0) {
        $item = $stack.Pop(); $cur = $item[0]; $depth = $item[1]
        if ($depth -gt $MaxDepth) { continue }
        foreach ($k in (Get-ChildItem -LiteralPath $cur -Directory -Force -ErrorAction SilentlyContinue)) {
            if (([int]($k.Attributes -band [IO.FileAttributes]::ReparsePoint)) -ne 0) { continue }
            if ($BuildScanPrune -contains $k.Name) { continue }
            if ($BuildDirNames -contains $k.Name) { [void]$results.Add($k) } else { $stack.Push(@($k.FullName, $depth + 1)) }
        }
    }
    return $results
}

function Invoke-BuildCleanup {
    # So varre as raizes em $ProjectScanRoots. Por padrao a lista e VAZIA: varrer a monorepo
    # ATIVA (C:\Sysmax) nunca acha build parado (tudo em uso) e ainda pendura sob SYSTEM.
    # Aponte $ProjectScanRoots para pastas de projetos ARQUIVADOS/abandonados quando quiser.
    param([int]$AgeDays)
    if (-not $ProjectScanRoots -or $ProjectScanRoots.Count -eq 0) { Write-Log "    (nenhuma raiz configurada)"; return }
    $cutoff = (Get-Date).AddDays(-$AgeDays)
    foreach ($root in $ProjectScanRoots) {
        if (-not (Test-Path -LiteralPath $root -ErrorAction SilentlyContinue)) { continue }
        Write-Log "==> build/cache scan: $root  (parado ha +$AgeDays dias)"
        foreach ($d in (Get-BuildDirs -Root $root)) {
            if (Test-Protected $d.FullName) { continue }     # instalacao/sessao do Claude Code
            if ($d.LastWriteTime -ge $cutoff) { continue }   # projeto ativo -> preserva
            $bytes = (Get-ChildItem -LiteralPath $d.FullName -Recurse -File -Force -ErrorAction SilentlyContinue |
                      Measure-Object -Property Length -Sum).Sum
            if (-not $bytes) { $bytes = 0 }
            if ($DryRun) {
                Write-Log ("[SIMULA] {0:N1} MB  {1}" -f ($bytes/1MB), $d.FullName)
                $script:TotalFreed += $bytes; $script:DirsDeleted += 1; continue
            }
            try {
                Remove-Item -LiteralPath $d.FullName -Recurse -Force -ErrorAction Stop
                $script:TotalFreed += $bytes; $script:DirsDeleted += 1
                Write-Log ("removido {0:N1} MB  {1}" -f ($bytes/1MB), $d.FullName)
            } catch {
                $script:ErrorCount += 1
                Write-Log ("Falha ao remover {0} -> {1}" -f $d.FullName, $_.Exception.Message) 'WARN'
            }
        }
    }
}

# ------------------------------------------------------------------ Start -----
Write-Log ("===== SysMax Deep Clean iniciado {0} =====" -f $Stamp)
if ($DryRun) { Write-Log "MODO SIMULACAO (-DryRun): NADA sera apagado." 'WARN' }

$freeBefore = Get-FreeGB
Write-Log ("Espaco livre em C: {0} GB  (gatilho: < {1} GB)" -f $freeBefore, $MinFreeGB)

if (-not $Force -and -not $DryRun -and $freeBefore -ge $MinFreeGB) {
    Write-Log "Espaco suficiente. Nada a fazer." 'DONE'
    exit 0
}

# 1) Perfis reais (pula Public e junctions como 'Todos os Usuarios' / 'Usuario Padrao')
$skipProfiles = @('Public', 'Default', 'Default User', 'All Users')
$profiles = Get-ChildItem 'C:\Users' -Directory -Force -ErrorAction SilentlyContinue | Where-Object {
    $skipProfiles -notcontains $_.Name -and (([int]($_.Attributes -band [IO.FileAttributes]::ReparsePoint)) -eq 0)
}
Write-Log ("Perfis considerados: {0}" -f ($profiles.Name -join ', '))

# ORDEM: primeiro o que tem valor e baixo risco de lock; caches volateis por ULTIMO,
# assim um eventual travamento (Warsaw/GAS) no Temp nao impede o resto de rodar.

# 2) Pastas do usuario por idade (+MaxAgeDays sem uso) -- alto valor, baixo lock
Write-Log "----- Pastas do usuario (nao usadas ha +$MaxAgeDays dias) -----"
foreach ($prof in $profiles) {
    foreach ($rel in $UserAgedFolders) {
        Invoke-Cleanup -Path (Join-Path $prof.FullName $rel) -Label "$rel/$($prof.Name)" -AgeDays $MaxAgeDays
    }
}

# 3) Builds/caches de projeto parados (regeneraveis)
Write-Log "----- Builds/caches de projeto (parados ha +$MaxAgeDays dias) -----"
Invoke-BuildCleanup -AgeDays $MaxAgeDays

# 4) Caches de sistema (WER, Windows Update, Windows\Temp)
Write-Log "----- Caches de sistema -----"
foreach ($p in $SystemCacheFolders) { Invoke-Cleanup -Path $p -Label 'cache-sistema' -AgeDays 0 }

# 5) Caches por usuario (VOLATIL: Temp/navegadores) -- por ULTIMO; so mexe no que tem +1 dia
Write-Log "----- Caches por usuario (Temp/navegadores, +1 dia) -----"
foreach ($prof in $profiles) {
    foreach ($rel in $UserCacheFolders) {
        Invoke-Cleanup -Path (Join-Path $prof.FullName $rel) -Label "cache/$($prof.Name)" -AgeDays 1
    }
}

# 6) Lixeira
if (-not $DryRun) {
    try { Clear-RecycleBin -Force -ErrorAction Stop; Write-Log "Lixeira esvaziada." }
    catch { Write-Log "Lixeira ja vazia ou indisponivel." }
} else { Write-Log "[SIMULA] esvaziaria a Lixeira." }

# ---------------------------------------------------------------- Resumo ------
$freeAfter = Get-FreeGB
Write-Log "===================== RESUMO =====================" 'DONE'
Write-Log ("Arquivos removidos : {0}" -f $script:FilesDeleted) 'DONE'
Write-Log ("Pastas vazias      : {0}" -f $script:DirsDeleted)  'DONE'
Write-Log ("Espaco liberado    : {0:N2} GB" -f ($script:TotalFreed/1GB)) 'DONE'
Write-Log ("Pulados (em uso)   : {0}" -f $script:SkippedLocked) 'DONE'
Write-Log ("Falhas (outras)    : {0}" -f $script:ErrorCount) 'DONE'
Write-Log ("Livre antes -> depois: {0} GB -> {1} GB" -f $freeBefore, $freeAfter) 'DONE'
Write-Log ("Log: {0}" -f $LogFile) 'DONE'
exit 0
