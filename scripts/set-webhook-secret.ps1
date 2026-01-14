# Extract GITHUB_WEBHOOK_SECRET from .dev.vars and set as WEBHOOK_SECRET repo secret
$lines = Get-Content -Path ".dev.vars" -ErrorAction Stop
$found = $false
foreach ($line in $lines) {
  if ($line -match '^\s*GITHUB_WEBHOOK_SECRET\s*=\s*(.+)$') {
    $val = $matches[1].Trim()
    gh secret set WEBHOOK_SECRET --repo DSamuelHodge/github-cloudflare-agents --body $val | Out-Null
    Write-Host "Set secret: WEBHOOK_SECRET"
    $found = $true
    break
  }
}
if (-not $found) { Write-Host "GITHUB_WEBHOOK_SECRET not found in .dev.vars" }
