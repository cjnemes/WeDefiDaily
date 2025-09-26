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

  app.get('/health', async (request, reply) => {
    try {
      await app.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      return { status: 'ok', db: 'up' };
    } catch (error) {
      request.log.error(error, 'database health check failed');
      reply.status(503);
      return { status: 'degraded', db: 'down' };
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

  return app;
}
