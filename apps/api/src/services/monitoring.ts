import { PrismaClient } from '@prisma/client';

interface MetricData {
  timestamp: Date;
  value: number;
  labels?: Record<string, string>;
}

interface AlchemyUsageMetrics {
  totalRequests: number;
  computeUnitsUsed: number;
  rateLimitHits: number;
  errorRate: number;
  averageResponseTime: number;
  lastSyncSuccess: Date | null;
  failedSyncs: number;
}

interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  error?: string;
  lastChecked: Date;
}

export class MonitoringService {
  private metrics: Map<string, MetricData[]> = new Map();
  private healthChecks: Map<string, HealthCheckResult> = new Map();
  private alertThresholds: Map<string, number> = new Map();

  constructor(private prisma: PrismaClient) {
    this.initializeThresholds();
  }

  private initializeThresholds() {
    this.alertThresholds.set('error_rate', 0.05); // 5% error rate
    this.alertThresholds.set('response_time', 5000); // 5 second response time
    this.alertThresholds.set('sync_failure_count', 3); // 3 consecutive failures
    this.alertThresholds.set('rate_limit_hits', 10); // 10 rate limit hits per hour
  }

  recordMetric(name: string, value: number, labels?: Record<string, string>) {
    const key = this.getMetricKey(name, labels);
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const metrics = this.metrics.get(key)!;
    metrics.push({
      timestamp: new Date(),
      value,
      labels,
    });

    // Keep only last 1000 data points
    if (metrics.length > 1000) {
      metrics.shift();
    }
  }

  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  async recordAlchemyUsage(
    chainId: number,
    method: string,
    success: boolean,
    responseTime: number,
    computeUnits: number = 1
  ) {
    const labels = { chain_id: chainId.toString(), method };

    this.recordMetric('alchemy_requests_total', 1, labels);
    this.recordMetric('alchemy_compute_units_total', computeUnits, labels);
    this.recordMetric('alchemy_response_time', responseTime, labels);

    if (!success) {
      this.recordMetric('alchemy_errors_total', 1, labels);
    }

    // Store in database for historical analysis
    try {
      await this.prisma.$executeRaw`
        INSERT INTO api_usage_metrics (
          service, method, chain_id, success, response_time_ms,
          compute_units, recorded_at
        ) VALUES (
          'alchemy', ${method}, ${chainId}, ${success}, ${responseTime},
          ${computeUnits}, NOW()
        )
        ON CONFLICT DO NOTHING
      `;
    } catch (error) {
      console.warn('Failed to record usage metric:', error);
    }
  }

  async getAlchemyUsageMetrics(chainId?: number, hours: number = 24): Promise<AlchemyUsageMetrics> {
    try {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      const query = chainId
        ? this.prisma.$queryRaw`
            SELECT
              COUNT(*) as total_requests,
              SUM(compute_units) as compute_units_used,
              AVG(response_time_ms) as avg_response_time,
              SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as error_count,
              MAX(CASE WHEN success THEN recorded_at ELSE NULL END) as last_success
            FROM api_usage_metrics
            WHERE service = 'alchemy'
              AND chain_id = ${chainId}
              AND recorded_at >= ${since}
          `
        : this.prisma.$queryRaw`
            SELECT
              COUNT(*) as total_requests,
              SUM(compute_units) as compute_units_used,
              AVG(response_time_ms) as avg_response_time,
              SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as error_count,
              MAX(CASE WHEN success THEN recorded_at ELSE NULL END) as last_success
            FROM api_usage_metrics
            WHERE service = 'alchemy'
              AND recorded_at >= ${since}
          `;

      const result = await query as any[];
      const data = result[0];

      const totalRequests = parseInt(data.total_requests) || 0;
      const errorCount = parseInt(data.error_count) || 0;

      return {
        totalRequests,
        computeUnitsUsed: parseInt(data.compute_units_used) || 0,
        rateLimitHits: this.getRateLimitHits(hours),
        errorRate: totalRequests > 0 ? errorCount / totalRequests : 0,
        averageResponseTime: parseFloat(data.avg_response_time) || 0,
        lastSyncSuccess: data.last_success ? new Date(data.last_success) : null,
        failedSyncs: errorCount,
      };
    } catch (error) {
      console.error('Failed to get usage metrics:', error);
      return {
        totalRequests: 0,
        computeUnitsUsed: 0,
        rateLimitHits: 0,
        errorRate: 0,
        averageResponseTime: 0,
        lastSyncSuccess: null,
        failedSyncs: 0,
      };
    }
  }

  private getRateLimitHits(hours: number): number {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    let total = 0;

    for (const [key, metrics] of this.metrics.entries()) {
      if (key.includes('rate_limit')) {
        total += metrics
          .filter(m => m.timestamp >= since)
          .reduce((sum, m) => sum + m.value, 0);
      }
    }

    return total;
  }

  async performHealthChecks(): Promise<Map<string, HealthCheckResult>> {
    const checks = [
      this.checkDatabaseHealth(),
      this.checkAlchemyHealth(1), // Ethereum
      this.checkAlchemyHealth(8453), // Base
    ];

    const results = await Promise.allSettled(checks);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        this.healthChecks.set(result.value.service, result.value);
      } else {
        const serviceName = ['database', 'alchemy-eth', 'alchemy-base'][index];
        this.healthChecks.set(serviceName, {
          service: serviceName,
          status: 'unhealthy',
          error: result.reason?.message || 'Unknown error',
          lastChecked: new Date(),
        });
      }
    });

    return this.healthChecks;
  }

  private async checkDatabaseHealth(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        service: 'database',
        status: 'healthy',
        latency: Date.now() - start,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date(),
      };
    }
  }

  private async checkAlchemyHealth(chainId: number): Promise<HealthCheckResult> {
    const start = Date.now();
    const serviceName = `alchemy-${chainId}`;

    try {
      // Use the chain config to get RPC URL
      const response = await fetch(process.env[`ALCHEMY_${chainId === 1 ? 'ETH' : 'BASE'}_RPC_URL`] || '', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_blockNumber',
          params: [],
        }),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(`RPC Error: ${data.error.message}`);
      }

      const latency = Date.now() - start;
      return {
        service: serviceName,
        status: latency < 1000 ? 'healthy' : 'degraded',
        latency,
        lastChecked: new Date(),
      };
    } catch (error) {
      return {
        service: serviceName,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date(),
      };
    }
  }

  async checkAlerts(): Promise<Array<{ severity: 'warning' | 'critical'; message: string; timestamp: Date }>> {
    const alerts: Array<{ severity: 'warning' | 'critical'; message: string; timestamp: Date }> = [];
    const metrics = await this.getAlchemyUsageMetrics();

    // Check error rate
    if (metrics.errorRate > (this.alertThresholds.get('error_rate') || 0.05)) {
      alerts.push({
        severity: 'critical',
        message: `High error rate: ${(metrics.errorRate * 100).toFixed(1)}%`,
        timestamp: new Date(),
      });
    }

    // Check response time
    if (metrics.averageResponseTime > (this.alertThresholds.get('response_time') || 5000)) {
      alerts.push({
        severity: 'warning',
        message: `High response time: ${metrics.averageResponseTime.toFixed(0)}ms`,
        timestamp: new Date(),
      });
    }

    // Check last successful sync
    if (metrics.lastSyncSuccess) {
      const timeSinceLastSync = Date.now() - metrics.lastSyncSuccess.getTime();
      if (timeSinceLastSync > 30 * 60 * 1000) { // 30 minutes
        alerts.push({
          severity: 'critical',
          message: `No successful sync for ${Math.round(timeSinceLastSync / 60000)} minutes`,
          timestamp: new Date(),
        });
      }
    }

    // Check rate limit hits
    if (metrics.rateLimitHits > (this.alertThresholds.get('rate_limit_hits') || 10)) {
      alerts.push({
        severity: 'warning',
        message: `High rate limit hits: ${metrics.rateLimitHits} in last hour`,
        timestamp: new Date(),
      });
    }

    return alerts;
  }

  getSystemStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: HealthCheckResult[];
    metrics: AlchemyUsageMetrics;
  } {
    const services = Array.from(this.healthChecks.values());
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    for (const service of services) {
      if (service.status === 'unhealthy') {
        overallStatus = 'unhealthy';
        break;
      } else if (service.status === 'degraded' && overallStatus === 'healthy') {
        overallStatus = 'degraded';
      }
    }

    return {
      status: overallStatus,
      services,
      metrics: {
        totalRequests: 0,
        computeUnitsUsed: 0,
        rateLimitHits: 0,
        errorRate: 0,
        averageResponseTime: 0,
        lastSyncSuccess: null,
        failedSyncs: 0,
      }, // Will be populated by getAlchemyUsageMetrics
    };
  }
}

// Create the metrics table if it doesn't exist
export async function initializeMetricsTable(prisma: PrismaClient) {
  try {
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS api_usage_metrics (
        id SERIAL PRIMARY KEY,
        service VARCHAR(32) NOT NULL,
        method VARCHAR(64) NOT NULL,
        chain_id INTEGER,
        success BOOLEAN NOT NULL DEFAULT true,
        response_time_ms INTEGER,
        compute_units INTEGER DEFAULT 1,
        recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

        INDEX idx_service_chain_recorded (service, chain_id, recorded_at),
        INDEX idx_recorded_at (recorded_at)
      )
    `;
  } catch (error) {
    console.warn('Failed to initialize metrics table:', error);
  }
}