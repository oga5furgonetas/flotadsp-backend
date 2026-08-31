# -----------------------------------------------------------------
# FlotaDSP - Despliega el FRONTEND a PRODUCCION (flotadsp.com)
#
# Usa esto en vez del comando a mano. Motivo: "--branch main" no es
# opcional (gotcha 16) y aqui va cosido, no se puede olvidar. Ademas
# comprueba al final que flotadsp.com sirve de verdad lo compilado,
# y falla a gritos si no.
#
#   .\scripts\deploy-frontend.ps1
# -----------------------------------------------------------------
$ErrorActionPreference = "Stop"

$raiz = Join-Path $PSScriptRoot ".."

# La extension que descargan los clientes se reempaqueta SIEMPRE antes de
# compilar. Un ZIP generado a mano se queda viejo y nadie se entera hasta que
# un cliente reporta un fallo que ya estaba arreglado hace tres versiones.
Write-Host "==> Empaquetando la extension de Cortex..."
# Con la ruta COMPLETA: en esta maquina `node` a secas resuelve a un stub de
# system32 que no imprime nada y no devuelve codigo de salida, asi que el
# empaquetado fallaba en silencio y tumbaba el despliegue entero.
$nodeExe = Join-Path $env:ProgramFiles "nodejs\node.exe"
if (-not (Test-Path $nodeExe)) { $nodeExe = "node" }
& $nodeExe (Join-Path $PSScriptRoot "empaquetar-extension.mjs")
if ($LASTEXITCODE -ne 0) { throw "no se pudo empaquetar la extension" }

Set-Location (Join-Path $raiz "frontend-v2")

Write-Host "==> Compilando frontend (produccion)..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "la compilacion ha fallado, no se despliega nada" }

Write-Host "==> Subiendo a Cloudflare Pages, rama main (produccion)..."
npx wrangler pages deploy dist --project-name flotadsp-v2 --branch main --commit-dirty=true
if ($LASTEXITCODE -ne 0) { throw "wrangler ha fallado al desplegar" }

Write-Host ""
Write-Host "==> Comprobando que produccion sirve de verdad esta compilacion..."
# El edge tarda unos segundos en propagar: se le dan 90.
& (Join-Path $PSScriptRoot "verificar-produccion.ps1") -Esperar 90
exit $LASTEXITCODE
