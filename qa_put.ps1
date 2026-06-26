$base="https://flotadsp-backend.fly.dev/api"
$al=Invoke-RestMethod -Uri ($base+"/auth/login") -Method Post -Body (@{username='dani';password='19761976Dani'}|ConvertTo-Json) -ContentType "application/json" -TimeoutSec 30
$H=@{Authorization="Bearer $($al.access_token)"; "Content-Type"="application/json"}
$body=@{
  center='OGA5'; date='2026-06-26'; shift='manana';
  items=@(
    @{id='aaa1'; text='cerar app antonio'; done=$false}
    @{id='aaa2'; text='cerrar cuentas'; done=$false}
    @{id='aaa3'; text='cagar'; done=$false}
  )
} | ConvertTo-Json -Depth 5
try {
  $r=Invoke-WebRequest -Uri "$base/checklist" -Method Put -Headers $H -Body $body -TimeoutSec 25 -UseBasicParsing
  Write-Host "OK $($r.StatusCode) | $($r.Content)"
} catch {
  $resp=$_.Exception.Response
  if ($resp) {
    $sr=New-Object System.IO.StreamReader($resp.GetResponseStream())
    Write-Host "STATUS=$($resp.StatusCode.value__) BODY: $($sr.ReadToEnd())"
  } else { Write-Host $_.Exception.Message }
}
