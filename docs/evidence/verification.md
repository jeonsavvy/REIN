# REIN 검증 증거

마지막 갱신: 2026-07-21 KST

이 문서는 성공한 항목만 완료로 기록한다. 비밀 값, 사용자 계정 정보, 원본 지갑 키,
Cloud Build 내부 로그는 저장하지 않는다.

## 코드와 브라우저

요구한 순서대로 새로 실행했다.

1. `pnpm lint` — 통과
2. `pnpm typecheck` — 통과
3. `pnpm test` — 9개 파일, 55개 테스트 통과
4. `pnpm build` — Next.js 16.2.10 production build, 9개 route 통과
5. `pnpm test:e2e` — desktop과 Pixel 7에서 8개 테스트 통과

검증 범위에는 금액 경계, 일일 quota, network·mint·URL allowlist, prompt injection,
payment idempotency, upstream 장애, 불명확한 정산, 402 보호 경로, SSE 재연결,
예산 거부, 데모 영수증과 결과 복원이 포함된다. 데모 영수증은 `온체인 거래 아님`으로
표시되고 Explorer 링크를 만들지 않는다.

최신 desktop과 390px mobile 전체 화면을 실제 픽셀로 확인했다. 겹침, 잘림,
가로 overflow, font fallback, 낮은 대비, 결과가 로그 뒤로 밀리는 문제는 없었다.

## Cloud Run

- GCP 프로젝트: `rein-solana-agent-2026`
- 공개 주소: <https://rein-vvwpcipqca-du.a.run.app>
- 최신 준비 리비전: `rein-00013-dlg`, 트래픽 100%
- health: `ok=true`, `mode=live`, `storage=firestore`, `model=gemini-3.5-flash`
- catalog: 상품 2개
- scaling: `min=0`, `max=2`, concurrency 20, request timeout 120초
- `APP_BASE_URL`: 위 공개 origin으로 고정
- 구매 키: `rein-svm-private-key:latest` Secret Manager 참조만 주입

배포 뒤 `/api/health`, `/api/catalog`, 한국어 첫 화면, 기존 완료 run 복원을 읽기
전용으로 확인했다. 추가 결제 smoke는 하지 않아 테스트 USDC를 더 쓰지 않았다.
문제가 생기면 직전 검증 리비전 `rein-00011-c7p`으로 트래픽을 되돌릴 수 있다.

Cloud Billing 예산은 알림일 뿐 지출 차단 장치가 아니다. 실제 범위는 Cloud Run
max 2, 앱의 일일 atomic quota, Devnet 전용 자산과 심사 뒤 서비스·secret 종료로
제한한다.

## 실제 Solana Devnet / x402 실행

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

두 상태는 2026-07-21에 Solana Devnet RPC로 다시 확인했다. 결제 전 snapshot을
고정하고 결제 뒤 같은 payload를 반환했으며, 모델에는 키·임의 URL·수취 주소 선택
권한이 없었다.

## 발표 자료

- PPTX: `output/presentation/REIN-Hackathon-Deck.pptx`, 389,596 bytes
- PDF: `output/pdf/REIN-Hackathon-Deck.pdf`, 8 pages, 960×540 pt, 943,988 bytes
- PDF SHA-256:
  `7CCE3784CFF2BDB216A8AE5848C78EC6087474A3B93D737C9E9D07DA72D25045`

새 live 화면, 최신 거래 2건, 55개 unit test 수로 자료를 다시 만들었다. PDF 8장을
각각 PNG로 렌더링해 겹침, 잘림, wrapping, 폰트 대체, 대비, 여백, 의도하지 않은
crop을 확인했다.

## 데모 영상과 음성

- 파일: `output/video/edit/REIN-demo-final.mp4`
- 길이: 142.87초(2분 22.87초)
- 규격: 1920x1080, 30 fps, H.264 + 48 kHz AAC mono
- 크기: 8,669,127 bytes
- SHA-256:
  `BE42DC514235728B091387CB1E192996BEA1E4E00A3776FD6C656137DA05CCF0`
- 음량: `mean_volume=-18.4 dB`, `max_volume=-1.5 dB`

내레이션은 공식 [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS)의
`Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice`, 한국어 preset `Sohee`로 만들었다.
개인 음성 샘플과 voice cloning은 사용하지 않았다. 정확한 runtime commit, model
revision, Apache-2.0, 각 WAV 해시는 `narration-manifest.json`에 있다.

`faster-whisper-small` 역전사는 문장별 평균 0.979, 최종 MP4 0.975의 정규화
유사도를 기록했다. 이는 자동 intelligibility 검사이며 주관적인 음질 평가라고
주장하지 않는다.

최종 MP4에서 시작, 실행, 정책, 결제, 완료 결과, Explorer 2개, 마무리 프레임을
다시 뽑아 확인했다. 자막은 화면 밖으로 잘리지 않고 결과의 결론·금액과 Explorer의
`Success`, `Finalized`를 가리지 않는다. 영상 파일 metadata도 Qwen3-TTS와
no voice cloning을 명시한다.

## 주소와 남은 외부 작업

`rein.run.app`은 Google 소유 `run.app` 아래 이름이라 만들 수 없다. 2026-07-21
읽기 전용 확인에서 현재 계정에 검증된 사용자 도메인은 0개였다. 도메인 구매,
DNS 변경, Firebase/Load Balancer 설정은 수행하지 않았다. 소유 도메인을 받으면
`rein.<domain>` 또는 `app.<domain>` 연결 절차는 `docs/runbooks/custom-domain.md`를
따른다.

사용자에게 남은 제출 작업은 다음뿐이다.

- 최종 MP4를 YouTube에 공개 또는 미등록으로 업로드
- PDF를 공개 Drive 링크로 업로드
- 대표자 정보·연락처·소속과 약관을 직접 확인
- Google Form에 링크를 넣고 최종 제출

## 공개 저장소 재현

- 저장소: <https://github.com/jeonsavvy/REIN>, `main`
- 검증한 공개 commit: `9f944c74bf354c49b70a1c3afbb2c744ce6903b0`
- GitHub에서 `--depth 1`로 새 clone한 뒤 `pnpm install --frozen-lockfile` 성공
- 같은 clone에서 `pnpm lint` → `pnpm typecheck` → `pnpm test`(55) →
  `pnpm build`(9 routes) → `pnpm test:e2e`(8) 모두 통과
