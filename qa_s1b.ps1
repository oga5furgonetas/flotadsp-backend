$ErrorActionPreference="Continue"
$base="https://flotadsp-backend.fly.dev/api"

$al=Invoke-RestMethod -Uri ($base+"/auth/login") -Method Post -Body (@{username='dani';password='19761976Dani'}|ConvertTo-Json) -ContentType "application/json" -TimeoutSec 30
$H=@{Authorization="Bearer $($al.access_token)"; "Content-Type"="application/json"}

Write-Host "=== 1. Buscar inspeccion no firmada ==="
$insps=Invoke-RestMethod -Uri ($base+"/inspections?limit=10") -Headers $H -TimeoutSec 30
$idNew=$null
foreach($i in $insps){
  try {
    $u = "$base/inspections/$($i.id)/forensic"
    $f=Invoke-RestMethod -Uri $u -Headers $H -TimeoutSec 10
    if (-not $f.signed) { $idNew=$i.id; Write-Host "  NO firmada (FIX OK): $idNew"; break }
  } catch { }
}
if (-not $idNew) { Write-Host "  todas firmadas"; exit }

Write-Host "=== 2. Firmar + generar PDF ==="
$body=@{ signature_text="Confirmo el estado del vehiculo y firmo a la hora actual." } | ConvertTo-Json
$rNew=Invoke-RestMethod -Uri "$base/inspections/$idNew/sign" -Method Post -Headers $H -Body $body -TimeoutSec 25
$newHash=$rNew.hash
Write-Host "  firmada hash=$($newHash.Substring(0,16)).. by=$($rNew.signed_by_name)"

$dest="C:\Users\Usuario\Downloads\PERITAJE_DEMO.pdf"
$r=Invoke-WebRequest -Uri "$base/inspections/$idNew/forensic-pdf" -Headers $H -TimeoutSec 60 -UseBasicParsing -OutFile $dest -PassThru
$sz=[math]::Round((Get-Item $dest).Length/1024,1)
Write-Host "  PDF: $dest ($sz KB) Status=$($r.StatusCode) CT=$($r.Headers['Content-Type'])"

Write-Host "=== 3. Verificador publico SIN AUTH ==="
$v=Invoke-RestMethod -Uri "$base/verify/$newHash" -TimeoutSec 25
Write-Host "  valid=$($v.valid) plate=$($v.vehicle_plate_masked) by=$($v.signed_by_name)"
Write-Host "  prev_hash=$($v.prev_hash.Substring(0,16)).. has_next=$($v.has_next_in_chain)"

Write-Host "=== 4. Smoke 30 endpoints ==="
$eps=@('/health','/auth/me','/auth/admins','/stats/dashboard','/vehicles','/vehicles/last-inspections','/drivers','/drivers/ranking','/inspections?limit=5','/inspections/review-queue','/ai-dataset/stats','/workshops','/rentals','/alerts/itv','/alerts/renting','/incidents','/scorecard/targets?center=OGA5','/scorecard/standings?center=OGA5','/scorecard/sources?center=OGA5','/shifts/coverage?center=OGA5&desde=2026-06-23&hasta=2026-07-06','/assignments/daily?center=OGA5','/org/centers','/org/billing','/telegram/config','/billing/config','/admin/overview','/admin/orgs','/leads','/metrics/reports','/inbox')
$fail=0; foreach($e in $eps){ try { Invoke-WebRequest -Uri ($base+$e) -Headers $H -TimeoutSec 25 -UseBasicParsing | Out-Null } catch { $fail++ } }
Write-Host "  fallidos: $fail/$($eps.Count)"

Start-Process $dest
Write-Host "  PDF abierto en tu visor"
