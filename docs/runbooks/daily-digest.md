# Daily Digest Runbook

Use this guide to generate and review the Phase 3a daily digest output.

## Prerequisites
- API service configuration initialized (`.env` with database credentials).
- Balance/governance/rewards sync jobs have been executed recently (`npm run sync:*`).
- Output directory defaults to `storage/digests` relative to the repository root.

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

### Custom Output Path & Stdout Preview
```bash
npm run generate:digest -- --output=tmp/digest.md --stdout
```

## Verification Checklist
- Open the generated file(s) and confirm sections exist: Executive Summary, Portfolio, Governance, Rewards, Gammaswap, Alerts.
- Ensure currency/percentage values are formatted correctly.
- Confirm summary line at the end of the CLI run (e.g., `Digest · portfolio=...`).

## Troubleshooting
- If the job fails, check the database for required records (balances, governance locks, etc.).
- HTML output escapes markdown into `<pre>` for now; richer formatting can be layered later.
- Delete old files from `storage/digests` as needed to keep the directory tidy.
