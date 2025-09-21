# Status – Price Watchlist Polish

Last updated: 2024-10-07

## Summary
- PR [#30](https://github.com/cjnemes/WeDefiDaily/pull/30) introduces the token search endpoint and the new watchlist UX (search + manual entry, enriched cards, improved error handling).
- Validation runbook added (`docs/runbooks/watchlist-validation.md`) describing the QA matrix and API smoke tests.

## Outstanding Items
- Capture desktop + mobile screenshots of:
  - Empty state with CTA.
  - Token search results dropdown.
  - Alert list with at least one enabled + one disabled alert.
  - Duplicate-threshold error message.
- Attach screenshots to issue [#26](https://github.com/cjnemes/WeDefiDaily/issues/26) prior to closing.
- Manual QA to be performed on both Chrome desktop and mobile emulation.

## Risks / Questions
- Token search currently queries Prisma via `contains` – performance should be monitored once token table grows (follow-up ticket if necessary).
- Duplicate detection depends on backend unique constraint; consider UI-side dedupe hints in a future iteration.

## Next Steps
1. Complete manual QA following the runbook.
2. Update issue #26 with results + attach evidence.
3. Close issue once QA approved, then proceed with alert delivery adapters (issue #27).
