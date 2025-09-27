-- WeDefiDaily Production Database Indexes
-- Apply these indexes BEFORE production deployment for optimal performance

-- =============================================================================
-- PORTFOLIO & BALANCE OPTIMIZATION
-- =============================================================================

-- Optimize portfolio aggregation queries (most frequent operation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_balance_wallet_usd_composite
ON "TokenBalance" (walletId, usdValue DESC NULLS LAST, fetchedAt DESC)
WHERE usdValue > 0;

-- Optimize token price lookups for portfolio valuation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_snapshot_latest_by_token
ON "PriceSnapshot" (tokenId, recordedAt DESC, priceUsd);

-- Portfolio snapshot time-series performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_portfolio_snapshot_time_series
ON "PortfolioSnapshot" (walletId, capturedAt DESC, totalUsdValue DESC);

-- Position snapshot aggregation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_position_snapshot_portfolio_token
ON "PositionSnapshot" (portfolioSnapshotId, tokenId, usdValue DESC);

-- =============================================================================
-- GOVERNANCE & REWARDS OPTIMIZATION
-- =============================================================================

-- Governance lock expiry monitoring (critical for alerts)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_governance_lock_expiry_active
ON "GovernanceLock" (lockEndsAt ASC, protocolId)
WHERE lockEndsAt IS NOT NULL AND lockEndsAt > NOW();

-- Reward opportunity ranking and deadline tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reward_opportunity_actionable
ON "RewardOpportunity" (claimDeadline ASC, usdValue DESC, computedAt DESC)
WHERE claimDeadline IS NOT NULL AND usdValue > 0;

-- Vote epoch active periods
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vote_epoch_active
ON "VoteEpoch" (protocolId, startsAt DESC, endsAt ASC)
WHERE endsAt > NOW();

-- Bribe ROI analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bribe_roi_analysis
ON "Bribe" (epochId, roiPercentage DESC NULLS LAST, rewardValueUsd DESC);

-- =============================================================================
-- RISK ANALYTICS & MONITORING
-- =============================================================================

-- Gammaswap health ratio monitoring (liquidation risk)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gammaswap_health_critical
ON "GammaswapPosition" (healthRatio ASC, lastSyncAt DESC, walletId)
WHERE healthRatio IS NOT NULL AND healthRatio < 1.5;

-- Asset correlation analysis performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_asset_correlation_analysis
ON "AssetCorrelation" (token1Id, token2Id, timeframe, computedAt DESC);

-- Volatility tracking for risk assessment
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_volatility_metric_tracking
ON "VolatilityMetric" (tokenId, timeframe, volatility DESC, computedAt DESC);

-- Protocol exposure monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_protocol_exposure_risk
ON "ProtocolExposure" (walletId, overallRiskScore DESC, totalExposureUsd DESC);

-- Value at Risk calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_value_at_risk_monitoring
ON "ValueAtRisk" (walletId, timeframe, confidenceLevel, varPercentage DESC);

-- =============================================================================
-- ALERT & NOTIFICATION SYSTEM
-- =============================================================================

-- Alert processing queue optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alert_processing_queue
ON "Alert" (status, triggerAt ASC, severity DESC)
WHERE status IN ('pending', 'processing');

-- Alert delivery tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alert_delivery_status
ON "AlertDelivery" (channel, success, createdAt DESC);

-- Price threshold monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_price_threshold_active
ON "PriceThreshold" (tokenId, isEnabled, thresholdType, thresholdPrice)
WHERE isEnabled = true;

-- Risk event tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_event_active
ON "RiskEvent" (walletId, isActive, severity DESC, createdAt DESC)
WHERE isActive = true;

-- =============================================================================
-- TIME-SERIES DATA OPTIMIZATION
-- =============================================================================

-- Transaction history analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transaction_wallet_time_type
ON "Transaction" (walletId, occurredAt DESC, transactionType, amount DESC);

-- Performance metrics time-series
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_performance_metric_tracking
ON "PerformanceMetric" (walletId, timeframe, computedAt DESC, totalReturnPercent DESC);

-- Snapshot data retention queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_digest_run_retention
ON "DigestRun" (generatedAt DESC, portfolioTotal DESC);

-- =============================================================================
-- COVERING INDEXES FOR HIGH-FREQUENCY QUERIES
-- =============================================================================

-- Portfolio summary covering index (avoids table lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_balance_portfolio_summary
ON "TokenBalance" (walletId, tokenId, usdValue, quantity, fetchedAt)
WHERE usdValue > 0;

-- Governance summary covering index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_governance_lock_summary
ON "GovernanceLock" (walletId, protocolId, lockAmount, votingPower, lockEndsAt);

-- Reward summary covering index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reward_opportunity_summary
ON "RewardOpportunity" (walletId, protocolId, usdValue, claimDeadline, apr)
WHERE usdValue > 0;