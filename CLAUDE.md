# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

WeDefiDaily is a personal DeFi command center focused on Base-native incentives, ve-token governance, and multi-chain portfolio tracking. It's a TypeScript monorepo with:
- `apps/api` - Fastify-based API gateway with Prisma ORM
- `apps/web` - Next.js frontend with Tailwind CSS v4
- `docs/` - Project documentation and runbooks

**IMPORTANT POLICY: NO EXTERNAL INTEGRATIONS**
- NO third-party chat or messaging platform integrations
- NO Email delivery services or SMTP configurations
- NO external notification services beyond console/logs
- Focus on local/web-based interfaces only

## UX-First Development Principles

**Current Priority: Phase 6 UX Foundation** - The project has solid technical infrastructure but critical usability barriers that prevent mainstream adoption. All development should prioritize user experience improvements.

### Phase 6 Progress Status
- **Issue #53 (Wallet Management UI)**: ✅ **COMPLETED** - Users can now add/edit/delete wallets via web interface instead of curl commands
- **Issue #55 (Loading States)**: ✅ **COMPLETED** - Universal loading states and toast notifications provide clear user feedback
- **Issue #54 (Token Filtering)**: ✅ **COMPLETED** - Smart spam detection with three filtering modes (Valuable/$1+, Hide Spam, Show All)
- **Issue #56 (In-App Sync)**: 📝 **FINAL MILESTONE** - Eliminate CLI dependencies for data sync operations

### Core UX Principles
1. **Web UI First** - Prioritize web interface over command-line operations
   - New features should have web UI from day one
   - Preserve CLI access for power users, but web UI is primary interface
   - Never require command-line access for basic application usage

2. **Loading States & Feedback** - Every user action must provide clear feedback
   - Loading indicators for all async operations
   - Success/error notifications via toast system
   - Progress tracking for long-running operations
   - Prevent double-submissions with loading states

3. **Clean Data Display** - Filter noise, show meaningful information
   - Default to "valuable tokens only" views (>$1 USD threshold)
   - Implement spam token detection and filtering
   - Provide clear, actionable portfolio summaries
   - Hide technical details unless explicitly requested

4. **Progressive Enhancement** - Layer UX improvements over existing tech
   - Keep all existing API endpoints and data pipelines
   - Add UI layers that wrap existing functionality
   - Maintain backward compatibility for CLI operations
   - Build incrementally without breaking existing features

### Critical UX Issues (Identified via Playwright Testing)
- **Wallet Management**: No UI for adding wallets, only curl commands (Issue #53)
- **Token Spam**: 90+ tokens per wallet including obvious scams (Issue #54)
- **No Feedback**: Silent buttons, no loading states or notifications (Issue #55)
- **CLI Dependencies**: All data sync requires command-line access (Issue #56)

### Implementation Guidelines
- **Test with Real Users**: Use Playwright for comprehensive UX testing
- **Measure Success**: Track user completion rates, not just technical metrics
- **Default to Usable**: New features should work for non-technical users by default
- **Error Handling**: Graceful failures with clear next steps for users

## Development Commands

### Setup & Database
```bash
npm install                    # Install all dependencies
docker compose up -d postgres  # Start PostgreSQL
npm run db:push               # Push Prisma schema to database
npm run db:generate           # Generate Prisma client
npm run db:studio            # Open Prisma Studio
```

### Development
```bash
npm run dev:api              # Start API server (port 4000)
npm run dev:web              # Start web server (port 3000)
npm run dev:all              # Start both API and web servers concurrently
npm run build                # Build both workspaces
```

### Quality Checks
```bash
npm run lint                 # Lint both workspaces
npm run typecheck           # TypeScript type checking
npm run db:validate         # Validate Prisma schema
```

### Data Sync Jobs
```bash
npm run sync:balances           # Sync wallet balances via Alchemy + CoinGecko
npm run sync:governance         # Sync Aerodrome/Thena vote escrow data
npm run sync:rewards            # Sync claimable rewards across protocols
npm run sync:gammaswap          # Sync Gammaswap positions and risk metrics
npm run sync:performance        # Capture portfolio snapshots and historical prices
npm run calculate:performance   # Calculate and store performance metrics
npm run calculate:risk-analytics # Calculate correlation matrix, exposure, and volatility metrics
npm run process:alerts          # Process alerts based on synced data
npm run generate:digest         # Generate daily digest (Markdown + CSV)
npm run check:price-thresholds  # Check price thresholds and generate alerts
```

### Testing
```bash
npm run test --workspace @wedefidaily/api      # Run API tests with Vitest
npm run test:run --workspace @wedefidaily/api  # Run tests once
```

## Architecture

### Core Modules
1. **Portfolio Engine** (`apps/api/src/services/`) - Aggregates wallet balances and positions across chains
2. **Performance Analytics** (`apps/api/src/services/performance.ts`) - P&L tracking, performance metrics, and portfolio analytics
3. **Risk Analytics** (`apps/api/src/services/risk-analytics.ts`) - Correlation analysis, protocol exposure monitoring, volatility tracking, and VaR calculations
4. **Vote Analytics** - Aerodrome/veTHE governance integration for bribe optimization
5. **Rewards Tracker** - Multi-protocol reward opportunity tracking with gas efficiency
6. **Alert Dispatcher** - Converts triggers into notifications
7. **Gammaswap Integration** - LP/borrow position risk analytics
8. **Intelligence Alerts** (`apps/api/src/services/intelligence-alerts.ts`) - Smart insights generation based on historical data
9. **Digest Service** (`apps/api/src/services/digest.ts`) - Daily digest generation with multiple output formats

### Data Flow
- Sync jobs ingest data via external APIs (Alchemy, CoinGecko, protocol APIs)
- Prisma ORM persists normalized data to PostgreSQL
- Fastify API exposes endpoints for frontend consumption
- Alert processing evaluates conditions and logs notifications
- Intelligence service analyzes snapshots for trends and generates contextual alerts

### Key Services
- **Alchemy Service** (`apps/api/src/services/alchemy.ts`) - On-chain balance fetching
- **CoinGecko Service** (`apps/api/src/services/coingecko.ts`) - Price data enrichment
- **Performance Service** (`apps/api/src/services/performance.ts`) - P&L calculations and metrics
- **Risk Analytics Service** (`apps/api/src/services/risk-analytics.ts`) - Portfolio correlation, exposure analysis, and volatility tracking
- **Governance Service** (`apps/api/src/services/governance.ts`) - ve-token analytics
- **Rewards Service** (`apps/api/src/services/rewards.ts`) - Cross-protocol reward aggregation
- **Gammaswap Service** (`apps/api/src/services/gammaswap.ts`) - Position risk assessment
- **Alert Delivery** (`apps/api/src/services/alert-delivery.ts`) - Alert lifecycle management
- **Intelligence Alerts** (`apps/api/src/services/intelligence-alerts.ts`) - Trend analysis and smart alerts

## API Endpoints

- `GET /health` - Service health check with database connectivity
- `GET /v1/wallets` - List tracked wallets with pagination
- `POST /v1/wallets` - Create/update wallet entries
- `GET /v1/portfolio` - Aggregate portfolio balances and USD values
- `GET /v1/governance` - Governance locks and bribe leaderboard
- `GET /v1/rewards` - Claimable rewards with gas-adjusted profitability
- `GET /v1/gammaswap` - LP/borrow positions with health ratios
- `GET /v1/alerts` - Generated alerts with filtering by status/type/severity
- `GET /v1/price-thresholds` - Price monitoring thresholds for automated alerts
- `GET /v1/performance/metrics` - Portfolio performance metrics (Sharpe ratio, max drawdown, volatility)
- `GET /v1/performance/history` - Historical portfolio values for charting
- `GET /v1/performance/price-changes` - Token price changes over time
- `GET /v1/performance/snapshots` - Detailed portfolio snapshots with position breakdowns
- `GET /v1/risk-analytics/correlation-matrix` - Cross-position correlation analysis
- `GET /v1/risk-analytics/protocol-exposure` - Protocol concentration risk metrics
- `GET /v1/risk-analytics/volatility` - Historical volatility tracking and analysis
- `GET /v1/risk-analytics/dashboard` - Comprehensive risk analytics overview
- `GET /v1/digests` - List generated digests with content
- `GET /v1/liquidity/wallets/:walletId` - Liquidity metrics and pool analysis for wallet
- `POST /v1/liquidity/slippage` - Slippage estimates for trades
- `GET /v1/liquidity/wallets/:walletId/impermanent-loss` - IL analysis for LP positions
- `GET /v1/liquidity/gammaswap/utilization` - Gammaswap pool utilization and risk metrics
- `GET /v1/liquidity/pools/top` - Top liquidity pools ranked by TVL/APY/volume

## Project Management

- Follow `docs/project-management.md` for issue templates and PR checklists
- Use roadmap deliverable issue template for all roadmap items
- Branch naming: `feature/<roadmap-id>/<description>`
- Update `docs/roadmap-issue-tracker.md` when opening/closing issues
- Include evidence (logs, screenshots) in PRs and link back to issues

## Environment Setup

Copy `.env.example` to `.env` and configure:
- Database connection for PostgreSQL
- API keys for Alchemy, CoinGecko, protocol integrations
- Without API keys, jobs will use mock data for development

## Testing Strategy

- Unit tests with Vitest for service modules
- Mock services available (e.g., `gammaswap-mock.ts`) for testing without API dependencies
- Integration tests validate full data sync workflows
- CI runs lint, typecheck, and Prisma validation on all PRs
