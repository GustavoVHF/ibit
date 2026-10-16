# IBIT - Setup automatico do WhatsApp (Evolution API + automacao)
# Uso (na raiz do projeto):  powershell -ExecutionPolicy Bypass -File whatsapp\scripts\setup.ps1
#
# O que faz:
#  1. Cria whatsapp\.env com chaves aleatorias (se ainda nao existir)
#  2. Copia a service account do Firebase de .env.local/.env para whatsapp\secrets\
#  3. Sobe os containers (Evolution API, Postgres, Redis, automacao)
#  4. Abre a pagina do QR code para conectar seu WhatsApp

$ErrorActionPreference = 'Stop'
$WhatsappDir = Split-Path -Parent $PSScriptRoot
$RootDir = Split-Path -Parent $WhatsappDir
$EnvFile = Join-Path $WhatsappDir '.env'
$EnvExample = Join-Path $WhatsappDir '.env.example'
$SecretsDir = Join-Path $WhatsappDir 'secrets'
$SaFile = Join-Path $SecretsDir 'firebase-service-account.json'
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
$ExpectedProjectId = 'gen-lang-client-0146133714'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function New-Secret { ([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')) }

function Get-EnvValue([string]$file, [string]$key) {
  if (-not (Test-Path $file)) { return $null }
  foreach ($line in [IO.File]::ReadAllLines($file)) {
    if ($line -match "^\s*$key\s*=(.*)$") {
      $v = $Matches[1].Trim()
      if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) {
        $v = $v.Substring(1, $v.Length - 2)
      }
      return $v
    }
  }
  return $null
}

# ---------------------------------------------------------------- 1. .env
Write-Step 'Configurando whatsapp\.env'
if (Test-Path $EnvFile) {
  Write-Host '.env ja existe - mantendo valores atuais.'
  # Adiciona variaveis novas que ainda nao existem no .env antigo
  $existing = [IO.File]::ReadAllText($EnvFile)
  $additions = @()
  if ($existing -notmatch '(?m)^WEBHOOK_SECRET=') { $additions += "WEBHOOK_SECRET=$(New-Secret)" }
  if ($existing -notmatch '(?m)^COMMANDS_ENABLED=') { $additions += 'COMMANDS_ENABLED=true' }
  if ($additions.Count) {
    $block = "`n# ---------- Comandos no grupo (adicionado pelo setup) ----------`n" + ($additions -join "`n") + "`n"
    [IO.File]::AppendAllText($EnvFile, $block, $Utf8NoBom)
    Write-Host "Adicionado ao .env: $(($additions | ForEach-Object { ($_ -split '=')[0] }) -join ', ')" -ForegroundColor Green
  }
} else {
  $content = [IO.File]::ReadAllText($EnvExample)
  $content = $content -replace '(?m)^WEBHOOK_SECRET=.*$', "WEBHOOK_SECRET=$(New-Secret)"
  $content = $content -replace '(?m)^EVOLUTION_API_KEY=.*$', "EVOLUTION_API_KEY=$(New-Secret)"
  $content = $content -replace '(?m)^AUTOMATION_API_KEY=.*$', "AUTOMATION_API_KEY=$(New-Secret)"
  $content = $content -replace '(?m)^POSTGRES_PASSWORD=.*$', "POSTGRES_PASSWORD=$(New-Secret)"
  $appUrl = Get-EnvValue (Join-Path $RootDir '.env.local') 'VITE_APP_URL'
  if (-not $appUrl) { $appUrl = Get-EnvValue (Join-Path $RootDir '.env') 'VITE_APP_URL' }
  # Dominio da plataforma e ibitcrn (nao ibit): normaliza o host caso o projeto ainda use "ibit."
  if ($appUrl) {
    $appUrl = $appUrl -replace '://ibit\.', '://ibitcrn.'
    $content = $content -replace '(?m)^APP_URL=.*$', "APP_URL=$appUrl"
  }
  [IO.File]::WriteAllText($EnvFile, $content, $Utf8NoBom)
  Write-Host '.env criado com chaves aleatorias.' -ForegroundColor Green
}

# ---------------------------------------------------------------- 2. Firebase service account
Write-Step 'Credencial do Firebase (service account)'
New-Item -ItemType Directory -Force -Path $SecretsDir | Out-Null
if (Test-Path $SaFile) {
  Write-Host 'secrets\firebase-service-account.json ja existe.'
} else {
  $sa = $null
  foreach ($f in @('.env.local', '.env')) {
    $sa = Get-EnvValue (Join-Path $RootDir $f) 'FIREBASE_SERVICE_ACCOUNT'
    if ($sa -and $sa.Trim().StartsWith('{')) { Write-Host "Usando FIREBASE_SERVICE_ACCOUNT de $f"; break }
    $sa = $null
  }
  if (-not $sa) {
    Write-Host 'FIREBASE_SERVICE_ACCOUNT nao encontrado em .env.local/.env.' -ForegroundColor Yellow
    Write-Host "Baixe a chave no Firebase Console e salve em: $SaFile" -ForegroundColor Yellow
    Write-Host 'Depois rode este script de novo.' -ForegroundColor Yellow
    exit 1
  }
  try { $json = $sa | ConvertFrom-Json } catch { Write-Host 'FIREBASE_SERVICE_ACCOUNT nao e um JSON valido.' -ForegroundColor Red; exit 1 }
  if ($json.type -ne 'service_account') { Write-Host 'JSON nao parece uma service account.' -ForegroundColor Red; exit 1 }
  if ($json.project_id -ne $ExpectedProjectId) {
    Write-Host "Aviso: service account do projeto '$($json.project_id)', esperado '$ExpectedProjectId'." -ForegroundColor Yellow
  }
  [IO.File]::WriteAllText($SaFile, $sa, $Utf8NoBom)
  Write-Host 'Service account salva em whatsapp\secrets\ (fora do git).' -ForegroundColor Green
}

# ---------------------------------------------------------------- 3. Docker
Write-Step 'Subindo containers'
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Docker nao esta rodando. Abra o Docker Desktop e rode este script de novo.' -ForegroundColor Red
  exit 1
}
docker compose --project-directory $WhatsappDir -f (Join-Path $WhatsappDir 'docker-compose.yml') up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host 'Falha no docker compose up.' -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- 4. Aguarda automacao
Write-Step 'Aguardando automacao responder'
$port = Get-EnvValue $EnvFile 'AUTOMATION_PORT'; if (-not $port) { $port = '3333' }
$key = Get-EnvValue $EnvFile 'AUTOMATION_API_KEY'
$base = "http://localhost:$port"
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $h = Invoke-RestMethod -UseBasicParsing "$base/health" -TimeoutSec 5
    # Espera a automacao E a Evolution API estarem de pe
    if ($h.ok -and $h.whatsapp -ne 'unreachable') { $ok = $true; break }
  } catch { }
  Start-Sleep -Seconds 3
}
if (-not $ok) {
  Write-Host 'Automacao nao respondeu. Veja os logs:' -ForegroundColor Red
  Write-Host "  docker compose --project-directory `"$WhatsappDir`" logs -f automation evolution-api"
  exit 1
}
Write-Host "Automacao OK. WhatsApp: $($h.whatsapp)" -ForegroundColor Green

if ($h.whatsapp -ne 'open') {
  Write-Step 'Abrindo pagina do QR code'
  Write-Host 'Escaneie com o WhatsApp: Configuracoes > Dispositivos conectados > Conectar dispositivo'
  Start-Process "$base/whatsapp/qr?key=$key"
}

Write-Host "`nPronto. Proximo passo: vincular o grupo do projeto:" -ForegroundColor Green
Write-Host '  powershell -ExecutionPolicy Bypass -File whatsapp\scripts\groups.ps1'
Write-Host "`nPainel da Evolution API: http://localhost:8080/manager (chave: EVOLUTION_API_KEY do whatsapp\.env)"
