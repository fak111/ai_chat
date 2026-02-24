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
}

/**
 * SearXNG JSON API 搜索
 * 聚合多个搜索引擎（Google, Bing, DuckDuckGo, Brave 等）
 */
async function searxngSearch(query: string, maxResults = 5): Promise<string> {
  const baseUrl = process.env.SEARXNG_URL || 'http://searxng:8080';
  const url = `${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&language=zh-CN`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (!res.ok) {
    throw new Error(`SearXNG returned ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as { results?: SearxngResult[] };
  const results = data.results?.slice(0, maxResults) || [];

  if (results.length === 0) {
    return '未找到相关搜索结果。';
  }

  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.content || '(无摘要)'}\n   ${r.url}`)
    .join('\n\n');
}

export const webSearchTool: AgentTool<any> = {
  name: 'web_search',
  label: '网络搜索',
  description:
    '搜索互联网获取实时信息。适用于查询新闻、人物、事件、天气、技术问题等需要最新数据的问题。当用户询问你不确定或需要最新信息的问题时，优先使用此工具。',
  parameters: Type.Object({
    query: Type.String({ description: '搜索关键词（中文或英文皆可）' }),
  }),
  execute: async (_toolCallId, args) => {
    const { query } = args;
    logger.info({ query }, 'web_search executing via SearXNG');

    // 检查缓存
    const cached = getCached(query);
    if (cached) {
      logger.info({ query }, 'web_search cache hit');
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
      const result = await searxngSearch(query);
      setCache(query, result);

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
