# REIN 8장 발표 자료 구성

1. **표지** — REIN, 한 줄 설명, Solana Agentic Commerce 단일 트랙과
   Autonomous On-chain Settlement 성격.
2. **문제** — 선택 근거 부족, 예산 이탈, 중복 결제, 불명확한 정산.
3. **제품 흐름** — 목표와 상한 → 상품 선택 → 정책 검사 → 결제 2건 → 근거 보고서.
4. **사용 경험** — 목표, 예산, 선택 이유, Devnet 결제와 demo 상태의 구분.
5. **구조** — Cloud Run, Vertex/ADK, 정책 엔진, Firestore, Secret Manager의
   REIN 서버 지갑, x402, Solana Devnet, 결제 전에 고정한 CoinGecko·GitHub 스냅샷.
6. **결제 제한** — allowlist, atomic `BigInt`, quota 예약, payment fingerprint,
   `reconciling`, Secret Manager.
7. **Devnet 증거** — 확정된 서명 2건, Explorer 영수증, 최신 테스트 수.
8. **적용 범위** — 공식 단일 트랙 안에서 가장 가까운 시작점은 B,
   유료 리서치 API와 B2B 데이터 조달로 확장할 수 있는 계약, 현재 MVP의 범위,
   Cloud Run·GitHub·3분 이하 영상.

현재 자료는 2026-07-22에 검증한 Cloud Run origin과 2026-07-21에 생성된 영상 속
두 거래를 기본값으로 사용한다. 새로운 증거로 바꿀 때는 승인된 Cloud Run 실행을 한 번만 만들고,
RPC 확정 여부와 PDF 8장의 픽셀 렌더를 다시 확인한다.
