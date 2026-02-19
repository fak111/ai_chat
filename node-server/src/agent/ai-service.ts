import { query } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { buildContextWindow } from './context-builder.js';
import { buildSystemPrompt } from './soul.js';
import { MemoryManager } from './memory/memory-manager.js';
import { sessionManager } from '../websocket/ws-session-manager.js';
import type { Message, MessageDto } from '../types/index.js';

const FALLBACK_MESSAGE = '抱歉，我暂时无法回复，请稍后再试。';

export class AIService {
  private apiKey: string | undefined;
  private memoryManager: MemoryManager;

  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.memoryManager = new MemoryManager();
  }

  async processMessage(message: Message, groupId: string): Promise<void> {
    if (!this.apiKey) {
      logger.warn('DEEPSEEK_API_KEY not set, skipping AI processing');
      return;
    }

    try {
      // 1. Build context window
      const contextMessages = await buildContextWindow(groupId, message.id);

      // 2. Get permanent memories
      const permanentMemories = await this.memoryManager.getPermanentMemories(groupId);

      // 3. Build system prompt
      const systemPrompt = await buildSystemPrompt(groupId, permanentMemories);

      // 4. Call DeepSeek API
      const aiContent = await this.callDeepSeek(systemPrompt, contextMessages);

      // 5. Save and broadcast
      await this.saveAndBroadcast(groupId, message.id, aiContent);

      // 6. Append to session history
      await this.memoryManager.appendSessionHistory(groupId, { role: 'assistant', content: aiContent });

    } catch (err) {
      logger.error({ err, groupId, messageId: message.id }, 'AI processing failed');
      await this.saveAndBroadcast(groupId, message.id, FALLBACK_MESSAGE);
    }
  }

  private async callDeepSeek(
    systemPrompt: string,
    contextMessages: Array<{ role: string; content: string }>,
  ): Promise<string> {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...contextMessages,
    ];

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages,
        max_tokens: 2048,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    return data.choices[0].message.content;
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
      createdAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    };

    sessionManager.broadcastToGroup(groupId, {
      type: 'NEW_MESSAGE',
      message: messageDto,
    });
  }
}
