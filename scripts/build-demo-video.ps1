[CmdletBinding()]
param(
  [switch]$Final
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$editDir = Join-Path $repoRoot "output\video\edit"
$voiceDir = Join-Path $editDir "narration"
$sourceVideo = Join-Path $repoRoot "output\video\source\rein-live-run.webm"
$closingCard = Join-Path $repoRoot "artifacts\deck-render-rein\slide-1.png"
$captions = Join-Path $editDir "captions-ko.srt"
$voiceMix = Join-Path $editDir "voice-mix.wav"
$outputName = if ($Final) { "REIN-demo-final.mp4" } else { "REIN-demo-preview.mp4" }
$output = Join-Path $editDir $outputName

foreach ($required in @($sourceVideo, $closingCard, $captions)) {
  if (-not (Test-Path -LiteralPath $required)) {
    throw "Required input is missing: $required"
  }
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "ffmpeg is required on PATH"
}

New-Item -ItemType Directory -Force -Path $voiceDir | Out-Null
Add-Type -AssemblyName System.Speech

$segments = @(
  @{ Name = "01"; StartMs = 500; Text = "AI 에이전트가 결제할 때 중요한 건, 무엇을 왜 샀는지 증명하는 일입니다." },
  @{ Name = "02"; StartMs = 6500; Text = "레인은 목표와 예산만 받는 자율 데이터 구매 에이전트입니다. 지금 0.003 테스트 USDC 안에서 솔라나와 이더리움의 시장 및 개발 모멘텀을 비교합니다." },
  @{ Name = "03"; StartMs = 17500; Text = "제미나이 3.5 플래시가 고정 카탈로그를 평가해 시장 스냅샷과 깃허브 건강도를 선택합니다. 모델의 내부 사고는 노출하지 않고 관련성, 가격, 짧은 선택 이유만 기록합니다." },
  @{ Name = "04"; StartMs = 31500; Text = "서명 권한은 모델이 아니라 결정론적 정책이 보유합니다. 허용된 URL, 솔라나 데브넷, 서클 테스트 USDC 민트, 수취 주소, 구매당, 실행당, 일일 상한을 코드로 다시 검사합니다." },
  @{ Name = "05"; StartMs = 49000; Text = "보호된 에이 피 아이의 응답은 에이치 티 티 피, 사, 공, 이입니다. 에이전트가 0.001과 0.002 USDC를 결제하고, 각 결제는 고유 식별자와 솔라나 거래 서명을 남깁니다." },
  @{ Name = "06"; StartMs = 64000; Text = "결제 전 고정한 두 스냅샷만 제미나이에 전달해 시장 신호와 개발 신호를 분리한 보고서를 작성하고, 데이터의 한계도 함께 명시합니다." },
  @{ Name = "07"; StartMs = 77500; Text = "마지막으로 솔라나 익스플로러에서 두 거래가 데브넷에서 최종 확정된 것을 확인합니다. 모호한 결제는 자동 재시도하지 않고 정산 확인 상태로 남깁니다." },
  @{ Name = "08"; StartMs = 95200; Text = "레인. Autonomy, held to proof." }
)

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice = $synth.GetInstalledVoices() |
    ForEach-Object { $_.VoiceInfo } |
    Where-Object { $_.Culture.Name -eq "ko-KR" } |
    Select-Object -First 1
  if (-not $voice) { throw "A local ko-KR Windows speech voice is required" }
  $synth.SelectVoice($voice.Name)
  $synth.Rate = 2
  $synth.Volume = 100
  foreach ($segment in $segments) {
    $wave = Join-Path $voiceDir "$($segment.Name).wav"
    $synth.SetOutputToWaveFile($wave)
    $synth.Speak($segment.Text)
    $synth.SetOutputToNull()
  }
}
finally {
  $synth.Dispose()
}

$audioArgs = @("-y", "-hide_banner", "-loglevel", "error")
$audioFilters = @()
for ($index = 0; $index -lt $segments.Count; $index += 1) {
  $segment = $segments[$index]
  $audioArgs += @("-i", (Join-Path $voiceDir "$($segment.Name).wav"))
  $audioFilters += "[$index`:a]adelay=$($segment.StartMs):all=1[a$index]"
}
$mixInputs = (0..($segments.Count - 1) | ForEach-Object { "[a$_]" }) -join ""
$audioFilters += "$mixInputs" + "amix=inputs=$($segments.Count):duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad=pad_dur=101[mix]"
& ffmpeg @audioArgs -filter_complex ($audioFilters -join ";") -map "[mix]" -c:a pcm_s16le $voiceMix
if ($LASTEXITCODE -ne 0) { throw "Narration mix failed" }

Push-Location $repoRoot
try {
  $captionFilter = "subtitles=output/video/edit/captions-ko.srt:force_style='FontName=Noto Sans KR,FontSize=19,PrimaryColour=&H00FFFFFF,BackColour=&H880B1511,BorderStyle=3,Outline=6,Shadow=0,MarginV=30,Alignment=2'"
  $videoFilter = "[0:v]trim=start=4.5,setpts=PTS-STARTPTS,fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[live];" +
    "[1:v]fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p,split=2[cardA][cardB];" +
    "[cardA]trim=duration=4.5,setpts=PTS-STARTPTS[intro];" +
    "[cardB]trim=duration=5.54,setpts=PTS-STARTPTS[outro];" +
    "[intro][live][outro]concat=n=3:v=1:a=0[base];[base]$captionFilter[outv]"
  & ffmpeg -y -hide_banner -loglevel error `
    -i "output/video/source/rein-live-run.webm" `
    -loop 1 -t 10.04 -i "artifacts/deck-render-rein/slide-1.png" `
    -i "output/video/edit/voice-mix.wav" `
    -filter_complex $videoFilter `
    -map "[outv]" -map "2:a:0" -shortest `
    -c:v libx264 -preset medium -crf 18 -profile:v high -level 4.2 `
    -c:a aac -b:a 192k -ar 48000 `
    -metadata title="REIN - Autonomy, held to proof" `
    -metadata comment="AI-generated narration; public Solana Devnet proof" `
    -movflags +faststart $output
  if ($LASTEXITCODE -ne 0) { throw "Video render failed" }
}
finally {
  Pop-Location
}

Write-Output "Rendered: $output"
