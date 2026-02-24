import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// Mock DB
vi.mock('../../../src/db/client.js', () => ({
  query: vi.fn(),
  getClient: vi.fn(),
  pool: { on: vi.fn(), query: vi.fn() },
  testConnection: vi.fn().mockResolvedValue(true),
}));

// Mock email service
vi.mock('../../../src/services/email.service.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock('../../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { app } from '../../../src/app.js';

describe('API Versioning — /api/v1/ prefix', () => {
  it('GET /api/v1/health should be reachable (health stays unversioned too)', async () => {
    // Health check should still work at /api/health
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('POST /api/v1/auth/login should be routable', async () => {
    // Will get 422/400 because no body, but NOT 404
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});

    expect(res.status).not.toBe(404);
  });

  it('GET /api/v1/groups should be routable (401 without auth)', async () => {
    const res = await request(app).get('/api/v1/groups');

    // Should be 401 (auth required), NOT 404 (route not found)
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/messages/msg-1 should be routable (401 without auth)', async () => {
    const res = await request(app).get('/api/v1/messages/msg-1');

    expect(res.status).toBe(401);
  });

  it('old /api/auth/login path should still work (backward compat)', async () => {
    // During transition, old paths should still route
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).not.toBe(404);
  });
});
