$ErrorActionPreference="Continue"
$base="https://flotadsp-backend.fly.dev/api"
$al=Invoke-RestMethod -Uri ($base+"/auth/login") -Method Post -Body (@{username='dani';password='19761976Dani'}|ConvertTo-Json) -ContentType "application/json" -TimeoutSec 30
$H=@{Authorization="Bearer $($al.access_token)"; "Content-Type"="application/json"}

Write-Host "=== 1. Smoke 30 endpoints ==="
$eps=@('/health','/auth/me','/auth/admins','/stats/dashboard','/vehicles','/vehicles/last-inspections','/drivers','/drivers/ranking','/inspections?limit=5','/inspections/review-queue','/ai-dataset/stats','/workshops','/rentals','/alerts/itv','/alerts/renting','/incidents','/scorecard/targets?center=OGA5','/scorecard/standings?center=OGA5','/scorecard/sources?center=OGA5','/shifts/coverage?center=OGA5&desde=2026-06-23&hasta=2026-07-06','/assignments/daily?center=OGA5','/org/centers','/org/billing','/telegram/config','/billing/config','/admin/overview','/admin/orgs','/leads','/metrics/reports','/inbox')
$fail=0; foreach($e in $eps){ try { Invoke-WebRequest -Uri ($base+$e) -Headers $H -TimeoutSec 25 -UseBasicParsing | Out-Null } catch { $fail++ } }
Write-Host "  fallidos: $fail/$($eps.Count)"

Write-Host "=== 2. Buscar inspeccion con DANOS REALES (severity != sin_danos) y NO firmada ==="
$insps=Invoke-RestMethod -Uri ($base+"/inspections?limit=50") -Headers $H -TimeoutSec 30
$best=$null; $bestDmgCount=0
foreach($i in $insps){
  $sev = $i.analysis.severity
  if ($sev -eq $null -or $sev -eq 'sin_danos' -or $sev -eq 'sin_analisis') { continue }
  try {
    $fu = "$base/inspections/$($i.id)/forensic"
    $f=Invoke-RestMethod -Uri $fu -Headers $H -TimeoutSec 10
    if ($f.signed) { continue }
    $dmgs = @($i.analysis.damages) + @($i.analysis.new_damages)
    $count = ($dmgs | Where-Object { $_ -ne $null }).Count
    if ($count -gt $bestDmgCount) { $best=$i; $bestDmgCount=$count }
  } catch { }
}
if (-not $best) { Write-Host "  No hay inspecciones con danos sin firmar."; exit }
Write-Host "  elegida: $($best.id) | severity=$($best.analysis.severity) | danos=$bestDmgCount"

Write-Host "=== 3. Firmar + generar PDF v2 ==="
$body=@{ signature_text="QA visual PDF v2 con cajas" } | ConvertTo-Json
$rNew=Invoke-RestMethod -Uri "$base/inspections/$($best.id)/sign" -Method Post -Headers $H -Body $body -TimeoutSec 25
Write-Host "  hash=$($rNew.hash.Substring(0,16))"
$dest="C:\Users\Usuario\Downloads\PERITAJE_V2_CON_CAJAS.pdf"
$r=Invoke-WebRequest -Uri "$base/inspections/$($best.id)/forensic-pdf" -Headers $H -TimeoutSec 90 -UseBasicParsing -OutFile $dest -PassThru
$sz=[math]::Round((Get-Item $dest).Length/1024,1)
Write-Host "  PDF: $dest ($sz KB) Status=$($r.StatusCode)"

Write-Host "=== 4. Verificador publico ==="
$v=Invoke-RestMethod -Uri "$base/verify/$($rNew.hash)" -TimeoutSec 25
Write-Host "  valid=$($v.valid) plate=$($v.vehicle_plate_masked) by=$($v.signed_by_name)"

Write-Host "=== ABRIENDO PDF ==="
Start-Process $dest
