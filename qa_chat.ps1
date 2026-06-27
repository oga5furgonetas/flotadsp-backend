$base="https://flotadsp-backend.fly.dev/api"
$al=Invoke-RestMethod -Uri ($base+"/auth/login") -Method Post -Body (@{username='dani';password='19761976Dani'}|ConvertTo-Json) -ContentType "application/json" -TimeoutSec 30
$H=@{Authorization="Bearer $($al.access_token)"; "Content-Type"="application/json"}

# POST mensaje
$body=@{ text='QA mensaje de prueba bloque 2' } | ConvertTo-Json
$p=Invoke-RestMethod -Uri "$base/chat/OGA5" -Method Post -Headers $H -Body $body -TimeoutSec 20
Write-Host "post ok id=$($p.message.id.Substring(0,8))"

# GET mensajes
$g=Invoke-RestMethod -Uri "$base/chat/OGA5" -Headers $H -TimeoutSec 20
Write-Host "get $($g.messages.Count) msgs"

# To-checklist
$msgId=$p.message.id
$tc=Invoke-RestMethod -Uri "$base/chat/OGA5/$msgId/to-checklist" -Method Post -Headers $H -Body '{}' -ContentType 'application/json' -TimeoutSec 20
Write-Host "to-checklist shift=$($tc.shift) date=$($tc.date)"

# CORS regex (origen preview hash)
try {
  $r=Invoke-WebRequest -Uri "$base/health" -Headers @{Origin='https://abc12345.flotadsp-v2.pages.dev'} -TimeoutSec 10 -UseBasicParsing
  Write-Host "cors regex preview: $($r.Headers['Access-Control-Allow-Origin'])"
} catch { Write-Host "cors test failed: $($_.Exception.Message)" }
