[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [Parameter(Mandatory = $true)]
  [string]$PayTo,

  [string]$Region = "asia-northeast3",
  [string]$Service = "rein",
  [string]$ServiceAccount = "",
  [string]$FacilitatorUrl = "https://x402.org/facilitator",
  [switch]$Execute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($PayTo -notmatch '^[1-9A-HJ-NP-Za-km-z]{32,44}$') {
  throw "PayTo must be a base58 Solana address."
}
if ([string]::IsNullOrWhiteSpace($ServiceAccount)) {
  $ServiceAccount = "rein-run@$ProjectId.iam.gserviceaccount.com"
}

$envVars = @(
  "REIN_MODE=live",
  "REIN_STORAGE=firestore",
  "REIN_UPSTREAM_MODE=live",
  "GOOGLE_CLOUD_PROJECT=$ProjectId",
  "GOOGLE_CLOUD_LOCATION=global",
  "GOOGLE_GENAI_USE_VERTEXAI=true",
  "SVM_PAY_TO=$PayTo",
  "X402_FACILITATOR_URL=$FacilitatorUrl",
  "FIRESTORE_DATABASE_ID=(default)"
) -join ','

$deployArgs = @(
  "run", "deploy", $Service,
  "--project=$ProjectId",
  "--region=$Region",
  "--source=.",
  "--service-account=$ServiceAccount",
  "--allow-unauthenticated",
  "--ingress=all",
  "--min=0",
  "--min-instances=0",
  "--max=2",
  "--max-instances=2",
  "--cpu=1",
  "--memory=1Gi",
  "--concurrency=20",
  "--timeout=120s",
  "--set-env-vars=$envVars",
  "--set-secrets=SVM_PRIVATE_KEY=rein-svm-private-key:latest,ABUSE_HMAC_KEY=rein-abuse-hmac-key:latest"
)

Write-Host "Risk: this deploy creates a public Cloud Run revision and enables live Devnet signing for REIN."
Write-Host "Rollback: route 100% traffic to the prior revision or delete the new revision."
Write-Host "Preview: gcloud $($deployArgs -join ' ')"
Write-Host "Post-deploy: discover status.url, then pin it as APP_BASE_URL before live signing can proceed."

if (-not $Execute) {
  Write-Host "Preview only. Re-run with -Execute after reviewing IAM, secret, wallet, and billing scope."
  return
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "gcloud is not installed or not available on PATH."
}

& gcloud @deployArgs
if ($LASTEXITCODE -ne 0) {
  throw "gcloud run deploy failed with exit code $LASTEXITCODE"
}

$serviceUrl = & gcloud run services describe $Service `
  "--project=$ProjectId" `
  "--region=$Region" `
  "--format=value(status.url)"
if ($LASTEXITCODE -ne 0) {
  throw "Deployment completed, but post-deploy service verification failed."
}
if ([string]::IsNullOrWhiteSpace($serviceUrl)) {
  throw "Deployment completed, but Cloud Run returned no service URL."
}

# A live signer remains fail-closed until its self-origin is known and pinned.
& gcloud run services update $Service `
  "--project=$ProjectId" `
  "--region=$Region" `
  "--update-env-vars=APP_BASE_URL=$serviceUrl"
if ($LASTEXITCODE -ne 0) {
  throw "Service exists, but APP_BASE_URL pinning failed. Live payments remain blocked."
}

& gcloud run services describe $Service `
  "--project=$ProjectId" `
  "--region=$Region" `
  "--format=value(status.url,status.latestReadyRevisionName)"
