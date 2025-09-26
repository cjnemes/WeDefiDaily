# Requirements & User Stories

## Primary Persona
- **DeFi Power User (You)** – manages multi-chain positions, regularly participates in governance votes, and seeks to optimize yields while maintaining a clear view of liquidity and risk.

## Wallet & Protocol Coverage
- Core wallets: primary Base address, secondary trading wallets, BSC wallet for veTHE.
- Protocols prioritized for day-one: Aerodrome (ve, gauges, incentives), Gammaswap (LP, lending), general ERC-20 holdings, BSC veTHE staking contract.

## Functional Requirements
1. **Portfolio Snapshot**
   - ✅ Aggregate balances per chain and protocol with USD valuations.
   - ✅ Break down holdings by type: liquid assets, locked ve positions, staked LPs, pending rewards.
   - ❌ Display performance deltas (24h/7d) using market data from CoinMarketCap/CoinGecko.

2. **Reward & Claim Tracker**
   - ✅ Detect unclaimed rewards for Aerodrome gauges, Gammaswap emissions, and other supported farms.
   - ✅ Show claimable amount, estimated USD value, and gas cost estimate per chain (Etherscan/Alchemy data).
   - ✅ Provide reminders for claim deadlines or epochs.

3. **Vote Escrow Management**
   - ✅ Visualize current veAERO and veTHE positions (lock amount, unlock date, voting power).
   - ✅ Pull current gauge/bribe data and show ROI comparisons to guide vote allocations.
   - ✅ Track upcoming governance votes or bribe deadlines and allow exporting a recommended voting plan.

4. **Trading Outlook**
   - ✅ Maintain a watchlist of target tokens, pulling price, volume, and volatility metrics.
   - ❌ Surface liquidity insights (e.g., top pools on Aerodrome) and show your positions relative to pool totals.
   - ✅ Integrate basic risk alerts (large price swings, pool imbalance, funding changes where available).

5. **Alerting Layer**
   - ✅ Support configurable alerts (e.g., Telegram, email, CLI notifications) for claims due, unlock windows, and price thresholds.
   - ✅ Maintain audit logs to review alert triggers and acknowledgements.

6. **Reporting**
   - ✅ Generate a daily digest summarizing portfolio value, pending actions, and new opportunities.
   - ✅ Allow export to Markdown/CSV for record keeping.

## Non-Functional Requirements
- **Performance**: Primary dashboard loads within 3 seconds with cached data; real-time refreshes complete within API rate limits.
- **Reliability**: Handle API outages gracefully using cached data and fallback providers.
- **Security**: Secrets stored outside repo; enforce read-only operations by default with explicit confirmation for transactions.
- **Extensibility**: New protocol connectors should be addable through a configuration-driven approach without core rewrites.
- **Observability**: Instrument metrics for API calls, data staleness, and job success/failure.

## User Stories
1. *As a* Base LP *I want* to see my Aerodrome LP balances and pending bribes *so that* I can decide whether to harvest or adjust positions.
2. *As a* veAERO voter *I want* ranked bribe ROI recommendations *so that* I can allocate votes to maximize returns before epoch deadlines.
3. *As a* Gammaswap participant *I want* to track borrow/lend rates and utilization *so that* I can rebalance before liquidation risks.*
4. *As a* multi-chain trader *I want* a consolidated P&L dashboard *so that* I can assess overall exposure without logging into multiple explorers.
5. *As a* governance participant *I want* reminders for veTHE vote windows *so that* I never miss high-value incentives.
6. *As a* busy professional *I want* a morning digest summarizing claims, votes, and market moves *so that* I can act quickly.
7. *As a* data-driven investor *I want* to backtest APR trends for Aerodrome gauges *so that* I can anticipate future returns.
8. *As a* security-conscious user *I want* to review all read/write operations *so that* I can trust the system when connecting wallets.

## Acceptance Criteria (Illustrative)
- Portfolio view shows balances from all configured wallets with <5% discrepancy versus on-chain explorers.
- Claim tracker flags rewards at least 12 hours before epoch end.
- Vote dashboard updates bribe data within 15 minutes of snapshots published.
- Daily digest delivered by 8am local time.

## Open Questions
- Preferred UI modality (web dashboard vs. CLI vs. hybrid)?
- Notification channel priority (Telegram bot, email, push)?
- How to integrate private alpha signals or manual strategy notes?
- Do you require multi-user support in the future?
