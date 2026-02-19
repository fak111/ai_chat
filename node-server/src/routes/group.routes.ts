import { Router, Request, Response, NextFunction } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import {
  createGroup,
  joinGroup,
  getUserGroups,
  getGroupDetail,
  getGroupInviteCode,
  leaveGroup,
} from '../services/group.service.js';

export const groupRoutes = Router();

// All group routes require authentication
groupRoutes.use(authRequired);

// POST /api/groups - Create a new group
groupRoutes.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await createGroup(req.user!, req.body.name ?? '');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/groups/join - Join a group by invite code
groupRoutes.post('/join', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await joinGroup(req.user!, req.body.inviteCode ?? '');
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/groups - List user's groups
groupRoutes.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getUserGroups(req.user!);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/groups/:groupId - Get group detail
groupRoutes.get('/:groupId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getGroupDetail(req.user!, req.params.groupId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/groups/:groupId/invite - Get invite code
groupRoutes.get('/:groupId/invite', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await getGroupInviteCode(req.user!, req.params.groupId);
    res.json({ inviteCode: result });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/groups/:groupId/leave - Leave a group
groupRoutes.delete('/:groupId/leave', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await leaveGroup(req.user!, req.params.groupId);
    res.json({ message: '已退出群聊' });
  } catch (err) {
    next(err);
  }
});
