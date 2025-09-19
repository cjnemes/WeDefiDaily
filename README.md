# WeDefiDaily

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
6. Run services in parallel (recommended in separate terminals):
   - `npm run dev:api`
   - `npm run dev:web`
7. Visit `http://localhost:3000` for the web experience. The API listens on `http://localhost:4000` by default.

## Tooling Highlights
- TypeScript across the stack.
- Tailwind CSS (v4) for rapid UI iteration.
- ESLint + Prettier for consistent code style.
- Prisma ORM for Postgres-backed persistence.
- Docker Compose scaffolding for Postgres-backed persistence.

## Next Steps
- Add Base/Aerodrome data connectors and on-chain sync jobs.
- Stand up CI (GitHub Actions) for linting, type-checking, and build validation.
- Start integrating Base/Aerodrome data connectors per `docs/roadmap.md`.

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
