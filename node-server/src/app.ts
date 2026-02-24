import express from 'express';
import cors from 'cors';
import path from 'path';
import { errorHandler } from './middleware/error-handler.js';
import { authRoutes } from './routes/auth.routes.js';
import { groupRoutes } from './routes/group.routes.js';
import { messageRoutes } from './routes/message.routes.js';
import { healthRoutes } from './routes/health.routes.js';

export const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  exposedHeaders: ['Authorization'],
}));
app.use(express.json());

// 静态文件服务：旧头像向后兼容
app.use('/uploads', cors(), express.static(path.resolve('storage/uploads')));

// CDN 图片代理：Flutter Web 用 XHR 加载图片需要 CORS，R2 未配置 CORS 时走此代理
app.get('/api/v1/cdn/*', async (req, res) => {
  const cdnUrl = process.env.R2_CDN_URL || 'https://cdn.swjip.asia';
  const imagePath = (req.params as Record<string, string>)[0];
  try {
    const upstream = await fetch(`${cdnUrl}/${imagePath}`);
    if (!upstream.ok) { res.status(upstream.status).end(); return; }
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch {
    res.status(502).end();
  }
});

// Health (unversioned, always reachable)
app.use('/api/health', healthRoutes);

// v1 API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/messages', messageRoutes);

// Backward compat: old /api/ paths → same routes (transition period)
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);

// Error handler (must be last)
app.use(errorHandler);
