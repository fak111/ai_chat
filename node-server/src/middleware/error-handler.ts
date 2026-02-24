import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError, resolveErrorCode } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      code: resolveErrorCode(err),
      message: err.message,
    });
    return;
  }

  if (err instanceof ZodError) {
    const errors: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.');
      errors[key] = issue.message;
    }
    res.status(422).json({
      code: 20001,
      message: '参数验证失败',
      errors,
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    code: 10001,
    message: '服务器内部错误',
  });
}
