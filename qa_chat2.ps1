$base="https://flotadsp-backend.fly.dev/api"
$al=Invoke-RestMethod -Uri ($base+"/auth/login") -Method Post -Body (@{username='dani';password='19761976Dani'}|ConvertTo-Json) -ContentType "application/json" -TimeoutSec 30
$H=@{Authorization="Bearer $($al.access_token)"; "Content-Type"="application/json"}

$body=@{ text='QA2 mensaje' } | ConvertTo-Json
try {
  $r=Invoke-WebRequest -Uri "$base/chat/OGA5" -Method Post -Headers $H -Body $body -TimeoutSec 25 -UseBasicParsing
  Write-Host "OK $($r.StatusCode) | $($r.Content)"
} catch {
  $resp=$_.Exception.Response
  if ($resp) {
    $sr=New-Object System.IO.StreamReader($resp.GetResponseStream())
    Write-Host "STATUS=$($resp.StatusCode.value__) BODY: $($sr.ReadToEnd())"
  }
}
