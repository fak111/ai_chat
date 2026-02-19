import { logger } from '../utils/logger.js';

const DEEPSEEK_BASE_URL = process.env.AI_BASE_URL || 'https://api.deepseek.com/v1';
const EVALUATION_TIMEOUT_MS = 3000;

const SYSTEM_PROMPT = `你是一个群聊AI助手的"发言决策器"。
你的工作是判断AI是否应该在这个时候主动插话。

判断标准：
- 有人在问问题且你可能知道答案 → 考虑插话
- 话题很有趣你有独特观点 → 考虑插话
- 纯日常寒暄/私人对话 → 不插话
- 已经有人在回答了 → 不插话
- 话题敏感/争吵 → 不插话

只输出 JSON（不要其他文字）：
{"speak": true/false, "reason": "简短原因"}`;

function resolveApiKey(): string {
  const map: Record<string, string> = {
    deepseek: 'DEEPSEEK_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    'kimi-coding': 'KIMI_API_KEY',
    openai: 'OPENAI_API_KEY',
    intern: 'INTERN_API_KEY',
  };
  const provider = process.env.AI_PROVIDER || 'deepseek';
  return process.env[map[provider] || 'DEEPSEEK_API_KEY'] || '';
}

/**
 * 层2: LLM 快速裁判
 *
 * 用 DeepSeek API 做极短判断：AI 是否该主动插话。
 * 超时或出错都当 speak=false 处理。
 */
export async function evaluateProactive(
  groupId: string,
  recentContext: string[],
  triggerReason: string,
): Promise<{ speak: boolean; reason: string }> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    return { speak: false, reason: '无API key' };
  }

  const userMessage = `触发原因: ${triggerReason}\n\n最近对话:\n${recentContext.join('\n')}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EVALUATION_TIMEOUT_MS);

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 50,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn({ groupId, status: response.status }, '层2: API请求失败');
      return { speak: false, reason: `API错误 ${response.status}` };
    }

    const data = (await response.json()) as any;
    const text = data.choices?.[0]?.message?.content?.trim() || '';

    logger.debug({ groupId, text }, '层2: LLM原始输出');

    // 解析 JSON 输出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn({ groupId, text }, '层2: 无法解析JSON');
      return { speak: false, reason: '输出格式错误' };
    }

    const result = JSON.parse(jsonMatch[0]);
    const speak = result.speak === true;
    const reason = String(result.reason || '').slice(0, 100);

    logger.info({ groupId, speak, reason }, `层2: 裁判结果`);
    return { speak, reason };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.warn({ groupId }, '层2: 超时(3s)，默认不插话');
    } else {
      logger.warn({ err, groupId }, '层2: 评估异常');
    }
    return { speak: false, reason: '评估异常' };
  }
}
