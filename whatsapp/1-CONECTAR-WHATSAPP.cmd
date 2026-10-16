@echo off
REM Clique duas vezes: sobe o sistema (se preciso) e abre o QR code no navegador.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1"
pause
