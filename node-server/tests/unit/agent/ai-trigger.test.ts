import { describe, it, expect } from 'vitest';
import { shouldTriggerAI, cleanContentForAI } from '../../../src/agent/ai-trigger.js';

describe('shouldTriggerAI', () => {
  it('should return true when content contains @AI', () => {
    expect(shouldTriggerAI('@AI hello')).toBe(true);
  });

  it('should return true when content contains @ai', () => {
    expect(shouldTriggerAI('@ai hello')).toBe(true);
  });

  it('should return true when content contains @Ai in middle', () => {
    expect(shouldTriggerAI('hey @Ai what do you think?')).toBe(true);
  });

  it('should return false for @AIR (word boundary)', () => {
    expect(shouldTriggerAI('@AIR conditioning')).toBe(false);
  });

  it('should return false for email-like patterns', () => {
    expect(shouldTriggerAI('user@AIlab.com')).toBe(false);
  });

  it('should return true when replying to AI message', () => {
    expect(shouldTriggerAI('I agree', 'AI')).toBe(true);
  });

  it('should return false for normal message', () => {
    expect(shouldTriggerAI('hello world')).toBe(false);
    expect(shouldTriggerAI('hello world', 'USER')).toBe(false);
  });

  it('should return false for empty content', () => {
    expect(shouldTriggerAI('')).toBe(false);
  });

  it('should handle undefined replyToMessageType', () => {
    expect(shouldTriggerAI('hello')).toBe(false);
    expect(shouldTriggerAI('@AI hello')).toBe(true);
  });
});

describe('cleanContentForAI', () => {
  it('should replace @AI with [提问A宝]', () => {
    expect(cleanContentForAI('@AI hello')).toBe('[提问A宝] hello');
  });

  it('should replace @ai with [提问A宝]', () => {
    expect(cleanContentForAI('@ai hello')).toBe('[提问A宝] hello');
  });

  it('should replace multiple occurrences', () => {
    expect(cleanContentForAI('@AI hi @ai there')).toBe('[提问A宝] hi [提问A宝] there');
  });

  it('should not replace @AIR (word boundary)', () => {
    expect(cleanContentForAI('@AIR conditioning')).toBe('@AIR conditioning');
  });

  it('should return unchanged content without @AI', () => {
    expect(cleanContentForAI('hello world')).toBe('hello world');
  });

  it('should handle empty string', () => {
    expect(cleanContentForAI('')).toBe('');
  });
});
