# Read .dev.vars and set repository secrets using gh
$lines = Get-Content -Path ".dev.vars" -ErrorAction Stop
$vars = @{}
foreach ($line in $lines) {
  if ($line -match '^\s*([^#\s][^=]+)=(.*)$') {
    $k = $matches[1].Trim()
    $v = $matches[2].Trim()
    $vars[$k] = $v
  }
}
$map = @{ 
  'BOT_GITHUB_TOKEN' = 'GITHUB_TOKEN';
  'GEMINI_API_KEY' = 'GEMINI_API_KEY';
  'GITHUB_WEBHOOK_SECRET' = 'GITHUB_WEBHOOK_SECRET';
  'CLOUDFLARE_API_TOKEN' = 'CLOUDFLARE_API_TOKEN';
  'CLOUDFLARE_ACCOUNT_ID' = 'CLOUDFLARE_ACCOUNT_ID'
}

foreach ($k in $map.Keys) {
  $src = $map[$k]
  if ($vars.ContainsKey($src)) {
    Write-Host "Setting secret $k from $src..."
    gh secret set $k --repo DSamuelHodge/github-cloudflare-agents --body $vars[$src] | Out-Null
    Write-Host "Set secret: $k"
  }
  else {
    Write-Host "Missing source var: $src"
  }
}
