# REIN

> **필요한 데이터만 사고, 모든 결제를 증명하는 AI 리서처.**

REIN은 조사 목표와 최대 예산을 받으면 Gemini가 필요한 데이터 상품을 고르고,
코드로 된 정책이 구매를 다시 검사한 뒤 Solana Devnet에서 테스트 USDC를
결제하는 해커톤 프로젝트입니다. 결과 화면에는 보고서뿐 아니라 무엇을 왜
샀는지, 얼마를 썼는지, 결제가 어디에 기록됐는지까지 함께 남습니다.

- **라이브 앱:** <https://rein-vvwpcipqca-du.a.run.app>
- **GitHub:** <https://github.com/jeonsavvy/REIN>
- **사용 자산:** 가치가 없는 Circle Devnet 테스트 USDC만 사용

![REIN 완료 화면](artifacts/qa/desktop-completed.png)

## 한 번에 보는 데모

기본 요청은 다음과 같습니다.

> 0.003 USDC 이하로 SOL과 ETH의 개발·시장 모멘텀을 비교해줘.

REIN은 이 요청을 네 단계로 처리합니다.

1. **데이터 선택** — Gemini 3.5 Flash가 고정된 두 상품의 관련성과 가격을 비교합니다.
2. **정책 검사** — 모델 밖의 코드가 예산, URL, 네트워크, mint, 수취 주소를 확인합니다.
3. **결제와 수령** — x402로 0.001 + 0.002 테스트 USDC를 결제하고 미리 고정한 스냅샷을 받습니다.
4. **보고서 작성** — 구매 근거, 데이터의 한계, Solana Explorer 영수증을 한 화면에 묶습니다.

사용자는 실행 중간에 다시 승인하지 않습니다. 대신 모델이 결제 키를 보거나
임의의 판매자·가격·자산을 선택할 수 없도록 자율성의 범위를 코드로 제한했습니다.

## 왜 만들었나

에이전트가 실제로 돈을 쓰기 시작하면 “답이 그럴듯한가”만으로는 부족합니다.
잘못된 자산으로 결제하거나, 재시도 중 두 번 결제하거나, 근거를 받지 못했는데
완료로 표시하는 실패가 더 비쌉니다. REIN은 **구매 결정 → 정책 승인 → 정산 →
근거**를 하나의 감사 가능한 흐름으로 만드는 데 집중합니다.

이 구조는 해커톤의 **Agent-Initiated Commerce** 주제에 직접 대응합니다.

## 구매 가능한 데이터

| 상품 | 가격 | 결제 전에 고정하는 원본 |
| --- | ---: | --- |
| `market_snapshot` | 1,000 atomic = 0.001 테스트 USDC | CoinGecko Public API |
| `github_health` | 2,000 atomic = 0.002 테스트 USDC | GitHub Public API |

무료 catalog 단계에서 원본을 먼저 읽고 `snapshotId`로 고정합니다. 결제 후에는
그 스냅샷을 그대로 반환하므로 “결제는 됐지만 upstream이 실패한” 상태를 만들지
않습니다.

## 구조

```mermaid
flowchart LR
  U["조사 목표 + 최대 예산"] --> A["Next.js Run API"]
  A --> C["고정 카탈로그와 스냅샷"]
  C --> CG["CoinGecko"]
  C --> GH["GitHub"]
  A --> G["Gemini 3.5 Flash / Google ADK"]
  G --> P["결정론적 정책 엔진"]
  P -->|승인| Q["Firestore 예산 예약"]
  Q --> X["x402 buyer + 보호된 seller route"]
  X --> S["Solana Devnet USDC"]
  S --> R["고정 근거 + 온체인 영수증"]
  R --> G
  G --> D["보고서 + SSE 진행 상태"]
  P -->|거부| D
```

UI, 에이전트 API, x402 보호 API를 하나의 Next.js 서비스로 구성하고 Cloud Run에
배포합니다. 실행·이벤트·결제·일일 한도는 Firestore에 저장합니다.

## 안전 경계

- 허용 네트워크: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`만 사용
- 허용 자산: Circle Devnet USDC
  `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`만 사용
- 구매당 / 실행당 / 일일 상한: `4000` / `10000` / `250000` atomic USDC
- 모든 금액은 API 내부에서 6자리 atomic 문자열과 `BigInt`로 처리
- 결제 키는 Secret Manager와 서버의 정책 경계 안에서만 사용
- 결제 결과가 불명확하면 자동 재결제하지 않고 `reconciling`으로 중지
- demo 모드는 항상 표시되며 서명·브로드캐스트를 하지 않음
- Firestore 브라우저 접근은 거부하고 Cloud Run 서비스 계정만 Admin SDK 사용

메인넷, 실제 금전, 로그인, 임의 URL 구매, 구독, 멀티에이전트는 MVP 범위 밖입니다.
전체 실패 상태와 불변식은 [`docs/specs/rein-mvp.md`](docs/specs/rein-mvp.md)에 있습니다.

## 로컬에서 실행하기

필요 환경은 Node.js 24+, Corepack, pnpm 11입니다.

```powershell
corepack enable
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

`http://localhost:3000`을 엽니다. 기본 설정은 fixture 데이터와 메모리 저장소를
쓰는 **안전한 demo 모드**이며 결제에 서명하거나 트랜잭션을 전송할 수 없습니다.
현재 공개 API 데이터만 사용하고 결제는 계속 모의 실행하려면
`PROOFBUY_UPSTREAM_MODE=live`를 설정합니다.

## API

| Method | Path | 응답 |
| --- | --- | --- |
| `POST` | `/api/runs` | `{goal,maxBudgetAtomic,preset?}` → `202 {runId}` |
| `GET` | `/api/runs/:id/events` | 정제되고 재연결 가능한 SSE 이벤트 |
| `GET` | `/api/runs/:id` | 실행 결과, 근거, 결제, 영수증 |
| `GET` | `/api/catalog` | 가격, 가용성, 스냅샷 시각 |
| `GET` | `/api/products/market-snapshot` | x402로 보호된 고정 스냅샷 |
| `GET` | `/api/products/github-health` | x402로 보호된 고정 스냅샷 |
| `GET` | `/api/health` | 비밀 값이 없는 실행 모드·저장소·모델 상태 |

## 검증하기

아래 순서가 완료 기준입니다.

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

테스트에는 금액과 quota 경계, 잘못된 network/mint/route, prompt injection,
payment idempotency, upstream 장애, 불명확한 정산, x402 보호 경로, SSE 재연결과
데스크톱·모바일 핵심 흐름이 포함됩니다.

## 실제 Devnet 증거

영상에 사용한 실행 `run_d15ee82b89cc4d179a7f664e513c1f59`은 총 3,000 atomic 테스트
USDC를 사용했습니다. 두 서명 모두 Solana RPC에서 `finalized`, `err: null`로
확인했습니다.

- 시장 데이터 1,000 atomic — [Explorer에서 보기](https://explorer.solana.com/tx/NoNGYPThfsy8jx43CvHBeVwXx6Cm5T9eLLNuM2JNEKfBSYnZLveQThxeio9Y7Divs9CEpg6TXFyUrjPBAEpQyrd?cluster=devnet)
- 개발 데이터 2,000 atomic — [Explorer에서 보기](https://explorer.solana.com/tx/4Pw18BGdsvv7zo9WYsMXi3p5cCxhgrv5H3mNpa9hyyPopuAkDx18r48WcFor6CSEnNukbVCdJpgwPDXKrsAk7cbj?cluster=devnet)

두 자산은 가치가 없는 Devnet 테스트 토큰입니다. x402 facilitator가 수수료를
대납하므로 구매 지갑에 mainnet 자산을 넣을 필요가 없습니다.

## 배포와 주소

Cloud Run live 배포는 Firestore 기록, Vertex 호출, 공개 리비전, 테스트 USDC
전송을 만듭니다. 먼저 [`docs/runbooks/live-deployment.md`](docs/runbooks/live-deployment.md)의
위험·rollback 절차를 읽고 preview를 확인합니다.

```powershell
# 변경 없는 preview
.\scripts\deploy-cloud-run.ps1 `
  -ProjectId YOUR_PROJECT_ID `
  -PayTo YOUR_DEVNET_RECEIVER

# 검토 후 실제 배포
.\scripts\deploy-cloud-run.ps1 `
  -ProjectId YOUR_PROJECT_ID `
  -PayTo YOUR_DEVNET_RECEIVER `
  -Execute
```

`rein.run.app`은 Google이 소유한 `run.app` 아래 이름이라 사용자가 직접 선택할 수
없습니다. 도메인을 보유하면 `app.example.com` 같은 짧은 주소를 연결할 수 있습니다.
현재 리전에서의 안전한 선택과 필요한 DNS 작업은
[`docs/runbooks/custom-domain.md`](docs/runbooks/custom-domain.md)에 정리했습니다.

## 제출 자료

- 발표 자료 원본과 PDF: `output/presentation/`, `output/pdf/`
- 3분 이내 데모 영상과 재현 정보: `output/video/`
- 한국어 데모 대본: `docs/submission/demo-script-ko.md`
- Google Form 답안 초안: `docs/submission/form-draft-ko.md`
- 검증 증거: `docs/evidence/verification.md`

최종 Google Form 제출과 약관 동의, 개인 정보 입력, YouTube/Drive 업로드는 사용자가
직접 수행합니다.

## 공식 문서

- [Google Cloud × Solana AI Agentic Hackathon](https://www.gcp-solana-ai-agentic-hacks-kr.xyz/)
- [Gemini 3.5 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash)
- [x402 buyer](https://docs.x402.org/getting-started/quickstart-for-buyers), [seller](https://docs.x402.org/getting-started/quickstart-for-sellers), [payment identifier](https://docs.x402.org/extensions/payment-identifier)
- [Solana Faucet](https://faucet.solana.com/), [Circle Faucet](https://faucet.circle.com/?allow=true)
