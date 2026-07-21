# REIN 데모 영상

최종 업로드용 파일은 `edit/REIN-demo-final.mp4`다.

- 2분 23.91초, 1920x1080, 30 fps, H.264 + AAC
- 영상에 번인한 한국어 자막과 별도 `edit/captions-ko.srt`
- Qwen3-TTS 0.6B CustomVoice의 공식 한국어 화자 `Sohee`
- 개인 음성 샘플과 음성 복제는 사용하지 않음
- SHA-256: `96ADFE4BFE0D84DB8177BC8C57014DE26F3B65CD8229E4D2D677CF065A0C1753`

실행 버튼부터 보고서 완료, 두 Solana Explorer 거래 확인까지 하나의 Cloud Run
실행을 시간순으로 담았다. 원본 실행 구간은 연속이며, 추가 편집은 앞뒤 REIN 카드,
한국어 내레이션·자막, 음량 및 인코딩 정규화, 현재 UI와 맞춘 예산 도움말 한 줄뿐이다.
상태·금액·영수증·Explorer 화면은 수정하지 않았다. 세부 편집 기록은
`edit/edl.json`과 `edit/edit-decision.md`에 있다.

## 영상에 사용한 실행

- Run: `run_d15ee82b89cc4d179a7f664e513c1f59`
- `market_snapshot`, 0.001 테스트 USDC:
  <https://explorer.solana.com/tx/NoNGYPThfsy8jx43CvHBeVwXx6Cm5T9eLLNuM2JNEKfBSYnZLveQThxeio9Y7Divs9CEpg6TXFyUrjPBAEpQyrd?cluster=devnet>
- `github_health`, 0.002 테스트 USDC:
  <https://explorer.solana.com/tx/4Pw18BGdsvv7zo9WYsMXi3p5cCxhgrv5H3mNpa9hyyPopuAkDx18r48WcFor6CSEnNukbVCdJpgwPDXKrsAk7cbj?cluster=devnet>

두 서명은 Solana Devnet RPC에서 각각 `finalized`, `err: null`로 확인했다.
실행 결과도 `spentAtomic=3000`, `reservedAtomic=0`, 영수증 2건으로 끝났다.

## 음성 출처와 검사

내레이션은 [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)의
`Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`를 CPU에서 실행해 만들었다. 모델,
revision, 화자, 라이선스와 각 WAV의 해시는 `edit/narration-manifest.json`에
고정했다. `faster-whisper-small` 역전사 검사는 문장별 평균 0.972, 최종 믹스
0.961의 정규화 유사도를 기록했다. 이는 발화 식별 가능성을 점검하는 자동 검사일
뿐, 주관적인 음질 평가를 대신하지 않는다.

## 다시 만들기

원본 WebM은 공개 저장소에 넣지 않고 로컬에 보존한다. 추적되는
`source/rein-live-run.json`이 실행 ID, 원본 파일명, trim 지점, 클릭·완료·Explorer
시각을 기록한다.

Qwen3-TTS를 별도 디렉터리에 설치하고 `REIN_QWEN_TTS_ROOT`를 그 경로로
지정한 다음 실행한다. 모델 다운로드와 WAV 캐시는 저장소 밖에 남는다.

```powershell
$env:REIN_QWEN_TTS_ROOT='C:\path\to\qwen3-tts-runtime'
.\scripts\generate-demo-narration.ps1 -Force
.\scripts\build-demo-video.ps1 -Final
```

완성본을 확인한 뒤 YouTube에 공개 또는 미등록으로 올리고 제출 폼에 URL을 넣는다.
