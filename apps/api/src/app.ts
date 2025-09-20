import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { Prisma } from '@prisma/client';

import prismaPlugin from './plugins/prisma';
import { walletRoutes } from './routes/wallets';
import { portfolioRoutes } from './routes/portfolio';
import { governanceRoutes } from './routes/governance';

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

  return app;
}
