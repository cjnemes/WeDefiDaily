# Roadmap

## Phase 0 – Discovery & Foundations (Week 0-1)
- Validate wallet inventory, protocol coverage, and API key availability.
- Define preferred user interface and notification channels.
- Draft detailed data models and integration specs per protocol.
- Set up repository scaffolding, environment management, and CI lint/test pipelines.

## Phase 1 – Core Data Infrastructure (Week 1-3)
- Implement integration adapters for Alchemy (Base/Ethereum), Etherscan v2 (Base, BSC), CoinMarketCap, and CoinGecko.
- Establish database schema for wallet balances, protocol positions, price history, and alerts.
- Build job scheduler to drive periodic syncs and caching layers.
- Deliver CLI or API endpoints to query consolidated portfolio snapshots.

## Phase 2 – Protocol Modules (Week 3-6)
- **Aerodrome Module**: ingest locks, votes, bribes, and gauge stats; compute vote ROI recommendations.
- **Gammaswap Module**: monitor LP positions, borrow rates, and health metrics; surface liquidation risks.
- **veTHE Module**: track lock status, rewards, and vote timelines on BSC.
- Implement reward claim tracker with actionable prompts.

## Phase 3 – User Experience Layer (Week 6-8)
- Develop front-end dashboard or enriched CLI with charts, filters, and action panels.
- Integrate watchlist management and trading outlook features (price alerts, liquidity snapshots).
- Produce daily digest report (email/Telegram/CLI) summarizing key metrics and actions.

## Phase 4 – Automation & Intelligence (Week 8-12)
- Introduce alerting workflows with acknowledgements and follow-up tasks.
- Add historical analytics (APR trends, performance breakdowns).
- Explore simulation toolkit for vote allocations and rebalancing scenarios.
- Start building abstraction for future multi-user and automation features.

## Phase 5 – Hardening & Expansion (Post-MVP)
- Conduct security review and implement RBAC, audit logs, and secret rotation.
- Expand protocol support (e.g., new Base projects, Ethereum LSDs) via pluggable adapters.
- Optimize performance with incremental data refresh and event-driven updates.
- Prepare documentation for onboarding additional users or contributors.

## Ongoing Workstreams
- Maintain contract address registry and protocol metadata.
- Monitor API usage and rotate keys ahead of expirations.
- Capture product feedback and iterate on UI/UX flows.
- Keep alert configurations aligned with evolving strategies.
