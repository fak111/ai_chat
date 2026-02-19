import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSystemPrompt, _resetCache } from '../../../src/agent/soul.js';

// Mock fs to avoid reading actual soul.md
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    readFile: vi.fn().mockResolvedValue('你是A宝，一个有性格的AI助手。'),
  };
});

beforeEach(() => {
  _resetCache();
});

describe('buildSystemPrompt', () => {
  it('should include soul.md content', async () => {
    const prompt = await buildSystemPrompt('group-1', '');
    expect(prompt).toContain('你是A宝');
  });

  it('should include permanent memories when provided', async () => {
    const prompt = await buildSystemPrompt('group-1', 'Bob likes cats. Alice is a designer.');
    expect(prompt).toContain('Bob likes cats');
    expect(prompt).toContain('Alice is a designer');
  });

  it('should include group context info', async () => {
    const prompt = await buildSystemPrompt('group-123', '');
    expect(prompt).toContain('group-123');
  });

  it('should not exceed reasonable length', async () => {
    const longMemory = 'x'.repeat(10000);
    const prompt = await buildSystemPrompt('group-1', longMemory);
    // Should truncate to reasonable size (roughly 3000 tokens ~ 12000 chars)
    expect(prompt.length).toBeLessThan(15000);
  });

  it('should cache soul.md content after first read', async () => {
    const fs = await import('fs/promises');
    const readFileSpy = vi.mocked(fs.readFile);
    const callsBefore = readFileSpy.mock.calls.length;
    await buildSystemPrompt('group-1', '');
    await buildSystemPrompt('group-2', '');
    // Second call should use cache, so readFile called at most once more
    const callsAfter = readFileSpy.mock.calls.length;
    expect(callsAfter - callsBefore).toBeLessThanOrEqual(1);
  });

  it('should handle empty permanent memories gracefully', async () => {
    const prompt = await buildSystemPrompt('group-1', '');
    expect(prompt).toBeTruthy();
    // Should not contain memory section header if no memories
    expect(prompt).not.toContain('群组记忆');
  });
});
