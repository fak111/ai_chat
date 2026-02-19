import fs from 'fs/promises';
import path from 'path';

interface ChatMessage {
  role: string;
  content: string;
}

interface RawMessage {
  sender_id: string | null;
  message_type: string;
  content: string;
  nickname: string | null;
}

export class MemoryManager {
  private baseDir: string;

  constructor(baseDir: string = 'storage') {
    this.baseDir = baseDir;
  }

  // --- Permanent Memory ---

  async savePermanentMemory(groupId: string, content: string): Promise<void> {
    const dir = path.join(this.baseDir, 'memories', groupId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'MEMORY.md');
    const timestamp = new Date().toISOString().split('T')[0];
    const entry = `\n- [${timestamp}] ${content}\n`;
    await fs.appendFile(filePath, entry, 'utf-8');
  }

  async getPermanentMemories(groupId: string): Promise<string> {
    const filePath = path.join(this.baseDir, 'memories', groupId, 'MEMORY.md');
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  // --- Session History ---

  async appendSessionHistory(groupId: string, message: ChatMessage): Promise<void> {
    const dir = path.join(this.baseDir, 'sessions', groupId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, 'history.jsonl');
    await fs.appendFile(filePath, JSON.stringify(message) + '\n', 'utf-8');
  }

  async getSessionHistory(groupId: string, limit?: number): Promise<ChatMessage[]> {
    const filePath = path.join(this.baseDir, 'sessions', groupId, 'history.jsonl');
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const lines = raw.trim().split('\n').filter(Boolean);
      const all = lines.map((line) => JSON.parse(line) as ChatMessage);
      if (limit !== undefined && limit < all.length) {
        return all.slice(-limit);
      }
      return all;
    } catch {
      return [];
    }
  }

  // --- Context Window Assembly ---

  async buildContext(
    groupId: string,
    recentMessages: RawMessage[],
    permanentMemories: string,
  ): Promise<ChatMessage[]> {
    return recentMessages.map((msg) => {
      if (msg.message_type === 'AI') {
        return { role: 'assistant', content: msg.content };
      }
      if (msg.message_type === 'SYSTEM') {
        return { role: 'system', content: msg.content };
      }
      // USER message: prefix with sender name
      const name = msg.nickname || 'Unknown';
      return { role: 'user', content: `${name}: ${msg.content}` };
    });
  }
}
