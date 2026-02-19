import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { query } from '../../../db/client.js';
import { logger } from '../../../utils/logger.js';

const queryDbSchema = Type.Object({
  sql: Type.String({ description: '只读 SELECT SQL 查询语句' }),
});

export const queryDbTool: AgentTool<any> = {
  name: 'query_db',
  label: '查询数据库',
  description: '对 PostgreSQL 数据库执行只读 SELECT 查询。可查询用户、群组、消息等数据。表结构: users(id,email,nickname,created_at), groups(id,name,invite_code,created_at), messages(id,group_id,sender_id,content,message_type,created_at), group_members(id,group_id,user_id,role,joined_at)。',
  parameters: queryDbSchema,
  execute: async (_toolCallId, args) => {
    const sql = args.sql.trim();
    logger.info({ sql }, 'query_db tool executing');

    // 只允许 SELECT
    if (!/^\s*SELECT\b/i.test(sql)) {
      return {
        content: [{ type: 'text', text: '错误: 只允许 SELECT 查询' }],
        details: undefined,
      };
    }

    try {
      const result = await query(sql);
      const rows = result.rows.slice(0, 50); // 限制返回行数
      const text = rows.length > 0
        ? JSON.stringify(rows, null, 2)
        : '(无结果)';
      return {
        content: [{ type: 'text', text: `查询返回 ${result.rowCount} 行:\n${text}` }],
        details: undefined,
      };
    } catch (e: any) {
      return {
        content: [{ type: 'text', text: `SQL 错误: ${e.message}` }],
        details: undefined,
      };
    }
  },
};
