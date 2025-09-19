# Architecture Overview

## System Context
- **Client Interface**: Likely React/Next.js web app or modern CLI dashboard. Consumes backend APIs for data and triggers transactions via wallet connections.
- **Backend Services**: Node.js or Python service layer orchestrating data ingestion, analytics, and alerting.
- **Data Layer**: PostgreSQL (managed via Prisma ORM) for wallet metadata, protocol registry, historical time series, and alert logs.
- **Job Orchestration**: Scheduler (e.g., Temporal, BullMQ) executing periodic sync jobs, digest generation, and notification dispatch.

```
+-------------+       +----------------+       +-----------------+
|   Client    | <---> |  API Gateway   | <---> | Service Modules |
+-------------+       +----------------+       +-----------------+
                                         |--> Portfolio Engine
                                         |--> Vote Analytics
                                         |--> Rewards Tracker
                                         |--> Alert Dispatcher
                              +------------------+
                              |  Data Storage    |
                              +------------------+
```

## Key Modules
1. **Portfolio Engine**
   - Aggregates wallet balances, positions, and valuations across chains.
   - Maintains projections (e.g., unlock timelines, APR decay) using historical data.

2. **Vote Analytics**
   - Integrates Aerodrome and veTHE data to rank bribes and recommend allocations.
   - Tracks governance calendars and provides ICS/notification hooks.

3. **Rewards Tracker**
   - Normalizes claimable rewards from multiple protocols.
   - Calculates realized vs. unrealized yield and gas efficiency metrics.

4. **Alert Dispatcher**
   - Converts triggers into notifications via chosen channels.
   - Provides throttling and acknowledgement workflow to avoid spam.

5. **Data Integration Layer**
   - Adapters for each API/provider encapsulating authentication, rate limiting, and normalization.
   - Shared caching layer (Redis) to store hot data and reduce redundant calls.

## Data Flow (High-Level)
1. Scheduler triggers sync job.
2. Integration layer fetches data via Alchemy/Etherscan/CMC APIs.
3. Service modules process and persist normalized datasets.
4. API gateway exposes aggregated views to client; alerts fire based on new data.
5. Client displays dashboards, allows manual refresh, and creates configuration changes (watchlist, thresholds).

## Technology Considerations
- **Backend stack**: TypeScript Fastify services with Prisma ORM for type-safe data access.
- **Front-end**: React/Next.js for dynamic dashboards; Chakra UI or Tailwind for consistent design.
- **State management**: React Query/SWR for client-side caching and background refresh.
- **Infrastructure**: Containerized services (Docker) deployed via Fly.io, Render, or AWS Lightsail for simplicity.
- **Testing**: Utilize integration tests against mock RPC nodes (e.g., Hardhat fork) and snapshot tests for analytics calculations.

## Observability & Operations
- Implement structured logging with correlation IDs per wallet/job.
- Collect metrics (Prometheus or hosted) for API latency, job success, alert counts.
- Set up uptime monitoring for critical endpoints and service health checks.

## Security & Compliance
- Enforce HTTPS, secure headers, and content security policy for front-end.
- Implement role-based access control even if single-user today to future-proof multi-user support.
- Validate and sanitize all user-configurable inputs (watchlists, thresholds) to prevent injection attacks.
- Plan for hardware wallet support via WalletConnect to avoid private key custody.

## Deployment Strategy
- Start with single-environment (dev) deployment; incorporate staging once automation is introduced.
- Use Infrastructure-as-Code (Terraform or Pulumi) for reproducible environments.
- Automate backups for database and configuration stores.
