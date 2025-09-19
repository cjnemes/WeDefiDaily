import { buildApp } from './app';
import { env } from './config';

async function start() {
  const app = await buildApp({ enableRequestLogging: true });
  const port = env.PORT;
  const host = env.HOST;

  try {
    await app.listen({ port, host });
    app.log.info(`API listening on http://${host}:${port}`);
  } catch (error) {
    app.log.error(error, 'Failed to start server');
    process.exit(1);
  }
}

void start();
