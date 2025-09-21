# Roadmap

## Status Snapshot
- ✅ **Phase 0 – Discovery & Foundations**: Repository scaffolding, environment handling, CI, Prisma schema, and baseline sync jobs are in place.
- ✅ **Phase 1 – Core Data Infrastructure**: Data adapters, portfolio/governance endpoints, and dashboard tiles are live.
- ✅ **Phase 2 – Protocol Modules**: Yield tracker, governance modules, and Gammaswap integration with risk assessment complete.
- 🔄 **Phase 3a – Alerting & Digest**: Core infrastructure delivered; remaining work on external delivery channels.

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

### Phase 3a – Alerting & Digest (🔄 Mostly Complete)
- ✅ Alert processing pipeline with database schema and lifecycle management
- ✅ Alert types: claim due, epoch countdown, risk triggers, price thresholds
- ✅ Generate daily digest summarizing portfolio/governance actions (Markdown + CSV export)
- ✅ Enhanced CLI notifications with emoji formatting and structured output
- ⏳ **Remaining**: External delivery channels (Telegram, email) and job runner (BullMQ/Temporal)

### Phase 3b – Advanced UX Enhancements (1–2 weeks)
- Interactive watchlist with add/edit flows and real-time price trends.
- Drill-down pages for wallets and governance epochs.
- ✅ Export capability (Markdown/CSV) for the daily digest *(delivered early in Phase 3a)*
- Client-side caching powered by React Query for smoother refresh.

## Long-Range Exploration

### Phase 4 – Intelligence (post-alerting, 3+ weeks)
- Bribe ROI simulations with vote redistribution experiments.
- Historical analytics (APR trend charts, performance breakdowns).
- Scenario planner for re-lock decisions and treasury actions.
- Evaluate machine-assisted recommendations (stretch goal).

## Enablers & Ongoing Workstreams
- Add integration tests around governance sync (mock fetch responses).
- Consider Dockerized scheduler or simple cron instructions for jobs.
- Maintain contract registry/configuration, rotate API keys, and monitor CI health.
- Capture manual feedback after each phase to re-prioritize backlog.
