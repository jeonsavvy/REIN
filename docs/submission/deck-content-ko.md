# REIN 8장 발표 자료 내용 계약

1. **Title** - REIN, one-liner, Agent-Initiated Commerce.
2. **Problem** - AI purchasing creates justification, budget, duplicate-payment,
   and settlement-proof risks; target user is a research/AI operations team.
3. **Product flow** - goal + cap -> two observable selections -> policy -> two
   payments -> evidence brief.
4. **User experience** - bright procurement desk screenshot and explicit live/demo state.
5. **Architecture** - Cloud Run, Vertex/ADK, policy, Firestore, x402, Solana Devnet,
   frozen CoinGecko/GitHub snapshots.
6. **Safety by construction** - allowlist, atomic `BigInt`, quota reservation,
   payment fingerprint, reconciling, Secret Manager.
7. **Live proof** - two finalized Devnet signatures, Explorer receipts, and fresh
   test/build counts.
8. **Impact and next step** - reusable paid-data procurement pattern, current limits,
   Cloud Run URL, GitHub repo, and captioned video evidence.

The checked-in deck uses the verified 2026-07-21 Cloud Run origin and two
finalized Devnet receipts. Never replace them with local simulated signatures;
future refreshes require a new approved smoke run and full-page render review.
