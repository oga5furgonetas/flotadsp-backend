# -----------------------------------------------------------------
# FlotaDSP - Despliega el frontend a STAGING y CALIENTA su edge.
#
# POR QUE EXISTE
# =================================================================
# Staging se desplegaba a mano con tres comandos copiados del CLAUDE.md, y el
# tercero -calentar el edge- no estaba en ninguno de ellos: `calentar-edge.ps1`
# llevaba la URL de produccion clavada dentro, asi que no se podia apuntar
# aqui aunque uno se acordara.
#
# Lo que costo, el 07-09-2026: se le paso a Dani un enlace de staging recien
# desplegado para que viera la tienda, y se le recargaba solo una y otra vez.
# No era la tienda: era el gotcha 8: los .js todavia no estaban propagados,
# `_redirects` devolvia el index.html con 200 bajo la URL .js, y la defensa
# del cliente hacia justo lo que debe -reparar y recargar-. Desde fuera:
# "no para de resetearse".
#
# Produccion llevaba meses cubierta por `deploy-frontend.ps1`. Esto es lo
# mismo para staging, y por eso va en un script y no en una nota.
#
# USO
#   .\scripts\deploy-staging.ps1
# -----------------------------------------------------------------
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RAIZ  = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FRONT = Join-Path $RAIZ "frontend-v2"
$DIST  = Join-Path $FRONT "dist-staging"
$WEB   = "https://staging.flotadsp-v2.pages.dev"
$API   = "https://flotadsp-backend-staging.fly.dev/api"

Write-Host "==> Compilando contra el backend de staging"
Push-Location $FRONT
try {
    # dist-staging, NO dist: pisar dist/ dejaria el build de produccion
    # apuntando al backend de staging, y el siguiente deploy lo subiria.
    $env:VITE_API_URL = $API
    & npm run build -- --outDir dist-staging
    if ($LASTEXITCODE -ne 0) { throw "npm run build ha fallado" }
    Remove-Item Env:\VITE_API_URL -ErrorAction SilentlyContinue

    Write-Host "==> Desplegando a la rama staging"
    & npx wrangler pages deploy dist-staging --project-name flotadsp-v2 --branch staging --commit-dirty=true
    if ($LASTEXITCODE -ne 0) { throw "wrangler ha fallado" }
} finally {
    Pop-Location
}

# Comprobar que staging sirve DE VERDAD lo que se acaba de compilar. Sin esto,
# "Deployment complete" no significa nada (es el gotcha 16 por el otro lado).
$local = (Select-String -Path (Join-Path $DIST "index.html") -Pattern "assets/v2/index-[A-Za-z0-9_-]+\.js" -AllMatches).Matches[0].Value
Write-Host "==> Comprobando: dist-staging sirve $local"
$ok = $false
for ($i = 1; $i -le 12; $i++) {
    Start-Sleep -Seconds 5
    try {
        $html = (Invoke-WebRequest -Uri "$WEB/" -UseBasicParsing -Headers @{ "Cache-Control" = "no-cache" }).Content
        if ($html -match [Regex]::Escape($local)) { $ok = $true; break }
    } catch { }
    Write-Host "    esperando a que staging cambie... (intento $i)"
}
if (-not $ok) {
    Write-Host "AVISO - staging todavia no sirve el bundle nuevo." -ForegroundColor Yellow
} else {
    Write-Host "    ok - staging sirve exactamente el bundle local"
}

# EL PASO QUE FALTABA. Va aqui cosido, no en una nota del CLAUDE.md.
& (Join-Path $PSScriptRoot "calentar-edge.ps1") -Web $WEB -Dist $DIST
