import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../../utils/logger.js';

const WORKSPACE_ROOT = process.cwd();
const MAX_READ_SIZE = 100 * 1024; // 100KB 限制

const readFileSchema = Type.Object({
  filePath: Type.String({ description: '要读取的文件路径（相对于工作目录或绝对路径）' }),
  startLine: Type.Optional(Type.Number({ description: '起始行号（从1开始），不传则从头开始' })),
  endLine: Type.Optional(Type.Number({ description: '结束行号（包含），不传则读到末尾' })),
});

export const readFileTool: AgentTool<any> = {
  name: 'read_file',
  label: '读取文件',
  description: '读取文件内容。可以读取整个文件或指定行范围。支持文本文件（代码、配置、日志等）。路径相对于工作目录。',
  parameters: readFileSchema,
  execute: async (_toolCallId, args) => {
    const filePath = path.isAbsolute(args.filePath)
      ? args.filePath
      : path.resolve(WORKSPACE_ROOT, args.filePath);

    logger.info({ filePath, startLine: args.startLine, endLine: args.endLine }, 'read_file tool executing');

    // 安全检查：不允许读取敏感文件
    const basename = path.basename(filePath);
    if (basename === '.env' || basename === '.env.local' || basename === '.env.production') {
      return {
        content: [{ type: 'text', text: '错误: 不允许读取 .env 文件（包含敏感信息）' }],
        details: undefined,
      };
    }

    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        // 如果是目录，列出内容
        const entries = await fs.readdir(filePath, { withFileTypes: true });
        const listing = entries
          .map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
          .join('\n');
        return {
          content: [{ type: 'text', text: `目录 ${filePath}:\n${listing}` }],
          details: undefined,
        };
      }

      if (stat.size > MAX_READ_SIZE) {
        return {
          content: [{ type: 'text', text: `错误: 文件过大 (${(stat.size / 1024).toFixed(1)}KB)，最大支持 ${MAX_READ_SIZE / 1024}KB。请使用 startLine/endLine 参数读取部分内容。` }],
          details: undefined,
        };
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      const start = args.startLine ? Math.max(1, args.startLine) : 1;
      const end = args.endLine ? Math.min(lines.length, args.endLine) : lines.length;
      const selectedLines = lines.slice(start - 1, end);

      // 带行号输出
      const numbered = selectedLines
        .map((line, i) => `${String(start + i).padStart(4)} | ${line}`)
        .join('\n');

      const header = `文件: ${filePath} (${lines.length} 行, 显示 ${start}-${end})`;
      return {
        content: [{ type: 'text', text: `${header}\n${numbered}` }],
        details: undefined,
      };
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return {
          content: [{ type: 'text', text: `错误: 文件不存在 - ${filePath}` }],
          details: undefined,
        };
      }
      return {
        content: [{ type: 'text', text: `读取失败: ${e.message}` }],
        details: undefined,
      };
    }
  },
};
