import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { logger } from '../../../utils/logger.js';

// --- 简易内存缓存 ---
const cache = new Map<string, { result: string; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 小时

// --- 简易限流 ---
let requestTimestamps: number[] = [];
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 1000;

function checkRateLimit(): boolean {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter((ts) => now - ts < RATE_WINDOW);
  if (requestTimestamps.length >= RATE_LIMIT) return false;
  requestTimestamps.push(now);
  return true;
}

function getCached(key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: string): void {
  cache.set(key, { result, ts: Date.now() });
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

interface SearxngResult {
  title: string;
  url: string;
  content: string;
  engine: string;
  engines?: string[];
}

/**
 * SearXNG JSON API 搜索
 * 聚合多个搜索引擎（Google, Bing, DuckDuckGo, Brave 等）
 */
async function searxngSearch(query: string, timeRange?: string, maxResults = 10): Promise<string> {
  const baseUrl = process.env.SEARXNG_URL || 'http://searxng:8080';
  const authHeader: Record<string, string> = process.env.SEARXNG_AUTH
    ? { Authorization: `Basic ${Buffer.from(process.env.SEARXNG_AUTH).toString('base64')}` }
    : {};
  let url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&language=zh-CN`;
  if (timeRange) {
    url += `&time_range=${timeRange}`;
  }

  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: authHeader,
  });

  if (!res.ok) {
    throw new Error(`SearXNG returned ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as { results?: SearxngResult[] };
  const results = data.results?.slice(0, maxResults) || [];

  if (results.length === 0) {
    return '未找到相关搜索结果。';
  }

  return results
    .map((r, i) => {
      const engines = r.engines?.join(', ') || r.engine || '未知';
      return `${i + 1}. ${r.title}\n   ${r.content || '(无摘要)'}\n   ${r.url} [来源: ${engines}]`;
    })
    .join('\n\n');
}

export const webSearchTool: AgentTool<any> = {
  name: 'web_search',
  label: '网络搜索',
  description:
    '搜索互联网获取实时信息。适用于查询新闻、人物、事件、天气、技术问题等需要最新数据的问题。\n使用技巧：\n- 问"今天/最近"的事，设 time_range 为 day 或 week\n- 关键词要具体，如"迪丽热巴 2026年2月 最新动态"比"迪丽热巴今天"效果好\n- 返回多条结果供你综合判断，注意甄别时效性',
  parameters: Type.Object({
    query: Type.String({ description: '搜索关键词（中文或英文皆可）' }),
    time_range: Type.Optional(
      Type.Union([
        Type.Literal('day'),
        Type.Literal('week'),
        Type.Literal('month'),
        Type.Literal('year'),
      ], { description: '时间范围过滤。问"今天"用 day，问"最近"用 week 或 month' })
    ),
  }),
  execute: async (_toolCallId, args) => {
    const { query, time_range } = args;
    logger.info({ query, time_range }, 'web_search executing via SearXNG');

    // 检查缓存（cache key 包含 time_range 避免混淆）
    const cacheKey = time_range ? `${query}__tr:${time_range}` : query;
    const cached = getCached(cacheKey);
    if (cached) {
      logger.info({ query, time_range }, 'web_search cache hit');
      return {
        content: [{ type: 'text' as const, text: cached }],
        details: undefined,
      };
    }

    // 检查限流
    if (!checkRateLimit()) {
      return {
        content: [{ type: 'text' as const, text: '搜索请求过于频繁，请稍后再试（限制: 每分钟 10 次）。' }],
        details: undefined,
      };
    }

    try {
      const result = await searxngSearch(query, time_range);
      setCache(cacheKey, result);

      return {
        content: [{ type: 'text' as const, text: result }],
        details: undefined,
      };
    } catch (err: any) {
      logger.warn({ err: err.message, query }, 'SearXNG search failed');
      return {
        content: [{ type: 'text' as const, text: `搜索出错: ${err.message}` }],
        details: undefined,
      };
    }
  },
};
