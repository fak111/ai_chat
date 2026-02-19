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
import { readFileTool } from './tools/builtin/read-file-tool.js';
import { editFileTool } from './tools/builtin/edit-file-tool.js';
import { createSkillTool } from './tools/builtin/create-skill-tool.js';
import { webSearchTool } from './tools/builtin/web-search-tool.js';
import { SkillLoader } from './tools/skill-loader.js';
import crypto from 'node:crypto';
import type { Message, MessageDto } from '../types/index.js';

const FALLBACK_MESSAGE = '抱歉，我暂时无法回复，请稍后再试。';

// 每群维护一个 Agent 实例和对应的 SkillLoader
const groupAgents = new Map<string, Agent>();
const groupSkillLoaders = new Map<string, SkillLoader>();

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

/** 获取群组的内置工具 + 技能工具的完整列表 */
function getAllTools(groupId: string, skillLoader: SkillLoader): any[] {
  const builtinTools = [
    bashTool,
    queryDbTool,
    readFileTool,
    editFileTool,
    webSearchTool,
    createRememberTool(groupId),
    createSkillTool(groupId, skillLoader),
  ];
  const skillTools = skillLoader.getAllTools();
  return [...builtinTools, ...skillTools];
}

async function getOrCreateAgent(groupId: string): Promise<Agent> {
  let agent = groupAgents.get(groupId);
  if (agent) {
    lastActivity.set(groupId, Date.now());
    return agent;
  }

  // 创建该群的 SkillLoader
  const skillsDir = `storage/skills/${groupId}`;
  const skillLoader = new SkillLoader(skillsDir);
  await skillLoader.loadAll();
  skillLoader.startWatching();

  // 技能变化时自动更新 Agent 工具集
  skillLoader.onChange = (event) => {
    const currentAgent = groupAgents.get(groupId);
    if (currentAgent) {
      currentAgent.setTools(getAllTools(groupId, skillLoader));
      logger.info(
        { groupId, event: event.type, skill: event.skillName },
        'Agent tools updated after skill change',
      );
    }
  };

  groupSkillLoaders.set(groupId, skillLoader);

  const memoryManager = new MemoryManager();
  const permanentMemories = await memoryManager.getPermanentMemories(groupId);
  const systemPrompt = await buildSystemPrompt(groupId, permanentMemories);

  agent = new Agent({
    initialState: {
      systemPrompt: systemPrompt + skillLoader.getPromptFragment(),
      model: resolveModel(),
      tools: getAllTools(groupId, skillLoader),
      messages: [],
    },
    convertToLlm: (msgs) =>
      msgs.filter((m) => ['user', 'assistant', 'toolResult'].includes(m.role)),
    getApiKey: async () => resolveApiKey(),
  });

  groupAgents.set(groupId, agent);
  lastActivity.set(groupId, Date.now());

  const skillCount = skillLoader.getLoadedSkills().length;
  logger.info({ groupId, skillCount }, 'Pi Agent instance created');
  return agent;
}

// 定期清理不活跃的 Agent 和 SkillLoader
setInterval(() => {
  const now = Date.now();
  for (const [groupId, ts] of lastActivity) {
    if (now - ts > IDLE_TIMEOUT) {
      groupAgents.delete(groupId);
      const loader = groupSkillLoaders.get(groupId);
      if (loader) {
        loader.dispose();
        groupSkillLoaders.delete(groupId);
      }
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

    const streamId = crypto.randomUUID();

    try {
      // 1. Get/create Agent for this group
      const agent = await getOrCreateAgent(groupId);
      const skillLoader = groupSkillLoaders.get(groupId);

      // 2. Build context from recent messages
      const contextMessages = await buildContextWindow(groupId, message.id);

      // 3. Refresh system prompt (may have new memories + skills)
      const permanentMemories = await this.memoryManager.getPermanentMemories(groupId);
      const systemPrompt = await buildSystemPrompt(groupId, permanentMemories);
      const skillPrompt = skillLoader ? skillLoader.getPromptFragment() : '';
      agent.setSystemPrompt(systemPrompt + skillPrompt);

      // 3.5 Refresh tools (may have new skills)
      if (skillLoader) {
        agent.setTools(getAllTools(groupId, skillLoader));
      }

      // 4. Build user prompt from context
      const userPrompt = contextMessages
        .map((m) => (m.role === 'user' ? m.content : `[AI]: ${m.content}`))
        .join('\n');

      // 5. Broadcast stream start
      sessionManager.broadcastToGroup(groupId, {
        type: 'AI_STREAM_START',
        groupId,
        streamId,
        replyToId: message.id,
      });

      // 6. Collect agent response via events, streaming deltas in real-time
      let fullResponse = '';
      let skillsCreated = false;
      const unsubscribe = agent.subscribe((event: AgentEvent) => {
        if (
          event.type === 'message_update' &&
          event.assistantMessageEvent.type === 'text_delta'
        ) {
          const delta = event.assistantMessageEvent.delta;
          fullResponse += delta;
          sessionManager.broadcastToGroup(groupId, {
            type: 'AI_STREAM_DELTA',
            groupId,
            streamId,
            delta,
          });
        }
        if (event.type === 'tool_execution_start') {
          logger.info(
            { groupId, tool: event.toolName },
            'Agent using tool',
          );
          sessionManager.broadcastToGroup(groupId, {
            type: 'AI_STREAM_TOOL',
            groupId,
            streamId,
            toolName: event.toolName,
            status: 'start',
          });
        }
        if (event.type === 'tool_execution_end') {
          sessionManager.broadcastToGroup(groupId, {
            type: 'AI_STREAM_TOOL',
            groupId,
            streamId,
            toolName: event.toolName,
            status: 'end',
          });
          if (event.toolName === 'create_skill') {
            skillsCreated = true;
          }
        }
      });

      // 7. Run agent
      await agent.prompt(userPrompt);
      unsubscribe();

      // 7.5 If skills were created, refresh tools for next interaction
      if (skillsCreated && skillLoader) {
        agent.setTools(getAllTools(groupId, skillLoader));
        logger.info({ groupId }, 'Tools refreshed after skill creation');
      }

      if (!fullResponse.trim()) {
        fullResponse = FALLBACK_MESSAGE;
      }

      // 8. Save to DB and broadcast stream end with final message
      const messageDto = await this.saveMessage(groupId, message.id, fullResponse);
      sessionManager.broadcastToGroup(groupId, {
        type: 'AI_STREAM_END',
        groupId,
        streamId,
        message: messageDto,
      });

      // 9. Append to session history
      await this.memoryManager.appendSessionHistory(groupId, {
        role: 'assistant',
        content: fullResponse,
      });
    } catch (err) {
      logger.error({ err, groupId, messageId: message.id }, 'AI processing failed');
      const messageDto = await this.saveMessage(groupId, message.id, FALLBACK_MESSAGE);
      sessionManager.broadcastToGroup(groupId, {
        type: 'AI_STREAM_END',
        groupId,
        streamId,
        message: messageDto,
      });
    }
  }

  private async saveMessage(
    groupId: string,
    replyToId: string,
    content: string,
  ): Promise<MessageDto> {
    const result = await query(
      `INSERT INTO messages (group_id, sender_id, content, message_type, reply_to_id)
       VALUES ($1, NULL, $2, 'AI', $3)
       RETURNING *`,
      [groupId, content, replyToId],
    );

    const row = result.rows[0];
    return {
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
  }
}
