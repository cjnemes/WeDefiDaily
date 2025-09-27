# WeDefiDaily Database Migration Strategy

## Overview
Transition from development `db push` to production-ready migration system with zero-downtime deployments and data integrity guarantees.

## Migration System Setup

### 1. Initialize Migration System
```bash
# Generate initial migration from current schema
npm run prisma:migrate:dev --name init_production_schema

# This creates the baseline migration in prisma/migrations/
```

### 2. Production Deployment Process

#### Pre-Migration Checklist
- [ ] Database backup completed
- [ ] Migration tested on staging environment identical to production
- [ ] Rollback plan documented and tested
- [ ] Maintenance window scheduled (if required)
- [ ] Monitor dashboard configured for migration metrics

#### Migration Execution
```bash
# Production migration (atomic, transactional)
npm run prisma:migrate:deploy

# Verify migration success
npm run prisma:migrate:status
```

### 3. Zero-Downtime Migration Patterns

#### Schema Changes
- **Add columns:** Always nullable initially, backfill data, then make required if needed
- **Remove columns:** Deprecate first, stop using in code, then remove in subsequent release
- **Rename columns:** Use shadow/alias pattern with gradual migration

#### Index Management
```sql
-- Safe index creation (won't block writes)
CREATE INDEX CONCURRENTLY idx_new_index ON table_name (column);

-- Index replacement pattern
BEGIN;
DROP INDEX IF EXISTS idx_old_index;
ALTER INDEX idx_new_index RENAME TO idx_old_index;
COMMIT;
```

### 4. Data Integrity Constraints

#### Critical Constraints
```sql
-- Wallet address validation
ALTER TABLE "Wallet" ADD CONSTRAINT wallet_address_format
CHECK (address ~ '^0x[a-fA-F0-9]{40}$');

-- USD value non-negative
ALTER TABLE "TokenBalance" ADD CONSTRAINT balance_usd_non_negative
CHECK (usdValue >= 0);

-- Health ratio bounds for liquidation safety
ALTER TABLE "GammaswapPosition" ADD CONSTRAINT health_ratio_bounds
CHECK (healthRatio IS NULL OR healthRatio >= 0);

-- Governance lock future dates only
ALTER TABLE "GovernanceLock" ADD CONSTRAINT lock_ends_future
CHECK (lockEndsAt IS NULL OR lockEndsAt > createdAt);

-- Price snapshot positive values
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT price_positive
CHECK (priceUsd > 0);
```

#### Foreign Key Cascade Behavior Review
```sql
-- Critical: Review all CASCADE deletes for data protection
-- Current schema has aggressive cascades that may need adjustment for production

-- Example: Wallet deletion cascades to all related data
-- Consider RESTRICT for wallets with significant transaction history
ALTER TABLE "TokenBalance"
DROP CONSTRAINT "TokenBalance_walletId_fkey",
ADD CONSTRAINT "TokenBalance_walletId_fkey"
FOREIGN KEY (walletId) REFERENCES "Wallet"(id) ON DELETE RESTRICT;
```

### 5. Migration Testing Framework

#### Pre-Production Testing
```sql
-- Create migration validation queries
-- Test data integrity before/after migration

-- Portfolio totals consistency check
SELECT
  w.id,
  w.address,
  COUNT(tb.id) as balance_count,
  COALESCE(SUM(tb.usdValue), 0) as total_usd
FROM "Wallet" w
LEFT JOIN "TokenBalance" tb ON w.id = tb.walletId
GROUP BY w.id, w.address
HAVING COUNT(tb.id) > 0;

-- Governance lock consistency
SELECT
  gl.id,
  gl.lockAmount,
  gl.votingPower,
  CASE
    WHEN gl.lockEndsAt < NOW() THEN 'EXPIRED'
    WHEN gl.lockEndsAt < NOW() + INTERVAL '7 days' THEN 'EXPIRING_SOON'
    ELSE 'ACTIVE'
  END as status
FROM "GovernanceLock" gl;

-- Alert data integrity
SELECT
  status,
  COUNT(*) as count,
  MIN(triggerAt) as oldest_trigger,
  MAX(triggerAt) as newest_trigger
FROM "Alert"
GROUP BY status;
```

### 6. Rollback Procedures

#### Database Rollback
```bash
# Immediate rollback if migration fails
npm run prisma:migrate:resolve --rolled-back <migration_name>

# Application rollback coordination
# 1. Deploy previous application version
# 2. Verify database compatibility
# 3. Monitor for data consistency issues
```

#### Point-in-Time Recovery
```sql
-- PostgreSQL PITR setup for production
-- Configure WAL archiving and base backups
-- Document recovery procedures with RTO/RPO targets
```

### 7. Migration Monitoring

#### Key Metrics During Migration
- Table lock duration
- Query performance before/after
- Connection pool utilization
- Error rates and slow query logs
- Disk space utilization

#### Post-Migration Validation
```sql
-- Performance regression detection
EXPLAIN (ANALYZE, BUFFERS)
SELECT w.id, w.address, SUM(tb.usdValue) as total
FROM "Wallet" w
JOIN "TokenBalance" tb ON w.id = tb.walletId
WHERE tb.usdValue > 0
GROUP BY w.id, w.address
ORDER BY total DESC;

-- Index usage verification
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan < 10  -- Identify unused indexes
ORDER BY idx_scan;
```

## Emergency Procedures

### Critical Data Loss Prevention
1. **Automated backups** before every migration
2. **Transaction isolation** for multi-step migrations
3. **Rollback triggers** for data validation failures
4. **Communication plan** for stakeholder updates during issues

### Migration Failure Response
1. **Immediate assessment** of data integrity
2. **Service degradation** vs full rollback decision
3. **Stakeholder notification** with timeline estimates
4. **Post-incident review** and process improvement