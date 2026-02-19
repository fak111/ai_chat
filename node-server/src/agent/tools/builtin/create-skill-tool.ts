import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../../../utils/logger.js';
import type { SkillLoader } from '../skill-loader.js';

/**
 * 创建 create_skill 工具
 * AI 通过此工具生成新技能文件，SkillLoader 自动热加载
 */
export function createSkillTool(groupId: string, skillLoader: SkillLoader): AgentTool<any> {
  return {
    name: 'create_skill',
    label: '创建技能',
    description: `创建一个新技能（工具）。你可以编写 TypeScript 代码生成新工具，系统会自动热加载。
使用此工具前，必须先向主人解释你要创建什么技能、为什么需要，获得同意后再调用。
技能会保存到 skills 目录，持久化可复用。

技能文件格式要求：
- 必须 export default 一个对象 { name, description?, prompt?, tools[] }
- tools 数组中每个工具需要 name, label, description, parameters, execute
- parameters 使用 Type.Object() 定义（从 @mariozechner/pi-ai 导入 Type）
- execute 函数签名: async (_toolCallId: string, args: any) => { content, details }
- execute 返回 { content: [{ type: "text", text: "..." }], details: undefined }

可用模块清单（仅以下模块可用，其他均不可用）：
- @mariozechner/pi-ai: { Type } — 定义参数 Schema
- Node.js 内置: fs, path, crypto, url, http, https, util, zlib, stream, os, child_process
- pg: PostgreSQL 数据库查询
- uuid: 生成 UUID
- zod: 数据校验
- jsonwebtoken: JWT 操作
- cheerio: HTML/XML 解析
- dayjs: 日期时间处理
- mathjs: 数学计算
- csv-parse: CSV 解析

禁止导入：
- @sinclair/typebox（不可用，用 @mariozechner/pi-ai 代替）
- 任何项目内部模块（src/ 下的文件）
- 未列出的 npm 包`,
    parameters: Type.Object({
      fileName: Type.String({ description: '技能文件名（不含路径，如 weather.ts）' }),
      code: Type.String({ description: '完整的 TypeScript 技能代码' }),
      reason: Type.String({ description: '创建此技能的原因，用于日志记录' }),
    }),
    execute: async (_toolCallId, args) => {
      const { fileName, code, reason } = args;
      logger.info({ groupId, fileName, reason }, 'create_skill tool executing');

      // 校验文件名
      if (!fileName.endsWith('.ts')) {
        return {
          content: [{ type: 'text', text: '错误: 文件名必须以 .ts 结尾' }],
          details: undefined,
        };
      }
      if (fileName.includes('/') || fileName.includes('\\')) {
        return {
          content: [{ type: 'text', text: '错误: 文件名不能包含路径分隔符' }],
          details: undefined,
        };
      }

      const skillsDir = skillLoader.getSkillsDir();
      const filePath = path.join(skillsDir, fileName);

      try {
        // 确保目录存在
        await fs.mkdir(skillsDir, { recursive: true });

        // 自动修正常见错误导入
        let fixedCode = code;
        fixedCode = fixedCode.replace(
          /from\s+['"]@sinclair\/typebox['"]/g,
          "from '@mariozechner/pi-ai'",
        );

        // 写入技能文件
        await fs.writeFile(filePath, fixedCode, 'utf-8');
        logger.info({ filePath }, 'Skill file written');

        // 主动加载（不等 watcher）
        const event = await skillLoader.loadSkill(filePath);

        if (event.type === 'loaded') {
          // 获取新的完整工具列表（调用方需要更新 Agent）
          const allSkillTools = skillLoader.getAllTools();
          const skillNames = skillLoader.getLoadedSkills().map((s) => s.definition.name);

          return {
            content: [{
              type: 'text',
              text: `技能 "${event.skillName}" 创建成功并已加载。\n` +
                `文件: ${filePath}\n` +
                `当前已加载技能: ${skillNames.join(', ')}\n` +
                `新工具数量: ${allSkillTools.length}\n` +
                `注意: 新工具将在下一次对话中生效。`,
            }],
            details: { newTools: allSkillTools, promptFragment: skillLoader.getPromptFragment() },
          };
        } else {
          // 加载失败，删除文件
          await fs.unlink(filePath).catch(() => {});
          return {
            content: [{
              type: 'text',
              text: `技能文件写入成功但加载失败: ${event.error}\n请检查代码语法。`,
            }],
            details: undefined,
          };
        }
      } catch (e: any) {
        return {
          content: [{ type: 'text', text: `创建技能失败: ${e.message}` }],
          details: undefined,
        };
      }
    },
  };
}
