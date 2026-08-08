# ─────────────────────────────────────────────────────────────
# LAB FlotaDSP — Despliega el FRONTEND solo al laboratorio
# Compila en su propia carpeta (dist-lab) usando el modo "lab"
# de Vite (lee frontend-v2/.env.lab). NO pisa dist/ de produccion.
# Crea la preview lab.flotadsp-v2.pages.dev apuntando al backend LAB.
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\frontend-v2")
Write-Host "==> Compilando frontend modo LAB (apunta al backend LAB)..."
npm ci
npm run build -- --mode lab --outDir dist-lab

# ── CSP: el navegador bloquea el backend del LAB si no esta en connect-src ──
# public/_headers permite solo produccion y staging. Sin este parche, la pagina
# del LAB no puede hablar con su propio backend y el login falla con
# "No se pudo conectar" aunque el backend responda 200 (lo hace: comprobado por
# curl). Se parchea SOLO la copia del LAB; la CSP de produccion no se toca.
$hdr = Join-Path (Get-Location) "dist-lab\_headers"
if (Test-Path $hdr) {
    $txt = [System.IO.File]::ReadAllText($hdr)
    if ($txt -notmatch "flotadsp-backend-lab\.fly\.dev") {
        $txt = $txt -replace "connect-src 'self' ",
                             "connect-src 'self' https://flotadsp-backend-lab.fly.dev "
        # Sin BOM: un BOM al principio rompe la primera regla de _headers
        [System.IO.File]::WriteAllText($hdr, $txt,
            (New-Object System.Text.UTF8Encoding $false))
        Write-Host "==> CSP del LAB parcheada (connect-src incluye el backend LAB)"
    }
} else {
    Write-Warning "No se encontro dist-lab\_headers: la CSP no se ha parcheado"
}

Write-Host "==> Subiendo la compilacion al preview del LAB..."
npx wrangler pages deploy dist-lab --project-name flotadsp-v2 --branch lab --commit-dirty=true
Write-Host "==> Hecho. Abre: https://lab.flotadsp-v2.pages.dev"