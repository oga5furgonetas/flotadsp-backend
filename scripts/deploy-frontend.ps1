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
