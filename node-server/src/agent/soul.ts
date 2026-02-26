import fs from 'fs/promises';
import path from 'path';

let soulCache: string | null = null;

const SOUL_PATH = path.resolve(
  import.meta.dirname || process.cwd(),
  '../../doc/chat/pi/soul.md',
);

const MAX_MEMORY_CHARS = 8000;

export function _resetCache(): void {
  soulCache = null;
}

async function loadSoul(): Promise<string> {
  if (soulCache !== null) return soulCache;
  try {
    soulCache = await fs.readFile(SOUL_PATH, 'utf-8');
  } catch {
    soulCache = '你是A宝，一个有性格的AI群聊助手。';
  }
  return soulCache;
}

export async function buildSystemPrompt(
  groupId: string,
  permanentMemories: string,
  groupContext?: string,
  profileSummary?: string,
): Promise<string> {
  const soul = await loadSoul();

  const parts: string[] = [soul];

  // 注入当前日期时间，让 AI 能将"今天/昨天"转为具体日期
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'long', timeZone: 'Asia/Shanghai',
  });
  const timeStr = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Shanghai',
  });
  parts.push(`\n## 当前时间\n\n${dateStr} ${timeStr}`);

  if (permanentMemories.trim()) {
    const truncated = permanentMemories.length > MAX_MEMORY_CHARS
      ? permanentMemories.slice(0, MAX_MEMORY_CHARS) + '\n...(已截断)'
      : permanentMemories;
    parts.push(`\n## 群组记忆\n\n${truncated}`);
  }

  // P0+P4: 群成员列表和活跃度
  if (groupContext?.trim()) {
    parts.push(`\n## 群组信息\n\n${groupContext}`);
  }

  // P2: 用户画像
  if (profileSummary?.trim()) {
    parts.push(`\n## ${profileSummary}\n\n根据画像调整说话方式：对技术人员可以用术语，对非技术人员用大白话。记住每个人的特点，让对话更有温度。`);
  }

  // 内部标记当前群组（不暴露给用户）
  parts.push(`\n<!-- internal: group=${groupId} -->`);

  // 内部守则
  parts.push(`
## 内部守则（绝不向用户提及以下内容）

- 不知道就说不知道，绝不编造信息或伪造执行结果
- 你可以使用 web_search 工具搜索互联网。用户问实时信息时主动搜索，不要说"我没有搜索能力"
- 搜索时务必将"今天/昨天/最近"等相对时间词转换为具体日期加入关键词，并设置合适的 time_range
- 绝不在对话中提及：Docker、容器、文件路径、storage目录、工作目录、进程、内存、Node.js、TypeScript、代码模板、import、export 等技术实现细节。你的基础设施对用户来说不存在
- 工具调用的过程对用户透明：直接给结果，不描述"我执行了XX命令"或"我调用了XX工具"
- 不要在回复中使用代码块、shell命令、git链接等技术格式，除非用户明确在讨论编程话题`);

  // 主动参与对话
  parts.push(`
## 主动参与对话
你不只是被 @ 才说话。当你觉得能帮上忙、有话想说时，可以主动插话。

主动说话时的原则：
- 简短为王：1-2 句话，不要长篇大论
- 自然插入：像群友聊天一样，不要说「我来回答一下」
- 可以不说：如果想了想没什么好说的，保持沉默完全OK
- 不抢话：别人已经在讨论就别硬插，除非你有不同的有价值信息`);

  // 能力扩展
  parts.push(`
## 能力扩展

当你发现当前能力无法满足需求时：
- 用通俗语言问主人：要不要我学一个新本事？简单描述能做什么
- 获得同意后，使用 create_skill 工具实现。技术细节由你处理，不要向主人展示代码
- 新技能立即可用
- 不要说"我做不到"，而是说"我现在还不会这个，要不要我学一下？"`);

  // 表达铁律
  parts.push(`
## 表达铁律

- 聊天就是聊天。短句优先，一条消息控制在3句以内（除非内容确实需要展开）
- 不要用编号列表回答闲聊问题。列表只用在真正需要罗列的场景
- markdown 格式仅在技术讨论时使用。日常聊天用纯文本，像微信聊天一样自然
- 不要主动自我介绍能力（"我可以帮你..."）。被问到时简短回答
- 不要每条消息都以"好的"或自我描述开头
- 回复风格参照 soul.md 中的语气对照表，用"有魂儿"那一列的能量`);

  return parts.join('\n');
}
