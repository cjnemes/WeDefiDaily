# Roadmap

## Status Snapshot
- ✅ **Phase 0 – Discovery & Foundations**: Repository scaffolding, environment handling, CI, Prisma schema, and baseline sync jobs are in place.
- ✅ **Phase 1 – Core Data Infrastructure**: Data adapters, portfolio/governance endpoints, and dashboard tiles are live.
- ✅ **Phase 2 – Protocol Modules**: Yield tracker, governance modules, and Gammaswap integration with risk assessment complete.
- ✅ **Phase 3 – Alerts & UX Polish**: Watchlist, digest, and governance dashboards validated; external integrations intentionally deferred.
- ✅ **Phase 4 – Intelligence Experiments**: Intelligence alerts implemented (PR #39), generating insights from historical data.
- ✅ **Phase 5 – Critical Feature Gaps**: P&L tracking, performance metrics, liquidity insights, and multi-chain governance complete.
- ✅ **Phase 6 – UX Foundation**: User interface improvements, wallet management UI, token filtering, and loading states complete.
- ✅ **Phase 7 – Advanced Analytics Foundation**: Opportunity detection engine, UI, and demo data complete.
- 🔄 **Phase 7b – Real Data Integration**: Live protocol APIs, gas oracles, and production-ready opportunity detection.

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

### Phase 5 – Critical Feature Gaps (✅ Complete)
Successfully addressed missing PRD functionality:
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

- **Advanced Risk Analytics** (✅ Complete - Phase 5c)
  - Cross-position correlation analysis
  - Protocol exposure concentration warnings
  - Historical volatility tracking
  - Risk-adjusted return metrics

- **Multi-Chain Governance Integration** (✅ Complete - Phase 5 Critical)
  - veTHE on-chain integration for BSC governance tracking
  - 4-tier fallback strategy for robust data extraction
  - Rate-limited BSC RPC calls with comprehensive error handling
  - Enhanced governance sync pipeline supporting both API and on-chain data

### Phase 6 – UX Foundation (✅ Complete)
Following comprehensive UX testing with Playwright, all critical usability barriers have been eliminated. WeDefiDaily is now a fully user-friendly web application with zero CLI dependencies for basic usage.

**Priority 1 – User Interface Essentials** (1-2 weeks)
- **Wallet Management UI** (High)
  - Replace curl command requirements with intuitive web forms
  - Add wallet creation/import interface with address validation
  - Enable wallet editing, labeling, and removal through UI
  - Implement bulk wallet operations and chain selection

- **Token Filtering System** (High)
  - Address spam token pollution (90+ tokens per wallet including scams)
  - Implement "Show valuable tokens only" toggle with configurable thresholds
  - Add spam detection heuristics and manual token hiding
  - Create clean portfolio views focusing on meaningful holdings

- **Loading States & Feedback** (High)
  - Replace silent button states with proper loading indicators
  - Add progress feedback for sync operations and API calls
  - Implement toast notifications for success/error states
  - Provide clear feedback for all user actions

**Priority 2 – Data Sync UX** (2-3 weeks)
- **In-App Sync Capabilities** (Medium)
  - Replace command-line sync requirements with web UI triggers
  - Add one-click portfolio refresh with progress tracking
  - Implement background sync status monitoring
  - Create guided sync workflow for new users

- **Empty State Improvements** (Medium)
  - Design better first-run experiences with clear next steps
  - Add sample data modes for demonstration purposes
  - Create guided onboarding flow for new users
  - Improve empty state messaging with actionable CTAs

**Priority 3 – Polish & Optimization** (1 week)
- **Data Display Improvements** (Low)
  - Fix duplicate token entries (multiple WETH/ETH showing identical data)
  - Implement proper token grouping and deduplication
  - Add sortable and filterable portfolio views
  - Enhance mobile responsive design

- **Chart Implementation** (Low)
  - Replace "Chart implementation pending" with actual visualizations
  - Add interactive portfolio performance charts
  - Implement token price history visualization

**Success Metrics:**
- New users can add wallets without command-line access
- Portfolio views show clean, meaningful token lists
- All user actions provide clear feedback and loading states
- Zero command-line requirements for basic application usage

**Technical Approach:**
- Preserve all existing API endpoints and CLI capabilities
- Add progressive enhancement layers for UI interactions
- Maintain power-user CLI access while prioritizing web UI
- Use existing technical infrastructure with improved presentation

### Phase 7 – Advanced Analytics Foundation (✅ Complete - 2 weeks)
**Phase 7 successfully transformed WeDefiDaily from a passive portfolio tracker into an intelligent DeFi assistant with proactive opportunity detection.**

**✅ Completed Deliverables:**
- **Opportunity Detection Engine**: Modular architecture with extensible opportunity types
- **Smart UI Dashboard**: Real-time polling, responsive cards, risk scoring, confidence metrics
- **API Infrastructure**: RESTful endpoints with proper validation and error handling
- **UX Excellence**: Playwright-tested interface with loading states and error handling
- **Demo Data**: Realistic yield opportunities showcasing $2,150 potential gains

**Key Features Delivered:**
- 🌱 **New Yield Opportunities**: Cross-protocol pool recommendations with APY analysis
- 🔄 **Migration Opportunities**: Protocol switching with gas-optimized ROI calculations
- 🎁 **Claim Optimization**: Reward claiming with profitability analysis
- 📊 **Risk Assessment**: 0-100 scoring with color-coded safety indicators
- 🎯 **Confidence Scoring**: Data quality metrics for informed decision making

### Phase 7b – Real Data Integration (🔄 In Progress - 3-4 weeks)
**Build on the solid foundation to connect live protocol data and production-ready analytics.**

**Priority 1 – Live Protocol APIs** (✅ Aerodrome Complete, 1 week remaining)
- **Real-time Pool Data Integration** (✅ Aerodrome Complete)
  - ✅ Aerodrome Sugar contract integration with live APY/TVL data
  - ✅ Rate limiting and caching strategies implemented (5-minute cache TTL)
  - ✅ Protocol health monitoring and graceful fallback to demo data
  - ✅ Production-ready architecture with ethers.js integration
  - 🔄 Extend to Uniswap V3 and Morpho protocols

- **Gas Oracle Integration** (✅ Complete)
  - ✅ Multi-tier fallback gas oracle (Blocknative → Gas Network Oracle → Provider)
  - ✅ Gas-optimized reward claiming with profitability analysis
  - ✅ Multi-protocol claim batching for maximum efficiency
  - ✅ Reward value vs gas cost analysis with timing recommendations
  - ✅ Real-time gas price estimation with USD conversion
  - ✅ Circuit breaker pattern for API reliability
  - ✅ Integrated with opportunity detection engine

- **Governance Value Optimization** (Medium Priority)
  - Vote bribe ROI analysis vs lock duration requirements
  - Governance token utility scoring across protocols
  - Lock expiration scheduling with re-lock recommendations
  - Voting power optimization strategies

**Priority 2 – Enhanced Risk Intelligence** (1-2 weeks)
- **Portfolio Risk Scoring** (High Priority)
  - Real-time concentration risk alerts (protocol/token exposure)
  - Correlation-based position risk assessment
  - Liquidation risk early warning for Gammaswap positions
  - Risk-adjusted return recommendations

- **Market Risk Analysis** (Medium Priority)
  - Impermanent loss trend prediction for LP positions
  - Protocol health monitoring (TVL trends, governance activity)
  - Cross-position correlation analysis for portfolio optimization
  - Volatility-based position sizing recommendations

**Priority 3 – Executive Intelligence Dashboard** (1 week)
- **Opportunity Summary View** (Medium Priority)
  - Prioritized action items by value and urgency
  - One-click opportunity execution with gas estimates
  - Risk vs reward scoring for all recommendations
  - Historical opportunity tracking and performance analysis

**Success Metrics:**
- Users can identify yield opportunities automatically without manual research
- Portfolio risk is continuously monitored with proactive alerts
- Action recommendations provide clear value propositions with ROI calculations
- Intelligence features drive measurable portfolio performance improvements

**Technical Approach:**
- Build on existing analytics infrastructure and API endpoints
- Implement intelligent background services for continuous market scanning
- Maintain real-time data pipelines for opportunity detection accuracy
- Design modular intelligence services for easy feature expansion

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
