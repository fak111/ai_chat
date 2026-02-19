import { logger } from '../utils/logger.js';
import { shouldTriggerAI } from './ai-trigger.js';
import { AIService } from './ai-service.js';
import { query } from '../db/client.js';
import type { MessageDto, Message } from '../types/index.js';

const aiService = new AIService();

export async function processAIIfNeeded(
  messageDto: MessageDto,
  userId: string,
  groupId: string,
): Promise<void> {
  // Determine replyTo message type if there's a reply
  let replyToMessageType: string | undefined;
  if (messageDto.replyToId) {
    try {
      const result = await query(
        'SELECT message_type FROM messages WHERE id = $1',
        [messageDto.replyToId],
      );
      if (result.rows.length > 0) {
        replyToMessageType = result.rows[0].message_type;
      }
    } catch (err) {
      logger.error({ err }, 'Failed to fetch replyTo message type');
    }
  }

  if (!shouldTriggerAI(messageDto.content, replyToMessageType)) {
    return;
  }

  logger.info({ groupId, messageId: messageDto.id }, 'AI trigger detected, processing...');

  // Build a minimal Message object for AIService
  const message: Message = {
    id: messageDto.id,
    group_id: groupId,
    sender_id: messageDto.senderId,
    content: messageDto.content,
    message_type: messageDto.messageType as 'USER' | 'AI' | 'SYSTEM',
    reply_to_id: messageDto.replyToId,
    created_at: new Date(messageDto.createdAt),
  };

  try {
    await aiService.processMessage(message, groupId);
  } catch (err) {
    logger.error({ err, groupId, messageId: messageDto.id }, 'AI processing failed');
  }
}
