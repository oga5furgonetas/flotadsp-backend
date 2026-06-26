$ErrorActionPreference="Stop"
$base="https://flotadsp-backend.fly.dev/api"
$al=Invoke-RestMethod -Uri ($base+"/auth/login") -Method Post -Body (@{username='dani';password='19761976Dani'}|ConvertTo-Json) -ContentType "application/json" -TimeoutSec 30
$H=@{Authorization="Bearer $($al.access_token)"; "Content-Type"="application/json"}
try {
  $r=Invoke-WebRequest -Uri "$base/checklist?center=OGA5" -Headers $H -TimeoutSec 25 -UseBasicParsing
  Write-Host $r.Content
} catch {
  $resp=$_.Exception.Response
  if ($resp) {
    $sr=New-Object System.IO.StreamReader($resp.GetResponseStream())
    Write-Host "BODY: $($sr.ReadToEnd())"
  } else { Write-Host $_.Exception.Message }
}
