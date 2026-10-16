# IBIT - Verifica se tudo esta automatizado (Docker, WhatsApp, webhook, grupo, agenda).
# Uso: powershell -ExecutionPolicy Bypass -File whatsapp\scripts\status.ps1

$ErrorActionPreference = 'Continue'
$script:problems = 0

function Show-Check([bool]$ok, [string]$label, [string]$fix = '') {
  if ($ok) {
    Write-Host '  [OK]    ' -ForegroundColor Green -NoNewline; Write-Host $label
  } else {
    $script:problems++
    Write-Host '  [FALTA] ' -ForegroundColor Red -NoNewline; Write-Host $label
    if ($fix) { Write-Host "          -> $fix" -ForegroundColor Yellow }
  }
}

Write-Host "`n=== IBIT WhatsApp - verificacao ===`n" -ForegroundColor Cyan

# 1. Docker
docker info *> $null
$dockerUp = ($LASTEXITCODE -eq 0)
Show-Check $dockerUp 'Docker Desktop esta aberto' 'Abra o Docker Desktop (icone da baleia) e rode de novo.'

$autoStart = $false
$settings = Join-Path $env:APPDATA 'Docker\settings-store.json'
if (Test-Path $settings) {
  try { $autoStart = [bool]((Get-Content $settings -Raw | ConvertFrom-Json).AutoStart) } catch { }
}
Show-Check $autoStart 'Docker abre sozinho quando o Windows liga' 'Docker Desktop > Settings > General > marque "Start Docker Desktop when you sign in" > Apply.'

if (-not $dockerUp) {
  Write-Host "`nSem o Docker aberto nao da para checar o resto." -ForegroundColor Yellow
  exit 1
}

# 2. Containers
$names = 'ibit_evolution_api', 'ibit_evolution_postgres', 'ibit_evolution_redis', 'ibit_whatsapp_automation'
foreach ($n in $names) {
  $info = docker inspect $n --format '{{.State.Status}}|{{.HostConfig.RestartPolicy.Name}}' 2>$null
  $running = $info -like 'running|*'
  $always = $info -like '*|always'
  Show-Check ($running -and $always) "Container $n rodando (reinicia sozinho)" 'Rode whatsapp\1-CONECTAR-WHATSAPP.cmd'
}

# 3. Automacao / WhatsApp / webhook / grupo
. (Join-Path $PSScriptRoot '_common.ps1')
$H = @{ 'x-api-key' = $AutomationKey }
try { $health = Invoke-RestMethod "$AutomationBase/health" -TimeoutSec 10 } catch { $health = $null }
Show-Check ($null -ne $health) 'Automacao respondendo' 'Rode whatsapp\1-CONECTAR-WHATSAPP.cmd'
if (-not $health) { exit 1 }

Show-Check ($health.whatsapp -eq 'open') "WhatsApp conectado (estado: $($health.whatsapp))" 'Rode whatsapp\1-CONECTAR-WHATSAPP.cmd e escaneie o QR.'

try { $wh = Invoke-RestMethod "$AutomationBase/whatsapp/webhook" -Headers $H -TimeoutSec 15 } catch { $wh = $null }
Show-Check ([bool]$wh.configured) 'Webhook de comandos configurado na Evolution' 'Reinicie: docker restart ibit_whatsapp_automation'

$targets = @((Invoke-RestMethod "$AutomationBase/whatsapp/targets" -Headers $H -TimeoutSec 15).targets)
Show-Check ($targets.Count -gt 0) "Grupo vinculado ($(($targets | ForEach-Object { $_.groupName }) -join ', '))" 'Rode whatsapp\2-ESCOLHER-GRUPO.cmd'

# 4. Agenda e historico
$s = Invoke-RestMethod "$AutomationBase/jobs/schedule" -Headers $H -TimeoutSec 15
Write-Host "`nAgenda (fuso $($s.timezone)):" -ForegroundColor Cyan
Write-Host "  Alertas de prazo : cron '$($s.deadlineAlerts.cron)' (padrao: todo dia 08:00)"
Write-Host "  Resumo semanal   : $($s.weeklyReport.human)"

$hist = Invoke-RestMethod "$AutomationBase/jobs/history" -Headers $H -TimeoutSec 15
Write-Host "`nUltimos envios automaticos:" -ForegroundColor Cyan
$hist.notifications | Select-Object -First 8 | ForEach-Object {
  $what = if ($_.type -eq 'weekly_report') { "resumo semanal $($_.weekKey)" } elseif ($_.taskTitle) { "prazo: $($_.taskTitle)" } else { $_.type }
  $when = if ($_.sentAt) { ([datetime]$_.sentAt).ToLocalTime().ToString('dd/MM HH:mm') } else { '--' }
  Write-Host ("  {0,-6} {1,-11} {2}" -f $_.status, $when, $what)
}
Write-Host "`nUltimos comandos no grupo:" -ForegroundColor Cyan
if (-not $hist.commands -or $hist.commands.Count -eq 0) { Write-Host '  (nenhum ainda - mande /ajuda no grupo)' }
$hist.commands | Select-Object -First 5 | ForEach-Object {
  $when = if ($_.createdAt) { ([datetime]$_.createdAt).ToLocalTime().ToString('dd/MM HH:mm') } else { '--' }
  Write-Host ("  {0,-8} {1,-11} /{2} {3} ({4})" -f $_.status, $when, $_.command, $_.args, $_.senderName)
}

if ($script:problems -eq 0) {
  Write-Host "`nTUDO AUTOMATIZADO. Pode fechar esta janela.`n" -ForegroundColor Green
} else {
  Write-Host "`n$($script:problems) item(ns) pendente(s). Siga as dicas em amarelo acima.`n" -ForegroundColor Yellow
}
