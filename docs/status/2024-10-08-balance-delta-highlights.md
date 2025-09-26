# 2024-10-08 - Balance Delta Highlights (#32)

## Summary
Implemented the first Phase 4 intelligence heuristic. Digest generation now captures per-wallet balance snapshots and emits "Intelligence Notes" when wallet totals move beyond a configurable percentage threshold.

## Validation
- Ran `npm run prisma:generate --workspace @wedefidaily/api` to refresh Prisma client for the new `WalletBalanceSnapshot` model.
- Unit tests: `npm run test:run --workspace @wedefidaily/api` (covers snapshot payloads, delta calculations, CLI flag behaviour).
- Manual sanity: inspected markdown renderer to confirm the new `## Intelligence Notes` section formats wallet movement notes.

## Follow-Ups
- Populate the database with successive digest runs to observe live balance deltas once Phase 4 jobs begin running regularly.
- Extend alerting once other intelligence heuristics (issues #33–#35) land.
