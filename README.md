# WeDefiDaily

[![CI](https://github.com/cjnemes/WeDefiDaily/actions/workflows/ci.yml/badge.svg)](https://github.com/cjnemes/WeDefiDaily/actions/workflows/ci.yml)

Personal DeFi command center focused on Base-native incentives, ve-token governance, and multi-chain portfolio tracking.

## Monorepo Layout
- `apps/web` – Next.js front-end for dashboards, governance tooling, and daily digest views.
- `apps/api` – Fastify-based API gateway orchestrating data ingestion, analytics, and alerting.
- `docs/` – Product discovery, requirements, and roadmap artifacts.

## Getting Started
1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and provide strong secrets for Postgres and API keys as needed.
3. Start Postgres (Docker Desktop required): `docker compose up -d postgres`
4. Push the Prisma schema to your database: `npm run db:push`
5. Generate the Prisma client (if needed): `npm run db:generate`
6. Seed balances (optional, requires API keys): `npm run sync:balances`
7. Sync governance data (optional, requires governance API access): `npm run sync:governance`
8. Sync reward opportunities (optional, requires protocol APIs): `npm run sync:rewards`
9. Sync Gammaswap positions (optional): `npm run sync:gammaswap`
10. Run services in parallel (recommended in separate terminals):
   - `npm run dev:api`
   - `npm run dev:web`
10. Visit `http://localhost:3000` for the web experience. The API listens on `http://localhost:4000` by default.

## Tooling Highlights
- TypeScript across the stack.
- Tailwind CSS (v4) for rapid UI iteration.
- ESLint + Prettier for consistent code style.
- Prisma ORM for Postgres-backed persistence.
- Docker Compose scaffolding for Postgres-backed persistence.
- GitHub Actions CI pipeline running Prisma generate, lint, and type checks.
- Alchemy + CoinMarketCap/CoinGecko powered balance sync job (`npm run sync:balances`).
- Aerodrome/Thena governance sync job (`npm run sync:governance`).
- Reward opportunity sync job across supported protocols (`npm run sync:rewards`).
- Gammaswap position sync and risk analytics (`npm run sync:gammaswap`).

## Next Steps
- Phase 2b: finalize reward adapters and `/v1/rewards` gas-aware outputs, then surface an Action Required panel in the UI.
- Phase 2c: complete Gammaswap ingestion for LP/borrow health, including risk heuristics and documentation updates.
- Phase 3a: introduce alerting + daily digest workflows before pursuing the advanced UX/analytics roadmap in `docs/roadmap.md`.

## Project Management
- Follow `docs/project-management.md` for issue templates, roadmap labels, and PR checklists to keep GitHub history clean and traceable.
- Use the runbook at `docs/runbooks/gammaswap-sync.md` when refreshing Gammaswap data, attaching logs to the matching roadmap issue.
- Keep `docs/roadmap-issue-tracker.md` up to date so every roadmap bullet is backed by a GitHub ticket.

## API Surface (current)

- `GET /health` – returns overall service status along with database connectivity (`{ "status": "ok", "db": "up" }`).
- `GET /v1/wallets?limit=20&offset=0` – lists tracked wallets (EVM address, chain metadata, timestamps).
- `POST /v1/wallets` – creates or updates a wallet entry. Example payload:

  ```json
  {
    "address": "0x1234abcd5678ef901234abcd5678ef901234abcd",
    "chainId": 8453,
    "label": "Base main wallet",
    "chainName": "Base",
    "chainShortName": "base",
    "nativeCurrencySymbol": "ETH"
  }
  ```

  Returns `201 Created` for new wallets or `200 OK` when an existing record is reused/updated.
- `GET /v1/portfolio` – aggregates balances across tracked wallets (USD value, per-token breakdown).
- `GET /v1/governance` – surfaces governance locks, bribe leaderboard, and upcoming epochs.
- `GET /v1/rewards` – returns claimable rewards with gas-adjusted profitability metrics.
- `GET /v1/gammaswap` – lists LP/borrow positions with health ratios and risk flags.
- `GET /v1/alerts` – retrieves generated alerts with filtering by status, type, and severity.
- `GET /v1/price-thresholds` – manages price monitoring thresholds for automated alerts.

## Useful Commands

- `npm run lint` – lint both workspaces.
- `npm run typecheck` – run TypeScript type checking across web and API.
- `npm run db:validate` – ensure the Prisma schema is valid (used by CI).
- `npm run sync:balances` – fetch ERC-20 + native balances for configured wallets using Alchemy and update USD valuations via CoinGecko.
- `npm run sync:governance` – ingest Aerodrome/Thena vote escrow data and bribe markets.
- `npm run sync:rewards` – populate reward opportunities and ROI metrics for supported protocols.
- `npm run sync:gammaswap` – hydrate Gammaswap pool/position data and compute risk metrics.
  - Without a `GAMMASWAP_API_URL`, the job loads a local mock dataset so alerts and UI flows remain testable.
- `npm run process:alerts` – evaluate reward, governance, and Gammaswap signals to upsert alerts and log deliveries.
- `npm run generate:digest` – create daily digest in Markdown and CSV formats summarizing portfolio, governance, and alerts.
- `npm run check:price-thresholds` – monitor configured price thresholds and generate alerts when triggered.
