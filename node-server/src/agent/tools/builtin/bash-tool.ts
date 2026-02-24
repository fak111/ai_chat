import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { execSync } from 'node:child_process';
import { logger } from '../../../utils/logger.js';

const bashSchema = Type.Object({
  command: Type.String({ description: '要执行的 shell 命令' }),
});

// 危险命令模式黑名单
const DANGEROUS_PATTERNS = [
  /\brm\s+-[^\s]*r[^\s]*f/i,   // rm -rf
  /\brm\s+-[^\s]*f[^\s]*r/i,   // rm -fr
  /\bdd\s+if=/i,                // dd if=
  /\bmkfs\b/i,                  // mkfs
  /\bformat\b/i,                // format
  />\s*\/dev\//i,               // > /dev/
  /\bshutdown\b/i,              // shutdown
  /\breboot\b/i,                // reboot
  /\bkill\s+-9\s+1\b/i,        // kill -9 1
  /\bchmod\s+777\s+\//i,       // chmod 777 /
  /\bcurl\b.*\|\s*\bbash\b/i,  // curl | bash
  /\bwget\b.*\|\s*\bbash\b/i,  // wget | bash
];

function isDangerous(command: string): string | null {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return `被阻止的危险命令: ${command.slice(0, 80)}`;
    }
  }
  return null;
}

export const bashTool: AgentTool<any> = {
  name: 'bash',
  label: '执行命令',
  description: '在 shell 中执行命令并返回真实输出。用于：查看日期(date)、计算(bc/python)、文件列表(ls)、系统信息等。注意：只执行真实命令，绝不用 echo 伪造信息。',
  parameters: bashSchema,
  execute: async (_toolCallId, args) => {
    const command = args.command.trim();
    logger.info({ command }, 'bash tool executing');

    // 安全检查
    const danger = isDangerous(command);
    if (danger) {
      logger.warn({ command }, 'Dangerous command blocked');
      return {
        content: [{ type: 'text', text: `安全限制: ${danger}` }],
        details: undefined,
      };
    }

    try {
      const output = execSync(command, {
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
