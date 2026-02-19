import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
vi.mock('../../../src/db/client.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../../src/agent/context-builder.js', () => ({
  buildContextWindow: vi.fn(),
}));

vi.mock('../../../src/agent/soul.js', () => ({
  buildSystemPrompt: vi.fn(),
}));

vi.mock('../../../src/agent/memory/memory-manager.js', () => ({
  MemoryManager: vi.fn().mockImplementation(() => ({
    getPermanentMemories: vi.fn().mockResolvedValue(''),
    appendSessionHistory: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('../../../src/websocket/ws-session-manager.js', () => ({
  sessionManager: {
    broadcastToGroup: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { query } from '../../../src/db/client.js';
import { buildContextWindow } from '../../../src/agent/context-builder.js';
import { buildSystemPrompt } from '../../../src/agent/soul.js';
import { sessionManager } from '../../../src/websocket/ws-session-manager.js';
import { AIService } from '../../../src/agent/ai-service.js';

const mockQuery = vi.mocked(query);
const mockBuildContext = vi.mocked(buildContextWindow);
const mockBuildPrompt = vi.mocked(buildSystemPrompt);
const mockBroadcast = vi.mocked(sessionManager.broadcastToGroup);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DEEPSEEK_API_KEY = 'test-key';
});

const groupId = '22222222-2222-2222-2222-222222222222';
const messageId = '33333333-3333-3333-3333-333333333333';

describe('AIService', () => {
  let aiService: AIService;

  beforeEach(() => {
    aiService = new AIService();
  });

  it('should call DeepSeek API and broadcast AI response', async () => {
    mockBuildContext.mockResolvedValue([
      { role: 'user', content: 'Alice: @AI hello' },
    ]);
    mockBuildPrompt.mockResolvedValue('You are A宝');

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hi! I am A宝.' } }],
      }),
    });

    // Insert AI message returns row
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'ai-msg-1',
        group_id: groupId,
        sender_id: null,
        content: 'Hi! I am A宝.',
        message_type: 'AI',
        reply_to_id: messageId,
        created_at: new Date('2025-01-01'),
      }],
      rowCount: 1, command: '', oid: 0, fields: [],
    });

    await aiService.processMessage(
      { id: messageId, content: '@AI hello', message_type: 'USER' } as any,
      groupId,
    );

    // Verify DeepSeek API was called
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchArgs = mockFetch.mock.calls[0];
    expect(fetchArgs[0]).toBe('https://api.deepseek.com/v1/chat/completions');
    const body = JSON.parse(fetchArgs[1].body);
    expect(body.model).toBe('deepseek-chat');
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('You are A宝');

    // Verify AI message was saved to DB
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const insertArgs = mockQuery.mock.calls[0];
    expect(insertArgs[0]).toContain('INSERT INTO messages');
    expect(insertArgs[0]).toContain('AI');

    // Verify broadcast
    expect(mockBroadcast).toHaveBeenCalledTimes(1);
    const broadcastMsg = mockBroadcast.mock.calls[0][1];
    expect(broadcastMsg.type).toBe('NEW_MESSAGE');
  });

  it('should send fallback message on API failure', async () => {
    mockBuildContext.mockResolvedValue([
      { role: 'user', content: 'Alice: @AI hello' },
    ]);
    mockBuildPrompt.mockResolvedValue('You are A宝');

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    // Insert fallback message
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'fallback-1',
        group_id: groupId,
        sender_id: null,
        content: '抱歉，我暂时无法回复，请稍后再试。',
        message_type: 'AI',
        reply_to_id: messageId,
        created_at: new Date(),
      }],
      rowCount: 1, command: '', oid: 0, fields: [],
    });

    await aiService.processMessage(
      { id: messageId, content: '@AI hello', message_type: 'USER' } as any,
      groupId,
    );

    // Should still broadcast fallback
    expect(mockBroadcast).toHaveBeenCalledTimes(1);
    const broadcastMsg = mockBroadcast.mock.calls[0][1];
    expect(broadcastMsg.message.content).toBe('抱歉，我暂时无法回复，请稍后再试。');
  });

  it('should skip processing when no API key', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    aiService = new AIService();

    await aiService.processMessage(
      { id: messageId, content: '@AI hello', message_type: 'USER' } as any,
      groupId,
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should include reply context in API call', async () => {
    mockBuildContext.mockResolvedValue([
      { role: 'assistant', content: 'Previous AI response' },
      { role: 'user', content: 'Alice: continue please' },
    ]);
    mockBuildPrompt.mockResolvedValue('You are A宝');

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Continuing...' } }],
      }),
    });

    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'ai-msg-2', group_id: groupId, sender_id: null,
        content: 'Continuing...', message_type: 'AI',
        reply_to_id: messageId, created_at: new Date(),
      }],
      rowCount: 1, command: '', oid: 0, fields: [],
    });

    await aiService.processMessage(
      { id: messageId, content: 'continue please', message_type: 'USER' } as any,
      groupId,
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // system + 2 context messages
    expect(body.messages).toHaveLength(3);
    expect(body.messages[1].role).toBe('assistant');
    expect(body.messages[2].role).toBe('user');
  });

  it('should handle fetch network error gracefully', async () => {
    mockBuildContext.mockResolvedValue([
      { role: 'user', content: 'Alice: @AI hello' },
    ]);
    mockBuildPrompt.mockResolvedValue('You are A宝');

    mockFetch.mockRejectedValue(new Error('Network error'));

    // Insert fallback
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'fallback-2', group_id: groupId, sender_id: null,
        content: '抱歉，我暂时无法回复，请稍后再试。', message_type: 'AI',
        reply_to_id: messageId, created_at: new Date(),
      }],
      rowCount: 1, command: '', oid: 0, fields: [],
    });

    // Should not throw
    await aiService.processMessage(
      { id: messageId, content: '@AI hello', message_type: 'USER' } as any,
      groupId,
    );

    expect(mockBroadcast).toHaveBeenCalledTimes(1);
  });
});
