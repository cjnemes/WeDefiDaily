# Alerts Processing Runbook

Use this checklist when validating the alert pipeline (Phase 3a) locally.

## Prerequisites
- Postgres running locally (see `docs/runbooks/gammaswap-sync.md`).
- Prisma schema pushed (`npm run db:push`).
- Mock Gammaswap data available (default when `GAMMASWAP_API_URL` is unset).

## Steps
1. Generate alert data:
   ```bash
   npm run sync:gammaswap
   npm run process:alerts
   ```
   The sync populates positions/metrics; the alert processor upserts alerts based on thresholds.
2. Inspect pending alerts via API:
   ```bash
   curl "$NEXT_PUBLIC_API_URL/v1/alerts?status=pending" | jq
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
- When wiring live delivery channels, extend `AlertDelivery.channel` with the integration name (e.g., `slack`, `email`).
