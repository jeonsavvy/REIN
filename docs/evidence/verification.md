# REIN 검증 증거

마지막 갱신: 2026-07-22 KST

이 문서는 성공한 항목만 완료로 기록한다. 비밀 값, 원본 지갑 키, Cloud Build 내부
로그는 저장하지 않는다.

## 코드와 브라우저

요구한 순서대로 새로 실행했다.

1. `pnpm lint` — 통과
2. `pnpm typecheck` — 통과
3. `pnpm test` — 9개 파일, 55개 테스트 통과
4. `pnpm build` — Next.js 16.2.10 production build, 9개 route 통과
5. `pnpm test:e2e` — desktop과 Pixel 7에서 8개 테스트 통과

검증 범위에는 금액 경계, 일일 quota, network·mint·URL allowlist, prompt injection,
payment idempotency, 원본 API 장애, 불명확한 정산, 402 보호 경로, SSE 재연결,
예산 거부, 데모 영수증과 결과 복원이 포함된다. 데모 영수증은 `온체인 거래 아님`으로
표시되고 Explorer 링크를 만들지 않는다.

최신 desktop과 390px mobile 전체 화면을 픽셀로 확인했다. 겹침, 잘림,
가로 overflow, font fallback, 낮은 대비, 결과가 로그 뒤로 밀리는 문제는 없었다.

## Cloud Run

- GCP 프로젝트: `rein-solana-agent-2026`
- 공개 주소: <https://rein-vvwpcipqca-du.a.run.app>
- 최신 준비 리비전: `rein-00021-rft`, 트래픽 100%
- health: `ok=true`, `mode=live`, `storage=firestore`, `model=gemini-3.5-flash`
- catalog: 상품 2개
- scaling: `min=0`, `max=2`, concurrency 20, request timeout 120초
- `APP_BASE_URL`: 위 공개 origin으로 고정
- 구매 키: `rein-svm-private-key:latest` Secret Manager 참조만 주입

배포 뒤 `/api/health`, `/api/catalog`, 한국어 첫 화면, 기존 완료 run 복원을 읽기
전용으로 확인했다. 추가 결제 smoke는 하지 않아 테스트 USDC를 더 쓰지 않았다.
문제가 생기면 직전 검증 리비전 `rein-00019-w7h`으로 트래픽을 되돌릴 수 있다.

Cloud Billing 예산은 알림일 뿐 지출 차단 장치가 아니다. 지출 범위는 Cloud Run
max 2, 앱의 일일 atomic quota와 Devnet 전용 자산으로 제한한다.

## Solana Devnet / x402 실행

- Run: `run_d15ee82b89cc4d179a7f664e513c1f59`
- 결과: `completed`, `spentAtomic=3000`, `reservedAtomic=0`, 결제 2건
- 보고서: `Gemini 3.5 Flash`, finding 3개와 caveat 3개
- 네트워크: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`
- 자산: Circle Devnet USDC
  `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

시장 데이터 1,000 atomic, slot `477856360`, `finalized`, `err: null`:

<https://explorer.solana.com/tx/NoNGYPThfsy8jx43CvHBeVwXx6Cm5T9eLLNuM2JNEKfBSYnZLveQThxeio9Y7Divs9CEpg6TXFyUrjPBAEpQyrd?cluster=devnet>

개발 데이터 2,000 atomic, slot `477856367`, `finalized`, `err: null`:

<https://explorer.solana.com/tx/4Pw18BGdsvv7zo9WYsMXi3p5cCxhgrv5H3mNpa9hyyPopuAkDx18r48WcFor6CSEnNukbVCdJpgwPDXKrsAk7cbj?cluster=devnet>

두 상태는 2026-07-22에 Solana Devnet RPC로 다시 확인했다. 결제 전 snapshot을
고정하고 결제 뒤 같은 payload를 반환했으며, 모델에는 키·임의 URL·수취 주소 선택
권한이 없었다.

## 발표 자료

- PPTX: `output/presentation/REIN-Hackathon-Deck.pptx`, 695,559 bytes
- PDF: `output/pdf/REIN-Hackathon-Deck.pdf`, 8 pages, 960×540 pt, 982,508 bytes
- PDF SHA-256:
  `ACCF57A63AF37BD024C8DB901DE6C4E64EFDED2829B15E51CEDC448EC6170489`

새 live 화면, 최신 거래 2건, 55개 unit test 수로 자료를 다시 만들었다. PDF 8장을
각각 PNG로 렌더링해 겹침, 잘림, wrapping, 폰트 대체, 대비, 여백, 의도하지 않은
crop을 확인했다. PPTX의 8장·237개 shape도 수치상 슬라이드 경계를 벗어나지 않았다.

## 데모 영상과 음성

- 파일: `output/video/edit/REIN-demo-final.mp4`
- 길이: 143.91초(2분 23.91초)
- 규격: 1920x1080, 30 fps, H.264 + 48 kHz AAC mono
- 크기: 8,478,423 bytes
- SHA-256:
  `6D0AFDF150C76B52C8E43065F827D60651BBEE5A73E91A6E908486C09F50D70E`
- 음량: `mean_volume=-18.9 dB`, `max_volume=-1.5 dB`

내레이션은 공식 [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)의
`Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`, 한국어 preset `Sohee`로 만들었다.
정확한 runtime commit, model revision, Apache-2.0, 각 WAV 해시는
`narration-manifest.json`에 있다.

`faster-whisper-small` 역전사는 문장별 평균 0.961, 최종 MP4 0.970의 정규화
유사도를 기록했다. 이는 자동 intelligibility 검사이며 주관적인 음질 평가라고
주장하지 않는다.

최종 MP4에서 시작, 실행, 정책, 결제, 완료 결과, Explorer 2개, 마무리 프레임을
다시 뽑아 확인했다. 자막은 화면 밖으로 잘리지 않고 결과의 결론·금액과 Explorer의
`Success`, `Finalized`를 가리지 않는다. 예산 도움말은 원본에서 그 문장이 보이는
두 구간에만 현재 문구로 교체했고, 영수증 스크롤 구간에는 오버레이가 없다.

검토 이미지는 `artifacts/qa/rein-demo-contact-sheet.png`와 16초·58초·137초의
개별 프레임으로 남겼다.

## 공개 저장소 재현

- 저장소: <https://github.com/jeonsavvy/REIN>, `main`
- 배포 및 새 clone 검증 commit: `b7d9989af59a84a9cabc0441b16c24838761b390`
- GitHub에서 `--depth 1`로 새 clone한 뒤 `pnpm install --frozen-lockfile` 성공
- 같은 clone에서 `pnpm lint` → `pnpm typecheck` → `pnpm test`(55) →
  `pnpm build`(9 routes) → `pnpm test:e2e`(8) 모두 통과
