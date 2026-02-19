import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/client.js';
import { UnauthorizedError } from '../utils/errors.js';
import type { User } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-256-bit-secret-key-for-development-only';

export interface JwtPayload {
  sub: string;
  email: string;
  type: string;
  iat: number;
  exp: number;
}

export function signAccessToken(user: User): string {
  return jwt.sign(
    { sub: user.id, email: user.email, type: 'access' },
    JWT_SECRET,
    { expiresIn: '2h' },
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function authRequired(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('未提供认证令牌');
    }

    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);

    if (payload.type !== 'access') {
      throw new UnauthorizedError('无效的令牌类型');
    }

    const result = await query<User>('SELECT * FROM users WHERE id = $1', [payload.sub]);
    if (result.rows.length === 0) {
      throw new UnauthorizedError('用户不存在');
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
    } else {
      next(new UnauthorizedError('无效或过期的令牌'));
    }
  }
}
