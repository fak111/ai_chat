import { logger } from '../utils/logger.js';

// 每条消息在群状态中的记录
interface ChatMessage {
  content: string;
  senderId: string;
  timestamp: number;
  isQuestion: boolean;
  messageType: string;
}

// 每群维护的状态
interface GroupChatState {
  recentMessages: ChatMessage[];
  lastAISpoke: number;        // AI 最后说话的时间戳
  messagesSinceAI: number;    // AI 上次说话后的消息数
}

export interface ProactiveCheckResult {
  shouldEvaluate: boolean;  // 是否进入层2
  reason: string;           // 触发原因
}

const groupStates = new Map<string, GroupChatState>();

// 最多保留最近 20 条消息记录
const MAX_RECENT_MESSAGES = 20;

// 冷却期：AI 主动说话后 5 分钟内不再主动
const COOLDOWN_MS = 5 * 60 * 1000;
// 冷却期内的消息数阈值
const COOLDOWN_MESSAGES = 8;
// 冷场检测：提问超过 2 分钟无人回复
const UNANSWERED_TIMEOUT_MS = 2 * 60 * 1000;
// 话题热度：连续 N 条消息 AI 未参与时偶尔刷存在感
const PRESENCE_THRESHOLD = 15;
// 短消息过滤阈值
const MIN_CONTENT_LENGTH = 4;

// 疑问词正则
const QUESTION_MARK_RE = /[？?]/;
const QUESTION_WORDS_RE = /(?:怎么|为什么|为啥|哪里|哪个|什么|如何|谁|几个|多少|吗|嘛|呢|咋|啥|哪儿|能不能|可不可以|是不是|有没有|会不会)/;

// 求助词
const HELP_WORDS_RE = /(?:帮忙|帮我|推荐|有没有人|谁知道|谁能|求助|求推荐|急|在线等|有人吗|谁会)/;

// @AI 正则（走原有流程）
const AT_AI_RE = /@[Aa][Ii]\b/;

function isQuestion(content: string): boolean {
  return QUESTION_MARK_RE.test(content) || QUESTION_WORDS_RE.test(content);
}

function isHelpRequest(content: string): boolean {
  return HELP_WORDS_RE.test(content);
}

function getOrCreateState(groupId: string): GroupChatState {
  let state = groupStates.get(groupId);
  if (!state) {
    state = {
      recentMessages: [],
      lastAISpoke: 0,
      messagesSinceAI: 0,
    };
    groupStates.set(groupId, state);
  }
  return state;
}

/**
 * 记录 AI 说话事件（主动或被 @），用于冷却期计算
 */
export function recordAISpoke(groupId: string): void {
  const state = getOrCreateState(groupId);
  state.lastAISpoke = Date.now();
  state.messagesSinceAI = 0;
}

/**
 * 获取最近消息摘要（供层2使用）
 */
export function getRecentContext(groupId: string, count: number = 5): string[] {
  const state = groupStates.get(groupId);
  if (!state) return [];
  return state.recentMessages
    .slice(-count)
    .map((m) => {
      const prefix = m.messageType === 'AI' ? '[AI]' : `[用户]`;
      return `${prefix}: ${m.content.slice(0, 100)}`;
    });
}

/**
 * 层1: 本地规则预筛
 *
 * 每条用户消息都经过这里。返回 shouldEvaluate=true 表示需要进入层2 LLM 裁判。
 */
export function checkProactiveTrigger(
  groupId: string,
  content: string,
  senderId: string,
  messageType: string = 'USER',
): ProactiveCheckResult {
  const state = getOrCreateState(groupId);
  const now = Date.now();
  const questionDetected = isQuestion(content);

  // 记录消息到群状态
  state.recentMessages.push({
    content,
    senderId,
    timestamp: now,
    isQuestion: questionDetected,
    messageType,
  });
  if (state.recentMessages.length > MAX_RECENT_MESSAGES) {
    state.recentMessages.shift();
  }
  state.messagesSinceAI++;

  const skip = (reason: string): ProactiveCheckResult => {
    logger.debug({ groupId, reason }, '层1: 跳过');
    return { shouldEvaluate: false, reason };
  };

  // === 拦截条件（直接跳过） ===

  // AI 自己的消息不触发
  if (messageType === 'AI') return skip('AI自己的消息');

  // 短消息过滤
  if (content.trim().length < MIN_CONTENT_LENGTH) return skip('短消息');

  // 已含 @AI → 走原有触发，不走主动流程
  if (AT_AI_RE.test(content)) return skip('已含@AI');

  // 冷却期检查
  const timeSinceAISpoke = now - state.lastAISpoke;
  if (timeSinceAISpoke < COOLDOWN_MS && state.messagesSinceAI < COOLDOWN_MESSAGES) {
    return skip(`冷却期内 (${Math.round(timeSinceAISpoke / 1000)}s, ${state.messagesSinceAI}条)`);
  }

  // === 通过条件（满足任一） ===

  // ① 疑问检测
  if (questionDetected) {
    return { shouldEvaluate: true, reason: '检测到提问' };
  }

  // ② 求助检测
  if (isHelpRequest(content)) {
    return { shouldEvaluate: true, reason: '检测到求助' };
  }

  // ③ 冷场救场：有人提问超过 2 分钟无人回复
  const recentQuestions = state.recentMessages.filter(
    (m) => m.isQuestion && m.messageType === 'USER' && now - m.timestamp < UNANSWERED_TIMEOUT_MS,
  );
  if (recentQuestions.length > 0) {
    const oldestUnanswered = recentQuestions[0];
    // 检查这个问题之后有没有人回答
    const questionIdx = state.recentMessages.indexOf(oldestUnanswered);
    const repliesAfter = state.recentMessages
      .slice(questionIdx + 1)
      .filter((m) => m.senderId !== oldestUnanswered.senderId);
    if (repliesAfter.length === 0 && now - oldestUnanswered.timestamp > UNANSWERED_TIMEOUT_MS) {
      return { shouldEvaluate: true, reason: '提问超2分钟无人回复' };
    }
  }

  // ④ 话题热度：连续 N 条消息 AI 未参与
  if (state.messagesSinceAI >= PRESENCE_THRESHOLD) {
    return { shouldEvaluate: true, reason: `连续${state.messagesSinceAI}条消息AI未参与` };
  }

  return skip('无匹配规则');
}

// 导出用于测试
export { groupStates as _groupStates };
