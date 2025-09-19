# WeDefiDaily Project Vision

## Background
You actively manage positions across multiple decentralized finance (DeFi) protocols, primarily on Base but also on Binance Smart Chain and Ethereum-adjacent ecosystems. The portfolio spans vote-escrow (ve) governance positions such as veAERO and veTHE, staked liquidity and lending positions (e.g., Gammaswap), and active trading holdings. Fragmented tooling and manual workflows make it difficult to maintain an accurate view of performance, make timely decisions on votes and incentives, and identify high-leverage opportunities.

## Mission Statement
Deliver a personal command center that consolidates on-chain positions, off-chain analytics, and protocol-specific workflows into a single daily-use application. The tool should make it effortless to track portfolio health, manage ve incentives, evaluate yield opportunities, and execute trades with confidence across supported chains.

## Guiding Principles
1. **Actionable over informational** – surface next steps (e.g., claim, restake, revote) alongside data so every session results in clear actions.
2. **Protocol-aware** – implement protocol-specific logic (Aerodrome, Gammaswap, etc.) rather than generic portfolio metrics, enabling bespoke insights.
3. **Automation-ready** – design data models and integrations to support future automation (e.g., scheduled claims, incentive bribes) while starting with manual confirmations.
4. **Trust through transparency** – log data provenance, refresh timestamps, and calculation methodology to build confidence in decisions driven by the tool.
5. **Composable architecture** – modular services allow incremental addition of chains, protocols, or analytics without rewrites.

## Success Metrics (Initial)
- Daily active usage: You launch the tool at least once per trading day.
- Decision efficiency: Reduce time to evaluate ve vote allocations from ~30 minutes to under 10.
- Coverage: Support 90%+ of staked positions (by USD value) with accurate balances and APRs.
- Alert fidelity: Less than 5% false positives/negatives on actionable alerts (claims, unlocks, governance deadlines).

## Scope Boundaries (MVP)
- Chains: Base (primary), Binance Smart Chain (for veTHE), and limited Ethereum Mainnet data where required for protocol context.
- Protocols: Aerodrome Finance (veAERO, gauges, bribes), Gammaswap positions, general asset holdings for trading allocations, and veTHE on BSC.
- Features: Portfolio overview, reward/claim tracker, vote management dashboard, watchlist for target assets, and alerting for key events.

## Out of Scope (for MVP)
- Automated transaction execution (auto-claiming, auto-voting).
- Generalized support for arbitrary wallets beyond your primary addresses.
- Advanced quant analytics (e.g., on-chain factor models) beyond curated metrics.
- Mobile/native clients (focus on web dashboard or CLI).

## Assumptions
- Wallet private keys are managed externally; the tool only handles signing requests via existing wallets (e.g., WalletConnect, hardware wallet integration later).
- API subscriptions (CoinMarketCap, Alchemy, CoinGecko, Etherscan) remain active with sufficient rate limits.
- Historical transaction data required for analytics can be fetched within API limits or via cached storage.

## Risks & Mitigations
- **API rate limiting** – implement caching layers and staggered refresh jobs; prioritize Alchemy for RPC-heavy tasks.
- **Protocol contract churn** – maintain configuration files for contract addresses, upgradeable via environment variables.
- **Security posture** – treat secrets carefully, adopt least-privilege API keys, and isolate signing from backend services.
- **Data integrity** – cross-verify critical metrics using multiple data sources when possible (e.g., compare CMC vs CoinGecko prices).

## Long-Term Vision
Evolve from a monitoring dashboard into an intelligent DeFi copilot that recommends optimal incentive allocations, automates periodic tasks, and simulates strategy adjustments. Introduce playbooks for new protocols as you expand your footprint, with a plug-in architecture for analytics modules and connectors.
