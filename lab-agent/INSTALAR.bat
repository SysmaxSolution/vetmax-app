@echo off
REM SYSVETMAX - Instalar o Agente de Laboratorio (duplo-clique).
REM Eleva para Administrador e roda o install.ps1 usando o config.json do pacote.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','\"%~dp0install.ps1\"'"
echo.
echo Se abriu uma janela azul pedindo permissao, confirme para instalar.
pause
