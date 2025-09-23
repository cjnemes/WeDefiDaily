# Plan: Phase 4 – Intelligence Experiments (Issue #20)

## Vision
Explore lightweight intelligence features that add real operator value without bloating the stack:
- Surface notable changes (balance swings, governance deadlines, reward decay) as plain-English notes.
- Offer optional heuristics/alerts driven by existing data (no external AI services required yet).

## Candidate Experiments
1. **Balance delta highlights** – Compare latest sync to previous snapshot; flag wallets with >X% change.
2. **Governance reminders** – Detect locks expiring within N days and include in digest/alerts.
3. **Reward decay monitor** – Highlight upcoming reward deadlines + gas-to-claim ratios.
4. **Gammaswap health trend** – Track positions whose health has dropped >0.1 since last run.

## Data Requirements
- Historical snapshots (balances, governance locks, alerts) sampled per sync run.
- Extend existing jobs to store previous values where needed (e.g., `BalanceSnapshot`, `GovernanceLockSnapshot`).

## MVP Deliverable
- Extend the daily digest to include an **Intelligence Notes** section listing top 3 findings based on simple heuristics.
- No new UI endpoints required initially; focus on digest + console logs.

## Stretch Goals
- Optional `npm run insights` CLI generating a focused report.
- Hook insights into alert pipeline (e.g., “Wallet A dropped 30% since last sync”).

## Next Steps
1. Define additional snapshot tables (if needed).
2. Implement heuristics inside `services/digest.ts` (returning array of notes).
3. Update digest renderer + runbooks.
4. Gather feedback before scaling to heavier ML/AI work.

_Note: revisit this plan once Phase 3 merges land and we have real digest data in production._
