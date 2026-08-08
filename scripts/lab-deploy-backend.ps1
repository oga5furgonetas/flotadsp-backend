# ─────────────────────────────────────────────────────────────
# LAB FlotaDSP — Despliega el BACKEND solo al laboratorio
# Este script NUNCA toca producción (flotadsp-backend).
# ─────────────────────────────────────────────────────────────
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..\backend")
Write-Host "==> Desplegando backend al LAB (flotadsp-backend-lab)..."
Write-Host "==> Produccion (flotadsp-backend) NO se toca."
fly deploy -c fly.lab.toml --strategy immediate
Write-Host "==> Hecho. Comprueba: https://flotadsp-backend-lab.fly.dev/api/health"