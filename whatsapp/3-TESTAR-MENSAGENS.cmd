@echo off
REM Clique duas vezes: mostra uma previa de todas as mensagens (NAO envia nada no grupo).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\jobs.ps1" -Job deadlines -DryRun
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\jobs.ps1" -Job weekly -DryRun -Force
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\jobs.ps1" -Job comandos
pause
