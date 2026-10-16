# IBIT - Lista os grupos do seu WhatsApp e vincula um grupo a um projeto IBIT.
# Uso:
#   powershell -ExecutionPolicy Bypass -File whatsapp\scripts\groups.ps1              (interativo)
#   powershell -ExecutionPolicy Bypass -File whatsapp\scripts\groups.ps1 -List        (so lista grupos + IDs)
#   powershell -ExecutionPolicy Bypass -File whatsapp\scripts\groups.ps1 -Search carnelian
#   powershell -ExecutionPolicy Bypass -File whatsapp\scripts\groups.ps1 -ProjectId <id> -GroupId <id@g.us>

param(
  [string]$Search = '',
  [string]$ProjectId = '',
  [string]$GroupId = '',
  [switch]$List,
  [switch]$NoTest
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$status = Invoke-Automation GET '/whatsapp/status'
if ($status.state -ne 'open') {
  Write-Host "WhatsApp nao conectado (estado: $($status.state))." -ForegroundColor Yellow
  Write-Host "Abra e escaneie o QR: $AutomationBase/whatsapp/qr?key=$AutomationKey"
  Start-Process "$AutomationBase/whatsapp/qr?key=$AutomationKey"
  exit 1
}

if (-not $GroupId) {
  Write-Host 'Buscando grupos (pode levar alguns segundos)...'
  $path = '/whatsapp/groups'
  if ($Search) { $path += '?search=' + [uri]::EscapeDataString($Search) }
  $groups = @((Invoke-Automation GET $path).groups)
  if ($groups.Count -eq 0) { Write-Host 'Nenhum grupo encontrado.' -ForegroundColor Yellow; exit 1 }

  $i = 0
  $groups | ForEach-Object { $i++; [pscustomobject]@{ '#' = $i; Nome = $_.name; ID = $_.id; Pessoas = $_.participants } } | Format-Table -AutoSize | Out-Host
  if ($List) { exit 0 }

  $n = [int](Read-Host 'Numero do grupo que vai receber as mensagens')
  if ($n -lt 1 -or $n -gt $groups.Count) { Write-Host 'Numero invalido.' -ForegroundColor Red; exit 1 }
  $GroupId = $groups[$n - 1].id
  Write-Host "Grupo escolhido: $($groups[$n - 1].name) ($GroupId)" -ForegroundColor Green
}

if (-not $ProjectId) {
  $projects = @((Invoke-Automation GET '/projects').projects)
  $i = 0
  $projects | ForEach-Object { $i++; [pscustomobject]@{ '#' = $i; Projeto = $_.name; Codigo = $_.shortId; ID = $_.id; Membros = $_.members } } | Format-Table -AutoSize | Out-Host
  $n = [int](Read-Host 'Numero do projeto IBIT')
  if ($n -lt 1 -or $n -gt $projects.Count) { Write-Host 'Numero invalido.' -ForegroundColor Red; exit 1 }
  $ProjectId = $projects[$n - 1].id
}

$sendTest = -not $NoTest
if ($sendTest) {
  $answer = Read-Host 'Enviar mensagem de teste no grupo? (S/n)'
  $sendTest = ($answer -eq '' -or $answer -match '^[sSyY]')
}

$r = Invoke-Automation POST '/whatsapp/groups/select' @{ projectId = $ProjectId; groupId = $GroupId; sendTest = $sendTest }
Write-Host "`nVinculado: projeto '$($r.projectName)' -> grupo '$($r.groupName)'" -ForegroundColor Green
Write-Host 'Salvo no Firestore em whatsappIntegrations/' -NoNewline; Write-Host $r.projectId
Write-Host "`nPrevia dos envios (sem enviar):"
Write-Host '  powershell -ExecutionPolicy Bypass -File whatsapp\scripts\jobs.ps1 -Job deadlines -DryRun'
Write-Host '  powershell -ExecutionPolicy Bypass -File whatsapp\scripts\jobs.ps1 -Job weekly -DryRun'
