# WeDefiDaily

Personal DeFi command center focused on Base-native incentives, ve-token governance, and multi-chain portfolio tracking.

## Monorepo Layout
- `apps/web` – Next.js front-end for dashboards, governance tooling, and daily digest views.
- `apps/api` – Fastify-based API gateway orchestrating data ingestion, analytics, and alerting.
- `docs/` – Product discovery, requirements, and roadmap artifacts.

## Getting Started
1. Install dependencies: `npm install`
2. Run services in parallel (recommended in separate terminals):
   - `npm run dev:api`
   - `npm run dev:web`
3. Visit `http://localhost:3000` for the web experience. The API listens on `http://localhost:4000` by default.

## Tooling Highlights
- TypeScript across the stack.
- Tailwind CSS (v4) for rapid UI iteration.
- ESLint + Prettier for consistent code style.
- Docker Compose scaffolding (coming next) for Postgres-backed persistence.

## Next Steps
- Implement API health checks and configuration scaffolding (env validation, logging strategy).
- Add containerization (`docker-compose.yml`) with Postgres and service definitions.
- Stand up CI (GitHub Actions) for linting, type-checking, and build validation.
- Start integrating Base/Aerodrome data connectors per `docs/roadmap.md`.
