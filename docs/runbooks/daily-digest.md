# Daily Digest Runbook

Use this guide to generate and review the Phase 3a daily digest output.

## Prerequisites
- API service configuration initialized (`.env` with database credentials).
- Run `npm run prisma:db:push --workspace @wedefidaily/api` at least once to create the `DigestRun` table.
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

## Verification Checklist
- Open the generated file(s) and confirm sections exist: Executive Summary, Portfolio, Governance, Rewards, Gammaswap, Alerts.
- Ensure currency/percentage values are formatted correctly.
- Confirm summary line at the end of the CLI run (e.g., `Digest · portfolio=...`).
- Inspect the `DigestRun` table to verify a record was persisted:
  ```bash
  PGPASSWORD=... psql -h localhost -U wedefi -d wedefi -c 'SELECT id, generated_at, markdown_path, html_path FROM "DigestRun" ORDER BY "createdAt" DESC LIMIT 3;'
  ```

## Troubleshooting
- If the job fails, check the database for required records (balances, governance locks, etc.).
- HTML output escapes markdown into `<pre>` for now; richer formatting can be layered later.
- Delete old files from `storage/digests` as needed to keep the directory tidy.
