import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { messageRoutes } from '../../../src/routes/message.routes.js';
import { errorHandler } from '../../../src/middleware/error-handler.js';
import type { User, MessageDto, PagedResponse } from '../../../src/types/index.js';
import type { Request, Response, NextFunction } from 'express';

// Mock auth middleware to inject user
vi.mock('../../../src/middleware/auth.middleware.js', () => ({
  authRequired: (req: Request, _res: Response, next: NextFunction) => {
    if (!req.headers.authorization) {
      return next({ statusCode: 401, message: '未提供认证令牌', name: 'AppError' });
    }
    (req as any).user = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'test@example.com',
      nickname: 'Tester',
    } as User;
    next();
  },
}));

// Mock service
vi.mock('../../../src/services/message.service.js', () => ({
  sendMessage: vi.fn(),
  getMessagesByGroup: vi.fn(),
  getRecentMessages: vi.fn(),
  getMessageById: vi.fn(),
}));

import {
  sendMessage,
  getMessagesByGroup,
  getRecentMessages,
  getMessageById,
} from '../../../src/services/message.service.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../../src/utils/errors.js';

const mockSendMessage = vi.mocked(sendMessage);
const mockGetMessagesByGroup = vi.mocked(getMessagesByGroup);
const mockGetRecentMessages = vi.mocked(getRecentMessages);
const mockGetMessageById = vi.mocked(getMessageById);

// Build test app
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/messages', messageRoutes);
  app.use(errorHandler);
  return app;
}

const groupId = '22222222-2222-2222-2222-222222222222';
const messageId = '33333333-3333-3333-3333-333333333333';

const sampleDto: MessageDto = {
  id: messageId,
  groupId,
  senderId: '11111111-1111-1111-1111-111111111111',
  senderNickname: 'Tester',
  content: 'Hello world',
  messageType: 'USER',
  replyToId: null,
  replyToContent: null,
  createdAt: '2025-01-01T00:00:00.000Z',
};

// Helper to make requests without external dep
async function request(app: express.Express, method: string, url: string, body?: any, auth = true) {
  return new Promise<{ status: number; body: any }>((resolve) => {
    const http = require('http');
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const options: any = {
        hostname: 'localhost',
        port,
        path: url,
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? { Authorization: 'Bearer test-token' } : {}),
        },
      };

      const req = http.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/messages/group/:groupId', () => {
  it('should return 200 with MessageDto on success', async () => {
    mockSendMessage.mockResolvedValue(sampleDto);
    const app = createApp();
    const res = await request(app, 'POST', `/api/messages/group/${groupId}`, { content: 'Hello world' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(messageId);
    expect(res.body.content).toBe('Hello world');
  });

  it('should return 400 when content is empty', async () => {
    mockSendMessage.mockRejectedValue(new BadRequestError('消息内容不能为空'));
    const app = createApp();
    const res = await request(app, 'POST', `/api/messages/group/${groupId}`, { content: '' });
    expect(res.status).toBe(400);
  });

  it('should return 403 when user is not member', async () => {
    mockSendMessage.mockRejectedValue(new ForbiddenError('你不是该群成员'));
    const app = createApp();
    const res = await request(app, 'POST', `/api/messages/group/${groupId}`, { content: 'hi' });
    expect(res.status).toBe(403);
  });

  it('should pass replyToId to service', async () => {
    const replyToId = '44444444-4444-4444-4444-444444444444';
    mockSendMessage.mockResolvedValue({ ...sampleDto, replyToId, replyToContent: 'original' });
    const app = createApp();
    const res = await request(app, 'POST', `/api/messages/group/${groupId}`, { content: 'reply', replyToId });
    expect(res.status).toBe(200);
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: '11111111-1111-1111-1111-111111111111' }),
      groupId,
      'reply',
      replyToId,
    );
  });
});

describe('GET /api/messages/group/:groupId', () => {
  it('should return paged response', async () => {
    const pagedResponse: PagedResponse<MessageDto> = {
      content: [sampleDto],
      totalElements: 1,
      totalPages: 1,
      size: 50,
      number: 0,
      first: true,
      last: true,
    };
    mockGetMessagesByGroup.mockResolvedValue(pagedResponse);
    const app = createApp();
    const res = await request(app, 'GET', `/api/messages/group/${groupId}?page=0&size=50`);
    expect(res.status).toBe(200);
    expect(res.body.content).toHaveLength(1);
    expect(res.body.totalElements).toBe(1);
  });

  it('should use default page and size', async () => {
    const pagedResponse: PagedResponse<MessageDto> = {
      content: [],
      totalElements: 0,
      totalPages: 1,
      size: 50,
      number: 0,
      first: true,
      last: true,
    };
    mockGetMessagesByGroup.mockResolvedValue(pagedResponse);
    const app = createApp();
    await request(app, 'GET', `/api/messages/group/${groupId}`);
    expect(mockGetMessagesByGroup).toHaveBeenCalledWith(groupId, 0, 50);
  });
});

describe('GET /api/messages/group/:groupId/recent', () => {
  it('should return array of MessageDto', async () => {
    mockGetRecentMessages.mockResolvedValue([sampleDto]);
    const app = createApp();
    const res = await request(app, 'GET', `/api/messages/group/${groupId}/recent?limit=10`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(mockGetRecentMessages).toHaveBeenCalledWith(groupId, 10);
  });
});

describe('GET /api/messages/:messageId', () => {
  it('should return MessageDto when found', async () => {
    mockGetMessageById.mockResolvedValue(sampleDto);
    const app = createApp();
    const res = await request(app, 'GET', `/api/messages/${messageId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(messageId);
  });

  it('should return 404 when not found', async () => {
    mockGetMessageById.mockRejectedValue(new NotFoundError('消息不存在'));
    const app = createApp();
    const res = await request(app, 'GET', `/api/messages/${messageId}`);
    expect(res.status).toBe(404);
  });
});
