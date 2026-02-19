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

// P1: 相对时间格式化
function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const ts = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const diffSec = Math.floor((now - ts) / 1000);
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}天前`;
}

function toContextMessage(row: MessageRow): ContextMessage {
  const timeTag = formatRelativeTime(row.created_at);
  if (row.message_type === 'AI') {
    return { role: 'assistant', content: `[${timeTag}] ${row.content}` };
  }
  if (row.message_type === 'SYSTEM') {
    return { role: 'system', content: row.content };
  }
  const name = row.nickname ?? (row.email ? row.email.split('@')[0] : 'Unknown');
  return { role: 'user', content: `[${timeTag}] ${name}: ${row.content}` };
}

// P0: 获取群成员列表 + P4: 活跃度统计
export async function buildGroupContext(groupId: string): Promise<string> {
  // 群成员信息
  const membersResult = await query<{
    nickname: string | null;
    email: string | null;
    is_ai: boolean;
    joined_at: Date;
  }>(
    `SELECT u.nickname, u.email, gm.is_ai, gm.joined_at
     FROM group_members gm
     LEFT JOIN users u ON gm.user_id = u.id
     WHERE gm.group_id = $1
     ORDER BY gm.joined_at ASC`,
    [groupId],
  );

  // P4: 最近 7 天每人发言数
  const activityResult = await query<{
    nickname: string | null;
    email: string | null;
    msg_count: string;
  }>(
    `SELECT u.nickname, u.email, COUNT(*)::text AS msg_count
     FROM messages m
     JOIN users u ON m.sender_id = u.id
     WHERE m.group_id = $1
       AND m.message_type = 'USER'
       AND m.created_at >= NOW() - INTERVAL '7 days'
     GROUP BY u.id, u.nickname, u.email
     ORDER BY COUNT(*) DESC`,
    [groupId],
  );

  const activityMap = new Map<string, number>();
  for (const row of activityResult.rows) {
    const name = row.nickname ?? (row.email ? row.email.split('@')[0] : 'Unknown');
    activityMap.set(name, parseInt(row.msg_count, 10));
  }

  const lines: string[] = ['群成员:'];
  for (const m of membersResult.rows) {
    if (m.is_ai) {
      lines.push('- A宝 (AI助手)');
      continue;
    }
    const name = m.nickname ?? (m.email ? m.email.split('@')[0] : 'Unknown');
    const count = activityMap.get(name) || 0;
    const tag = count >= 20 ? '活跃' : count >= 5 ? '偶尔' : count > 0 ? '低频' : '潜水';
    lines.push(`- ${name} (近7天${count}条消息, ${tag})`);
  }

  return lines.join('\n');
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
