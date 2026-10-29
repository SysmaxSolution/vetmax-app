# Abre a sessao paralela do motor de layouts com Remote Control ativo.
# Roda a partir de C:\SysMax (carrega a memoria do projeto) e libera o worktree
# C:\sysvetmax-layouts, onde o codigo e efetivamente alterado.
# A instrucao inicial apenas aponta para o briefing salvo, que e a fonte da verdade.

$ErrorActionPreference = 'Continue'
Set-Location 'C:\SysMax'

$instrucao = "Leia o arquivo C:\SysMax\PROMPT_SESSAO_LAYOUT_ENGINE.md na integra e execute exatamente o que ele descreve, comecando pela secao 'Sua missao agora: FASE 2'. IMPORTANTE: a secao 'ESTADO ATUAL' registra que a Fase 1 ja foi entregue (7 commits locais na branch feature/layout-engine-v2, migrations 0465-0467, deploy no dev feito) - nao refaca nada dela; confira com 'git log --oneline a8284205..HEAD' dentro de C:\sysvetmax-layouts. Comece em modo plano e me apresente a sequencia da Fase 2 antes de codar."

Write-Host ''
Write-Host '=== Sessao paralela: Motor de Layouts v2 (Fase 2) ===' -ForegroundColor Cyan
Write-Host 'Remote Control: ativo (nome: layout-engine)' -ForegroundColor Cyan
Write-Host 'Worktree liberado: C:\sysvetmax-layouts' -ForegroundColor Cyan
Write-Host ''

claude --remote-control 'layout-engine' --add-dir 'C:\sysvetmax-layouts' $instrucao
