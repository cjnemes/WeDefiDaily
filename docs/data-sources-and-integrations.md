# Data Sources & Integrations

## Wallet & Node Access
- **Alchemy**
  - Use for RPC read access on Base and Ethereum (supports historical state, logs, trace APIs).
  - Consider dedicated app keys per environment (dev, prod) to isolate quota usage.
  - Employ WebSockets for subscription-based updates (new blocks, pending transactions) powering live alerts.
  - `alchemy_getTokenBalances`, `alchemy_getTokenMetadata`, and `eth_getBalance` power the portfolio sync job.

## On-Chain Data APIs
- **Etherscan v2 API**
  - Coverage: Ethereum mainnet, Base (chain ID 8453), Binance Smart Chain (chain ID 56).
  - Endpoints of interest:
    - Account balances (`account/balance`), token holdings (`account/tokennfttx`, `account/tokenbalance`), and transaction history (`account/txlist`).
    - Contract ABI retrieval to validate interfaces (`contract/getabi`).
    - Gas tracker endpoints for gas fee estimates per chain.
  - Usage: complement node queries, faster for historical transaction pulls.

- **CoinMarketCap (paid tier)**
  - High-resolution market data (spot prices, OHLCV, market cap, exchange listings).
  - Use Professional endpoints for historical quotes, global metrics, and price conversions.
  - Maintain local cache keyed by symbol/contract to avoid exceeding rate limits.

- **CoinGecko (free)**
  - Redundant price feed and supplemental data (categories, developer stats, social metrics).
  - Useful for long-tail tokens not covered robustly by CMC.
  - Watch monthly call limits; implement backoff and caching.
  - `simple/token_price/{platform}` and `simple/price` endpoints populate `PriceSnapshot` rows and USD valuations.

## Protocol-Specific Data
- **Aerodrome Finance**
  - Primary sources: Subgraph (The Graph) for gauges, bribes, and vote weights; direct contract calls for vote/lock data.
  - Additional: Community APIs (e.g., Aerodrome analytics endpoints) if rate limits acceptable.
  - Store epoch schedules and gauge metadata in configuration files for quick reference.
  - Locks endpoint (`/locks?address=0x...`) and bribe feed (`/bribes`) populate governance tables.
  - Reward feed endpoints (`/rewards?address=0x...`) power the claim tracker (placeholder until official APIs exposed).

- **Gammaswap**
  - Check for published API/subgraph; fallback to on-chain contract calls via Base RPC.
  - Capture pool metrics (utilization, rates) and per-wallet positions with health ratios.
  - `sync-gammaswap` job stores snapshots for dashboard risk analysis.

- **veTHE (BSC)**
  - Identify official contract addresses (likely via Thena Finance or partner project).
  - Use BscScan (via Etherscan API compatibility) for token balances and lock metadata.
  - Consider direct contract interactions for vote snapshots and rewards.
  - Companion API (`/locks`, `/bribes`) hydrates governance lock and bribe tables alongside Aerodrome.
  - Reward metrics rely on Thena emissions endpoints when available; gas estimates from BscScan.

## Off-Chain Storage & Processing
- Choose a document database (e.g., MongoDB Atlas) or lightweight PostgreSQL instance for caching positions, price history, and alerts.
- Plan for queue or scheduler (e.g., BullMQ/Redis, Temporal) to orchestrate periodic jobs.
- Logging/metrics stack: OpenTelemetry-compatible backend (e.g., Grafana Cloud, Loki, or self-hosted ELK) for tracing data pipeline issues.

## Secrets & Configuration Management
- Store API keys via environment variables managed by `.env` files excluded from version control.
- Optionally adopt a secrets manager (1Password CLI, AWS Secrets Manager) if automation requires rotating keys.
- Maintain configuration modules for:
  - Chain-specific RPC URLs and explorers.
  - Protocol contract addresses and ABIs.
  - Refresh cadence per data source.

## Data Quality Strategy
- Implement source-of-truth hierarchy (e.g., on-chain RPC > subgraph > cached store > external API).
- Schedule reconciliation jobs that compare Etherscan vs. direct RPC results to catch discrepancies.
- Record timestamps and block numbers with every data point for reproducibility.

## Security Considerations
- Enforce read-only API permissions where possible; restrict signing to front-end wallet integrations.
- Rate-limit outbound calls and handle API key rotation gracefully to prevent service disruption.
- Log all credential usage events for auditing.
