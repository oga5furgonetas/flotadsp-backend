# -----------------------------------------------------------------
# FlotaDSP - Comprueba que PRODUCCION sirve lo que acabas de compilar
#
# Existe por el gotcha 16: si te dejas "--branch main" en el deploy de
# Cloudflare Pages, wrangler dice "Success" y te da una URL que funciona,
# pero flotadsp.com NO cambia. Ningun error, ninguna pista. Este script
# es el que grita.
#
#   .\scripts\verificar-produccion.ps1              # comprueba y ya
#   .\scripts\verificar-produccion.ps1 -Esperar 120 # reintenta 120 s
#
# Sale con codigo 1 si produccion no sirve el bundle local.
# -----------------------------------------------------------------
param(
    [int]$Esperar = 0,          # segundos reintentando antes de rendirse
    [switch]$SoloBackend        # salta la comprobacion del frontend
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$WEB      = "https://flotadsp.com/"
$BACKEND  = "https://flotadsp-backend.fly.dev"
$DIST     = Join-Path $PSScriptRoot "..\frontend-v2\dist\index.html"
$fallos   = @()

function Get-HashLocal {
    if (-not (Test-Path $DIST)) { return $null }
    $html = [System.IO.File]::ReadAllText($DIST)
    if ($html -match 'assets/v2/(index-[A-Za-z0-9_-]+\.js)') { return $Matches[1] }
    return $null
}

function Get-HashProduccion {
    # Cache-buster: que no nos conteste una copia guardada del edge
    $url = $WEB + "?nocache=" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25 `
                               -Headers @{ "Cache-Control" = "no-cache" }
    } catch {
        return $null
    }
    if ($r.Content -match 'assets/v2/(index-[A-Za-z0-9_-]+\.js)') { return $Matches[1] }
    return $null
}

# ---------- 1. Backend vivo y con Mongo ----------
Write-Host "==> Backend: $BACKEND/api/health"
try {
    $h = Invoke-RestMethod -Uri "$BACKEND/api/health" -TimeoutSec 30
    if ($h.status -ne "ok")      { $fallos += "el backend responde status='$($h.status)', no 'ok'" }
    if (-not $h.mongo_connected) { $fallos += "el backend NO esta conectado a Mongo" }
    if ($fallos.Count -eq 0)     { Write-Host "    ok - version $($h.version), mongo conectado" }
} catch {
    $fallos += "el backend no responde: $($_.Exception.Message)"
}

# ---------- 2. flotadsp.com sirve el bundle que hay en dist/ ----------
if (-not $SoloBackend) {
    $local = Get-HashLocal
    if ($null -eq $local) {
        Write-Host "==> Frontend: no hay frontend-v2\dist\index.html compilado, no hay nada que comparar (se salta)"
    } else {
        Write-Host "==> Frontend: dist local sirve $local"
        $limite   = (Get-Date).AddSeconds($Esperar)
        $remoto   = Get-HashProduccion
        $intentos = 1
        while ($remoto -ne $local -and (Get-Date) -lt $limite) {
            Start-Sleep -Seconds 5
            $remoto = Get-HashProduccion
            $intentos++
            Write-Host "    esperando a que flotadsp.com cambie... (intento $intentos, ahora sirve $remoto)"
        }
        if ($null -eq $remoto) {
            $fallos += "no se ha podido leer el bundle que sirve flotadsp.com"
        } elseif ($remoto -ne $local) {
            $fallos += @"
flotadsp.com sigue sirviendo un bundle VIEJO.
       compilado en local : $local
       servido en produccion: $remoto
       Casi seguro que el deploy se fue a Preview: es el gotcha 16, falta --branch main.
       Repitelo asi:
         cd frontend-v2
         npx wrangler pages deploy dist --project-name flotadsp-v2 --branch main --commit-dirty=true
"@
        } else {
            Write-Host "    ok - produccion sirve exactamente el bundle local"
        }
    }
}

# ---------- Veredicto ----------
Write-Host ""
if ($fallos.Count -gt 0) {
    Write-Host "###############################################################" -ForegroundColor Red
    Write-Host "##  EL DESPLIEGUE NO ESTA EN PRODUCCION                      ##" -ForegroundColor Red
    Write-Host "###############################################################" -ForegroundColor Red
    foreach ($f in $fallos) { Write-Host "  -> $f" -ForegroundColor Red }
    Write-Host ""
    exit 1
}
Write-Host "OK - produccion esta sirviendo lo ultimo." -ForegroundColor Green
exit 0
