# REIN 8장 발표 자료 구성

1. **표지** — REIN, 한 줄 설명, Agent-Initiated Commerce.
2. **문제** — AI 구매에서 생기는 선택 근거, 예산, 중복 결제, 정산 증명의 위험.
3. **제품 흐름** — 목표와 상한 → 상품 선택 → 정책 검사 → 결제 2건 → 근거 보고서.
4. **사용 경험** — 새 조달 화면과 실제 결제·데모 상태의 명확한 구분.
5. **구조** — Cloud Run, Vertex/ADK, 정책 엔진, Firestore, x402, Solana Devnet,
   결제 전에 고정한 CoinGecko·GitHub 스냅샷.
6. **안전 장치** — allowlist, atomic `BigInt`, quota 예약, payment fingerprint,
   `reconciling`, Secret Manager.
7. **실제 증거** — 최종 확정된 Devnet 서명 2건, Explorer 영수증, 최신 테스트 수.
8. **확장 가능성** — 유료 리서치 API와 B2B 데이터 조달로 확장할 수 있는 계약,
   현재 MVP의 범위, Cloud Run·GitHub·3분 이하 영상.

현재 자료는 2026-07-21에 검증한 Cloud Run origin과 영상에 표시되는 두 거래를
기본값으로 사용한다. 새로운 증거로 바꿀 때는 승인된 live run을 한 번만 실행하고,
RPC 확정 여부와 PDF 8장의 픽셀 렌더를 다시 확인한다.
