import { WebSocket } from 'ws';
import type { JwtPayload } from '../middleware/auth.middleware.js';
import type { User, WsClientMessage, WsServerMessage } from '../types/index.js';
import { query } from '../db/client.js';
import { sendMessage } from '../services/message.service.js';
import { sessionManager } from './ws-session-manager.js';
import { logger } from '../utils/logger.js';

function send(ws: WebSocket, message: WsServerMessage): void {
  ws.send(JSON.stringify(message));
}

function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: 'ERROR', message });
}

export function handleConnection(ws: WebSocket, payload: JwtPayload): void {
  const userId = payload.sub;
  sessionManager.addSession(userId, ws);

  // Fetch user from DB for sendMessage calls
  let user: User | null = null;
  const userReady = query<User>('SELECT * FROM users WHERE id = $1', [userId])
    .then((result) => {
      if (result.rows.length > 0) {
        user = result.rows[0];
      }
    })
    .catch((err) => {
      logger.error({ err, userId }, 'Failed to fetch user for WebSocket session');
    });

  ws.on('message', (raw: Buffer | string) => {
    let msg: WsClientMessage;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
    } catch {
      sendError(ws, '无效的消息格式');
      return;
    }

    switch (msg.type) {
      case 'PING':
        send(ws, { type: 'PONG' });
        break;

      case 'JOIN_GROUP':
        if (!msg.groupId) {
          sendError(ws, '缺少 groupId');
          return;
        }
        sessionManager.joinGroup(userId, msg.groupId);
        send(ws, { type: 'JOINED_GROUP', groupId: msg.groupId });
        break;

      case 'LEAVE_GROUP':
        if (!msg.groupId) {
          sendError(ws, '缺少 groupId');
          return;
        }
        sessionManager.leaveGroup(userId, msg.groupId);
        send(ws, { type: 'LEFT_GROUP', groupId: msg.groupId });
        break;

      case 'SEND_MESSAGE':
        if (!msg.groupId || !msg.content) {
          sendError(ws, '缺少 groupId 或 content');
          return;
        }
        handleSendMessage(ws, userId, msg.groupId, msg.content, msg.replyToId, userReady, () => user);
        break;

      default:
        sendError(ws, `未知的消息类型: ${(msg as any).type}`);
    }
  });

  ws.on('close', () => {
    sessionManager.leaveAllGroups(userId);
    sessionManager.removeSession(userId);
    logger.debug({ userId }, 'WebSocket connection closed');
  });

  ws.on('error', (err) => {
    logger.error({ err, userId }, 'WebSocket error');
  });
}

async function handleSendMessage(
  ws: WebSocket,
  userId: string,
  groupId: string,
  content: string,
  replyToId: string | undefined,
  userReady: Promise<void>,
  getUser: () => User | null,
): Promise<void> {
  try {
    await userReady;
    const user = getUser();
    if (!user) {
      sendError(ws, '用户信息加载失败');
      return;
    }

    const messageDto = await sendMessage(user, groupId, content, replyToId);
    sessionManager.broadcastToGroup(groupId, {
      type: 'NEW_MESSAGE',
      message: messageDto,
    });
  } catch (err: any) {
    logger.error({ err, userId, groupId }, 'Failed to send message via WebSocket');
    sendError(ws, err.message || '发送消息失败');
  }
}
