/**
 * Base application error with numeric error code.
 * Error code system (5-digit):
 *   10xxx - General
 *   20xxx - Auth / Validation
 *   30xxx - User
 *   40xxx - Group
 *   50xxx - Message
 *   60xxx - AI
 *   70xxx - File
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errorCode?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Default error code mapping from HTTP status → fallback errorCode */
const defaultErrorCodes: Record<number, number> = {
  400: 10400,
  401: 10401,
  403: 10403,
  404: 10404,
  409: 10409,
  422: 20001,
  500: 10001,
};

export function resolveErrorCode(err: AppError): number {
  return err.errorCode ?? defaultErrorCodes[err.statusCode] ?? 10001;
}

export class BadRequestError extends AppError {
  constructor(message: string, errorCode?: number) {
    super(400, message, errorCode);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = '未授权', errorCode?: number) {
    super(401, message, errorCode);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = '无权限', errorCode?: number) {
    super(403, message, errorCode);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = '资源不存在', errorCode?: number) {
    super(404, message, errorCode);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, errorCode?: number) {
    super(409, message, errorCode);
  }
}
