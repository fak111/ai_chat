import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('../../../src/db/client.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../../src/middleware/auth.middleware.js', () => ({
  signAccessToken: vi.fn().mockReturnValue('mock-access-token'),
}));

vi.mock('../../../src/services/email.service.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('$2b$10$hashedpassword'),
    compare: vi.fn(),
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-uuid-token'),
}));

import { query } from '../../../src/db/client.js';
import { signAccessToken } from '../../../src/middleware/auth.middleware.js';
import { sendVerificationEmail } from '../../../src/services/email.service.js';
import bcrypt from 'bcrypt';
import {
  register,
  verifyEmail,
  login,
  refreshToken,
  logout,
  getMe,
  validatePassword,
} from '../../../src/services/auth.service.js';

const mockQuery = vi.mocked(query);
const mockSign = vi.mocked(signAccessToken);
const mockCompare = vi.mocked(bcrypt.compare);
const mockSendEmail = vi.mocked(sendVerificationEmail);

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ Password Validation ============
  describe('validatePassword', () => {
    it('should reject passwords shorter than 8 characters', () => {
      expect(() => validatePassword('Ab1')).toThrow('密码至少需要8位');
    });

    it('should reject passwords without letters', () => {
      expect(() => validatePassword('12345678')).toThrow('密码必须包含字母和数字');
    });

    it('should reject passwords without numbers', () => {
      expect(() => validatePassword('abcdefgh')).toThrow('密码必须包含字母和数字');
    });

    it('should accept valid passwords', () => {
      expect(() => validatePassword('Test1234')).not.toThrow();
      expect(() => validatePassword('abcdef12')).not.toThrow();
    });
  });

  // ============ Register ============
  describe('register', () => {
    it('should register a new user successfully', async () => {
      // No existing user
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      // INSERT user
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'test@example.com',
          nickname: 'Tester',
          email_verified: false,
          verification_token: 'mock-uuid-token',
        }],
        rowCount: 1,
      } as any);

      const result = await register('test@example.com', 'Test1234', 'Tester');

      expect(result).toEqual({
        message: '验证邮件已发送至 test@example.com',
        email: 'test@example.com',
      });
      expect(mockSendEmail).toHaveBeenCalledWith('test@example.com', 'mock-uuid-token');
    });

    it('should use email prefix as nickname when nickname not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          email: 'john@example.com',
          nickname: 'john',
          email_verified: false,
        }],
        rowCount: 1,
      } as any);

      await register('john@example.com', 'Test1234');

      // Check the INSERT query used email prefix as nickname
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[1]).toContain('john');
    });

    it('should throw ConflictError if email already registered', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'existing-user' }],
        rowCount: 1,
      } as any);

      await expect(register('taken@example.com', 'Test1234'))
        .rejects.toThrow('该邮箱已注册');
    });

    it('should throw BadRequestError for invalid password', async () => {
      await expect(register('test@example.com', 'short'))
        .rejects.toThrow('密码至少需要8位');
    });
  });

  // ============ Verify Email ============
  describe('verifyEmail', () => {
    it('should verify email successfully with valid token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          verification_token: 'valid-token',
          verification_token_expires_at: new Date(Date.now() + 3600000),
          email_verified: false,
        }],
        rowCount: 1,
      } as any);
      // UPDATE query
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const result = await verifyEmail('valid-token');
      expect(result).toEqual({ message: '邮箱验证成功' });
    });

    it('should throw NotFoundError for invalid token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(verifyEmail('invalid-token'))
        .rejects.toThrow('验证链接无效');
    });

    it('should throw UnauthorizedError for expired token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          verification_token: 'expired-token',
          verification_token_expires_at: new Date(Date.now() - 3600000),
          email_verified: false,
        }],
        rowCount: 1,
      } as any);

      await expect(verifyEmail('expired-token'))
        .rejects.toThrow('验证链接已过期');
    });
  });

  // ============ Login ============
  describe('login', () => {
    const mockUser = {
      id: 'user-1',
      email: 'test@example.com',
      password_hash: '$2b$10$hashedpassword',
      nickname: 'Tester',
      avatar_url: null,
      email_verified: true,
      created_at: new Date('2025-01-01'),
      updated_at: new Date('2025-01-01'),
    };

    it('should login successfully with correct credentials', async () => {
      // Find user
      mockQuery.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 } as any);
      // bcrypt compare
      mockCompare.mockResolvedValueOnce(true as never);
      // INSERT refresh token
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const result = await login('test@example.com', 'Test1234');

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.id).toBe('user-1');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.nickname).toBe('Tester');
    });

    it('should throw UnauthorizedError for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(login('nobody@example.com', 'Test1234'))
        .rejects.toThrow('邮箱或密码错误');
    });

    it('should throw UnauthorizedError for wrong password', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockUser], rowCount: 1 } as any);
      mockCompare.mockResolvedValueOnce(false as never);

      await expect(login('test@example.com', 'WrongPass1'))
        .rejects.toThrow('邮箱或密码错误');
    });

    it('should throw UnauthorizedError for unverified email', async () => {
      const unverifiedUser = { ...mockUser, email_verified: false };
      mockQuery.mockResolvedValueOnce({ rows: [unverifiedUser], rowCount: 1 } as any);
      mockCompare.mockResolvedValueOnce(true as never);

      await expect(login('test@example.com', 'Test1234'))
        .rejects.toThrow('请先验证邮箱');
    });
  });

  // ============ Refresh Token ============
  describe('refreshToken', () => {
    it('should refresh tokens successfully', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        nickname: 'Tester',
      };

      // Find refresh token with user
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'rt-1',
          user_id: 'user-1',
          token: 'old-refresh-token',
          expires_at: futureDate,
          ...mockUser,
        }],
        rowCount: 1,
      } as any);
      // Delete old refresh token
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
      // Insert new refresh token
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const result = await refreshToken('old-refresh-token');

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe('old-refresh-token');
    });

    it('should throw UnauthorizedError for invalid refresh token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await expect(refreshToken('invalid-token'))
        .rejects.toThrow('无效的刷新令牌');
    });

    it('should throw UnauthorizedError for expired refresh token', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'rt-1',
          user_id: 'user-1',
          token: 'expired-token',
          expires_at: new Date(Date.now() - 86400000),
        }],
        rowCount: 1,
      } as any);
      // Delete expired token
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      await expect(refreshToken('expired-token'))
        .rejects.toThrow('刷新令牌已过期');
    });
  });

  // ============ Logout ============
  describe('logout', () => {
    it('should delete refresh token on logout', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const result = await logout('some-refresh-token');
      expect(result).toEqual({ message: '登出成功' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        ['some-refresh-token'],
      );
    });

    it('should succeed even without refresh token', async () => {
      const result = await logout();
      expect(result).toEqual({ message: '登出成功' });
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  // ============ Get Me ============
  describe('getMe', () => {
    it('should return user DTO', () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        nickname: 'Tester',
        avatar_url: 'https://example.com/avatar.jpg',
        created_at: new Date('2025-01-01T00:00:00.000Z'),
      } as any;

      const result = getMe(user);

      expect(result).toEqual({
        id: 'user-1',
        email: 'test@example.com',
        nickname: 'Tester',
        avatarUrl: 'https://example.com/avatar.jpg',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
    });

    it('should use email prefix when nickname is null', () => {
      const user = {
        id: 'user-1',
        email: 'john@example.com',
        nickname: null,
        avatar_url: null,
        created_at: new Date('2025-01-01T00:00:00.000Z'),
      } as any;

      const result = getMe(user);
      expect(result.nickname).toBe('john');
    });
  });
});
