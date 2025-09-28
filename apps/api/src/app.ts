import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { Prisma } from '@prisma/client';

import prismaPlugin from './plugins/prisma';
import { walletRoutes } from './routes/wallets';
import { portfolioRoutes } from './routes/portfolio';
import { governanceRoutes } from './routes/governance';
import { rewardsRoutes } from './routes/rewards';
import { gammaswapRoutes } from './routes/gammaswap';
import { alertsRoutes } from './routes/alerts';
import { priceThresholdRoutes } from './routes/price-thresholds';
import { tokenRoutes } from './routes/tokens';
import { performanceRoutes } from './routes/performance';
import { riskAnalyticsRoutes } from './routes/risk-analytics';
import { digestRoutes } from './routes/digest';
import { liquidityAnalyticsRoutes } from './routes/liquidity-analytics';
import { syncRoutes } from './routes/sync';
import { opportunityRoutes } from './routes/opportunities';
import { gasEstimationRoutes } from './routes/gas-estimation';
import { getHealthCheckService } from './services/health-check';

export interface BuildAppOptions {
  enableRequestLogging?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.enableRequestLogging ?? true,
  });

  await app.register(prismaPlugin);
  await app.register(cors, {
    origin: true,
  });

  // Health check endpoints for production monitoring
  app.get('/health', async (request, reply) => {
    try {
      const healthCheckService = getHealthCheckService(app.prisma);
      const healthStatus = await healthCheckService.performHealthCheck();

      // Set appropriate HTTP status code
      if (healthStatus.status === 'unhealthy') {
        reply.status(503);
      } else if (healthStatus.status === 'degraded') {
        reply.status(200); // Still serving traffic but with warnings
      } else {
        reply.status(200);
      }

      return healthStatus;
    } catch (error) {
      request.log.error(error, 'comprehensive health check failed');
      reply.status(503);
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check service unavailable',
        services: {},
        overall: {
          uptime: 0,
          version: '0.1.0',
          environment: process.env.NODE_ENV || 'development',
        },
      };
    }
  });

  // Kubernetes-style liveness probe (simple check)
  app.get('/health/live', async (request, reply) => {
    try {
      const healthCheckService = getHealthCheckService(app.prisma);
      const isAlive = await healthCheckService.isAlive();

      if (isAlive) {
        return { status: 'alive', timestamp: new Date().toISOString() };
      } else {
        reply.status(503);
        return { status: 'dead', timestamp: new Date().toISOString() };
      }
    } catch (error) {
      reply.status(503);
      return { status: 'dead', timestamp: new Date().toISOString(), error: 'Liveness check failed' };
    }
  });

  // Kubernetes-style readiness probe (ready to serve traffic)
  app.get('/health/ready', async (request, reply) => {
    try {
      const healthCheckService = getHealthCheckService(app.prisma);
      const isReady = await healthCheckService.isReady();

      if (isReady) {
        return { status: 'ready', timestamp: new Date().toISOString() };
      } else {
        reply.status(503);
        return { status: 'not-ready', timestamp: new Date().toISOString() };
      }
    } catch (error) {
      reply.status(503);
      return { status: 'not-ready', timestamp: new Date().toISOString(), error: 'Readiness check failed' };
    }
  });

  // Detailed metrics endpoint for monitoring dashboards
  app.get('/health/metrics', async (request, reply) => {
    try {
      const healthCheckService = getHealthCheckService(app.prisma);
      const metrics = await healthCheckService.getDetailedMetrics();
      return metrics;
    } catch (error) {
      request.log.error(error, 'metrics collection failed');
      reply.status(500);
      return { error: 'Metrics collection failed' };
    }
  });

  await app.register(walletRoutes, { prefix: '/v1/wallets' });
  await app.register(portfolioRoutes, { prefix: '/v1/portfolio' });
  await app.register(governanceRoutes, { prefix: '/v1/governance' });
  await app.register(rewardsRoutes, { prefix: '/v1/rewards' });
  await app.register(gammaswapRoutes, { prefix: '/v1/gammaswap' });
  await app.register(alertsRoutes, { prefix: '/v1/alerts' });
  await app.register(priceThresholdRoutes, { prefix: '/v1/price-thresholds' });
  await app.register(tokenRoutes, { prefix: '/v1/tokens' });
  await app.register(performanceRoutes, { prefix: '/v1/performance' });
  await app.register(riskAnalyticsRoutes, { prefix: '/v1/risk-analytics' });
  await app.register(digestRoutes, { prefix: '/v1/digest' });
  await app.register(liquidityAnalyticsRoutes, { prefix: '/v1/liquidity' });
  await app.register(syncRoutes, { prefix: '/v1/sync' });
  await app.register(opportunityRoutes, { prefix: '/v1/opportunities' });
  await app.register(gasEstimationRoutes, { prefix: '/v1/gas' });

  return app;
}
