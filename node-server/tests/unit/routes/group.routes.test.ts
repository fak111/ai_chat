import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock auth middleware
vi.mock('../../../src/middleware/auth.middleware.js', () => ({
  authRequired: vi.fn((_req: any, _res: any, next: any) => next()),
}));

// Mock group service
vi.mock('../../../src/services/group.service.js', () => ({
  createGroup: vi.fn(),
  joinGroup: vi.fn(),
  getUserGroups: vi.fn(),
  getGroupDetail: vi.fn(),
  getGroupInviteCode: vi.fn(),
  leaveGroup: vi.fn(),
}));

import { authRequired } from '../../../src/middleware/auth.middleware.js';
import {
  createGroup,
  joinGroup,
  getUserGroups,
  getGroupDetail,
  getGroupInviteCode,
  leaveGroup,
} from '../../../src/services/group.service.js';
import { groupRoutes } from '../../../src/routes/group.routes.js';
import { errorHandler } from '../../../src/middleware/error-handler.js';
import { NotFoundError, ForbiddenError, ConflictError, BadRequestError } from '../../../src/utils/errors.js';

const mockCreateGroup = vi.mocked(createGroup);
const mockJoinGroup = vi.mocked(joinGroup);
const mockGetUserGroups = vi.mocked(getUserGroups);
const mockGetGroupDetail = vi.mocked(getGroupDetail);
const mockGetGroupInviteCode = vi.mocked(getGroupInviteCode);
const mockLeaveGroup = vi.mocked(leaveGroup);
const mockAuthRequired = vi.mocked(authRequired);

function createApp() {
  const app = express();
  app.use(express.json());
  // Inject fake user
  app.use((req, _res, next) => {
    req.user = {
      id: 'user-1',
      email: 'test@example.com',
      nickname: 'Tester',
    } as any;
    next();
  });
  app.use('/api/groups', groupRoutes);
  app.use(errorHandler);
  return app;
}

describe('Group Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  describe('POST /api/groups', () => {
    it('should create group and return 200', async () => {
      const groupDto = {
        id: 'group-1', name: '测试群', inviteCode: 'ABC123',
        memberCount: 2, createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        lastMessage: null, lastMessageAt: null, unreadCount: 0,
      };
      mockCreateGroup.mockResolvedValue(groupDto);

      const res = await request(app)
        .post('/api/groups')
        .send({ name: '测试群' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('group-1');
      expect(res.body.inviteCode).toBe('ABC123');
      expect(res.body.memberCount).toBe(2);
    });

    it('should return 400 for empty name', async () => {
      mockCreateGroup.mockRejectedValue(new BadRequestError('群聊名称不能为空'));

      const res = await request(app)
        .post('/api/groups')
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('群聊名称不能为空');
    });
  });

  describe('POST /api/groups/join', () => {
    it('should join group and return 200', async () => {
      const groupDto = {
        id: 'group-1', name: '测试群', inviteCode: 'ABC123',
        memberCount: 3, createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        lastMessage: null, lastMessageAt: null, unreadCount: 0,
      };
      mockJoinGroup.mockResolvedValue(groupDto);

      const res = await request(app)
        .post('/api/groups/join')
        .send({ inviteCode: 'ABC123' });

      expect(res.status).toBe(200);
      expect(res.body.memberCount).toBe(3);
    });

    it('should return 404 for invalid invite code', async () => {
      mockJoinGroup.mockRejectedValue(new NotFoundError('邀请码无效'));

      const res = await request(app)
        .post('/api/groups/join')
        .send({ inviteCode: 'INVALID' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('邀请码无效');
    });

    it('should return 409 if already a member', async () => {
      mockJoinGroup.mockRejectedValue(new ConflictError('您已在该群聊中'));

      const res = await request(app)
        .post('/api/groups/join')
        .send({ inviteCode: 'ABC123' });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('您已在该群聊中');
    });
  });

  describe('GET /api/groups', () => {
    it('should return user groups', async () => {
      mockGetUserGroups.mockResolvedValue([]);

      const res = await request(app).get('/api/groups');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/groups/:groupId', () => {
    it('should return group detail', async () => {
      const detail = {
        id: 'group-1', name: '测试群', inviteCode: 'ABC123',
        createdAt: '2025-01-01T00:00:00.000Z', members: [],
      };
      mockGetGroupDetail.mockResolvedValue(detail);

      const res = await request(app).get('/api/groups/group-1');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('group-1');
    });

    it('should return 404 for nonexistent group', async () => {
      mockGetGroupDetail.mockRejectedValue(new NotFoundError('群聊不存在'));

      const res = await request(app).get('/api/groups/nonexistent');

      expect(res.status).toBe(404);
    });

    it('should return 403 for non-member', async () => {
      mockGetGroupDetail.mockRejectedValue(new ForbiddenError('您不是该群聊成员'));

      const res = await request(app).get('/api/groups/group-1');

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/groups/:groupId/invite', () => {
    it('should return invite code', async () => {
      mockGetGroupInviteCode.mockResolvedValue('ABC123');

      const res = await request(app).get('/api/groups/group-1/invite');

      expect(res.status).toBe(200);
      expect(res.body.inviteCode).toBe('ABC123');
    });
  });

  describe('DELETE /api/groups/:groupId/leave', () => {
    it('should leave group and return message', async () => {
      mockLeaveGroup.mockResolvedValue();

      const res = await request(app).delete('/api/groups/group-1/leave');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('已退出群聊');
    });

    it('should return 403 if not a member', async () => {
      mockLeaveGroup.mockRejectedValue(new ForbiddenError('您不是该群聊成员'));

      const res = await request(app).delete('/api/groups/group-1/leave');

      expect(res.status).toBe(403);
    });
  });
});
