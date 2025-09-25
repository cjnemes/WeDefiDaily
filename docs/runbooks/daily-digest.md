# Daily Digest Runbook

Use this guide to generate and review the daily digest output, including the Phase 4 intelligence notes.

## Prerequisites
- API service configuration initialized (`.env` with database credentials).
- Run `npm run prisma:db:push --workspace @wedefidaily/api` after schema updates to ensure the `DigestRun`, `WalletBalanceSnapshot`, and `GovernanceLockSnapshot` tables exist.
- Balance/governance/rewards sync jobs executed recently (`npm run sync:*`).
- Optional: set `DIGEST_OUTPUT_DIR` in `.env` to customise where reports are written (defaults to `storage/digests`).

## Commands

### Markdown Output
```bash
npm run generate:digest
# Saves to storage/digests/digest-<timestamp>.md
```

### HTML Output
```bash
npm run generate:digest -- --format=html
# Saves to storage/digests/digest-<timestamp>.html
```

### Both Markdown & HTML
```bash
npm run generate:digest -- --format=both
```

### JSON Output
```bash
npm run generate:digest -- --json
# Writes digest-<timestamp>.json alongside other files

# Or specify a path
npm run generate:digest -- --json=tmp/digest.json
```

### Custom Output Path & Stdout Preview
```bash
npm run generate:digest -- --output=tmp/digest.md --stdout
```

### Adjust Balance Delta Threshold
```bash
npm run generate:digest -- --balance-threshold=7.5
# Highlights wallets that moved ±7.5% or more since the previous digest
```

### Adjust Governance Unlock Window
```bash
npm run generate:digest -- --governance-window=10
# Flags governance locks expiring within 10 days (default 7)
```

### Trigger from API (for UI button / integrations)
```bash
curl -X POST ${NEXT_PUBLIC_API_URL:-http://localhost:4000}/v1/digest \
  -H 'content-type: application/json' \
  -d '{"balanceDeltaThreshold":12,"governanceUnlockWindowDays":7,"alerts":["balance","reward"]}'
```

### Reward Decay Parameters
```bash
npm run generate:digest -- --reward-warning=72 --reward-threshold=15
# Highlights rewards with <72h remaining or net value below $15 (defaults 48h / $10)
```

### Gammaswap Health Drop Threshold
```bash
npm run generate:digest -- --gammaswap-drop=0.2
# Flags positions whose health ratio dropped by ≥0.2 since the previous digest (default 0.1)
```

### Intelligence Alerts Toggle
```bash
npm run generate:digest -- --alerts=balance,reward
# Valid values: balance, governance, reward, gammaswap, none (comma separated)

# Environment equivalent:
export DIGEST_ALERTS="balance,governance,reward,gammaswap"
```

## Verification Checklist
- Open the generated file(s) and confirm sections exist: Executive Summary, Intelligence Notes, Portfolio, Governance, Rewards, Gammaswap, Alerts.
- Ensure currency/percentage values are formatted correctly.
- Confirm summary line at the end of the CLI run (e.g., `Digest · portfolio=...`).
- Inspect the `DigestRun` table to verify a record was persisted:
  ```bash
  PGPASSWORD=... psql -h localhost -U wedefi -d wedefi -c 'SELECT id, generated_at, markdown_path, html_path FROM "DigestRun" ORDER BY "createdAt" DESC LIMIT 3;'
  ```
- Validate that wallet balance snapshots were captured for the latest run:
  ```bash
  PGPASSWORD=... psql -h localhost -U wedefi -d wedefi \
    -c 'SELECT "digestRunId", "walletId", "totalUsd" FROM "WalletBalanceSnapshot" ORDER BY "capturedAt" DESC LIMIT 10;'
  ```
- Validate governance lock snapshots were recorded:
  ```bash
  PGPASSWORD=... psql -h localhost -U wedefi -d wedefi \
    -c 'SELECT "digestRunId", "governanceLockId", "lockEndsAt" FROM "GovernanceLockSnapshot" ORDER BY "capturedAt" DESC LIMIT 10;'
  ```
- Spot check that highlighted wallets in **Intelligence Notes** align with the percentage threshold that was used.
- Confirm any governance unlock warnings align with the configured window (CLI flag or `DIGEST_GOVERNANCE_WINDOW_DAYS`).
- Confirm reward decay notes list opportunities with net USD below the configured threshold or within the warning window.
- Validate reward snapshots:
  ```bash
  PGPASSWORD=... psql -h localhost -U wedefi -d wedefi \
    -c 'SELECT "digestRunId", "rewardOpportunityId", "netUsd", "claimDeadline" FROM "RewardOpportunitySnapshot" ORDER BY "capturedAt" DESC LIMIT 10;'
  ```
- Validate Gammaswap position snapshots:
  ```bash
  PGPASSWORD=... psql -h localhost -U wedefi -d wedefi \
    -c 'SELECT "digestRunId", "gammaswapPositionId", "healthRatio", "notional" FROM "GammaswapPositionSnapshot" ORDER BY "capturedAt" DESC LIMIT 10;'
  ```
- Review recent alerts to ensure intelligence events triggered appropriately:
  ```bash
  PGPASSWORD=... psql -h localhost -U wedefi -d wedefi \
    -c 'SELECT type, severity, title, triggerAt FROM "Alert" WHERE type LIKE ''intelligence_%'' ORDER BY "triggerAt" DESC LIMIT 10;'
  ```

## Troubleshooting
- If the job fails, check the database for required records (balances, governance locks, etc.).
- If no Intelligence Notes appear, confirm a previous digest run exists or lower the balance threshold via `--balance-threshold`.
- If governance unlock reminders do not appear, ensure locks have upcoming `lockEndsAt` values inside the configured window or adjust `--governance-window`.
- HTML output escapes markdown into `<pre>` for now; richer formatting can be layered later.
- Delete old files from `storage/digests` as needed to keep the directory tidy.
