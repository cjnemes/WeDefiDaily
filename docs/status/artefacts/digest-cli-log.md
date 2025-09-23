# Daily Digest CLI Run – 2025-09-23

Command:
```bash
npm run generate:digest --workspace @wedefidaily/api -- --format=both --json --stdout
```

Summary:
- Markdown: `apps/api/storage/digests/digest-2025-09-23T13-39-00-610Z.md`
- HTML: `apps/api/storage/digests/digest-2025-09-23T13-39-00-610Z.html`
- JSON: `apps/api/storage/digests/digest-2025-09-23T13-39-00-610Z.json`
- Console summary: `Digest · portfolio=0 · wallets=3 · actionableRewards=0 · alerts(c=1, w=1)`
- Prisma warning: `DigestRun table not found` (expected on fresh DB; run `npm run prisma:db:push --workspace @wedefidaily/api` to create)

```text
Collecting daily digest data...
Markdown digest saved to .../storage/digests/digest-2025-09-23T13-39-00-610Z.md
...
Digest · portfolio=0 · wallets=3 · actionableRewards=0 · alerts(c=1, w=1)
DigestRun table not found. Run `npm run prisma:db:push --workspace @wedefidaily/api` to create it.
```
