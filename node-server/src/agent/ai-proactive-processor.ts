import { logger } from '../utils/logger.js';
import { checkProactiveTrigger, getRecentContext, recordAISpoke } from './proactive-trigger.js';
import { evaluateProactive } from './proactive-evaluator.js';
import { AIService } from './ai-service.js';
import type { MessageDto, Message } from '../types/index.js';

const aiService = new AIService();

/**
 * 主动触发处理器：串联三层漏斗
 *
 * 层1 (本地规则) → 层2 (LLM裁判) → 层3 (完整Agent)
 */
export async function checkAndProcessProactive(
  messageDto: MessageDto,
  userId: string,
  groupId: string,
): Promise<void> {
  // 层1: 本地规则预筛
  const check = checkProactiveTrigger(groupId, messageDto.content, userId);
  if (!check.shouldEvaluate) return;

  logger.info({ groupId, reason: check.reason }, '层1: 通过预筛，进入层2');

  // 层2: LLM 快速裁判
  const recentContext = getRecentContext(groupId, 5);
  const evaluation = await evaluateProactive(groupId, recentContext, check.reason);
  if (!evaluation.speak) {
    logger.info({ groupId, reason: evaluation.reason }, '层2: 裁判决定不插话');
    return;
  }

  // 层3: 完整 Agent 处理
  logger.info(
    { groupId, triggerReason: check.reason, evalReason: evaluation.reason },
    '层3: AI主动插话',
  );

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
    await aiService.processMessage(message, groupId, { proactive: true });
    recordAISpoke(groupId);
  } catch (err) {
    logger.error({ err, groupId, messageId: messageDto.id }, '层3: 主动回复失败');
  }
}
