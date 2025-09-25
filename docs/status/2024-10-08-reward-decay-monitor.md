# 2024-10-08 - Reward Decay Monitor (#34)

## Summary
Added digest support for monitoring reward opportunities that are nearing expiry or drifting below a configurable net-value threshold. Each digest records reward snapshots, emits notes for opportunities within the warning window, and logs console warnings when run via the CLI/API route.

## Validation
- Prisma client regenerated after introducing the `RewardOpportunitySnapshot` model.
- Unit tests updated for reward snapshot persistence and intelligence note behaviour: `npm run test:run --workspace @wedefidaily/api`.
- Manual QA: verified CLI output logs pending reward decay notes and new snapshot counts.

## Follow-Ups
- Hook the reward warning metadata into the alerts pipeline once notification channels are ready.
- Populate staging data to exercise live reward decay notes across multiple digest runs.
