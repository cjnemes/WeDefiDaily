import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';

const prisma = new PrismaClient();
const logger = new Logger('DataRetention');

interface RetentionPolicy {
  table: string;
  timeColumn: string;
  retentionDays: number;
  archiveBeforeDelete?: boolean;
  batchSize?: number;
}

// Define retention policies for all time-series data
const RETENTION_POLICIES: RetentionPolicy[] = [
  // Critical financial data - longer retention
  {
    table: 'Transaction',
    timeColumn: 'occurredAt',
    retentionDays: 2555, // 7 years for tax compliance
    archiveBeforeDelete: true,
    batchSize: 1000
  },
  {
    table: 'TokenBalance',
    timeColumn: 'fetchedAt',
    retentionDays: 1095, // 3 years for portfolio history
    archiveBeforeDelete: true,
    batchSize: 5000
  },

  // Time-series analytics data - moderate retention
  {
    table: 'PriceSnapshot',
    timeColumn: 'recordedAt',
    retentionDays: 730, // 2 years for price analysis
    archiveBeforeDelete: true,
    batchSize: 10000
  },
  {
    table: 'PortfolioSnapshot',
    timeColumn: 'capturedAt',
    retentionDays: 365, // 1 year for performance tracking
    archiveBeforeDelete: true,
    batchSize: 1000
  },
  {
    table: 'PositionSnapshot',
    timeColumn: 'portfolioSnapshotId', // Special handling via join
    retentionDays: 365,
    archiveBeforeDelete: true,
    batchSize: 5000
  },

  // Performance and risk metrics - moderate retention
  {
    table: 'PerformanceMetric',
    timeColumn: 'computedAt',
    retentionDays: 365,
    archiveBeforeDelete: false,
    batchSize: 1000
  },
  {
    table: 'AssetCorrelation',
    timeColumn: 'computedAt',
    retentionDays: 365,
    archiveBeforeDelete: false,
    batchSize: 2000
  },
  {
    table: 'VolatilityMetric',
    timeColumn: 'computedAt',
    retentionDays: 365,
    archiveBeforeDelete: false,
    batchSize: 2000
  },
  {
    table: 'ValueAtRisk',
    timeColumn: 'computedAt',
    retentionDays: 365,
    archiveBeforeDelete: false,
    batchSize: 1000
  },

  // Operational data - shorter retention
  {
    table: 'AlertDelivery',
    timeColumn: 'createdAt',
    retentionDays: 30,
    archiveBeforeDelete: false,
    batchSize: 5000
  },
  {
    table: 'DigestRun',
    timeColumn: 'generatedAt',
    retentionDays: 180, // 6 months for digest history
    archiveBeforeDelete: true,
    batchSize: 100
  },

  // Snapshot data from digest runs - shorter retention
  {
    table: 'WalletBalanceSnapshot',
    timeColumn: 'capturedAt',
    retentionDays: 180,
    archiveBeforeDelete: false,
    batchSize: 2000
  },
  {
    table: 'GovernanceLockSnapshot',
    timeColumn: 'capturedAt',
    retentionDays: 180,
    archiveBeforeDelete: false,
    batchSize: 1000
  },
  {
    table: 'RewardOpportunitySnapshot',
    timeColumn: 'capturedAt',
    retentionDays: 180,
    archiveBeforeDelete: false,
    batchSize: 2000
  },
  {
    table: 'GammaswapPositionSnapshot',
    timeColumn: 'capturedAt',
    retentionDays: 180,
    archiveBeforeDelete: false,
    batchSize: 1000
  }
];

/**
 * Execute data retention policy for a specific table
 */
async function executeRetentionPolicy(policy: RetentionPolicy): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

  logger.info(`Executing retention policy for ${policy.table}`, {
    retentionDays: policy.retentionDays,
    cutoffDate: cutoffDate.toISOString(),
    archiveFirst: policy.archiveBeforeDelete
  });

  try {
    // Special handling for PositionSnapshot (needs join with PortfolioSnapshot)
    if (policy.table === 'PositionSnapshot') {
      await handlePositionSnapshotRetention(cutoffDate, policy.batchSize || 1000);
      return;
    }

    // Count records to be processed
    const countQuery = `
      SELECT COUNT(*) as count
      FROM "${policy.table}"
      WHERE "${policy.timeColumn}" < $1
    `;
    const countResult = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM ${prisma.raw(`"${policy.table}"`)}
      WHERE ${prisma.raw(`"${policy.timeColumn}"`)} < ${cutoffDate}
    ` as [{ count: bigint }];

    const totalRecords = Number(countResult[0].count);

    if (totalRecords === 0) {
      logger.info(`No records to process for ${policy.table}`);
      return;
    }

    logger.info(`Found ${totalRecords} records to process for ${policy.table}`);

    // Archive data if required
    if (policy.archiveBeforeDelete) {
      await archiveTableData(policy.table, policy.timeColumn, cutoffDate);
    }

    // Delete data in batches to avoid long-running transactions
    let deletedTotal = 0;
    const batchSize = policy.batchSize || 1000;

    while (deletedTotal < totalRecords) {
      const deleteQuery = `
        DELETE FROM "${policy.table}"
        WHERE "${policy.timeColumn}" < $1
        AND ctid IN (
          SELECT ctid FROM "${policy.table}"
          WHERE "${policy.timeColumn}" < $1
          LIMIT $2
        )
      `;

      const result = await prisma.$executeRaw`
        DELETE FROM ${prisma.raw(`"${policy.table}"`)}
        WHERE ${prisma.raw(`"${policy.timeColumn}"`)} < ${cutoffDate}
        AND ctid IN (
          SELECT ctid FROM ${prisma.raw(`"${policy.table}"`)}
          WHERE ${prisma.raw(`"${policy.timeColumn}"`)} < ${cutoffDate}
          LIMIT ${batchSize}
        )
      `;

      deletedTotal += result;

      logger.info(`Deleted batch from ${policy.table}`, {
        batchDeleted: result,
        totalDeleted: deletedTotal,
        remaining: totalRecords - deletedTotal
      });

      // Small delay between batches to reduce database load
      if (deletedTotal < totalRecords) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logger.info(`Completed retention policy for ${policy.table}`, {
      totalDeleted: deletedTotal,
      archived: policy.archiveBeforeDelete
    });

  } catch (error) {
    logger.error(`Failed to execute retention policy for ${policy.table}`, {
      error: error instanceof Error ? error.message : String(error),
      policy
    });
    throw error;
  }
}

/**
 * Special handling for PositionSnapshot retention (requires join)
 */
async function handlePositionSnapshotRetention(
  cutoffDate: Date,
  batchSize: number
): Promise<void> {
  // Delete PositionSnapshot records where the associated PortfolioSnapshot is old
  const result = await prisma.$executeRaw`
    DELETE FROM "PositionSnapshot"
    WHERE "portfolioSnapshotId" IN (
      SELECT ps.id
      FROM "PortfolioSnapshot" ps
      WHERE ps."capturedAt" < ${cutoffDate}
      LIMIT ${batchSize}
    )
  `;

  logger.info(`Deleted ${result} PositionSnapshot records via PortfolioSnapshot join`);
}

/**
 * Archive table data to S3 before deletion
 */
async function archiveTableData(
  tableName: string,
  timeColumn: string,
  cutoffDate: Date
): Promise<void> {
  const archiveDate = cutoffDate.toISOString().split('T')[0]; // YYYY-MM-DD format
  const fileName = `${tableName}_${archiveDate}.jsonl`;

  logger.info(`Archiving data for ${tableName} to ${fileName}`);

  try {
    // Export data as JSONL for efficient storage and future processing
    const exportQuery = `
      COPY (
        SELECT row_to_json(t)
        FROM "${tableName}" t
        WHERE "${timeColumn}" < $1
      ) TO STDOUT
    `;

    // In a real implementation, you would stream this to S3
    // For now, we'll log the intent
    logger.info(`Would archive data to S3://wedefi-archive/${tableName}/${fileName}`);

    // TODO: Implement actual S3 upload using AWS SDK
    // const s3Upload = new AWS.S3.Upload({
    //   Bucket: 'wedefi-archive',
    //   Key: `${tableName}/${fileName}`,
    //   Body: dataStream
    // });
    // await s3Upload.promise();

  } catch (error) {
    logger.error(`Failed to archive data for ${tableName}`, {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Execute all retention policies
 */
export async function runDataRetention(): Promise<void> {
  const startTime = Date.now();

  logger.info('Starting data retention job', {
    policies: RETENTION_POLICIES.length,
    timestamp: new Date().toISOString()
  });

  let successCount = 0;
  let errorCount = 0;

  for (const policy of RETENTION_POLICIES) {
    try {
      await executeRetentionPolicy(policy);
      successCount++;
    } catch (error) {
      errorCount++;
      logger.error(`Retention policy failed for ${policy.table}`, {
        error: error instanceof Error ? error.message : String(error)
      });

      // Continue processing other tables even if one fails
      continue;
    }
  }

  const duration = Date.now() - startTime;

  logger.info('Data retention job completed', {
    duration: `${duration}ms`,
    success: successCount,
    errors: errorCount,
    total: RETENTION_POLICIES.length
  });

  // Run VACUUM ANALYZE after bulk deletions to reclaim space and update statistics
  logger.info('Running VACUUM ANALYZE to reclaim space...');
  await prisma.$executeRaw`VACUUM ANALYZE;`;

  if (errorCount > 0) {
    throw new Error(`Data retention completed with ${errorCount} errors`);
  }
}

/**
 * Get retention status for monitoring
 */
export async function getRetentionStatus(): Promise<Array<{
  table: string;
  oldestRecord: Date | null;
  recordCount: number;
  retentionDays: number;
  isCompliant: boolean;
}>> {
  const status = [];

  for (const policy of RETENTION_POLICIES) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

      // Special handling for PositionSnapshot
      if (policy.table === 'PositionSnapshot') {
        const result = await prisma.$queryRaw`
          SELECT
            COUNT(*) as count,
            MIN(ps."capturedAt") as oldest
          FROM "PositionSnapshot" pos
          JOIN "PortfolioSnapshot" ps ON pos."portfolioSnapshotId" = ps.id
          WHERE ps."capturedAt" < ${cutoffDate}
        ` as [{ count: bigint; oldest: Date | null }];

        status.push({
          table: policy.table,
          oldestRecord: result[0].oldest,
          recordCount: Number(result[0].count),
          retentionDays: policy.retentionDays,
          isCompliant: Number(result[0].count) === 0
        });
        continue;
      }

      // Standard table handling
      const result = await prisma.$queryRaw`
        SELECT
          COUNT(*) as count,
          MIN(${prisma.raw(`"${policy.timeColumn}"`)}) as oldest
        FROM ${prisma.raw(`"${policy.table}"`)}
        WHERE ${prisma.raw(`"${policy.timeColumn}"`)} < ${cutoffDate}
      ` as [{ count: bigint; oldest: Date | null }];

      status.push({
        table: policy.table,
        oldestRecord: result[0].oldest,
        recordCount: Number(result[0].count),
        retentionDays: policy.retentionDays,
        isCompliant: Number(result[0].count) === 0
      });

    } catch (error) {
      logger.error(`Failed to get retention status for ${policy.table}`, {
        error: error instanceof Error ? error.message : String(error)
      });

      status.push({
        table: policy.table,
        oldestRecord: null,
        recordCount: -1,
        retentionDays: policy.retentionDays,
        isCompliant: false
      });
    }
  }

  return status;
}

// Export for job scheduling
if (require.main === module) {
  runDataRetention()
    .then(() => {
      logger.info('Data retention job completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Data retention job failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      process.exit(1);
    });
}