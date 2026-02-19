import { query } from '../db/client.js';

interface ContextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface MessageRow {
  id: string;
  sender_id: string | null;
  message_type: string;
  content: string;
  nickname: string | null;
  email: string | null;
  reply_to_id: string | null;
  created_at: Date;
}

function toContextMessage(row: MessageRow): ContextMessage {
  if (row.message_type === 'AI') {
    return { role: 'assistant', content: row.content };
  }
  if (row.message_type === 'SYSTEM') {
    return { role: 'system', content: row.content };
  }
  const name = row.nickname ?? (row.email ? row.email.split('@')[0] : 'Unknown');
  return { role: 'user', content: `${name}: ${row.content}` };
}

export async function buildContextWindow(
  groupId: string,
  triggerMessageId: string,
): Promise<ContextMessage[]> {
  // Fetch recent messages from last 30 minutes, max 50, ASC order
  const result = await query<MessageRow>(
    `SELECT m.id, m.sender_id, m.message_type, m.content,
            u.nickname, u.email, m.reply_to_id, m.created_at
     FROM messages m
     LEFT JOIN users u ON m.sender_id = u.id
     WHERE m.group_id = $1
       AND m.created_at >= NOW() - INTERVAL '30 minutes'
     ORDER BY m.created_at ASC
     LIMIT 50`,
    [groupId],
  );

  const rows = result.rows;
  if (rows.length === 0) return [];

  // Cross-window reply compensation: find references to messages outside the window
  const windowIds = new Set(rows.map((r) => r.id));
  const missingReplyIds: string[] = [];

  for (const row of rows) {
    if (row.reply_to_id && !windowIds.has(row.reply_to_id)) {
      missingReplyIds.push(row.reply_to_id);
    }
  }

  let compensationRows: MessageRow[] = [];
  if (missingReplyIds.length > 0) {
    const compResult = await query<MessageRow>(
      `SELECT m.id, m.sender_id, m.message_type, m.content,
              u.nickname, u.email, m.reply_to_id, m.created_at
       FROM messages m
       LEFT JOIN users u ON m.sender_id = u.id
       WHERE m.id = ANY($1)
       ORDER BY m.created_at ASC`,
      [missingReplyIds],
    );
    compensationRows = compResult.rows;
  }

  // Combine: compensation messages first, then window messages
  const allRows = [...compensationRows, ...rows];
  return allRows.map(toContextMessage);
}
