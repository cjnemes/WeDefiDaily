# Plan: Phase 3a – Alert Delivery Adapters

Issue: [#27](https://github.com/cjnemes/WeDefiDaily/issues/27)

## Goals
- Support multiple delivery channels in `npm run process:alerts` when policy allows.
- Ensure `/v1/alerts` exposes delivery metadata and filtering capabilities.
- Keep the default experience console-only and document the approval process before any external integration is introduced.

## Proposed Changes
1. **Delivery Adapter Interface**
   - Move the existing console adapter to a `deliveries` registry (`apps/api/src/services/alert-delivery.ts`).
   - Document how to add new adapters while keeping them disabled by default until the no-external-services policy changes.
   - Update adapter result metadata to include a human-readable summary (e.g., `channel` + `messageId`).

2. **Job Enhancements (`process-alerts.ts`)**
   - For each pending alert, attempt delivery with all registered adapters, recording successes/failures in `AlertDelivery`.
   - Track per-run summary counters (alerts attempted, dispatched per channel, failures) and log a consolidated summary before exit.
   - Allow a `--channel` CLI flag (env variable `ALERT_CHANNEL_FILTER`) to limit adapters when testing locally.

3. **API & Filtering**
   - Extend `/v1/alerts` to accept `channel` query parameter using Prisma filtering rather than in-memory filtering.
   - Add optional `deliveredSince` filter to support dashboards showing “alerts delivered in last 24h”.

4. **Configuration**
   - Outline placeholder configuration keys in documentation but keep them commented out until an approved adapter is introduced.
   - Update `docs/runbooks/alerts-processing.md` with configuration steps and CLI examples when new adapters are sanctioned.

5. **Testing**
   - Add Vitest unit tests for the adapter registry as additional adapters are added.
   - Add integration-style test for `/v1/alerts?channel=...` verifying filtering.
   - Ensure snapshot/unit tests cover `serializeAlert` ordering of deliveries.

## Open Questions
- Do we need deduplication logic per channel (e.g., skip adapters if `metadata` indicates success in last hour)? (Out of scope for #27—document as follow-up.)
- Should we store per-channel delivery metadata for easier reconciliation? (Currently planned to store raw webhook response.)

## Milestones
1. Adapter registry foundation.
2. Process job summary logging + CLI flag.
3. API filter improvements.
4. Docs/runbooks updates.
5. Test coverage & final validation.

Target: PR following #30, possibly split into backend + docs/test follow-up if size grows.
