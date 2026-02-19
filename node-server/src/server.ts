import { app } from './app.js';
import { createWsServer } from './websocket/ws-server.js';
import { logger } from './utils/logger.js';
import { testConnection } from './db/client.js';
import http from 'http';

const PORT = parseInt(process.env.PORT || '8080');

async function main() {
  const dbOk = await testConnection();
  if (!dbOk) {
    logger.error('Failed to connect to database');
    process.exit(1);
  }
  logger.info('Database connected');

  const server = http.createServer(app);

  createWsServer(server);

  server.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server started');
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
