import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockProcessMessage } = vi.hoisted(() => ({
  mockProcessMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../src/agent/ai-trigger.js', () => ({
  shouldTriggerAI: vi.fn(),
}));

vi.mock('../../../src/agent/ai-service.js', () => ({
  AIService: vi.fn().mockImplementation(() => ({
    processMessage: mockProcessMessage,
  })),
}));

vi.mock('../../../src/db/client.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { shouldTriggerAI } from '../../../src/agent/ai-trigger.js';
import { processAIIfNeeded } from '../../../src/agent/ai-processor.js';

const mockShouldTrigger = vi.mocked(shouldTriggerAI);

beforeEach(() => {
  vi.clearAllMocks();
});

const groupId = '22222222-2222-2222-2222-222222222222';
const userId = '11111111-1111-1111-1111-111111111111';

describe('processAIIfNeeded', () => {
  it('should not process when AI is not triggered', async () => {
    mockShouldTrigger.mockReturnValue(false);

    await processAIIfNeeded(
      { id: 'msg-1', content: 'hello', messageType: 'USER', replyToId: null } as any,
      userId,
      groupId,
    );

    expect(mockProcessMessage).not.toHaveBeenCalled();
  });

  it('should process when @AI is detected', async () => {
    mockShouldTrigger.mockReturnValue(true);

    await processAIIfNeeded(
      { id: 'msg-1', content: '@AI hello', messageType: 'USER', replyToId: null } as any,
      userId,
      groupId,
    );

    expect(mockProcessMessage).toHaveBeenCalled();
  });

  it('should not throw even if AI processing fails', async () => {
    mockShouldTrigger.mockReturnValue(true);
    mockProcessMessage.mockRejectedValueOnce(new Error('AI failed'));

    await expect(
      processAIIfNeeded(
        { id: 'msg-1', content: '@AI hello', messageType: 'USER', replyToId: null } as any,
        userId,
        groupId,
      ),
    ).resolves.toBeUndefined();
  });

  it('should check replyTo message type for AI trigger', async () => {
    mockShouldTrigger.mockReturnValue(true);

    await processAIIfNeeded(
      { id: 'msg-1', content: 'I agree', messageType: 'USER', replyToId: 'some-ai-msg' } as any,
      userId,
      groupId,
    );

    expect(mockShouldTrigger).toHaveBeenCalled();
  });
});
