# IBIT - Roda as rotinas manualmente (o agendamento automatico ja roda sozinho).
# Uso:
#   powershell -ExecutionPolicy Bypass -File whatsapp\scripts\jobs.ps1 -Job deadlines -DryRun   (previa, nao envia)
#   powershell -ExecutionPolicy Bypass -File whatsapp\scripts\jobs.ps1 -Job deadlines           (envia pendentes)
#   powershell -ExecutionPolicy Bypass -File whatsapp\scripts\jobs.ps1 -Job weekly -DryRun
#   powershell -ExecutionPolicy Bypass -File whatsapp\scripts\jobs.ps1 -Job weekly -Force      (reenvia relatorio)
#   powershell -ExecutionPolicy Bypass -File whatsapp\scripts\jobs.ps1 -Job status

param(
  [Parameter(Mandatory = $true)][ValidateSet('deadlines', 'weekly', 'status', 'comandos')][string]$Job,
  [switch]$DryRun,
  [switch]$Force,
  [string]$ProjectId = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

if ($Job -eq 'status') {
  Invoke-Automation GET '/whatsapp/status' | Format-List | Out-Host
  (Invoke-Automation GET '/whatsapp/targets').targets | Format-Table projectId, groupName, groupId, deadlineAlerts, weeklyReport, source -AutoSize | Out-Host
  Invoke-Automation GET '/jobs/schedule' | ConvertTo-Json -Depth 5 | Out-Host
  exit 0
}

if ($Job -eq 'comandos') {
  # Previa das respostas de cada comando (nao envia nada no grupo)
  foreach ($c in '/ajuda', '/kpis', '/tarefas', '/tarefas feito', '/mover 1 fazendo', '/criartarefa Exemplo; amanhã; fazendo', '/gantt', '/gantt engenharia', '/prazos', '/calendario', '/financeiro') {
    $body = @{ text = $c }
    if ($ProjectId) { $body.projectId = $ProjectId }
    $r = Invoke-Automation POST '/commands/preview' $body
    Write-Host "`n===== $c =====" -ForegroundColor Cyan
    Write-Host $r.message
  }
  exit 0
}

$q = @()
if ($DryRun) { $q += 'dryRun=1' }
if ($Force) { $q += 'force=1' }
if ($ProjectId) { $q += 'projectId=' + [uri]::EscapeDataString($ProjectId) }
$path = if ($Job -eq 'deadlines') { '/jobs/deadline-alerts/run' } else { '/jobs/weekly-report/run' }
if ($q.Count) { $path += '?' + ($q -join '&') }

$r = Invoke-Automation POST $path
foreach ($item in $r.results) {
  $color = if ($item.status -eq 'failed') { 'Red' } elseif ($item.status -eq 'sent') { 'Green' } else { 'Gray' }
  Write-Host "`n[$($item.status)] projeto $($item.projectName) ($($item.projectId))" -ForegroundColor $color
  if ($item.error) { Write-Host "  erro: $($item.error)" -ForegroundColor Red }
  if ($null -ne $item.sent) { Write-Host "  tarefas: candidatas=$($item.candidates) enviadas=$($item.sent) ja-avisadas=$($item.skipped)" }
  if ($item.message) { Write-Host "  ----- mensagem -----"; Write-Host $item.message; Write-Host "  --------------------" }
}
if (-not $r.results -or $r.results.Count -eq 0) { Write-Host 'Nenhum grupo vinculado. Rode scripts\groups.ps1' -ForegroundColor Yellow }
