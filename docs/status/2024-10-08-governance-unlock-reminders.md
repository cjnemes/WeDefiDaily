# 2024-10-08 - Governance Unlock Reminders (#33)

## Summary
Captured per-digest governance lock snapshots and extended the daily digest intelligence section with reminders for locks expiring within a configurable window (default seven days). The CLI now surfaces console warnings for upcoming unlocks and accepts `--governance-window` overrides.

## Validation
- Prisma client regenerated after adding the `GovernanceLockSnapshot` model.
- Unit tests updated to assert snapshot payloads, unlock filtering, and digest rendering.
- Manual review: confirmed markdown renderer lists governance unlock notices alongside balance movements.

## Follow-Ups
- Exercise the digest job against live governance data to confirm multiple locks are batched and ordered correctly.
- Consider wiring critical unlocks into the alert processing loop once delivery channels are configured.
