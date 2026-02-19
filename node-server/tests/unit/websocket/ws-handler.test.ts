import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../../../src/db/client.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../../src/services/message.service.js', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('../../../src/websocket/ws-session-manager.js', () => {
  const WsSessionManager = vi.fn();
  const instance = {
    addSession: vi.fn(),
    removeSession: vi.fn(),
    joinGroup: vi.fn(),
    leaveGroup: vi.fn(),
    leaveAllGroups: vi.fn(),
    getGroupMembers: vi.fn().mockReturnValue(new Set()),
    getUserSession: vi.fn(),
    broadcastToGroup: vi.fn(),
    isOnline: vi.fn(),
  };
  return { WsSessionManager, sessionManager: instance };
});

import { query } from '../../../src/db/client.js';
import { sendMessage } from '../../../src/services/message.service.js';
import { sessionManager } from '../../../src/websocket/ws-session-manager.js';
import { handleConnection } from '../../../src/websocket/ws-handler.js';
import type { JwtPayload } from '../../../src/middleware/auth.middleware.js';
import type { MessageDto } from '../../../src/types/index.js';

const mockQuery = vi.mocked(query);
const mockSendMessage = vi.mocked(sendMessage);
const mockSessionManager = vi.mocked(sessionManager);

// Helper to create mock WebSocket
function createMockWs(): any {
  const handlers: Record<string, Function[]> = {};
  return {
    send: vi.fn(),
    on: vi.fn((event: string, handler: Function) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    close: vi.fn(),
    readyState: 1,
    OPEN: 1,
    _handlers: handlers,
    _emit(event: string, ...args: any[]) {
      for (const h of handlers[event] || []) {
        h(...args);
      }
    },
  };
}

const userId = '11111111-1111-1111-1111-111111111111';
const groupId = '22222222-2222-2222-2222-222222222222';
const messageId = '33333333-3333-3333-3333-333333333333';

const mockPayload: JwtPayload = {
  sub: userId,
  email: 'test@example.com',
  type: 'access',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 7200,
};

const mockUser = {
  id: userId,
  email: 'test@example.com',
  password_hash: 'hashed',
  nickname: 'Tester',
  avatar_url: null,
  email_verified: true,
  verification_token: null,
  verification_token_expires_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockMessageDto: MessageDto = {
  id: messageId,
  groupId: groupId,
  senderId: userId,
  senderNickname: 'Tester',
  content: 'Hello world',
  messageType: 'USER',
  replyToId: null,
  replyToContent: null,
  createdAt: '2025-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleConnection', () => {
  it('should register session and set up event handlers', () => {
    const ws = createMockWs();
    // Mock DB lookup for user
    mockQuery.mockResolvedValueOnce({
      rows: [mockUser], rowCount: 1, command: '', oid: 0, fields: [],
    });

    handleConnection(ws, mockPayload);

    expect(mockSessionManager.addSession).toHaveBeenCalledWith(userId, ws);
    expect(ws.on).toHaveBeenCalledWith('message', expect.any(Function));
    expect(ws.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(ws.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('should clean up on close', () => {
    const ws = createMockWs();
    mockQuery.mockResolvedValueOnce({
      rows: [mockUser], rowCount: 1, command: '', oid: 0, fields: [],
    });

    handleConnection(ws, mockPayload);
    ws._emit('close');

    expect(mockSessionManager.leaveAllGroups).toHaveBeenCalledWith(userId);
    expect(mockSessionManager.removeSession).toHaveBeenCalledWith(userId);
  });
});

describe('message handling', () => {
  let ws: any;

  beforeEach(() => {
    ws = createMockWs();
    // Mock DB lookup for user - needs to resolve before messages are processed
    mockQuery.mockResolvedValueOnce({
      rows: [mockUser], rowCount: 1, command: '', oid: 0, fields: [],
    });
    handleConnection(ws, mockPayload);
  });

  describe('PING', () => {
    it('should respond with PONG', () => {
      ws._emit('message', JSON.stringify({ type: 'PING' }));

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'PONG' }));
    });
  });

  describe('JOIN_GROUP', () => {
    it('should join group and respond with JOINED_GROUP', () => {
      ws._emit('message', JSON.stringify({ type: 'JOIN_GROUP', groupId }));

      expect(mockSessionManager.joinGroup).toHaveBeenCalledWith(userId, groupId);
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'JOINED_GROUP', groupId }),
      );
    });

    it('should send ERROR when groupId is missing', () => {
      ws._emit('message', JSON.stringify({ type: 'JOIN_GROUP' }));

      expect(mockSessionManager.joinGroup).not.toHaveBeenCalled();
      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ERROR"'),
      );
    });
  });

  describe('LEAVE_GROUP', () => {
    it('should leave group and respond with LEFT_GROUP', () => {
      ws._emit('message', JSON.stringify({ type: 'LEAVE_GROUP', groupId }));

      expect(mockSessionManager.leaveGroup).toHaveBeenCalledWith(userId, groupId);
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'LEFT_GROUP', groupId }),
      );
    });

    it('should send ERROR when groupId is missing', () => {
      ws._emit('message', JSON.stringify({ type: 'LEAVE_GROUP' }));

      expect(mockSessionManager.leaveGroup).not.toHaveBeenCalled();
      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ERROR"'),
      );
    });
  });

  describe('SEND_MESSAGE', () => {
    it('should send message and broadcast to group', async () => {
      mockSendMessage.mockResolvedValueOnce(mockMessageDto);

      ws._emit('message', JSON.stringify({
        type: 'SEND_MESSAGE',
        groupId,
        content: 'Hello world',
      }));

      // Wait for async handler
      await vi.waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalled();
      });

      // sendMessage is called with user object from DB lookup
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: userId }),
        groupId,
        'Hello world',
        undefined,
      );

      expect(mockSessionManager.broadcastToGroup).toHaveBeenCalledWith(
        groupId,
        { type: 'NEW_MESSAGE', message: mockMessageDto },
      );
    });

    it('should pass replyToId when provided', async () => {
      const replyToId = '44444444-4444-4444-4444-444444444444';
      mockSendMessage.mockResolvedValueOnce({
        ...mockMessageDto,
        replyToId,
        replyToContent: 'original',
      });

      ws._emit('message', JSON.stringify({
        type: 'SEND_MESSAGE',
        groupId,
        content: 'reply',
        replyToId,
      }));

      await vi.waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalled();
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ id: userId }),
        groupId,
        'reply',
        replyToId,
      );
    });

    it('should send ERROR when content is missing', () => {
      ws._emit('message', JSON.stringify({
        type: 'SEND_MESSAGE',
        groupId,
      }));

      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ERROR"'),
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should send ERROR when groupId is missing', () => {
      ws._emit('message', JSON.stringify({
        type: 'SEND_MESSAGE',
        content: 'hello',
      }));

      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ERROR"'),
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should send ERROR when sendMessage throws', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('DB error'));

      ws._emit('message', JSON.stringify({
        type: 'SEND_MESSAGE',
        groupId,
        content: 'hello',
      }));

      await vi.waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalled();
      });

      // Should have sent an error message
      const errorCalls = ws.send.mock.calls.filter(
        (c: any[]) => c[0].includes('"type":"ERROR"'),
      );
      expect(errorCalls.length).toBeGreaterThan(0);
    });
  });

  describe('unknown message type', () => {
    it('should send ERROR for unknown message type', () => {
      ws._emit('message', JSON.stringify({ type: 'UNKNOWN' }));

      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ERROR"'),
      );
    });
  });

  describe('invalid JSON', () => {
    it('should send ERROR for non-JSON message', () => {
      ws._emit('message', 'not json');

      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"ERROR"'),
      );
    });
  });
});
