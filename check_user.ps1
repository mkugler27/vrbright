$headers = @{
  'Authorization' = 'Bearer 7d103d39987d660a1a0c098f8878f3ed'
  'Content-Type' = 'application/json'
}
$uri = 'https://system.vrbrightpainting.com/version-test/api/1.1/obj/user'
try {
  $r = Invoke-RestMethod -Uri $uri -Method Get -Headers $headers
  $r.response.results | ForEach-Object {
    $auth = $_.authentication
    $emailVal = $null
    if ($auth -and $auth.email -and $auth.email.email) {
      $emailVal = $auth.email.email
    }
    [PSCustomObject]@{
      email = $emailVal
      tipo_user = $_.tipo_user
      Nome = $_.Nome
    }
  } | Format-Table -AutoSize
} catch {
  "Error: " + $_.Exception.Message
}
