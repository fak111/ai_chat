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
): Promise<string> {
  const soul = await loadSoul();

  const parts: string[] = [soul];

  if (permanentMemories.trim()) {
    const truncated = permanentMemories.length > MAX_MEMORY_CHARS
      ? permanentMemories.slice(0, MAX_MEMORY_CHARS) + '\n...(已截断)'
      : permanentMemories;
    parts.push(`\n## 群组记忆\n\n${truncated}`);
  }

  parts.push(`\n## 当前群组\n\n群组ID: ${groupId}`);

  return parts.join('\n');
}
