import { WebSocketServer } from 'ws';
import http from 'http';
import url from 'url';
import { verifyAccessToken } from '../middleware/auth.middleware.js';
import { handleConnection } from './ws-handler.js';
import { logger } from '../utils/logger.js';

export function createWsServer(server: http.Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { query: params } = url.parse(request.url || '', true);
    const token = params.token as string;

    if (!token) {
      logger.warn('WebSocket upgrade rejected: no token');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const payload = verifyAccessToken(token);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, payload);
      });
    } catch {
      logger.warn('WebSocket upgrade rejected: invalid token');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws: any, _request: any, payload: any) => {
    handleConnection(ws, payload);
  });

  logger.info('WebSocket server initialized');
}
