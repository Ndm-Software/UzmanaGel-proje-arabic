param(
  [Parameter(Mandatory = $false)]
  [string]$ServiceAccountPath
)

$ErrorActionPreference = "Stop"

function Set-UserEnvVar {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  [Environment]::SetEnvironmentVariable($Name, $Value, "User")
  Write-Host "Set user env var: $Name"
}

if (-not $ServiceAccountPath) {
  $ServiceAccountPath = Read-Host "Firebase service account JSON path (leave empty for manual input)"
}

if ($ServiceAccountPath) {
  if (-not (Test-Path -Path $ServiceAccountPath)) {
    throw "File not found: $ServiceAccountPath"
  }

  $jsonText = Get-Content -Path $ServiceAccountPath -Raw
  $sa = $jsonText | ConvertFrom-Json

  if (-not $sa.project_id -or -not $sa.client_email -or -not $sa.private_key) {
    throw "JSON is missing one of required fields: project_id, client_email, private_key"
  }

  $privateKeyEscaped = ($sa.private_key -replace "`r`n", "`n" -replace "`n", "\n")

  Set-UserEnvVar -Name "FIREBASE_PROJECT_ID" -Value $sa.project_id
  Set-UserEnvVar -Name "FIREBASE_CLIENT_EMAIL" -Value $sa.client_email
  Set-UserEnvVar -Name "FIREBASE_PRIVATE_KEY" -Value $privateKeyEscaped
} else {
  $projectId = Read-Host "FIREBASE_PROJECT_ID"
  $clientEmail = Read-Host "FIREBASE_CLIENT_EMAIL"
  $privateKey = Read-Host "FIREBASE_PRIVATE_KEY (single-line with \\n)"

  if (-not $projectId -or -not $clientEmail -or -not $privateKey) {
    throw "All values are required for manual input."
  }

  Set-UserEnvVar -Name "FIREBASE_PROJECT_ID" -Value $projectId
  Set-UserEnvVar -Name "FIREBASE_CLIENT_EMAIL" -Value $clientEmail
  Set-UserEnvVar -Name "FIREBASE_PRIVATE_KEY" -Value $privateKey
}

Write-Host ""
Write-Host "Done. Close and reopen terminal before running backend."
Write-Host "Then run: npm run dev"
