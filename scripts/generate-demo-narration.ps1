[CmdletBinding()]
param(
  [string]$RuntimeRoot = $(
    if ($env:REIN_QWEN_TTS_ROOT) {
      $env:REIN_QWEN_TTS_ROOT
    } else {
      Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) "qwen3-tts-runtime"
    }
  ),
  [ValidateSet("Sohee")]
  [string]$Speaker = "Sohee",
  [ValidateRange(1, 4)]
  [int]$BatchSize = 2,
  [string[]]$SegmentId = @(),
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeRoot = (Resolve-Path -LiteralPath $RuntimeRoot).Path
$python = Join-Path $runtimeRoot ".venv\Scripts\python.exe"
$license = Join-Path $runtimeRoot "LICENSE"
$generator = Join-Path $PSScriptRoot "generate_demo_narration.py"
$segmentsPath = Join-Path $repoRoot "output\video\edit\narration-segments.json"
$manifestPath = Join-Path $repoRoot "output\video\edit\narration-manifest.json"

foreach ($required in @($python, $license, $generator, $segmentsPath)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required input is missing: $required"
  }
}
if (-not (Select-String -LiteralPath $license -Pattern "Apache License" -Quiet)) {
  throw "The isolated Qwen3-TTS runtime does not expose the expected Apache license."
}

$remote = (& git -C $runtimeRoot remote get-url origin).Trim()
if ($remote -notmatch '^https://github\.com/QwenLM/Qwen3-TTS(?:\.git)?$') {
  throw "Refusing an unexpected TTS runtime origin: $remote"
}

$runtimeCommit = (& git -C $runtimeRoot rev-parse HEAD).Trim()
$env:HF_HOME = Join-Path $runtimeRoot "hf-cache"
$arguments = @(
  $generator,
  "--repo-root", $repoRoot,
  "--speaker", $Speaker,
  "--batch-size", $BatchSize,
  "--runtime-commit", $runtimeCommit
)
if ($Force) { $arguments += "--force" }
foreach ($id in $SegmentId) {
  $arguments += @("--segment-id", $id)
}

& $python @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Qwen3-TTS narration generation failed."
}
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "Narration manifest was not produced: $manifestPath"
}

Write-Output "Generated Qwen3-TTS narration with the native Korean $Speaker preset."
Write-Output "Manifest: $manifestPath"
