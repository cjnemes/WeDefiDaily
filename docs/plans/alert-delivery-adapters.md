# Plan: Phase 3a – Alert Delivery Adapters

Issue: [#27](https://github.com/cjnemes/WeDefiDaily/issues/27)

## Goals
- Support multiple delivery channels in `npm run process:alerts`.
- Ensure `/v1/alerts` exposes delivery metadata and filtering capabilities.
- Keep the default experience safe (console-only) while documenting how to enable future integrations (Slack/email).

## Proposed Changes
1. **Delivery Adapter Interface**
   - Move the existing console adapter to a `deliveries` registry (`apps/api/src/services/alert-delivery.ts`).
   - Add a `SlackWebhookAdapter` stub that posts to an incoming webhook URL if `SLACK_ALERT_WEBHOOK_URL` is set; otherwise it is skipped gracefully.
   - Update adapter result metadata to include a human-readable summary (e.g., `channel` + `messageId`).

2. **Job Enhancements (`process-alerts.ts`)**
   - For each pending alert, attempt delivery with all registered adapters, recording successes/failures in `AlertDelivery`.
   - Track per-run summary counters (alerts attempted, dispatched per channel, failures) and log a consolidated summary before exit.
   - Allow a `--channel` CLI flag (env variable `ALERT_CHANNEL_FILTER`) to limit adapters when testing locally.

3. **API & Filtering**
   - Extend `/v1/alerts` to accept `channel` query parameter using Prisma filtering rather than in-memory filtering.
   - Add optional `deliveredSince` filter to support dashboards showing “alerts delivered in last 24h”.

4. **Configuration**
   - Add `SLACK_ALERT_WEBHOOK_URL` (optional) to `.env.example` and document usage in runbook.
   - Update `docs/runbooks/alerts-processing.md` with configuration steps and CLI examples.

5. **Testing**
   - Add Vitest unit tests for the adapter registry (mocking fetch for Slack).
   - Add integration-style test for `/v1/alerts?channel=...` verifying filtering.
   - Ensure snapshot/unit tests cover `serializeAlert` ordering of deliveries.

## Open Questions
- Do we need deduplication logic per channel (e.g., skip Slack if `metadata` indicates success in last hour)? (Out of scope for #27—document as follow-up.)
- Should we store Slack message timestamp for easier reconciliation? (Currently planned to store raw webhook response.)

## Milestones
1. Adapter registry + Slack stub implementation.
2. Process job summary logging + CLI flag.
3. API filter improvements.
4. Docs/runbooks updates.
5. Test coverage & final validation.

Target: PR following #30, possibly split into backend + docs/test follow-up if size grows.
