import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { MemoryManager } from '../../memory/memory-manager.js';
import { logger } from '../../../utils/logger.js';

export function createRememberTool(groupId: string): AgentTool<any> {
  const memoryManager = new MemoryManager();

  return {
    name: 'remember',
    label: '永久记忆',
    description: '将重要信息保存到永久记忆中。保存后在未来所有对话中都可用。用于记住用户偏好、重要事项、约定等。',
    parameters: Type.Object({
      content: Type.String({ description: '要永久记住的内容' }),
    }),
    execute: async (_toolCallId, args) => {
      logger.info({ groupId, content: args.content }, 'remember tool executing');
      try {
        await memoryManager.savePermanentMemory(groupId, args.content);
        return {
          content: [{ type: 'text', text: `已记住: ${args.content}` }],
          details: undefined,
        };
      } catch (e: any) {
        return {
          content: [{ type: 'text', text: `记忆保存失败: ${e.message}` }],
          details: undefined,
        };
      }
    },
  };
}
