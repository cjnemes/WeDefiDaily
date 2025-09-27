import { PrismaClient } from '@prisma/client';
import { Logger } from '../utils/logger';

const logger = new Logger('DatabasePool');

// Enhanced Prisma configuration for production
const createPrismaClient = (role: 'primary' | 'read' | 'analytics') => {
  const config = {
    primary: {
      datasources: {
        db: { url: process.env.DATABASE_URL_PRIMARY || process.env.DATABASE_URL }
      },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' }
      ] as const
    },
    read: {
      datasources: {
        db: { url: process.env.DATABASE_URL_READ || process.env.DATABASE_URL }
      },
      log: [
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' }
      ] as const
    },
    analytics: {
      datasources: {
        db: { url: process.env.DATABASE_URL_ANALYTICS || process.env.DATABASE_URL }
      },
      log: [
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' }
      ] as const
    }
  };

  const client = new PrismaClient(config[role]);

  // Query performance monitoring
  if (role === 'primary') {
    client.$on('query', (e) => {
      if (e.duration > 1000) { // Log slow queries > 1s
        logger.warn('Slow query detected', {
          query: e.query.substring(0, 200),
          duration: `${e.duration}ms`,
          params: e.params
        });
      }
    });
  }

  // Error logging for all clients
  client.$on('error', (e) => {
    logger.error('Database error', {
      message: e.message,
      target: e.target,
      role
    });
  });

  client.$on('warn', (e) => {
    logger.warn('Database warning', {
      message: e.message,
      target: e.target,
      role
    });
  });

  return client;
};

// Connection pool management
export class DatabasePool {
  private primaryClient: PrismaClient;
  private readClient: PrismaClient;
  private analyticsClient: PrismaClient;
  private connectionHealth: Map<string, boolean> = new Map();

  constructor() {
    this.primaryClient = createPrismaClient('primary');
    this.readClient = createPrismaClient('read');
    this.analyticsClient = createPrismaClient('analytics');

    // Initialize connection health tracking
    this.connectionHealth.set('primary', true);
    this.connectionHealth.set('read', true);
    this.connectionHealth.set('analytics', true);

    // Start health monitoring
    this.startHealthMonitoring();
  }

  /**
   * Get appropriate client based on operation type
   */
  getClient(operation: 'read' | 'write' | 'analytics' = 'read'): PrismaClient {
    switch (operation) {
      case 'write':
        return this.primaryClient;
      case 'analytics':
        // Fallback to read replica if analytics client is unhealthy
        return this.connectionHealth.get('analytics')
          ? this.analyticsClient
          : this.readClient;
      case 'read':
      default:
        // Fallback to primary if read replica is unhealthy
        return this.connectionHealth.get('read')
          ? this.readClient
          : this.primaryClient;
    }
  }

  /**
   * Health check for all database connections
   */
  async healthCheck(): Promise<{
    primary: boolean;
    read: boolean;
    analytics: boolean;
    overall: boolean;
  }> {
    const checks = await Promise.allSettled([
      this.checkConnection('primary', this.primaryClient),
      this.checkConnection('read', this.readClient),
      this.checkConnection('analytics', this.analyticsClient)
    ]);

    const primary = checks[0].status === 'fulfilled' && checks[0].value;
    const read = checks[1].status === 'fulfilled' && checks[1].value;
    const analytics = checks[2].status === 'fulfilled' && checks[2].value;

    return {
      primary,
      read,
      analytics,
      overall: primary && (read || analytics) // At least primary + one replica
    };
  }

  /**
   * Check individual connection health
   */
  private async checkConnection(name: string, client: PrismaClient): Promise<boolean> {
    try {
      await client.$queryRaw`SELECT 1`;
      this.connectionHealth.set(name, true);
      return true;
    } catch (error) {
      logger.error(`Database connection ${name} health check failed`, {
        error: error instanceof Error ? error.message : String(error)
      });
      this.connectionHealth.set(name, false);
      return false;
    }
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    setInterval(async () => {
      await this.healthCheck();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Graceful shutdown of all connections
   */
  async disconnect(): Promise<void> {
    logger.info('Shutting down database connections...');

    await Promise.all([
      this.primaryClient.$disconnect(),
      this.readClient.$disconnect(),
      this.analyticsClient.$disconnect()
    ]);

    logger.info('Database connections closed');
  }

  /**
   * Get connection statistics
   */
  async getConnectionStats(): Promise<{
    primary: any;
    read: any;
    analytics: any;
  }> {
    const getStats = async (client: PrismaClient) => {
      try {
        const stats = await client.$queryRaw`
          SELECT
            state,
            COUNT(*) as count
          FROM pg_stat_activity
          WHERE datname = current_database()
          GROUP BY state
        ` as Array<{ state: string; count: bigint }>;

        return stats.reduce((acc, stat) => {
          acc[stat.state] = Number(stat.count);
          return acc;
        }, {} as Record<string, number>);
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    };

    const [primary, read, analytics] = await Promise.all([
      getStats(this.primaryClient),
      getStats(this.readClient),
      getStats(this.analyticsClient)
    ]);

    return { primary, read, analytics };
  }
}

// Singleton instance
let databasePool: DatabasePool | null = null;

export function getDatabasePool(): DatabasePool {
  if (!databasePool) {
    databasePool = new DatabasePool();
  }
  return databasePool;
}

// Enhanced Fastify plugin with connection pooling
export const enhancedPrismaPlugin = async (app: any) => {
  const pool = getDatabasePool();

  // Decorate Fastify with database pool
  app.decorate('db', {
    read: pool.getClient('read'),
    write: pool.getClient('write'),
    analytics: pool.getClient('analytics'),
    pool
  });

  // Health check endpoint
  app.get('/health/database', async (request: any, reply: any) => {
    const health = await pool.healthCheck();

    if (!health.overall) {
      return reply.status(503).send({
        status: 'unhealthy',
        details: health
      });
    }

    const stats = await pool.getConnectionStats();

    return reply.send({
      status: 'healthy',
      connections: health,
      statistics: stats
    });
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    await pool.disconnect();
  });
};

// Query execution with automatic retry and fallback
export class QueryExecutor {
  private pool: DatabasePool;

  constructor() {
    this.pool = getDatabasePool();
  }

  /**
   * Execute read query with automatic retry and fallback
   */
  async executeRead<T>(
    query: (client: PrismaClient) => Promise<T>,
    options: { maxRetries?: number; timeout?: number } = {}
  ): Promise<T> {
    const { maxRetries = 3, timeout = 30000 } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.pool.getClient('read');

        // Add timeout to query execution
        const result = await Promise.race([
          query(client),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), timeout)
          )
        ]);

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.warn(`Read query attempt ${attempt} failed`, {
          error: lastError.message,
          attempt,
          maxRetries
        });

        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All read query attempts failed');
  }

  /**
   * Execute write query with retry logic
   */
  async executeWrite<T>(
    query: (client: PrismaClient) => Promise<T>,
    options: { maxRetries?: number; timeout?: number } = {}
  ): Promise<T> {
    const { maxRetries = 2, timeout = 30000 } = options; // Fewer retries for writes
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.pool.getClient('write');

        const result = await Promise.race([
          query(client),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout')), timeout)
          )
        ]);

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        logger.error(`Write query attempt ${attempt} failed`, {
          error: lastError.message,
          attempt,
          maxRetries
        });

        if (attempt < maxRetries) {
          const delay = 1000 * attempt; // Linear backoff for writes
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('All write query attempts failed');
  }

  /**
   * Execute analytics query with extended timeout
   */
  async executeAnalytics<T>(
    query: (client: PrismaClient) => Promise<T>,
    options: { timeout?: number } = {}
  ): Promise<T> {
    const { timeout = 120000 } = options; // 2 minutes for complex analytics

    try {
      const client = this.pool.getClient('analytics');

      const result = await Promise.race([
        query(client),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Analytics query timeout')), timeout)
        )
      ]);

      return result;
    } catch (error) {
      logger.error('Analytics query failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

// Export singleton query executor
export const queryExecutor = new QueryExecutor();