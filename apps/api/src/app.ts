import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

export interface BuildAppOptions {
  enableRequestLogging?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.enableRequestLogging ?? true,
  });

  await app.register(cors, {
    origin: true,
  });

  app.get('/health', () => ({ status: 'ok' }));

  return app;
}
