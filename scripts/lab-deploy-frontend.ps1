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
Write-Host "==> Subiendo la compilacion al preview del LAB..."
npx wrangler pages deploy dist-lab --project-name flotadsp-v2 --branch lab --commit-dirty=true
Write-Host "==> Hecho. Abre: https://lab.flotadsp-v2.pages.dev"