import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { logger } from '../../../utils/logger.js';
import * as cheerio from 'cheerio';

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

/**
 * DuckDuckGo Instant Answer API
 * 适合事实性查询、定义、简短回答
 */
async function instantSearch(query: string): Promise<string | null> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as any;

    const parts: string[] = [];

    if (data.AbstractText) {
      parts.push(`[摘要] ${data.AbstractText}`);
      if (data.AbstractURL) parts.push(`来源: ${data.AbstractURL}`);
    }

    if (data.Answer) {
      parts.push(`[回答] ${data.Answer}`);
    }

    if (data.Definition) {
      parts.push(`[定义] ${data.Definition}`);
    }

    if (data.RelatedTopics?.length > 0) {
      const topics = data.RelatedTopics
        .filter((t: any) => t.Text)
        .slice(0, 3)
        .map((t: any) => `- ${t.Text}`);
      if (topics.length > 0) {
        parts.push(`[相关]\n${topics.join('\n')}`);
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : null;
  } catch (err) {
    logger.debug({ err, query }, 'Instant search failed');
    return null;
  }
}

/**
 * DuckDuckGo HTML Lite 搜索
 * 通过抓取 DuckDuckGo 轻量版 HTML 页面获取搜索结果
 * 纯 HTTP + cheerio 解析，无需浏览器
 */
async function htmlSearch(query: string, maxResults = 5): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const results: { title: string; snippet: string; url: string }[] = [];

    $('.results .result').each((_i, el) => {
      if (results.length >= maxResults) return false;
      const $el = $(el);
      const title = $el.find('.result__a').first().text().trim();
      const snippet = $el.find('.result__snippet').first().text().trim();
      // DuckDuckGo 使用 redirect URL，提取真实 URL
      let href = $el.find('.result__url').first().text().trim();
      if (!href) {
        const rawHref = $el.find('.result__a').first().attr('href') || '';
        const uddgMatch = rawHref.match(/uddg=([^&]+)/);
        href = uddgMatch ? decodeURIComponent(uddgMatch[1]) : rawHref;
      }

      if (title) {
        results.push({ title, snippet: snippet || '(无摘要)', url: href });
      }
    });

    if (results.length === 0) {
      return '未找到相关搜索结果。';
    }

    return results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`)
      .join('\n\n');
  } catch (err: any) {
    logger.warn({ err: err.message, query }, 'HTML search failed');
    return `搜索出错: ${err.message}`;
  }
}

export const webSearchTool: AgentTool<any> = {
  name: 'web_search',
  label: '网络搜索',
  description:
    '搜索互联网获取实时信息。适用于查询新闻、人物、事件、天气、技术问题等需要最新数据的问题。无需 API Key。当用户询问你不确定或需要最新信息的问题时，优先使用此工具。',
  parameters: Type.Object({
    query: Type.String({ description: '搜索关键词（中文或英文皆可）' }),
  }),
  execute: async (_toolCallId, args) => {
    const { query } = args;
    logger.info({ query }, 'web_search executing');

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

    // 1. 先试 Instant Answer API（快速、轻量）
    const instant = await instantSearch(query);

    // 2. 同时做 HTML 搜索获取更多结果
    const full = await htmlSearch(query);

    // 3. 组合结果
    const parts: string[] = [];
    if (instant) {
      parts.push('--- 快速回答 ---');
      parts.push(instant);
    }
    parts.push('--- 搜索结果 ---');
    parts.push(full);

    const result = parts.join('\n\n');
    setCache(query, result);

    return {
      content: [{ type: 'text' as const, text: result }],
      details: undefined,
    };
  },
};
