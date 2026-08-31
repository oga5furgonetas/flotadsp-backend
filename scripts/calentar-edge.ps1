# -----------------------------------------------------------------
# FlotaDSP - Pide TODOS los assets recien subidos, uno por uno.
#
# POR QUE EXISTE (gotcha 8)
# =================================================================
# Al desplegar, `index.html` se sirve sin cache y trae los hashes nuevos AL
# INSTANTE, pero los ficheros .js y .css tardan en propagarse por el edge de
# Cloudflare. En esa ventana, un navegador que pida un chunk se encuentra con
# que todavia no existe - y como `_redirects` es `/* /index.html 200`, en vez
# de un 404 recibe **la pagina HTML con codigo 200**. El navegador la guarda
# bajo la URL `.js` durante 4 HORAS y la aplicacion muere:
#
#   - si el envenenado es una pagina    -> "Cannot read properties of
#                                            undefined (reading 'default')"
#   - si es el CSS                      -> se ve en HTML crudo, sin un error
#   - si es el propio index-<hash>.js   -> pantalla EN BLANCO
#
# Ya hay cuatro defensas en el cliente (repairAssetCache, el centinela del
# CSS, arranque.js y el ErrorBoundary), pero todas actuan DESPUES: el usuario
# ya se ha comido la pantalla rota. Le paso a Dani tres veces en seis dias, la
# ultima el 31-08-2026 a las 10:43.
#
# Esto ataca la ventana en si. Pedir cada asset desde aqui hace dos cosas:
#   1. CALIENTA el edge - al responder, Cloudflare lo cachea, asi que el
#      siguiente que lo pida ya lo recibe bien;
#   2. DELATA la ventana, que hoy es invisible: si algo vuelve como text/html,
#      es exactamente el fichero que envenenaria a alguien.
#
# No sustituye a las cuatro defensas del cliente: las complementa. Aquellas
# curan, esta evita.
#
#   .\scripts\calentar-edge.ps1
#   .\scripts\calentar-edge.ps1 -Intentos 6
# -----------------------------------------------------------------
param(
    [int]$Intentos = 4,          # vueltas antes de rendirse
    [int]$EsperaSeg = 10         # pausa entre vueltas
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$WEB  = "https://flotadsp.com"
$DIST = Join-Path $PSScriptRoot "..\frontend-v2\dist"

if (-not (Test-Path $DIST)) {
    Write-Host "No hay dist/ - compila antes." -ForegroundColor Red
    exit 1
}
# Resuelta: `Join-Path` deja el ".." dentro y `FullName` viene ya resuelto, asi
# que restar longitudes sin esto se sale de la cadena.
$DIST = (Resolve-Path $DIST).Path.TrimEnd("\")

# Solo lo que puede envenenarse: lo que el navegador pide por su cuenta y
# cachea con el hash en el nombre.
$assets = Get-ChildItem -Path $DIST -Recurse -File |
    Where-Object { @(".js", ".css") -contains $_.Extension } |
    ForEach-Object { $_.FullName.Substring($DIST.Length).Replace("\", "/") }

if (-not $assets) {
    Write-Host "dist/ no tiene ningun .js ni .css. Algo ha ido mal al compilar." -ForegroundColor Red
    exit 1
}

Write-Host "==> Calentando el edge: $($assets.Count) ficheros"

$pendientes = $assets
for ($vuelta = 1; $vuelta -le $Intentos; $vuelta++) {
    $malos = @()
    foreach ($a in $pendientes) {
        $url = $WEB + $a
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25 -Method Get
            $tipo = [string]$r.Headers["Content-Type"]
            # La prueba de fuego: un asset envenenado responde 200 con HTML.
            # No vale mirar solo el codigo - el 200 es justo el problema.
            if ($tipo -match "text/html") {
                $malos += $a
            }
        } catch {
            # Un 404 aqui seria raro (el catch-all lo impide) pero tampoco es
            # servible: se reintenta igual.
            $malos += $a
        }
    }

    if ($malos.Count -eq 0) {
        Write-Host "    ok - los $($assets.Count) se sirven con su tipo correcto" -ForegroundColor Green
        Write-Host ""
        Write-Host "OK - el edge esta caliente: nadie se va a comer un chunk envenenado."
        exit 0
    }

    Write-Host "    vuelta $vuelta - $($malos.Count) todavia devuelven HTML en vez del fichero" -ForegroundColor Yellow
    foreach ($m in ($malos | Select-Object -First 5)) { Write-Host "      $m" }
    $pendientes = $malos
    if ($vuelta -lt $Intentos) { Start-Sleep -Seconds $EsperaSeg }
}

Write-Host ""
Write-Host "AVISO - $($pendientes.Count) asset(s) siguen sirviendose como HTML." -ForegroundColor Red
Write-Host "Cualquiera que los pida ahora se guarda esa pagina bajo la URL .js"
Write-Host "durante 4 horas. Espera un poco y vuelve a pasar este script:"
Write-Host "  .\scripts\calentar-edge.ps1"
# No se sale con error: el despliegue en si esta bien y el codigo nuevo ya
# esta arriba. Fallar aqui haria que el deploy pareciera roto cuando no lo
# esta - y una alarma que miente se acaba ignorando.
exit 0
