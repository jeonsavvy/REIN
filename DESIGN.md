# REIN Design Contract

Status: user-directed brand; implemented and visually verified at desktop and mobile widths

## Design read

REIN is a proof-first autonomous-commerce instrument: the agent can move quickly,
while policy keeps a short rein on spend. The UI should feel like a carefully
typeset operating ledger, not a chatbot or speculative trading screen.

The primary visual move is **typography/content-led composition**. The supporting
move is **one authored anchor**: two parallel reins resolving into an `R` mark.
The mark and a restrained vermilion signal make the product memorable without
competing with settlement-state emerald.

## Page role and hierarchy

The single page must make five things immediately visible: the research goal,
hard budget, current run state, evidence being purchased, and settlement proof.
The primary action is `Run procurement`.

Desktop uses a 12-column operating desk: request panel (3), live ledger (6), and
budget/receipts rail (3). Mobile stacks in decision order: request, status,
ledger, spend, evidence.

## System

- Brand: `REIN/`; line-mark derived from a rein pair and the letter `R`.
- Promise: `Autonomy, held to proof.`
- Type: Korean-capable system sans; tabular/transaction values use monospace.
- Background: warm paper `#F0EDE4`; primary ink `#111A16`.
- Brand signal: vermilion `#BD3F2B`, used only for identity and decisive action.
- Settled: emerald `#08664B`; pending: ochre `#A86A10`; denied/error: brick
  `#B43B2D`.
- Surfaces: flat with precise 1px rules. Radius is reserved for inputs, buttons,
  and status dots rather than every container.
- Spacing: compact operational density on an 8px rhythm with 44px minimum
  controls.
- Motion: CSS-only state transitions; reduced-motion disables nonessential
  animation.

## Rejected defaults

- No purple/cyan AI gradient, glass blur, or generic dashboard bento.
- No dark terminal cosplay; the Ghostty reference means authored tool identity,
  not copied pixels, colors, or chrome.
- No decorative 3D/token art that displaces the policy and receipt proof.

## State contract

Render explicit idle, catalog loading, policy approved/denied, paying, settled,
reconciling, upstream unavailable, insufficient Devnet balance, timeout, and
completed states. Recovery text must name the next safe action and never imply a
demo receipt is on-chain.
