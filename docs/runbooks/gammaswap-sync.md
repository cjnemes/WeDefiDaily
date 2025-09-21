# Gammaswap Sync Runbook

Use this checklist whenever you onboard new wallets, rotate API keys, or prepare a Phase 2c status update.

## Prerequisites
- `.env` contains `GAMMASWAP_API_URL` pointing at the wallet positions endpoint. The URL may include `{walletAddress}` as a placeholder; the job will replace it automatically.
- Tracked wallets for Base (chain ID 8453) exist in the database (`GET /v1/wallets`).
- Optional: `COINGECKO_API_KEY` set for richer USD valuations.

## Execution
1. Ensure Docker/Postgres is running and apply the latest schema (`npm run db:push`).
2. Run the sync job with production credentials:
   ```bash
   npm run sync:gammaswap
   ```
3. Capture the console summary (critical/warning counts) and attach it to the relevant GitHub issue.
4. Spot-check API output:
   ```bash
   curl "$NEXT_PUBLIC_API_URL/v1/gammaswap" | jq '.data.positions[] | {pool: .pool.baseSymbol + "/" + .pool.quoteSymbol, health: .healthRatio, risk: .riskLevel, signals: .riskSignals}'
   ```
5. Update the dashboard screenshot if risk badges changed noticeably.

## Post-Run Hygiene
- Comment on the Phase 2c issue with the timestamped summary and any anomalies (missing pools, empty responses, etc.).
- If stale alerts remain after new data lands, re-run `npm run sync:gammaswap` and `npm run sync:rewards` before escalating.
- Close or re-triage any GitHub issues tied to resolved incidents to keep the board clean.
