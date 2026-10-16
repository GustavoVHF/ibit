@echo off
REM Clique duas vezes: lista seus grupos do WhatsApp e vincula um ao projeto IBIT.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\groups.ps1"
pause
