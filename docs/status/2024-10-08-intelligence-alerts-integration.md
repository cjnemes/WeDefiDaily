# 2024-10-08 - Intelligence Alerts Integration (#36)

## Summary
Hooked Phase 4 intelligence heuristics (balance delta, governance unlock, reward decay, Gammaswap health drops) into the alerting pipeline. Digest runs now queue pending alerts with severity/metadata so delivery jobs can notify operators automatically.

## Validation
- Unit tests: `npm run test:run --workspace @wedefidaily/api` (covers new intelligence-alert service and existing suites).
- Manual CLI: ran `npm run generate:digest -- --alerts=balance,reward` to observe console warning/log output and confirm alert creation counts.
- Verified new Prisma schemas via `npm run prisma:generate --workspace @wedefidaily/api`.

## Follow-Ups
- Expand alert delivery channels (issue #23) to forward intelligence alerts beyond console logging.
- Add UI surface for viewing intelligence alerts alongside snapshots.
