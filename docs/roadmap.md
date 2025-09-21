# Roadmap

## Status Snapshot
- ✅ **Phase 0 – Discovery & Foundations**: Repository scaffolding, environment handling, CI, Prisma schema, and baseline sync jobs are in place.
- ✅ **Phase 1 – Core Data Infrastructure**: Data adapters, portfolio/governance endpoints, and dashboard tiles are live.
- 🔄 **Phase 2 – Protocol Modules**: Yield tracker + ve modules shipped; Gammaswap ingestion and alert wiring are underway.

## Near-Term Focus

### Phase 2b – Yield & Claim Tracker (✅ Complete)
- Schema, jobs, and API wired for reward emissions + claim history.
- Protocol adapters for Aerodrome, veTHE, and Gammaswap rewards operational with gas-aware ROI.
- `/v1/rewards` powers the Action Required UI panel; regression tests cover normalization.
- Follow-up: monitor real API keys + wallets, capture feedback after first live run.

### Phase 2c – Gammaswap Integration (1–2 weeks)
- Model LP/borrow data structures; ingest health factors, liquidation thresholds, and API-provided metadata. *(In progress)*
- Add positions table hydrator via Alchemy or Gammaswap subgraph/API fetcher. *(In progress – initial adapter + risk heuristics shipped)*
- Emit risk alerts for utilization spikes or elevated borrow rates. *(In progress – metadata marks signals; hook into alert job next)*
- Web UI: Gammaswap card with position PnL and risk flags. *(Initial version live; expand drill-downs + sorting)*
- Update documentation for new environment keys or rate limits. *(Pending once production endpoint set)*

## Mid-Term Initiatives

### Phase 3a – Alerting & Digest (≈2 weeks)
- Introduce a job runner (BullMQ/Temporal-lite) and multi-channel notifications (Telegram, email, CLI).
- Alert types: claim due, epoch countdown, risk triggers, price thresholds.
- Generate a daily digest summarizing portfolio/governance actions.
- Provide configuration storage for alert preferences and channel wiring.

### Phase 3b – Advanced UX Enhancements (1–2 weeks)
- Interactive watchlist with add/edit flows and real-time price trends.
- Drill-down pages for wallets and governance epochs.
- Export capability (Markdown/CSV) for the daily digest.
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
