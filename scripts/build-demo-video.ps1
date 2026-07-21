[CmdletBinding()]
param(
  [switch]$Final,
  [string]$RecordingMetadata = "output\video\source\rein-live-run.json"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$editDir = Join-Path $repoRoot "output\video\edit"
$segmentsPath = Join-Path $editDir "narration-segments.json"
$voiceDir = Join-Path $editDir "narration"
$metadataPath = Join-Path $repoRoot $RecordingMetadata
$closingCard = Join-Path $repoRoot "artifacts\deck-render-rein\slide-1.png"
$captions = Join-Path $editDir "captions-ko.srt"
$voiceMix = Join-Path $editDir "voice-mix.wav"
$outputName = if ($Final) { "REIN-demo-final.mp4" } else { "REIN-demo-preview.mp4" }
$output = Join-Path $editDir $outputName

foreach ($required in @($metadataPath, $closingCard, $segmentsPath)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required input is missing: $required"
  }
}
foreach ($tool in @("ffmpeg", "ffprobe")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool is required on PATH"
  }
}

$metadata = Get-Content -Raw -Encoding UTF8 $metadataPath | ConvertFrom-Json
if ($metadata.failure) { throw "Recording metadata contains a failure: $($metadata.failure)" }
if ($metadata.terminalStatus -ne "completed") { throw "Recording did not complete: $($metadata.terminalStatus)" }
$sourceVideo = Join-Path $repoRoot ([string]$metadata.sourceVideo).Replace("/", "\")
if (-not (Test-Path -LiteralPath $sourceVideo)) {
  throw "Source recording is missing: $sourceVideo"
}
$captionFont = Join-Path $env:WINDIR "Fonts\NotoSansKR-VF.ttf"
if (-not (Test-Path -LiteralPath $captionFont)) {
  throw "Korean caption font is missing: $captionFont"
}

$segments = Get-Content -Raw -Encoding UTF8 $segmentsPath | ConvertFrom-Json
$audioArgs = @("-y", "-hide_banner", "-loglevel", "error")
$audioFilters = @()
$captionBlocks = @()
$latestAudioEnd = 0.0

function Format-SrtTime([double]$seconds) {
  $span = [TimeSpan]::FromSeconds($seconds)
  return "{0:00}:{1:00}:{2:00},{3:000}" -f [math]::Floor($span.TotalHours), $span.Minutes, $span.Seconds, $span.Milliseconds
}

for ($index = 0; $index -lt $segments.Count; $index += 1) {
  $segment = $segments[$index]
  $wave = Join-Path $voiceDir "$($segment.id).wav"
  if (-not (Test-Path -LiteralPath $wave)) {
    throw "Narration is missing: $wave. Run scripts/generate-demo-narration.ps1 first."
  }
  $duration = [double](& ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $wave)
  $startSeconds = [double]$segment.startMs / 1000.0
  $naturalEnd = $startSeconds + $duration + 0.25
  $nextStart = if ($index + 1 -lt $segments.Count) { [double]$segments[$index + 1].startMs / 1000.0 } else { $naturalEnd + 1.5 }
  $endSeconds = [math]::Min($naturalEnd, $nextStart - 0.2)
  $latestAudioEnd = [math]::Max($latestAudioEnd, $naturalEnd)

  $audioArgs += @("-i", $wave)
  $audioFilters += "[$index`:a]adelay=$($segment.startMs):all=1[a$index]"
  $captionText = ([string]$segment.captionText).Replace("`n", "`r`n")
  $captionBlocks += @(
    "$($index + 1)`r`n$(Format-SrtTime $startSeconds) --> $(Format-SrtTime $endSeconds)`r`n$captionText"
  )
}
$captionBlocks -join "`r`n`r`n" | Set-Content -LiteralPath $captions -Encoding utf8NoBOM

$sourceDuration = [double](& ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $sourceVideo)
$trimStart = [double]$metadata.sourceTrimSeconds
$liveDuration = $sourceDuration - $trimStart
if ($liveDuration -le 1) { throw "Source recording is too short after trim." }
$introDuration = 5.0
$outroDuration = [math]::Max(5.0, $latestAudioEnd + 2.0 - $introDuration - $liveDuration)
$finalDuration = $introDuration + $liveDuration + $outroDuration
$firstExplorer = @($metadata.actions | Where-Object { $_.name -eq "explorer-visible" })[0]
$copyOverlayEnd = if ($firstExplorer) {
  $introDuration + ([double]$firstExplorer.elapsedMs / 1000.0) - $trimStart - 0.1
} else {
  $introDuration + $liveDuration
}
$receiptsVisible = @($metadata.actions | Where-Object { $_.name -eq "receipts-visible" })[0]
$reportVisible = @($metadata.actions | Where-Object { $_.name -eq "report-visible" })[0]
$copyOverlayPause = if ($receiptsVisible) {
  # Playwright records the event just after the browser has scrolled the target into view.
  $introDuration + ([double]$receiptsVisible.elapsedMs / 1000.0) - $trimStart - 0.25
} else {
  $copyOverlayEnd
}
$copyOverlayResume = if ($reportVisible) {
  $introDuration + ([double]$reportVisible.elapsedMs / 1000.0) - $trimStart - 0.25
} else {
  $copyOverlayEnd
}

$mixInputs = (0..($segments.Count - 1) | ForEach-Object { "[a$_]" }) -join ""
$audioFilters += "$mixInputs" + "amix=inputs=$($segments.Count):duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad=whole_dur=$finalDuration[mix]"
& ffmpeg @audioArgs -filter_complex ($audioFilters -join ";") -map "[mix]" -t $finalDuration -c:a pcm_s16le $voiceMix
if ($LASTEXITCODE -ne 0) { throw "Narration mix failed" }

Push-Location $repoRoot
try {
  $captionFilter = "subtitles=output/video/edit/captions-ko.srt:force_style='FontName=Noto Sans KR,FontSize=16,PrimaryColour=&H00FFFFFF,BackColour=&H900B1511,BorderStyle=3,Outline=5,Shadow=0,MarginV=32,Alignment=2'"
  $fontForFfmpeg = $captionFont.Replace("\", "/").Replace(":", "\:")
  $copyOverlayFilter = "drawbox=x=250:y=458:w=500:h=28:color=0xF3F0E7:t=fill:enable='between(t,$introDuration,$copyOverlayPause)'," +
    "drawtext=fontfile='$fontForFfmpeg':text='Circle Devnet 테스트 USDC만 사용합니다. Mainnet 자산은 쓰지 않습니다.':fontcolor=0x59665F:fontsize=13:x=256:y=465:enable='between(t,$introDuration,$copyOverlayPause)'," +
    "drawbox=x=250:y=572:w=500:h=30:color=0xF3F0E7:t=fill:enable='between(t,$copyOverlayResume,$copyOverlayEnd)'," +
    "drawtext=fontfile='$fontForFfmpeg':text='Circle Devnet 테스트 USDC만 사용합니다. Mainnet 자산은 쓰지 않습니다.':fontcolor=0x59665F:fontsize=13:x=256:y=579:enable='between(t,$copyOverlayResume,$copyOverlayEnd)'"
  $sourceRelative = ([System.IO.Path]::GetRelativePath($repoRoot, $sourceVideo)).Replace("\", "/")
  $videoFilter = "[0:v]trim=start=$trimStart,setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[live];" +
    "[1:v]fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p,split=2[cardA][cardB];" +
    "[cardA]trim=duration=$introDuration,setpts=PTS-STARTPTS[intro];" +
    "[cardB]trim=duration=$outroDuration,setpts=PTS-STARTPTS[outro];" +
    "[intro][live][outro]concat=n=3:v=1:a=0[base];" +
    "[base]$copyOverlayFilter[copyfixed];[copyfixed]$captionFilter[outv]"
  & ffmpeg -y -hide_banner -loglevel error `
    -i $sourceRelative `
    -loop 1 -t ($introDuration + $outroDuration) -i "artifacts/deck-render-rein/slide-1.png" `
    -i "output/video/edit/voice-mix.wav" `
    -filter_complex $videoFilter `
    -map "[outv]" -map "2:a:0" -t $finalDuration `
    -c:v libx264 -preset medium -crf 18 -profile:v high -level 4.2 `
    -c:a aac -b:a 192k -ar 48000 `
    -metadata title="REIN - 사람은 한도를 정하고, 에이전트는 결제를 끝냅니다" `
    -metadata comment="Policy-gated data purchases with public Solana Devnet receipts" `
    -movflags +faststart $output
  if ($LASTEXITCODE -ne 0) { throw "Video render failed" }
}
finally {
  Pop-Location
}

Write-Output ("Rendered: {0}" -f $output)
Write-Output ("Duration: {0:N2}s" -f $finalDuration)
