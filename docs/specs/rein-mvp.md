# REIN MVP Technical Specification

Status: accepted implementation specification

## Public contracts

- `POST /api/runs` accepts `{ goal, maxBudgetAtomic, preset? }`, validates the
  budget as a decimal integer string, and returns `202 { runId }`.
- `GET /api/runs/:id/events` replays sanitized events as SSE, atomically claims
  a queued run, and keeps the request open while orchestration executes.
- `GET /api/runs/:id` returns the current run, events, evidence, and receipts.
- `GET /api/catalog` returns product prices, freshness, and current availability.
- Paid GET product routes require x402 in live mode and an explicit non-chain
  demo token in demo mode.

## Core flow

1. Refresh and persist short-lived upstream snapshots before payment.
2. Give Gemini only the normalized catalog, goal, and budget. Require a bounded
   structured selection and short rationale; never expose chain-of-thought.
3. Re-validate every selection with deterministic policy code.
4. Atomically reserve run and daily quota using integer atomic units.
5. Persist one logical payment identifier, quota day, snapshot hash, and request fingerprint.
6. Call the protected resource through the configured payment gateway.
7. On known failure release the reservation. On ambiguous settlement mark
   `reconciling` and never retry blindly.
8. Persist the receipt before emitting `payment.settled`.
9. Ask Gemini to synthesize only from purchased evidence; deterministic demo
   mode uses the same evidence contract.

## Invariants

- Network: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` only.
- Asset: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` only.
- Prices: market 1,000; GitHub 2,000 atomic USDC; six decimals.
- Limits: purchase 4,000; run 10,000; daily 250,000 atomic USDC.
- Product URLs are constructed internally; the model cannot supply a URL,
  address, mint, network, or price.
- Live settlement is fail-closed unless its HTTPS origin matches `APP_BASE_URL`.
- The signing key is server-only and unavailable to prompts, events, responses,
  logs, and repository files.

## Persistence

- `runs/{runId}`: goal, budget, spent, status, claim, summary, timestamps, error.
- `runs/{runId}/events/{eventId}`: ordered sanitized events.
- `payments/{paymentId}`: run/product/fingerprint/amount/network/asset/status,
  signature and timestamps.
- `snapshots/{snapshotId}`: product, normalized payload, source, expiry.
- `quota/{YYYY-MM-DD}`: reserved and settled atomic amounts.

Memory storage implements the same interface for local development and tests;
Cloud Run live mode uses Firestore transactions.

## Failure semantics

- Validation/policy failures are terminal `denied` runs with no reservation.
- Upstream failure makes only that product unavailable.
- A known failed payment releases reservation and records `failed`.
- Timeout after payment submission records `reconciling`; it is not retried.
- SSE reconnect replays stored events and does not claim a running/completed run.

## Verification

Unit tests cover amount parsing, all policy boundaries, fingerprint idempotency,
hostile planner output, and state transitions. Integration tests use memory
storage and simulated HTTP 402. Playwright covers the default success path and a
budget denial at desktop and mobile sizes. Live smoke evidence requires a fresh
Vertex response and Solana Explorer transaction and is never inferred from demo
mode.
