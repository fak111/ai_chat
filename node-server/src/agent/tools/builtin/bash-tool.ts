import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { execSync } from 'node:child_process';
import { logger } from '../../../utils/logger.js';

const bashSchema = Type.Object({
  command: Type.String({ description: '要执行的 shell 命令' }),
});

export const bashTool: AgentTool<any> = {
  name: 'bash',
  label: '执行命令',
  description: '在 shell 中执行命令并返回输出。可用于查看日期、计算、文件操作等。',
  parameters: bashSchema,
  execute: async (_toolCallId, args) => {
    logger.info({ command: args.command }, 'bash tool executing');
    try {
      const output = execSync(args.command, {
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
      return {
        content: [{ type: 'text', text: output || '(无输出)' }],
        details: undefined,
      };
    } catch (e: any) {
      const stderr = e.stderr || e.message || '执行失败';
      return {
        content: [{ type: 'text', text: `错误: ${stderr}` }],
        details: undefined,
      };
    }
  },
};
