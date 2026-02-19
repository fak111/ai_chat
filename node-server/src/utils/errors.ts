export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = '未授权') {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = '无权限') {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = '资源不存在') {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}
