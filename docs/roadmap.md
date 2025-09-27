# Roadmap

## Status Snapshot
- ✅ **Phase 0 – Discovery & Foundations**: Repository scaffolding, environment handling, CI, Prisma schema, and baseline sync jobs are in place.
- ✅ **Phase 1 – Core Data Infrastructure**: Data adapters, portfolio/governance endpoints, and dashboard tiles are live.
- ✅ **Phase 2 – Protocol Modules**: Yield tracker, governance modules, and Gammaswap integration with risk assessment complete.
- ✅ **Phase 3 – Alerts & UX Polish**: Watchlist, digest, and governance dashboards validated; external integrations intentionally deferred.
- ✅ **Phase 4 – Intelligence Experiments**: Intelligence alerts implemented (PR #39), generating insights from historical data.
- 🚧 **Phase 5 – Critical Feature Gaps**: P&L tracking, performance metrics, liquidity insights (planning).

## Near-Term Focus

### Phase 2b – Yield & Claim Tracker (✅ Complete)
- Schema, jobs, and API wired for reward emissions + claim history.
- Protocol adapters for Aerodrome, veTHE, and Gammaswap rewards operational with gas-aware ROI.
- `/v1/rewards` powers the Action Required UI panel; regression tests cover normalization.
- Follow-up: monitor real API keys + wallets, capture feedback after first live run.

### Phase 2c – Gammaswap Integration (✅ Complete)
- Model LP/borrow data structures; ingest health factors, liquidation thresholds, and API-provided metadata. *(✅ Complete)*
- Add positions table hydrator via Alchemy or Gammaswap subgraph/API fetcher. *(✅ Complete – adapter with risk heuristics shipped)*
- Emit risk alerts for utilization spikes or elevated borrow rates. *(✅ Complete – integrated into alert processing pipeline)*
- Web UI: Gammaswap card with position PnL and risk flags. *(✅ Complete – live with risk indicators)*
- Update documentation for new environment keys or rate limits. *(✅ Complete – runbooks and documentation updated)*

## Mid-Term Initiatives

### Phase 3 Recap – Alerts & UX
- ✅ Alert processing pipeline with status lifecycle + delivery history via `/v1/alerts`
- ✅ Console delivery with per-channel summaries (external adapters intentionally omitted)
- ✅ Daily digest CLI (markdown/html/json) with `DigestRun` persistence and runbook
- ✅ Watchlist polish: API integration, modal UX, responsive design (issue #26)
- ✅ Docs: validation runbooks, QA evidence, digest workflow instructions

### Phase 4 – Intelligence Experiments (✅ Complete)
See `docs/plans/phase-4-intelligence.md` for strategy. Completed tasks:
- ✅ Balance delta highlights ([#32](https://github.com/cjnemes/WeDefiDaily/issues/32))
- ✅ Governance unlock reminders ([#33](https://github.com/cjnemes/WeDefiDaily/issues/33))
- ✅ Reward decay monitor ([#34](https://github.com/cjnemes/WeDefiDaily/issues/34))
- ✅ Gammaswap health trend insight ([#35](https://github.com/cjnemes/WeDefiDaily/issues/35))

### Phase 5 – Critical Feature Gaps (🚧 In Progress)
Addressing missing PRD functionality:
- **P&L & Performance Tracking** (✅ Complete - Phase 5a)
  - Historical price snapshots and 24h/7d delta calculations
  - Transaction history tracking with cost basis
  - Portfolio performance metrics with chart visualizations
  - API endpoints for historical data queries

- **Liquidity & Trading Analytics** (✅ Complete - Phase 5b)
  - Pool depth and liquidity metrics from Aerodrome/Gammaswap
  - Position size relative to pool TVL with risk scoring
  - Slippage estimates and optimal routing calculations
  - Impermanent loss calculations for LP positions with breakeven analysis
  - Real wallet integration with live blockchain data validation

- **Advanced Risk Analytics** (🚧 In Progress - Phase 5c)
  - Cross-position correlation analysis
  - Protocol exposure concentration warnings
  - Historical volatility tracking
  - Risk-adjusted return metrics

## Long-Range Exploration

### Phase 4 – Intelligence (✅ Complete)
- ✅ Intelligence alerts implementation merged (PR #39)
- ✅ All four initial heuristics completed (#32–#35)
- ✅ Integrated with digest generation pipeline
- Stretch goals (ROI simulations, scenario planner) remain on umbrella issue #20.

### Phase 5 – Critical Gaps (5-6 weeks)
- Implement historical price tracking and performance deltas
- Build transaction history and P&L calculation engine
- Add liquidity analytics and pool metrics integration
- Create advanced risk correlation analysis
- Deliver missing PRD user stories (US #3, #7)

## Enablers & Ongoing Workstreams
- Add integration tests around governance sync (mock fetch responses).
- Consider Dockerized scheduler or simple cron instructions for jobs.
- Maintain contract registry/configuration, rotate API keys, and monitor CI health.
- Capture manual feedback after each phase to re-prioritize backlog.
