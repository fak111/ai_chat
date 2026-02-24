import { describe, it, expect, vi } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { errorHandler } from '../../../src/middleware/error-handler.js';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from '../../../src/utils/errors.js';

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function createApp(throwError: () => void) {
  const app = express();
  app.use(express.json());
  app.get('/test', (_req: Request, _res: Response, next: NextFunction) => {
    try {
      throwError();
    } catch (err) {
      next(err);
    }
  });
  app.use(errorHandler);
  return app;
}

describe('Error Handler — API Specification v1 format', () => {
  describe('AppError → { code, message }', () => {
    it('should return numeric error code + message for AppError with errorCode', async () => {
      const app = createApp(() => {
        throw new AppError(404, '群聊不存在', 40001);
      });

      const res = await request(app).get('/test');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 40001);
      expect(res.body).toHaveProperty('message', '群聊不存在');
      // Should NOT have old 'error' field
      expect(res.body).not.toHaveProperty('error');
    });

    it('should use default error code when errorCode not provided', async () => {
      const app = createApp(() => {
        throw new NotFoundError('资源不存在');
      });

      const res = await request(app).get('/test');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message', '资源不存在');
      expect(typeof res.body.code).toBe('number');
    });

    it('should return correct code for BadRequestError', async () => {
      const app = createApp(() => {
        throw new BadRequestError('参数错误');
      });

      const res = await request(app).get('/test');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message', '参数错误');
    });

    it('should return correct code for UnauthorizedError', async () => {
      const app = createApp(() => {
        throw new UnauthorizedError('未授权');
      });

      const res = await request(app).get('/test');

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message', '未授权');
    });

    it('should return correct code for ForbiddenError', async () => {
      const app = createApp(() => {
        throw new ForbiddenError('无权限');
      });

      const res = await request(app).get('/test');

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message', '无权限');
    });

    it('should return correct code for ConflictError', async () => {
      const app = createApp(() => {
        throw new ConflictError('已存在');
      });

      const res = await request(app).get('/test');

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('code');
      expect(res.body).toHaveProperty('message', '已存在');
    });
  });

  describe('ZodError → { code: 20001, message, errors }', () => {
    it('should return code 20001 with field-level errors for Zod validation', async () => {
      const { z } = await import('zod');
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
      });

      const app = createApp(() => {
        schema.parse({ email: 'bad', password: '123' });
      });

      const res = await request(app).get('/test');

      expect(res.status).toBe(422);
      expect(res.body).toHaveProperty('code', 20001);
      expect(res.body).toHaveProperty('message', '参数验证失败');
      expect(res.body).toHaveProperty('errors');
      expect(typeof res.body.errors).toBe('object');
      // Should NOT have old 'error' field
      expect(res.body).not.toHaveProperty('error');
    });
  });

  describe('Unknown Error → { code: 10001, message }', () => {
    it('should return generic error for unhandled exceptions', async () => {
      const app = createApp(() => {
        throw new Error('something broke');
      });

      const res = await request(app).get('/test');

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('code', 10001);
      expect(res.body).toHaveProperty('message', '服务器内部错误');
      expect(res.body).not.toHaveProperty('error');
    });
  });
});
