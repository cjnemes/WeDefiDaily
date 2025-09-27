/**
 * Comprehensive health check service for production monitoring
 */

import { PrismaClient } from '@prisma/client';
import { createAlchemyService } from './alchemy-enhanced';
import { getChainConfig } from './chain-config';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  services: Record<string, ServiceHealth>;
  overall: {
    uptime: number;
    version: string;
    environment: string;
  };
}

export interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastChecked: string;
  details?: Record<string, any>;
  error?: string;
}

export class HealthCheckService {
  private prisma: PrismaClient;
  private lastHealthCheck: HealthStatus | null = null;
  private startTime: number = Date.now();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Perform comprehensive health check of all services
   */
  async performHealthCheck(): Promise<HealthStatus> {
    const timestamp = new Date().toISOString();
    const services: Record<string, ServiceHealth> = {};

    // Check all services in parallel for faster response
    const [
      databaseHealth,
      alchemyHealth,
      coinGeckoHealth,
      externalApisHealth,
      systemHealth
    ] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkAlchemy(),
      this.checkCoinGecko(),
      this.checkExternalApis(),
      this.checkSystemHealth()
    ]);

    // Process results
    services.database = this.processHealthResult(databaseHealth);
    services.alchemy = this.processHealthResult(alchemyHealth);
    services.coinGecko = this.processHealthResult(coinGeckoHealth);
    services.externalApis = this.processHealthResult(externalApisHealth);
    services.system = this.processHealthResult(systemHealth);

    // Determine overall status
    const statuses = Object.values(services).map(s => s.status);
    const overallStatus = this.determineOverallStatus(statuses);

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp,
      services,
      overall: {
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        version: process.env.npm_package_version || '0.1.0',
        environment: process.env.NODE_ENV || 'development',
      },
    };

    this.lastHealthCheck = healthStatus;
    return healthStatus;
  }

  /**
   * Get cached health status (faster for frequent checks)
   */
  getCachedHealthStatus(): HealthStatus | null {
    return this.lastHealthCheck;
  }

  /**
   * Check database connectivity and performance
   */
  private async checkDatabase(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      // Test basic connectivity
      await this.prisma.$queryRaw`SELECT 1 as test`;

      // Test read performance with a simple query
      const walletCount = await this.prisma.wallet.count();

      // Test write performance with a simple operation
      await this.prisma.$executeRaw`SELECT pg_advisory_lock(12345); SELECT pg_advisory_unlock(12345);`;

      const responseTime = Date.now() - startTime;

      // Check for slow response (warning threshold)
      const status = responseTime > 5000 ? 'degraded' : responseTime > 1000 ? 'degraded' : 'healthy';

      return {
        status,
        responseTime,
        lastChecked: new Date().toISOString(),
        details: {
          walletCount,
          connectionPool: 'active',
          slowQuery: responseTime > 1000,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Database connection failed',
        details: {
          connectionPool: 'failed',
        },
      };
    }
  }

  /**
   * Check Alchemy API connectivity and rate limits
   */
  private async checkAlchemy(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      const apiKey = process.env.ALCHEMY_API_KEY;
      if (!apiKey) {
        return {
          status: 'unhealthy',
          lastChecked: new Date().toISOString(),
          error: 'ALCHEMY_API_KEY not configured',
        };
      }

      // Test with Base chain (most commonly used)
      const baseConfig = getChainConfig(8453);
      const alchemyService = createAlchemyService(
        apiKey,
        (process.env.ALCHEMY_TIER as any) || 'free',
        baseConfig
      );

      // Perform a simple health check call
      const healthCheck = await alchemyService.healthCheck();
      const responseTime = Date.now() - startTime;

      return {
        status: healthCheck.status,
        responseTime,
        lastChecked: new Date().toISOString(),
        details: {
          metrics: healthCheck.metrics,
          rateLimitState: healthCheck.rateLimitState,
          circuitBreakerOpen: healthCheck.circuitBreakerOpen,
          tier: process.env.ALCHEMY_TIER || 'free',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Alchemy API check failed',
      };
    }
  }

  /**
   * Check CoinGecko API connectivity
   */
  private async checkCoinGecko(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      const apiKey = process.env.COINGECKO_API_KEY;
      const baseUrl = apiKey
        ? 'https://pro-api.coingecko.com/api/v3'
        : 'https://api.coingecko.com/api/v3';

      const headers = apiKey ? { 'X-Cg-Pro-Api-Key': apiKey } : {};

      // Simple ping test
      const response = await fetch(`${baseUrl}/ping`, {
        headers,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        return {
          status: 'degraded',
          responseTime,
          lastChecked: new Date().toISOString(),
          error: `HTTP ${response.status}: ${response.statusText}`,
          details: {
            tier: apiKey ? 'pro' : 'free',
            rateLimit: response.headers.get('x-ratelimit-remaining'),
          },
        };
      }

      const data = await response.json();

      return {
        status: 'healthy',
        responseTime,
        lastChecked: new Date().toISOString(),
        details: {
          tier: apiKey ? 'pro' : 'free',
          response: data,
          rateLimit: response.headers.get('x-ratelimit-remaining'),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'CoinGecko API check failed',
      };
    }
  }

  /**
   * Check external protocol APIs
   */
  private async checkExternalApis(): Promise<ServiceHealth> {
    const startTime = Date.now();
    const results: Record<string, boolean> = {};

    try {
      // Check key external APIs we depend on
      const apiChecks = [
        { name: 'aerodrome', url: 'https://api.aerodrome.finance/api/v1/health' },
        { name: 'thena', url: 'https://api.thena.fi/health' },
        { name: 'gammaswap', url: 'https://api.gammaswap.com/health' },
      ];

      const checkPromises = apiChecks.map(async (api) => {
        try {
          const response = await fetch(api.url, {
            signal: AbortSignal.timeout(5000), // 5 second timeout per API
          });
          results[api.name] = response.ok;
          return response.ok;
        } catch {
          results[api.name] = false;
          return false;
        }
      });

      const apiResults = await Promise.all(checkPromises);
      const healthyCount = apiResults.filter(Boolean).length;
      const totalCount = apiResults.length;

      const responseTime = Date.now() - startTime;

      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (healthyCount === totalCount) {
        status = 'healthy';
      } else if (healthyCount > 0) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        status,
        responseTime,
        lastChecked: new Date().toISOString(),
        details: {
          apis: results,
          healthyCount,
          totalCount,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'External API check failed',
        details: {
          apis: results,
        },
      };
    }
  }

  /**
   * Check system health (memory, disk, etc.)
   */
  private async checkSystemHealth(): Promise<ServiceHealth> {
    try {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      const uptime = process.uptime();

      // Convert memory to MB
      const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
      const rssUsedMB = Math.round(memoryUsage.rss / 1024 / 1024);

      // Check for high memory usage (warning at 80%, critical at 90%)
      const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (memoryUsagePercent > 90) {
        status = 'unhealthy';
      } else if (memoryUsagePercent > 80) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      return {
        status,
        lastChecked: new Date().toISOString(),
        details: {
          memory: {
            heapUsedMB,
            heapTotalMB,
            rssUsedMB,
            usagePercent: Math.round(memoryUsagePercent),
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          },
          uptime: Math.round(uptime),
          nodeVersion: process.version,
          platform: process.platform,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastChecked: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'System health check failed',
      };
    }
  }

  /**
   * Process health check result from Promise.allSettled
   */
  private processHealthResult(result: PromiseSettledResult<ServiceHealth>): ServiceHealth {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        status: 'unhealthy',
        lastChecked: new Date().toISOString(),
        error: result.reason instanceof Error ? result.reason.message : 'Health check failed',
      };
    }
  }

  /**
   * Determine overall status from individual service statuses
   */
  private determineOverallStatus(statuses: Array<'healthy' | 'degraded' | 'unhealthy'>): 'healthy' | 'degraded' | 'unhealthy' {
    if (statuses.includes('unhealthy')) {
      // If any critical service is unhealthy, overall is unhealthy
      return 'unhealthy';
    } else if (statuses.includes('degraded')) {
      // If any service is degraded, overall is degraded
      return 'degraded';
    } else {
      // All services healthy
      return 'healthy';
    }
  }

  /**
   * Get service-specific health metrics for monitoring dashboards
   */
  async getDetailedMetrics(): Promise<Record<string, any>> {
    const healthStatus = await this.performHealthCheck();

    return {
      // Overall metrics
      overall: {
        status: healthStatus.status,
        uptime: healthStatus.overall.uptime,
        timestamp: healthStatus.timestamp,
      },

      // Database metrics
      database: {
        status: healthStatus.services.database.status,
        responseTime: healthStatus.services.database.responseTime,
        connectionPool: healthStatus.services.database.details?.connectionPool,
        walletCount: healthStatus.services.database.details?.walletCount,
      },

      // API metrics
      alchemy: {
        status: healthStatus.services.alchemy.status,
        responseTime: healthStatus.services.alchemy.responseTime,
        rateLimitHits: healthStatus.services.alchemy.details?.metrics?.rateLimitHits,
        totalRequests: healthStatus.services.alchemy.details?.metrics?.totalRequests,
        averageResponseTime: healthStatus.services.alchemy.details?.metrics?.averageResponseTime,
      },

      // System metrics
      system: {
        status: healthStatus.services.system.status,
        memoryUsagePercent: healthStatus.services.system.details?.memory?.usagePercent,
        heapUsedMB: healthStatus.services.system.details?.memory?.heapUsedMB,
        uptime: healthStatus.services.system.details?.uptime,
      },

      // External API metrics
      externalApis: {
        status: healthStatus.services.externalApis.status,
        healthyCount: healthStatus.services.externalApis.details?.healthyCount,
        totalCount: healthStatus.services.externalApis.details?.totalCount,
      },
    };
  }

  /**
   * Check if system is ready to serve traffic
   */
  async isReady(): Promise<boolean> {
    try {
      const healthStatus = await this.performHealthCheck();

      // System is ready if database and core APIs are at least degraded
      const criticalServices = ['database', 'alchemy'];
      const criticalStatuses = criticalServices.map(
        service => healthStatus.services[service]?.status
      );

      // Ready if no critical services are unhealthy
      return !criticalStatuses.includes('unhealthy');
    } catch {
      return false;
    }
  }

  /**
   * Check if system is alive (basic liveness probe)
   */
  async isAlive(): Promise<boolean> {
    try {
      // Just check if we can connect to database
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance for use across the application
let healthCheckInstance: HealthCheckService | null = null;

export function getHealthCheckService(prisma: PrismaClient): HealthCheckService {
  if (!healthCheckInstance) {
    healthCheckInstance = new HealthCheckService(prisma);
  }
  return healthCheckInstance;
}