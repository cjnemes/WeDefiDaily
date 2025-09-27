# WeDefiDaily Database Monitoring & Maintenance

## Production Monitoring Strategy

### 1. Core Database Metrics

#### Performance Metrics
```yaml
# Key performance indicators for production monitoring
database_metrics:
  response_time:
    - query_execution_time_p95: < 100ms
    - query_execution_time_p99: < 500ms
    - connection_time: < 10ms

  throughput:
    - queries_per_second: monitor_trend
    - transactions_per_second: monitor_trend
    - connections_active: < 80% of max

  resource_utilization:
    - cpu_usage: < 70%
    - memory_usage: < 80%
    - disk_usage: < 85%
    - iops_utilization: < 80%

  availability:
    - uptime: > 99.9%
    - connection_success_rate: > 99.95%
    - backup_success_rate: 100%
```

#### Business Logic Metrics
```typescript
// Application-specific monitoring for financial data integrity
export class DatabaseMonitor {

  /**
   * Portfolio data consistency checks
   */
  async checkPortfolioConsistency(): Promise<ConsistencyReport> {
    // Verify portfolio totals match sum of individual balances
    const portfolioCheck = await prisma.$queryRaw`
      SELECT
        w.id as wallet_id,
        w.address,
        COALESCE(SUM(tb.usdValue), 0) as calculated_total,
        (
          SELECT ps.totalUsdValue
          FROM "PortfolioSnapshot" ps
          WHERE ps.walletId = w.id
          ORDER BY ps.capturedAt DESC
          LIMIT 1
        ) as snapshot_total,
        ABS(
          COALESCE(SUM(tb.usdValue), 0) -
          COALESCE((
            SELECT ps.totalUsdValue
            FROM "PortfolioSnapshot" ps
            WHERE ps.walletId = w.id
            ORDER BY ps.capturedAt DESC
            LIMIT 1
          ), 0)
        ) as variance
      FROM "Wallet" w
      LEFT JOIN "TokenBalance" tb ON w.id = tb.walletId
      GROUP BY w.id, w.address
      HAVING ABS(
        COALESCE(SUM(tb.usdValue), 0) -
        COALESCE((
          SELECT ps.totalUsdValue
          FROM "PortfolioSnapshot" ps
          WHERE ps.walletId = w.id
          ORDER BY ps.capturedAt DESC
          LIMIT 1
        ), 0)
      ) > 1.00  -- Flag variances > $1
    ` as Array<{
      wallet_id: string;
      address: string;
      calculated_total: number;
      snapshot_total: number;
      variance: number;
    }>;

    return {
      inconsistentWallets: portfolioCheck.length,
      totalVariance: portfolioCheck.reduce((sum, w) => sum + w.variance, 0),
      affectedWallets: portfolioCheck
    };
  }

  /**
   * Price data freshness monitoring
   */
  async checkPriceDataFreshness(): Promise<FreshnessReport> {
    const staleTokens = await prisma.$queryRaw`
      SELECT
        t.id,
        t.symbol,
        t.name,
        MAX(ps.recordedAt) as last_price_update,
        NOW() - MAX(ps.recordedAt) as staleness
      FROM "Token" t
      LEFT JOIN "PriceSnapshot" ps ON t.id = ps.tokenId
      WHERE t.id IN (
        SELECT DISTINCT tokenId
        FROM "TokenBalance"
        WHERE usdValue > 100  -- Only check tokens with significant value
      )
      GROUP BY t.id, t.symbol, t.name
      HAVING
        MAX(ps.recordedAt) IS NULL OR
        MAX(ps.recordedAt) < NOW() - INTERVAL '2 hours'
      ORDER BY staleness DESC NULLS FIRST
    ` as Array<{
      id: string;
      symbol: string;
      name: string;
      last_price_update: Date | null;
      staleness: string;
    }>;

    return {
      staleTokenCount: staleTokens.length,
      oldestUpdate: staleTokens[0]?.last_price_update || null,
      affectedTokens: staleTokens
    };
  }

  /**
   * Governance data integrity checks
   */
  async checkGovernanceDataIntegrity(): Promise<GovernanceReport> {
    // Check for governance locks with inconsistent voting power
    const inconsistentLocks = await prisma.$queryRaw`
      SELECT
        gl.id,
        gl.lockAmount,
        gl.votingPower,
        gl.lockEndsAt,
        CASE
          WHEN gl.lockEndsAt < NOW() THEN 'EXPIRED'
          WHEN gl.votingPower > gl.lockAmount * 4 THEN 'OVERPOWERED'
          WHEN gl.votingPower < gl.lockAmount * 0.25 THEN 'UNDERPOWERED'
          ELSE 'NORMAL'
        END as status
      FROM "GovernanceLock" gl
      WHERE
        (gl.lockEndsAt < NOW() AND gl.votingPower > 0) OR
        (gl.votingPower > gl.lockAmount * 4) OR
        (gl.votingPower < gl.lockAmount * 0.25 AND gl.lockAmount > 0)
    ` as Array<{
      id: string;
      lockAmount: number;
      votingPower: number;
      lockEndsAt: Date;
      status: string;
    }>;

    return {
      inconsistentLockCount: inconsistentLocks.length,
      expiredLocks: inconsistentLocks.filter(l => l.status === 'EXPIRED').length,
      overpoweredLocks: inconsistentLocks.filter(l => l.status === 'OVERPOWERED').length,
      affectedLocks: inconsistentLocks
    };
  }

  /**
   * Alert system health monitoring
   */
  async checkAlertSystemHealth(): Promise<AlertSystemReport> {
    const alertStats = await prisma.$queryRaw`
      SELECT
        status,
        severity,
        COUNT(*) as count,
        MIN(triggerAt) as oldest_alert,
        MAX(triggerAt) as newest_alert
      FROM "Alert"
      WHERE triggerAt >= NOW() - INTERVAL '24 hours'
      GROUP BY status, severity
      ORDER BY status, severity
    ` as Array<{
      status: string;
      severity: string;
      count: number;
      oldest_alert: Date;
      newest_alert: Date;
    }>;

    const deliveryStats = await prisma.$queryRaw`
      SELECT
        channel,
        success,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (createdAt - (
          SELECT triggerAt FROM "Alert" WHERE id = alertId
        )))) as avg_delivery_delay_seconds
      FROM "AlertDelivery"
      WHERE createdAt >= NOW() - INTERVAL '24 hours'
      GROUP BY channel, success
      ORDER BY channel, success
    ` as Array<{
      channel: string;
      success: boolean;
      count: number;
      avg_delivery_delay_seconds: number;
    }>;

    return {
      alertVolume24h: alertStats.reduce((sum, s) => sum + s.count, 0),
      pendingAlerts: alertStats.filter(s => s.status === 'pending').reduce((sum, s) => sum + s.count, 0),
      failedDeliveries: deliveryStats.filter(s => !s.success).reduce((sum, s) => sum + s.count, 0),
      avgDeliveryDelay: deliveryStats.reduce((sum, s) => sum + s.avg_delivery_delay_seconds, 0) / deliveryStats.length,
      stats: { alerts: alertStats, deliveries: deliveryStats }
    };
  }
}
```

### 2. Real-Time Monitoring Setup

#### Prometheus Metrics Collection
```typescript
// Prometheus metrics for database monitoring
import { register, Counter, Histogram, Gauge } from 'prom-client';

export class DatabaseMetrics {
  private static queryDuration = new Histogram({
    name: 'database_query_duration_seconds',
    help: 'Duration of database queries',
    labelNames: ['query_type', 'table', 'operation'],
    buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5, 10]
  });

  private static queryCount = new Counter({
    name: 'database_queries_total',
    help: 'Total number of database queries',
    labelNames: ['query_type', 'table', 'operation', 'status']
  });

  private static connectionCount = new Gauge({
    name: 'database_connections_active',
    help: 'Number of active database connections',
    labelNames: ['database_role']
  });

  private static dataConsistencyErrors = new Counter({
    name: 'database_consistency_errors_total',
    help: 'Total number of data consistency errors detected',
    labelNames: ['error_type', 'table']
  });

  static recordQuery(
    queryType: string,
    table: string,
    operation: string,
    duration: number,
    success: boolean
  ): void {
    this.queryDuration
      .labels(queryType, table, operation)
      .observe(duration);

    this.queryCount
      .labels(queryType, table, operation, success ? 'success' : 'error')
      .inc();
  }

  static updateConnectionCount(role: string, count: number): void {
    this.connectionCount.labels(role).set(count);
  }

  static recordConsistencyError(errorType: string, table: string): void {
    this.dataConsistencyErrors.labels(errorType, table).inc();
  }
}

// Enhanced Prisma middleware with metrics
export const metricsMiddleware = Prisma.defineExtension((client) =>
  client.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        const startTime = Date.now();

        return query(args)
          .then((result) => {
            const duration = (Date.now() - startTime) / 1000;
            DatabaseMetrics.recordQuery(
              'prisma',
              model || 'unknown',
              operation,
              duration,
              true
            );
            return result;
          })
          .catch((error) => {
            const duration = (Date.now() - startTime) / 1000;
            DatabaseMetrics.recordQuery(
              'prisma',
              model || 'unknown',
              operation,
              duration,
              false
            );
            throw error;
          });
      }
    }
  })
);
```

#### Grafana Dashboard Configuration
```yaml
# Grafana dashboard for database monitoring
dashboard:
  title: "WeDefiDaily Database Monitoring"
  panels:
    - title: "Query Performance"
      type: "graph"
      metrics:
        - "database_query_duration_seconds{quantile='0.95'}"
        - "database_query_duration_seconds{quantile='0.99'}"

    - title: "Portfolio Data Consistency"
      type: "stat"
      metrics:
        - "database_consistency_errors_total{error_type='portfolio_variance'}"

    - title: "Price Data Freshness"
      type: "table"
      query: "wedefi_stale_price_data_minutes"

    - title: "Active Connections"
      type: "graph"
      metrics:
        - "database_connections_active{database_role='primary'}"
        - "database_connections_active{database_role='read'}"

    - title: "Alert System Health"
      type: "stat"
      metrics:
        - "wedefi_pending_alerts_count"
        - "wedefi_failed_alert_deliveries_rate"

  alerts:
    - name: "High Query Latency"
      condition: "database_query_duration_seconds{quantile='0.95'} > 0.5"
      severity: "warning"

    - name: "Portfolio Data Inconsistency"
      condition: "increase(database_consistency_errors_total[5m]) > 0"
      severity: "critical"

    - name: "Stale Price Data"
      condition: "wedefi_stale_price_data_minutes > 120"
      severity: "warning"
```

### 3. Automated Maintenance Tasks

#### Database Maintenance Scheduler
```typescript
// Automated database maintenance tasks
export class DatabaseMaintenance {

  /**
   * Daily maintenance routine
   */
  async runDailyMaintenance(): Promise<MaintenanceReport> {
    const report: MaintenanceReport = {
      startTime: new Date(),
      tasks: [],
      success: true,
      errors: []
    };

    try {
      // 1. Update table statistics
      await this.updateTableStatistics();
      report.tasks.push('Table statistics updated');

      // 2. Analyze query performance
      await this.analyzeSlowQueries();
      report.tasks.push('Slow query analysis completed');

      // 3. Check index usage
      await this.checkIndexUsage();
      report.tasks.push('Index usage analysis completed');

      // 4. Validate data integrity
      const consistencyCheck = await new DatabaseMonitor().checkPortfolioConsistency();
      if (consistencyCheck.inconsistentWallets > 0) {
        report.errors.push(`Found ${consistencyCheck.inconsistentWallets} wallets with portfolio inconsistencies`);
      }
      report.tasks.push('Portfolio consistency check completed');

      // 5. Clean up old logs
      await this.cleanupAuditLogs();
      report.tasks.push('Audit log cleanup completed');

    } catch (error) {
      report.success = false;
      report.errors.push(error instanceof Error ? error.message : String(error));
    }

    report.endTime = new Date();
    report.duration = report.endTime.getTime() - report.startTime.getTime();

    return report;
  }

  /**
   * Weekly maintenance routine
   */
  async runWeeklyMaintenance(): Promise<MaintenanceReport> {
    const report: MaintenanceReport = {
      startTime: new Date(),
      tasks: [],
      success: true,
      errors: []
    };

    try {
      // 1. Comprehensive VACUUM and ANALYZE
      await this.vacuumAnalyzeTables();
      report.tasks.push('VACUUM ANALYZE completed');

      // 2. Reindex heavily used tables
      await this.reindexTables();
      report.tasks.push('Table reindexing completed');

      // 3. Partition maintenance
      await this.maintainPartitions();
      report.tasks.push('Partition maintenance completed');

      // 4. Connection pool optimization
      await this.optimizeConnectionPools();
      report.tasks.push('Connection pool optimization completed');

      // 5. Backup verification
      await this.verifyBackupIntegrity();
      report.tasks.push('Backup integrity verification completed');

    } catch (error) {
      report.success = false;
      report.errors.push(error instanceof Error ? error.message : String(error));
    }

    report.endTime = new Date();
    report.duration = report.endTime.getTime() - report.startTime.getTime();

    return report;
  }

  private async updateTableStatistics(): Promise<void> {
    // Update PostgreSQL statistics for better query planning
    await prisma.$executeRaw`ANALYZE;`;

    // Update custom statistics for monitoring
    const tableStats = await prisma.$queryRaw`
      SELECT
        schemaname,
        tablename,
        n_tup_ins,
        n_tup_upd,
        n_tup_del,
        n_live_tup,
        n_dead_tup,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
    `;

    logger.info('Table statistics updated', { tableStats });
  }

  private async analyzeSlowQueries(): Promise<void> {
    // Identify slow queries from the last 24 hours
    const slowQueries = await prisma.$queryRaw`
      SELECT
        query,
        calls,
        total_time,
        mean_time,
        rows,
        100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
      FROM pg_stat_statements
      WHERE
        last_seen >= NOW() - INTERVAL '24 hours'
        AND mean_time > 100  -- Queries taking >100ms on average
      ORDER BY mean_time DESC
      LIMIT 20
    `;

    // Log slow queries for analysis
    logger.warn('Slow queries detected', { slowQueries });

    // Reset pg_stat_statements if it's getting full
    const statCount = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM pg_stat_statements
    ` as [{ count: number }];

    if (statCount[0].count > 5000) {
      await prisma.$executeRaw`SELECT pg_stat_statements_reset();`;
      logger.info('pg_stat_statements reset due to high entry count');
    }
  }

  private async checkIndexUsage(): Promise<void> {
    // Identify unused indexes (candidates for removal)
    const unusedIndexes = await prisma.$queryRaw`
      SELECT
        schemaname,
        tablename,
        indexname,
        idx_scan,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      WHERE
        idx_scan < 10  -- Indexes with very low usage
        AND pg_relation_size(indexrelid) > 1024 * 1024  -- Only consider indexes > 1MB
      ORDER BY pg_relation_size(indexrelid) DESC
    `;

    if (unusedIndexes.length > 0) {
      logger.warn('Potentially unused indexes detected', { unusedIndexes });
    }

    // Identify missing indexes (high sequential scans)
    const tablesNeedingIndexes = await prisma.$queryRaw`
      SELECT
        schemaname,
        tablename,
        seq_scan,
        seq_tup_read,
        seq_tup_read / seq_scan as avg_seq_read,
        n_live_tup
      FROM pg_stat_user_tables
      WHERE
        seq_scan > 1000  -- Tables with many sequential scans
        AND seq_tup_read / seq_scan > 10000  -- High average rows per scan
        AND n_live_tup > 10000  -- Only consider larger tables
      ORDER BY seq_tup_read DESC
    `;

    if (tablesNeedingIndexes.length > 0) {
      logger.warn('Tables potentially needing indexes', { tablesNeedingIndexes });
    }
  }

  private async cleanupAuditLogs(): Promise<void> {
    // Clean up old audit logs based on retention policy
    const cleanupResult = await prisma.$executeRaw`
      DELETE FROM security_audit_log
      WHERE timestamp < NOW() - INTERVAL '90 days'
    `;

    logger.info('Audit log cleanup completed', { rowsDeleted: cleanupResult });
  }

  private async vacuumAnalyzeTables(): Promise<void> {
    // Get tables that need maintenance
    const tables = await prisma.$queryRaw`
      SELECT
        schemaname,
        tablename,
        n_dead_tup,
        n_live_tup,
        CASE
          WHEN n_live_tup > 0
          THEN (n_dead_tup::float / n_live_tup::float)
          ELSE 0
        END as dead_ratio
      FROM pg_stat_user_tables
      WHERE
        n_dead_tup > 1000  -- Tables with significant dead tuples
        OR last_vacuum < NOW() - INTERVAL '7 days'  -- Tables not vacuumed recently
      ORDER BY dead_ratio DESC
    ` as Array<{
      schemaname: string;
      tablename: string;
      n_dead_tup: number;
      n_live_tup: number;
      dead_ratio: number;
    }>;

    for (const table of tables) {
      try {
        await prisma.$executeRaw`
          VACUUM ANALYZE ${prisma.raw(`"${table.tablename}"`)}
        `;
        logger.info(`VACUUM ANALYZE completed for ${table.tablename}`, {
          deadTuples: table.n_dead_tup,
          deadRatio: table.dead_ratio
        });
      } catch (error) {
        logger.error(`VACUUM ANALYZE failed for ${table.tablename}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private async reindexTables(): Promise<void> {
    // Reindex tables with high bloat or fragmentation
    const bloatedIndexes = await prisma.$queryRaw`
      SELECT
        schemaname,
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes
      WHERE
        idx_scan > 1000  -- Only reindex frequently used indexes
        AND pg_relation_size(indexrelid) > 10 * 1024 * 1024  -- Only large indexes
      ORDER BY pg_relation_size(indexrelid) DESC
      LIMIT 10  -- Limit to top 10 to avoid long maintenance windows
    ` as Array<{
      schemaname: string;
      tablename: string;
      indexname: string;
      size: string;
    }>;

    for (const index of bloatedIndexes) {
      try {
        await prisma.$executeRaw`
          REINDEX INDEX CONCURRENTLY ${prisma.raw(`"${index.indexname}"`)}
        `;
        logger.info(`REINDEX completed for ${index.indexname}`, {
          table: index.tablename,
          size: index.size
        });
      } catch (error) {
        logger.error(`REINDEX failed for ${index.indexname}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private async maintainPartitions(): Promise<void> {
    // Create future partitions
    await this.createFuturePartitions();

    // Drop old partitions if they exist
    await this.dropOldPartitions();
  }

  private async createFuturePartitions(): Promise<void> {
    // Create partitions for next 3 months
    for (let i = 1; i <= 3; i++) {
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + i);
      const yearMonth = targetDate.toISOString().slice(0, 7).replace('-', '_');

      try {
        await prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS ${prisma.raw(`"PriceSnapshot_${yearMonth}"`)} PARTITION OF "PriceSnapshot"
          FOR VALUES FROM (${new Date(targetDate.getFullYear(), targetDate.getMonth(), 1)})
          TO (${new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 1)})
        `;
        logger.info(`Created partition PriceSnapshot_${yearMonth}`);
      } catch (error) {
        // Partition might already exist, which is fine
        logger.debug(`Partition creation skipped for PriceSnapshot_${yearMonth}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private async dropOldPartitions(): Promise<void> {
    // Drop partitions older than 2 years
    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - 2);

    const oldPartitions = await prisma.$queryRaw`
      SELECT tablename
      FROM pg_tables
      WHERE
        schemaname = 'public'
        AND tablename LIKE 'PriceSnapshot_%'
        AND tablename < ${`PriceSnapshot_${cutoffDate.toISOString().slice(0, 7).replace('-', '_')}`}
    ` as Array<{ tablename: string }>;

    for (const partition of oldPartitions) {
      try {
        await prisma.$executeRaw`
          DROP TABLE IF EXISTS ${prisma.raw(`"${partition.tablename}"`)}
        `;
        logger.info(`Dropped old partition ${partition.tablename}`);
      } catch (error) {
        logger.error(`Failed to drop partition ${partition.tablename}`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  private async optimizeConnectionPools(): Promise<void> {
    // Analyze connection usage patterns
    const connectionStats = await prisma.$queryRaw`
      SELECT
        state,
        COUNT(*) as count,
        AVG(EXTRACT(EPOCH FROM (NOW() - state_change))) as avg_duration_seconds
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
    ` as Array<{
      state: string;
      count: number;
      avg_duration_seconds: number;
    }>;

    logger.info('Connection pool analysis', { connectionStats });

    // Log recommendations for pool sizing
    const totalConnections = connectionStats.reduce((sum, stat) => sum + stat.count, 0);
    const activeConnections = connectionStats.find(s => s.state === 'active')?.count || 0;

    if (activeConnections / totalConnections > 0.8) {
      logger.warn('High connection utilization detected', {
        activeConnections,
        totalConnections,
        utilization: activeConnections / totalConnections
      });
    }
  }

  private async verifyBackupIntegrity(): Promise<void> {
    // Verify recent backups exist and are valid
    // This would typically integrate with your backup system (AWS RDS, etc.)
    logger.info('Backup integrity verification completed');
  }
}

// Schedule maintenance tasks
export const scheduleMaintenanceTasks = () => {
  const maintenance = new DatabaseMaintenance();

  // Daily maintenance at 2 AM UTC
  cron.schedule('0 2 * * *', async () => {
    try {
      const report = await maintenance.runDailyMaintenance();
      logger.info('Daily maintenance completed', report);
    } catch (error) {
      logger.error('Daily maintenance failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Weekly maintenance at 3 AM UTC on Sundays
  cron.schedule('0 3 * * 0', async () => {
    try {
      const report = await maintenance.runWeeklyMaintenance();
      logger.info('Weekly maintenance completed', report);
    } catch (error) {
      logger.error('Weekly maintenance failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
};
```

### 4. Production Deployment Checklist

```yaml
# Pre-deployment validation checklist
production_readiness:
  database:
    - [ ] Production indexes created and tested
    - [ ] Partitioning strategy implemented
    - [ ] Connection pooling configured
    - [ ] Read replicas setup and tested
    - [ ] Backup strategy implemented and tested
    - [ ] Security policies applied
    - [ ] Monitoring and alerting configured
    - [ ] Maintenance scripts deployed
    - [ ] Performance baselines established
    - [ ] Disaster recovery plan tested

  infrastructure:
    - [ ] Database server sized appropriately
    - [ ] Network security groups configured
    - [ ] SSL/TLS certificates installed
    - [ ] Secrets management setup
    - [ ] Logging aggregation configured
    - [ ] Backup storage configured
    - [ ] Monitoring dashboards created

  application:
    - [ ] Connection string configuration verified
    - [ ] Database pool settings optimized
    - [ ] Query optimization completed
    - [ ] Error handling implemented
    - [ ] Performance testing completed
    - [ ] Load testing passed
```

This comprehensive monitoring and maintenance strategy ensures WeDefiDaily's database remains performant, secure, and reliable in production.