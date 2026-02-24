import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authRequired } from '../middleware/auth.middleware.js';
import {
  register,
  verifyEmail,
  login,
  refreshToken,
  logout,
  getMe,
  updateProfile,
  updateAvatar,
} from '../services/auth.service.js';

export const authRoutes = Router();

const registerSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string(),
  nickname: z.string().max(50).optional(),
});

const verifySchema = z.object({
  token: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// POST /api/auth/register
authRoutes.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password, nickname } = registerSchema.parse(req.body);
    const result = await register(email, password, nickname);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify
authRoutes.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = verifySchema.parse(req.body);
    const result = await verifyEmail(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/verify?token=xxx (HTML page)
authRoutes.get('/verify', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  try {
    await verifyEmail(token);
    res.send(verifyHtmlPage(true, '验证成功！您的邮箱已验证，可以登录A宝了。'));
  } catch (err: any) {
    res.send(verifyHtmlPage(false, `验证失败：${err.message || '未知错误'}`));
  }
});

// POST /api/auth/login
authRoutes.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
authRoutes.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken: token } = refreshSchema.parse(req.body);
    const result = await refreshToken(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
authRoutes.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await logout(req.body.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
authRoutes.get('/me', authRequired, (req: Request, res: Response) => {
  res.json(getMe(req.user!));
});

// PUT /api/auth/profile
const profileSchema = z.object({
  nickname: z.string().min(1).max(50).optional(),
});

authRoutes.put('/profile', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = profileSchema.parse(req.body);
    const result = await updateProfile(req.user!.id, data);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/avatar
const avatarDir = path.resolve('storage/uploads/avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: avatarDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('只支持 jpg/png/gif/webp 格式'));
    }
  },
});

authRoutes.post('/avatar', authRequired, avatarUpload.single('avatar'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ code: 70002, message: '请选择图片' });
      return;
    }
    const result = await updateAvatar(req.user!.id, req.file.filename);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

function verifyHtmlPage(success: boolean, message: string): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>邮箱验证 - A宝</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h2 { margin: 0 0 12px; color: #333; }
    p { color: #666; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? '✅' : '❌'}</div>
    <h2>${success ? '验证成功' : '验证失败'}</h2>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
