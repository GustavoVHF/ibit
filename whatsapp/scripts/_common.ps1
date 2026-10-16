# Funcoes compartilhadas pelos scripts (le whatsapp\.env e chama a API local da automacao).

$WhatsappDir = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $WhatsappDir '.env'
if (-not (Test-Path $EnvFile)) {
  Write-Host 'whatsapp\.env nao existe. Rode antes: powershell -ExecutionPolicy Bypass -File whatsapp\scripts\setup.ps1' -ForegroundColor Red
  exit 1
}

function Get-DotEnv([string]$key) {
  foreach ($line in [IO.File]::ReadAllLines($EnvFile)) {
    if ($line -match "^\s*$key\s*=(.*)$") { return $Matches[1].Trim() }
  }
  return $null
}

$AutomationPort = Get-DotEnv 'AUTOMATION_PORT'; if (-not $AutomationPort) { $AutomationPort = '3333' }
$AutomationKey = Get-DotEnv 'AUTOMATION_API_KEY'
$AutomationBase = "http://localhost:$AutomationPort"

function Invoke-Automation([string]$Method, [string]$Path, $Body = $null, [int]$TimeoutSec = 180) {
  $params = @{
    Method = $Method
    Uri = "$AutomationBase$Path"
    Headers = @{ 'x-api-key' = $AutomationKey }
    TimeoutSec = $TimeoutSec
    UseBasicParsing = $true
  }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json; charset=utf-8'
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 5 -Compress))
  }
  try {
    return Invoke-RestMethod @params
  } catch {
    $msg = $_.ErrorDetails.Message
    if (-not $msg) { $msg = $_.Exception.Message }
    Write-Host "Erro em $Method $Path : $msg" -ForegroundColor Red
    Write-Host 'Containers rodando? docker compose --project-directory whatsapp ps' -ForegroundColor Yellow
    exit 1
  }
}
