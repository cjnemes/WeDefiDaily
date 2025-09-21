# Daily Digest Generation Runbook

Use this checklist when running the daily digest job or validating its output.

## Prerequisites
- Postgres running locally with up-to-date data
- Recent data syncs for optimal digest quality:
  ```bash
  npm run sync:balances
  npm run sync:governance
  npm run sync:rewards
  npm run sync:gammaswap
  npm run process:alerts
  ```

## Execution
1. Generate the daily digest:
   ```bash
   npm run generate:digest
   ```
2. Check output files in `temp/` directory:
   - `digest-YYYY-MM-DDTHH-MM-SS-SSS.md` - Markdown format for reading
   - `digest-YYYY-MM-DDTHH-MM-SS-SSS.csv` - CSV format for spreadsheet analysis
3. Review console output for summary statistics and any critical alerts

## Digest Sections
The digest includes:
- **Executive Summary**: Portfolio value, wallet count, actionable rewards, alert counts
- **Action Required**: Overdue claims and critical alerts (if any)
- **Portfolio Overview**: Total value and top holdings by USD value
- **Governance & Voting**: Voting power, upcoming epochs, top bribe opportunities
- **Claimable Rewards**: Net value summary and upcoming deadlines
- **Gammaswap Positions**: Position count, health ratios, and risk levels
- **Warnings**: Non-critical alerts and notifications

## Automation Ideas
- Schedule via cron for daily 8am generation:
  ```bash
  0 8 * * * cd /path/to/WeDefiDaily && npm run generate:digest
  ```
- Email delivery: pipe markdown output to email tool
- Telegram integration: post digest summary to channel

## Troubleshooting
- **Empty sections**: Run data sync jobs first to populate with fresh data
- **Missing USD values**: Check CoinGecko API key and price sync status
- **No rewards**: Verify protocol API configurations and wallet addresses
- **File permissions**: Ensure `temp/` directory exists and is writable

## Output Format Examples

### Console Summary
```
✅ Daily digest generated:
   Markdown: /path/to/temp/digest-2024-12-21T08-00-00-000Z.md
   CSV: /path/to/temp/digest-2024-12-21T08-00-00-000Z.csv

📊 Summary:
   Portfolio: $12,345.67
   Actionable rewards: 3
   Critical alerts: 0
   Warning alerts: 1
```

### Critical Alert Example
```
🚨 CRITICAL ALERTS:
   • Gammaswap LP health at 1.04x: Position below safe threshold
```