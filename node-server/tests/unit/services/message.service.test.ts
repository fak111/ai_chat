import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db client before importing service
vi.mock('../../../src/db/client.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../src/db/client.js';
import {
  sendMessage,
  getMessagesByGroup,
  getRecentMessages,
  getMessageById,
  shouldTriggerAI,
  buildMessageDto,
} from '../../../src/services/message.service.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../../src/utils/errors.js';

const mockQuery = vi.mocked(query);

// Test fixtures
const userId = '11111111-1111-1111-1111-111111111111';
const groupId = '22222222-2222-2222-2222-222222222222';
const messageId = '33333333-3333-3333-3333-333333333333';
const replyToId = '44444444-4444-4444-4444-444444444444';

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

const mockMessageRow = {
  id: messageId,
  group_id: groupId,
  sender_id: userId,
  content: 'Hello world',
  message_type: 'USER',
  reply_to_id: null,
  created_at: new Date('2025-01-01T00:00:00Z'),
  nickname: 'Tester',
  email: 'test@example.com',
  reply_content: null,
  reply_message_type: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('shouldTriggerAI', () => {
  it('should return true when content contains @AI', () => {
    expect(shouldTriggerAI('@AI hello', null)).toBe(true);
  });

  it('should return true when content contains @ai', () => {
    expect(shouldTriggerAI('@ai hello', null)).toBe(true);
  });

  it('should return true when content contains @Ai in middle', () => {
    expect(shouldTriggerAI('hey @Ai what do you think?', null)).toBe(true);
  });

  it('should return false for @AIR (word boundary)', () => {
    expect(shouldTriggerAI('@AIR conditioning', null)).toBe(false);
  });

  it('should return true when replying to AI message', () => {
    expect(shouldTriggerAI('I agree', 'AI')).toBe(true);
  });

  it('should return false for normal message', () => {
    expect(shouldTriggerAI('hello world', null)).toBe(false);
    expect(shouldTriggerAI('hello world', 'USER')).toBe(false);
  });
});

describe('buildMessageDto', () => {
  it('should build MessageDto from DB row', () => {
    const dto = buildMessageDto(mockMessageRow);
    expect(dto).toEqual({
      id: messageId,
      groupId: groupId,
      senderId: userId,
      senderNickname: 'Tester',
      content: 'Hello world',
      messageType: 'USER',
      replyToId: null,
      replyToContent: null,
      createdAt: '2025-01-01T00:00:00.000Z',
    });
  });

  it('should use email prefix as nickname fallback', () => {
    const row = { ...mockMessageRow, nickname: null, email: 'john@example.com' };
    const dto = buildMessageDto(row);
    expect(dto.senderNickname).toBe('john');
  });

  it('should set senderNickname to null for AI messages', () => {
    const row = { ...mockMessageRow, message_type: 'AI', sender_id: null, nickname: null, email: null };
    const dto = buildMessageDto(row);
    expect(dto.senderNickname).toBeNull();
  });

  it('should set senderNickname to null for SYSTEM messages', () => {
    const row = { ...mockMessageRow, message_type: 'SYSTEM', sender_id: null, nickname: null, email: null };
    const dto = buildMessageDto(row);
    expect(dto.senderNickname).toBeNull();
  });

  it('should truncate replyToContent over 50 chars', () => {
    const longContent = 'a'.repeat(60);
    const row = { ...mockMessageRow, reply_to_id: replyToId, reply_content: longContent };
    const dto = buildMessageDto(row);
    expect(dto.replyToContent).toBe('a'.repeat(50) + '...');
    expect(dto.replyToId).toBe(replyToId);
  });

  it('should not truncate replyToContent under 50 chars', () => {
    const row = { ...mockMessageRow, reply_to_id: replyToId, reply_content: 'short reply' };
    const dto = buildMessageDto(row);
    expect(dto.replyToContent).toBe('short reply');
  });
});

describe('sendMessage', () => {
  it('should throw BadRequestError when content is empty', async () => {
    await expect(sendMessage(mockUser, groupId, '', undefined)).rejects.toThrow(BadRequestError);
    await expect(sendMessage(mockUser, groupId, '   ', undefined)).rejects.toThrow(BadRequestError);
  });

  it('should throw ForbiddenError when user is not a group member', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });
    await expect(sendMessage(mockUser, groupId, 'hello', undefined)).rejects.toThrow(ForbiddenError);
  });

  it('should send message and return MessageDto', async () => {
    // Check membership
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1, command: '', oid: 0, fields: [] });
    // Insert message and return with JOIN
    mockQuery.mockResolvedValueOnce({
      rows: [mockMessageRow],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    const result = await sendMessage(mockUser, groupId, 'Hello world', undefined);
    expect(result.content).toBe('Hello world');
    expect(result.messageType).toBe('USER');
    expect(result.senderId).toBe(userId);
    expect(result.senderNickname).toBe('Tester');
  });

  it('should handle replyToId and fetch reply content', async () => {
    const rowWithReply = {
      ...mockMessageRow,
      reply_to_id: replyToId,
      reply_content: 'original message',
      reply_message_type: 'USER',
    };

    // Check membership
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1, command: '', oid: 0, fields: [] });
    // Insert message
    mockQuery.mockResolvedValueOnce({ rows: [rowWithReply], rowCount: 1, command: '', oid: 0, fields: [] });

    const result = await sendMessage(mockUser, groupId, 'reply msg', replyToId);
    expect(result.replyToId).toBe(replyToId);
    expect(result.replyToContent).toBe('original message');
  });

  it('should detect AI trigger and log (not throw)', async () => {
    // Check membership
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1, command: '', oid: 0, fields: [] });
    // Insert message
    mockQuery.mockResolvedValueOnce({ rows: [mockMessageRow], rowCount: 1, command: '', oid: 0, fields: [] });

    // Should not throw even when AI trigger detected
    const result = await sendMessage(mockUser, groupId, '@AI hello', undefined);
    expect(result).toBeDefined();
  });

  it('should detect AI trigger when replying to AI message', async () => {
    const rowWithAiReply = {
      ...mockMessageRow,
      reply_to_id: replyToId,
      reply_content: 'AI response',
      reply_message_type: 'AI',
    };

    // Check membership
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1, command: '', oid: 0, fields: [] });
    // Insert message
    mockQuery.mockResolvedValueOnce({ rows: [rowWithAiReply], rowCount: 1, command: '', oid: 0, fields: [] });

    const result = await sendMessage(mockUser, groupId, 'I agree', replyToId);
    expect(result).toBeDefined();
  });
});

describe('getMessagesByGroup', () => {
  it('should return paged response with defaults', async () => {
    // Count query
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: '3' }], rowCount: 1, command: '', oid: 0, fields: [],
    });
    // Messages query
    mockQuery.mockResolvedValueOnce({
      rows: [mockMessageRow, mockMessageRow, mockMessageRow],
      rowCount: 3,
      command: '',
      oid: 0,
      fields: [],
    });

    const result = await getMessagesByGroup(groupId, 0, 50);
    expect(result.totalElements).toBe(3);
    expect(result.totalPages).toBe(1);
    expect(result.size).toBe(50);
    expect(result.number).toBe(0);
    expect(result.first).toBe(true);
    expect(result.last).toBe(true);
    expect(result.content).toHaveLength(3);
  });

  it('should calculate pagination correctly', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: '150' }], rowCount: 1, command: '', oid: 0, fields: [],
    });
    mockQuery.mockResolvedValueOnce({
      rows: Array(50).fill(mockMessageRow),
      rowCount: 50,
      command: '',
      oid: 0,
      fields: [],
    });

    const result = await getMessagesByGroup(groupId, 1, 50);
    expect(result.totalElements).toBe(150);
    expect(result.totalPages).toBe(3);
    expect(result.number).toBe(1);
    expect(result.first).toBe(false);
    expect(result.last).toBe(false);
  });

  it('should clamp size to max 100', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ count: '0' }], rowCount: 1, command: '', oid: 0, fields: [],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [], rowCount: 0, command: '', oid: 0, fields: [],
    });

    await getMessagesByGroup(groupId, 0, 200);
    // Check that the LIMIT parameter was clamped to 100
    const callArgs = mockQuery.mock.calls[1];
    expect(callArgs[1]).toContain(100); // params array should contain 100
  });
});

describe('getRecentMessages', () => {
  it('should return array of MessageDto', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [mockMessageRow, mockMessageRow],
      rowCount: 2,
      command: '',
      oid: 0,
      fields: [],
    });

    const result = await getRecentMessages(groupId, 50);
    expect(result).toHaveLength(2);
    expect(result[0].groupId).toBe(groupId);
  });

  it('should clamp limit to max 100', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [], rowCount: 0, command: '', oid: 0, fields: [],
    });

    await getRecentMessages(groupId, 200);
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[1]).toContain(100);
  });

  it('should default limit to 50', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [], rowCount: 0, command: '', oid: 0, fields: [],
    });

    await getRecentMessages(groupId);
    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[1]).toContain(50);
  });
});

describe('getMessageById', () => {
  it('should return MessageDto when message exists', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [mockMessageRow],
      rowCount: 1,
      command: '',
      oid: 0,
      fields: [],
    });

    const result = await getMessageById(messageId);
    expect(result.id).toBe(messageId);
    expect(result.content).toBe('Hello world');
  });

  it('should throw NotFoundError when message does not exist', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [], rowCount: 0, command: '', oid: 0, fields: [],
    });

    await expect(getMessageById(messageId)).rejects.toThrow(NotFoundError);
  });
});
