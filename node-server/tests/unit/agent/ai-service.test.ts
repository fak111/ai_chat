import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock all external dependencies ---

vi.mock('../../../src/db/client.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../../src/agent/context-builder.js', () => ({
  buildContextWindow: vi.fn(),
  buildGroupContext: vi.fn().mockResolvedValue('群成员:\n- Tester\n- A宝 (AI助手)'),
}));

vi.mock('../../../src/agent/soul.js', () => ({
  buildSystemPrompt: vi.fn(),
}));

vi.mock('../../../src/agent/user-profiler.js', () => ({
  updateGroupProfiles: vi.fn().mockResolvedValue(undefined),
  getProfileSummary: vi.fn().mockResolvedValue(''),
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

// Mock all tool imports
vi.mock('../../../src/agent/tools/builtin/bash-tool.js', () => ({
  bashTool: { name: 'bash', description: 'mock', execute: vi.fn() },
}));
vi.mock('../../../src/agent/tools/builtin/query-db-tool.js', () => ({
  queryDbTool: { name: 'query_db', description: 'mock', execute: vi.fn() },
}));
vi.mock('../../../src/agent/tools/builtin/remember-tool.js', () => ({
  createRememberTool: vi.fn(() => ({ name: 'remember', description: 'mock', execute: vi.fn() })),
}));
vi.mock('../../../src/agent/tools/builtin/read-file-tool.js', () => ({
  readFileTool: { name: 'read_file', description: 'mock', execute: vi.fn() },
}));
vi.mock('../../../src/agent/tools/builtin/edit-file-tool.js', () => ({
  editFileTool: { name: 'edit_file', description: 'mock', execute: vi.fn() },
}));
vi.mock('../../../src/agent/tools/builtin/create-skill-tool.js', () => ({
  createSkillTool: vi.fn(() => ({ name: 'create_skill', description: 'mock', execute: vi.fn() })),
}));
vi.mock('../../../src/agent/tools/builtin/web-search-tool.js', () => ({
  webSearchTool: { name: 'web_search', description: 'mock', execute: vi.fn() },
}));
vi.mock('../../../src/agent/tools/builtin/web-fetch-tool.js', () => ({
  webFetchTool: { name: 'web_fetch', description: 'mock', execute: vi.fn() },
}));

// Mock SkillLoader
vi.mock('../../../src/agent/tools/skill-loader.js', () => ({
  SkillLoader: vi.fn().mockImplementation(() => ({
    loadAll: vi.fn().mockResolvedValue(undefined),
    startWatching: vi.fn(),
    dispose: vi.fn(),
    getAllTools: vi.fn().mockReturnValue([]),
    getLoadedSkills: vi.fn().mockReturnValue([]),
    getPromptFragment: vi.fn().mockReturnValue(''),
    onChange: null,
  })),
}));

// Mock Pi Agent framework
const mockPrompt = vi.fn().mockResolvedValue(undefined);
const mockSubscribe = vi.fn().mockReturnValue(vi.fn()); // returns unsubscribe fn
const mockSetSystemPrompt = vi.fn();
const mockSetTools = vi.fn();

vi.mock('@mariozechner/pi-agent-core', () => ({
  Agent: vi.fn().mockImplementation(() => ({
    prompt: mockPrompt,
    subscribe: mockSubscribe,
    setSystemPrompt: mockSetSystemPrompt,
    setTools: mockSetTools,
  })),
}));

vi.mock('@mariozechner/pi-ai', () => ({
  registerBuiltInApiProviders: vi.fn(),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

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

  it('should process message via Pi Agent and broadcast response', async () => {
    mockBuildContext.mockResolvedValue([
      { role: 'user', content: 'Alice: @AI hello' },
    ]);
    mockBuildPrompt.mockResolvedValue('You are A宝');

    // Simulate Agent producing text via subscribe callback
    mockSubscribe.mockImplementation((callback: (event: any) => void) => {
      // Simulate streaming text events
      callback({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Hi! I am A宝.' },
      });
      return vi.fn(); // unsubscribe
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

    // Agent.prompt was called
    expect(mockPrompt).toHaveBeenCalledTimes(1);

    // AI message was saved to DB
    expect(mockQuery).toHaveBeenCalled();
    const insertCall = mockQuery.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('INSERT INTO messages'),
    );
    expect(insertCall).toBeDefined();

    // Stream events were broadcast (AI_STREAM_START + AI_STREAM_DELTA + AI_STREAM_END)
    expect(mockBroadcast).toHaveBeenCalled();
    const broadcastCalls = mockBroadcast.mock.calls.map((c) => c[1]);
    const streamStart = broadcastCalls.find((m: any) => m.type === 'AI_STREAM_START');
    const streamEnd = broadcastCalls.find((m: any) => m.type === 'AI_STREAM_END');
    expect(streamStart).toBeDefined();
    expect(streamEnd).toBeDefined();
    expect(streamEnd.message.content).toBe('Hi! I am A宝.');
  });

  it('should send fallback message on Agent error', async () => {
    mockBuildContext.mockResolvedValue([
      { role: 'user', content: 'Alice: @AI hello' },
    ]);
    mockBuildPrompt.mockResolvedValue('You are A宝');
    mockSubscribe.mockReturnValue(vi.fn());

    // Agent.prompt throws
    mockPrompt.mockRejectedValueOnce(new Error('API error'));

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

    // Should broadcast AI_STREAM_END with fallback
    const broadcastCalls = mockBroadcast.mock.calls.map((c) => c[1]);
    const streamEnd = broadcastCalls.find((m: any) => m.type === 'AI_STREAM_END');
    expect(streamEnd).toBeDefined();
    expect(streamEnd.message.content).toBe('抱歉，我暂时无法回复，请稍后再试。');
  });

  it('should skip processing when no API key', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    aiService = new AIService();

    await aiService.processMessage(
      { id: messageId, content: '@AI hello', message_type: 'USER' } as any,
      groupId,
    );

    expect(mockPrompt).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should build context and pass to Agent prompt', async () => {
    mockBuildContext.mockResolvedValue([
      { role: 'assistant', content: 'Previous AI response' },
      { role: 'user', content: 'Alice: continue please' },
    ]);
    mockBuildPrompt.mockResolvedValue('You are A宝');
    mockSubscribe.mockImplementation((callback: (event: any) => void) => {
      callback({
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', delta: 'Continuing...' },
      });
      return vi.fn();
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

    // Context builder was called with correct args
    expect(mockBuildContext).toHaveBeenCalledWith(groupId, messageId);

    // Agent.prompt received the combined context as user prompt
    const promptArg = mockPrompt.mock.calls[0][0] as string;
    expect(promptArg).toContain('Previous AI response');
    expect(promptArg).toContain('Alice: continue please');
  });

  it('should handle Agent crash gracefully without throwing', async () => {
    mockBuildContext.mockResolvedValue([
      { role: 'user', content: 'Alice: @AI hello' },
    ]);
    mockBuildPrompt.mockResolvedValue('You are A宝');
    mockSubscribe.mockReturnValue(vi.fn());
    mockPrompt.mockRejectedValueOnce(new Error('Network error'));

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
    await expect(
      aiService.processMessage(
        { id: messageId, content: '@AI hello', message_type: 'USER' } as any,
        groupId,
      ),
    ).resolves.toBeUndefined();

    expect(mockBroadcast).toHaveBeenCalled();
  });
});
