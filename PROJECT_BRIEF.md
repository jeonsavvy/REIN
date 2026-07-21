# REIN Project Brief

Status: implementation contract, 2026-07-21

## Product

REIN is a solo-hackathon demonstration of agent-initiated commerce. A user
sets a research goal and a hard spending ceiling. Gemini 3.5 Flash compares a
small allowlisted catalog, chooses useful data, and purchases it with test USDC
on Solana Devnet without another human approval step.

## User and job

- User: a researcher or operator who wants a compact evidence brief.
- Job: buy only the evidence that materially improves the answer, within the
  stated limit.
- Costly failure: paying the wrong asset, exceeding budget, double-paying after
  a retry, or showing a payment as settled without an on-chain receipt.

## Acceptance criteria

1. A run starts from one goal and an integer atomic-unit budget.
2. The planner can select only `market_snapshot` and `github_health`.
3. A deterministic gate enforces product, network, asset, per-purchase, per-run,
   and daily limits before the signing boundary.
4. Live mode uses Gemini 3.5 Flash on Vertex AI and x402 on Solana Devnet.
5. Demo mode is visibly labelled and cannot sign or broadcast a transaction.
6. The dashboard shows sanitized decisions, spend, evidence, and receipts.
7. Tests prove policy boundaries, idempotency, hostile input handling, failure
   states, and the primary browser flow.

## Non-goals

No mainnet, real funds, arbitrary sellers, arbitrary URLs, accounts, subscriptions,
multi-agent system, or production commerce claims.
