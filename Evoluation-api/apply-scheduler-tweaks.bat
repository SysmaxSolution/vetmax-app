@echo off
REM apply-scheduler-tweaks.bat — Atalho para rodar apply-scheduler-tweaks.ps1 elevado
REM Clique direito neste arquivo -> "Executar como administrador"
REM (ou execute em PowerShell elevado)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply-scheduler-tweaks.ps1"
echo.
echo Pressione qualquer tecla para fechar...
pause >nul
