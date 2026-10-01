@echo off
REM SYSVETMAX - Atualizar o Agente de Laboratorio JA INSTALADO (duplo-clique).
REM Eleva para Administrador e roda o atualizar.ps1 desta pasta.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"%~dp0atualizar.ps1\"'"
echo.
echo Se abriu uma janela azul pedindo permissao, confirme para atualizar.
pause
