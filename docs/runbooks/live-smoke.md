# Live Devnet Smoke Gate

This gate intentionally performs external writes and Devnet transfers. Obtain
the user's approval at execution time and use only the named Cloud Run service,
isolated wallet, and test assets.

## Pass criteria

1. `GET /api/health` returns `mode: live`, `storage: firestore`, and
   `model: gemini-3.5-flash`.
2. `GET /api/catalog` returns two available fresh snapshots.
3. The default run returns two structured Gemini selections without hidden
   reasoning or arbitrary fields.
4. Policy approves exactly `3000` atomic test USDC.
5. Both x402 requests settle once on
   `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` with the fixed Circle mint.
6. Two distinct signatures resolve on Solana Explorer with `cluster=devnet`.
7. Firestore shows one completed run, ordered events, two settled payments, two
   evidence records, and daily quota `settledAtomic` increased by `3000`.
8. Refreshing/reconnecting does not create a third transfer.
9. The final report cites both purchased snapshots.

## Evidence to capture

- Cloud Run URL and ready revision name.
- UTC/KST run timestamp and run ID.
- Both payment IDs, signatures, and Explorer links.
- Buyer/payee/mint/network/atomic amount for each transfer.
- Sanitized test log and screenshots; never include the private key or auth data.
- A read-only balance check before and after.

## Failure stop conditions

- Wrong network, mint, amount, payee, or route: stop immediately; do not sign.
- Signed payload with unknown settlement: leave `reconciling`; inspect Explorer;
  never press Run again to compensate.
- Insufficient SOL/USDC: top up from the two official faucets only.
- Upstream unavailable: wait for a fresh catalog; do not pay for stale/missing data.
- Model/network timeout before signing: safe to start a new run after inspection.
- x402 facilitator does not settle within a focused three-hour debugging budget:
  stop and implement the documented `@solana/kit` direct Devnet SPL-USDC fallback
  as a separate reviewed change. Do not keep retrying the facilitator.
