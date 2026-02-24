import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/client.js';
import { signAccessToken } from '../middleware/auth.middleware.js';
import { sendVerificationEmail } from './email.service.js';
import {
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
} from '../utils/errors.js';
import type { User, UserDto, LoginResponse, RefreshResponse } from '../types/index.js';

const BCRYPT_ROUNDS = 10;
const VERIFICATION_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h
const REFRESH_TOKEN_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000; // 365 days
const MAX_AVATAR_CHANGES = 3;

export function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new BadRequestError('密码至少需要8位');
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new BadRequestError('密码必须包含字母和数字');
  }
}

function toUserDto(user: Pick<User, 'id' | 'email' | 'nickname' | 'avatar_url' | 'avatar_change_count' | 'created_at'>): UserDto {
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname || user.email.split('@')[0],
    avatarUrl: user.avatar_url,
    avatarChangesLeft: MAX_AVATAR_CHANGES - (user.avatar_change_count || 0),
    createdAt: user.created_at.toISOString(),
  };
}

export async function register(
  email: string,
  password: string,
  nickname?: string,
): Promise<{ message: string; email: string }> {
  validatePassword(password);

  // Check if email already exists
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw new ConflictError('该邮箱已注册');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const verificationToken = uuidv4();
  const displayNickname = nickname || email.split('@')[0];
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY_MS);

  await query(
    `INSERT INTO users (email, password_hash, nickname, verification_token, verification_token_expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [email, passwordHash, displayNickname, verificationToken, expiresAt],
  );

  await sendVerificationEmail(email, verificationToken);

  return {
    message: `验证邮件已发送至 ${email}`,
    email,
  };
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  const result = await query(
    'SELECT * FROM users WHERE verification_token = $1',
    [token],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('验证链接无效');
  }

  const user = result.rows[0];
  if (user.verification_token_expires_at && new Date(user.verification_token_expires_at) < new Date()) {
    throw new UnauthorizedError('验证链接已过期');
  }

  await query(
    `UPDATE users SET email_verified = true, verification_token = NULL, verification_token_expires_at = NULL, updated_at = NOW()
     WHERE id = $1`,
    [user.id],
  );

  return { message: '邮箱验证成功' };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await query<User>('SELECT * FROM users WHERE email = $1', [email]);
  if (result.rows.length === 0) {
    throw new UnauthorizedError('邮箱或密码错误');
  }

  const user = result.rows[0];
  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    throw new UnauthorizedError('邮箱或密码错误');
  }

  if (!user.email_verified) {
    throw new UnauthorizedError('请先验证邮箱');
  }

  const accessToken = signAccessToken(user);
  const refreshTokenStr = uuidv4();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, refreshTokenStr, expiresAt],
  );

  return {
    accessToken,
    refreshToken: refreshTokenStr,
    user: toUserDto(user),
  };
}

export async function refreshToken(token: string): Promise<RefreshResponse> {
  const result = await query(
    `SELECT rt.*, u.id as user_id, u.email, u.nickname, u.avatar_url, u.created_at
     FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.id
     WHERE rt.token = $1`,
    [token],
  );

  if (result.rows.length === 0) {
    throw new UnauthorizedError('无效的刷新令牌');
  }

  const row = result.rows[0];

  // Delete old token regardless of expiry
  await query('DELETE FROM refresh_tokens WHERE token = $1', [token]);

  if (new Date(row.expires_at) < new Date()) {
    throw new UnauthorizedError('刷新令牌已过期');
  }

  const accessToken = signAccessToken(row as any);
  const newRefreshToken = uuidv4();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [row.user_id, newRefreshToken, expiresAt],
  );

  return {
    accessToken,
    refreshToken: newRefreshToken,
  };
}

export async function logout(token?: string): Promise<{ message: string }> {
  if (token) {
    await query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
  }
  return { message: '登出成功' };
}

export function getMe(user: User): UserDto {
  return toUserDto(user);
}

export async function updateAvatar(
  userId: string,
  avatarUrl: string,
): Promise<UserDto> {
  // Check avatar change limit
  const countResult = await query<{ avatar_change_count: number }>(
    'SELECT avatar_change_count FROM users WHERE id = $1',
    [userId],
  );
  if (countResult.rows.length > 0 && countResult.rows[0].avatar_change_count >= MAX_AVATAR_CHANGES) {
    throw new BadRequestError(`头像最多只能修改${MAX_AVATAR_CHANGES}次`);
  }

  await query(
    'UPDATE users SET avatar_url = $1, avatar_change_count = avatar_change_count + 1, updated_at = NOW() WHERE id = $2',
    [avatarUrl, userId],
  );

  const result = await query<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) {
    throw new NotFoundError('用户不存在');
  }
  return toUserDto(result.rows[0]);
}

export async function updateProfile(
  userId: string,
  data: { nickname?: string },
): Promise<UserDto> {
  if (data.nickname !== undefined) {
    const trimmed = data.nickname.trim();
    if (!trimmed || trimmed.length > 50) {
      throw new BadRequestError('昵称不能为空且不超过50个字符');
    }
    await query(
      'UPDATE users SET nickname = $1, updated_at = NOW() WHERE id = $2',
      [trimmed, userId],
    );
  }

  const result = await query<User>('SELECT * FROM users WHERE id = $1', [userId]);
  if (result.rows.length === 0) {
    throw new NotFoundError('用户不存在');
  }
  return toUserDto(result.rows[0]);
}
