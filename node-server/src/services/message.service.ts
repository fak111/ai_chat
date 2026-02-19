import { query } from '../db/client.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { processAIIfNeeded } from '../agent/ai-processor.js';
import { checkAndProcessProactive } from '../agent/ai-proactive-processor.js';
import { recordAISpoke } from '../agent/proactive-trigger.js';
import type { User, MessageDto, PagedResponse } from '../types/index.js';

// DB row type returned by JOIN queries
interface MessageRow {
  id: string;
  group_id: string;
  sender_id: string | null;
  content: string;
  message_type: string;
  reply_to_id: string | null;
  created_at: Date;
  nickname: string | null;
  email: string | null;
  reply_content: string | null;
  reply_message_type: string | null;
}

const MESSAGE_SELECT = `
  SELECT m.*, u.nickname, u.email,
    r.content AS reply_content, r.message_type AS reply_message_type
  FROM messages m
  LEFT JOIN users u ON m.sender_id = u.id
  LEFT JOIN messages r ON m.reply_to_id = r.id
`;

export function shouldTriggerAI(content: string, replyToMessageType: string | null): boolean {
  if (/@[Aa][Ii]\b/.test(content)) return true;
  if (replyToMessageType === 'AI') return true;
  return false;
}

export function buildMessageDto(row: MessageRow): MessageDto {
  let senderNickname: string | null = null;
  if (row.message_type !== 'AI' && row.message_type !== 'SYSTEM') {
    senderNickname = row.nickname ?? (row.email ? row.email.split('@')[0] : null);
  }

  let replyToContent: string | null = null;
  if (row.reply_to_id && row.reply_content != null) {
    replyToContent = row.reply_content.length > 50
      ? row.reply_content.substring(0, 50) + '...'
      : row.reply_content;
  }

  return {
    id: row.id,
    groupId: row.group_id,
    senderId: row.sender_id,
    senderNickname,
    content: row.content,
    messageType: row.message_type,
    replyToId: row.reply_to_id,
    replyToContent,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : new Date(row.created_at).toISOString(),
  };
}

export async function sendMessage(
  user: User,
  groupId: string,
  content: string,
  replyToId: string | undefined,
): Promise<MessageDto> {
  if (!content || !content.trim()) {
    throw new BadRequestError('消息内容不能为空');
  }

  // Check membership
  const memberCheck = await query(
    'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, user.id],
  );
  if (memberCheck.rows.length === 0) {
    throw new ForbiddenError('你不是该群成员');
  }

  // Insert message and return with JOINs
  const result = await query<MessageRow>(
    `INSERT INTO messages (group_id, sender_id, content, message_type, reply_to_id)
     VALUES ($1, $2, $3, 'USER', $4)
     RETURNING *,
       (SELECT nickname FROM users WHERE id = $2) AS nickname,
       (SELECT email FROM users WHERE id = $2) AS email,
       (SELECT content FROM messages WHERE id = $4) AS reply_content,
       (SELECT message_type FROM messages WHERE id = $4) AS reply_message_type`,
    [groupId, user.id, content.trim(), replyToId ?? null],
  );

  const row = result.rows[0];
  const dto = buildMessageDto(row);

  // Check AI trigger (fire-and-forget, don't block response)
  if (shouldTriggerAI(content, row.reply_message_type)) {
    processAIIfNeeded(dto, user.id, groupId).then(() => {
      recordAISpoke(groupId);
    }).catch((err) => {
      logger.error({ err, groupId, messageId: dto.id }, 'AI processing failed');
    });
  } else {
    // 主动触发检查（非阻塞，失败不影响消息发送）
    checkAndProcessProactive(dto, user.id, groupId).catch((err) => {
      logger.debug({ err, groupId }, 'Proactive check failed (non-critical)');
    });
  }

  return dto;
}

export async function getMessagesByGroup(
  groupId: string,
  page: number = 0,
  size: number = 50,
): Promise<PagedResponse<MessageDto>> {
  const clampedSize = Math.min(Math.max(size, 1), 100);
  const offset = page * clampedSize;

  const countResult = await query(
    'SELECT COUNT(*) AS count FROM messages WHERE group_id = $1',
    [groupId],
  );
  const totalElements = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.ceil(totalElements / clampedSize) || 1;

  const messagesResult = await query<MessageRow>(
    `${MESSAGE_SELECT} WHERE m.group_id = $1 ORDER BY m.created_at DESC LIMIT $2 OFFSET $3`,
    [groupId, clampedSize, offset],
  );

  const content = messagesResult.rows.map(buildMessageDto);

  return {
    content,
    totalElements,
    totalPages,
    size: clampedSize,
    number: page,
    first: page === 0,
    last: page >= totalPages - 1,
  };
}

export async function getRecentMessages(
  groupId: string,
  limit: number = 50,
): Promise<MessageDto[]> {
  const clampedLimit = Math.min(Math.max(limit, 1), 100);

  const result = await query<MessageRow>(
    `${MESSAGE_SELECT} WHERE m.group_id = $1 ORDER BY m.created_at DESC LIMIT $2`,
    [groupId, clampedLimit],
  );

  return result.rows.map(buildMessageDto);
}

export async function getMessageById(messageId: string): Promise<MessageDto> {
  const result = await query<MessageRow>(
    `${MESSAGE_SELECT} WHERE m.id = $1`,
    [messageId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('消息不存在');
  }

  return buildMessageDto(result.rows[0]);
}
