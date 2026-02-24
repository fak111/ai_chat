import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../../utils/logger.js';

const WORKSPACE_ROOT = process.cwd();

const editFileSchema = Type.Object({
  filePath: Type.String({ description: '要编辑的文件路径（相对于工作目录或绝对路径）' }),
  oldText: Type.String({ description: '要替换的原始文本（必须精确匹配文件中的内容）' }),
  newText: Type.String({ description: '替换后的新文本' }),
});

export const editFileTool: AgentTool<any> = {
  name: 'edit_file',
  label: '编辑文件',
  description: '通过精确文本替换编辑文件。提供要替换的原始文本和新文本。如果要创建新文件，oldText 传空字符串，newText 传完整内容。只能编辑工作目录下的文件。',
  parameters: editFileSchema,
  execute: async (_toolCallId, args) => {
    const filePath = path.isAbsolute(args.filePath)
      ? args.filePath
      : path.resolve(WORKSPACE_ROOT, args.filePath);

    logger.info({ filePath }, 'edit_file tool executing');

    // 安全检查
    const basename = path.basename(filePath);
    if (basename === '.env' || basename === '.env.local' || basename === '.env.production') {
      return {
        content: [{ type: 'text', text: '错误: 不允许编辑 .env 文件（包含敏感信息）' }],
        details: undefined,
      };
    }

    // 安全检查：限制在工作目录内
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(WORKSPACE_ROOT)) {
      return {
        content: [{ type: 'text', text: `错误: 只能编辑工作目录 (${WORKSPACE_ROOT}) 下的文件` }],
        details: undefined,
      };
    }

    try {
      if (args.oldText === '') {
        // 创建新文件
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, args.newText, 'utf-8');
        return {
          content: [{ type: 'text', text: `已创建文件: ${filePath} (${args.newText.split('\n').length} 行)` }],
          details: undefined,
        };
      }

      // 编辑现有文件
      const content = await fs.readFile(filePath, 'utf-8');

      if (!content.includes(args.oldText)) {
        return {
          content: [{ type: 'text', text: `错误: 在文件中未找到要替换的文本。请确保 oldText 与文件内容精确匹配（包括空格和换行）。` }],
          details: undefined,
        };
      }

      // 检查是否有多处匹配
      const matchCount = content.split(args.oldText).length - 1;
      if (matchCount > 1) {
        return {
          content: [{ type: 'text', text: `错误: 找到 ${matchCount} 处匹配。请提供更多上下文使 oldText 唯一，避免误替换。` }],
          details: undefined,
        };
      }

      const newContent = content.replace(args.oldText, args.newText);
      await fs.writeFile(filePath, newContent, 'utf-8');

      return {
        content: [{ type: 'text', text: `已编辑: ${filePath}\n替换了 ${args.oldText.split('\n').length} 行 → ${args.newText.split('\n').length} 行` }],
        details: undefined,
      };
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return {
          content: [{ type: 'text', text: `错误: 文件不存在 - ${filePath}。如需创建新文件，请将 oldText 设为空字符串。` }],
          details: undefined,
        };
      }
      return {
        content: [{ type: 'text', text: `编辑失败: ${e.message}` }],
        details: undefined,
      };
    }
  },
};
