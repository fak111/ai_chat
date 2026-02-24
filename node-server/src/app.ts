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

// 静态文件服务：头像等上传文件
app.use('/uploads', express.static(path.resolve('storage/uploads')));

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
