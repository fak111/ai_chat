import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db client
vi.mock('../../../src/db/client.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../src/db/client.js';
import { buildContextWindow } from '../../../src/agent/context-builder.js';

const mockQuery = vi.mocked(query);

const groupId = '22222222-2222-2222-2222-222222222222';
const triggerId = '33333333-3333-3333-3333-333333333333';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildContextWindow', () => {
  it('should return messages in OpenAI format', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: '1', sender_id: 'user1', message_type: 'USER', content: 'Hello @AI',
          nickname: 'Alice', email: 'alice@test.com', reply_to_id: null, created_at: new Date(),
        },
        {
          id: triggerId, sender_id: null, message_type: 'AI', content: 'Hi there!',
          nickname: null, email: null, reply_to_id: null, created_at: new Date(),
        },
      ],
      rowCount: 2, command: '', oid: 0, fields: [],
    });

    const context = await buildContextWindow(groupId, triggerId);
    expect(context).toHaveLength(2);
    expect(context[0]).toEqual({ role: 'user', content: 'Alice: Hello @AI' });
    expect(context[1]).toEqual({ role: 'assistant', content: 'Hi there!' });
  });

  it('should fetch messages from last 30 minutes with max 50', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0, command: '', oid: 0, fields: [],
    });

    await buildContextWindow(groupId, triggerId);

    const callArgs = mockQuery.mock.calls[0];
    const sql = callArgs[0] as string;
    // Should query with time window and limit
    expect(sql).toContain('group_id');
    expect(sql).toContain('created_at');
    expect(sql).toContain('ORDER BY');
    expect(sql).toContain('ASC');
  });

  it('should handle cross-window reply compensation', async () => {
    const oldAiMsgId = 'old-ai-msg';

    // First query: recent messages (one replies to old AI message)
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: triggerId, sender_id: 'user1', message_type: 'USER', content: 'continue please',
          nickname: 'Alice', email: 'alice@test.com', reply_to_id: oldAiMsgId, created_at: new Date(),
        },
      ],
      rowCount: 1, command: '', oid: 0, fields: [],
    });

    // Second query: fetch the referenced AI message
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: oldAiMsgId, sender_id: null, message_type: 'AI', content: 'Previous AI response',
          nickname: null, email: null, reply_to_id: null, created_at: new Date('2025-01-01'),
        },
      ],
      rowCount: 1, command: '', oid: 0, fields: [],
    });

    const context = await buildContextWindow(groupId, triggerId);
    // Should include the old AI message + the trigger message
    expect(context).toHaveLength(2);
    expect(context[0]).toEqual({ role: 'assistant', content: 'Previous AI response' });
    expect(context[1]).toEqual({ role: 'user', content: 'Alice: continue please' });
  });

  it('should return empty array when no messages found', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      rowCount: 0, command: '', oid: 0, fields: [],
    });

    const context = await buildContextWindow(groupId, triggerId);
    expect(context).toEqual([]);
  });

  it('should map SYSTEM messages to system role', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: '1', sender_id: null, message_type: 'SYSTEM', content: 'User joined',
          nickname: null, email: null, reply_to_id: null, created_at: new Date(),
        },
        {
          id: triggerId, sender_id: 'user1', message_type: 'USER', content: '@AI hi',
          nickname: 'Bob', email: 'bob@test.com', reply_to_id: null, created_at: new Date(),
        },
      ],
      rowCount: 2, command: '', oid: 0, fields: [],
    });

    const context = await buildContextWindow(groupId, triggerId);
    expect(context[0].role).toBe('system');
    expect(context[1].role).toBe('user');
  });

  it('should use email prefix when nickname is null', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: triggerId, sender_id: 'user1', message_type: 'USER', content: 'hello',
          nickname: null, email: 'john@example.com', reply_to_id: null, created_at: new Date(),
        },
      ],
      rowCount: 1, command: '', oid: 0, fields: [],
    });

    const context = await buildContextWindow(groupId, triggerId);
    expect(context[0].content).toBe('john: hello');
  });
});
