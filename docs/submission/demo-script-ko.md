# REIN 최종 데모 대본과 샷 리스트

완성본: `output/video/edit/REIN-demo-final.mp4`

- 길이: 1분 40.47초
- 화면: 1920x1080, 30 fps
- 음성: 로컬 Microsoft Heami 기반 AI 생성 한국어 내레이션
- 자막: 한국어 번인 자막 + `output/video/edit/captions-ko.srt`
- 결제: 한 번의 live run, Circle Devnet test USDC 0.003
- 편집 원칙: 결제 구간 무편집. 첫 로딩 공백만 REIN 카드로 교체

이 마스터는 그대로 제출할 수 있다. 사용자가 직접 마이크로 다시 녹음하는 것은
필수가 아니며, 본인 목소리를 선호할 때만 아래 문장을 같은 시간대에 교체한다.

## 00:00-00:06 — 문제

> AI 에이전트가 결제할 때 중요한 건, 무엇을 왜 샀는지 증명하는 일입니다.

화면: REIN 타이틀 카드에서 live app으로 전환.

## 00:06-00:17 — 주문

> 레인은 목표와 예산만 받는 자율 데이터 구매 에이전트입니다. 지금 0.003
> 테스트 USDC 안에서 솔라나와 이더리움의 시장 및 개발 모멘텀을 비교합니다.

화면: `SOLANA DEVNET · LIVE`, 기본 목표, 3000 atomic 상한, 실행 버튼.

## 00:17-00:31 — 자율 선택

> 제미나이 3.5 플래시가 고정 카탈로그를 평가해 시장 스냅샷과 깃허브 건강도를
> 선택합니다. 모델의 내부 사고는 노출하지 않고 관련성, 가격, 짧은 선택 이유만
> 기록합니다.

화면: 두 상품 선택 event와 가격.

## 00:31-00:49 — 정책 경계

> 서명 권한은 모델이 아니라 결정론적 정책이 보유합니다. 허용된 URL, 솔라나
> 데브넷, 서클 테스트 USDC 민트, 수취 주소, 구매당, 실행당, 일일 상한을 코드로
> 다시 검사합니다.

화면: policy 승인, 고정된 spend rail.

## 00:49-01:04 — x402 결제

> 보호된 에이 피 아이의 응답은 에이치 티 티 피, 사, 공, 이입니다. 에이전트가
> 0.001과 0.002 USDC를 결제하고, 각 결제는 고유 식별자와 솔라나 거래 서명을
> 남깁니다.

화면: 두 `HTTP 402`와 두 `Devnet payment settled`, 영수증 2개.

## 01:04-01:17 — 구매 근거 보고서

> 결제 전 고정한 두 스냅샷만 제미나이에 전달해 시장 신호와 개발 신호를 분리한
> 보고서를 작성하고, 데이터의 한계도 함께 명시합니다.

화면: executive brief, findings, limits of evidence.

## 01:17-01:34 — 공개 영수증

> 마지막으로 솔라나 익스플로러에서 두 거래가 데브넷에서 최종 확정된 것을
> 확인합니다. 모호한 결제는 자동 재시도하지 않고 정산 확인 상태로 남깁니다.

화면: 두 실제 Explorer transaction 화면. 키·계정·개인 정보 없음.

## 01:35-01:40 — 마무리

> 레인. Autonomy, held to proof.

화면: REIN 카드와 `AI-generated narration · public Devnet proof` 고지.

## 녹화 실행 증거

- Run: `run_7e8bcc6762404d8fa7ac7b1afc592201`
- Market Explorer:
  <https://explorer.solana.com/tx/cJW9o6c4X5Wh8YkXDBySbYdBb7y2BLdtrSc7A6qt6JDTQaTabqDDaekyfqCYUSbtAkJD8Sq3MTQUcvviRGxMMHm?cluster=devnet>
- GitHub Explorer:
  <https://explorer.solana.com/tx/2zpggYuHJ7Z5KCbg4iXqeTryhcevA5mqmHx1G57BZ8U73XxgaRQho2bgmg6rXnrzNBJhCBGoEn7QstGrLqXUAeeQ?cluster=devnet>

두 거래는 Solana RPC에서 `finalized`, `err: null`로 재검증했다.
