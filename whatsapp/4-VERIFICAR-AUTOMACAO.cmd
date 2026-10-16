@echo off
REM Clique duas vezes: mostra se esta tudo automatizado (Docker, WhatsApp, webhook, grupo, agenda, ultimos envios).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\status.ps1"
pause
