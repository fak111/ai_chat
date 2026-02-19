import { Agent, type AgentEvent } from '@mariozechner/pi-agent-core';
import { registerBuiltInApiProviders } from '@mariozechner/pi-ai';
import { query } from '../db/client.js';

// Register all built-in API providers (openai-completions, anthropic-messages, etc.)
registerBuiltInApiProviders();
import { logger } from '../utils/logger.js';
import { buildContextWindow } from './context-builder.js';
import { buildSystemPrompt } from './soul.js';
import { MemoryManager } from './memory/memory-manager.js';
import { sessionManager } from '../websocket/ws-session-manager.js';
import { bashTool } from './tools/builtin/bash-tool.js';
import { queryDbTool } from './tools/builtin/query-db-tool.js';
import { createRememberTool } from './tools/builtin/remember-tool.js';
import type { Message, MessageDto } from '../types/index.js';

const FALLBACK_MESSAGE = '抱歉，我暂时无法回复，请稍后再试。';

// 每群维护一个 Agent 实例
const groupAgents = new Map<string, Agent>();

// 30 分钟不活跃清理 Agent 实例
const IDLE_TIMEOUT = 30 * 60 * 1000;
const lastActivity = new Map<string, number>();

function resolveModel(): any {
  // DeepSeek uses OpenAI-compatible API (openai-completions)
  return {
    id: process.env.AI_MODEL || 'deepseek-chat',
    name: process.env.AI_MODEL || 'deepseek-chat',
    api: 'openai-completions',
    provider: process.env.AI_PROVIDER || 'deepseek',
    baseUrl: process.env.AI_BASE_URL || 'https://api.deepseek.com/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0.14, output: 0.28, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 64000,
    maxTokens: 4096,
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
      maxTokensField: 'max_tokens',
      supportsStrictMode: false,
    },
  };
}

function resolveApiKey(): string {
  const map: Record<string, string> = {
    deepseek: 'DEEPSEEK_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    'kimi-coding': 'KIMI_API_KEY',
    openai: 'OPENAI_API_KEY',
    intern: 'INTERN_API_KEY',
  };
  const provider = process.env.AI_PROVIDER || 'deepseek';
  return process.env[map[provider] || 'DEEPSEEK_API_KEY'] || '';
}

async function getOrCreateAgent(groupId: string): Promise<Agent> {
  let agent = groupAgents.get(groupId);
  if (agent) {
    lastActivity.set(groupId, Date.now());
    return agent;
  }

  const memoryManager = new MemoryManager();
  const permanentMemories = await memoryManager.getPermanentMemories(groupId);
  const systemPrompt = await buildSystemPrompt(groupId, permanentMemories);

  agent = new Agent({
    initialState: {
      systemPrompt,
      model: resolveModel(),
      tools: [bashTool, queryDbTool, createRememberTool(groupId)],
      messages: [],
    },
    convertToLlm: (msgs) =>
      msgs.filter((m) => ['user', 'assistant', 'toolResult'].includes(m.role)),
    getApiKey: async () => resolveApiKey(),
  });

  groupAgents.set(groupId, agent);
  lastActivity.set(groupId, Date.now());

  logger.info({ groupId }, 'Pi Agent instance created');
  return agent;
}

// 定期清理不活跃的 Agent
setInterval(() => {
  const now = Date.now();
  for (const [groupId, ts] of lastActivity) {
    if (now - ts > IDLE_TIMEOUT) {
      groupAgents.delete(groupId);
      lastActivity.delete(groupId);
      logger.info({ groupId }, 'Idle Agent instance cleaned up');
    }
  }
}, 5 * 60 * 1000);

export class AIService {
  private memoryManager: MemoryManager;

  constructor() {
    this.memoryManager = new MemoryManager();
  }

  async processMessage(message: Message, groupId: string): Promise<void> {
    if (!resolveApiKey()) {
      logger.warn('No AI API key configured, skipping AI processing');
      return;
    }

    try {
      // 1. Get/create Agent for this group
      const agent = await getOrCreateAgent(groupId);

      // 2. Build context from recent messages
      const contextMessages = await buildContextWindow(groupId, message.id);

      // 3. Refresh system prompt (may have new memories)
      const permanentMemories = await this.memoryManager.getPermanentMemories(groupId);
      const systemPrompt = await buildSystemPrompt(groupId, permanentMemories);
      agent.setSystemPrompt(systemPrompt);

      // 4. Build user prompt from context
      const userPrompt = contextMessages
        .map((m) => (m.role === 'user' ? m.content : `[AI]: ${m.content}`))
        .join('\n');

      // 5. Collect agent response via events
      let fullResponse = '';
      const unsubscribe = agent.subscribe((event: AgentEvent) => {
        if (
          event.type === 'message_update' &&
          event.assistantMessageEvent.type === 'text_delta'
        ) {
          fullResponse += event.assistantMessageEvent.delta;
        }
        if (event.type === 'tool_execution_start') {
          logger.info(
            { groupId, tool: event.toolName },
            'Agent using tool',
          );
        }
      });

      // 6. Run agent
      await agent.prompt(userPrompt);
      unsubscribe();

      if (!fullResponse.trim()) {
        fullResponse = FALLBACK_MESSAGE;
      }

      // 7. Save and broadcast
      await this.saveAndBroadcast(groupId, message.id, fullResponse);

      // 8. Append to session history
      await this.memoryManager.appendSessionHistory(groupId, {
        role: 'assistant',
        content: fullResponse,
      });
    } catch (err) {
      logger.error({ err, groupId, messageId: message.id }, 'AI processing failed');
      await this.saveAndBroadcast(groupId, message.id, FALLBACK_MESSAGE);
    }
  }

  private async saveAndBroadcast(
    groupId: string,
    replyToId: string,
    content: string,
  ): Promise<void> {
    const result = await query(
      `INSERT INTO messages (group_id, sender_id, content, message_type, reply_to_id)
       VALUES ($1, NULL, $2, 'AI', $3)
       RETURNING *`,
      [groupId, content, replyToId],
    );

    const row = result.rows[0];
    const messageDto: MessageDto = {
      id: row.id,
      groupId: row.group_id,
      senderId: null,
      senderNickname: null,
      content: row.content,
      messageType: row.message_type,
      replyToId: row.reply_to_id,
      replyToContent: null,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
    };

    sessionManager.broadcastToGroup(groupId, {
      type: 'NEW_MESSAGE',
      message: messageDto,
    });
  }
}
