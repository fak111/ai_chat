import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Mock DB ────────────────────────────────────────────────────────────────
const mockQuery = vi.fn();
const mockGetClient = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();

vi.mock('../../src/db/client.js', () => ({
  query: (...args: any[]) => mockQuery(...args),
  getClient: () => mockGetClient(),
  pool: { on: vi.fn(), query: vi.fn() },
  testConnection: vi.fn().mockResolvedValue(true),
}));

// Mock email service
vi.mock('../../src/services/email.service.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock('../../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { app } from '../../src/app.js';
import { signAccessToken } from '../../src/middleware/auth.middleware.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const NOW = new Date('2025-06-01T00:00:00Z');

const testUser = {
  id: 'u-1',
  email: 'test@example.com',
  password_hash: '$2b$10$KqGwi3xQJ1ZSrMjN2ZJG5eYz1q6YQ1DF8BxQ8XjP2TbVnF4jZ1R6m', // Test123456
  nickname: 'Tester',
  avatar_url: null,
  email_verified: true,
  verification_token: null,
  verification_token_expires_at: null,
  created_at: NOW,
  updated_at: NOW,
};

const testUser2 = {
  ...testUser,
  id: 'u-2',
  email: 'user2@example.com',
  nickname: 'User2',
};

const testGroup = {
  id: 'g-1',
  name: '测试群',
  invite_code: 'ABC123',
  created_at: NOW,
  updated_at: NOW,
};

const testMessage = {
  id: 'm-1',
  group_id: 'g-1',
  sender_id: 'u-1',
  content: 'Hello World',
  message_type: 'USER',
  reply_to_id: null,
  created_at: NOW,
  nickname: 'Tester',
  email: 'test@example.com',
  reply_content: null,
  reply_message_type: null,
};

function makeToken(user = testUser): string {
  return signAccessToken(user as any);
}

function rows(data: any[]) {
  return { rows: data, rowCount: data.length };
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// Health (1 test)
// ═══════════════════════════════════════════════════════════════════════════
describe('Health', () => {
  it('GET /api/health -> 200 with status and service', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'abao-server');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Auth (10 tests)
// ═══════════════════════════════════════════════════════════════════════════
describe('Auth', () => {
  // 1. Register success
  it('POST /api/auth/register -> 200 success', async () => {
    mockQuery
      .mockResolvedValueOnce(rows([])) // no existing user
      .mockResolvedValueOnce(rows([testUser])); // INSERT RETURNING

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'Test123456', nickname: 'New' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('email');
    expect(res.body).toHaveProperty('message');
  });

  // 2. Register email already exists -> 409
  it('POST /api/auth/register -> 409 email exists', async () => {
    mockQuery.mockResolvedValueOnce(rows([{ id: 'u-1' }])); // existing user

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Test123456' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });

  // 3. Register password too short -> 400
  it('POST /api/auth/register -> 400 password too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: '123' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // 4. Login email not verified -> 401
  it('POST /api/auth/login -> 401 email not verified', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Test123456', 10);
    const unverifiedUser = { ...testUser, email_verified: false, password_hash: hash };
    mockQuery.mockResolvedValueOnce(rows([unverifiedUser]));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test123456' });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('验证邮箱');
  });

  // 5. Login success -> 200 with tokens
  it('POST /api/auth/login -> 200 success', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Test123456', 10);
    const verifiedUser = { ...testUser, email_verified: true, password_hash: hash };
    mockQuery
      .mockResolvedValueOnce(rows([verifiedUser])) // find user
      .mockResolvedValueOnce(rows([])); // insert refresh token

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test123456' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body).toHaveProperty('user');
  });

  // 6. Login wrong password -> 401
  it('POST /api/auth/login -> 401 wrong password', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Test123456', 10);
    mockQuery.mockResolvedValueOnce(rows([{ ...testUser, password_hash: hash }]));

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1' });

    expect(res.status).toBe(401);
  });

  // 7. Refresh token success -> 200
  it('POST /api/auth/refresh -> 200 success', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockQuery
      .mockResolvedValueOnce(rows([{
        token: 'old-refresh',
        user_id: 'u-1',
        expires_at: futureDate,
        id: 'u-1',
        email: 'test@example.com',
        nickname: 'Tester',
        avatar_url: null,
        created_at: NOW,
      }])) // find refresh token
      .mockResolvedValueOnce(rows([])) // delete old token
      .mockResolvedValueOnce(rows([])); // insert new token

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'old-refresh' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
  });

  // 8. Refresh token invalid -> 401
  it('POST /api/auth/refresh -> 401 invalid token', async () => {
    mockQuery.mockResolvedValueOnce(rows([]));

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'bad-token' });

    expect(res.status).toBe(401);
  });

  // 9. Get current user success -> 200
  it('GET /api/auth/me -> 200 success', async () => {
    mockQuery.mockResolvedValueOnce(rows([testUser])); // authRequired lookup

    const token = makeToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'u-1');
    expect(res.body).toHaveProperty('email', 'test@example.com');
  });

  // 10. Get current user no token -> 401
  it('GET /api/auth/me -> 401 no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Group (10 tests)
// ═══════════════════════════════════════════════════════════════════════════
describe('Group', () => {
  function authedRequest() {
    const token = makeToken();
    return { token };
  }

  function mockAuth() {
    // authRequired middleware does: query users WHERE id = $1
    mockQuery.mockResolvedValueOnce(rows([testUser]));
  }

  // 1. Create group success -> 200
  it('POST /api/groups -> 200 success', async () => {
    mockAuth();
    // createGroup uses getClient + transaction
    const fakeClient = {
      query: mockClientQuery,
      release: mockClientRelease,
    };
    mockGetClient.mockResolvedValueOnce(fakeClient);

    // BEGIN
    mockClientQuery.mockResolvedValueOnce(undefined);
    // INSERT group
    mockClientQuery.mockResolvedValueOnce(rows([testGroup]));
    // INSERT creator member
    mockClientQuery.mockResolvedValueOnce(rows([]));
    // INSERT AI member
    mockClientQuery.mockResolvedValueOnce(rows([]));
    // COMMIT
    mockClientQuery.mockResolvedValueOnce(undefined);

    const { token } = authedRequest();
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '测试群' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name', '测试群');
    expect(res.body).toHaveProperty('inviteCode');
  });

  // 2. Create group name empty -> 400
  it('POST /api/groups -> 400 name empty', async () => {
    mockAuth();

    const { token } = authedRequest();
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '' });

    expect(res.status).toBe(400);
  });

  // 3. Create group unauthenticated -> 401
  it('POST /api/groups -> 401 no auth', async () => {
    const res = await request(app)
      .post('/api/groups')
      .send({ name: '测试' });

    expect(res.status).toBe(401);
  });

  // 4. Join group success -> 200
  it('POST /api/groups/join -> 200 success', async () => {
    mockAuth();
    // find group by invite code
    mockQuery.mockResolvedValueOnce(rows([testGroup]));
    // check membership (not a member)
    mockQuery.mockResolvedValueOnce(rows([]));
    // insert member
    mockQuery.mockResolvedValueOnce(rows([]));
    // count members
    mockQuery.mockResolvedValueOnce(rows([{ count: '3' }]));
    // last message
    mockQuery.mockResolvedValueOnce(rows([]));

    const { token } = authedRequest();
    const res = await request(app)
      .post('/api/groups/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'ABC123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
  });

  // 5. Join group invalid invite code -> 404
  it('POST /api/groups/join -> 404 invalid code', async () => {
    mockAuth();
    mockQuery.mockResolvedValueOnce(rows([])); // no group found

    const { token } = authedRequest();
    const res = await request(app)
      .post('/api/groups/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'XXXXXX' });

    expect(res.status).toBe(404);
  });

  // 6. Join group already member -> 409
  it('POST /api/groups/join -> 409 already member', async () => {
    mockAuth();
    mockQuery.mockResolvedValueOnce(rows([testGroup])); // find group
    mockQuery.mockResolvedValueOnce(rows([{ id: 'gm-1' }])); // already member

    const { token } = authedRequest();
    const res = await request(app)
      .post('/api/groups/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'ABC123' });

    expect(res.status).toBe(409);
  });

  // 7. List groups success -> 200
  it('GET /api/groups -> 200 success', async () => {
    mockAuth();
    mockQuery.mockResolvedValueOnce(rows([{
      ...testGroup,
      member_count: '2',
      last_message_content: null,
      last_message_sender_nickname: null,
      last_message_sender_email: null,
      last_message_type: null,
      last_message_at: null,
    }]));

    const { token } = authedRequest();
    const res = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  // 8. Get group detail success -> 200
  it('GET /api/groups/:groupId -> 200 success', async () => {
    mockAuth();
    // findGroupOrThrow
    mockQuery.mockResolvedValueOnce(rows([testGroup]));
    // checkMembershipOrThrow
    mockQuery.mockResolvedValueOnce(rows([{ id: 'gm-1' }]));
    // get members
    mockQuery.mockResolvedValueOnce(rows([
      { id: 'gm-1', user_id: 'u-1', is_ai: false, joined_at: NOW, nickname: 'Tester', avatar_url: null, email: 'test@example.com' },
      { id: 'gm-2', user_id: null, is_ai: true, joined_at: NOW, nickname: null, avatar_url: null, email: null },
    ]));

    const { token } = authedRequest();
    const res = await request(app)
      .get('/api/groups/g-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'g-1');
    expect(res.body).toHaveProperty('members');
    expect(res.body.members).toHaveLength(2);
  });

  // 9. Get invite code success -> 200
  it('GET /api/groups/:groupId/invite -> 200 success', async () => {
    mockAuth();
    // findGroupOrThrow
    mockQuery.mockResolvedValueOnce(rows([testGroup]));
    // checkMembershipOrThrow
    mockQuery.mockResolvedValueOnce(rows([{ id: 'gm-1' }]));

    const { token } = authedRequest();
    const res = await request(app)
      .get('/api/groups/g-1/invite')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('inviteCode', 'ABC123');
  });

  // 10. Leave group success -> 200
  it('DELETE /api/groups/:groupId/leave -> 200 success', async () => {
    mockAuth();
    // check membership
    mockQuery.mockResolvedValueOnce(rows([{ id: 'gm-1' }]));
    // delete member
    mockQuery.mockResolvedValueOnce(rows([]));

    const { token } = authedRequest();
    const res = await request(app)
      .delete('/api/groups/g-1/leave')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Message (8 tests)
// ═══════════════════════════════════════════════════════════════════════════
describe('Message', () => {
  function mockAuth() {
    mockQuery.mockResolvedValueOnce(rows([testUser]));
  }

  function authedRequest() {
    const token = makeToken();
    return { token };
  }

  // 1. Send message success -> 200
  it('POST /api/messages/group/:groupId -> 200 success', async () => {
    mockAuth();
    // check membership
    mockQuery.mockResolvedValueOnce(rows([{ id: 'gm-1' }]));
    // insert message
    mockQuery.mockResolvedValueOnce(rows([testMessage]));

    const { token } = authedRequest();
    const res = await request(app)
      .post('/api/messages/group/g-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hello World' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('content', 'Hello World');
    expect(res.body).toHaveProperty('messageType', 'USER');
  });

  // 2. Send message with reply -> 200
  it('POST /api/messages/group/:groupId -> 200 with reply', async () => {
    mockAuth();
    // check membership
    mockQuery.mockResolvedValueOnce(rows([{ id: 'gm-1' }]));
    // insert message with reply
    mockQuery.mockResolvedValueOnce(rows([{
      ...testMessage,
      id: 'm-2',
      reply_to_id: 'm-1',
      reply_content: 'Original message',
      reply_message_type: 'USER',
    }]));

    const { token } = authedRequest();
    const res = await request(app)
      .post('/api/messages/group/g-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Reply', replyToId: 'm-1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('replyToId', 'm-1');
    expect(res.body).toHaveProperty('replyToContent', 'Original message');
  });

  // 3. Send message empty content -> 400
  it('POST /api/messages/group/:groupId -> 400 empty content', async () => {
    mockAuth();

    const { token } = authedRequest();
    const res = await request(app)
      .post('/api/messages/group/g-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: '' });

    expect(res.status).toBe(400);
  });

  // 4. Send message unauthenticated -> 401
  it('POST /api/messages/group/:groupId -> 401 no auth', async () => {
    const res = await request(app)
      .post('/api/messages/group/g-1')
      .send({ content: 'Hello' });

    expect(res.status).toBe(401);
  });

  // 5. Get messages paged -> 200
  it('GET /api/messages/group/:groupId?page=0&size=10 -> 200', async () => {
    mockAuth();
    // count
    mockQuery.mockResolvedValueOnce(rows([{ count: '1' }]));
    // messages
    mockQuery.mockResolvedValueOnce(rows([testMessage]));

    const { token } = authedRequest();
    const res = await request(app)
      .get('/api/messages/group/g-1?page=0&size=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('content');
    expect(res.body).toHaveProperty('totalElements', 1);
    expect(res.body).toHaveProperty('totalPages');
    expect(res.body).toHaveProperty('first', true);
  });

  // 6. Get recent messages -> 200
  it('GET /api/messages/group/:groupId/recent -> 200', async () => {
    mockAuth();
    mockQuery.mockResolvedValueOnce(rows([testMessage]));

    const { token } = authedRequest();
    const res = await request(app)
      .get('/api/messages/group/g-1/recent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  // 7. Get single message success -> 200
  it('GET /api/messages/:messageId -> 200', async () => {
    mockAuth();
    mockQuery.mockResolvedValueOnce(rows([testMessage]));

    const { token } = authedRequest();
    const res = await request(app)
      .get('/api/messages/m-1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'm-1');
  });

  // 8. Get single message not found -> 404
  it('GET /api/messages/:messageId -> 404 not found', async () => {
    mockAuth();
    mockQuery.mockResolvedValueOnce(rows([]));

    const { token } = authedRequest();
    const res = await request(app)
      .get('/api/messages/non-existent')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI (2 tests)
// ═══════════════════════════════════════════════════════════════════════════
describe('AI', () => {
  function mockAuth() {
    mockQuery.mockResolvedValueOnce(rows([testUser]));
  }

  // 1. Send @AI message -> 200
  it('POST /api/messages/group/:groupId with @AI -> 200', async () => {
    mockAuth();
    // check membership
    mockQuery.mockResolvedValueOnce(rows([{ id: 'gm-1' }]));
    // insert message
    mockQuery.mockResolvedValueOnce(rows([{
      ...testMessage,
      content: '你好 @AI 帮我翻译',
      reply_message_type: null,
    }]));

    const token = makeToken();
    const res = await request(app)
      .post('/api/messages/group/g-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: '你好 @AI 帮我翻译' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('content');
  });

  // 2. Reply to AI message -> 200
  it('POST /api/messages/group/:groupId reply to AI -> 200', async () => {
    mockAuth();
    // check membership
    mockQuery.mockResolvedValueOnce(rows([{ id: 'gm-1' }]));
    // insert message (replying to AI)
    mockQuery.mockResolvedValueOnce(rows([{
      ...testMessage,
      id: 'm-3',
      content: '继续',
      reply_to_id: 'm-ai-1',
      reply_content: 'AI 之前的回复',
      reply_message_type: 'AI',
    }]));

    const token = makeToken();
    const res = await request(app)
      .post('/api/messages/group/g-1')
      .set('Authorization', `Bearer ${token}`)
      .send({ content: '继续', replyToId: 'm-ai-1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('replyToId', 'm-ai-1');
  });
});
