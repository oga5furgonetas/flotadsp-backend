$ErrorActionPreference="Continue"
$base="https://flotadsp-backend.fly.dev/api"
$al=Invoke-RestMethod -Uri ($base+"/auth/login") -Method Post -Body (@{username='dani';password='19761976Dani'}|ConvertTo-Json) -ContentType "application/json" -TimeoutSec 30
$H=@{Authorization="Bearer $($al.access_token)"; "Content-Type"="application/json"}
Write-Host "login allowed_centers=$($al.allowed_centers)"

# GET checklist OGA5
$cl=Invoke-RestMethod -Uri "$base/checklist?center=OGA5" -Headers $H -TimeoutSec 25
Write-Host "manana items=$($cl.manana.items.Count) tarde items=$($cl.tarde.items.Count)"

# Toggle un item
$itemId=$cl.manana.items[0].id
$body=@{ center='OGA5'; shift='manana'; item_id=$itemId; done=$true } | ConvertTo-Json
$t=Invoke-RestMethod -Uri "$base/checklist/toggle" -Method Post -Headers $H -Body $body -TimeoutSec 20
Write-Host "toggle ok=$($t.ok)"

# Re-leer
$cl2=Invoke-RestMethod -Uri "$base/checklist?center=OGA5" -Headers $H -TimeoutSec 25
$first=$cl2.manana.items[0]
Write-Host "verificacion: done=$($first.done) by=$($first.done_by)"

# Smoke
$eps=@('/health','/inspections?limit=3','/billing/config','/inbox','/auth/admins')
$fail=0; foreach($e in $eps){ try { Invoke-WebRequest -Uri ($base+$e) -Headers $H -TimeoutSec 20 -UseBasicParsing | Out-Null } catch { $fail++ } }
Write-Host "smoke: $fail fallos"
