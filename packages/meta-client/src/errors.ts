/** Mã lỗi rate limit của Meta (L3 6.2): 4 app, 17 user, 32 page, 613 custom; 80000–80014 business use case. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

export class MetaApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    readonly subcode: number | null,
    readonly type: string | null,
    message: string,
    readonly fbtraceId: string | null,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }

  get isRateLimit(): boolean {
    return (
      (this.code !== null && (RATE_LIMIT_CODES.has(this.code) || (this.code >= 80000 && this.code <= 80014))) ||
      this.status === 429
    );
  }

  /** Token hết hạn hoặc bị thu hồi (190) → kết nối cần đăng nhập lại. */
  get isTokenInvalid(): boolean {
    return this.code === 190 || this.code === 102;
  }

  /** Mất quyền với tài khoản/đối tượng (10, 200–299). */
  get isPermission(): boolean {
    return this.code === 10 || (this.code !== null && this.code >= 200 && this.code <= 299);
  }

  get isTransient(): boolean {
    return this.isRateLimit || this.status >= 500 || this.code === 1 || this.code === 2;
  }
}

/** Che token khỏi chuỗi trước khi đưa vào thông điệp lỗi (CLAUDE.md quy tắc 2). */
export function scrubSecrets(s: string): string {
  return s
    .replace(/([?&](?:access_token|appsecret_proof|client_secret|fb_exchange_token|code)=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/\bEAA[A-Za-z0-9]{20,}/g, '[REDACTED]');
}
