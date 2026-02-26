import http from 'node:http';
import https from 'node:https';
import { SocksProxyAgent } from 'socks-proxy-agent';

/**
 * 创建 SOCKS5 代理 Agent（如果环境变量 SOCKS_PROXY 已配置）
 */
export function createProxyAgent(): http.Agent | undefined {
  const proxy = process.env.SOCKS_PROXY;
  if (!proxy) return undefined;
  return new SocksProxyAgent(proxy);
}

export interface FetchResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

/**
 * 通过 SOCKS5 代理（如果可用）发起 HTTP/HTTPS 请求
 * - 自动跟随重定向（最多 5 次）
 * - 限制响应体大小（默认 2MB）
 * - 可配置超时
 */
export async function proxyFetch(
  url: string,
  options?: {
    timeout?: number;
    maxSize?: number;
    maxRedirects?: number;
    headers?: Record<string, string>;
  },
): Promise<FetchResult> {
  const timeout = options?.timeout ?? 15_000;
  const maxSize = options?.maxSize ?? 2 * 1024 * 1024; // 2MB
  const maxRedirects = options?.maxRedirects ?? 5;
  const customHeaders = options?.headers ?? {};

  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    const result = await doRequest(currentUrl, timeout, maxSize, customHeaders);

    // Handle redirects (301, 302, 303, 307, 308)
    if (
      result.status >= 300 &&
      result.status < 400 &&
      result.headers.location
    ) {
      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new Error(`Too many redirects (>${maxRedirects})`);
      }
      currentUrl = new URL(result.headers.location, currentUrl).href;
      continue;
    }

    return result;
  }

  throw new Error('Redirect loop detected');
}

function doRequest(
  url: string,
  timeout: number,
  maxSize: number,
  headers: Record<string, string>,
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const mod = parsedUrl.protocol === 'https:' ? https : http;
    const agent = createProxyAgent();

    const reqOptions: http.RequestOptions = {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; AbaoChatBot/1.0)',
        Accept: 'text/html,application/json,text/*;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...headers,
      },
      timeout,
      ...(agent ? { agent } : {}),
    };

    const req = mod.get(url, reqOptions, (res) => {
      const chunks: Buffer[] = [];
      let totalSize = 0;

      res.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > maxSize) {
          req.destroy();
          reject(new Error(`Response too large (>${Math.round(maxSize / 1024)}KB)`));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout (${timeout}ms)`));
    });
  });
}
