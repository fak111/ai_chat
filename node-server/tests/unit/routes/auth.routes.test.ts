import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { errorHandler } from '../../../src/middleware/error-handler.js';

// Mock auth service
vi.mock('../../../src/services/auth.service.js', () => ({
  register: vi.fn(),
  verifyEmail: vi.fn(),
  login: vi.fn(),
  refreshToken: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}));

// Mock auth middleware
vi.mock('../../../src/middleware/auth.middleware.js', () => ({
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn(),
  authRequired: vi.fn((req: any, _res: any, next: any) => {
    // Default: attach a mock user
    req.user = {
      id: 'user-1',
      email: 'test@example.com',
      nickname: 'Tester',
      avatar_url: null,
      created_at: new Date('2025-01-01'),
    };
    next();
  }),
}));

import { authRoutes } from '../../../src/routes/auth.routes.js';
import * as authService from '../../../src/services/auth.service.js';
import { UnauthorizedError, ConflictError, NotFoundError, BadRequestError } from '../../../src/utils/errors.js';

const mockRegister = vi.mocked(authService.register);
const mockVerifyEmail = vi.mocked(authService.verifyEmail);
const mockLogin = vi.mocked(authService.login);
const mockRefreshToken = vi.mocked(authService.refreshToken);
const mockLogout = vi.mocked(authService.logout);
const mockGetMe = vi.mocked(authService.getMe);

// Build test app
function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

// Simple request helper (no supertest needed)
async function request(app: express.Express, method: string, path: string, body?: any) {
  return new Promise<{ status: number; body: any; headers: Record<string, string> }>((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as any).port;
      const url = `http://127.0.0.1:${port}${path}`;

      const options: RequestInit = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body) {
        options.body = JSON.stringify(body);
      }

      fetch(url, options)
        .then(async (res) => {
          const contentType = res.headers.get('content-type') || '';
          let responseBody: any;
          if (contentType.includes('text/html')) {
            responseBody = await res.text();
          } else {
            responseBody = await res.json().catch(() => ({}));
          }
          server.close();
          resolve({
            status: res.status,
            body: responseBody,
            headers: Object.fromEntries(res.headers.entries()),
          });
        })
        .catch((err) => {
          server.close();
          throw err;
        });
    });
  });
}

describe('Auth Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  // ============ POST /api/auth/register ============
  describe('POST /api/auth/register', () => {
    it('should register successfully', async () => {
      mockRegister.mockResolvedValue({
        message: '验证邮件已发送至 test@example.com',
        email: 'test@example.com',
      });

      const res = await request(app, 'POST', '/api/auth/register', {
        email: 'test@example.com',
        password: 'Test1234',
        nickname: 'Tester',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('验证邮件已发送');
      expect(res.body.email).toBe('test@example.com');
    });

    it('should return 409 for duplicate email', async () => {
      mockRegister.mockRejectedValue(new ConflictError('该邮箱已注册'));

      const res = await request(app, 'POST', '/api/auth/register', {
        email: 'taken@example.com',
        password: 'Test1234',
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('该邮箱已注册');
    });

    it('should return 400 for missing email', async () => {
      const res = await request(app, 'POST', '/api/auth/register', {
        password: 'Test1234',
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid password', async () => {
      mockRegister.mockRejectedValue(new BadRequestError('密码至少需要8位'));

      const res = await request(app, 'POST', '/api/auth/register', {
        email: 'test@example.com',
        password: 'short',
      });

      expect(res.status).toBe(400);
    });
  });

  // ============ POST /api/auth/verify ============
  describe('POST /api/auth/verify', () => {
    it('should verify email successfully', async () => {
      mockVerifyEmail.mockResolvedValue({ message: '邮箱验证成功' });

      const res = await request(app, 'POST', '/api/auth/verify', { token: 'valid-token' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('邮箱验证成功');
    });

    it('should return 404 for invalid token', async () => {
      mockVerifyEmail.mockRejectedValue(new NotFoundError('验证链接无效'));

      const res = await request(app, 'POST', '/api/auth/verify', { token: 'invalid' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('验证链接无效');
    });
  });

  // ============ GET /api/auth/verify?token= ============
  describe('GET /api/auth/verify', () => {
    it('should return HTML success page', async () => {
      mockVerifyEmail.mockResolvedValue({ message: '邮箱验证成功' });

      const res = await request(app, 'GET', '/api/auth/verify?token=valid-token');

      expect(res.status).toBe(200);
      expect(typeof res.body).toBe('string');
      expect(res.body).toContain('验证成功');
    });

    it('should return HTML error page for invalid token', async () => {
      mockVerifyEmail.mockRejectedValue(new NotFoundError('验证链接无效'));

      const res = await request(app, 'GET', '/api/auth/verify?token=bad');

      expect(res.status).toBe(200);
      expect(typeof res.body).toBe('string');
      expect(res.body).toContain('验证失败');
    });
  });

  // ============ POST /api/auth/login ============
  describe('POST /api/auth/login', () => {
    it('should login successfully', async () => {
      mockLogin.mockResolvedValue({
        accessToken: 'access-jwt',
        refreshToken: 'refresh-uuid',
        user: {
          id: 'user-1',
          email: 'test@example.com',
          nickname: 'Tester',
          avatarUrl: null,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      });

      const res = await request(app, 'POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'Test1234',
      });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe('access-jwt');
      expect(res.body.refreshToken).toBe('refresh-uuid');
      expect(res.body.user.id).toBe('user-1');
    });

    it('should return 401 for wrong credentials', async () => {
      mockLogin.mockRejectedValue(new UnauthorizedError('邮箱或密码错误'));

      const res = await request(app, 'POST', '/api/auth/login', {
        email: 'test@example.com',
        password: 'WrongPass1',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('邮箱或密码错误');
    });
  });

  // ============ POST /api/auth/refresh ============
  describe('POST /api/auth/refresh', () => {
    it('should refresh tokens successfully', async () => {
      mockRefreshToken.mockResolvedValue({
        accessToken: 'new-access-jwt',
        refreshToken: 'new-refresh-uuid',
      });

      const res = await request(app, 'POST', '/api/auth/refresh', {
        refreshToken: 'old-refresh-uuid',
      });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBe('new-access-jwt');
      expect(res.body.refreshToken).toBe('new-refresh-uuid');
    });

    it('should return 401 for invalid refresh token', async () => {
      mockRefreshToken.mockRejectedValue(new UnauthorizedError('无效的刷新令牌'));

      const res = await request(app, 'POST', '/api/auth/refresh', {
        refreshToken: 'invalid',
      });

      expect(res.status).toBe(401);
    });
  });

  // ============ POST /api/auth/logout ============
  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      mockLogout.mockResolvedValue({ message: '登出成功' });

      const res = await request(app, 'POST', '/api/auth/logout', {
        refreshToken: 'some-token',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('登出成功');
    });

    it('should logout without refresh token', async () => {
      mockLogout.mockResolvedValue({ message: '登出成功' });

      const res = await request(app, 'POST', '/api/auth/logout', {});

      expect(res.status).toBe(200);
    });
  });

  // ============ GET /api/auth/me ============
  describe('GET /api/auth/me', () => {
    it('should return current user info', async () => {
      mockGetMe.mockReturnValue({
        id: 'user-1',
        email: 'test@example.com',
        nickname: 'Tester',
        avatarUrl: null,
        createdAt: '2025-01-01T00:00:00.000Z',
      });

      const res = await request(app, 'GET', '/api/auth/me');

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('user-1');
      expect(res.body.email).toBe('test@example.com');
    });
  });
});
