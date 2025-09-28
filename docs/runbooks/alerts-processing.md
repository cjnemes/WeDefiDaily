# Alerts Processing Runbook

Use this checklist when validating the alert pipeline (Phase 3a) locally.

## Prerequisites
- Postgres running locally (see `docs/runbooks/gammaswap-sync.md`).
- Prisma schema pushed (`npm run db:push`).
- Mock Gammaswap data available (default when `GAMMASWAP_API_URL` is unset).
- Optional: set `ALERT_CHANNEL_FILTER` or pass `--channels=<list>` when running `process:alerts` to target specific adapters.

## Steps
1. Generate alert data:
   ```bash
   npm run sync:gammaswap
   npm run process:alerts
   ```
   The sync populates positions/metrics; the alert processor upserts alerts (status `pending`) and dispatches them through the active delivery adapters. The CLI prints a per-channel summary at the end of each run.
2. Inspect alerts via API:
   ```bash
   curl "$NEXT_PUBLIC_API_URL/v1/alerts?status=pending" | jq
   curl "$NEXT_PUBLIC_API_URL/v1/alerts?status=dispatched&channel=console" | jq
   ```
3. Acknowledge a critical alert:
   ```bash
   curl -X POST "$NEXT_PUBLIC_API_URL/v1/alerts/<alert-id>/ack"
   ```
4. Verify delivery log:
   ```bash
   PGPASSWORD=local-dev-password psql -h localhost -U wedefi -d wedefi -c 'SELECT channel, metadata FROM "AlertDelivery" ORDER BY "createdAt" DESC LIMIT 5;'
   ```

## Notes
- Without a real Gammaswap feed, alerts are generated from the mock fixture and focus on risk severity logic.
- The alert processor retries gracefully when token prices fail (e.g., CoinGecko limits) and still persists alerts with available metrics.
- Delivery adapters are registered via `createDeliveryAdapters` in `apps/api/src/services/alert-delivery.ts`. The default build ships only the console adapter in accordance with the local-only policy.
- Use `ALERT_CHANNEL_FILTER=console` (or `npm run process:alerts -- --channels=console`) to restrict runs to specific adapters during testing.
- When wiring future integrations, extend the `AlertDelivery.channel` enumeration with the integration name and document the policy exception before enabling it.
