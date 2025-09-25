# 2024-10-08 - Gammaswap Health Trend Insight (#35)

## Summary
Digest runs now snapshot Gammaswap positions and flag health ratio drops that exceed a configurable threshold. Intelligence notes recommend running the Gammaswap sync when a position’s health deteriorates, and the CLI/API emit warnings for quick follow-up.

## Validation
- Prisma client regenerated after adding the `GammaswapPositionSnapshot` model.
- Unit tests enhanced for Gammaswap snapshot payloads and trend detection: `npm run test:run --workspace @wedefidaily/api`.
- Manual CLI check: verified console logs list positions with significant health drops and snapshot counts include Gammaswap entries.

## Follow-Ups
- Consider piping severe health drops into the alert pipeline once external delivery channels are wired.
- Populate staging data with historical Gammaswap snapshots to observe trend accuracy across multiple digests.
