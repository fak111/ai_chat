import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    const details: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.');
      details[key] = issue.message;
    }
    res.status(400).json({ error: '参数验证失败', details });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: '服务器内部错误' });
}
