import { Router, Request, Response, NextFunction } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import {
  sendMessage,
  getMessagesByGroup,
  getRecentMessages,
  getMessageById,
} from '../services/message.service.js';

export const messageRoutes = Router();

// All message routes require authentication
messageRoutes.use(authRequired);

// POST /api/messages/group/:groupId - Send a message
messageRoutes.post('/group/:groupId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const { content, replyToId } = req.body;
    const dto = await sendMessage(req.user!, groupId, content ?? '', replyToId);
    res.json(dto);
  } catch (err) {
    next(err);
  }
});

// GET /api/messages/group/:groupId - Paged messages
messageRoutes.get('/group/:groupId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const page = parseInt(req.query.page as string) || 0;
    const size = parseInt(req.query.size as string) || 50;
    const result = await getMessagesByGroup(groupId, page, size);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/messages/group/:groupId/recent - Recent messages
messageRoutes.get('/group/:groupId/recent', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { groupId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await getRecentMessages(groupId, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/messages/:messageId - Get single message
messageRoutes.get('/:messageId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messageId } = req.params;
    const dto = await getMessageById(messageId);
    res.json(dto);
  } catch (err) {
    next(err);
  }
});
