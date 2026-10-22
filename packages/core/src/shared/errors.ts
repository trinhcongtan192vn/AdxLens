/**
 * Lỗi nghiệp vụ có `code` (CLAUDE.md: không ném chuỗi). `details` chỉ chứa dữ liệu an toàn để trả
 * cho client: không bao giờ đưa token, secret hay body request vào đây.
 */
export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  FEATURE_DISABLED: 404,
  PLAN_REQUIRED: 402,
  REPORT_BLOCKED: 422,
  GUARDRAIL_VIOLATION: 422,
  KILL_SWITCH_ACTIVE: 403,
  EXTERNAL_SERVICE: 502,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} không tồn tại`);
export const forbidden = (why = 'Không có quyền thực hiện thao tác này') =>
  new AppError('FORBIDDEN', why);
