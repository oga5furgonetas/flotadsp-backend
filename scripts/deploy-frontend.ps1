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

# ── Y LA CARPETA FIJA, LA QUE CHROME TIENE CARGADA ──────────────────────────
# Dani se instalo la extension a mano cinco veces en una noche y acabo con
# cincuenta y tantas carpetas «FlotaDSP-Cortex (35)» en Descargas. Cargada
# descomprimida desde UNA carpeta fija, aqui se deja la version nueva y la
# propia extension se recarga sola (ver `mirarSiHayVersionNueva`).
# Si la carpeta no existe, no pasa nada: es que en esta maquina no se usa.
$fija = Join-Path $env:USERPROFILE "Cortex-FlotaDSP"
if (Test-Path $fija) {
  $origen = Join-Path $raiz "cortex-extension"
  Copy-Item (Join-Path $origen "*") $fija -Recurse -Force
  $v = (Get-Content (Join-Path $fija "manifest.json") -Raw | ConvertFrom-Json).version
  Write-Host "    ok - carpeta fija actualizada a $v ($fija)"
} else {
  Write-Host "    (sin carpeta fija en ${fija} - se salta)"
}

Set-Location (Join-Path $raiz "frontend-v2")

# NINGUN HOOK DETRAS DE UN RETURN. `vite build` compila igual y la pantalla se
# cae entera en el navegador con el error 310 de React — paso el 16-09-2026 con
# Incorporaciones. Esto para el despliegue antes de subirlo.
Write-Host "==> Comprobando los hooks de React..."
& $nodeExe (Join-Path $PSScriptRoot "check-hooks.mjs")
if ($LASTEXITCODE -ne 0) { throw "hay hooks mal puestos: la pantalla se caeria" }

Write-Host "==> Compilando frontend (produccion)..."
npm run build
if ($LASTEXITCODE -ne 0) { throw "la compilacion ha fallado, no se despliega nada" }

# EL SELLO DE LA COMPILACION. La app lo pide cada pocos minutos y avisa si el
# suyo ya no es el ultimo: sin esto, una pestaña abierta desde hace horas sigue
# enseñando lo de antes SIN fallar, que es peor que un error.
& $nodeExe (Join-Path $PSScriptRoot "sellar-build.mjs")
if ($LASTEXITCODE -ne 0) { throw "no se pudo sellar la compilacion" }

Write-Host "==> Subiendo a Cloudflare Pages, rama main (produccion)..."
npx wrangler pages deploy dist --project-name flotadsp-v2 --branch main --commit-dirty=true
if ($LASTEXITCODE -ne 0) { throw "wrangler ha fallado al desplegar" }

Write-Host ""
Write-Host "==> Comprobando que produccion sirve de verdad esta compilacion..."
# El edge tarda unos segundos en propagar: se le dan 90.
& (Join-Path $PSScriptRoot "verificar-produccion.ps1") -Esperar 90
$verif = $LASTEXITCODE

# Y AHORA LOS CHUNKS, QUE ES LO QUE SE ENVENENA (gotcha 8).
# Lo de arriba comprueba el index.html; el problema esta en los .js y .css,
# que tardan mas en propagarse. Mientras no estan, el catch-all de _redirects
# devuelve la PAGINA HTML con codigo 200 bajo la URL .js, y el navegador se la
# guarda 4 horas. Pedirlos aqui los deja cacheados en el edge antes de que
# llegue nadie, y de paso delata la ventana, que hoy no se ve.
# LAS PANTALLAS, NO SOLO EL FICHERO. Que el bundle se sirva no dice nada de si
# la pantalla tendra datos: el 15-09-2026 el frontend estaba perfecto y la
# pantalla de Incorporaciones salia vacia porque su endpoint daba 500.
Write-Host ""
Write-Host "==> Comprobando que las pantallas devuelven datos..."
$py = "C:\Users\Usuario\AppData\Local\Programs\Python\Python312\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
& $py (Join-Path $PSScriptRoot "humo.py")
if ($LASTEXITCODE -ne 0) {
  Write-Host "AVISO: el frontend esta subido pero alguna pantalla no trae datos." -ForegroundColor Yellow
}

Write-Host ""
& (Join-Path $PSScriptRoot "calentar-edge.ps1")

exit $verif
