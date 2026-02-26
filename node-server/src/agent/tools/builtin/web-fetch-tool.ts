import { Type } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import * as cheerio from 'cheerio';
import { logger } from '../../../utils/logger.js';
import { proxyFetch } from './proxy-fetch.js';

const MAX_TEXT_LENGTH = 500 * 1024; // 500KB text limit

/**
 * 从 HTML 中提取正文文本，去除脚本/样式/导航等噪音
 */
function extractText(html: string, selector?: string): string {
  const $ = cheerio.load(html);

  // Remove noise elements
  $('script, style, nav, footer, header, iframe, noscript, svg, [role="navigation"], [role="banner"], [aria-hidden="true"]').remove();

  if (selector) {
    const selected = $(selector);
    if (selected.length > 0) {
      return selected.text().replace(/\s+/g, ' ').trim();
    }
    return `未找到匹配选择器 "${selector}" 的元素。以下是页面主要内容：\n\n` + extractMainContent($);
  }

  return extractMainContent($);
}

function extractMainContent($: cheerio.CheerioAPI): string {
  // Try common content selectors
  const contentSelectors = [
    'article',
    'main',
    '[role="main"]',
    '.post-content',
    '.article-content',
    '.entry-content',
    '#content',
    '.content',
  ];

  for (const sel of contentSelectors) {
    const el = $(sel);
    if (el.length > 0 && el.text().trim().length > 100) {
      return el.text().replace(/\s+/g, ' ').trim();
    }
  }

  // Fallback: extract from body
  return $('body').text().replace(/\s+/g, ' ').trim();
}

/**
 * 截断文本并添加提示
 */
function truncate(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH) + '\n\n[内容已截断，原文过长]';
}

export const webFetchTool: AgentTool<any> = {
  name: 'web_fetch',
  label: '获取网页内容',
  description:
    '获取指定 URL 的文本内容。适用于读取用户给的链接、查看文档页面、获取 API 响应等。\n' +
    '- HTML 页面会自动提取正文（去除导航/脚注/脚本）\n' +
    '- 可用 selector 参数指定 CSS 选择器精确提取\n' +
    '- JSON 响应会格式化返回\n' +
    '- 纯文本直接返回\n' +
    '- 最大返回 500KB 文本',
  parameters: Type.Object({
    url: Type.String({ description: '要获取的 URL（必须以 http:// 或 https:// 开头）' }),
    selector: Type.Optional(
      Type.String({ description: '可选的 CSS 选择器，用于精确提取页面中的特定部分。例如 "article", "#main-content", ".post-body"' }),
    ),
  }),
  execute: async (_toolCallId, args) => {
    const { url, selector } = args;
    logger.info({ url, selector }, 'web_fetch executing');

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return {
        content: [{ type: 'text' as const, text: `无效的 URL: ${url}` }],
        details: undefined,
      };
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        content: [{ type: 'text' as const, text: `不支持的协议: ${parsedUrl.protocol}，仅支持 http/https` }],
        details: undefined,
      };
    }

    try {
      const result = await proxyFetch(url, { timeout: 15_000, maxSize: 2 * 1024 * 1024 });

      if (result.status >= 400) {
        return {
          content: [{ type: 'text' as const, text: `请求失败: HTTP ${result.status}` }],
          details: undefined,
        };
      }

      const contentType = result.headers['content-type'] || '';
      const body = result.body.toString('utf-8');

      let text: string;

      if (contentType.includes('application/json')) {
        // JSON: pretty-print
        try {
          const parsed = JSON.parse(body);
          text = JSON.stringify(parsed, null, 2);
        } catch {
          text = body;
        }
      } else if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
        // HTML: extract text content
        text = extractText(body, selector);
      } else {
        // Plain text or other text types
        text = body;
      }

      if (!text.trim()) {
        return {
          content: [{ type: 'text' as const, text: '页面内容为空或无法提取有效文本。' }],
          details: undefined,
        };
      }

      return {
        content: [{ type: 'text' as const, text: truncate(text) }],
        details: undefined,
      };
    } catch (err: any) {
      logger.warn({ err: err.message, url }, 'web_fetch failed');
      return {
        content: [{ type: 'text' as const, text: `获取失败: ${err.message}` }],
        details: undefined,
      };
    }
  },
};
