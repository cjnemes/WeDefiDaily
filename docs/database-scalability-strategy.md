# WeDefiDaily Database Scalability Strategy

## Current Bottlenecks Analysis

### 1. Time-Series Data Growth
- **PriceSnapshot:** ~50,000 records/day (500 tokens × 100 updates/day)
- **PortfolioSnapshot:** ~288 records/day/wallet (every 5 minutes)
- **PositionSnapshot:** Exponential growth with tracked positions

### 2. Query Performance Issues
- Portfolio aggregation requires joins across multiple large tables
- Risk analytics calculations scan historical price data
- Alert processing touches multiple entity types

## Partitioning Strategy

### 1. Time-Based Partitioning
```sql
-- Partition PriceSnapshot by month for optimal time-series queries
CREATE TABLE "PriceSnapshot_template" (
  LIKE "PriceSnapshot" INCLUDING ALL
) PARTITION BY RANGE (recordedAt);

-- Create monthly partitions automatically
CREATE OR REPLACE FUNCTION create_monthly_partitions()
RETURNS void AS $$
DECLARE
  start_date date;
  end_date date;
  partition_name text;
BEGIN
  -- Create partitions for next 6 months
  FOR i IN 0..5 LOOP
    start_date := date_trunc('month', CURRENT_DATE + interval '1 month' * i);
    end_date := start_date + interval '1 month';
    partition_name := 'PriceSnapshot_' || to_char(start_date, 'YYYY_MM');

    EXECUTE format('
      CREATE TABLE IF NOT EXISTS %I PARTITION OF "PriceSnapshot"
      FOR VALUES FROM (%L) TO (%L)
    ', partition_name, start_date, end_date);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Monthly partition creation job
SELECT cron.schedule('create-partitions', '0 0 1 * *', 'SELECT create_monthly_partitions();');
```

### 2. Hash Partitioning for High-Volume Tables
```sql
-- Partition TokenBalance by wallet hash for parallel processing
CREATE TABLE "TokenBalance_template" (
  LIKE "TokenBalance" INCLUDING ALL
) PARTITION BY HASH (walletId);

-- Create 8 hash partitions for balanced distribution
DO $$
BEGIN
  FOR i IN 0..7 LOOP
    EXECUTE format('
      CREATE TABLE "TokenBalance_part_%s" PARTITION OF "TokenBalance"
      FOR VALUES WITH (MODULUS 8, REMAINDER %s)
    ', i, i);
  END LOOP;
END $$;
```

### 3. Portfolio Snapshot Hybrid Partitioning
```sql
-- Combine time and wallet partitioning for optimal query patterns
CREATE TABLE "PortfolioSnapshot_template" (
  LIKE "PortfolioSnapshot" INCLUDING ALL
) PARTITION BY RANGE (capturedAt);

-- Monthly partitions with wallet sub-partitioning
CREATE TABLE "PortfolioSnapshot_2024_01" PARTITION OF "PortfolioSnapshot"
FOR VALUES FROM ('2024-01-01') TO ('2024-02-01')
PARTITION BY HASH (walletId);

-- Sub-partitions for parallel processing
DO $$
BEGIN
  FOR i IN 0..3 LOOP
    EXECUTE format('
      CREATE TABLE "PortfolioSnapshot_2024_01_part_%s"
      PARTITION OF "PortfolioSnapshot_2024_01"
      FOR VALUES WITH (MODULUS 4, REMAINDER %s)
    ', i, i);
  END LOOP;
END $$;
```

## Read Replica Architecture

### 1. Read/Write Separation
```yaml
# Database connection configuration
database:
  primary:
    host: wedefi-primary.cluster.amazonaws.com
    port: 5432
    max_connections: 20
    roles: ["write", "read"]

  read_replicas:
    - host: wedefi-read-1.cluster.amazonaws.com
      port: 5432
      max_connections: 30
      lag_threshold: 50ms
      roles: ["read"]

    - host: wedefi-read-2.cluster.amazonaws.com
      port: 5432
      max_connections: 30
      lag_threshold: 50ms
      roles: ["read", "analytics"]

# Connection routing
routing:
  portfolio_queries: read_replicas
  balance_sync: primary
  alert_processing: primary
  risk_analytics: analytics_replica
  user_dashboard: read_replicas
```

### 2. Application-Level Read Routing
```typescript
// Enhanced Prisma configuration for read/write routing
import { PrismaClient } from '@prisma/client';

export class DatabaseManager {
  private primaryClient: PrismaClient;
  private readReplica: PrismaClient;
  private analyticsReplica: PrismaClient;

  constructor() {
    this.primaryClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL_PRIMARY } }
    });

    this.readReplica = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL_READ } }
    });

    this.analyticsReplica = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL_ANALYTICS } }
    });
  }

  // Portfolio queries route to read replica
  async getPortfolioSummary(walletId?: string) {
    return this.readReplica.wallet.findMany({
      where: { id: walletId },
      include: {
        balances: {
          include: { token: true },
          where: { usdValue: { gt: 0 } }
        }
      }
    });
  }

  // Analytics queries route to dedicated replica
  async calculateRiskMetrics(timeframe: string) {
    return this.analyticsReplica.assetCorrelation.findMany({
      where: { timeframe, computedAt: { gte: new Date(Date.now() - 86400000) } }
    });
  }

  // Write operations route to primary
  async updateTokenBalance(balanceData: any) {
    return this.primaryClient.tokenBalance.upsert({
      where: { walletId_tokenId: { walletId: balanceData.walletId, tokenId: balanceData.tokenId } },
      update: balanceData,
      create: balanceData
    });
  }
}
```

## Caching Strategy

### 1. Redis Caching Layer
```typescript
// Multi-tier caching for frequently accessed data
export class CacheManager {
  private redis: Redis;

  // Portfolio summary cache (TTL: 5 minutes)
  async getPortfolioSummary(walletId: string): Promise<any> {
    const cacheKey = `portfolio:${walletId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const summary = await this.dbManager.getPortfolioSummary(walletId);
    await this.redis.setex(cacheKey, 300, JSON.stringify(summary));
    return summary;
  }

  // Price data cache (TTL: 1 minute)
  async getLatestPrice(tokenId: string): Promise<number> {
    const cacheKey = `price:latest:${tokenId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return parseFloat(cached);
    }

    const price = await this.dbManager.getLatestPrice(tokenId);
    await this.redis.setex(cacheKey, 60, price.toString());
    return price;
  }

  // Governance data cache (TTL: 30 minutes)
  async getGovernanceLocks(walletId: string): Promise<any> {
    const cacheKey = `governance:${walletId}`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const locks = await this.dbManager.getGovernanceLocks(walletId);
    await this.redis.setex(cacheKey, 1800, JSON.stringify(locks));
    return locks;
  }
}
```

### 2. Application-Level Query Optimization
```typescript
// Optimized portfolio aggregation with batching
export class OptimizedPortfolioService {

  // Batch token balance queries to reduce N+1 issues
  async getBatchedPortfolioData(walletIds: string[]) {
    // Single query for all wallet balances
    const balances = await prisma.tokenBalance.findMany({
      where: { walletId: { in: walletIds } },
      include: {
        token: { select: { id: true, symbol: true, name: true, decimals: true } },
        wallet: { select: { id: true, address: true, label: true, chainId: true } }
      },
      orderBy: { usdValue: 'desc' }
    });

    // Group by wallet for efficient processing
    const walletBalances = balances.reduce((acc, balance) => {
      if (!acc[balance.walletId]) {
        acc[balance.walletId] = [];
      }
      acc[balance.walletId].push(balance);
      return acc;
    }, {} as Record<string, any[]>);

    return walletBalances;
  }

  // Paginated portfolio queries for large datasets
  async getPagedPortfolioData(
    page: number = 1,
    limit: number = 50,
    filters?: { minValue?: number; walletId?: string }
  ) {
    const offset = (page - 1) * limit;

    // Count query for pagination metadata
    const totalCount = await prisma.wallet.count({
      where: {
        id: filters?.walletId,
        balances: filters?.minValue
          ? { some: { usdValue: { gte: filters.minValue } } }
          : undefined
      }
    });

    // Data query with efficient joins
    const wallets = await prisma.wallet.findMany({
      where: {
        id: filters?.walletId,
        balances: filters?.minValue
          ? { some: { usdValue: { gte: filters.minValue } } }
          : undefined
      },
      include: {
        balances: {
          where: { usdValue: { gt: 0 } },
          include: { token: true },
          orderBy: { usdValue: 'desc' },
          take: 20  // Limit top holdings per wallet
        },
        _count: { select: { balances: true } }
      },
      orderBy: { createdAt: 'asc' },
      skip: offset,
      take: limit
    });

    return {
      data: wallets,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    };
  }
}
```

## Data Archival Strategy

### 1. Hot/Warm/Cold Storage Tiers
```sql
-- Automated data tiering based on access patterns

-- Hot storage: Last 30 days (frequent access)
-- Primary database with full indexing

-- Warm storage: 30 days - 1 year (occasional access)
-- Compressed tables with reduced indexing
CREATE TABLE "PriceSnapshot_warm" (
  LIKE "PriceSnapshot" INCLUDING DEFAULTS
) WITH (compression = 'pglz');

-- Cold storage: > 1 year (archive access)
-- External storage (S3/Glacier) with metadata only
CREATE TABLE "PriceSnapshot_archive_metadata" (
  month_year VARCHAR(7) PRIMARY KEY,
  record_count BIGINT,
  file_path TEXT,
  compressed_size BIGINT,
  archived_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Automated Archival Process
```bash
#!/bin/bash
# Monthly archival process for old data

ARCHIVE_DATE=$(date -d "1 year ago" +%Y-%m-%d)

# 1. Export old data to S3
pg_dump \
  --table="PriceSnapshot" \
  --where="recordedAt < '$ARCHIVE_DATE'" \
  --format=custom \
  --compress=9 \
  wedefi | aws s3 cp - s3://wedefi-archive/price-snapshots/$(date +%Y-%m).backup

# 2. Verify archive integrity
aws s3api head-object --bucket wedefi-archive --key price-snapshots/$(date +%Y-%m).backup

# 3. Delete archived data from primary database
psql wedefi -c "DELETE FROM \"PriceSnapshot\" WHERE recordedAt < '$ARCHIVE_DATE';"

# 4. Update metadata
psql wedefi -c "
INSERT INTO \"PriceSnapshot_archive_metadata\" (month_year, record_count, file_path)
SELECT
  to_char('$ARCHIVE_DATE'::date, 'YYYY-MM'),
  (SELECT COUNT(*) FROM \"PriceSnapshot\" WHERE recordedAt < '$ARCHIVE_DATE'),
  's3://wedefi-archive/price-snapshots/$(date +%Y-%m).backup'
;"
```

## Performance Monitoring

### 1. Query Performance Metrics
```sql
-- Monitor slow queries and optimization opportunities
SELECT
  query,
  calls,
  total_time,
  mean_time,
  rows,
  100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
WHERE mean_time > 100  -- Queries taking >100ms on average
ORDER BY mean_time DESC
LIMIT 20;

-- Index utilization analysis
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;
```

### 2. Automated Performance Alerting
```yaml
# Performance monitoring alerts
alerts:
  - name: SlowQueryDetected
    condition: query_duration > 5000ms
    action: log_and_alert

  - name: HighConnectionCount
    condition: active_connections > 80
    action: scale_read_replicas

  - name: IndexScanEfficiency
    condition: index_hit_ratio < 95%
    action: analyze_missing_indexes

  - name: ReplicationLag
    condition: replica_lag > 1000ms
    action: investigate_replication
```

This scalability strategy addresses the major growth challenges while maintaining performance and data integrity for production deployment.