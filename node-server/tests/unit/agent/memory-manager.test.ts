import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryManager } from '../../../src/agent/memory/memory-manager.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

let tmpDir: string;
let memoryManager: MemoryManager;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abao-test-'));
  memoryManager = new MemoryManager(tmpDir);
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('MemoryManager - Permanent Memory', () => {
  const groupId = 'test-group-1';

  it('should save and retrieve permanent memory', async () => {
    await memoryManager.savePermanentMemory(groupId, '# Group Memory\n\nSome context here.');
    const memories = await memoryManager.getPermanentMemories(groupId);
    expect(memories).toBe('# Group Memory\n\nSome context here.');
  });

  it('should return empty string when no memory exists', async () => {
    const memories = await memoryManager.getPermanentMemories('nonexistent');
    expect(memories).toBe('');
  });

  it('should overwrite existing permanent memory', async () => {
    await memoryManager.savePermanentMemory(groupId, 'old content');
    await memoryManager.savePermanentMemory(groupId, 'new content');
    const memories = await memoryManager.getPermanentMemories(groupId);
    expect(memories).toBe('new content');
  });

  it('should create directories if they do not exist', async () => {
    await memoryManager.savePermanentMemory(groupId, 'test');
    const memDir = path.join(tmpDir, 'memories', groupId);
    const stat = await fs.stat(memDir);
    expect(stat.isDirectory()).toBe(true);
  });
});

describe('MemoryManager - Session History', () => {
  const groupId = 'test-group-2';

  it('should append and retrieve session history', async () => {
    await memoryManager.appendSessionHistory(groupId, { role: 'user', content: 'hello' });
    await memoryManager.appendSessionHistory(groupId, { role: 'assistant', content: 'hi there' });

    const history = await memoryManager.getSessionHistory(groupId);
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: 'user', content: 'hello' });
    expect(history[1]).toEqual({ role: 'assistant', content: 'hi there' });
  });

  it('should return empty array when no history exists', async () => {
    const history = await memoryManager.getSessionHistory('nonexistent');
    expect(history).toEqual([]);
  });

  it('should respect limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await memoryManager.appendSessionHistory(groupId, { role: 'user', content: `msg ${i}` });
    }

    const history = await memoryManager.getSessionHistory(groupId, 3);
    expect(history).toHaveLength(3);
    // Should return the last 3 messages
    expect(history[0].content).toBe('msg 7');
    expect(history[2].content).toBe('msg 9');
  });

  it('should return all when limit exceeds total', async () => {
    await memoryManager.appendSessionHistory(groupId, { role: 'user', content: 'only one' });
    const history = await memoryManager.getSessionHistory(groupId, 100);
    expect(history).toHaveLength(1);
  });

  it('should store in JSONL format', async () => {
    await memoryManager.appendSessionHistory(groupId, { role: 'user', content: 'hello' });
    const filePath = path.join(tmpDir, 'sessions', groupId, 'history.jsonl');
    const raw = await fs.readFile(filePath, 'utf-8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({ role: 'user', content: 'hello' });
  });
});

describe('MemoryManager - Build Context', () => {
  const groupId = 'test-group-3';

  it('should build context from recent messages', async () => {
    const recentMessages = [
      { sender_id: 'user1', message_type: 'USER', content: 'Hi @AI', nickname: 'Alice' },
      { sender_id: null, message_type: 'AI', content: 'Hello!', nickname: null },
    ];

    const context = await memoryManager.buildContext(groupId, recentMessages, '');
    expect(context).toHaveLength(2);
    expect(context[0]).toEqual({ role: 'user', content: 'Alice: Hi @AI' });
    expect(context[1]).toEqual({ role: 'assistant', content: 'Hello!' });
  });

  it('should include permanent memories in context info', async () => {
    const recentMessages = [
      { sender_id: 'user1', message_type: 'USER', content: 'hello', nickname: 'Bob' },
    ];

    const context = await memoryManager.buildContext(groupId, recentMessages, 'Important: Bob likes cats');
    // Permanent memories are returned as context for system prompt, not in message array
    expect(context).toHaveLength(1);
    expect(context[0]).toEqual({ role: 'user', content: 'Bob: hello' });
  });

  it('should handle SYSTEM messages', async () => {
    const recentMessages = [
      { sender_id: null, message_type: 'SYSTEM', content: 'Alice joined', nickname: null },
      { sender_id: 'user1', message_type: 'USER', content: 'welcome!', nickname: 'Bob' },
    ];

    const context = await memoryManager.buildContext(groupId, recentMessages, '');
    expect(context).toHaveLength(2);
    expect(context[0]).toEqual({ role: 'system', content: 'Alice joined' });
    expect(context[1]).toEqual({ role: 'user', content: 'Bob: welcome!' });
  });

  it('should return empty array for no messages', async () => {
    const context = await memoryManager.buildContext(groupId, [], '');
    expect(context).toEqual([]);
  });
});
