# Roadmap

## Status Snapshot
- ✅ **Phase 0 – Discovery & Foundations**: Repository scaffolding, environment handling, CI, Prisma schema, and baseline sync jobs are in place.
- ✅ **Phase 1 – Core Data Infrastructure**: Data adapters, portfolio/governance endpoints, and dashboard tiles are live.
- ✅ **Phase 2 – Protocol Modules**: Yield tracker, governance modules, and Gammaswap integration with risk assessment complete.
- ✅ **Phase 3 – Alerts & UX Polish**: Watchlist, digest, and governance dashboards validated; external integrations intentionally deferred.
- 📝 **Phase 4 – Intelligence Experiments**: Planning underway (see docs/plans/phase-4-intelligence.md).

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

### Phase 4 – Intelligence Experiments (Backlog)
See `docs/plans/phase-4-intelligence.md` for strategy. Initial tasks:
- Balance delta highlights ([#32](https://github.com/cjnemes/WeDefiDaily/issues/32))
- Governance unlock reminders ([#33](https://github.com/cjnemes/WeDefiDaily/issues/33))
- Reward decay monitor ([#34](https://github.com/cjnemes/WeDefiDaily/issues/34))
- Gammaswap health trend insight ([#35](https://github.com/cjnemes/WeDefiDaily/issues/35))

## Long-Range Exploration

### Phase 4 – Intelligence (3+ weeks)
- Phase 4 plan document captured with heuristics + follow-ups (docs/plans/phase-4-intelligence.md)
- Four backlog issues created for initial heuristics (#32–#35)
- Stretch goals (ROI simulations, scenario planner) remain on umbrella issue #20.

## Enablers & Ongoing Workstreams
- Add integration tests around governance sync (mock fetch responses).
- Consider Dockerized scheduler or simple cron instructions for jobs.
- Maintain contract registry/configuration, rotate API keys, and monitor CI health.
- Capture manual feedback after each phase to re-prioritize backlog.
