# Alert Dispatch CLI Log

Command:
```bash
npm run process:alerts -- --channels=console
```

Output (2024-10-07):
```
Processing alerts at 2025-09-21T21:52:29.362Z
🚨 GAMMASWAP RISK: Gammaswap LP health at 1.04x
   Description: Health ratio below 1.05 (critical) · Pool utilization high (92.50%) · Borrow APR elevated (52.30%)
   Wallet: 0x000000…
   Protocol: Gammaswap
   Triggered at: 2025-09-21T21:52:29.978Z
⚠️ GAMMASWAP RISK: Gammaswap BORROW health at 1.18x
   Description: Health ratio trending toward liquidation (<1.20)
   Wallet: 0x000000…
   Protocol: Gammaswap
   Triggered at: 2025-09-21T21:52:29.986Z
Alert dispatch summary: processed 2 alerts across channels [console]
  ↳ console: delivered=2 skipped=0 failures=0
Alerts dispatched this run: 2
```

Notes:
- Channel filter `console` used to validate summary logging without external integrations.
- Repeat run with Slack webhook once credentials available to confirm multi-channel report.
