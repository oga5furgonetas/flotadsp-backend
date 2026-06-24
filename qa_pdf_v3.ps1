$ErrorActionPreference="Continue"
$base="https://flotadsp-backend.fly.dev/api"
$al=Invoke-RestMethod -Uri ($base+"/auth/login") -Method Post -Body (@{username='dani';password='19761976Dani'}|ConvertTo-Json) -ContentType "application/json" -TimeoutSec 30
$H=@{Authorization="Bearer $($al.access_token)"; "Content-Type"="application/json"}

# Smoke breve
$eps=@('/health','/inspections?limit=5','/billing/config','/inbox')
$fail=0; foreach($e in $eps){ try { Invoke-WebRequest -Uri ($base+$e) -Headers $H -TimeoutSec 25 -UseBasicParsing | Out-Null } catch { $fail++ } }
Write-Host "smoke: $fail/$($eps.Count) fallos"

# Inspeccion con danos reales, no firmada
$insps=Invoke-RestMethod -Uri ($base+"/inspections?limit=50") -Headers $H -TimeoutSec 30
$best=$null; $bestCount=0
foreach($i in $insps){
  $sev=$i.analysis.severity
  if ($sev -eq $null -or $sev -eq 'sin_danos' -or $sev -eq 'sin_analisis') { continue }
  try {
    $f=Invoke-RestMethod -Uri "$base/inspections/$($i.id)/forensic" -Headers $H -TimeoutSec 10
    if ($f.signed) { continue }
    $c=(@($i.analysis.damages)+@($i.analysis.new_damages) | Where-Object { $_ -ne $null }).Count
    if ($c -gt $bestCount) { $best=$i; $bestCount=$c }
  } catch { }
}
if (-not $best) { Write-Host "no hay inspecciones nuevas con danos"; exit }
Write-Host "elegida: $($best.id) sev=$($best.analysis.severity) danos=$bestCount"

$body=@{ signature_text="QA PDF v3 (ensemble YOLO+SAM)" } | ConvertTo-Json
$r=Invoke-RestMethod -Uri "$base/inspections/$($best.id)/sign" -Method Post -Headers $H -Body $body -TimeoutSec 25
Write-Host "firmada hash=$($r.hash.Substring(0,16))"

$dest="C:\Users\Usuario\Downloads\PERITAJE_V3_ENSEMBLE.pdf"
$resp=Invoke-WebRequest -Uri "$base/inspections/$($best.id)/forensic-pdf" -Headers $H -TimeoutSec 120 -UseBasicParsing -OutFile $dest -PassThru
$sz=[math]::Round((Get-Item $dest).Length/1024,1)
Write-Host "PDF: $dest ($sz KB) status=$($resp.StatusCode)"
Start-Process $dest
