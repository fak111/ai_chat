import express from 'express';
import cors from 'cors';
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

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);

// Error handler (must be last)
app.use(errorHandler);
