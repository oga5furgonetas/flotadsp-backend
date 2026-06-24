$ErrorActionPreference="Continue"
$base="https://flotadsp-backend.fly.dev/api"
$al=Invoke-RestMethod -Uri ($base+"/auth/login") -Method Post -Body (@{username='dani';password='19761976Dani'}|ConvertTo-Json) -ContentType "application/json" -TimeoutSec 30
$H=@{Authorization="Bearer $($al.access_token)"; "Content-Type"="application/json"}
Write-Host "health $((Invoke-RestMethod -Uri ($base+'/health') -TimeoutSec 25).status)"
$insps=Invoke-RestMethod -Uri ($base+"/inspections?limit=5") -Headers $H -TimeoutSec 30
$id=$insps[0].id
Write-Host "recheck-fraud sobre $id"
$r=Invoke-RestMethod -Uri "$base/inspections/$id/recheck-fraud" -Method Post -Headers $H -TimeoutSec 90
Write-Host "score=$($r.score)  reasons=$($r.reasons.Count)"
foreach($x in $r.reasons){ Write-Host "  - $($x.type) [$($x.weight)] $($x.detail)" }
# smoke breve
$eps=@('/health','/inspections?limit=5','/billing/config','/inbox','/verify/0000000000000000000000000000000000000000000000000000000000000000')
$fail=0; foreach($e in $eps){ try { Invoke-WebRequest -Uri ($base+$e) -Headers $H -TimeoutSec 25 -UseBasicParsing | Out-Null } catch { if ($_.Exception.Response.StatusCode.value__ -lt 500) {} else { $fail++ } } }
Write-Host "smoke server-errors: $fail"
